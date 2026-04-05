import { invoke } from '@tauri-apps/api/core';
import { useCallback, useState } from 'react';

import { readBackendError } from '@/lib/app-utils';
import { setCachedImageValidation } from '@/views/settings/imageValidationCache';
import type { ModelStats } from '@/views/settings/types';

/**
 * Extracted hook to manage model statistics and reduce component complexity.
 */
export function useModelStats(apiKey: string | undefined) {
  const [modelStats, setModelStats] = useState<ModelStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsUpdatedAt, setStatsUpdatedAt] = useState<Date | null>(null);

  const [markingModelStats, setMarkingModelStats] = useState<ModelStats | null>(
    null
  );
  const [markingStatsLoading, setMarkingStatsLoading] = useState(false);
  const [markingStatsError, setMarkingStatsError] = useState<string | null>(
    null
  );
  const [markingStatsUpdatedAt, setMarkingStatsUpdatedAt] =
    useState<Date | null>(null);

  const [imageMarkingModelStats, setImageMarkingModelStats] =
    useState<ModelStats | null>(null);
  const [imageMarkingStatsLoading, setImageMarkingStatsLoading] =
    useState(false);
  const [imageMarkingStatsError, setImageMarkingStatsError] = useState<
    string | null
  >(null);
  const [imageMarkingStatsUpdatedAt, setImageMarkingStatsUpdatedAt] =
    useState<Date | null>(null);

  const fetchGenerationStats = useCallback(
    async (modelId: string) => {
      if (!apiKey?.trim() || !modelId.trim() || modelId === 'custom') return;
      setStatsLoading(true);
      setStatsError(null);
      try {
        const s = await invoke<ModelStats>('get_model_stats', {
          apiKey,
          modelId,
        });
        setModelStats(s);
        setStatsUpdatedAt(new Date());
      } catch (e) {
        setStatsError(readBackendError(e));
      } finally {
        setStatsLoading(false);
      }
    },
    [apiKey]
  );

  const fetchMarkingStats = useCallback(
    async (modelId: string) => {
      if (!apiKey?.trim() || !modelId.trim() || modelId === 'custom') return;
      setMarkingStatsLoading(true);
      setMarkingStatsError(null);
      try {
        const s = await invoke<ModelStats>('get_model_stats', {
          apiKey,
          modelId,
        });
        setMarkingModelStats(s);
        setMarkingStatsUpdatedAt(new Date());
      } catch (e) {
        setMarkingStatsError(readBackendError(e));
      } finally {
        setMarkingStatsLoading(false);
      }
    },
    [apiKey]
  );

  const fetchImageStats = useCallback(
    async (modelId: string) => {
      if (!apiKey?.trim() || !modelId.trim() || modelId === 'custom') return;
      setImageMarkingStatsLoading(true);
      setImageMarkingStatsError(null);
      try {
        const s = await invoke<ModelStats>('get_model_stats', {
          apiKey,
          modelId,
        });
        setImageMarkingModelStats(s);
        setImageMarkingStatsUpdatedAt(new Date());
        setCachedImageValidation(apiKey, modelId, s.supportsImages === true);
      } catch (e) {
        setImageMarkingStatsError(readBackendError(e));
      } finally {
        setImageMarkingStatsLoading(false);
      }
    },
    [apiKey]
  );

  return {
    generation: {
      stats: modelStats,
      loading: statsLoading,
      error: statsError,
      updatedAt: statsUpdatedAt,
      fetch: fetchGenerationStats,
    },
    marking: {
      stats: markingModelStats,
      loading: markingStatsLoading,
      error: markingStatsError,
      updatedAt: markingStatsUpdatedAt,
      fetch: fetchMarkingStats,
    },
    image: {
      stats: imageMarkingModelStats,
      loading: imageMarkingStatsLoading,
      error: imageMarkingStatsError,
      updatedAt: imageMarkingStatsUpdatedAt,
      fetch: fetchImageStats,
    },
  };
}
