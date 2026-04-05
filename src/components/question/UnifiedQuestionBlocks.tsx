import { Eye, Info, PenLine } from 'lucide-react';
import type { ReactNode } from 'react';

import { MarkdownMath } from '@/components/MarkdownMath';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export const UNIFIED_OPTION_COLORS: Record<string, string> = {
  A: '#3b82f6',
  B: '#8b5cf6',
  C: '#f59e0b',
  D: '#ec4899',
};

export function UnifiedQuestionPromptCard({
  promptMarkdown,
  topic,
  subtopic,
  difficulty,
  maxMarks,
  rightSlot,
  className,
}: {
  promptMarkdown: string;
  topic?: string;
  subtopic?: string;
  difficulty?: string;
  maxMarks?: number;
  rightSlot?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground/70">
        <div className="flex items-center gap-2 uppercase tracking-[0.22em] font-medium">
          <Info className="w-3.5 h-3.5" />
          <span>Question</span>
        </div>
        {topic && <span className="text-foreground/80">{topic}</span>}
        {subtopic && <span>/ {subtopic}</span>}
        {difficulty && (
          <>
            <span className="text-border">|</span>
            <span className="capitalize">{difficulty}</span>
          </>
        )}
        {typeof maxMarks === 'number' && maxMarks > 0 && (
          <>
            <span className="text-border">|</span>
            <span>{maxMarks} marks</span>
          </>
        )}
        <div className="ml-auto">{rightSlot}</div>
      </div>
      <div className="relative overflow-hidden px-5 py-5 sm:px-6 sm:py-6">
        <div className="absolute inset-y-0 right-0 w-28 pointer-events-none" />
        <div
          className="relative leading-[1.75] text-foreground"
          style={{ fontSize: 'var(--question-text-size)' }}
        >
          <MarkdownMath content={promptMarkdown} />
        </div>
      </div>
    </div>
  );
}

type UnifiedOption = { label: string; text: string };

export function UnifiedMcqOptionsGrid({
  options,
  selectedAnswer,
  correctAnswer,
  answered,
  revealCorrectness = false,
  lockSelection = true,
  onSelect,
  columns = 2,
  className,
}: {
  options: UnifiedOption[];
  selectedAnswer?: string;
  correctAnswer?: string;
  answered?: boolean;
  revealCorrectness?: boolean;
  lockSelection?: boolean;
  onSelect?: (label: string) => void;
  columns?: 1 | 2;
  className?: string;
}) {
  const isAnswered = answered ?? Boolean(selectedAnswer);
  const isExamStyle = isAnswered && !revealCorrectness;

  return (
    <div
      className={cn(
        'grid gap-3',
        columns === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2',
        className
      )}
    >
      {options.map((opt) => {
        const isChosen = selectedAnswer === opt.label;
        const isCorrect = opt.label === correctAnswer;
        const color = UNIFIED_OPTION_COLORS[opt.label] ?? '#6b7280';
        const disabled = lockSelection && (isAnswered || !onSelect);

        // Determine variant for clean conditional logic
        const variant:
          | 'correct'
          | 'wrong'
          | 'chosen'
          | 'faded'
          | 'idle'
          | 'selectable' = !isAnswered
          ? 'idle'
          : revealCorrectness && isCorrect
            ? 'correct'
            : isChosen
              ? revealCorrectness
                ? 'wrong'
                : 'chosen'
              : isExamStyle
                ? 'selectable'
                : 'faded';

        const containerClasses = {
          idle: 'border border-border/10 bg-card/35 hover:bg-card/55 hover:border-border/20 cursor-pointer transition-all duration-150',
          selectable:
            'border border-border/10 bg-card/35 hover:bg-card/55 hover:border-border/20 cursor-pointer transition-all duration-150',
          correct:
            'border border-emerald-500/30 bg-emerald-500/8 cursor-default',
          wrong: 'border border-rose-500/30 bg-rose-500/8 cursor-default',
          chosen:
            'border border-primary/30 bg-primary/8 ring-1 ring-primary/15 cursor-default',
          faded:
            'border border-transparent bg-card/15 opacity-40 cursor-default',
        }[variant];

        const badgeClasses = {
          idle: 'bg-card/55 text-muted-foreground border border-border/10',
          selectable:
            'bg-card/55 text-muted-foreground border border-border/10',
          correct: 'bg-emerald-500 text-white border-transparent',
          wrong: 'bg-rose-500 text-white border-transparent',
          chosen: 'bg-primary text-primary-foreground border-transparent',
          faded: 'bg-muted text-muted-foreground border-transparent',
        }[variant];

        const badgeStyle =
          variant === 'idle' || variant === 'selectable'
            ? { borderColor: `${color}35`, color }
            : undefined;

        return (
          <button
            key={opt.label}
            type="button"
            disabled={disabled}
            onClick={() => onSelect?.(opt.label)}
            className={cn(
              'w-full text-left rounded-xl flex items-start gap-3.5',
              containerClasses
            )}
            style={{ padding: 0 }}
            aria-label={`Option ${opt.label}: ${opt.text.substring(0, 60)}${opt.text.length > 60 ? '...' : ''}`}
          >
            {/* Inner layout uses gap + padding-equivalent via inner wrapper */}
            <div className="flex items-start gap-3.5 w-full p-4 sm:p-5">
              {/* Badge */}
              <div
                className={cn(
                  'w-9 h-9 shrink-0 flex items-center justify-center rounded-lg',
                  'text-[12px] font-semibold tracking-[0.15em] uppercase leading-none pl-[0.15em]',
                  'transition-colors duration-150',
                  badgeClasses
                )}
                style={badgeStyle}
              >
                {opt.label}
              </div>

              {/* Content */}
              <div
                className="flex-1 leading-[1.7] min-w-0 pt-[3px]"
                style={{ fontSize: 'var(--response-text-size)' }}
              >
                <MarkdownMath content={opt.text} />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function UnifiedWrittenResponseCard({
  value,
  onChange,
  disabled,
  maxMarks,
  headerRight,
  placeholder = 'Draft your solution here...',
  onReveal,
  revealLabel = 'Skip / Reveal',
  showReveal = false,
  inputSlot,
  topSlot,
  hideResponseLabel = false,
  children,
  className,
}: {
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  maxMarks?: number;
  headerRight?: ReactNode;
  placeholder?: string;
  onReveal?: () => void;
  revealLabel?: string;
  showReveal?: boolean;
  footerNote?: string;
  inputSlot?: ReactNode;
  topSlot?: ReactNode;
  hideResponseLabel?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-3 text-sm">
        {!hideResponseLabel && (
          <div className="flex items-center gap-2 text-muted-foreground/70">
            <PenLine className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wide">Response</span>
          </div>
        )}
        {typeof maxMarks === 'number' && maxMarks > 0 && (
          <span className="text-muted-foreground/50 text-xs">
            ({maxMarks} marks)
          </span>
        )}
        <div className="ml-auto flex items-center gap-4">{headerRight}</div>
      </div>
      {topSlot}
      {inputSlot ?? (
        <Textarea
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className="min-h-[160px] sm:min-h-[200px] text-base p-4 sm:p-5 rounded-lg border-border/20 focus-visible:ring-violet-500/30 focus-visible:border-violet-500/30"
        />
      )}

      {showReveal && onReveal && (
        <div className="flex items-center justify-end gap-2">
          {value.trim() && (
            <span className="text-xs text-muted-foreground/50">Writing...</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground/70 hover:text-foreground"
            onClick={onReveal}
          >
            <Eye className="w-3.5 h-3.5 mr-1.5" />
            {revealLabel}
          </Button>
        </div>
      )}
      {children}
    </div>
  );
}
