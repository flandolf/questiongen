import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownMath } from '@/components/MarkdownMath';
import { Eye, Info, PenLine } from 'lucide-react';
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
      <div className="flex items-center gap-x-4 gap-y-2 text-xs text-muted-foreground/70">
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5" />
          <span className="text-xs uppercase tracking-wide font-medium">
            Question
          </span>
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
      <div className="bg-card/40 rounded-xl border border-border/20 p-5 sm:p-6">
        <div className="text-lg leading-relaxed text-foreground">
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
  className,
}: {
  options: UnifiedOption[];
  selectedAnswer?: string;
  correctAnswer?: string;
  answered?: boolean;
  revealCorrectness?: boolean;
  lockSelection?: boolean;
  onSelect?: (label: string) => void;
  className?: string;
}) {
  const isAnswered = answered ?? Boolean(selectedAnswer);
  const isExamStyle = isAnswered && !revealCorrectness;

  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:gap-4', className)}>
      {options.map((opt) => {
        const isChosen = selectedAnswer === opt.label;
        const isCorrect = opt.label === correctAnswer;
        const color = UNIFIED_OPTION_COLORS[opt.label] ?? '#6b7280';
        const disabled = lockSelection && (isAnswered || !onSelect);

        let containerClasses =
          'p-4 sm:p-5 rounded-lg border border-transparent hover:bg-muted/30 hover:scale-[1.01] cursor-pointer transition-all duration-150';

        if (isAnswered) {
          if (revealCorrectness && isCorrect) {
            containerClasses =
              'p-4 sm:p-5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 cursor-default';
          } else if (isChosen) {
            containerClasses = revealCorrectness
              ? 'p-4 sm:p-5 rounded-lg border border-rose-500/30 bg-rose-500/5 cursor-default'
              : 'p-4 sm:p-5 rounded-lg border border-violet-500/30 bg-violet-500/5 ring-2 ring-violet-500/30 ring-offset-1 cursor-default';
          } else {
            containerClasses = isExamStyle
              ? 'p-4 sm:p-5 rounded-lg border border-transparent hover:bg-muted/30 hover:scale-[1.01] cursor-pointer transition-all duration-150'
              : 'p-4 sm:p-5 rounded-lg border border-transparent opacity-40 cursor-default';
          }
        }

        return (
          <button
            key={opt.label}
            type="button"
            disabled={disabled}
            onClick={() => onSelect?.(opt.label)}
            className={cn(
              'w-full text-left flex items-start gap-3',
              containerClasses
            )}
            aria-label={`Option ${opt.label}: ${opt.text.substring(0, 60)}${opt.text.length > 60 ? '...' : ''}`}
          >
            <div
              className={cn(
                'w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-sm font-semibold',
                isAnswered
                  ? isChosen
                    ? revealCorrectness
                      ? isCorrect
                        ? 'bg-emerald-500 text-white'
                        : 'bg-rose-500 text-white'
                      : 'bg-violet-500 text-white'
                    : isCorrect && revealCorrectness
                      ? 'bg-emerald-500 text-white'
                      : isExamStyle
                        ? 'bg-muted text-foreground/70'
                        : 'bg-muted text-muted-foreground'
                  : 'bg-muted text-foreground/70'
              )}
              style={
                !isAnswered || (isExamStyle && !isChosen)
                  ? { backgroundColor: `${color}20`, color }
                  : undefined
              }
            >
              {opt.label}
            </div>
            <div className="flex-1 text-base leading-relaxed">
              <MarkdownMath content={opt.text} />
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
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground/70">
          <PenLine className="w-4 h-4" />
          <span className="text-xs uppercase tracking-wide">Response</span>
        </div>
        {typeof maxMarks === 'number' && maxMarks > 0 && (
          <span className="text-muted-foreground/50 text-xs">
            ({maxMarks} marks)
          </span>
        )}
        <div className="ml-auto flex items-center gap-4">{headerRight}</div>
      </div>
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
