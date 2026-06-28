import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, Search, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { readBackendError } from '@/lib/app-utils';
import { useAppStore } from '@/store';
import {
  getProviderLabelForModel,
  type PresetModel,
  type ProviderResolutionContext,
  type ProviderState,
  stripProviderModelPrefix,
} from '@/types/provider';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { PRESET_IMAGE_MODELS } from './constants';
import {
  getCachedImageValidation,
  setCachedImageValidation,
} from './imageValidationCache';
import type { ImageValidationState, ModelStats } from './types';

export function ImageModelSelectRow({
  id,
  value,
  disabled,
  apiKey,
  models: modelsProp,
  providers: providersProp,
  activeProviderId: activeProviderIdProp,
  resolutionContext,
  onSelect,
  onSearch,
  placeholder = 'Select a vision model',
}: {
  id: string;
  value: string;
  disabled?: boolean;
  apiKey: string;
  models?: PresetModel[];
  /**
   * Optional provider-state map. Falls back to the store selector
   * when omitted so legacy consumers keep working.
   */
  providers?: Record<string, ProviderState>;
  /**
   * Optional active provider id. Falls back to the store selector
   * when omitted.
   */
  activeProviderId?: string;
  /** Optional rich resolution context (catalog Sets etc.). */
  resolutionContext?: ProviderResolutionContext;
  onSelect: (v: string) => void;
  onSearch?: () => void;
  placeholder?: string;
}) {
  const models = modelsProp ?? PRESET_IMAGE_MODELS;
  const [validation, setValidation] = useState<ImageValidationState>({
    status: 'idle',
  });
  const lastValidatedRef = useRef<string>('');

  // Provider context for routing stats requests and labelling badges.
  // Active provider id + base URL are needed so NVIDIA + custom
  // providers hit the new `get_provider_model_stats` command rather
  // than the OpenRouter-only `get_model_stats`.
  const fallbackProviders = useAppStore((s) => s.providers);
  const fallbackActiveProviderId = useAppStore((s) => s.activeProviderId);
  const providers = providersProp ?? fallbackProviders;
  const activeProviderId = activeProviderIdProp ?? fallbackActiveProviderId;

  const validateModel = useCallback(
    async (modelId: string) => {
      if (!modelId || modelId === 'custom' || !apiKey.trim()) {
        setValidation({ status: 'idle' });
        return;
      }
      const explicit = stripProviderModelPrefix(modelId);
      const requestProviderId = explicit.providerId ?? activeProviderId;
      const cached = getCachedImageValidation(apiKey, modelId);
      if (cached !== null) {
        setValidation({ status: cached ? 'supported' : 'unsupported' });
        return;
      }
      setValidation({ status: 'loading' });
      try {
        let supports: boolean;
        if (requestProviderId === 'openrouter') {
          const stats = await invoke<ModelStats>('get_model_stats', {
            apiKey,
            modelId: explicit.modelId,
          });
          supports = stats.supportsImages === true;
        } else {
          const baseUrl =
            providers[requestProviderId]?.config?.baseUrl ?? null;
          const wrapped = await invoke<{ stats: ModelStats }>(
            'get_provider_model_stats',
            {
              apiKey,
              modelId: explicit.modelId,
              providerId: requestProviderId,
              baseUrl: baseUrl ?? undefined,
            },
          );
          supports = wrapped.stats.supportsImages === true;
        }
        setCachedImageValidation(apiKey, modelId, supports);
        setValidation({ status: supports ? 'supported' : 'unsupported' });
      } catch (e) {
        setValidation({ status: 'error', message: readBackendError(e) });
      }
    },
    [apiKey, activeProviderId, providers],
  );

  useEffect(() => {
    if (value === lastValidatedRef.current) return;
    lastValidatedRef.current = value;
    void validateModel(value);
  }, [value, validateModel]);

  const isKnown = models.some((m) => m.id === value);
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
    <div className='space-y-1.5'>
      <div className='flex gap-2 items-center'>
        <Select value={selectVal} onValueChange={onSelect} disabled={disabled}>
          <SelectTrigger id={id} className='w-full min-w-0'>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {extraEntry.map((m) => {
              const provider = getProviderLabelForModel(
                m.id,
                providers,
                { ...(resolutionContext ?? {}), activeProviderId },
              );
              return (
                <SelectItem key={m.id} value={m.id}>
                  <span className='flex items-center gap-2 min-w-0'>
                    <span className='truncate font-mono text-xs'>{m.name}</span>
                    {provider && (
                      <span className='shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-medium leading-none'>
                        {provider}
                      </span>
                    )}
                    <span className='shrink-0 text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-medium leading-none'>
                      custom
                    </span>
                  </span>
                </SelectItem>
              );
            })}
            {extraEntry.length > 0 && (
              <div className='my-1 border-t border-border' />
            )}
            {models.map((m) => {
              const provider =
                m.id !== 'custom'
                  ? getProviderLabelForModel(m.id, providers, {
                      ...(resolutionContext ?? {}),
                      activeProviderId,
                      listingProviderId: m.providerId,
                    })
                  : '';
              return (
                <SelectItem key={m.id} value={m.id}>
                  {m.id === 'custom' ? (
                    m.name
                  ) : (
                    <span className='flex items-center gap-2 min-w-0'>
                      <span className='truncate'>{m.name}</span>
                      {provider && (
                        <span className='shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-medium leading-none'>
                          {provider}
                        </span>
                      )}
                    </span>
                  )}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {onSearch && (
          <Button
            variant='outline'
            size='sm'
            className='shrink-0'
            disabled={disabled}
            onClick={onSearch}
            title='Search vision-capable models'
          >
            <Search className='h-3.5 w-3.5' />
          </Button>
        )}
      </div>
      {validation.status === 'unsupported' &&
        selectVal &&
        selectVal !== 'custom' && (
          <div className='flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400'>
            <ShieldAlert className='h-3.5 w-3.5 shrink-0 mt-0.5' />
            <div>
              <span className='font-semibold'>
                Vision support not detected.
              </span>{' '}
              This model may not be able to process image uploads.
            </div>
          </div>
        )}
      {validation.status === 'error' && (
        <div className='flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground'>
          <AlertCircle className='h-3.5 w-3.5 shrink-0 mt-0.5' />
          <span>Could not verify vision support: {validation.message}</span>
        </div>
      )}
    </div>
  );
}
