import { invoke } from '@tauri-apps/api/core';
import { useCallback, useMemo, useState } from 'react';

import { readBackendError } from '@/lib/app-utils';
import { useAppStore } from '@/store';
import { getBaseUrlForProvider, stripProviderModelPrefix } from '@/types/provider';
import { setCachedImageValidation } from '@/views/settings/imageValidationCache';
import type { ModelStats } from '@/views/settings/types';

type ModelType = 'generation' | 'marking' | 'image' | 'tutor';

/**
 * Unified stats fetcher that knows about provider context. For
 * OpenRouter we keep the legacy `get_model_stats` command path
 * (rich object endpoint). For every other provider we use the new
 * `get_provider_model_stats` command which routes by
 * `providerId` + `baseUrl` and returns synthesized minimal stats
 * for endpoints that don't expose structured stats.
 */
async function fetchProviderStats(args: {
  apiKey: string;
  modelId: string;
  providerId: string;
  baseUrl: string | null;
}): Promise<ModelStats> {
  const { apiKey, modelId, providerId, baseUrl } = args;
  if (providerId === 'openrouter') {
    return await invoke<ModelStats>('get_model_stats', {
      apiKey,
      modelId,
    });
  }
  const wrapped = await invoke<{ stats: ModelStats }>(
    'get_provider_model_stats',
    {
      apiKey,
      providerId,
      baseUrl: baseUrl ?? undefined,
      modelId,
    },
  );
  return wrapped.stats;
}

/**
 * Internal helper hook to fetch model statistics from the native bridge.
 */
function useModelStat(
  apiKey: string | undefined,
  modelType: ModelType,
  providerId: string | null,
  baseUrl: string | null,
) {
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const fetch = useCallback(
    async (modelId: string) => {
      if (!apiKey?.trim() || !modelId.trim() || modelId === 'custom') return;
      const explicit = stripProviderModelPrefix(modelId);
      const resolved =
        explicit.providerId ?? providerId ?? useAppStore.getState().activeProviderId;
      const resolvedBaseUrl =
        baseUrl ??
        getBaseUrlForProvider(
          resolved,
          useAppStore.getState().providers,
        );
      if (!resolved) return;

      setLoading(true);
      setError(null);

      try {
        const fetchedStats = await fetchProviderStats({
          apiKey,
          modelId: explicit.modelId,
          providerId: resolved,
          baseUrl: resolvedBaseUrl,
        });

        setStats(fetchedStats);
        setUpdatedAt(new Date());

        if (modelType === 'image') {
          setCachedImageValidation(
            apiKey,
            modelId,
            fetchedStats.supportsImages === true,
          );
        }
      } catch (fetchError) {
        setError(readBackendError(fetchError));
      } finally {
        setLoading(false);
      }
    },
    [apiKey, modelType, providerId, baseUrl],
  );

  return { stats, loading, error, updatedAt, fetch };
}

/**
 * Extracted hook to manage model statistics and reduce component complexity.
 */
export function useModelStats(apiKey: string | undefined) {
  const providers = useAppStore((s) => s.providers);
  const activeProviderId = useAppStore((s) => s.activeProviderId);

  // Pull the active provider's baseUrl so per-provider stats can be
  // routed correctly without forcing every caller to pass it.
  const baseUrl = useMemo(
    () => getBaseUrlForProvider(activeProviderId, providers),
    [activeProviderId, providers],
  );

  const generation = useModelStat(apiKey, 'generation', activeProviderId, baseUrl);
  const marking = useModelStat(apiKey, 'marking', activeProviderId, baseUrl);
  const image = useModelStat(apiKey, 'image', activeProviderId, baseUrl);
  const tutor = useModelStat(apiKey, 'tutor', activeProviderId, baseUrl);

  return {
    generation,
    marking,
    image,
    tutor,
  };
}
