import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownMath } from "@/components/MarkdownMath";
import { BookOpen, Eye, PenLine, Sparkles, Target } from "lucide-react";
import { cn } from "@/lib/utils";

export const UNIFIED_OPTION_COLORS: Record<string, string> = {
  A: "#3b82f6",
  B: "#8b5cf6",
  C: "#f59e0b",
  D: "#ec4899",
};

type ModeTone = "written" | "mc";

export function UnifiedQuestionPromptCard({
  promptMarkdown,
  topic,
  subtopic,
  difficulty,
  maxMarks,
  modeLabel,
  modeTone,
  rightSlot,
  className,
}: {
  promptMarkdown: string;
  topic?: string;
  subtopic?: string;
  difficulty?: string;
  maxMarks?: number;
  modeLabel?: string;
  modeTone?: ModeTone;
  rightSlot?: ReactNode;
  className?: string;
}) {
  const toneClasses =
    modeTone === "written"
      ? "border-sky-400/40 text-sky-600 dark:text-sky-400"
      : modeTone === "mc"
        ? "border-violet-400/40 text-violet-600 dark:text-violet-400"
        : "border-border/50 text-muted-foreground";

  return (
    <div className={cn("bg-card border border-border/40 rounded-3xl shadow-sm overflow-hidden", className)}>
      <div className="flex flex-wrap items-center gap-2 px-6 py-3 bg-muted/20 border-b border-border/30">
        {topic && (
          <Badge variant="outline" className="bg-background text-xs py-0.5 border-border/50">
            {topic}
          </Badge>
        )}
        {subtopic && <span className="text-xs font-medium text-muted-foreground/80 truncate">{subtopic}</span>}
        <div className="ml-auto flex items-center gap-2">
          {difficulty && <Badge variant="outline" className="text-xs py-0.5 border-border/50">{difficulty}</Badge>}
          {typeof maxMarks === "number" && maxMarks > 0 && (
            <Badge variant="secondary" className="text-xs py-0.5 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20">
              {maxMarks} marks
            </Badge>
          )}
          {modeLabel && (
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 gap-1", toneClasses)}>
              {modeTone === "written" ? <BookOpen className="w-3 h-3" /> : modeTone === "mc" ? <Target className="w-3 h-3" /> : null}
              {modeLabel}
            </Badge>
          )}
          {rightSlot}
        </div>
      </div>
      <div className="p-6 sm:p-8">
        <div className="prose prose-base dark:prose-invert max-w-none text-foreground leading-loose">
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
  onSelect,
  className,
}: {
  options: UnifiedOption[];
  selectedAnswer?: string;
  correctAnswer?: string;
  answered?: boolean;
  revealCorrectness?: boolean;
  onSelect?: (label: string) => void;
  className?: string;
}) {
  const isAnswered = answered ?? Boolean(selectedAnswer);

  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3", className)}>
      {options.map((opt) => {
        const isChosen = selectedAnswer === opt.label;
        const isCorrect = opt.label === correctAnswer;
        const color = UNIFIED_OPTION_COLORS[opt.label] ?? "#6b7280";
        const disabled = isAnswered || !onSelect;

        let buttonClasses = "border-border/40 bg-card hover:border-violet-500/40 hover:bg-violet-500/5 hover:shadow-md cursor-pointer hover:-translate-y-1";
        let labelClasses = "bg-muted text-muted-foreground";

        if (isAnswered) {
          if (revealCorrectness && isCorrect) {
            buttonClasses = "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/25 shadow-sm cursor-default";
            labelClasses = "bg-emerald-500 text-white shadow-sm";
          } else if (isChosen) {
            buttonClasses = revealCorrectness
              ? "border-rose-400 bg-rose-50/50 dark:bg-rose-950/20 cursor-default"
              : "border-violet-500/50 bg-violet-500/10 shadow-sm cursor-default";
            labelClasses = revealCorrectness ? "bg-rose-500 text-white shadow-sm" : "bg-violet-500 text-white shadow-sm";
          } else {
            buttonClasses = "border-border/30 opacity-50 cursor-default";
          }
        }

        return (
          <button
            key={opt.label}
            type="button"
            disabled={disabled}
            onClick={() => onSelect?.(opt.label)}
            className={`w-full text-left p-4 rounded-2xl border-2 flex items-start gap-4 transition-all duration-300 ${buttonClasses}`}
          >
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm ${labelClasses}`}
              style={!isAnswered ? { backgroundColor: `${color}15`, color } : undefined}
            >
              {opt.label}
            </div>
            <div className="flex-1 text-sm pt-1 prose prose-sm dark:prose-invert max-w-none">
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
  placeholder = "Draft your solution here. Focus on clear working out...",
  onReveal,
  revealLabel = "Skip / Reveal",
  showReveal = false,
  footerNote,
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
    <div className={cn("bg-card border border-border/40 rounded-3xl overflow-hidden shadow-sm", className)}>
      <div className="px-6 py-4 bg-muted/20 border-b border-border/30 flex justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <PenLine className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your Response</span>
        </div>
        <div className="flex items-center gap-3">
          {typeof maxMarks === "number" && maxMarks > 0 && <span className="text-xs font-medium text-muted-foreground">Worth {maxMarks} Marks</span>}
          {headerRight}
        </div>
      </div>
      <div className="p-6">
        {inputSlot ?? (
          <Textarea
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            disabled={disabled}
            placeholder={placeholder}
            className="min-h-[180px] resize-y text-base leading-relaxed p-4 rounded-xl focus-visible:ring-violet-500 border-border/50 disabled:bg-muted/30 disabled:opacity-80"
          />
        )}

        {showReveal && onReveal && (
          <div className="flex items-center gap-3 mt-4">
            <div className="flex-1 h-1 bg-muted/40 rounded-full overflow-hidden">
              {value.trim() && <div className="h-full bg-violet-500/50 rounded-full transition-all" style={{ width: "100%" }} />}
            </div>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={onReveal}>
              <Eye className="w-3.5 h-3.5" /> {revealLabel}
            </Button>
          </div>
        )}

        {footerNote && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground bg-sky-500/5 border border-sky-500/15 rounded-lg px-3 py-2">
            <Sparkles className="w-3 h-3 text-sky-500 shrink-0" />
            <span>{footerNote}</span>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
