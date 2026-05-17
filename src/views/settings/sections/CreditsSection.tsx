import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, Calendar, CheckCircle2, DollarSign, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useDeepSeekBalance } from '@/hooks/useDeepSeekInfo';
import { readBackendError } from '@/lib/app-utils';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import { CreditBar } from '@/views/settings/CreditBar';
import { DailyUsageSection } from '@/views/settings/DailyUsageSection';
import { fmt } from '@/views/settings/formatters';
import type { CreditsInfo } from '@/views/settings/types';

import {
  useMultipleChoiceSession,
  useWrittenSession,
} from '../../../AppContext';
import {
  AnimatedSection,
  Card,
  Divider,
  EmptyState,
  ErrorBanner,
} from '../SettingsUI';

function OpenRouterCreditsCard({
  apiKey,
}: {
  apiKey: string;
}) {
  const [credits, setCredits] = useState<CreditsInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const fetchCredits = useCallback(async (key: string) => {
    if (!key.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const info = await invoke<CreditsInfo>('get_credits', { apiKey: key });
      setCredits(info);
      setUpdatedAt(new Date());
    } catch (e) {
      setError(readBackendError(e));
      setCredits(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (apiKey) void fetchCredits(apiKey);
  }, [apiKey, fetchCredits]);

  return (
    <>
      <div key='header' className='flex items-start justify-between'>
        <div>
          <h2 className='text-lg font-semibold tracking-tight'>
            Account Credits
          </h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            OpenRouter credit balance for the current API key.
          </p>
          {updatedAt && !loading && (
            <p className='mt-1 text-xs text-muted-foreground/60'>
              Updated {fmt.time(updatedAt)}
            </p>
          )}
        </div>
        <Button
          size='default'
          className='gap-2 shrink-0'
          disabled={loading || !apiKey}
          onClick={() => void fetchCredits(apiKey)}
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', loading && 'animate-spin')}
          />
          Refresh
        </Button>
      </div>
      {error && (
        <ErrorBanner key='error-banner' message={error} />
      )}
      {!credits && !loading && !error && (
        <EmptyState
          key='empty-state'
          message={
            apiKey
              ? 'Click refresh to load credit info.'
              : 'Save your OpenRouter API key to load credit info.'
          }
        />
      )}
      {loading && (
        <div key='loading-skeleton' className='space-y-2'>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className='h-10 rounded-lg bg-muted animate-pulse' />
          ))}
        </div>
      )}
      {credits && !loading && (
        <div key='credits-display' className='space-y-4'>
          <Card className='p-5 space-y-3'>
            <div className='flex items-center justify-between text-sm'>
              <span className='font-medium'>Credit usage</span>
              <span className='text-muted-foreground tabular-nums'>
                ${credits.totalUsage.toFixed(4)} / $
                {credits.totalCredits.toFixed(4)}
              </span>
            </div>
            <CreditBar used={credits.totalUsage} total={credits.totalCredits} />
            <div className='flex items-center justify-between text-xs mt-1'>
              <span className='text-muted-foreground'>Percent used</span>
              <span className='tabular-nums font-mono'>
                {credits.totalCredits > 0
                  ? ((credits.totalUsage / credits.totalCredits) * 100).toFixed(
                      5,
                    )
                  : '0.00000'}
                %
              </span>
            </div>
          </Card>
          <Card className='overflow-hidden divide-y divide-border'>
            {[
              {
                label: 'Remaining',
                value: `$${credits.remaining.toFixed(4)}`,
                highlight: true,
              },
              { label: 'Used', value: `$${credits.totalUsage.toFixed(4)}` },
              {
                label: 'Purchased',
                value: `$${credits.totalCredits.toFixed(4)}`,
              },
            ].map((row) => (
              <div
                key={row.label}
                className='flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/30 transition-colors'
              >
                <span className='text-muted-foreground'>{row.label}</span>
                <span
                  className={cn(
                    'tabular-nums font-medium',
                    row.highlight && 'text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </>
  );
}

function DeepSeekBalanceCard({
  apiKey,
  balance,
  loading,
  error,
  onRefresh,
}: {
  apiKey: string;
  balance: ReturnType<typeof useDeepSeekBalance>['balance'];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <>
      <div key='ds-header' className='flex items-start justify-between'>
        <div>
          <h2 className='text-lg font-semibold tracking-tight'>
            DeepSeek Balance
          </h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            DeepSeek platform balance for the configured API key.
          </p>
        </div>
        <Button
          size='default'
          className='gap-2 shrink-0'
          disabled={loading || !apiKey}
          onClick={onRefresh}
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', loading && 'animate-spin')}
          />
          Refresh
        </Button>
      </div>
      {error && (
        <ErrorBanner key='ds-error-banner' message={error} />
      )}
      {!balance && !loading && !error && (
        <EmptyState
          key='ds-empty-state'
          message={
            apiKey
              ? 'Click refresh to load balance info.'
              : 'Save your DeepSeek API key to load balance info.'
          }
        />
      )}
      {loading && (
        <div key='ds-loading-skeleton' className='space-y-2'>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className='h-20 rounded-lg bg-muted animate-pulse' />
          ))}
        </div>
      )}
      {balance && !loading && (
        <div key='ds-balance-display' className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
          {balance.balanceInfos.map((info) => (
            <div
              key={info.currency}
              className='rounded-lg border border-border/40 bg-muted/20 p-4 space-y-2'
            >
              <div className='flex items-center justify-between'>
                <span className='text-xs font-semibold uppercase tracking-wider text-foreground/60'>
                  {info.currency}
                </span>
                {balance.isAvailable ? (
                  <span className='flex items-center gap-1 text-xs font-semibold text-emerald-500'>
                    <CheckCircle2 className='h-3.5 w-3.5' />
                    Active
                  </span>
                ) : (
                  <span className='flex items-center gap-1 text-xs font-semibold text-amber-500'>
                    <AlertCircle className='h-3.5 w-3.5' />
                    Low Balance
                  </span>
                )}
              </div>
              <div className='flex items-center gap-2'>
                <DollarSign className='h-5 w-5 text-muted-foreground' />
                <span className='text-xl font-bold tabular-nums'>
                  {info.totalBalance}
                </span>
              </div>
              <div className='text-xs text-muted-foreground space-y-0.5'>
                <div className='flex justify-between'>
                  <span>Granted</span>
                  <span className='font-medium tabular-nums'>{info.grantedBalance}</span>
                </div>
                <div className='flex justify-between'>
                  <span>Topped up</span>
                  <span className='font-medium tabular-nums'>{info.toppedUpBalance}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function CreditsSection() {
  const { questionHistory } = useWrittenSession();
  const { mcHistory } = useMultipleChoiceSession();
  const generationHistory = useAppStore((s) => s.generationHistory);
  const openrouterApiKey =
    useAppStore((s) => s.providers['openrouter']?.apiKey) ?? '';
  const deepseekApiKey =
    useAppStore((s) => s.providers['deepseek']?.apiKey) ?? '';

  const ds = useDeepSeekBalance(deepseekApiKey);

  useEffect(() => {
    if (deepseekApiKey) void ds.fetch();
  }, [deepseekApiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatedSection className='space-y-6'>
      <OpenRouterCreditsCard apiKey={openrouterApiKey} />

      <Divider key='divider-or' />

      <DeepSeekBalanceCard
        apiKey={deepseekApiKey}
        balance={ds.balance}
        loading={ds.loading}
        error={ds.error}
        onRefresh={() => void ds.fetch()}
      />

      <Divider key='divider-daily' />

      {/* Daily usage section */}
      <div key='daily-usage'>
        <div className='mb-4'>
          <h2 className='text-base font-semibold tracking-tight flex items-center gap-2'>
            <Calendar className='h-4 w-4 text-muted-foreground' />
            Daily Token & Cost Usage
          </h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            Based on generation telemetry stored locally in your history. Only
            sessions with token data are included.
          </p>
        </div>
        <DailyUsageSection
          questionHistory={questionHistory}
          mcHistory={mcHistory}
          generationHistory={generationHistory}
        />
      </div>
    </AnimatedSection>
  );
}