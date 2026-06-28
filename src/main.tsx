import './App.css';
import './themes/fonts.css';

import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { ThemeProvider } from './components/theme-provider';
import {
  applyAppearanceToDocument,
  persistUiPrefsAppearance,
  resolveCurrentMode,
  resolveInitialAppearance,
  setupAndroidViewportHeight,
} from './lib/appearance-bootstrap';

async function bootstrap() {
  const initialAppearance = await resolveInitialAppearance();
  const mode = resolveCurrentMode();
  const isDark = mode === 'dark';

  const customThemeVars = applyAppearanceToDocument({
    initialAppearance,
    isDark,
  });

  persistUiPrefsAppearance({
    designTheme: initialAppearance.designTheme,
    customThemeSeedColor: initialAppearance.customThemeSeedColor,
    customThemeVars,
  });

  setupAndroidViewportHeight();

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <ThemeProvider defaultTheme='dark' storageKey='questiongen-theme'>
        <App />
      </ThemeProvider>
    </StrictMode>,
  );
}

void bootstrap();
