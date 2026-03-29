import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Button } from '../../components/ui/button';
import { AlertCircle, Search, ShieldAlert } from 'lucide-react';
import { readBackendError } from '../../lib/app-utils';
import type { ImageValidationState, ModelStats } from './types';
import { PRESET_IMAGE_MODELS } from './constants';
import {
  getCachedImageValidation,
  setCachedImageValidation,
} from './imageValidationCache';

export function ImageModelSelectRow({
  id,
  value,
  disabled,
  apiKey,
  onSelect,
  onSearch,
  placeholder = 'Select a vision model',
}: {
  id: string;
  value: string;
  disabled?: boolean;
  apiKey: string;
  onSelect: (v: string) => void;
  onSearch?: () => void;
  placeholder?: string;
}) {
  const [validation, setValidation] = useState<ImageValidationState>({
    status: 'idle',
  });
  const lastValidatedRef = useRef<string>('');

  const validateModel = useCallback(
    async (modelId: string) => {
      if (!modelId || modelId === 'custom' || !apiKey.trim()) {
        setValidation({ status: 'idle' });
        return;
      }
      const cached = getCachedImageValidation(apiKey, modelId);
      if (cached !== null) {
        setValidation({ status: cached ? 'supported' : 'unsupported' });
        return;
      }
      setValidation({ status: 'loading' });
      try {
        const stats = await invoke<ModelStats>('get_model_stats', {
          apiKey,
          modelId,
        });
        const supports = stats.supportsImages === true;
        setCachedImageValidation(apiKey, modelId, supports);
        setValidation({ status: supports ? 'supported' : 'unsupported' });
      } catch (e) {
        setValidation({ status: 'error', message: readBackendError(e) });
      }
    },
    [apiKey]
  );

  useEffect(() => {
    if (value === lastValidatedRef.current) return;
    lastValidatedRef.current = value;
    void validateModel(value);
  }, [value, validateModel]);

  const isKnown = PRESET_IMAGE_MODELS.some((m) => m.id === value);
  const extraEntry =
    !isKnown && value && value !== 'custom'
      ? [
          {
            id: value,
            name: value.includes('/')
              ? value.split('/').slice(1).join('/')
              : value,
          },
        ]
      : [];
  const selectVal = value && value !== 'custom' ? value : isKnown ? value : '';

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2 items-center">
        <Select value={selectVal} onValueChange={onSelect} disabled={disabled}>
          <SelectTrigger id={id} className="w-full min-w-0">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {extraEntry.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="truncate font-mono text-xs">{m.name}</span>
                  <span className="shrink-0 text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-medium leading-none">
                    custom
                  </span>
                </span>
              </SelectItem>
            ))}
            {extraEntry.length > 0 && (
              <div className="my-1 border-t border-border" />
            )}
            {PRESET_IMAGE_MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.id === 'custom' ? (
                  m.name
                ) : (
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="truncate">{m.name}</span>
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {onSearch && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={disabled}
            onClick={onSearch}
            title="Search vision-capable models"
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {validation.status === 'unsupported' &&
        selectVal &&
        selectVal !== 'custom' && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">
                Vision support not detected.
              </span>{' '}
              This model may not be able to process image uploads.
            </div>
          </div>
        )}
      {validation.status === 'error' && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Could not verify vision support: {validation.message}</span>
        </div>
      )}
    </div>
  );
}
