import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Loader2,
} from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

import { useAppSettings } from '../../../AppContext';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { useFirebaseSyncContext } from '../../../context/FirebaseSyncContext';
import { signOutFirebase } from '../../../context/modules/firebase-auth';
import { Card, FieldGroup, SectionHeader, ToggleRow } from '../SettingsUI';

// eslint-disable-next-line complexity
export function SyncSection() {
  const { syncApiKey, setSyncApiKey } = useAppSettings();
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
    syncError,
    enableSync,
    disableSync,
    toggleSync,
  } = firebaseSync;

  const syncEnabled = isSyncEnabled;
  const isSignedIn = !!user;

  const syncHealth = !syncEnabled
    ? { label: 'Disconnected', tone: 'muted', hint: 'Sign in to sync devices.' }
    : !isOnline
      ? {
        label: 'Offline',
        tone: 'offline',
        hint: 'Cloud sync requires an internet connection.',
      }
      : syncStatus === 'error'
        ? {
          label: 'Error',
          tone: 'blocked',
          hint: syncError || 'An error occurred during synchronization.',
        }
        : syncStatus === 'connecting'
          ? {
            label: 'Connecting',
            tone: 'stale',
            hint: 'Establishing connection to cloud...',
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

  const handleSignOut = async () => {
    try {
      await signOutFirebase();
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Cloud Sync"
        description="Your data is automatically synced to the cloud in realtime using Firestore."
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
              {syncEnabled && (
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      syncHealth.tone === 'healthy' &&
                      'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                      syncHealth.tone === 'offline' &&
                      'bg-slate-500/15 text-slate-700 dark:text-slate-300',
                      syncHealth.tone === 'blocked' &&
                      'bg-destructive/15 text-destructive',
                      syncHealth.tone === 'stale' &&
                      'bg-orange-500/15 text-orange-700 dark:text-orange-400',
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
            </div>
          )}
          {isSignedIn && !syncEnabled && (
            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  toggleSync();
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
          <div className="pt-3 border-t border-border">
            <ToggleRow
              id="sync-api-key"
              checked={syncApiKey}
              onChange={setSyncApiKey}
              label="Sync API Key"
              description="Include your OpenRouter API key in cloud sync so it's available on all your devices."
            />
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
                ? 'Sign in with your email to sync across all your devices.'
                : 'Create an account to start syncing your data.'}
            </p>
          </div>
        )}
      </Card>

      {isSignedIn && (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-3">Sync Details</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              Realtime Database-First Syncing
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              Offline Persistence & Background Syncing
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              History, Presets, and Saved Sets
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              Multi-Device Synchronization
            </li>
          </ul>
        </Card>
      )}
    </div>
  );
}
