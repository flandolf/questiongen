import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Loader2,
  RefreshCw,
  Timer,
  Trash2,
} from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { cn } from '@/lib/utils';
import { useAppSettings } from '../../../AppContext';
import { useFirebaseSyncContext } from '../../../context/FirebaseSyncContext';
import { signOutFirebase } from '../../../context/modules/firebase-auth';
import { SectionHeader, FieldGroup, Card } from '../SettingsUI';
import { ConflictResolutionDialog } from '../../../components/ConflictResolutionDialog';

export function SyncSection() {
  const { debugMode, autoSyncIntervalMinutes, setAutoSyncIntervalMinutes } =
    useAppSettings();
  const firebaseSync = useFirebaseSyncContext();

  const [syncAuthMode, setSyncAuthMode] = useState<'signin' | 'signup'>(
    'signin'
  );
  const [syncAuthEmail, setSyncAuthEmail] = useState('');
  const [syncAuthPassword, setSyncAuthPassword] = useState('');
  const [syncIsSubmitting, setSyncIsSubmitting] = useState(false);

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
    forceSync,
    resolveConflicts,
  } = firebaseSync;

  const syncEnabled = isSyncEnabled;
  const isSignedIn = !!user;

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

  const handleForceSync = async () => {
    console.log('[FirebaseSync] Manual sync initiated by user');
    await forceSync();
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
        description="Changes sync to the cloud automatically while you are online. Use 'Sync Now' to force reconciliation across devices."
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
            </div>
          </div>
          {syncEnabled && (
            <div className="flex gap-2">
              <Button
                variant={pendingChanges > 0 ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={handleForceSync}
                disabled={isSyncing || !isOnline}
              >
                <RefreshCw
                  className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')}
                />
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={disableSync}
              >
                Disconnect
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleSignOut}
              >
                Sign out
              </Button>
            </div>
          )}
          {isSignedIn && !syncEnabled && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleForceSync}
              disabled={isSyncing || !isOnline}
            >
              <Cloud className="h-3.5 w-3.5" />
              {isSyncing ? 'Enabling...' : 'Enable Sync'}
            </Button>
          )}
        </div>

        {isSignedIn && syncEnabled && (
          <div className="pt-3 border-t border-border">
            <FieldGroup label="Auto-Sync Interval" htmlFor="autosync-interval">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select
                  value={String(autoSyncIntervalMinutes)}
                  onValueChange={(v) => setAutoSyncIntervalMinutes(Number(v))}
                >
                  <SelectTrigger id="autosync-interval" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Off</SelectItem>
                    <SelectItem value="5">Every 5 minutes</SelectItem>
                    <SelectItem value="10">Every 10 minutes</SelectItem>
                    <SelectItem value="15">Every 15 minutes</SelectItem>
                    <SelectItem value="30">Every 30 minutes</SelectItem>
                    <SelectItem value="60">Every 1 hour</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {autoSyncIntervalMinutes > 0
                  ? `Fallback reconciliation runs every ${autoSyncIntervalMinutes} minute${autoSyncIntervalMinutes === 1 ? '' : 's'} while online.`
                  : 'Realtime sync is active. "Sync Now" performs a full reconciliation pass.'}
              </p>
            </FieldGroup>
          </div>
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
                  onKeyDown={(e) =>
                    e.key === 'Enter' &&
                    syncAuthEmail &&
                    syncAuthPassword &&
                    handleAuth()
                  }
                />
              </FieldGroup>
              <Button
                className="w-full gap-2"
                onClick={handleAuth}
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

      {isSignedIn && syncEnabled && (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-2">Immediate Sync (Live)</h3>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Queued immediate ops</div>
              <div className="font-medium">
                {(() => {
                  try {
                    const q = JSON.parse(
                      localStorage.getItem('firebase_live_retry_queue_v1') || '[]'
                    );
                    return Array.isArray(q) ? q.length : '—';
                  } catch (e) {
                    return '—';
                  }
                })()}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Last live op:{' '}
                {(() => {
                  try {
                    const logs = JSON.parse(
                      localStorage.getItem('firebase_live_immediate_logs_v1') || '[]'
                    );
                    return logs && logs.length > 0 ? logs[0].message : '—';
                  } catch (e) {
                    return '—';
                  }
                })()}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => (window as any).__processLiveRetryQueue?.()}>
                Flush queued ops
              </Button>
            </div>
          </div>
        </Card>
      )}

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
            Sync is manual only — click "Sync Now" to upload your changes and
            pull updates from other devices. This uses significantly fewer cloud
            operations than automatic sync.
          </p>
        </Card>
      )}

      {isSignedIn && syncEvents.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Sync Activity</h3>
            {debugMode && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400">
                Debug
              </span>
            )}
          </div>
          <div
            className={cn(
              'space-y-3',
              !debugMode && 'max-h-64 overflow-y-auto'
            )}
          >
            {syncEvents.slice(0, debugMode ? 50 : 20).map((event) => (
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
                      <span className="ml-2 font-mono text-[10px]">
                        {event.id}
                      </span>
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
      )}

      {debugMode && isSignedIn && debugLogs.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Debug Logs</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400">
              Live
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
