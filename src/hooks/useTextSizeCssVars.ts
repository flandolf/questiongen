import { useEffect } from 'react';

import { useAppSettings } from '../AppContext';

export function useTextSizeCssVars() {
  /**
   * Hook that synchronizes app text-size settings into CSS custom properties
   * so components can use `var(--question-text-size)` and
   * `var(--response-text-size)` in styles.
   */
  const { questionTextSize, responseTextSize } = useAppSettings();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--question-text-size', `${questionTextSize}px`);
    root.style.setProperty('--response-text-size', `${responseTextSize}px`);
  }, [questionTextSize, responseTextSize]);
}
