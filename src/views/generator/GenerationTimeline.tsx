import {
  CheckCircle2,
  Clock3,
  Coins,
  DollarSign,
  Loader2,
  Pause,
  Play,
  Square,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { LlmStreamState } from '@/hooks/useLlmStreamEvents';
import { formatCostUsd } from '@/lib/app-utils';
import type {
  BatchTopicProgress,
  GenerationStatusEvent,
  GenerationSubCallProgress,
  GenerationTelemetry,
} from '@/types';
import type { CostQuality } from '@/types/events';

type TimelinePhase = 'waiting' | 'active' | 'done' | 'error';

const STAGE_ORDER = [
  'preparing',
  'generating',
  'parsing',
  'quality_check',
  'completed',
] as const;
type KnownStage = (typeof STAGE_ORDER)[number];

/** Stages emitted by the backend or client; labels for timeline and batch rows. */
const GENERATION_STAGE_LABELS: Record<string, string> = {
  preparing: 'Preparing prompt',
  generating: 'Generating',
  parsing: 'Parsing & validating',
  quality_check: 'Checking quality',
  completed: 'Complete',
  failed: 'Failed',
};

function normalizeStage(stage?: string): KnownStage {
  switch (stage) {
    case 'generating':
    case 'calling_model':
      return 'generating';
    case 'parsing':
    case 'parsing_marking':
      return 'parsing';
    case 'quality_check':
      return 'quality_check';
    case 'completed':
      return 'completed';
    case 'preparing':
    case 'allocating_subtopics':
    case 'building_prompt':
    default:
      return 'preparing';
  }
}

function phaseForStage(
  stage: KnownStage,
  currentStage: KnownStage,
  isFailed: boolean,
): TimelinePhase {
  const currentIdx = STAGE_ORDER.indexOf(currentStage);
  const thisIdx = STAGE_ORDER.indexOf(stage);
  if (isFailed && thisIdx === currentIdx) return 'error';
  if (stage === 'completed' && currentStage === 'completed') return 'done';
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
  preparing: GENERATION_STAGE_LABELS.preparing,
  generating: GENERATION_STAGE_LABELS.generating,
  parsing: GENERATION_STAGE_LABELS.parsing,
  quality_check: GENERATION_STAGE_LABELS.quality_check,
  completed: GENERATION_STAGE_LABELS.completed,
};

const STAGE_PROGRESS: Record<KnownStage, number> = {
  preparing: 12,
  generating: 42,
  parsing: 72,
  quality_check: 88,
  completed: 100,
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
  if (telemetry.reasoningTokens != null && telemetry.reasoningTokens > 0) {
    items.push({
      icon: <Coins className='w-3 h-3' />,
      label: 'Reasoning',
      value: telemetry.reasoningTokens.toLocaleString(),
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
  currentStage: KnownStage;
  isFailed: boolean;
  isGenerating: boolean;
  isDone: boolean;
}) {
  return (
    <div className='relative flex flex-col gap-1.5 pl-0.5'>
      {STAGE_ORDER.map((stage) => {
        const phase = phaseForStage(stage, currentStage, isFailed);
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

// eslint-disable-next-line complexity
function GenerationActivity({
  currentStage,
  isDone,
  isFailed,
  streamText,
  liveStream,
}: {
  currentStage: KnownStage;
  isDone: boolean;
  isFailed: boolean;
  streamText: string;
  liveStream?: LlmStreamState | null;
}) {
  const liveText = liveStream?.text ?? '';
  const outputText = liveText || streamText;
  const exactTokens = liveStream?.usage?.totalTokens;
  const reasoningTokens = liveStream?.usage?.reasoningTokens;
  const estimatedOutputTokens = Math.round(outputText.length / 4);
  const hasOutput = outputText.length > 0;
  const tokenLabel =
    exactTokens != null
      ? `${exactTokens.toLocaleString()} total tok`
      : `~${estimatedOutputTokens.toLocaleString()} output tok`;
  const reasoningLabel =
    reasoningTokens != null && reasoningTokens > 0
      ? `${reasoningTokens.toLocaleString()} reasoning`
      : null;
  const message = isFailed || liveStream?.status === 'error'
    ? 'Generation stopped. Review the error and try again.'
    : isDone
    ? 'Response received. Final checks complete.'
    : currentStage === 'generating'
      ? hasOutput
        ? 'ChatGPT is writing your questions…'
        : 'ChatGPT is working — waiting for the first response tokens…'
      : currentStage === 'parsing'
        ? 'Parsing and validating the response…'
        : currentStage === 'quality_check'
          ? 'Checking question quality and variety…'
          : 'Preparing the request…';

  return (
    <div
      className='space-y-1.5 rounded-md bg-muted/30 px-2.5 py-2'
      role='status'
      aria-live='polite'
    >
      <div className='flex items-center justify-between gap-3 text-[10px] font-mono tabular-nums'>
        <span className='min-w-0 truncate text-muted-foreground'>{message}</span>
        <span className='shrink-0 text-foreground/80'>
          {tokenLabel}
          {reasoningLabel && (
            <span className='text-muted-foreground/70'>
              {' · '}
              {reasoningLabel}
            </span>
          )}
        </span>
      </div>
      <div
        className='h-1 overflow-hidden rounded-full bg-border'
        role='progressbar'
        aria-label='Generation progress'
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={STAGE_PROGRESS[currentStage]}
      >
        <div
          className='h-full rounded-full bg-primary transition-[width] duration-300'
          style={{ width: `${STAGE_PROGRESS[currentStage]}%` }}
        />
      </div>
    </div>
  );
}

function GenerationTokenStream({
  streamText,
  currentStage,
  isGenerating,
  showRawLlmOutput,
}: {
  streamText: string;
  currentStage: string;
  isGenerating: boolean;
  showRawLlmOutput: boolean;
}) {
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streamRef.current)
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [streamText]);

  if (!showRawLlmOutput) return null;

  if (!(currentStage === 'generating' || currentStage === 'parsing'))
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
  liveStream,
}: {
  completedEvent: GenerationStatusEvent | null;
  liveStream?: LlmStreamState | null;
}) {
  if (!completedEvent) return null;
  const usage = liveStream?.usage;
  const totalTokens = completedEvent.totalTokens ?? usage?.totalTokens;
  const promptTokens = completedEvent.promptTokens ?? usage?.promptTokens;
  const completionTokens =
    completedEvent.completionTokens ?? usage?.completionTokens;
  const reasoningTokens =
    completedEvent.reasoningTokens ?? usage?.reasoningTokens;
  return (
    <div className='flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 border-t border-border/40'>
      <span className='flex items-center gap-1 text-[11px] font-mono text-muted-foreground'>
        <Coins className='w-3 h-3' />
        <span className='tabular-nums font-semibold text-foreground'>
          {totalTokens != null
            ? totalTokens.toLocaleString()
            : '?'}
        </span>
        {' tok'}
        {promptTokens != null && completionTokens != null && (
            <span className='text-muted-foreground/60'>
              {' '}
              ({promptTokens.toLocaleString()} in /{' '}
              {completionTokens.toLocaleString()} out)
            </span>
          )}
        {reasoningTokens != null && reasoningTokens > 0 && (
            <span className='text-muted-foreground/60'>
              {' '}
              ({reasoningTokens.toLocaleString()} reasoning)
            </span>
          )}
      </span>
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

// eslint-disable-next-line complexity
export function GenerationTimeline({
  generationStatus,
  generationSubCallProgress,
  generationStartedAt,
  formattedElapsedTime,
  streamText,
  isGenerating,
  isPaused,
  onTogglePause,
  onAbort,
  showRawLlmOutput = false,
  liveCostUsd,
  liveCostQuality,
  liveStream,
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
  onAbort: () => void;
  showRawLlmOutput?: boolean;
  /** Real-time cost from the unified LLM stream event system. */
  liveCostUsd?: number;
  /** Quality label for the live cost (priced, actual, estimated, unknown). */
  liveCostQuality?: CostQuality;
  /** Live stream state emitted by the ChatGPT integration. */
  liveStream?: LlmStreamState | null;
}) {
  const rawStage = generationStatus?.stage as string | undefined;
  const currentStage = normalizeStage(rawStage);
  const isFailed = rawStage === 'failed';
  const isDone = currentStage === 'completed';
  const displayStreamText = liveStream?.text || streamText;

  const completedEvent = isDone ? generationStatus : null;
  const elapsedTimeLabel = useGenerationElapsedTime({
    generationStartedAt,
    completedDurationMs: completedEvent?.durationMs,
    isGenerating,
    isPaused,
    fallback: formattedElapsedTime,
  });

  return (
    <div className='w-full px-4 py-2.5 space-y-2'>
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
            {generationStatus?.message?.trim() ||
              (isFailed
                ? 'Generation failed'
                : isDone
                  ? 'Generation complete'
                  : STAGE_LABELS[currentStage])}
          </span>
        </div>
        <span className='text-[10px] font-mono text-muted-foreground tabular-nums flex items-center gap-1'>
          <Clock3 className='w-2.5 h-2.5' />
          {elapsedTimeLabel}
          {(() => {
            const actualTokens =
              liveStream?.usage?.totalTokens ?? generationStatus?.totalTokens;
            const actualReasoningTokens =
              liveStream?.usage?.reasoningTokens ??
              generationStatus?.reasoningTokens;
            const showEstimate = isGenerating && !isDone;
            if (actualTokens == null && !showEstimate) return null;
            const tokens = actualTokens ?? Math.round(displayStreamText.length / 4);
            const isEstimate = actualTokens == null;
            return (
              <span className='flex items-center gap-1 text-[10px] font-mono tabular-nums text-muted-foreground ml-0.5'>
                <Coins className='w-2.5 h-2.5' />
                {isEstimate && (
                  <span className='text-muted-foreground/50'>~</span>
                )}
                {tokens.toLocaleString()} {isEstimate ? 'output tok' : 'tok'}
                {actualReasoningTokens != null && actualReasoningTokens > 0 && (
                  <span className='text-muted-foreground/70'>
                    {' · '}
                    {actualReasoningTokens.toLocaleString()} reasoning
                  </span>
                )}
              </span>
            );
          })()}
          {(() => {
            if (liveCostUsd == null || !isGenerating || isDone) return null;
            const qualityLabel =
              liveCostQuality && liveCostQuality !== 'unknown'
                ? ` (${liveCostQuality})`
                : '';
            return (
              <span className='flex items-center gap-1 text-[10px] font-mono tabular-nums text-muted-foreground ml-0.5'>
                <DollarSign className='w-2.5 h-2.5' />
                <span className='tabular-nums font-semibold text-foreground'>
                  {formatCostUsd(liveCostUsd)}
                </span>
                <span className='text-muted-foreground/50'>
                  {qualityLabel}
                </span>
              </span>
            );
          })()}
          {isGenerating && (
            <div className='flex items-center gap-0.5 ml-1'>
              <button
                type='button'
                onClick={onTogglePause}
                className='p-0.5 rounded hover:bg-muted transition-colors'
                title={isPaused ? 'Resume' : 'Pause'}
              >
                {isPaused ? (
                  <Play className='w-3 h-3' />
                ) : (
                  <Pause className='w-3 h-3' />
                )}
              </button>
              <button
                type='button'
                onClick={onAbort}
                className='p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground'
                title='Abort Generation'
              >
                <Square className='w-3 h-3 fill-current' />
              </button>
            </div>
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

      <GenerationActivity
        currentStage={currentStage}
        isDone={isDone}
        isFailed={isFailed}
        streamText={streamText}
        liveStream={liveStream}
      />

      <GenerationTokenStream
        streamText={displayStreamText}
        currentStage={currentStage}
        isGenerating={isGenerating}
        showRawLlmOutput={showRawLlmOutput}
      />

      {isDone && (
        <CompletedStats
          completedEvent={completedEvent}
          liveStream={liveStream}
        />
      )}
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
  onAbort,
  showRawLlmOutput = false,
  liveStream,
}: {
  entries: BatchTopicProgress[];
  generationSubCallProgress?: GenerationSubCallProgress | null;
  generationStartedAt?: number | null;
  formattedElapsedTime: string;
  streamText: string;
  isGenerating: boolean;
  isPaused: boolean;
  onTogglePause: () => void;
  onAbort: () => void;
  showRawLlmOutput?: boolean;
  liveStream?: LlmStreamState | null;
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
  const currentStage = normalizeStage(activeEntry?.stage);
  const displayStreamText = liveStream?.text || streamText;
  const elapsedTimeLabel = useGenerationElapsedTime({
    generationStartedAt,
    isGenerating,
    isPaused,
    fallback: formattedElapsedTime,
  });

  return (
    <div className='w-full px-4 py-2.5 space-y-2'>
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
                ? liveStream?.status === 'active'
                  ? `ChatGPT is generating ${activeEntry.topic} (${activeEntry.questionCount}q)…`
                  : `Preparing ${activeEntry.topic} (${activeEntry.questionCount}q)…`
                : 'Starting…'
              : allDone && errorCount === 0
                ? `Done — ${entries.length} subjects complete`
                : `${errorCount} subject${errorCount !== 1 ? 's' : ''} failed`}
          </span>
        </div>
        <span className='text-[10px] font-mono text-muted-foreground tabular-nums flex items-center gap-1'>
          <Clock3 className='w-2.5 h-2.5' />
          {elapsedTimeLabel}
          {(() => {
            const actualTokens = liveStream?.usage?.totalTokens;
            const actualReasoningTokens = liveStream?.usage?.reasoningTokens;
            const showEstimate = isGenerating;
            if (actualTokens == null && !showEstimate) return null;
            const tokens =
              actualTokens ?? Math.round(displayStreamText.length / 4);
            return (
              <span className='flex items-center gap-1 text-[10px] font-mono tabular-nums text-muted-foreground ml-0.5'>
                <Coins className='w-2.5 h-2.5' />
                {actualTokens == null && (
                  <span className='text-muted-foreground/50'>~</span>
                )}
                {tokens.toLocaleString()}{' '}
                {actualTokens == null ? 'output tok' : 'tok'}
                {actualReasoningTokens != null && actualReasoningTokens > 0 && (
                  <span className='text-muted-foreground/70'>
                    {' · '}
                    {actualReasoningTokens.toLocaleString()} reasoning
                  </span>
                )}
              </span>
            );
          })()}
          {isGenerating && (
            <div className='flex items-center gap-0.5 ml-1'>
              <button
                type='button'
                onClick={onTogglePause}
                className='p-0.5 rounded hover:bg-muted transition-colors'
                title={isPaused ? 'Resume' : 'Pause'}
              >
                {isPaused ? (
                  <Play className='w-3 h-3' />
                ) : (
                  <Pause className='w-3 h-3' />
                )}
              </button>
              <button
                type='button'
                onClick={onAbort}
                className='p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground'
                title='Abort Generation'
              >
                <Square className='w-3 h-3 fill-current' />
              </button>
            </div>
          )}
        </span>
      </div>

      <div className='relative flex flex-col gap-1'>
        {entries.map((entry, idx) => {
          const isActive = entry.status === 'active';
          const isDone = entry.status === 'done';
          const isError = entry.status === 'error';
          const isWaiting = entry.status === 'waiting';

          const entryStage = normalizeStage(entry.stage);
          const stageLabel =
            entry.stage && entryStage !== 'completed'
              ? STAGE_LABELS[entryStage]
              : undefined;
          const stageSuffix =
            isActive && stageLabel ? ` — ${stageLabel}` : '';

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

      <GenerationActivity
        currentStage={currentStage}
        isDone={allDone && errorCount === 0}
        isFailed={errorCount > 0}
        streamText={streamText}
        liveStream={liveStream}
      />

      {isGenerating && activeEntry && (
        <SubCallProgressHint
          progress={generationSubCallProgress}
          topicLabel={activeEntry.topic}
          batchMode
        />
      )}

      {activeEntry &&
        (currentStage === 'generating' || currentStage === 'parsing') &&
        showRawLlmOutput && (
          <div
            ref={streamRef}
            className='max-h-20 overflow-y-auto rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-[10px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap break-all'
          >
            {displayStreamText ? (
              displayStreamText
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
