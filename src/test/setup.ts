import '@testing-library/jest-dom';

import { vi } from 'vitest';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  message: vi.fn(),
  ask: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  open: vi.fn(),
}));

// Mock Firebase mutations to avoid initializing Firebase in tests
vi.mock('@/context/modules/sync/mutations', () => ({
  deleteMcHistoryEntry: vi.fn(),
  deleteQuestionHistoryEntry: vi.fn(),
  deleteSavedSet: vi.fn(),
  saveGenerationRecord: vi.fn(),
  saveMcHistoryEntry: vi.fn(),
  saveQuestionHistoryEntry: vi.fn(),
  saveSavedSet: vi.fn(),
  updateApiKey: vi.fn(),
  updatePresets: vi.fn(),
  updateStudyGoals: vi.fn(),
}));

// Mock persistence to avoid tauri/fs calls
vi.mock('@/lib/persistence', async (importOriginal) => {
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
  const actual = await importOriginal<any>();
  return {
    ...actual,
    loadPersistedAppState: vi.fn().mockResolvedValue({}),
    savePersistedAppState: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@material/material-color-utilities', () => {
  const createColor = (value: number) => ({
    getArgb: () => value,
  });

  const colorValues = {
    surface: 0xfff8f9fa,
    onSurface: 0xff1f1f1f,
    surfaceContainerLow: 0xfff1f3f4,
    surfaceContainerHigh: 0xffe8eaed,
    primary: 0xff1a73e8,
    onPrimary: 0xffffffff,
    secondary: 0xff5f6368,
    onSecondary: 0xffffffff,
    surfaceContainer: 0xffeceff1,
    onSurfaceVariant: 0xff5f6368,
    secondaryContainer: 0xffd2e3fc,
    onSecondaryContainer: 0xff174ea6,
    error: 0xffd93025,
    onError: 0xffffffff,
    outlineVariant: 0xffc7cdd3,
  } as const;

  class MockScheme {
    constructor(
      public hct: unknown,
      public isDark: boolean,
      public contrastLevel: number,
    ) {}
  }

  return {
    argbFromHex: (value: string) => {
      const normalized = value.replace(/^#/, '').padEnd(6, '0').slice(0, 6);
      return Number.parseInt(`ff${normalized}`, 16);
    },
    hexFromArgb: (argb: number) =>
      `#${(argb & 0xffffff).toString(16).padStart(6, '0')}`,
    Hct: {
      fromInt: (argb: number) => ({ argb }),
    },
    MaterialDynamicColors: Object.fromEntries(
      Object.entries(colorValues).map(([key, value]) => [
        key,
        createColor(value),
      ]),
    ),
    SchemeContent: MockScheme,
    SchemeExpressive: MockScheme,
    SchemeFidelity: MockScheme,
    SchemeFruitSalad: MockScheme,
    SchemeMonochrome: MockScheme,
    SchemeNeutral: MockScheme,
    SchemeRainbow: MockScheme,
    SchemeTonalSpot: MockScheme,
    SchemeVibrant: MockScheme,
  };
});
