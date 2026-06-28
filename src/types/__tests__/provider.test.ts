import { describe, expect, it } from 'vitest';

import { stripProviderModelPrefix, toProviderModelId } from '@/types/provider';

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
});
