import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface Props {
  onDismiss: () => void;
  canSubmit: boolean;
  canAdvance: boolean;
}

export const KeyboardHintBanner = memo(function KeyboardHintBanner({
  onDismiss,
  canSubmit,
  canAdvance,
}: Props) {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground/60 px-1">
      <div className="flex items-center gap-3">
        {canSubmit && (
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">
              ⌘
            </kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">
              ↵
            </kbd>
            <span className="ml-1">Submit</span>
          </span>
        )}
        {canAdvance && (
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">
              →
            </kbd>
            <span className="ml-1">Next</span>
          </span>
        )}
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">
            Esc
          </kbd>
          <span className="ml-1">Exit</span>
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-5 w-5 p-0 text-muted-foreground/40 hover:text-foreground"
        onClick={onDismiss}
      >
        <X className="w-3 h-3" />
      </Button>
    </div>
  );
});
