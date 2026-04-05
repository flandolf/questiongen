import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { SyncConflict } from '@/context/modules/deletion-tombstones';
import { cn } from '@/lib/utils';

type ConflictResolution = 'keep' | 'delete';

interface ConflictResolutionDialogProps {
  open: boolean;
  conflicts: SyncConflict[];
  onResolve: (resolutions: Map<string, ConflictResolution>) => void;
  onCancel: () => void;
}

export function ConflictResolutionDialog({
  open,
  conflicts,
  onResolve,
  onCancel,
}: ConflictResolutionDialogProps) {
  const [resolutions, setResolutions] = useState<
    Map<string, ConflictResolution>
  >(new Map());
  const [expanded, setExpanded] = useState(false);

  if (!open || conflicts.length === 0) return null;

  const resolvedCount = resolutions.size;
  const allResolved = resolvedCount === conflicts.length;

  const handleSetItem = (id: string, resolution: ConflictResolution) => {
    setResolutions((prev) => {
      const next = new Map(prev);
      next.set(id, resolution);
      return next;
    });
  };

  const handleKeepAll = () => {
    const next = new Map<string, ConflictResolution>();
    for (const c of conflicts) {
      next.set(c.id, 'keep');
    }
    setResolutions(next);
  };

  const handleDeleteAll = () => {
    const next = new Map<string, ConflictResolution>();
    for (const c of conflicts) {
      next.set(c.id, 'delete');
    }
    setResolutions(next);
  };

  const handleConfirm = () => {
    if (!allResolved) return;
    onResolve(resolutions);
    setResolutions(new Map());
    setExpanded(false);
  };

  const handleCancel = () => {
    setResolutions(new Map());
    setExpanded(false);
    onCancel();
  };

  const collectionLabels: Record<string, string> = {
    questionHistory: 'Written History',
    mcHistory: 'MC History',
    savedSets: 'Saved Sets',
    presets: 'Presets',
  };

  const grouped = new Map<string, SyncConflict[]>();
  for (const c of conflicts) {
    const existing = grouped.get(c.collection) ?? [];
    existing.push(c);
    grouped.set(c.collection, existing);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleCancel} />
      <div className="relative w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="bg-background border rounded-lg shadow-lg flex flex-col max-h-[80vh]">
          <div className="p-4 border-b border-border shrink-0">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold">Sync Conflicts</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {conflicts.length} item{conflicts.length === 1 ? '' : 's'}{' '}
                  deleted locally are also missing from the cloud. Choose to
                  permanently delete or keep each item.
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 p-4 space-y-4">
            <div className="flex gap-2 mb-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={handleKeepAll}
              >
                Keep All
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-destructive hover:text-destructive"
                onClick={handleDeleteAll}
              >
                Delete All
              </Button>
              <span className="text-xs text-muted-foreground ml-auto self-center">
                {resolvedCount}/{conflicts.length} resolved
              </span>
            </div>

            {Array.from(grouped.entries()).map(([collection, items]) => (
              <div key={collection} className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {collectionLabels[collection] ?? collection}
                </h4>
                {items.map((conflict) => {
                  const resolution = resolutions.get(conflict.id);
                  return (
                    <div
                      key={conflict.id}
                      className={cn(
                        'flex items-center justify-between gap-3 p-3 rounded-lg border',
                        resolution === 'keep'
                          ? 'border-emerald-500/30 bg-emerald-500/5'
                          : resolution === 'delete'
                            ? 'border-destructive/30 bg-destructive/5'
                            : 'border-border'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {conflict.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Deleted{' '}
                          {new Date(conflict.localDeletedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant={resolution === 'keep' ? 'default' : 'ghost'}
                          size="sm"
                          className={cn(
                            'text-xs h-7 px-2.5',
                            resolution === 'keep' &&
                              'bg-emerald-600 hover:bg-emerald-700'
                          )}
                          onClick={() => handleSetItem(conflict.id, 'keep')}
                        >
                          Keep
                        </Button>
                        <Button
                          variant={
                            resolution === 'delete' ? 'destructive' : 'ghost'
                          }
                          size="sm"
                          className="text-xs h-7 px-2.5"
                          onClick={() => handleSetItem(conflict.id, 'delete')}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {conflicts.length > 3 && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mx-auto"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="h-3 w-3" /> Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" /> Show{' '}
                    {conflicts.length - 3} more
                  </>
                )}
              </button>
            )}
          </div>

          <div className="p-4 border-t border-border shrink-0 flex justify-end gap-2">
            <Button variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleConfirm}
              disabled={!allResolved}
            >
              Apply Resolutions
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
