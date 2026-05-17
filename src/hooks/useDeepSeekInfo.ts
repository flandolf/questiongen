import { invoke } from '@tauri-apps/api/core';
import { useCallback, useState } from 'react';

import { readBackendError } from '@/lib/app-utils';
import type { DeepSeekBalanceInfo, DeepSeekModelList } from '@/views/settings/types';

export function useDeepSeekBalance(apiKey: string | undefined) {
  const [balance, setBalance] = useState<DeepSeekBalanceInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!apiKey?.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<DeepSeekBalanceInfo>('get_deepseek_balance', {
        apiKey,
      });
      setBalance(result);
    } catch (e) {
      setError(readBackendError(e));
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  return { balance, loading, error, fetch };
}

export function useDeepSeekModels(apiKey: string | undefined) {
  const [models, setModels] = useState<DeepSeekModelList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!apiKey?.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<DeepSeekModelList>('list_deepseek_models', {
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
