import { invoke } from '@tauri-apps/api/core';
import { useCallback, useState } from 'react';

import { readBackendError } from '@/lib/app-utils';
import { setCachedImageValidation } from '@/views/settings/imageValidationCache';
import type { ModelStats } from '@/views/settings/types';

type ModelType = 'generation' | 'marking' | 'image' | 'tutor';

/**
 * Internal helper hook to fetch model statistics from the native bridge.
 * @param apiKey - API key to use when querying model stats
 * @param modelType - One of 'generation' | 'marking' | 'image' | 'tutor'
 */
function useModelStat(apiKey: string | undefined, modelType: ModelType) {
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const fetch = useCallback(
    async (modelId: string) => {
      if (!apiKey?.trim() || !modelId.trim() || modelId === 'custom') return;

      setLoading(true);
      setError(null);

      try {
        const fetchedStats = await invoke<ModelStats>('get_model_stats', {
          apiKey,
          modelId,
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
    [apiKey, modelType],
  );

  return { stats, loading, error, updatedAt, fetch };
}

/**
 * Extracted hook to manage model statistics and reduce component complexity.
 */
export function useModelStats(apiKey: string | undefined) {
  /**
   * Hook exposing grouped model statistics fetchers for generation, marking,
   * image and tutor model types. Each sub-hook provides `stats`, `loading`,
   * `error`, `updatedAt` and `fetch`.
   *
   * @param apiKey - API key to use for model queries
   */
  const generation = useModelStat(apiKey, 'generation');
  const marking = useModelStat(apiKey, 'marking');
  const image = useModelStat(apiKey, 'image');
  const tutor = useModelStat(apiKey, 'tutor');

  return {
    generation,
    marking,
    image,
    tutor,
  };
}
