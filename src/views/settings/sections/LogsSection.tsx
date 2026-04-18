import {
  ChevronDown,
  ChevronRight,
  Clipboard,
  Pause,
  Play,
  Search,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import type { LogEntry } from '@/types';
import {
  AnimatedSection,
  Card,
  SectionHeader,
} from '@/views/settings/SettingsUI';

function hasLogData(
  data: unknown,
): data is Record<string, unknown> | unknown[] {
  return data !== undefined && data !== null && typeof data === 'object';
}

function LogItem({
  log,
  formatLogData,
}: {
  log: LogEntry;
  formatLogData: (data: unknown) => string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasData = hasLogData(log.data);

  return (
    <div className='flex flex-col gap-1 leading-relaxed border-b border-zinc-900 pb-2 last:border-0'>
      <div className='flex gap-3 items-start'>
        <span className='text-zinc-500 shrink-0 select-none pt-0.5'>
          [{new Date(log.timestamp).toLocaleTimeString()}]
        </span>
        <span
          className={cn('shrink-0 font-bold select-none w-14 pt-0.5', {
            'text-zinc-400': log.level === 'log',
            'text-blue-400': log.level === 'info',
            'text-yellow-500': log.level === 'warn',
            'text-red-500': log.level === 'error',
            'text-purple-400': log.level === 'debug',
          })}
        >
          {log.level.toUpperCase()}
        </span>
        <div className='flex-1 min-w-0 flex flex-col'>
          <span
            className={cn('wrap-break-word whitespace-pre-wrap', {
              'text-zinc-300': log.level === 'log',
              'text-blue-200': log.level === 'info',
              'text-yellow-200': log.level === 'warn',
              'text-red-200': log.level === 'error',
              'text-purple-200': log.level === 'debug',
            })}
          >
            {log.message}
          </span>
          {hasData && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className='flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 mt-1 transition-colors'
            >
              {isExpanded ? (
                <ChevronDown className='h-3 w-3' />
              ) : (
                <ChevronRight className='h-3 w-3' />
              )}
              {isExpanded ? 'Hide Data' : 'Show Data'}
            </button>
          )}
        </div>
      </div>
      {hasData && isExpanded && (
        <div className='ml-24 mt-1 overflow-x-auto rounded bg-zinc-900/50 p-2 border border-zinc-800/50'>
          <pre className='text-[10px] text-zinc-400 font-mono'>
            {formatLogData(log.data)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function LogsSection() {
  const logs = useAppStore((s) => s.logs);
  const clearLogs = useAppStore((s) => s.clearLogs);
  const [filter, setFilter] = useState('');
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(
    new Set(['log', 'info', 'warn', 'error', 'debug']),
  );
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastLogsCount = useRef(logs.length);

  const formatLogData = (data: unknown) => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  const filteredLogs = useMemo(() => {
    const result = logs;
    if (isPaused) {
      // If paused, we don't update with new logs but we also shouldn't
      // just freeze the old ones if the filter changes.
      // This is a bit tricky with Zustand. For now let's just filter the current logs.
    }

    const lowerFilter = filter.toLowerCase();
    return result.filter((l) => {
      const matchesFilter =
        !filter.trim() ||
        l.message.toLowerCase().includes(lowerFilter) ||
        l.level.toLowerCase().includes(lowerFilter);
      const matchesLevel = selectedLevels.has(l.level);
      return matchesFilter && matchesLevel;
    });
  }, [logs, filter, selectedLevels, isPaused]);

  // Auto-scroll logic
  useEffect(() => {
    if (autoScroll && !isPaused && logs.length > lastLogsCount.current) {
      const scrollContainer = scrollRef.current?.querySelector(
        '[data-radix-scroll-area-viewport]',
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
    lastLogsCount.current = logs.length;
  }, [logs, autoScroll, isPaused]);

  const copyToClipboard = () => {
    const text = filteredLogs
      .map(
        (l) =>
          `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.level.toUpperCase()}] ${l.message}`,
      )
      .join('\n');
    void navigator.clipboard.writeText(text);
    toast.success('Logs copied to clipboard');
  };

  const toggleLevel = (level: string) => {
    const next = new Set(selectedLevels);
    if (next.has(level)) {
      if (next.size > 1) next.delete(level);
    } else {
      next.add(level);
    }
    setSelectedLevels(next);
  };

  const levels: LogEntry['level'][] = ['debug', 'info', 'log', 'warn', 'error'];

  return (
    <AnimatedSection className='space-y-6'>
      <div key='header-container' className='flex items-center justify-between'>
        <SectionHeader
          title='System Logs'
          description='Real-time diagnostic information, sync events, and generation payloads.'
        />
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setIsPaused(!isPaused)}
            className={cn(
              'gap-2',
              isPaused &&
                'bg-yellow-500/10 border-yellow-500/50 text-yellow-500',
            )}
          >
            {isPaused ? (
              <Play className='h-4 w-4' />
            ) : (
              <Pause className='h-4 w-4' />
            )}
            {isPaused ? 'Resume' : 'Pause'}
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={copyToClipboard}
            className='gap-2'
          >
            <Clipboard className='h-4 w-4' />
            Copy
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              if (window.confirm('Clear all logs?')) {
                clearLogs();
              }
            }}
            className='gap-2 text-destructive hover:text-destructive'
          >
            <Trash2 className='h-4 w-4' />
            Clear
          </Button>
        </div>
      </div>

      <div key='logs-container' className='space-y-4'>
        <div className='flex flex-wrap items-center gap-4'>
          <div className='flex-1 min-w-50'>
            <InputGroup>
              <InputGroupAddon align='inline-start'>
                <Search size={16} className='text-zinc-500' />
              </InputGroupAddon>
              <InputGroupInput
                placeholder='Search logs...'
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              {filter && (
                <InputGroupAddon align='inline-end'>
                  <button
                    onClick={() => setFilter('')}
                    className='text-zinc-500 hover:text-zinc-300 transition-colors'
                  >
                    <X size={16} />
                  </button>
                </InputGroupAddon>
              )}
            </InputGroup>
          </div>
          <div className='flex items-center gap-1.5 p-1 bg-zinc-900 rounded-lg border border-zinc-800'>
            {levels.map((level) => (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                className={cn(
                  'px-2 py-1 text-[10px] font-bold rounded transition-colors',
                  selectedLevels.has(level)
                    ? {
                        'bg-zinc-700 text-zinc-100': level === 'log',
                        'bg-blue-600/20 text-blue-400': level === 'info',
                        'bg-yellow-600/20 text-yellow-500': level === 'warn',
                        'bg-red-600/20 text-red-500': level === 'error',
                        'bg-purple-600/20 text-purple-400': level === 'debug',
                      }
                    : 'text-zinc-500 hover:text-zinc-400',
                )}
              >
                {level.toUpperCase()}
              </button>
            ))}
          </div>
          <label className='flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none'>
            <input
              type='checkbox'
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className='rounded border-zinc-700 bg-zinc-800 text-blue-600'
            />
            Auto-scroll
          </label>
        </div>

        <Card className='bg-zinc-950 border-zinc-800 overflow-hidden'>
          <ScrollArea ref={scrollRef} className='h-150 w-full'>
            <div className='p-4 font-mono text-xs space-y-2'>
              {filteredLogs.length === 0 ? (
                <div className='text-zinc-500 italic py-8 text-center flex flex-col items-center gap-2'>
                  <Terminal className='h-8 w-8 text-zinc-800' />
                  No logs found matching your filters.
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <LogItem
                    key={log.id}
                    log={log}
                    formatLogData={formatLogData}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>
    </AnimatedSection>
  );
}
