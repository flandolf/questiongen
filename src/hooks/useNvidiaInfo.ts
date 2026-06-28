import { invoke } from '@tauri-apps/api/core';
import { useCallback, useState } from 'react';

import { readBackendError } from '@/lib/app-utils';

export interface NvidiaModelEntry {
  id: string;
  name: string | null;
  supportsImages: boolean;
}

export interface NvidiaModelList {
  object: string;
  data: NvidiaModelEntry[];
}

export function useNvidiaModels(apiKey: string | undefined) {
  const [models, setModels] = useState<NvidiaModelList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!apiKey?.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<NvidiaModelList>('list_nvidia_models', {
        apiKey,
      });
      setModels(result);
    } catch (e) {
      setError(readBackendError(e));
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  return { models, loading, error, fetch };
}
