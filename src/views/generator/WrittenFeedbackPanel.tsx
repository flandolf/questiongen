import { ChevronDown, ChevronUp, Loader2, ShieldAlert } from 'lucide-react';
import { memo, useState } from 'react';

import { MarkdownMath } from '@/components/MarkdownMath';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { scoreColorClass } from '@/lib/score-utils';
import type { MarkAnswerResponse, StudentAnswerImage } from '@/types';

type WrittenFeedbackPanelProps = {
  questionId: string;
  promptMarkdown: string;
  answer: string;
  image: StudentAnswerImage | undefined;
  feedback: MarkAnswerResponse;
  markingDurationMs?: number;
  appealText: string;
  overrideInput: string;
  isMarking: boolean;
  distinctness?: number;
  multiStepDepth?: number;
  verbDiversityCount?: number;
  scaffoldPattern?: string;
  onAppealChange: (value: string) => void;
  onOverrideInputChange: (value: string) => void;
  onArgueForMark: () => void;
  onApplyOverride: () => void;
  onCriterionChange?: (
    idx: number,
    achievedMarks: number,
    rationale: string,
  ) => void;
};

const TopBanner = memo(function TopBanner({
  achievedMarks,
  maxMarks,
  verdict,
  markingDurationLabel,
  scoreColor,
  isCorrect,
  pct,
}: {
  achievedMarks: number;
  maxMarks: number;
  verdict?: string;
  markingDurationMs?: number;
  markingDurationLabel?: string;
  scoreColor: string;
  isCorrect: boolean;
  pct: number;
}) {
  return (
    <header className='shrink-0 z-30 flex items-center justify-between px-6 pb-4 border-b border-border bg-background/95 backdrop-blur-sm'>
      <div className='flex items-center gap-10'>
        <div className='flex flex-col'>
          <span className='text-[11px] font-bold uppercase tracking-[0.25em] text-muted-foreground mb-0.5'>
            Achieved Marks
          </span>
          <div className='flex items-baseline gap-2 font-mono'>
            <span
              className={`text-4xl font-black tabular-nums tracking-tighter ${scoreColor}`}
            >
              {achievedMarks}
            </span>
            <span className='text-xl font-medium text-muted-foreground/30'>
              / {maxMarks}
            </span>
          </div>
        </div>

        <div className='flex flex-col'>
          <span className='text-[11px] font-bold uppercase tracking-[0.25em] text-muted-foreground mb-1'>
            Final Verdict
          </span>
          <div
            className={`text-sm px-3 py-1.5 rounded border shadow-sm ${
              isCorrect
                ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : pct >= 0.5
                  ? 'bg-amber-500/5 border-amber-500/20 text-amber-600 dark:text-amber-400'
                  : 'bg-rose-500/5 border-rose-500/20 text-rose-600 dark:text-rose-400'
            }`}
          >
            {verdict}
          </div>
        </div>
      </div>

      {markingDurationLabel && (
        <div className='hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md border border-border/60 bg-muted/30 text-[11px] font-mono text-muted-foreground tracking-tighter'>
          <Loader2 className='w-3 h-3 animate-spin opacity-50' />
          PROCESSED IN {markingDurationLabel.toUpperCase()}
        </div>
      )}
    </header>
  );
});

export const WrittenFeedbackPanel = memo(function WrittenFeedbackPanel({
  promptMarkdown,
  answer,
  image,
  feedback,
  markingDurationMs,
  appealText,
  isMarking,
  onAppealChange,
  onArgueForMark,
  onCriterionChange,
}: WrittenFeedbackPanelProps) {
  const pct =
    feedback.maxMarks > 0 ? feedback.achievedMarks / feedback.maxMarks : 0;
  const scoreColor = scoreColorClass(pct);
  const verdict = feedback.verdict?.toLowerCase();
  const isCorrect = verdict === 'correct';
  const markingDurationLabel =
    markingDurationMs !== undefined
      ? `${(markingDurationMs / 1000).toFixed(1)}s`
      : undefined;

  const [aiFeedbackOpen, setAiFeedbackOpen] = useState(true);
  const [isQuestionOpen, setIsQuestionOpen] = useState(true);

  return (
    <div className='h-full w-full flex flex-col overflow-hidden bg-background text-foreground selection:bg-primary/10'>
      {/* TOP BANNER: Clinical Score & Verdict */}
      <TopBanner
        achievedMarks={feedback.achievedMarks}
        maxMarks={feedback.maxMarks}
        verdict={feedback.verdict}
        markingDurationMs={markingDurationMs}
        markingDurationLabel={markingDurationLabel}
        scoreColor={scoreColor}
        isCorrect={isCorrect}
        pct={pct}
      />

      <main className='flex-1 flex flex-col min-h-0'>
        {/* QUESTION PROMPT: Full Width Context */}
        <div className='shrink-0 border-b border-border/40 bg-muted/5 px-4 sm:px-8 py-6 sm:py-10'>
          <div className='flex items-center justify-between mb-2'>
            <h3 className='text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground'>
              Question
            </h3>
            <button
              onClick={() => setIsQuestionOpen(!isQuestionOpen)}
              className='w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-all active:scale-90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none'
              aria-label={
                isQuestionOpen ? 'Collapse question' : 'Expand question'
              }
            >
              {isQuestionOpen ? (
                <ChevronUp className='w-4 h-4' />
              ) : (
                <ChevronDown className='w-4 h-4' />
              )}
            </button>
          </div>
          {isQuestionOpen && (
            <div className='max-w-6xl'>
              <MarkdownMath
                content={promptMarkdown}
                className='prose dark:prose-invert text-foreground leading-relaxed font-medium'
              />
            </div>
          )}
        </div>

        {/* ASYMMETRICAL SPLIT PANE */}
        <div className='flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden'>
          {/* LEFT: THE TRUTH (Rubric & Exemplar) */}
          <aside className='lg:w-[42%] h-full overflow-y-auto border-r border-border bg-muted/2 scroll-smooth'>
            <div className='p-6 space-y-12'>
              {/* INTERACTIVE RUBRIC */}
              <section className='space-y-4'>
                <div className='flex items-center gap-3 border-b border-border/50 pb-4'>
                  <h3 className='text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground'>
                    Reference Rubric
                  </h3>
                </div>

                <div className='space-y-3'>
                  {feedback.vcaaMarkingScheme.map((item, idx) => {
                    const isFullMarks = item.achievedMarks === item.maxMarks;
                    const isPartial = item.achievedMarks > 0 && !isFullMarks;

                    return (
                      <div
                        key={idx}
                        className='group relative flex flex-col gap-2 p-3 rounded-lg border border-border/40 bg-background transition-all duration-200 hover:border-border/80 hover:shadow-sm'
                      >
                        <div className='flex items-start gap-3'>
                          {/* Index */}
                          <span className='flex items-center justify-center w-5 h-5 rounded bg-muted text-muted-foreground text-[10px] font-bold tabular-nums shrink-0 mt-0.5 font-mono'>
                            {idx + 1}
                          </span>

                          {/* Content */}
                          <div className='flex-1 min-w-0 space-y-1.5'>
                            <div className='prose dark:prose-invert max-w-none text-foreground/90 leading-snug font-medium text-[13px]'>
                              <MarkdownMath content={item.criterion} />
                            </div>

                            {item.rationale && (
                              <div className='text-[12px] text-muted-foreground/80 leading-relaxed italic border-l-2 border-border/60 pl-2.5 ml-0.5'>
                                <MarkdownMath content={item.rationale} />
                              </div>
                            )}
                          </div>

                          {/* Mark Controls */}
                          <div className='flex flex-col items-end gap-1.5 shrink-0 ml-2 mt-0.5'>
                            <div className='flex items-center gap-1.5 bg-muted/30 p-1 rounded-md border border-border/30'>
                              <div
                                className={`flex items-center justify-center min-w-7 h-5.5 px-1.5 rounded font-mono text-[12px] font-black tabular-nums transition-colors ${
                                  isFullMarks
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                    : isPartial
                                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                      : 'bg-muted text-muted-foreground/50'
                                }`}
                              >
                                {item.achievedMarks}
                                <span className='text-[9px] text-muted-foreground/40 ml-px'>
                                  /{item.maxMarks}
                                </span>
                              </div>
                              <div className='flex flex-col gap-px'>
                                <button
                                  onClick={() =>
                                    onCriterionChange?.(
                                      idx,
                                      Math.min(
                                        item.maxMarks,
                                        item.achievedMarks + 1,
                                      ),
                                      item.rationale || '',
                                    )
                                  }
                                  disabled={item.achievedMarks >= item.maxMarks}
                                  className='w-5 h-2.5 flex items-center justify-center rounded-xs bg-background border border-border/40 hover:bg-muted disabled:opacity-30 transition-all'
                                  aria-label='Increase mark'
                                >
                                  <ChevronUp className='w-2.5 h-2.5' />
                                </button>
                                <button
                                  onClick={() =>
                                    onCriterionChange?.(
                                      idx,
                                      Math.max(0, item.achievedMarks - 1),
                                      item.rationale || '',
                                    )
                                  }
                                  disabled={item.achievedMarks <= 0}
                                  className='w-5 h-2.5 flex items-center justify-center rounded-xs bg-background border border-border/40 hover:bg-muted disabled:opacity-30 transition-all'
                                  aria-label='Decrease mark'
                                >
                                  <ChevronDown className='w-2.5 h-2.5' />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* IDEAL SOLUTION (Always Visible) */}
              <section className='space-y-4'>
                <div className='flex items-center gap-3 border-b border-border/50 pb-4 pt-6'>
                  <h3 className='text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground'>
                    Exemplar Answer
                  </h3>
                </div>
                <div
                  className='px-2 prose dark:prose-invert text-foreground leading-relaxed font-medium shadow-sm transition-all hover:bg-muted/5'
                  style={{ fontSize: 'var(--response-text-size)' }}
                >
                  <MarkdownMath
                    content={
                      feedback.exemplarResponseMarkdown ||
                      feedback.workedSolutionMarkdown ||
                      'No exemplar available.'
                    }
                  />
                </div>
              </section>
            </div>
          </aside>

          {/* RIGHT: THE ATTEMPT (Submission & Feedback) */}
          <section className='flex-1 h-full overflow-y-auto bg-background scroll-smooth'>
            <div className='p-6 space-y-4'>
              {/* STUDENT SUBMISSION */}
              <section className='space-y-4'>
                <div className='flex items-center gap-3 border-b border-border/50 pb-4'>
                  <h3 className='text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground'>
                    Student Submission
                  </h3>
                </div>

                <div className='space-y-4'>
                  {answer.trim().length > 0 ? (
                    <div
                      className='px-2 prose dark:prose-invert text-foreground leading-relaxed font-medium shadow-sm transition-all hover:bg-muted/5'
                      style={{ fontSize: 'var(--response-text-size)' }}
                    >
                      <MarkdownMath content={answer} />
                    </div>
                  ) : (
                    <div className='rounded-2xl border border-dashed border-border/60 bg-muted/2 p-12 text-sm text-muted-foreground italic flex flex-col justify-center items-center gap-3'>
                      <div className='w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-2'>
                        <ShieldAlert className='w-6 h-6 opacity-30 text-muted-foreground' />
                      </div>
                      No typed answer was submitted.
                    </div>
                  )}

                  {image && (
                    <div className='rounded-2xl border border-border/30 bg-muted/2 p-4 overflow-hidden shadow-sm max-w-[75ch] transition-all hover:shadow-md'>
                      <img
                        src={image.downloadUrl || image.dataUrl}
                        alt='Submitted working'
                        className='w-full h-auto max-h-175 object-contain rounded-xl mix-blend-multiply dark:mix-blend-normal'
                      />
                    </div>
                  )}
                </div>
              </section>

              {/* AI GENERAL FEEDBACK */}
              <section className='space-y-4'>
                <div className='flex items-center justify-between border-b border-border/50 pb-4'>
                  <div className='flex items-center gap-3'>
                    <h3 className='text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground'>
                      General Feedback
                    </h3>
                  </div>
                  <button
                    onClick={() => setAiFeedbackOpen(!aiFeedbackOpen)}
                    className='w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-all active:scale-90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none'
                    aria-label={
                      aiFeedbackOpen ? 'Collapse feedback' : 'Expand feedback'
                    }
                  >
                    {aiFeedbackOpen ? (
                      <ChevronUp className='w-4 h-4' />
                    ) : (
                      <ChevronDown className='w-4 h-4' />
                    )}
                  </button>
                </div>
                {aiFeedbackOpen && (
                  <div
                    className='px-2 prose dark:prose-invert text-foreground leading-relaxed font-medium shadow-sm transition-all hover:bg-muted/5'
                    style={{ fontSize: 'var(--response-text-size)' }}
                  >
                    <MarkdownMath content={feedback.feedbackMarkdown} />
                  </div>
                )}
              </section>

              {/* ADJUSTMENTS & APPEALS */}
              <section className='pt-12 border-t border-border/30'>
                <div className='space-y-4'>
                  <div className='flex flex-col gap-1'>
                    <span className='text-[11px] font-bold uppercase tracking-[0.25em] text-muted-foreground'>
                      Appeal
                    </span>
                    <span className='text-sm text-muted-foreground/80'>
                      If you think this submission deserves a different mark,
                      you can submit an appeal justifying why.
                    </span>
                  </div>
                  <div className='px-2 space-y-4'>
                    <Textarea
                      placeholder='Justify why this submission deserves a different mark...'
                      className='min-h-40 text-sm resize-none bg-muted/3 border-border/60 focus:border-primary rounded-xl p-4 transition-all focus:shadow-inner'
                      value={appealText}
                      onChange={(e) => onAppealChange(e.target.value)}
                      disabled={isMarking}
                    />
                    <Button
                      type='button'
                      variant='secondary'
                      onClick={onArgueForMark}
                      disabled={isMarking || appealText.trim().length === 0}
                      className='w-full h-11 rounded-lg font-bold uppercase tracking-widest text-[11px] border border-border/40 transition-all active:scale-[0.98] focus-visible:ring-2'
                    >
                      {isMarking ? (
                        <>
                          <Loader2 className='w-4 h-4 animate-spin mr-3' />{' '}
                          ANALYZING...
                        </>
                      ) : (
                        'Submit Appeal'
                      )}
                    </Button>
                  </div>
                </div>
              </section>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
});
