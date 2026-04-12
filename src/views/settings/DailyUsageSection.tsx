import { BarChart2, Calendar, DollarSign, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';

import { cn, getDayKey } from '@/lib/utils';
import type { GenerationRecord } from '@/types';

import type {
  useMultipleChoiceSession,
  useWrittenSession,
} from '../../AppContext';
import { fmt } from './formatters';
import { Card, EmptyState } from './SettingsUI';

function computeDailyUsage(
  questionHistory: ReturnType<typeof useWrittenSession>['questionHistory'],
  mcHistory: ReturnType<typeof useMultipleChoiceSession>['mcHistory'],
  generationHistory: GenerationRecord[],
) {
  const byDay = new Map<
    string,
    { tokens: number; cost: number; questions: number }
  >();

  const addQuestion = (createdAt: string) => {
    const day = getDayKey(createdAt);
    const bucket = byDay.get(day) ?? { tokens: 0, cost: 0, questions: 0 };
    bucket.questions += 1;
    byDay.set(day, bucket);
  };

  for (const e of questionHistory) addQuestion(e.createdAt);
  for (const e of mcHistory) addQuestion(e.createdAt);

  for (const record of generationHistory) {
    const day = getDayKey(record.timestamp);
    const bucket = byDay.get(day) ?? { tokens: 0, cost: 0, questions: 0 };
    if (record.outputs?.totalTokens)
      bucket.tokens += record.outputs.totalTokens;
    if (record.outputs?.estimatedCostUsd)
      bucket.cost += record.outputs.estimatedCostUsd;
    byDay.set(day, bucket);
  }

  return byDay;
}

export function DailyUsageSection({
  questionHistory,
  mcHistory,
  generationHistory,
}: {
  questionHistory: ReturnType<typeof useWrittenSession>['questionHistory'];
  mcHistory: ReturnType<typeof useMultipleChoiceSession>['mcHistory'];
  generationHistory: GenerationRecord[];
}) {
  const dailyData = useMemo(() => {
    const byDay = computeDailyUsage(
      questionHistory,
      mcHistory,
      generationHistory,
    );

    const sorted = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30);

    return sorted.map(([day, data]) => ({
      day,
      label: new Date(day + 'T12:00:00').toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
      ...data,
    }));
  }, [questionHistory, mcHistory, generationHistory]);

  const totalDays = dailyData.length;

  const avgStats = useMemo(() => {
    if (totalDays === 0)
      return {
        avgTokens: 0,
        avgCost: 0,
        avgQuestions: 0,
        totalTokens: 0,
        totalCost: 0,
        totalQuestions: 0,
      };
    const totalTokens = dailyData.reduce((s, d) => s + d.tokens, 0);
    const totalCost = dailyData.reduce((s, d) => s + d.cost, 0);
    const totalQuestions = dailyData.reduce((s, d) => s + d.questions, 0);
    return {
      avgTokens: totalTokens / totalDays,
      avgCost: totalCost / totalDays,
      avgQuestions: totalQuestions / totalDays,
      totalTokens,
      totalCost,
      totalQuestions,
    };
  }, [dailyData, totalDays]);

  const maxTokens = Math.max(...dailyData.map((d) => d.tokens), 1);
  const maxQuestions = Math.max(...dailyData.map((d) => d.questions), 1);

  if (totalDays === 0) {
    return (
      <EmptyState message='No usage data yet. Token and cost tracking appears after your first generation.' />
    );
  }

  return (
    <div className='space-y-4'>
      {/* Summary KPI row */}
      <div className='grid grid-cols-3 gap-3'>
        {[
          {
            icon: <TrendingUp className='h-4 w-4 text-sky-500' />,
            label: 'Avg tokens / day',
            value: fmt.tokens(Math.round(avgStats.avgTokens)),
            sub: `${fmt.tokens(avgStats.totalTokens)} total · ${totalDays}d`,
            accent: 'sky',
          },
          {
            icon: <DollarSign className='h-4 w-4 text-emerald-500' />,
            label: 'Avg cost / day',
            value: fmt.cost(avgStats.avgCost),
            sub: `${fmt.cost(avgStats.totalCost)} total`,
            accent: 'emerald',
          },
          {
            icon: <BarChart2 className='h-4 w-4 text-violet-500' />,
            label: 'Avg questions / day',
            value: avgStats.avgQuestions.toFixed(1),
            sub: `${avgStats.totalQuestions} total`,
            accent: 'violet',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className={cn(
              'rounded-xl border p-4 space-y-2',
              stat.accent === 'sky' && 'bg-sky-500/5 border-sky-500/20',
              stat.accent === 'emerald' &&
                'bg-emerald-500/5 border-emerald-500/20',
              stat.accent === 'violet' &&
                'bg-violet-500/5 border-violet-500/20',
            )}
          >
            <div className='flex items-center gap-2 text-muted-foreground'>
              {stat.icon}
              <span className='text-[10px] font-bold uppercase tracking-wider'>
                {stat.label}
              </span>
            </div>
            <div
              className={cn(
                'text-2xl font-black tabular-nums leading-none',
                stat.accent === 'sky' && 'text-sky-600 dark:text-sky-400',
                stat.accent === 'emerald' &&
                  'text-emerald-600 dark:text-emerald-400',
                stat.accent === 'violet' &&
                  'text-violet-600 dark:text-violet-400',
              )}
            >
              {stat.value}
            </div>
            <div className='text-[11px] text-muted-foreground'>{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Daily bar chart — tokens */}
      <Card className='overflow-hidden'>
        <div className='flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30'>
          <div className='flex items-center gap-2'>
            <TrendingUp className='h-3.5 w-3.5 text-sky-500' />
            <span className='text-sm font-semibold'>Daily token usage</span>
          </div>
          <span className='text-xs text-muted-foreground'>
            Last {totalDays} active day{totalDays !== 1 ? 's' : ''}
          </span>
        </div>
        <div className='px-4 py-4'>
          <div className='flex items-end gap-1 h-24'>
            {dailyData.map((d) => {
              const pct = d.tokens / maxTokens;
              return (
                <div
                  key={d.day}
                  className='flex-1 flex flex-col items-center gap-1 group relative'
                  title={`${d.label}: ${fmt.tokens(d.tokens)} tokens`}
                >
                  <div
                    className='w-full rounded-t-sm bg-sky-500/70 hover:bg-sky-500 transition-colors cursor-default'
                    style={{
                      height: `${Math.max(pct * 88, d.tokens > 0 ? 4 : 0)}px`,
                    }}
                  />
                  <div className='absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none'>
                    <div className='rounded-lg border bg-popover px-2.5 py-1.5 shadow-lg text-[11px] text-foreground whitespace-nowrap'>
                      <div className='font-semibold'>{d.label}</div>
                      <div className='text-muted-foreground'>
                        {fmt.tokens(d.tokens)} tok · {d.questions}q ·{' '}
                        {fmt.cost(d.cost)}
                      </div>
                    </div>
                    <div className='w-2 h-2 bg-popover border-r border-b rotate-45 -mt-1 border-border' />
                  </div>
                </div>
              );
            })}
          </div>
          <div className='flex items-center justify-between mt-1.5'>
            <span className='text-[10px] text-muted-foreground/60'>
              {dailyData[0]?.label}
            </span>
            {dailyData.length > 2 && (
              <span className='text-[10px] text-muted-foreground/60'>
                {dailyData[Math.floor(dailyData.length / 2)]?.label}
              </span>
            )}
            <span className='text-[10px] text-muted-foreground/60'>
              {dailyData[dailyData.length - 1]?.label}
            </span>
          </div>
        </div>
      </Card>

      {/* Daily questions bar chart */}
      <Card className='overflow-hidden'>
        <div className='flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30'>
          <div className='flex items-center gap-2'>
            <BarChart2 className='h-3.5 w-3.5 text-violet-500' />
            <span className='text-sm font-semibold'>
              Daily questions answered
            </span>
          </div>
          <span className='text-xs text-muted-foreground'>
            Last {totalDays} active day{totalDays !== 1 ? 's' : ''}
          </span>
        </div>
        <div className='px-4 py-4'>
          <div className='flex items-end gap-1 h-24'>
            {dailyData.map((d) => {
              const pct = d.questions / maxQuestions;
              return (
                <div
                  key={d.day}
                  className='flex-1 flex flex-col items-center gap-1 group relative'
                  title={`${d.label}: ${d.questions} question${d.questions !== 1 ? 's' : ''}`}
                >
                  <div
                    className='w-full rounded-t-sm bg-violet-500/70 hover:bg-violet-500 transition-colors cursor-default'
                    style={{
                      height: `${Math.max(pct * 88, d.questions > 0 ? 4 : 0)}px`,
                    }}
                  />
                  <div className='absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none'>
                    <div className='rounded-lg border bg-popover px-2.5 py-1.5 shadow-lg text-[11px] text-foreground whitespace-nowrap'>
                      <div className='font-semibold'>{d.label}</div>
                      <div className='text-muted-foreground'>
                        {d.questions} question{d.questions !== 1 ? 's' : ''} ·{' '}
                        {fmt.tokens(d.tokens)} tok
                      </div>
                    </div>
                    <div className='w-2 h-2 bg-popover border-r border-b rotate-45 -mt-1 border-border' />
                  </div>
                </div>
              );
            })}
          </div>
          <div className='flex items-center justify-between mt-1.5'>
            <span className='text-[10px] text-muted-foreground/60'>
              {dailyData[0]?.label}
            </span>
            {dailyData.length > 2 && (
              <span className='text-[10px] text-muted-foreground/60'>
                {dailyData[Math.floor(dailyData.length / 2)]?.label}
              </span>
            )}
            <span className='text-[10px] text-muted-foreground/60'>
              {dailyData[dailyData.length - 1]?.label}
            </span>
          </div>
        </div>
      </Card>

      {/* Recent days table */}
      <Card className='overflow-hidden'>
        <div className='flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30'>
          <Calendar className='h-3.5 w-3.5 text-muted-foreground' />
          <span className='text-sm font-semibold'>Recent daily breakdown</span>
        </div>
        <div className='divide-y divide-border'>
          <div className='grid grid-cols-4 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/20'>
            <span>Date</span>
            <span className='text-right'>Questions</span>
            <span className='text-right'>Tokens</span>
            <span className='text-right'>Est. cost</span>
          </div>
          {[...dailyData]
            .reverse()
            .slice(0, 10)
            .map((d) => (
              <div
                key={d.day}
                className='grid grid-cols-4 px-4 py-2.5 text-sm hover:bg-muted/20 transition-colors'
              >
                <span className='text-foreground font-medium'>{d.label}</span>
                <span className='text-right tabular-nums text-muted-foreground'>
                  {d.questions}
                </span>
                <span className='text-right tabular-nums text-muted-foreground'>
                  {d.tokens > 0 ? fmt.tokens(d.tokens) : '—'}
                </span>
                <span className='text-right tabular-nums text-muted-foreground'>
                  {d.cost > 0 ? fmt.cost(d.cost) : '—'}
                </span>
              </div>
            ))}
        </div>
        {dailyData.length > 10 && (
          <div className='px-4 py-2.5 text-xs text-muted-foreground/60 border-t border-border bg-muted/10 text-center'>
            Showing 10 most recent days · {totalDays} total active days tracked
          </div>
        )}
      </Card>
    </div>
  );
}
