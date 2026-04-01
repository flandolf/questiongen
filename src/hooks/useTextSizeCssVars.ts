import { useEffect } from 'react';
import { useAppSettings } from '../AppContext';

export function useTextSizeCssVars() {
  const { questionTextSize, responseTextSize } = useAppSettings();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--question-text-size', `${questionTextSize}px`);
    root.style.setProperty('--response-text-size', `${responseTextSize}px`);
  }, [questionTextSize, responseTextSize]);
}
