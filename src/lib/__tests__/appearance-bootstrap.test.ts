import { beforeEach, describe, expect, it } from 'vitest';

import { resolveInitialAppearance } from '@/lib/appearance-bootstrap';

describe('appearance bootstrap', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('resolves synchronously on a fresh launch', () => {
    const appearance = resolveInitialAppearance();

    expect(appearance).not.toBeInstanceOf(Promise);
    expect(appearance).toEqual({
      designTheme: 'default',
      customThemeSeedColor: '#3b82f6',
    });
  });

  it('uses cached UI preferences without native storage', () => {
    localStorage.setItem(
      'questiongen-ui-prefs',
      JSON.stringify({
        designTheme: 'custom',
        customThemeSeedColor: '#abc',
      }),
    );

    expect(resolveInitialAppearance()).toEqual({
      designTheme: 'custom',
      customThemeSeedColor: '#aabbcc',
    });
  });
});
