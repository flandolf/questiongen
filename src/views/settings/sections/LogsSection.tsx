import { Clipboard, Terminal, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
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

import { Card, SectionHeader } from '../SettingsUI';

export function LogsSection() {
  const logs = useAppStore((s) => s.logs);
  const clearLogs = useAppStore((s) => s.clearLogs);
  const [filter, setFilter] = useState('');

  const filteredLogs = useMemo(() => {
    if (!filter.trim()) return logs;
    const lowerFilter = filter.toLowerCase();
    return logs.filter(
      (l) =>
        l.message.toLowerCase().includes(lowerFilter) ||
        l.level.toLowerCase().includes(lowerFilter),
    );
  }, [logs, filter]);

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

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <SectionHeader
          title='System Logs'
          description='Real-time diagnostic information, sync events, and generation payloads.'
        />
        <div className='flex items-center gap-2'>
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

      <div className='space-y-4'>
        <InputGroup>
          <InputGroupAddon align='inline-start'>
            <Terminal size={16} className='text-zinc-500' />
          </InputGroupAddon>
          <InputGroupInput
            placeholder='Filter logs...'
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </InputGroup>

        <Card className='bg-zinc-950 border-zinc-800 overflow-hidden'>
          <ScrollArea className='h-150 w-full'>
            <div className='p-4 font-mono text-xs space-y-1'>
              {filteredLogs.length === 0 ? (
                <div className='text-zinc-500 italic py-4 text-center'>
                  No logs found.
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <div key={log.id} className='flex gap-3 leading-relaxed'>
                    <span className='text-zinc-500 shrink-0 select-none'>
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>
                    <span
                      className={cn('shrink-0 font-bold select-none w-12', {
                        'text-zinc-400': log.level === 'log',
                        'text-blue-400': log.level === 'info',
                        'text-yellow-500': log.level === 'warn',
                        'text-red-500': log.level === 'error',
                        'text-purple-400': log.level === 'debug',
                      })}
                    >
                      {log.level.toUpperCase()}
                    </span>
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
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}
