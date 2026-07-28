import { describe, expect, it } from 'vitest';

import {
  BUILTIN_PROVIDERS,
  createDefaultProviderState,
  mergeProvidersWithBuiltins,
  stripProviderModelPrefix,
  toProviderModelId,
} from '@/types/provider';
import {
  getImageModelsForProvider,
  getModelsForProvider,
} from '@/views/settings/constants';

describe('provider model ids', () => {
  it('prefixes direct-provider models without changing provider API ids', () => {
    expect(toProviderModelId('nvidia', 'moonshotai/kimi-k2.6')).toBe(
      'nvidia/moonshotai/kimi-k2.6',
    );
    expect(toProviderModelId('nvidia', 'nvidia/neva-22b')).toBe(
      'nvidia/nvidia/neva-22b',
    );
    expect(stripProviderModelPrefix('nvidia/nvidia/neva-22b')).toEqual({
      providerId: 'nvidia',
      modelId: 'nvidia/neva-22b',
    });
    expect(toProviderModelId('openrouter', 'moonshotai/kimi-k2.6')).toBe(
      'moonshotai/kimi-k2.6',
    );
  });

  it('keeps built-in endpoints canonical when loading persisted providers', () => {
    const openrouter = createDefaultProviderState(BUILTIN_PROVIDERS.openrouter);
    openrouter.apiKey = 'saved-key';
    openrouter.config = {
      ...openrouter.config,
      baseUrl: BUILTIN_PROVIDERS.nvidia.baseUrl,
    };

    const providers = mergeProvidersWithBuiltins({ openrouter });

    expect(providers.openrouter.config).toEqual(BUILTIN_PROVIDERS.openrouter);
    expect(providers.openrouter.apiKey).toBe('saved-key');
    expect(providers.nvidia.config).toEqual(BUILTIN_PROVIDERS.nvidia);
  });

  it('offers custom model ids under OpenRouter, not NVIDIA NIM', () => {
    expect(
      getModelsForProvider('openrouter').some((m) => m.id === 'custom'),
    ).toBe(true);
    expect(getModelsForProvider('nvidia').some((m) => m.id === 'custom')).toBe(
      false,
    );
    expect(
      getImageModelsForProvider('openrouter').some((m) => m.id === 'custom'),
    ).toBe(true);
    expect(
      getImageModelsForProvider('nvidia').some((m) => m.id === 'custom'),
    ).toBe(false);
  });
});
