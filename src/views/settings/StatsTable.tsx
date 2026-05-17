import {
  Activity,
  BarChart3,
  Clock,
  Database,
  DollarSign,
  FileText,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import React from 'react';

import { cn } from '@/lib/utils';

import { fmt } from './formatters';
import { Card, StatusBadge } from './SettingsUI';
import type { ModelStats, StatsColumn } from './types';

const isDeepSeek = (name?: string) => name?.toLowerCase().includes('deepseek');

const STAT_ROWS: {
  icon: React.ReactNode;
  label: string;
  get: (s: ModelStats) => string | boolean | null;
  color?: string;
}[] = [
  {
    icon: <Zap className='h-3.5 w-3.5' />,
    label: 'Throughput',
    get: (s) => fmt.tps(s.tpsP50),
    color: 'text-amber-500',
  },
  {
    icon: <Clock className='h-3.5 w-3.5' />,
    label: 'Time to First Token',
    get: (s) => fmt.latency(s.latencyP50),
    color: 'text-blue-500',
  },
  {
    icon: <DollarSign className='h-3.5 w-3.5' />,
    label: 'Input Pricing',
    get: (s) => fmt.price(s.promptPricePerToken, isDeepSeek(s.name)),
    color: 'text-emerald-500',
  },
  {
    icon: <DollarSign className='h-3.5 w-3.5' />,
    label: 'Output Pricing',
    get: (s) => fmt.price(s.completionPricePerToken, isDeepSeek(s.name)),
    color: 'text-emerald-600',
  },
  {
    icon: <Database className='h-3.5 w-3.5' />,
    label: 'Context Window',
    get: (s) => fmt.context(s.contextLength),
    color: 'text-violet-500',
  },
  {
    icon: <Activity className='h-3.5 w-3.5' />,
    label: 'Uptime (30m)',
    get: (s) => fmt.uptime(s.uptimeLast30m),
    color: 'text-rose-500',
  },
  {
    icon: <ShieldCheck className='h-3.5 w-3.5' />,
    label: 'Structured JSON',
    get: (s) => s.supportsStructuredOutput,
    color: 'text-sky-500',
  },
  {
    icon: <BarChart3 className='h-3.5 w-3.5' />,
    label: 'Vision Support',
    get: (s) => s.supportsImages ?? null,
    color: 'text-indigo-500',
  },
  {
    icon: <FileText className='h-3.5 w-3.5' />,
    label: 'Document Support',
    get: (s) => s.supportsFiles ?? null,
    color: 'text-orange-500',
  },
];

export function StatsTable({ columns }: { columns: StatsColumn[] }) {
  const gridCols =
    {
      1: 'grid-cols-2',
      2: 'grid-cols-3',
      3: 'grid-cols-4',
      4: 'grid-cols-5',
    }[columns.length as 1 | 2 | 3 | 4] || 'grid-cols-2';
  return (
    <Card className='overflow-hidden border-border/40 shadow-sm'>
      <div
        className={cn(
          'grid text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 bg-muted/40 px-4 py-3 border-b border-border/40',
          gridCols,
        )}
      >
        <span>Performance Metric</span>
        {columns.map((col, i) => (
          <span key={i} className='truncate min-w-0 pl-2' title={col.label}>
            {col.label}
          </span>
        ))}
      </div>
      <div className='divide-y divide-border/20'>
        {STAT_ROWS.map((row, ri) => (
          <div
            key={ri}
            className={cn(
              'grid items-center px-4 py-3 text-sm hover:bg-muted/30 transition-colors group',
              gridCols,
            )}
          >
            <span className='flex items-center gap-2.5 text-muted-foreground group-hover:text-foreground transition-colors'>
              <span
                className={cn(
                  'opacity-70 group-hover:opacity-100 transition-opacity',
                  row.color,
                )}
              >
                {row.icon}
              </span>
              <span className='text-xs font-medium'>{row.label}</span>
            </span>
            {columns.map((col, ci) => (
              <span key={ci} className='pl-2'>
                {col.loading ? (
                  <div className='flex items-center gap-2'>
                    <div className='h-1.5 w-1.5 rounded-full bg-primary animate-pulse' />
                    <span className='text-[10px] font-bold text-primary/60'>
                      Polling
                    </span>
                  </div>
                ) : col.stats ? (
                  <StatusBadge value={row.get(col.stats)} />
                ) : (
                  <span className='text-muted-foreground/30 text-xs'>—</span>
                )}
              </span>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}
