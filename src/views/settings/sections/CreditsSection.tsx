import { invoke } from '@tauri-apps/api/core';
import { Calendar, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { readBackendError } from '@/lib/app-utils';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import { CreditBar } from '@/views/settings/CreditBar';
import { DailyUsageSection } from '@/views/settings/DailyUsageSection';
import { fmt } from '@/views/settings/formatters';
import type { CreditsInfo } from '@/views/settings/types';

import {
  useAppSettings,
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

export function CreditsSection() {
  const { apiKey } = useAppSettings();
  const { questionHistory } = useWrittenSession();
  const { mcHistory } = useMultipleChoiceSession();
  const generationHistory = useAppStore((s) => s.generationHistory);

  const [credits, setCredits] = useState<CreditsInfo | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [creditsUpdatedAt, setCreditsUpdatedAt] = useState<Date | null>(null);

  const fetchCredits = useCallback(async (key: string) => {
    if (!key.trim()) return;
    setCreditsLoading(true);
    setCreditsError(null);
    try {
      const info = await invoke<CreditsInfo>('get_credits', { apiKey: key });
      setCredits(info);
      setCreditsUpdatedAt(new Date());
    } catch (e) {
      setCreditsError(readBackendError(e));
      setCredits(null);
    } finally {
      setCreditsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (apiKey) void fetchCredits(apiKey);
  }, [apiKey, fetchCredits]);

  return (
    <AnimatedSection className='space-y-6'>
      {/* Credit balance */}
      <div key='header' className='flex items-start justify-between'>
        <div>
          <h2 className='text-lg font-semibold tracking-tight'>
            Account Credits
          </h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            OpenRouter credit balance for the current API key.
          </p>
          {creditsUpdatedAt && !creditsLoading && (
            <p className='mt-1 text-xs text-muted-foreground/60'>
              Updated {fmt.time(creditsUpdatedAt)}
            </p>
          )}
        </div>
        <Button
          size='default'
          className='gap-2 shrink-0'
          disabled={creditsLoading || !apiKey}
          onClick={() => void fetchCredits(apiKey)}
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', creditsLoading && 'animate-spin')}
          />
          Refresh
        </Button>
      </div>
      {creditsError && (
        <ErrorBanner key='error-banner' message={creditsError} />
      )}
      {!credits && !creditsLoading && !creditsError && (
        <EmptyState
          key='empty-state'
          message={
            apiKey
              ? 'Click refresh to load credit info.'
              : 'Save your API key to load credit info.'
          }
        />
      )}
      {creditsLoading && (
        <div key='loading-skeleton' className='space-y-2'>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className='h-10 rounded-lg bg-muted animate-pulse' />
          ))}
        </div>
      )}
      {credits && !creditsLoading && (
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

      <Divider key='divider' />

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
