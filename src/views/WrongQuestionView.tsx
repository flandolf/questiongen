import { useVirtualizer } from '@tanstack/react-virtual';
import { invoke } from '@tauri-apps/api/core';
import {
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  PlusCircle,
  RotateCcw,
  Share2,
  Shuffle,
  Target,
  Trash,
  Trash2,
  Trophy,
  XCircle,
} from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { EmptyState } from '@/components/EmptyState';
import {
  FilterButton,
  FilterGroup,
  PageContainer,
  PageHeader,
  Toolbar,
} from '@/components/layout/primitives';
import { MarkdownMath } from '@/components/MarkdownMath';
import { UnifiedMcqOptionsGrid } from '@/components/question/UnifiedQuestionBlocks';
import { TutorPanel } from '@/components/tutor/TutorPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fileToDataUrl, normalizeMarkResponse } from '@/lib/app-utils';
import { daysUntilReview, isDue } from '@/lib/spaced-repetition';
import { useAppStore } from '@/store';
// --- Generator parity reattempt view (restored full UI) ---
import type {
  Difficulty,
  ExportQuestionToAnkiResponse,
  MarkAnswerResponse,
  McHistoryEntry,
  QuestionHistoryEntry,
  SpacedRepetitionCard,
  StudentAnswerImage,
} from '@/types';
import { McAnswerCard, McSketchpadPanel } from '@/views/generator/McAnswerCard';
import { QuestionSplitLayout } from '@/views/generator/QuestionSplitLayout';
import { WrittenAnswerCard } from '@/views/generator/WrittenAnswerCard';
import { WrittenFeedbackPanel } from '@/views/generator/WrittenFeedbackPanel';

import { SessionHeader } from './generator/SessionHeader';
// ─── Types ────────────────────────────────────────────────────────────────────

type WrittenWrongEntry = QuestionHistoryEntry & { kind: 'written' };
type McWrongEntry = McHistoryEntry & { kind: 'multiple-choice' };
type WrongEntry = WrittenWrongEntry | McWrongEntry;
type ViewMode = 'list' | 'reattempt' | 'summary';
type ReattemptResult = { id: string; correct: boolean; timeSeconds: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function scoreBg(pct: number) {
  if (pct >= 0.75)
    return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400';
  if (pct >= 0.5)
    return 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400';
  return 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400';
}

function criterionScoreClass(pct: number) {
  if (pct >= 1)
    return 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300';
  if (pct >= 0.5)
    return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300';
  return 'bg-rose-100/70 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400';
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

// Use shared EmptyState component for consistent appearance across views

// ─── List entry card ──────────────────────────────────────────────────────────

const ListEntryCard = memo(function ListEntryCard({
  entry,
  index,
  isExpanded,
  onToggle,
  onDelete,
  onExport,
  onReattempt,
  srCard,
}: {
  entry: WrongEntry;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onExport: () => void;
  onReattempt: () => void;
  srCard?: SpacedRepetitionCard;
}) {
  const isWritten = entry.kind === 'written';
  let scoreLabel = '';
  let pct = 0;
  if (entry.kind === 'written') {
    const w = entry;
    pct =
      w.markResponse.maxMarks > 0
        ? w.markResponse.achievedMarks / w.markResponse.maxMarks
        : 0;
    scoreLabel = `${w.markResponse.achievedMarks}/${w.markResponse.maxMarks}`;
  }

  return (
    <div className='rounded-sm border border-border/50 overflow-hidden transition-shadow hover:shadow-md bg-muted/30'>
      <div className='flex items-stretch'>
        <button
          type='button'
          className='flex-1 text-left px-3.5 py-3 flex items-start gap-3 group min-w-0'
          onClick={onToggle}
        >
          <span className='shrink-0 w-5 h-5 mt-0.5 rounded-sm bg-muted/60 flex items-center justify-center text-[10px] font-bold text-muted-foreground tabular-nums'>
            {index + 1}
          </span>
          <div className='flex-1 min-w-0 space-y-1'>
            <div className='flex flex-wrap items-center gap-1'>
              <Badge
                variant='outline'
                className={`text-[10px] font-semibold px-1.5 py-0 gap-0.5 ${isWritten ? 'border-sky-400/40 text-sky-600 dark:text-sky-400' : 'border-violet-400/40 text-violet-600 dark:text-violet-400'}`}
              >
                {isWritten ? (
                  <BookOpen className='w-2.5 h-2.5' />
                ) : (
                  <Target className='w-2.5 h-2.5' />
                )}
                {isWritten ? 'Written' : 'MC'}
              </Badge>
              <Badge
                variant='outline'
                className='text-[10px] px-1.5 py-0 font-medium text-muted-foreground'
              >
                {entry.question.topic}
              </Badge>
              {entry.question.subtopic && (
                <span className='text-[10px] text-muted-foreground/50 truncate max-w-32'>
                  {entry.question.subtopic}
                </span>
              )}
            </div>
            <div className='py-3 overflow-hidden relative'>
              <div className='text-sm leading-relaxed text-foreground prose prose-sm dark:prose-invert max-w-none'>
                <MarkdownMath content={entry.question.promptMarkdown} />
              </div>
              <div className='absolute bottom-0 inset-x-0 h-5 bg-linear-to-t pointer-events-none' />
            </div>
          </div>
          <div className='shrink-0 flex items-center gap-1.5 ml-1 pt-0.5'>
            {srCard && (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-sm border ${
                  daysUntilReview(srCard) < 0
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                    : daysUntilReview(srCard) === 0
                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                      : 'bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400'
                }`}
              >
                {daysUntilReview(srCard) < 0
                  ? `${Math.abs(daysUntilReview(srCard))}d overdue`
                  : daysUntilReview(srCard) === 0
                    ? 'Due'
                    : `${daysUntilReview(srCard)}d`}
              </span>
            )}
            {isWritten && scoreLabel && (
              <span
                className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-sm border ${scoreBg(pct)}`}
              >
                {scoreLabel}
              </span>
            )}
            {!isWritten && (
              <span className='text-xs font-bold px-2 py-0.5 rounded-sm border bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'>
                ✗
              </span>
            )}
            <div className='text-muted-foreground group-hover:text-foreground transition-colors'>
              {isExpanded ? (
                <ChevronUp className='w-4 h-4' />
              ) : (
                <ChevronDown className='w-4 h-4' />
              )}
            </div>
          </div>
        </button>
        <button
          type='button'
          onClick={(e) => {
            e.stopPropagation();
            onExport();
          }}
          className='shrink-0 flex items-center justify-center w-8 border-l border-border/30 text-muted-foreground/40 hover:text-primary hover:bg-primary/5 transition-colors'
          aria-label='Export to Anki'
          title='Export to Anki'
        >
          <Share2 className='w-3.5 h-3.5' />
        </button>
        <button
          type='button'
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className='shrink-0 flex items-center justify-center w-8 border-l border-border/30 text-muted-foreground/40 hover:text-rose-500 hover:bg-rose-500/5 transition-colors'
          aria-label='Delete entry'
          title='Remove from wrong answers'
        >
          <Trash2 className='w-3.5 h-3.5' />
        </button>
      </div>
      {isExpanded && (
        <div className='border-t border-border/40 px-4 py-4 animate-in fade-in slide-in-from-top-1 duration-200'>
          {entry.kind === 'written' ? (
            <WrittenExpandedBody entry={entry} />
          ) : (
            <McExpandedBody entry={entry} />
          )}
          <div className='flex justify-end mt-3'>
            <Button
              size='sm'
              variant='outline'
              className='gap-1.5'
              onClick={onReattempt}
            >
              <RotateCcw className='w-3.5 h-3.5' />
              Reattempt this question
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
export function VirtualizedWrongList({
  entries,
  expandedIds,
  onToggle,
  onDelete,
  onExport,
  onReattempt,
  spacedRepetitionCards,
}: {
  entries: WrongEntry[];
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onDelete: (entry: WrongEntry) => void;
  onExport: (entry: WrongEntry) => void;
  onReattempt: (entry: WrongEntry) => void;
  spacedRepetitionCards: Record<string, SpacedRepetitionCard>;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const setIdsKey = useMemo(
    () => entries.map((s) => s.id).join('|'),
    [entries],
  );
  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => entries[index]?.id ?? index,
    estimateSize: () => 120,
    overscan: 4,
  });

  // Reset scroll to top when entries change
  useEffect(() => {
    rowVirtualizer.scrollToIndex(0);
  }, [setIdsKey, rowVirtualizer]);

  // Re-measure in layout phase when item identities/order change.
  useLayoutEffect(() => {
    rowVirtualizer.measure();
    const rafId = requestAnimationFrame(() => {
      rowVirtualizer.measure();
    });
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [setIdsKey, rowVirtualizer]);

  return (
    <div ref={parentRef} className='flex-1 overflow-auto min-h-0'>
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const entry = entries[virtualRow.index];
          return (
            <div
              key={entry.id}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                paddingBottom: 16,
              }}
            >
              <ListEntryCard
                entry={entry}
                index={virtualRow.index}
                isExpanded={expandedIds.has(entry.id)}
                onToggle={() => onToggle(entry.id)}
                onDelete={() => onDelete(entry)}
                onExport={() => onExport(entry)}
                onReattempt={() => onReattempt(entry)}
                srCard={spacedRepetitionCards[entry.id]}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── List view: expanded bodies ───────────────────────────────────────────────

function WrittenExpandedBody({ entry }: { entry: WrittenWrongEntry }) {
  return (
    <div className='space-y-4'>
      <div className='grid sm:grid-cols-2 gap-3'>
        <div className='space-y-1.5'>
          <p className='text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60'>
            Your answer
          </p>
          <div className='rounded-sm border border-border/40 bg-muted/20 px-3.5 py-3 text-sm whitespace-pre-line leading-relaxed h-full min-h-20'>
            {entry.uploadedAnswer?.trim() || (
              <span className='italic text-muted-foreground/50'>
                No text answer
              </span>
            )}
          </div>
        </div>
        <div className='space-y-1.5'>
          <p className='text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60'>
            Worked solution
          </p>
          <div className='rounded-sm border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-3 text-sm prose prose-sm dark:prose-invert max-w-none h-full min-h-20'>
            <MarkdownMath
              content={
                entry.workedSolutionMarkdown || 'No worked solution available.'
              }
            />
          </div>
        </div>
      </div>
      <div className='space-y-1.5'>
        <p className='text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60'>
          Feedback
        </p>
        <div className='rounded-sm border border-border/40 bg-muted/10 px-3.5 py-3 text-sm prose prose-sm dark:prose-invert max-w-none'>
          <MarkdownMath
            content={
              entry.markResponse.feedbackMarkdown || 'No feedback available.'
            }
          />
        </div>
      </div>
      {entry.markResponse.vcaaMarkingScheme?.length > 0 && (
        <div className='space-y-1.5'>
          <p className='text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60'>
            Marking scheme
          </p>
          <div className='divide-y divide-border/30 rounded-sm border border-border/40 overflow-hidden'>
            {entry.markResponse.vcaaMarkingScheme.map((c, i) => {
              const p = c.maxMarks > 0 ? c.achievedMarks / c.maxMarks : 0;
              return (
                <div
                  key={i}
                  className={`flex items-start gap-3 px-3.5 py-2.5 text-sm ${p >= 1 ? 'bg-emerald-500/5' : 'bg-rose-500/5'}`}
                >
                  <span
                    className={`shrink-0 font-bold text-xs mt-0.5 px-1.5 py-0.5 rounded-sm ${criterionScoreClass(p)}`}
                  >
                    {c.achievedMarks}/{c.maxMarks}
                  </span>
                  <span className='text-foreground/80 leading-snug'>
                    <MarkdownMath content={c.criterion} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function McExpandedBody({ entry }: { entry: McWrongEntry }) {
  return (
    <div className='space-y-4'>
      <UnifiedMcqOptionsGrid
        options={entry.question.options}
        selectedAnswer={entry.selectedAnswer}
        correctAnswer={entry.question.correctAnswer}
        answered
        revealCorrectness
        onSelect={undefined}
      />
      <div className='space-y-1.5'>
        <p className='text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60'>
          Explanation
        </p>
        <div className='rounded-sm border border-border/40 bg-muted/10 px-3.5 py-3 text-sm prose prose-sm dark:prose-invert max-w-none'>
          <MarkdownMath content={entry.question.explanationMarkdown} />
        </div>
      </div>
    </div>
  );
}

// ─── Per-question saved state ─────────────────────────────────────────────────

interface WrittenQuestionState {
  writtenAnswer: string;
  image: StudentAnswerImage | undefined;
  feedback: MarkAnswerResponse | null;
  markingScheme: MarkAnswerResponse['vcaaMarkingScheme'] | null;
  appealText: string;
  overrideInput: string;
  result: ReattemptResult | null;
  timeSeconds: number;
}

interface McQuestionState {
  selectedAnswer: string;
  awardedMarks: number | undefined;
  mcAppealText: string;
  mcOverrideInput: string;
  mcSketchpadActive: boolean;
  result: ReattemptResult | null;
  timeSeconds: number;
}

type QuestionState = WrittenQuestionState | McQuestionState;

// ─── Reattempt view ───────────────────────────────────────────────────────────

interface ReattemptViewProps {
  questions: WrongEntry[];
  apiKey: string;
  model: string;
  onExit: (results: ReattemptResult[]) => void;
  onDelete: (entry: WrongEntry) => void;
  onMarkCorrect: (entry: WrongEntry) => void;
}
function ReattemptView({
  questions,
  apiKey,
  model,
  onExit,
  onDelete,
  onMarkCorrect,
}: ReattemptViewProps) {
  const [idx, setIdx] = useState<number>(0);
  const [results, setResults] = useState<ReattemptResult[]>([]);
  // Per-question state snapshots keyed by question id
  const [savedStates, setSavedStates] = useState<Record<string, QuestionState>>(
    {},
  );
  // Per-question timing: start timestamp for current question
  const [questionStartedAt, setQuestionStartedAt] = useState<number>(() =>
    Date.now(),
  );

  // Live question timer with pause support
  const [questionElapsed, setQuestionElapsed] = useState<number>(0);
  const questionPausedDurationMsRef = useRef<number>(0);
  const questionPauseStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const inProgressPause = questionPauseStartedAtRef.current
        ? now - questionPauseStartedAtRef.current
        : 0;
      const effectiveElapsed =
        now -
        questionStartedAt -
        (questionPausedDurationMsRef.current + inProgressPause);
      setQuestionElapsed(Math.max(0, Math.round(effectiveElapsed / 1000)));
    }, 1_000);
    return () => clearInterval(id);
  }, [questionStartedAt]);

  // Pause timer when tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        questionPauseStartedAtRef.current = Date.now();
      } else {
        if (questionPauseStartedAtRef.current) {
          questionPausedDurationMsRef.current +=
            Date.now() - questionPauseStartedAtRef.current;
        }
        questionPauseStartedAtRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const toggleQuestionPause = useCallback(() => {
    if (!questionPauseStartedAtRef.current) {
      questionPauseStartedAtRef.current = Date.now();
    } else {
      questionPausedDurationMsRef.current +=
        Date.now() - questionPauseStartedAtRef.current;
      questionPauseStartedAtRef.current = null;
    }
  }, []);

  const resetQuestionTimer = useCallback(() => {
    setQuestionStartedAt(Date.now());
    questionPausedDurationMsRef.current = 0;
    questionPauseStartedAtRef.current = null;
    setQuestionElapsed(0);
  }, []);

  const entry = questions[idx];
  const isWritten = entry.kind === 'written';
  const writtenEntry = isWritten ? entry : null;
  const isLast = idx === questions.length - 1;
  const completedCount = results.filter((r) => r.correct).length;
  const sketchSessionKey = useMemo(() => {
    const mode = entry.kind === 'written' ? 'written' : 'multiple-choice';
    return `wrong-${mode}-${entry.id}`;
  }, [entry]);

  const [writtenSketchpadActive, setWrittenSketchpadActive] = useState(false);

  // Session timer
  const [startedAt] = useState(() => Date.now());

  // --- Written state ---
  const [writtenAnswer, setWrittenAnswer] = useState<string>('');
  const [image, setImage] = useState<StudentAnswerImage | undefined>(undefined);
  const [isMarking, setIsMarking] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<MarkAnswerResponse | null>(null);
  const [markingScheme, setMarkingScheme] = useState<
    MarkAnswerResponse['vcaaMarkingScheme'] | null
  >(null);
  const [appealText, setAppealText] = useState<string>('');
  const [overrideInput, setOverrideInput] = useState<string>('');
  const activeFeedback = isWritten ? feedback : null;

  // --- MC state ---
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  const [awardedMarks, setAwardedMarks] = useState<number | undefined>(
    undefined,
  );
  const [mcAppealText, setMcAppealText] = useState<string>('');
  const [mcOverrideInput, setMcOverrideInput] = useState<string>('');
  const [mcSketchpadActive, setMcSketchpadActive] = useState(false);

  // --- Save current question state before leaving it ---
  const saveCurrentState = useCallback(() => {
    const currentEntry = questions[idx];
    if (!currentEntry) return;
    const now = Date.now();
    const inProgressPause = questionPauseStartedAtRef.current
      ? now - questionPauseStartedAtRef.current
      : 0;
    const effectiveElapsed =
      now -
      questionStartedAt -
      (questionPausedDurationMsRef.current + inProgressPause);
    const qElapsed = Math.max(0, Math.floor(effectiveElapsed / 1000));
    const existing = savedStates[currentEntry.id];
    const totalTime = (existing?.timeSeconds ?? 0) + qElapsed;
    const state: QuestionState =
      currentEntry.kind === 'written'
        ? {
            writtenAnswer,
            image,
            feedback,
            markingScheme,
            appealText,
            overrideInput,
            result: results.find((r) => r.id === currentEntry.id) ?? null,
            timeSeconds: totalTime,
          }
        : {
            selectedAnswer,
            awardedMarks,
            mcAppealText,
            mcOverrideInput,
            mcSketchpadActive,
            result: results.find((r) => r.id === currentEntry.id) ?? null,
            timeSeconds: totalTime,
          };
    setSavedStates((prev) => ({ ...prev, [currentEntry.id]: state }));
  }, [
    idx,
    questions,
    writtenAnswer,
    image,
    feedback,
    markingScheme,
    appealText,
    overrideInput,
    selectedAnswer,
    awardedMarks,
    mcAppealText,
    mcOverrideInput,
    mcSketchpadActive,
    results,
    questionStartedAt,
    savedStates,
  ]);

  // --- Restore state for a question ---
  const restoreState = useCallback(
    (entryId: string) => {
      const state = savedStates[entryId];
      if (!state) {
        // Fresh question - reset everything
        setMcAppealText('');
        setMcOverrideInput('');
        setMcSketchpadActive(false);
        return;
      }
      if ('writtenAnswer' in state) {
        setWrittenAnswer(state.writtenAnswer);
        setImage(state.image);
        setFeedback(state.feedback);
        setMarkingScheme(state.markingScheme);
        setAppealText(state.appealText);
        setOverrideInput(state.overrideInput);
      } else {
        setSelectedAnswer(state.selectedAnswer);
        setAwardedMarks(state.awardedMarks);
        setMcAppealText(state.mcAppealText);
        setMcOverrideInput(state.mcOverrideInput);
        setMcSketchpadActive(state.mcSketchpadActive);
      }
    },
    [savedStates],
  );

  // --- Determine correctness for current question ---
  const getCurrentResult = (): ReattemptResult => {
    const existing = savedStates[entry.id];
    const now = Date.now();
    const inProgressPause = questionPauseStartedAtRef.current
      ? now - questionPauseStartedAtRef.current
      : 0;
    const effectiveElapsed =
      now -
      questionStartedAt -
      (questionPausedDurationMsRef.current + inProgressPause);
    const qElapsed = Math.max(0, Math.floor(effectiveElapsed / 1000));
    const timeSeconds = (existing?.timeSeconds ?? 0) + qElapsed;
    if (isWritten) {
      if (!feedback) return { id: entry.id, correct: false, timeSeconds };
      const max = feedback.maxMarks ?? writtenEntry?.question.maxMarks ?? 0;
      return {
        id: entry.id,
        correct: max > 0 ? feedback.achievedMarks >= max : false,
        timeSeconds,
      };
    } else {
      const correctAnswer = entry.question.correctAnswer;
      return {
        id: entry.id,
        correct: selectedAnswer === correctAnswer,
        timeSeconds,
      };
    }
  };

  // --- Marking logic (written) ---
  const doMark = async () => {
    if (!writtenEntry) return;
    setIsMarking(true);
    try {
      const raw = await invoke('mark_answer', {
        request: {
          question: writtenEntry.question,
          studentAnswer: writtenAnswer,
          studentAnswerImageDataUrl: image?.dataUrl,
          model,
          apiKey,
        },
      });
      const resp = normalizeMarkResponse(raw, writtenEntry.question.maxMarks);
      setFeedback(resp);
      setOverrideInput(String(resp.achievedMarks));
      setMarkingScheme(
        resp.vcaaMarkingScheme ? [...resp.vcaaMarkingScheme] : null,
      );
    } catch {
      // Optionally show error
    } finally {
      setIsMarking(false);
    }
  };
  const handleApplyOverride = () => {
    if (!feedback) return;
    const marks = Number(overrideInput);
    setFeedback({ ...feedback, achievedMarks: marks });
  };

  // --- Interactive rubric logic ---
  const handleCriterionChange = (
    cIdx: number,
    achievedMarks: number,
    rationale: string,
  ) => {
    if (!feedback || !markingScheme) return;
    const updated = markingScheme.map((c, i) =>
      i === cIdx ? { ...c, achievedMarks, rationale } : c,
    );
    setMarkingScheme(updated);
    const totalAchieved = updated.reduce(
      (sum, c) => sum + (c.achievedMarks || 0),
      0,
    );
    setFeedback({
      ...feedback,
      achievedMarks: totalAchieved,
      vcaaMarkingScheme: updated,
    });
    setOverrideInput(String(totalAchieved));
  };

  // --- MC logic ---
  const handleSelectAnswer = (label: string) => {
    if (entry.kind !== 'multiple-choice') return;
    setSelectedAnswer(label);
    const correct = label === entry.question.correctAnswer;
    setAwardedMarks(correct ? 1 : 0);
  };
  const handleApplyMcOverride = () => {
    const marks = Number(mcOverrideInput);
    setAwardedMarks(marks);
  };

  // --- Navigation logic ---
  const handlePrev = () => {
    saveCurrentState();
    const prevIdx = Math.max(0, idx - 1);
    setIdx(prevIdx);
    restoreState(questions[prevIdx].id);
    setQuestionStartedAt(Date.now());
    questionPausedDurationMsRef.current = 0;
    questionPauseStartedAtRef.current = null;
  };
  const handleExit = () => {
    saveCurrentState();
    // Build final results from current state + saved states
    const resultMap = new Map<string, ReattemptResult>();
    // Add previously stored results
    for (const r of results) resultMap.set(r.id, r);
    // Add current question result
    const currentResult = getCurrentResult();
    resultMap.set(currentResult.id, currentResult);
    // Add any saved state results that have been answered
    for (const [id, state] of Object.entries(savedStates)) {
      if (state.result && !resultMap.has(id)) {
        resultMap.set(id, { ...state.result, timeSeconds: state.timeSeconds });
      }
    }
    onExit(Array.from(resultMap.values()));
  };
  const handleDeleteCurrent = () => {
    onDelete(entry);
    handleNext(null);
  };

  // --- Advance logic ---
  const handleNext = (result: ReattemptResult | null) => {
    const actualResult = result ?? getCurrentResult();
    // Save current state before advancing
    saveCurrentState();
    // Merge result
    const merged = actualResult
      ? [...results.filter((r) => r.id !== entry.id), actualResult]
      : results;
    if (actualResult?.correct) onMarkCorrect(entry);
    if (isLast) {
      onExit(merged);
      return;
    }
    setResults(merged);
    const nextIdx = idx + 1;
    setIdx(nextIdx);
    // Restore or reset next question state
    restoreState(questions[nextIdx].id);
    setQuestionStartedAt(Date.now());
    questionPausedDurationMsRef.current = 0;
    questionPauseStartedAtRef.current = null;
  };

  function getDifficultyBadgeClasses(level: Difficulty) {
    switch (level) {
      case 'Essential Skills':
        return 'border-green-300 bg-green-50 text-green-800 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-200';
      case 'Easy':
        return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200';
      case 'Medium':
        return 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200';
      case 'Hard':
        return 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200';
      case 'Extreme':
        return 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200';
      default:
        return '';
    }
  }

  // --- Per-question UI ---
  return (
    <div className='flex flex-col h-full'>
      {isWritten && (
        <SessionHeader
          type='written'
          questionIndex={idx}
          totalQuestions={questions.length}
          completedCount={completedCount}
          topic={entry.question.topic}
          difficulty={entry.difficulty ?? 'Medium'}
          maxMarks={isWritten ? entry.question.maxMarks : undefined}
          techAllowed={entry.question.techAllowed}
          isMathTopic={false}
          isAtLast={isLast}
          canAdvance={true}
          generationStartedAt={startedAt}
          telemetry={null}
          questionTimeSeconds={questionElapsed}
          isPaused={Boolean(questionPauseStartedAtRef.current)}
          onTogglePause={toggleQuestionPause}
          onResetTimer={resetQuestionTimer}
          questionMarks={isWritten ? entry.question.maxMarks : undefined}
          onPrev={handlePrev}
          onNext={() => handleNext(null)}
          onExit={handleExit}
          getDifficultyBadgeClasses={getDifficultyBadgeClasses}
          onDelete={handleDeleteCurrent}
        />
      )}
      {!isWritten && (
        <SessionHeader
          type='mc'
          questionIndex={idx}
          totalQuestions={questions.length}
          completedCount={completedCount}
          topic={entry.question.topic}
          difficulty={entry.difficulty ?? 'Medium'}
          maxMarks={1}
          techAllowed={entry.question.techAllowed}
          isMathTopic={false}
          isAtLast={isLast}
          canAdvance={selectedAnswer !== ''}
          generationStartedAt={startedAt}
          telemetry={null}
          questionTimeSeconds={questionElapsed}
          isPaused={Boolean(questionPauseStartedAtRef.current)}
          onTogglePause={toggleQuestionPause}
          onResetTimer={resetQuestionTimer}
          questionMarks={1}
          onPrev={handlePrev}
          onNext={() => handleNext(null)}
          onExit={handleExit}
          getDifficultyBadgeClasses={getDifficultyBadgeClasses}
          onDelete={handleDeleteCurrent}
        />
      )}

      <div className='flex-1 overflow-y-auto'>
        <div className='mx-auto w-full max-w-8xl px-4 sm:px-6 lg:px-8 xl:px-12 py-4 sm:py-6 lg:py-8'>
          {isWritten ? (
            activeFeedback ? (
              <div className='animate-in fade-in slide-in-from-bottom-2 duration-400'>
                <WrittenFeedbackPanel
                  questionId={entry.id}
                  promptMarkdown={entry.question.promptMarkdown}
                  answer={writtenAnswer}
                  image={image}
                  feedback={
                    (feedback && markingScheme
                      ? { ...feedback, vcaaMarkingScheme: markingScheme }
                      : feedback) as MarkAnswerResponse
                  }
                  appealText={appealText}
                  overrideInput={overrideInput}
                  isMarking={isMarking}
                  onAppealChange={setAppealText}
                  onOverrideInputChange={setOverrideInput}
                  onArgueForMark={() => {}}
                  onApplyOverride={handleApplyOverride}
                  onCriterionChange={handleCriterionChange}
                />
              </div>
            ) : (
              <QuestionSplitLayout
                mode='written'
                sketchpadActive={writtenSketchpadActive}
                leftSlot={
                  <MarkdownMath content={entry.question.promptMarkdown} />
                }
                rightSlot={
                  <WrittenAnswerCard
                    questionId={entry.id}
                    sketchSessionKey={sketchSessionKey}
                    answer={writtenAnswer}
                    image={image}
                    isMarking={isMarking}
                    canSubmit={writtenAnswer.trim().length > 0 || !!image}
                    onAnswerChange={setWrittenAnswer}
                    onImageDrop={(files) => {
                      void fileToDataUrl(files[0]).then((dataUrl) =>
                        setImage({
                          id: crypto.randomUUID(),
                          timestamp: new Date().toISOString(),
                          dataUrl,
                        }),
                      );
                    }}
                    onImageRemove={() => setImage(undefined)}
                    onSubmit={() => void doMark()}
                    onSketchpadActiveChange={setWrittenSketchpadActive}
                  />
                }
              />
            )
          ) : (
            <QuestionSplitLayout
              mode='mc'
              sketchpadActive={mcSketchpadActive}
              leftSlot={
                <div className='space-y-5'>
                  <div className='p-6 bg-muted/20 rounded-md space-y-2'>
                    <h1 className='text-xl font-bold'>Question {idx + 1}</h1>
                    <MarkdownMath content={entry.question.promptMarkdown} />
                  </div>
                  {mcSketchpadActive && (
                    <div className='min-w-0'>
                      <McAnswerCard
                        options={entry.question.options}
                        correctAnswer={entry.question.correctAnswer}
                        explanationMarkdown={entry.question.explanationMarkdown}
                        selectedAnswer={selectedAnswer}
                        awardedMarks={awardedMarks}
                        appealText={mcAppealText}
                        overrideInput={mcOverrideInput}
                        isMarking={false}
                        hideCorrectAnswer={false}
                        onSelectAnswer={handleSelectAnswer}
                        onAppealChange={setMcAppealText}
                        onOverrideInputChange={setMcOverrideInput}
                        onArgueForMark={() => {}}
                        onApplyOverride={handleApplyMcOverride}
                        isSketchpadOpen={mcSketchpadActive}
                        onToggleSketchpad={() =>
                          setMcSketchpadActive((v) => !v)
                        }
                        onImageDrop={(files) => {
                          void fileToDataUrl(files[0]).then((dataUrl) =>
                            setImage({
                              id: crypto.randomUUID(),
                              timestamp: new Date().toISOString(),
                              dataUrl,
                            }),
                          );
                        }}
                        onImageRemove={() => setImage(undefined)}
                        renderSketchpadInline={false}
                      />
                    </div>
                  )}
                </div>
              }
              rightSlot={
                mcSketchpadActive ? (
                  <McSketchpadPanel
                    questionId={entry.id}
                    sketchSessionKey={sketchSessionKey}
                    onImageDrop={(files) => {
                      void fileToDataUrl(files[0]).then((dataUrl) =>
                        setImage({
                          id: crypto.randomUUID(),
                          timestamp: new Date().toISOString(),
                          dataUrl,
                        }),
                      );
                    }}
                    onImageRemove={() => setImage(undefined)}
                  />
                ) : (
                  <McAnswerCard
                    options={entry.question.options}
                    correctAnswer={entry.question.correctAnswer}
                    explanationMarkdown={entry.question.explanationMarkdown}
                    selectedAnswer={selectedAnswer}
                    awardedMarks={awardedMarks}
                    appealText={mcAppealText}
                    overrideInput={mcOverrideInput}
                    isMarking={false}
                    hideCorrectAnswer={false}
                    onSelectAnswer={handleSelectAnswer}
                    onAppealChange={setMcAppealText}
                    onOverrideInputChange={setMcOverrideInput}
                    onArgueForMark={() => {}}
                    onApplyOverride={handleApplyMcOverride}
                    isSketchpadOpen={mcSketchpadActive}
                    onToggleSketchpad={() => setMcSketchpadActive((v) => !v)}
                    onImageDrop={(files) => {
                      void fileToDataUrl(files[0]).then((dataUrl) =>
                        setImage({
                          id: crypto.randomUUID(),
                          timestamp: new Date().toISOString(),
                          dataUrl,
                        }),
                      );
                    }}
                    onImageRemove={() => setImage(undefined)}
                  />
                )
              }
            />
          )}
        </div>
      </div>
      <TutorPanel
        questionId={entry.id}
        contextPrompt={entry.question.promptMarkdown}
        studentAnswer={isWritten ? writtenAnswer : selectedAnswer}
        image={image}
        sketchSessionKey={sketchSessionKey}
      />
    </div>
  );
}

// ─── Summary screen ───────────────────────────────────────────────────────────

interface ReattemptSummaryProps {
  results: ReattemptResult[];
  questions: WrongEntry[];
  onRetry: () => void;
  onBack: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function ReattemptSummary({
  results,
  questions,
  onRetry,
  onBack,
}: ReattemptSummaryProps) {
  const correct = results.filter((r) => r.correct).length;
  const total = questions.length;
  const accuracyPercent = total > 0 ? (correct / total) * 100 : 0;
  const totalTime = results.reduce((sum, r) => sum + (r.timeSeconds ?? 0), 0);
  const [showDetails, setShowDetails] = useState(false);

  const ringColor =
    accuracyPercent >= 80
      ? '#10b981'
      : accuracyPercent >= 60
        ? '#f59e0b'
        : '#f43f5e';
  const ringLabel =
    accuracyPercent >= 80
      ? 'Excellent'
      : accuracyPercent >= 60
        ? 'Good'
        : 'Needs work';

  // Per-question detail rows
  const rows = useMemo(() => {
    return questions.map((q, i) => {
      const r = results.find((rr) => rr.id === q.id);
      return {
        index: i + 1,
        id: q.id,
        topic: q.question.topic,
        subtopic: q.question.subtopic,
        kind: q.kind,
        correct: r?.correct ?? false,
        timeSeconds: r?.timeSeconds ?? 0,
        prompt: q.question.promptMarkdown,
      };
    });
  }, [questions, results]);

  // Topic breakdown
  const topicStats = useMemo(() => {
    const map = new Map<string, { correct: number; total: number }>();
    for (const row of rows) {
      const b = map.get(row.topic) ?? { correct: 0, total: 0 };
      b.total += 1;
      if (row.correct) b.correct += 1;
      map.set(row.topic, b);
    }
    return Array.from(map.entries())
      .map(([topic, b]) => ({
        topic,
        correct: b.correct,
        total: b.total,
        pct: b.total > 0 ? (b.correct / b.total) * 100 : 0,
      }))
      .sort((a, b) => a.pct - b.pct);
  }, [rows]);

  const weakTopics = topicStats.filter((t) => t.pct < 100);

  return (
    <div className='max-w-2xl mx-auto py-6 px-4 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500'>
      {/* Header */}
      <div className='text-center space-y-3'>
        <div className='relative w-28 h-28 mx-auto'>
          <svg viewBox='0 0 100 100' className='w-full h-full -rotate-90'>
            <circle
              cx='50'
              cy='50'
              r='42'
              fill='none'
              stroke='currentColor'
              strokeWidth='8'
              className='text-muted/30'
            />
            <circle
              cx='50'
              cy='50'
              r='42'
              fill='none'
              stroke={ringColor}
              strokeWidth='8'
              strokeLinecap='round'
              strokeDasharray={`${accuracyPercent * 2.64} 264`}
              className='transition-all duration-1000 ease-out'
            />
          </svg>
          <div className='absolute inset-0 flex flex-col items-center justify-center'>
            <span
              className='text-3xl font-black tabular-nums'
              style={{ color: ringColor }}
            >
              {accuracyPercent.toFixed(0)}%
            </span>
            <span className='text-[10px] font-semibold text-muted-foreground'>
              {ringLabel}
            </span>
          </div>
        </div>
        <h2 className='text-xl font-bold'>Reattempt Complete</h2>
        <div className='flex items-center justify-center gap-4 text-sm text-muted-foreground'>
          <span>
            <span className='font-semibold text-foreground'>
              {correct}/{total}
            </span>{' '}
            correct
          </span>
          <span className='text-muted-foreground/40'>·</span>
          <span className='flex items-center gap-1'>
            <Clock className='w-3.5 h-3.5' />
            <span className='font-semibold text-foreground'>
              {formatTime(totalTime)}
            </span>
          </span>
        </div>
      </div>

      {/* Weak topics */}
      {weakTopics.length > 0 && (
        <div className='rounded-sm border border-amber-500/20 bg-amber-500/5 p-4 space-y-2'>
          <p className='text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400'>
            Topics to review
          </p>
          {topicStats
            .filter((t) => t.pct < 100)
            .map(({ topic, correct: c, total: t, pct }) => (
              <div key={topic} className='flex items-center gap-3 text-xs'>
                <span className='flex-1 font-medium text-foreground truncate'>
                  {topic}
                </span>
                <span className='tabular-nums text-muted-foreground'>
                  {c}/{t}
                </span>
                <span
                  className={`shrink-0 tabular-nums font-semibold w-10 text-right ${pct >= 50 ? 'text-amber-500' : 'text-rose-500'}`}
                >
                  {pct.toFixed(0)}%
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Details toggle */}
      <div className='border-t pt-3'>
        <button
          type='button'
          onClick={() => setShowDetails((v) => !v)}
          className='w-full flex items-center justify-between py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer'
        >
          <span>Question breakdown</span>
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${showDetails ? 'rotate-180' : ''}`}
          />
        </button>
        {showDetails && (
          <div className='rounded-sm border divide-y divide-border/40 overflow-hidden mt-2'>
            {rows.map((r) => (
              <div
                key={r.id}
                className={`flex items-center gap-3 px-3 py-2.5 text-xs ${r.correct ? 'bg-emerald-500/5' : 'bg-rose-500/5'}`}
              >
                <span className='shrink-0 w-5 text-muted-foreground font-mono'>
                  {r.index}
                </span>
                <div
                  className={`shrink-0 w-5 h-5 rounded-sm flex items-center justify-center ${r.kind === 'written' ? 'bg-sky-500/10' : 'bg-violet-500/10'}`}
                >
                  {r.kind === 'written' ? (
                    <BookOpen className='w-2.5 h-2.5 text-sky-500' />
                  ) : (
                    <Target className='w-2.5 h-2.5 text-violet-500' />
                  )}
                </div>
                <div className='flex-1 min-w-0'>
                  <span className='font-medium text-foreground truncate block'>
                    {r.topic}
                  </span>
                  {r.subtopic && (
                    <span className='text-muted-foreground truncate block'>
                      {r.subtopic}
                    </span>
                  )}
                </div>
                <span className='shrink-0 tabular-nums text-muted-foreground font-mono'>
                  {formatTime(r.timeSeconds)}
                </span>
                {r.correct ? (
                  <CheckCircle2 className='w-4 h-4 text-emerald-500 shrink-0' />
                ) : (
                  <XCircle className='w-4 h-4 text-rose-400 shrink-0' />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className='flex items-center justify-center gap-3 pt-2'>
        <Button onClick={onRetry} className='gap-1.5'>
          <RotateCcw className='w-3.5 h-3.5' />
          Retry
        </Button>
        <Button variant='outline' onClick={onBack}>
          Back to list
        </Button>
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────
function computeAllWrongEntries(
  questionHistory: QuestionHistoryEntry[],
  mcHistory: McHistoryEntry[],
) {
  const written: WrittenWrongEntry[] = questionHistory
    .filter((e) => {
      const isCorrectVerdict =
        e.markResponse.verdict?.toLowerCase() === 'correct';
      const isFullMarks =
        e.markResponse.maxMarks > 0 &&
        e.markResponse.achievedMarks >= e.markResponse.maxMarks;
      return !isCorrectVerdict && !isFullMarks;
    })
    .map((e) => ({ ...e, kind: 'written' as const }));
  const mc: McWrongEntry[] = mcHistory
    .filter((e) => !e.correct)
    .map((e) => ({ ...e, kind: 'multiple-choice' as const }));
  return [...written, ...mc].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

// eslint-disable-next-line complexity
export default function WrongQuestionView() {
  const questionHistory = useAppStore((s) => s.questionHistory);
  const mcHistory = useAppStore((s) => s.mcHistory);
  const deleteQuestionHistoryEntry = useAppStore(
    (s) => s.deleteQuestionHistoryEntry,
  );
  const deleteMcHistoryEntry = useAppStore((s) => s.deleteMcHistoryEntry);
  const updateQuestionHistoryEntry = useAppStore(
    (s) => s.updateQuestionHistoryEntry,
  );
  const updateMcHistoryEntry = useAppStore((s) => s.updateMcHistoryEntry);
  const apiKey = useAppStore((s) => s.apiKey);
  const model = useAppStore((s) => s.model);
  const markingModel = useAppStore((s) => s.markingModel);
  const useSeparateMarkingModel = useAppStore((s) => s.useSeparateMarkingModel);
  const effectiveModel =
    useSeparateMarkingModel && markingModel?.trim() ? markingModel : model;
  const spacedRepetitionCards = useAppStore((s) => s.spacedRepetitionCards);
  const reviewSpacedCard = useAppStore((s) => s.reviewSpacedCard);
  const navigate = useNavigate();

  const allWrong = useMemo<WrongEntry[]>(
    () => computeAllWrongEntries(questionHistory, mcHistory),
    [questionHistory, mcHistory],
  );

  // Due for review cards
  const dueCards = useMemo(() => {
    return allWrong
      .filter((entry) => {
        const card = spacedRepetitionCards[entry.id];
        return card && isDue(card);
      })
      .sort((a, b) => {
        const cardA = spacedRepetitionCards[a.id];
        const cardB = spacedRepetitionCards[b.id];
        if (!cardA || !cardB) return 0;
        return (
          new Date(cardA.nextReviewDate).getTime() -
          new Date(cardB.nextReviewDate).getTime()
        );
      });
  }, [allWrong, spacedRepetitionCards]);

  // Overdue cards (subset of due)
  const overdueCards = useMemo(() => {
    return dueCards.filter((entry) => {
      const card = spacedRepetitionCards[entry.id];
      return card && daysUntilReview(card) < 0;
    });
  }, [dueCards, spacedRepetitionCards]);

  const [isShuffled, setIsShuffled] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<'all' | 'written' | 'mc'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [reattemptQueue, setReattemptQueue] = useState<WrongEntry[]>([]);
  const [reattemptResults, setReattemptResults] = useState<
    ReattemptResult[] | null
  >(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const confirmDeleteAllTimeoutRef = useRef<number | null>(null);

  const filteredQuestions = useMemo(() => {
    let list = allWrong;
    if (filterMode === 'written')
      list = list.filter((e) => e.kind === 'written');
    if (filterMode === 'mc')
      list = list.filter((e) => e.kind === 'multiple-choice');
    return isShuffled ? shuffleArray(list) : list;
  }, [allWrong, isShuffled, filterMode]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
      }
      return n;
    });
  }, []);

  const handleDelete = useCallback(
    (entry: WrongEntry) => {
      if (entry.kind === 'written') {
        deleteQuestionHistoryEntry(entry.id);
      } else {
        deleteMcHistoryEntry(entry.id);
      }
      setExpandedIds((prev) => {
        const n = new Set(prev);
        n.delete(entry.id);
        return n;
      });
      toast.success('Entry removed from wrong answers');
    },
    [deleteQuestionHistoryEntry, deleteMcHistoryEntry],
  );

  const handleExportToAnki = useCallback(async (entry: WrongEntry) => {
    try {
      let answerText = '';
      if (entry.kind === 'written') {
        answerText = `${entry.markResponse.feedbackMarkdown}\n\n### Worked Solution\n${entry.workedSolutionMarkdown}`;
      } else {
        answerText = `Correct Answer: ${entry.question.correctAnswer}\n\n${entry.question.explanationMarkdown}`;
      }

      const res = await invoke<ExportQuestionToAnkiResponse>(
        'export_question_to_anki',
        {
          request: {
            id: entry.id,
            question: entry.question.promptMarkdown,
            answer: answerText,
            topic: entry.question.topic,
            subtopic: entry.question.subtopic ?? '',
            options:
              entry.kind === 'multiple-choice'
                ? entry.question.options
                : undefined,
          },
        },
      );

      if (res.success) {
        toast.success(`Exported to Anki: ${res.filePath}`);
        if (res.errorMessage) {
          toast.warning(res.errorMessage);
        }
      } else {
        toast.error(`Export failed: ${res.errorMessage}`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`Export error: ${message}`);
    }
  }, []);

  const handleMarkCorrect = useCallback(
    (entry: WrongEntry) => {
      if (entry.kind === 'written') {
        updateQuestionHistoryEntry({
          ...entry,
          lastModified: Date.now(),
          markResponse: { ...entry.markResponse, verdict: 'correct' },
        });
        // Record SR with quality 4 (correct)
        reviewSpacedCard(entry.id, 4);
      } else {
        updateMcHistoryEntry({
          ...entry,
          lastModified: Date.now(),
          correct: true,
        });
        // Record SR with quality 4 (correct)
        reviewSpacedCard(entry.id, 4);
      }
      toast.success('Marked as correct - spaced repetition updated');
    },
    [updateQuestionHistoryEntry, updateMcHistoryEntry, reviewSpacedCard],
  );

  const startReattempt = (shuffle: boolean) => {
    setReattemptQueue(
      shuffle ? shuffleArray(filteredQuestions) : [...filteredQuestions],
    );
    setReattemptResults(null);
    setViewMode('reattempt');
  };

  const startSingleReattempt = useCallback((entry: WrongEntry) => {
    setReattemptQueue([entry]);
    setReattemptResults(null);
    setViewMode('reattempt');
  }, []);

  if (viewMode === 'reattempt') {
    return (
      <div className='h-full flex flex-col px-3 sm:px-5 py-4'>
        <ReattemptView
          questions={reattemptQueue}
          apiKey={apiKey}
          model={effectiveModel}
          onDelete={handleDelete}
          onMarkCorrect={handleMarkCorrect}
          onExit={(res) => {
            setReattemptResults(res);
            setViewMode('summary');
          }}
        />
      </div>
    );
  }

  if (viewMode === 'summary' && reattemptResults) {
    return (
      <div className='min-h-full px-3 sm:px-5 py-4'>
        <ReattemptSummary
          results={reattemptResults}
          questions={reattemptQueue}
          onRetry={() => {
            setReattemptQueue(shuffleArray(filteredQuestions));
            setReattemptResults(null);
            setViewMode('reattempt');
          }}
          onBack={() => {
            setViewMode('list');
            setReattemptResults(null);
          }}
        />
      </div>
    );
  }

  const writtenCount = allWrong.filter((e) => e.kind === 'written').length;
  const mcCount = allWrong.filter((e) => e.kind === 'multiple-choice').length;

  return (
    <PageContainer>
      {allWrong.length > 0 && (
        <div>
          <PageHeader
            title='Wrong Answers'
            description='Review and reattempt questions you got wrong.'
            actions={
              <div className='flex items-center gap-2'>
                <Button
                  size='sm'
                  className='ml-auto gap-2 h-8 px-4 shadow-sm'
                  onClick={() => {
                    if (!confirmDeleteAll) {
                      setConfirmDeleteAll(true);
                      if (confirmDeleteAllTimeoutRef.current)
                        window.clearTimeout(confirmDeleteAllTimeoutRef.current);
                      confirmDeleteAllTimeoutRef.current = window.setTimeout(
                        () => setConfirmDeleteAll(false),
                        5000,
                      );
                      return;
                    }

                    // confirmed: perform deletion
                    for (const entry of allWrong) {
                      if (entry.kind === 'written') {
                        deleteQuestionHistoryEntry(entry.id);
                      } else {
                        deleteMcHistoryEntry(entry.id);
                      }
                    }
                    setConfirmDeleteAll(false);
                    if (confirmDeleteAllTimeoutRef.current) {
                      window.clearTimeout(confirmDeleteAllTimeoutRef.current);
                      confirmDeleteAllTimeoutRef.current = null;
                    }
                    toast.success('All wrong entries deleted');
                  }}
                >
                  <Trash className='w-3.5 h-3.5' />
                  {confirmDeleteAll ? 'Confirm Delete All' : 'Delete All'}
                </Button>
              </div>
            }
          />
          <Toolbar>
            <FilterGroup>
              {(['all', 'written', 'mc'] as const).map((m) => (
                <FilterButton
                  key={m}
                  active={filterMode === m}
                  onClick={() => setFilterMode(m)}
                >
                  {m === 'all'
                    ? `All (${allWrong.length})`
                    : m === 'written'
                      ? `Written (${writtenCount})`
                      : `MC (${mcCount})`}
                </FilterButton>
              ))}
            </FilterGroup>
            <Button
              size='lg'
              onClick={() => setIsShuffled((s) => !s)}
              variant={isShuffled ? 'default' : 'outline'}
            >
              <Shuffle className='w-3.5 h-3.5' />
              {isShuffled ? 'Shuffled' : 'Shuffle'}
            </Button>
            {filteredQuestions.length > 0 && (
              <Button
                size='sm'
                className='ml-auto gap-2 h-8 px-4 shadow-sm'
                onClick={() => startReattempt(isShuffled)}
              >
                <RotateCcw className='w-3.5 h-3.5' />
                Reattempt{' '}
                {filteredQuestions.length > 1
                  ? `all ${filteredQuestions.length}`
                  : ''}
              </Button>
            )}
          </Toolbar>
        </div>
      )}

      {/* Content */}
      <div className='flex-1 py-3'>
        {allWrong.length === 0 ? (
          <EmptyState
            title='No Mistakes Yet.'
            description='Complete some questions and any incorrect answers will appear here for review.'
            icon={Trophy}
            actions={
              <Button onClick={() => void navigate('/')}>
                <PlusCircle className='h-4 w-4' />
                Generate your first set
              </Button>
            }
          />
        ) : (
          <div className='space-y-6'>
            {/* Due for Review section */}
            {dueCards.length > 0 && (
              <div className='rounded-sm border border-sky-500/20 bg-sky-500/5 overflow-hidden'>
                <div className='flex items-center gap-2 px-4 py-3 border-b border-sky-500/15 bg-sky-500/5'>
                  <Brain className='w-4 h-4 text-sky-500' />
                  <span className='text-sm font-bold text-sky-700 dark:text-sky-300'>
                    Due for Review
                  </span>
                  <Badge className='ml-auto text-[10px] font-bold bg-sky-500/15 text-sky-600 dark:text-sky-400'>
                    {dueCards.length} item{dueCards.length !== 1 ? 's' : ''}
                  </Badge>
                  {overdueCards.length > 0 && (
                    <Badge className='text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400'>
                      {overdueCards.length} overdue
                    </Badge>
                  )}
                </div>
                <div className='divide-y divide-sky-500/10'>
                  {dueCards.slice(0, 5).map((entry) => {
                    const card = spacedRepetitionCards[entry.id];
                    const days = card ? daysUntilReview(card) : 0;
                    const isOverdue = days < 0;
                    const isWritten = entry.kind === 'written';
                    return (
                      <div
                        key={entry.id}
                        className='flex items-center gap-3 px-4 py-3 hover:bg-sky-500/5 transition-colors'
                      >
                        <div
                          className={`w-6 h-6 rounded-sm flex items-center justify-center shrink-0 ${isWritten ? 'bg-sky-500/10' : 'bg-violet-500/10'}`}
                        >
                          {isWritten ? (
                            <BookOpen className='w-3 h-3 text-sky-500' />
                          ) : (
                            <Target className='w-3 h-3 text-violet-500' />
                          )}
                        </div>
                        <div className='flex-1 min-w-0'>
                          <div className='text-sm font-medium truncate'>
                            <MarkdownMath
                              content={entry.question.promptMarkdown.slice(
                                0,
                                120,
                              )}
                            />
                          </div>
                          <div className='flex items-center gap-2 mt-0.5'>
                            <span className='text-[10px] text-muted-foreground'>
                              {entry.question.topic}
                            </span>
                            {entry.question.subtopic && (
                              <span className='text-[10px] text-muted-foreground/50'>
                                · {entry.question.subtopic.slice(0, 30)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div
                          className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-sm ${
                            isOverdue
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              : days === 0
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                          }`}
                        >
                          {isOverdue
                            ? `${Math.abs(days)}d overdue`
                            : days === 0
                              ? 'Due today'
                              : `Due in ${days}d`}
                        </div>
                        {card && (
                          <div className='shrink-0 text-[10px] text-muted-foreground'>
                            EF: {card.easinessFactor.toFixed(1)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {dueCards.length > 5 && (
                  <div className='px-4 py-2 border-t border-sky-500/15 text-center'>
                    <span className='text-xs text-sky-600 dark:text-sky-400 font-medium'>
                      +{dueCards.length - 5} more items due
                    </span>
                  </div>
                )}
                <div className='px-4 py-2 border-t border-sky-500/15'>
                  <Button
                    size='sm'
                    className='w-full gap-2 h-8 bg-sky-500/90 hover:bg-sky-600 text-white'
                    onClick={() => startReattempt(true)}
                  >
                    <RotateCcw className='w-3.5 h-3.5' />
                    Review due items
                  </Button>
                </div>
              </div>
            )}

            {/* All wrong answers list */}
            {filteredQuestions.length === 0 ? (
              <p className='text-sm text-muted-foreground text-center py-8'>
                No questions match this filter.
              </p>
            ) : (
              <VirtualizedWrongList
                entries={filteredQuestions}
                expandedIds={expandedIds}
                onToggle={toggleExpand}
                onDelete={handleDelete}
                onExport={(e) => {
                  void handleExportToAnki(e);
                }}
                onReattempt={startSingleReattempt}
                spacedRepetitionCards={spacedRepetitionCards}
              />
            )}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
