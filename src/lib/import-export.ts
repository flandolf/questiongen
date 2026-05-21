import { invoke } from '@tauri-apps/api/core';

import { APP_VERSION } from '@/views/settings/types';

import type {
  GenerationRecord,
  McHistoryEntry,
  PersistedAppState,
  Preset,
  ProviderState,
  QuestionHistoryEntry,
  SavedQuestionSet,
  StreakData,
  StudentAnswerImage,
  StudyGoals,
} from '../types';
import {
  EMPTY_PERSISTED_APP_STATE,
  isTauriRuntime,
  normalizePersistedAppState,
  normalizeQuestionMode,
  savePersistedAppState,
} from './persistence';
import { formatTauriInvokeError } from './tauri-invoke-error';

async function invokeTauri<T>(
  cmd: string,
  args: Record<string, unknown>,
): Promise<T> {
  /**
   * Helper wrapper around `invoke` that formats Tauri invocation errors.
   */
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    // eslint-disable-next-line preserve-caught-error
    throw new Error(
      `Tauri command "${cmd}" failed: ${formatTauriInvokeError(e)}`,
    );
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────

// Subset of AppState used by import/export — avoids circular dependency with store.ts
export interface ImportExportState {
  apiKey: string;
  model: string;
  markingModel: string;
  useSeparateMarkingModel: boolean;
  imageMarkingModel: string;
  useSeparateImageMarkingModel: boolean;
  debugMode: boolean;
  showRawLlmOutput: boolean;
  questionTextSize: number;
  responseTextSize: number;
  includeExamContext: boolean;
  providers: Record<string, ProviderState>;
  activeProviderId: string;
  autoSyncIntervalMinutes: number;
  syncApiKey: boolean;
  localBackupFolderPath: string;
  localBackupIntervalMinutes: number;
  theme: string;
  customThemeSeedColor: string;
  interfaceFont: string;
  headingFont: string;
  tutorPersona: string;
  tutorModel: string;
  markerStyle: 'strict' | 'relaxed' | 'targeted' | 'custom';
  customMarkerStyle: string;
  modelReasoningEnabled: boolean;
  modelReasoningEffort:
    | 'xhigh'
    | 'high'
    | 'max'
    | 'medium'
    | 'low'
    | 'minimal'
    | 'none';
  markingReasoningEnabled: boolean;
  markingReasoningEffort:
    | 'xhigh'
    | 'high'
    | 'max'
    | 'medium'
    | 'low'
    | 'minimal'
    | 'none';
  shuffleSubtopics: boolean;
  shuffleQuestions: boolean;
  selectedTopics: PersistedAppState['preferences']['selectedTopics'];
  difficulty: PersistedAppState['preferences']['difficulty'];
  techMode: PersistedAppState['preferences']['techMode'];
  avoidSimilarQuestions: boolean;
  selectedSubtopics: Record<string, string[]>;
  questionCount: number;
  averageMarksPerQuestion: number;
  questionMode: PersistedAppState['preferences']['questionMode'];
  aiDifficultyScalingEnabled: boolean;
  difficultyThresholds: { increase: number; decrease: number };
  questions: PersistedAppState['writtenSession']['questions'];
  activeQuestionIndex: number;
  writtenQuestionPresentedAtById: Record<string, number>;
  answersByQuestionId: Record<string, string>;
  imagesByQuestionId: Record<string, StudentAnswerImage | undefined>;
  feedbackByQuestionId: Record<string, unknown>;
  writtenRawModelOutput: string;
  writtenGenerationTelemetry: PersistedAppState['writtenSession']['generationTelemetry'];
  activeWrittenSavedSetId: string | null;
  mcQuestions: PersistedAppState['mcSession']['questions'];
  activeMcQuestionIndex: number;
  mcQuestionPresentedAtById: Record<string, number>;
  mcAnswersByQuestionId: Record<string, string>;
  mcRawModelOutput: string;
  mcGenerationTelemetry: PersistedAppState['mcSession']['generationTelemetry'];
  activeMcSavedSetId: string | null;
  questionHistory: QuestionHistoryEntry[];
  mcHistory: McHistoryEntry[];
  savedSets: SavedQuestionSet[];
  studyGoals: StudyGoals;
  streakData: StreakData;
  generationHistory: GenerationRecord[];
  presets: Preset[];
  writtenTimer: PersistedAppState['writtenTimer'];
  mcTimer: PersistedAppState['mcTimer'];
  diversityEnabled: boolean;
  strictLatexValidation: boolean;
  timeAllocations: PersistedAppState['timeAllocations'];
}

export interface ExportEnvelope {
  _exportVersion: number;
  _exportedAt: string;
  _appVersion: string;
  state: PersistedAppState;
}

export interface ImportCounts {
  newQuestionHistory: number;
  newMcHistory: number;
  newSavedSets: number;
  newPresets: number;
  newGenerationHistory: number;
  totalImported: number;
}

// ─── Export ────────────────────────────────────────────────────────────────

export function exportAppState(s: ImportExportState): PersistedAppState {
  /**
   * Build a sanitized `PersistedAppState` snapshot from the lighter
   * `ImportExportState` for exporting or backup.
   */
  const preserveImages = true;
  const snapshot = buildExportSnapshot(s, { preserveImages });

  // Strip API keys from top-level settings and all providers
  const strippedProviders: Record<string, NonNullable<typeof snapshot.settings.providers>[string]> = {};
  if (snapshot.settings.providers) {
    for (const [id, provider] of Object.entries(snapshot.settings.providers)) {
      strippedProviders[id] = {
        ...provider,
        apiKey: '',
        keyStatus: 'untested' as const,
        keyLastTestedAt: null,
      };
    }
  }

  snapshot.settings = {
    ...snapshot.settings,
    apiKey: '',
    providers: strippedProviders,
  };

  // Strip API key from saved set preferences
  snapshot.savedSets = snapshot.savedSets.map((ss) => ({
    ...ss,
    preferences: { ...ss.preferences },
  }));

  // Strip API key from preset preferences
  snapshot.presets = (snapshot.presets ?? []).map((p) => ({
    ...p,
    preferences: { ...p.preferences },
  }));

  return snapshot;
}

export function createExportEnvelope(state: PersistedAppState): ExportEnvelope {
  /**
   * Wrap state with metadata for export files.
   */
  return {
    _exportVersion: 1,
    _exportedAt: new Date().toISOString(),
    _appVersion: APP_VERSION,
    state,
  };
}

export function isTauriApp(): boolean {
  /**
   * Check whether the running environment is the Tauri desktop app.
   */
  return isTauriRuntime();
}

export type JsonBackupFileInfo = {
  path: string;
  name: string;
  modifiedAtMs: number;
};

/** Write export JSON into a specific folder (desktop app only). */
export async function exportEnvelopeToDirectory(
  dirPath: string,
  envelope: ExportEnvelope,
  suggestedFilename?: string,
): Promise<string> {
  if (!isTauriApp()) {
    throw new Error('Saving to a backup folder requires the desktop app.');
  }
  return invokeTauri<string>('export_data_file_to_directory', {
    dirPath,
    envelope,
    suggestedFilename: suggestedFilename ?? null,
  });
}

export async function listJsonBackupsInDirectory(
  dirPath: string,
): Promise<JsonBackupFileInfo[]> {
  if (!isTauriApp()) return [];
  return invokeTauri<JsonBackupFileInfo[]>('list_json_files_in_directory', {
    dirPath,
  });
}

export async function readBackupJsonFile(filePath: string): Promise<string> {
  if (!isTauriApp()) {
    throw new Error('Reading backup files requires the desktop app.');
  }
  return invokeTauri<string>('read_text_file', { path: filePath });
}

export async function downloadExport(
  envelope: ExportEnvelope,
): Promise<string | null> {
  const json = JSON.stringify(envelope, null, 2);
  const today = new Date().toISOString().slice(0, 10);
  const filename = `questiongen-export-${today}.json`;

  if (isTauriApp()) {
    return invokeTauri<string>('export_data_file', {
      envelope,
      suggestedFilename: filename,
    });
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return null;
}

// ─── Import ────────────────────────────────────────────────────────────────

export function parseImportText(text: string): PersistedAppState {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new Error('Import file is not valid JSON.');
  }

  const validation = validateImportData(raw);
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Invalid import file');
  }

  let rawState: unknown;
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'state' in raw &&
    typeof (raw as Record<string, unknown>).state === 'object'
  ) {
    rawState = (raw as Record<string, unknown>).state;
  } else {
    rawState = raw;
  }

  const normalized = normalizePersistedAppState(rawState);

  // Strip API keys from top-level settings and all providers
  const strippedProviders: Record<string, NonNullable<typeof normalized.settings.providers>[string]> = {};
  if (normalized.settings.providers) {
    for (const [id, provider] of Object.entries(normalized.settings.providers)) {
      strippedProviders[id] = {
        ...provider,
        apiKey: '',
        keyStatus: 'untested' as const,
        keyLastTestedAt: null,
      };
    }
  }

  normalized.settings = {
    ...normalized.settings,
    apiKey: '',
    providers: strippedProviders,
  };

  return normalized;
}

export function parseImportFile(file: File): Promise<PersistedAppState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseImportText(reader.result as string));
      } catch (err) {
        reject(
          err instanceof Error
            ? err
            : new Error('Failed to parse import file: Unknown error'),
        );
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export function validateImportData(raw: unknown): {
  valid: boolean;
  error?: string;
} {
  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, error: 'Import file is not a valid JSON object.' };
  }

  const obj = raw as Record<string, unknown>;

  // Check for envelope format
  let state: unknown;
  if ('state' in obj && typeof obj.state === 'object' && obj.state !== null) {
    state = obj.state;
  } else {
    state = obj;
  }

  if (typeof state !== 'object' || state === null) {
    return {
      valid: false,
      error: 'Import file does not contain valid state data.',
    };
  }

  const s = state as Record<string, unknown>;
  const expectedKeys = [
    'questionHistory',
    'mcHistory',
    'savedSets',
    'settings',
    'preferences',
  ];
  const foundKeys = expectedKeys.filter(
    (k) => k in s && s[k] !== undefined && s[k] !== null,
  );

  if (foundKeys.length < 2) {
    return {
      valid: false,
      error:
        'Import file does not appear to be a QuestionGen export. Expected keys like questionHistory, mcHistory, savedSets, settings, or preferences.',
    };
  }

  return { valid: true };
}

export function computeImportCounts(
  current: ImportExportState,
  imported: PersistedAppState,
): ImportCounts {
  const newQuestionHistory = imported.questionHistory.filter(
    (item) => !current.questionHistory.some((e) => e.id === item.id),
  ).length;
  const newMcHistory = imported.mcHistory.filter(
    (item) => !current.mcHistory.some((e) => e.id === item.id),
  ).length;
  const newSavedSets = imported.savedSets.filter(
    (item) => !current.savedSets.some((e) => e.id === item.id),
  ).length;
  const newPresets = (imported.presets ?? []).filter(
    (item) => !current.presets.some((e) => e.id === item.id),
  ).length;
  const newGenerationHistory = (imported.generationHistory ?? []).filter(
    (item) => !current.generationHistory.some((e) => e.id === item.id),
  ).length;

  const totalImported =
    newQuestionHistory +
    newMcHistory +
    newSavedSets +
    newPresets +
    newGenerationHistory;

  return {
    newQuestionHistory,
    newMcHistory,
    newSavedSets,
    newPresets,
    newGenerationHistory,
    totalImported,
  };
}

// eslint-disable-next-line complexity
function mergeSettings(
  current: ImportExportState,
  imported: PersistedAppState,
): Partial<ImportExportState> {
  return {
    model: imported.settings.model,
    markingModel: imported.settings.markingModel,
    useSeparateMarkingModel: imported.settings.useSeparateMarkingModel,
    imageMarkingModel: imported.settings.imageMarkingModel,
    useSeparateImageMarkingModel: imported.settings.useSeparateImageMarkingModel,
    debugMode: imported.settings.debugMode,
    questionTextSize: imported.settings.questionTextSize ?? 16,
    responseTextSize: imported.settings.responseTextSize ?? 16,
    includeExamContext: imported.settings.includeExamContext ?? false,
    showRawLlmOutput: imported.settings.showRawLlmOutput ?? false,
    autoSyncIntervalMinutes: imported.settings.autoSyncIntervalMinutes ?? 0,
    syncApiKey: imported.settings.syncApiKey ?? false,
    localBackupFolderPath: imported.settings.localBackupFolderPath ?? '',
    localBackupIntervalMinutes: imported.settings.localBackupIntervalMinutes ?? 0,
    theme: imported.settings.theme ?? current.theme,
    customThemeSeedColor: imported.settings.customThemeSeedColor ?? current.customThemeSeedColor,
    interfaceFont: imported.settings.interfaceFont ?? current.interfaceFont,
    headingFont: imported.settings.headingFont ?? current.headingFont,
    tutorPersona: imported.settings.tutorPersona ?? '',
    tutorModel: imported.settings.tutorModel ?? current.tutorModel,
    markerStyle: imported.settings.markerStyle ?? 'strict',
    customMarkerStyle: imported.settings.customMarkerStyle ?? '',
    modelReasoningEnabled: imported.settings.modelReasoningEnabled ?? false,
    modelReasoningEffort: imported.settings.modelReasoningEffort ?? 'medium',
    markingReasoningEnabled: imported.settings.markingReasoningEnabled ?? false,
    markingReasoningEffort: imported.settings.markingReasoningEffort ?? 'medium',
    shuffleSubtopics: imported.settings.shuffleSubtopics ?? false,
    shuffleQuestions: imported.settings.shuffleQuestions ?? false,
  };
}

export function mergeImportedState(
  current: ImportExportState,
  imported: PersistedAppState,
): Partial<ImportExportState> {
  const merged: Partial<ImportExportState> = {};

  // Array collections: merge by id, existing entries kept
  merged.questionHistory = mergeById(
    current.questionHistory,
    imported.questionHistory,
  );
  merged.mcHistory = mergeById(current.mcHistory, imported.mcHistory);
  merged.savedSets = mergeById(current.savedSets, imported.savedSets);
  merged.presets = mergeById(current.presets, imported.presets ?? []);
  merged.generationHistory = mergeById(
    current.generationHistory,
    imported.generationHistory ?? [],
  );

  // Settings: overwrite, but preserve local API key
  Object.assign(merged, mergeSettings(current, imported));
  // API key is NOT overwritten — keep current.apiKey

  // Preferences: overwrite
  merged.selectedTopics = imported.preferences.selectedTopics;
  merged.difficulty = imported.preferences.difficulty;
  merged.techMode = imported.preferences.techMode;
  merged.avoidSimilarQuestions = imported.preferences.avoidSimilarQuestions;
  merged.selectedSubtopics = imported.preferences.selectedSubtopics;
  merged.questionCount = imported.preferences.questionCount;
  merged.averageMarksPerQuestion = imported.preferences.averageMarksPerQuestion;
  merged.questionMode = normalizeQuestionMode(
    imported.preferences.questionMode,
  );
  merged.aiDifficultyScalingEnabled =
    imported.preferences.aiDifficultyScalingEnabled ?? true;
  merged.difficultyThresholds = imported.preferences.difficultyThresholds ?? {
    increase: 85,
    decrease: 70,
  };
  merged.diversityEnabled =
    imported.preferences.diversityEnabled ?? merged.diversityEnabled;

  // Study goals: overwrite
  merged.studyGoals = imported.studyGoals ?? current.studyGoals;

  // Streak data: overwrite
  merged.streakData = imported.streakData ?? current.streakData;

  // Active sessions + timer states: overwrite
  merged.writtenTimer = imported.writtenTimer ?? null;
  merged.mcTimer = imported.mcTimer ?? null;
  merged.timeAllocations = imported.timeAllocations;

  return merged;
}

export async function persistAndRehydrate(
  state: ImportExportState,
): Promise<void> {
  const snapshot = buildExportSnapshot(state);
  await savePersistedAppState(snapshot);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function mergeById<T extends { id: string }>(
  existing: T[],
  incoming: T[],
): T[] {
  const existingIds = new Set(existing.map((e) => e.id));
  return [...existing, ...incoming.filter((item) => !existingIds.has(item.id))];
}

function buildExportSnapshot(
  s: ImportExportState,
  options?: { preserveImages?: boolean },
): PersistedAppState {
  const preserveImages = options?.preserveImages ?? false;

  const strippedImages: Record<string, StudentAnswerImage | undefined> = {};
  for (const [key, img] of Object.entries(s.imagesByQuestionId)) {
    if (img) {
      strippedImages[key] = {
        ...img,
        dataUrl: preserveImages ? img.dataUrl : '',
      };
    }
  }

  return {
    version: EMPTY_PERSISTED_APP_STATE.version,
    settings: {
      apiKey: s.apiKey,
      model: s.model,
      markingModel: s.markingModel,
      useSeparateMarkingModel: s.useSeparateMarkingModel,
      imageMarkingModel: s.imageMarkingModel,
      useSeparateImageMarkingModel: s.useSeparateImageMarkingModel,
      debugMode: s.debugMode,
      showRawLlmOutput: s.showRawLlmOutput,
      questionTextSize: s.questionTextSize,
      responseTextSize: s.responseTextSize,
      includeExamContext: s.includeExamContext,
      providers: s.providers,
      activeProviderId: s.activeProviderId,
      autoSyncIntervalMinutes: s.autoSyncIntervalMinutes,
      syncApiKey: s.syncApiKey,
      localBackupFolderPath: s.localBackupFolderPath,
      localBackupIntervalMinutes: s.localBackupIntervalMinutes,
      theme: s.theme,
      customThemeSeedColor: s.customThemeSeedColor,
      interfaceFont: s.interfaceFont,
      headingFont: s.headingFont,
      tutorPersona: s.tutorPersona,
      tutorModel: s.tutorModel,
      markerStyle: s.markerStyle,
      customMarkerStyle: s.customMarkerStyle,
      modelReasoningEnabled: s.modelReasoningEnabled,
      modelReasoningEffort: s.modelReasoningEffort,
      markingReasoningEnabled: s.markingReasoningEnabled,
      markingReasoningEffort: s.markingReasoningEffort,
      shuffleSubtopics: s.shuffleSubtopics,
      shuffleQuestions: s.shuffleQuestions,
    },
    preferences: {
      selectedTopics: s.selectedTopics,
      difficulty: s.difficulty,
      techMode: s.techMode,
      avoidSimilarQuestions: s.avoidSimilarQuestions,
      selectedSubtopics: s.selectedSubtopics,
      questionCount: s.questionCount,
      averageMarksPerQuestion: s.averageMarksPerQuestion,
      questionMode: s.questionMode,
      aiDifficultyScalingEnabled: s.aiDifficultyScalingEnabled,
      difficultyThresholds: s.difficultyThresholds,
      diversityEnabled: s.diversityEnabled,
      strictLatexValidation: s.strictLatexValidation,
    },
    writtenSession: {
      questions: s.questions,
      activeQuestionIndex: s.activeQuestionIndex,
      presentedAtByQuestionId: s.writtenQuestionPresentedAtById,
      answersByQuestionId: s.answersByQuestionId,
      imagesByQuestionId: strippedImages,
      feedbackByQuestionId:
        s.feedbackByQuestionId as PersistedAppState['writtenSession']['feedbackByQuestionId'],
      rawModelOutput: s.writtenRawModelOutput,
      generationTelemetry: s.writtenGenerationTelemetry,
      savedSetId: s.activeWrittenSavedSetId,
    },
    mcSession: {
      questions: s.mcQuestions,
      activeQuestionIndex: s.activeMcQuestionIndex,
      presentedAtByQuestionId: s.mcQuestionPresentedAtById,
      answersByQuestionId: s.mcAnswersByQuestionId,
      rawModelOutput: s.mcRawModelOutput,
      generationTelemetry: s.mcGenerationTelemetry,
      savedSetId: s.activeMcSavedSetId,
    },
    writtenTimer: s.writtenTimer,
    mcTimer: s.mcTimer,
    questionHistory: s.questionHistory.map((entry) =>
      entry.uploadedAnswerImage
        ? {
            ...entry,
            uploadedAnswerImage: {
              ...entry.uploadedAnswerImage,
              dataUrl: preserveImages ? entry.uploadedAnswerImage.dataUrl : '',
            },
          }
        : entry,
    ),
    mcHistory: s.mcHistory,
    savedSets: s.savedSets,
    studyGoals: s.studyGoals,
    streakData: s.streakData,
    generationHistory: s.generationHistory,
    presets: s.presets,
    timeAllocations: s.timeAllocations,
  };
}
