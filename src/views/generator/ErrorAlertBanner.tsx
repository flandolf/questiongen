import { memo } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '../../components/ui/button';

interface Props {
  errorMessage: string;
  lastFailedAction: string | null;
  onRetry: () => void;
  onDismiss: () => void;
}

export const ErrorAlertBanner = memo(function ErrorAlertBanner({
  errorMessage,
  lastFailedAction,
  onRetry,
  onDismiss,
}: Props) {
  if (!errorMessage) return null;
  return (
    <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-900/50 dark:bg-rose-950/30">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 w-5 h-5 text-rose-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-rose-800 dark:text-rose-200">
            {errorMessage}
          </p>
          {lastFailedAction && (
            <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
              Failed: {lastFailedAction}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {lastFailedAction && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="h-7 px-2 text-xs gap-1 border-rose-300 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/50"
            >
              <RotateCcw className="w-3 h-3" /> Retry
            </Button>
          )}
          <button
            onClick={onDismiss}
            className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-300"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
});
