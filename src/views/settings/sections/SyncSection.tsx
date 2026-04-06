import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpToLine,
  CheckCircle2,
  Cloud,
  CloudOff,
  Loader2,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { RemoteExplorer } from '@/context/modules/sync-v2';
import { cn } from '@/lib/utils';

import { useAppSettings } from '../../../AppContext';
import { ConflictResolutionDialog } from '../../../components/ConflictResolutionDialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { useFirebaseSyncContext } from '../../../context/FirebaseSyncContext';
import { signOutFirebase } from '../../../context/modules/firebase-auth';
import { Card, FieldGroup, SectionHeader, ToggleRow } from '../SettingsUI';

type LiveRetryItem = { nextAttemptAt?: number };
type LiveImmediateLog = { message?: string };

function getLiveRetryQueueSummary() {
  try {
    const raw = localStorage.getItem('firebase_live_retry_queue_v1') || '[]';
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed))
      return { actionable: 0, total: 0, display: '—' };
    const q = parsed as Array<LiveRetryItem>;
    const now = Date.now();
    const actionable = q.filter(
      (item) => (item.nextAttemptAt ?? 0) <= now
    ).length;
    if (actionable > 0)
      return { actionable, total: q.length, display: actionable };
    if (q.length > 0)
      return {
        actionable: 0,
        total: q.length,
        display: `${q.length} (delayed)`,
      };
    return { actionable: 0, total: 0, display: '—' };
  } catch {
    return { actionable: 0, total: 0, display: '—' };
  }
}

function getLiveImmediateLastLogMessage() {
  try {
    const raw = localStorage.getItem('firebase_live_immediate_logs_v1') || '[]';
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return '—';
    const logs = parsed as Array<LiveImmediateLog>;
    return logs.length > 0 && logs[0]?.message ? logs[0].message : '—';
  } catch {
    return '—';
  }
}

function ImmediateSyncCard({
  isSignedIn,
  syncEnabled,
}: {
  isSignedIn: boolean;
  syncEnabled: boolean;
}) {
  const [isFlushing, setIsFlushing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  if (!isSignedIn || !syncEnabled) return null;

  const queueSummary = getLiveRetryQueueSummary();
  const lastLiveMessage = getLiveImmediateLastLogMessage();

  return (
    <Card className="p-5" key={refreshKey}>
      <h3 className="text-sm font-medium mb-2">Immediate Sync (Live)</h3>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">
            Queued immediate ops
          </div>
          <div className="font-medium">{queueSummary.display}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Last live op: {lastLiveMessage}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              void (async () => {
                const before = getLiveRetryQueueSummary();
                if (before.total === 0) {
                  toast.info('No queued live ops to flush');
                  return;
                }

                const proc = (
                  window as unknown as {
                    __processLiveRetryQueue?: () => Promise<void>;
                  }
                ).__processLiveRetryQueue;

                if (!proc) {
                  toast.error('Live retry processor is not available');
                  return;
                }

                setIsFlushing(true);
                try {
                  await proc();
                  const after = getLiveRetryQueueSummary();
                  setRefreshKey((k) => k + 1);

                  if (after.total < before.total) {
                    toast.success(
                      `Flushed ${before.total - after.total} queued live op${before.total - after.total === 1 ? '' : 's'}`
                    );
                  } else if (after.actionable === 0 && after.total > 0) {
                    toast.info(
                      'No due ops to flush yet (remaining ops are delayed)'
                    );
                  } else {
                    toast.info('Flush complete with no immediate queue change');
                  }
                } catch (error) {
                  const message =
                    error instanceof Error ? error.message : String(error);
                  toast.error(`Flush failed: ${message}`);
                } finally {
                  setIsFlushing(false);
                  setRefreshKey((k) => k + 1);
                }
              })();
            }}
            disabled={isFlushing}
          >
            {isFlushing ? 'Flushing...' : 'Flush queued ops'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

type SyncEvent = {
  id: string;
  type: string;
  description: string;
  timestamp: number | string;
};

type ManualSyncCollection =
  | 'questionHistory'
  | 'mcHistory'
  | 'savedSets'
  | 'presets';

const MANUAL_COLLECTION_OPTIONS: Array<{
  value: ManualSyncCollection;
  label: string;
}> = [
  { value: 'questionHistory', label: 'Question History' },
  { value: 'mcHistory', label: 'Multiple Choice History' },
  { value: 'savedSets', label: 'Saved Sets' },
  { value: 'presets', label: 'Presets' },
];

function SyncActivityCard({
  syncEvents,
  debugMode,
}: {
  syncEvents: Array<SyncEvent>;
  debugMode: boolean;
}) {
  if (!syncEvents || syncEvents.length === 0) return null;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">Sync Activity</h3>
      </div>
      <div
        className={cn('space-y-3', !debugMode && 'max-h-64 overflow-y-auto')}
      >
        {syncEvents.slice(0, debugMode ? 50 : 20).map((event: SyncEvent) => (
          <div key={event.id} className="flex items-start gap-3 text-sm">
            <div
              className={cn(
                'mt-0.5 h-2 w-2 rounded-full shrink-0',
                event.type === 'upload' && 'bg-emerald-500',
                event.type === 'download' && 'bg-sky-500',
                event.type === 'error' && 'bg-destructive',
                event.type === 'conflict' && 'bg-amber-500',
                event.type === 'archive' && 'bg-violet-500',
                event.type === 'retry' && 'bg-orange-500'
              )}
            />
            <div className="flex-1 min-w-0">
              <p className="text-foreground">{event.description}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(event.timestamp).toLocaleString()}
                {debugMode && (
                  <span className="ml-2 font-mono text-[10px]">{event.id}</span>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
      {!debugMode && syncEvents.length > 20 && (
        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
          Enable Debug Mode to see more sync activity
        </p>
      )}
    </Card>
  );
}

// Complexity of this UI component is high due to many conditional render branches.
// Disable the eslint complexity rule for this function to keep the JSX readable.
// eslint-disable-next-line complexity
export function SyncSection() {
  const { debugMode, syncApiKey, setSyncApiKey } = useAppSettings();
  const firebaseSync = useFirebaseSyncContext();

  const [syncAuthMode, setSyncAuthMode] = useState<'signin' | 'signup'>(
    'signin'
  );
  const [syncAuthEmail, setSyncAuthEmail] = useState('');
  const [syncAuthPassword, setSyncAuthPassword] = useState('');
  const [syncIsSubmitting, setSyncIsSubmitting] = useState(false);
  const [manualCollection, setManualCollection] =
    useState<ManualSyncCollection>('questionHistory');
  const [nowTs, setNowTs] = useState(Date.now());

  useEffect(() => {
    const timerId = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(timerId);
  }, []);

  const {
    user,
    isLoading: syncLoading,
    isSyncing,
    isSyncEnabled,
    isOnline,
    syncStatus,
    lastSyncTime,
    syncError,
    syncEvents,
    debugLogs,
    pendingChanges,
    pendingDeletions,
    queuedOpsCount,
    lastFlushTime,
    syncTelemetry,
    conflicts,
    enableSync,
    disableSync,
    pullSync,
    pushSync,
    pullCollectionSync,
    pushCollectionSync,
    retryQueuedOpsNow,
    forceSync,
    resolveConflicts,
  } = firebaseSync;

  const syncEnabled = isSyncEnabled;
  const isSignedIn = !!user;
  const staleSync =
    !!lastSyncTime &&
    nowTs - lastSyncTime > 10 * 60 * 1000 &&
    queuedOpsCount > 0;

  const syncHealth = !syncEnabled
    ? { label: 'Disconnected', tone: 'muted', hint: 'Sign in to sync devices.' }
    : !isOnline
      ? {
          label: 'Offline',
          tone: 'offline',
          hint: 'Changes are queued until connection returns.',
        }
      : syncTelemetry.retryBlocked
        ? {
            label: 'Blocked',
            tone: 'blocked',
            hint: `Retries paused after ${syncTelemetry.retryMaxAttempts} attempts.`,
          }
        : syncTelemetry.retryAttemptsCurrent > 0
          ? {
              label: 'Degraded',
              tone: 'degraded',
              hint:
                syncTelemetry.nextRetryAt && syncTelemetry.nextRetryAt > nowTs
                  ? `Retry in ${Math.max(1, Math.ceil((syncTelemetry.nextRetryAt - nowTs) / 1000))}s.`
                  : 'Transient sync errors detected.',
            }
          : staleSync
            ? {
                label: 'Stale',
                tone: 'stale',
                hint: 'Sync is behind. Run Pull/Push to reconcile now.',
              }
            : {
                label: 'Healthy',
                tone: 'healthy',
                hint: 'Realtime sync is operating normally.',
              };

  const handleAuth = async () => {
    if (!syncAuthEmail.trim() || !syncAuthPassword) return;
    setSyncIsSubmitting(true);
    try {
      await enableSync(
        syncAuthEmail,
        syncAuthPassword,
        syncAuthMode === 'signup'
      );
    } finally {
      setSyncIsSubmitting(false);
    }
  };

  const handlePullSync = async () => {
    console.log('[FirebaseSync] Manual pull initiated by user');
    await pullSync();
  };

  const handlePushSync = async () => {
    console.log('[FirebaseSync] Manual push initiated by user');
    await pushSync();
  };

  const handleSignOut = async () => {
    try {
      await signOutFirebase();
    } catch (error) {
      // Optionally handle error UI here
      console.error('Sign out failed:', error);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Cloud Sync"
        description="Changes sync to the cloud automatically while you are online. Use Pull/Push controls for git-style sync actions."
      />

      {!isOnline && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">You are offline.</span> Cloud sync
            requires an internet connection.
          </div>
        </div>
      )}

      {syncError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Error:</span> {syncError}
          </div>
        </div>
      )}

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'h-10 w-10 rounded-full flex items-center justify-center',
                syncEnabled
                  ? 'bg-emerald-500/10'
                  : isSignedIn
                    ? 'bg-amber-500/10'
                    : 'bg-muted'
              )}
            >
              {syncLoading ||
              syncIsSubmitting ||
              syncStatus === 'connecting' ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : syncStatus === 'syncing' ? (
                <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
              ) : syncEnabled ? (
                <Cloud className="h-5 w-5 text-emerald-500" />
              ) : isSignedIn ? (
                <CloudOff className="h-5 w-5 text-amber-500" />
              ) : syncStatus === 'error' ? (
                <AlertCircle className="h-5 w-5 text-destructive" />
              ) : (
                <CloudOff className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium">
                {syncStatus === 'connecting'
                  ? 'Connecting...'
                  : syncStatus === 'syncing'
                    ? 'Syncing...'
                    : syncEnabled
                      ? 'Cloud Sync Connected'
                      : isSignedIn
                        ? 'Sync Disabled'
                        : 'Not Connected'}
              </p>
              {user && (
                <p className="text-xs text-muted-foreground">{user.email}</p>
              )}
              {syncEnabled && pendingChanges > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  {pendingChanges < 0
                    ? 'Changes pending'
                    : `${pendingChanges} change${pendingChanges === 1 ? '' : 's'} pending`}
                </p>
              )}
              {syncEnabled && pendingDeletions > 0 && (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
                  <Trash2 className="h-3 w-3" />
                  {pendingDeletions} deletion{pendingDeletions === 1 ? '' : 's'}{' '}
                  pending sync
                </p>
              )}
              {syncEnabled && queuedOpsCount > 0 && (
                <p className="text-xs text-sky-600 dark:text-sky-400 font-medium">
                  {queuedOpsCount} queued op{queuedOpsCount === 1 ? '' : 's'}
                </p>
              )}
              {syncEnabled && lastFlushTime && (
                <p className="text-xs text-muted-foreground">
                  Last realtime flush:{' '}
                  {new Date(lastFlushTime).toLocaleString()}
                </p>
              )}
              {syncEnabled && (
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      syncHealth.tone === 'healthy' &&
                        'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                      syncHealth.tone === 'degraded' &&
                        'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                      syncHealth.tone === 'blocked' &&
                        'bg-destructive/15 text-destructive',
                      syncHealth.tone === 'stale' &&
                        'bg-orange-500/15 text-orange-700 dark:text-orange-400',
                      syncHealth.tone === 'offline' &&
                        'bg-slate-500/15 text-slate-700 dark:text-slate-300',
                      syncHealth.tone === 'muted' &&
                        'bg-muted text-muted-foreground'
                    )}
                  >
                    {syncHealth.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {syncHealth.hint}
                  </span>
                </div>
              )}
            </div>
          </div>
          {syncEnabled && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  void handlePullSync();
                }}
                disabled={isSyncing || !isOnline}
              >
                <ArrowDownToLine
                  className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')}
                />
                {isSyncing ? 'Working...' : 'Pull'}
              </Button>
              <Button
                variant={
                  pendingChanges > 0 || queuedOpsCount > 0
                    ? 'default'
                    : 'outline'
                }
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  void handlePushSync();
                }}
                disabled={isSyncing || !isOnline}
              >
                <ArrowUpToLine
                  className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')}
                />
                {isSyncing ? 'Working...' : 'Push'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => {
                  void disableSync();
                }}
              >
                Disable sync
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  void handleSignOut();
                }}
              >
                Sign out
              </Button>
              {(syncTelemetry.retryBlocked ||
                syncTelemetry.retryAttemptsCurrent > 0) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    (retryQueuedOpsNow as () => void)();
                  }}
                  disabled={!isOnline}
                >
                  Retry queued ops now
                </Button>
              )}
            </div>
          )}
          {isSignedIn && !syncEnabled && (
            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  void forceSync();
                }}
                disabled={isSyncing || !isOnline}
              >
                <Cloud className="h-3.5 w-3.5" />
                {isSyncing ? 'Enabling...' : 'Enable Sync'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  void handleSignOut();
                }}
              >
                Sign out
              </Button>
            </div>
          )}
        </div>

        {isSignedIn && syncEnabled && (
          <>
            <div className="pt-3 border-t border-border">
              <ToggleRow
                id="sync-api-key"
                checked={syncApiKey}
                onChange={setSyncApiKey}
                label="Sync API Key"
                description="Include your OpenRouter API key in cloud sync so it's available on all your devices."
              />
            </div>

            <div className="pt-3 border-t border-border">
              <FieldGroup
                label="Selective Pull/Push"
                htmlFor="manual-sync-collection"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={manualCollection}
                    onValueChange={(v) =>
                      setManualCollection(v as ManualSyncCollection)
                    }
                  >
                    <SelectTrigger id="manual-sync-collection" className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MANUAL_COLLECTION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      void (
                        pullCollectionSync as (
                          collection: ManualSyncCollection
                        ) => Promise<void>
                      )(manualCollection);
                    }}
                    disabled={isSyncing || !isOnline}
                  >
                    Pull selected
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      void (
                        pushCollectionSync as (
                          collection: ManualSyncCollection
                        ) => Promise<void>
                      )(manualCollection);
                    }}
                    disabled={isSyncing || !isOnline}
                  >
                    Push selected
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Run targeted reconciliation for one data section without a
                  full sync pass.
                </p>
              </FieldGroup>
            </div>
          </>
        )}

        {!isSignedIn && (
          <div className="space-y-4 pt-2">
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setSyncAuthMode('signin');
                  setSyncAuthEmail('');
                  setSyncAuthPassword('');
                }}
                className={cn(
                  'flex-1 py-1.5 px-3 text-sm rounded-md transition-colors',
                  syncAuthMode === 'signin'
                    ? 'bg-background shadow-sm font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setSyncAuthMode('signup');
                  setSyncAuthEmail('');
                  setSyncAuthPassword('');
                }}
                className={cn(
                  'flex-1 py-1.5 px-3 text-sm rounded-md transition-colors',
                  syncAuthMode === 'signup'
                    ? 'bg-background shadow-sm font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Sign Up
              </button>
            </div>

            <div className="space-y-3">
              <FieldGroup label="Email" htmlFor="sync-email">
                <Input
                  id="sync-email"
                  type="email"
                  value={syncAuthEmail}
                  onChange={(e) => setSyncAuthEmail(e.target.value)}
                  placeholder="your@email.com"
                  disabled={!isOnline}
                />
              </FieldGroup>
              <FieldGroup label="Password" htmlFor="sync-password">
                <Input
                  id="sync-password"
                  type="password"
                  value={syncAuthPassword}
                  onChange={(e) => setSyncAuthPassword(e.target.value)}
                  placeholder="Password"
                  disabled={!isOnline}
                  onKeyDown={(e) => {
                    if (
                      e.key === 'Enter' &&
                      syncAuthEmail &&
                      syncAuthPassword
                    ) {
                      void handleAuth();
                    }
                  }}
                />
              </FieldGroup>
              <Button
                className="w-full gap-2"
                onClick={() => {
                  void handleAuth();
                }}
                disabled={
                  !syncAuthEmail.trim() ||
                  !syncAuthPassword ||
                  !isOnline ||
                  syncIsSubmitting
                }
              >
                <Cloud className="h-4 w-4" />
                {syncAuthMode === 'signin' ? 'Sign In' : 'Create Account'}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              {syncAuthMode === 'signin'
                ? 'Sign in with your existing account to sync data.'
                : 'Create an account to start syncing your data across devices.'}
            </p>
          </div>
        )}

        {isSignedIn && lastSyncTime && (
          <div className="pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Last synced: {new Date(lastSyncTime).toLocaleString()}
            </p>
          </div>
        )}
      </Card>

      <ImmediateSyncCard isSignedIn={isSignedIn} syncEnabled={syncEnabled} />

      {isSignedIn && (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-3">What gets synced</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              Question history and analytics
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              Multiple choice history
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              Saved question sets
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              Presets
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              Study goals and streak data
            </li>
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Sync is manual-friendly: use Pull to fetch cloud changes and Push to
            upload your local changes, similar to git-style workflows.
          </p>
        </Card>
      )}

      <SyncActivityCard syncEvents={syncEvents} debugMode={debugMode} />

      {debugMode && isSignedIn && debugLogs.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Debug Logs</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400">
              Debug
            </span>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto font-mono text-[11px]">
            {debugLogs.slice(0, 50).map((log) => (
              <div key={log.id} className="flex gap-2">
                <span className="text-muted-foreground shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className="text-foreground break-all">{log.message}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {debugMode && isSignedIn && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Sync Efficiency</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-600 dark:text-sky-400">
              Telemetry
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded border border-border p-2">
              <div className="text-muted-foreground">Queued Ops</div>
              <div className="font-medium">{syncTelemetry.queuedOpsTotal}</div>
            </div>
            <div className="rounded border border-border p-2">
              <div className="text-muted-foreground">Flushes</div>
              <div className="font-medium">{syncTelemetry.flushCount}</div>
            </div>
            <div className="rounded border border-border p-2">
              <div className="text-muted-foreground">Coalesced Saved</div>
              <div className="font-medium">
                {syncTelemetry.coalescedOpsSaved}
              </div>
            </div>
            <div className="rounded border border-border p-2">
              <div className="text-muted-foreground">Hash No-op Skips</div>
              <div className="font-medium">{syncTelemetry.hashNoopSkips}</div>
            </div>
            <div className="rounded border border-border p-2">
              <div className="text-muted-foreground">Delta Checks</div>
              <div className="font-medium">{syncTelemetry.deltaChecks}</div>
            </div>
            <div className="rounded border border-border p-2">
              <div className="text-muted-foreground">Delta No-change</div>
              <div className="font-medium">
                {syncTelemetry.deltaNoChangePasses}
              </div>
            </div>
            <div className="rounded border border-border p-2">
              <div className="text-muted-foreground">Full Reads</div>
              <div className="font-medium">{syncTelemetry.fullSyncReads}</div>
            </div>
            <div className="rounded border border-border p-2">
              <div className="text-muted-foreground">Retries</div>
              <div className="font-medium">{syncTelemetry.retryCount}</div>
            </div>
            <div className="rounded border border-border p-2 col-span-2">
              <div className="text-muted-foreground">
                Estimated Writes Avoided
              </div>
              <div className="font-medium">
                {syncTelemetry.estimatedWritesAvoided}
              </div>
            </div>
            <div className="rounded border border-border p-2 col-span-2">
              <div className="text-muted-foreground">
                Estimated Reads Avoided
              </div>
              <div className="font-medium">
                {syncTelemetry.estimatedReadsAvoided}
              </div>
            </div>
          </div>
        </Card>
      )}

      {debugMode && <RemoteExplorer />}

      <ConflictResolutionDialog
        open={conflicts.length > 0}
        conflicts={conflicts}
        onResolve={resolveConflicts}
        onCancel={() => {
          // User cancelled — clear conflicts, sync stays paused
          resolveConflicts(new Map(conflicts.map((c) => [c.id, 'delete'])));
        }}
      />
    </div>
  );
}
