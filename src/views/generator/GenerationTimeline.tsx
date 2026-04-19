import {
  CheckCircle2,
  Clock3,
  Coins,
  DollarSign,
  Loader2,
  Pause,
  Play,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { formatCostUsd } from '@/lib/app-utils';
import type {
  BatchTopicProgress,
  GenerationStatusEvent,
  GenerationSubCallProgress,
  GenerationTelemetry,
} from '@/types';

type TimelinePhase = 'waiting' | 'active' | 'done' | 'error';

const STAGE_ORDER = [
  'allocating_subtopics',
  'preparing',
  'generating',
  'parsing',
  'completed',
] as const;
type KnownStage = (typeof STAGE_ORDER)[number];

/** Stages emitted by the backend or client; labels for timeline and batch rows. */
const GENERATION_STAGE_LABELS: Record<string, string> = {
  allocating_subtopics: 'Focus subtopics (local)',
  preparing: 'Building prompt',
  generating: 'Generating',
  parsing: 'Parsing & validating',
  completed: 'Complete',
  failed: 'Failed',
};

function phaseForStage(
  stage: KnownStage,
  currentStage: string,
  isFailed: boolean,
): TimelinePhase {
  const currentIdx = STAGE_ORDER.indexOf(currentStage as KnownStage);
  const thisIdx = STAGE_ORDER.indexOf(stage);
  if (isFailed && stage === currentStage) return 'error';
  if (thisIdx < currentIdx) return 'done';
  if (thisIdx === currentIdx) return isFailed ? 'error' : 'active';
  return 'waiting';
}

function TimelineDot({ phase }: { phase: TimelinePhase }) {
  if (phase === 'done')
    return (
      <CheckCircle2 className='w-3.5 h-3.5 text-green-500 dark:text-green-400 shrink-0 mt-0.5' />
    );
  if (phase === 'error')
    return <XCircle className='w-3.5 h-3.5 text-destructive shrink-0 mt-0.5' />;
  if (phase === 'active')
    return (
      <span className='w-3.5 h-3.5 shrink-0 mt-0.5 flex items-center justify-center'>
        <span className='w-2 h-2 rounded-full bg-primary animate-pulse' />
      </span>
    );
  return (
    <span className='w-3.5 h-3.5 shrink-0 mt-0.5 flex items-center justify-center'>
      <span className='w-2 h-2 rounded-full bg-border' />
    </span>
  );
}

const STAGE_LABELS: Record<KnownStage, string> = {
  allocating_subtopics: GENERATION_STAGE_LABELS.allocating_subtopics,
  preparing: GENERATION_STAGE_LABELS.preparing,
  generating: GENERATION_STAGE_LABELS.generating,
  parsing: GENERATION_STAGE_LABELS.parsing,
  completed: GENERATION_STAGE_LABELS.completed,
};

function formatElapsed(ms: number): string {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function useGenerationElapsedTime({
  generationStartedAt,
  completedDurationMs,
  isGenerating,
  isPaused,
  fallback,
}: {
  generationStartedAt?: number | null;
  completedDurationMs?: number;
  isGenerating: boolean;
  isPaused: boolean;
  fallback: string;
}): string {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const pausedAtMsRef = useRef<number | null>(null);
  const pausedTotalMsRef = useRef(0);
  const generationStartRef = useRef<number | null>(generationStartedAt ?? null);

  useEffect(() => {
    const nextStart = generationStartedAt ?? null;
    if (generationStartRef.current === nextStart) return;
    generationStartRef.current = nextStart;
    pausedAtMsRef.current = null;
    pausedTotalMsRef.current = 0;
    setNowMs(Date.now());
  }, [generationStartedAt]);

  useEffect(() => {
    if (!isGenerating) {
      pausedAtMsRef.current = null;
      return;
    }

    const now = Date.now();
    if (isPaused) {
      if (pausedAtMsRef.current === null) {
        pausedAtMsRef.current = now;
      }
      return;
    }

    if (pausedAtMsRef.current !== null) {
      pausedTotalMsRef.current += now - pausedAtMsRef.current;
      pausedAtMsRef.current = null;
    }
  }, [isGenerating, isPaused]);

  useEffect(() => {
    if (!isGenerating || isPaused) return;

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);

    return () => window.clearInterval(interval);
  }, [isGenerating, isPaused]);

  if (completedDurationMs != null && completedDurationMs >= 0) {
    return formatElapsed(completedDurationMs);
  }

  if (!generationStartedAt) {
    return fallback;
  }

  const effectiveNow =
    isPaused && pausedAtMsRef.current != null ? pausedAtMsRef.current : nowMs;
  const elapsedMs =
    effectiveNow - generationStartedAt - pausedTotalMsRef.current;

  return formatElapsed(elapsedMs);
}

export function LastGenerationStats({
  telemetry,
}: {
  telemetry: GenerationTelemetry;
}) {
  const items: { icon: React.ReactNode; label: string; value: string }[] = [];

  if (telemetry.estimatedCostUsd != null) {
    items.push({
      icon: <DollarSign className='w-3 h-3' />,
      label: 'Cost',
      value: formatCostUsd(telemetry.estimatedCostUsd),
    });
  }
  if (telemetry.totalTokens != null) {
    items.push({
      icon: <Coins className='w-3 h-3' />,
      label: 'Tokens',
      value: telemetry.totalTokens.toLocaleString(),
    });
  }
  if (telemetry.durationMs != null) {
    items.push({
      icon: <Clock3 className='w-3 h-3' />,
      label: 'Time',
      value:
        telemetry.durationMs < 1000
          ? `${Math.round(telemetry.durationMs)}ms`
          : `${(telemetry.durationMs / 1000).toFixed(1)}s`,
    });
  }

  if (items.length === 0) return null;

  return (
    <div className='w-full'>
      <p className='text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5'>
        Last Generation
      </p>
      <div className='flex flex-wrap gap-x-4 gap-y-1'>
        {items.map(({ icon, label, value }) => (
          <div
            key={label}
            className='flex items-center gap-1 text-xs text-foreground'
          >
            <span className='text-muted-foreground'>{icon}</span>
            <span className='text-muted-foreground'>{label}:</span>
            <span className='font-semibold tabular-nums'>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineStages({
  currentStage,
  isFailed,
  isGenerating,
  isDone,
}: {
  currentStage: string;
  isFailed: boolean;
  isGenerating: boolean;
  isDone: boolean;
}) {
  return (
    <div className='relative flex flex-col gap-1.5 pl-0.5'>
      {STAGE_ORDER.map((stage) => {
        const phase = phaseForStage(
          stage,
          currentStage as KnownStage,
          isFailed,
        );
        if (phase === 'waiting' && !isGenerating && !isDone && !isFailed)
          return null;
        return (
          <div key={stage} className='flex items-start gap-2 pl-0.5'>
            <TimelineDot phase={phase} />
            <span
              className={`text-[11px] font-mono leading-tight pt-0.5 ${
                phase === 'active'
                  ? 'text-foreground font-semibold'
                  : phase === 'done'
                    ? 'text-muted-foreground'
                    : phase === 'error'
                      ? 'text-destructive'
                      : 'text-muted-foreground/40'
              }`}
            >
              {STAGE_LABELS[stage]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SubCallProgressHint({
  progress,
  topicLabel,
  batchMode,
}: {
  progress: GenerationSubCallProgress | null | undefined;
  topicLabel?: string;
  batchMode?: boolean;
}) {
  if (!progress || progress.total <= 1) return null;
  const suffix = batchMode
    ? ' (local subtopic split)'
    : ' (one focus area per pass)';
  return (
    <p className='text-[10px] font-mono text-muted-foreground/90 tabular-nums pl-0.5'>
      {topicLabel ? `${topicLabel}: ` : ''}API pass {progress.current} /{' '}
      {progress.total}
      <span className='text-muted-foreground/50 font-normal'>{suffix}</span>
    </p>
  );
}

function GenerationTokenStream({
  streamText,
  currentStage,
  isGenerating,
  isDone,
}: {
  streamText: string;
  currentStage: string;
  isGenerating: boolean;
  isDone: boolean;
}) {
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streamRef.current)
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [streamText]);

  if (
    !(
      currentStage === 'generating' ||
      currentStage === 'parsing' ||
      (isDone && streamText)
    )
  )
    return null;

  return (
    <div
      ref={streamRef}
      className='max-h-28 overflow-y-auto rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-[10px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap break-all'
    >
      {streamText ? (
        streamText
      ) : (
        <span className='opacity-40'>Waiting for tokens…</span>
      )}
      {isGenerating &&
        (currentStage === 'generating' || currentStage === 'parsing') && (
          <span className='inline-block w-1 h-3 bg-muted-foreground/50 ml-0.5 align-middle animate-pulse' />
        )}
    </div>
  );
}

function CompletedStats({
  completedEvent,
}: {
  completedEvent: GenerationStatusEvent | null;
}) {
  if (!completedEvent) return null;
  return (
    <div className='flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 border-t border-border/40'>
      {completedEvent.totalTokens != null && completedEvent.totalTokens > 0 && (
        <span className='flex items-center gap-1 text-[11px] font-mono text-muted-foreground'>
          <Coins className='w-3 h-3' />
          <span className='tabular-nums font-semibold text-foreground'>
            {completedEvent.totalTokens.toLocaleString()}
          </span>
          {' tok'}
          {completedEvent.promptTokens != null &&
            completedEvent.completionTokens != null && (
              <span className='text-muted-foreground/60'>
                {' '}
                ({completedEvent.promptTokens.toLocaleString()} in /{' '}
                {completedEvent.completionTokens.toLocaleString()} out)
              </span>
            )}
        </span>
      )}
      {completedEvent.estimatedCostUsd != null && (
        <span className='flex items-center gap-1 text-[11px] font-mono text-muted-foreground'>
          <DollarSign className='w-3 h-3' />
          <span className='tabular-nums font-semibold text-foreground'>
            {completedEvent.estimatedCostUsd < 0.0001
              ? '<$0.0001'
              : `$${completedEvent.estimatedCostUsd.toFixed(4)}`}
          </span>
        </span>
      )}
    </div>
  );
}

export function GenerationTimeline({
  generationStatus,
  generationSubCallProgress,
  generationStartedAt,
  formattedElapsedTime,
  streamText,
  isGenerating,
  isPaused,
  onTogglePause,
}: {
  generationStatus: GenerationStatusEvent | null;
  /** Present when several API calls run for one subject (per locally chosen subtopic). */
  generationSubCallProgress?: GenerationSubCallProgress | null;
  generationStartedAt?: number | null;
  formattedElapsedTime: string;
  streamText: string;
  isGenerating: boolean;
  isPaused: boolean;
  onTogglePause: () => void;
}) {
  const currentStage = generationStatus?.stage ?? 'preparing';
  const isFailed = currentStage === 'failed';
  const isDone = currentStage === 'completed';

  const completedEvent = isDone ? generationStatus : null;
  const elapsedTimeLabel = useGenerationElapsedTime({
    generationStartedAt,
    completedDurationMs: completedEvent?.durationMs,
    isGenerating,
    isPaused,
    fallback: formattedElapsedTime,
  });

  return (
    <div className='w-full py-2.5 space-y-2'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-1.5'>
          {isGenerating ? (
            <Loader2 className='w-3 h-3 animate-spin text-primary shrink-0' />
          ) : isDone ? (
            <CheckCircle2 className='w-3 h-3 text-green-500 shrink-0' />
          ) : (
            <XCircle className='w-3 h-3 text-destructive shrink-0' />
          )}
          <span className='text-xs font-medium text-foreground'>
            {generationStatus?.message ?? 'Generating…'}
          </span>
        </div>
        <span className='text-[10px] font-mono text-muted-foreground tabular-nums flex items-center gap-1'>
          <Clock3 className='w-2.5 h-2.5' />
          {elapsedTimeLabel}
          {isGenerating && (
            <button
              type='button'
              onClick={onTogglePause}
              className='ml-1 p-0.5 rounded hover:bg-muted transition-colors'
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? (
                <Play className='w-3 h-3' />
              ) : (
                <Pause className='w-3 h-3' />
              )}
            </button>
          )}
        </span>
      </div>

      {isGenerating && (
        <SubCallProgressHint progress={generationSubCallProgress} />
      )}

      <TimelineStages
        currentStage={currentStage}
        isFailed={isFailed}
        isGenerating={isGenerating}
        isDone={isDone}
      />

      <GenerationTokenStream
        streamText={streamText}
        currentStage={currentStage}
        isGenerating={isGenerating}
        isDone={isDone}
      />

      {isDone && <CompletedStats completedEvent={completedEvent} />}
    </div>
  );
}

// eslint-disable-next-line complexity
export function BatchTimeline({
  entries,
  generationSubCallProgress,
  generationStartedAt,
  formattedElapsedTime,
  streamText,
  isGenerating,
  isPaused,
  onTogglePause,
}: {
  entries: BatchTopicProgress[];
  generationSubCallProgress?: GenerationSubCallProgress | null;
  generationStartedAt?: number | null;
  formattedElapsedTime: string;
  streamText: string;
  isGenerating: boolean;
  isPaused: boolean;
  onTogglePause: () => void;
}) {
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streamRef.current)
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [streamText]);

  const doneCount = entries.filter((e) => e.status === 'done').length;
  const errorCount = entries.filter((e) => e.status === 'error').length;
  const activeEntry = entries.find((e) => e.status === 'active');
  const allDone = doneCount + errorCount === entries.length;
  const elapsedTimeLabel = useGenerationElapsedTime({
    generationStartedAt,
    isGenerating,
    isPaused,
    fallback: formattedElapsedTime,
  });

  return (
    <div className='w-full px-6 py-2.5 space-y-2'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-1.5'>
          {isGenerating ? (
            <Loader2 className='w-3 h-3 animate-spin text-primary shrink-0' />
          ) : allDone && errorCount === 0 ? (
            <CheckCircle2 className='w-3 h-3 text-green-500 shrink-0' />
          ) : (
            <XCircle className='w-3 h-3 text-destructive shrink-0' />
          )}
          <span className='text-xs font-medium text-foreground'>
            {isGenerating
              ? activeEntry
                ? `Generating ${activeEntry.topic} (${activeEntry.questionCount}q)…`
                : 'Starting…'
              : allDone && errorCount === 0
                ? `Done — ${entries.length} subjects complete`
                : `${errorCount} subject${errorCount !== 1 ? 's' : ''} failed`}
          </span>
        </div>
        <span className='text-[10px] font-mono text-muted-foreground tabular-nums flex items-center gap-1'>
          <Clock3 className='w-2.5 h-2.5' />
          {elapsedTimeLabel}
          {isGenerating && (
            <button
              type='button'
              onClick={onTogglePause}
              className='ml-1 p-0.5 rounded hover:bg-muted transition-colors'
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? (
                <Play className='w-3 h-3' />
              ) : (
                <Pause className='w-3 h-3' />
              )}
            </button>
          )}
        </span>
      </div>

      <div className='relative flex flex-col gap-1'>
        {entries.map((entry, idx) => {
          const isActive = entry.status === 'active';
          const isDone = entry.status === 'done';
          const isError = entry.status === 'error';
          const isWaiting = entry.status === 'waiting';

          const stageSuffix =
            isActive && entry.stage && entry.stage !== 'completed'
              ? ` — ${
                  STAGE_LABELS[entry.stage as KnownStage] ??
                  GENERATION_STAGE_LABELS[entry.stage] ??
                  entry.stage
                }`
              : '';

          return (
            <div key={idx} className='flex items-start gap-2 pl-0.5'>
              {isDone && (
                <CheckCircle2 className='w-3.5 h-3.5 text-green-500 dark:text-green-400 shrink-0 mt-0.5' />
              )}
              {isError && (
                <XCircle className='w-3.5 h-3.5 text-destructive shrink-0 mt-0.5' />
              )}
              {isActive && (
                <span className='w-3.5 h-3.5 shrink-0 mt-0.5 flex items-center justify-center'>
                  <span className='w-2 h-2 rounded-full bg-primary animate-pulse' />
                </span>
              )}
              {isWaiting && (
                <span className='w-3.5 h-3.5 shrink-0 mt-0.5 flex items-center justify-center'>
                  <span className='w-2 h-2 rounded-full bg-border' />
                </span>
              )}

              <div className='flex-1 min-w-0'>
                <span
                  className={`text-[11px] font-mono leading-tight ${
                    isActive
                      ? 'text-foreground font-semibold'
                      : isDone
                        ? 'text-muted-foreground'
                        : isError
                          ? 'text-destructive'
                          : 'text-muted-foreground/40'
                  }`}
                >
                  {entry.topic}
                  <span className='font-normal opacity-70'>
                    {' '}
                    ·{entry.questionCount}q
                  </span>
                  {stageSuffix && (
                    <span className='opacity-60'>{stageSuffix}</span>
                  )}
                </span>
                {isError && entry.errorMessage && (
                  <p className='text-[10px] text-destructive/80 mt-0.5 leading-tight truncate'>
                    {entry.errorMessage}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isGenerating && activeEntry && (
        <SubCallProgressHint
          progress={generationSubCallProgress}
          topicLabel={activeEntry.topic}
          batchMode
        />
      )}

      {activeEntry &&
        (activeEntry.stage === 'generating' ||
          activeEntry.stage === 'parsing') && (
          <div
            ref={streamRef}
            className='max-h-20 overflow-y-auto rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-[10px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap break-all'
          >
            {streamText ? (
              streamText
            ) : (
              <span className='opacity-40'>Waiting for tokens…</span>
            )}
            <span className='inline-block w-1 h-3 bg-muted-foreground/50 ml-0.5 align-middle animate-pulse' />
          </div>
        )}

      <div className='flex items-center gap-2 pt-0.5 border-t border-border/40'>
        <div className='flex-1 h-1 rounded-full bg-border overflow-hidden'>
          <div
            className='h-full rounded-full bg-primary transition-all duration-500'
            style={{
              width:
                entries.length > 0
                  ? `${((doneCount + errorCount) / entries.length) * 100}%`
                  : '0%',
            }}
          />
        </div>
        <span className='text-[10px] font-mono text-muted-foreground tabular-nums shrink-0'>
          {doneCount + errorCount}/{entries.length}
        </span>
      </div>
    </div>
  );
}
