import type { StateCreator } from 'zustand';

import { updateApiKey, updatePresets } from '@/context/modules/sync/mutations';
import { normalizeHexColor } from '@/lib/color-helpers';
import { EMPTY_PERSISTED_APP_STATE } from '@/lib/persistence';
import { normalizeThemeName, resolve } from '@/store/helpers';
import type { AppActions, AppState } from '@/store/types';

export interface SettingsSlice {
  apiKey: string;
  showApiKey: boolean;
  model: string;
  markingModel: string;
  useSeparateMarkingModel: boolean;
  imageMarkingModel: string;
  useSeparateImageMarkingModel: boolean;
  debugMode: boolean;
  questionTextSize: number;
  responseTextSize: number;
  includeExamContext: boolean;
  autoSyncIntervalMinutes: number;
  syncApiKey: boolean;
  localBackupFolderPath: string;
  localBackupIntervalMinutes: number;
  theme: string;
  customThemeSeedColor: string;
  globalRounding: 'sm' | 'md' | 'lg' | 'xl';
  interfaceFont: string;
  headingFont: string;
  tutorPersona: string;
  tutorModel: string;
  markerStyle: 'strict' | 'relaxed' | 'targeted' | 'custom';
  customMarkerStyle: string;
  presets: AppState['presets'];

  // Preferences
  selectedTopics: AppState['selectedTopics'];
  difficulty: AppState['difficulty'];
  techMode: AppState['techMode'];
  avoidSimilarQuestions: boolean;
  selectedSubtopics: Record<string, string[]>;
  questionCount: number;
  averageMarksPerQuestion: number;
  questionMode: AppState['questionMode'];
  customFocusArea: string;

  // AI Difficulty Scaling
  aiDifficultyScalingEnabled: boolean;
  difficultyThresholds: { increase: number; decrease: number };
  diversityStrictness: 'lenient' | 'moderate' | 'strict';
  strictLatexValidation: boolean;
  shuffleSubtopics: boolean;
  shuffleQuestions: boolean;
  generationStrategy: AppState['generationStrategy'];

  // Actions
  setApiKey: (key: string) => void;
  setShowApiKey: (show: boolean) => void;
  setModel: (model: string) => void;
  setMarkingModel: (model: string) => void;
  setUseSeparateMarkingModel: (enabled: boolean) => void;
  setImageMarkingModel: (model: string) => void;
  setUseSeparateImageMarkingModel: (enabled: boolean) => void;
  setDebugMode: (enabled: boolean) => void;
  clearApiKey: () => void;
  setQuestionTextSize: (size: number) => void;
  setResponseTextSize: (size: number) => void;
  setIncludeExamContext: (enabled: boolean) => void;
  setAutoSyncIntervalMinutes: (minutes: number) => void;
  setSyncApiKey: (enabled: boolean) => void;
  setLocalBackupFolderPath: (path: string) => void;
  setLocalBackupIntervalMinutes: (minutes: number) => void;
  setTheme: (theme: string) => void;
  setCustomThemeSeedColor: (color: string) => void;
  setGlobalRounding: (rounding: 'sm' | 'md' | 'lg' | 'xl') => void;
  setInterfaceFont: (font: string) => void;
  setHeadingFont: (font: string) => void;
  setTutorPersona: (persona: string) => void;
  setTutorModel: (model: string) => void;
  setMarkerStyle: (style: 'strict' | 'relaxed' | 'targeted' | 'custom') => void;
  setCustomMarkerStyle: (style: string) => void;

  setPresets: (presets: AppState['presets']) => void;
  addPreset: (preset: AppState['presets'][0]) => void;
  updatePreset: (preset: AppState['presets'][0]) => void;
  deletePreset: (id: string) => void;

  setSelectedTopics: AppActions['setSelectedTopics'];
  setDifficulty: AppActions['setDifficulty'];
  setTechMode: AppActions['setTechMode'];
  setAvoidSimilarQuestions: AppActions['setAvoidSimilarQuestions'];
  setSelectedSubtopics: AppActions['setSelectedSubtopics'];
  toggleSubtopic: AppActions['toggleSubtopic'];
  setQuestionCount: AppActions['setQuestionCount'];
  setAverageMarksPerQuestion: AppActions['setAverageMarksPerQuestion'];
  setQuestionMode: AppActions['setQuestionMode'];
  setCustomFocusArea: AppActions['setCustomFocusArea'];

  setAiDifficultyScalingEnabled: AppActions['setAiDifficultyScalingEnabled'];
  setDifficultyThresholds: AppActions['setDifficultyThresholds'];
  setDiversityStrictness: AppActions['setDiversityStrictness'];
  setStrictLatexValidation: AppActions['setStrictLatexValidation'];
  setShuffleSubtopics: AppActions['setShuffleSubtopics'];
  setShuffleQuestions: AppActions['setShuffleQuestions'];
  setGenerationStrategy: AppActions['setGenerationStrategy'];
  applyPreferences: AppActions['applyPreferences'];
  resetPreferences: () => void;
}

export const createSettingsSlice: StateCreator<
  AppState & AppActions,
  [],
  [],
  SettingsSlice
> = (set) => ({
  apiKey: EMPTY_PERSISTED_APP_STATE.settings.apiKey,
  showApiKey: false,
  model: EMPTY_PERSISTED_APP_STATE.settings.model,
  markingModel: EMPTY_PERSISTED_APP_STATE.settings.markingModel,
  useSeparateMarkingModel: Boolean(
    EMPTY_PERSISTED_APP_STATE.settings.useSeparateMarkingModel,
  ),
  imageMarkingModel: EMPTY_PERSISTED_APP_STATE.settings.imageMarkingModel,
  useSeparateImageMarkingModel: Boolean(
    EMPTY_PERSISTED_APP_STATE.settings.useSeparateImageMarkingModel,
  ),
  debugMode: EMPTY_PERSISTED_APP_STATE.settings.debugMode,
  questionTextSize: EMPTY_PERSISTED_APP_STATE.settings.questionTextSize ?? 16,
  responseTextSize: EMPTY_PERSISTED_APP_STATE.settings.responseTextSize ?? 16,
  includeExamContext: Boolean(
    EMPTY_PERSISTED_APP_STATE.settings.includeExamContext,
  ),
  autoSyncIntervalMinutes:
    EMPTY_PERSISTED_APP_STATE.settings.autoSyncIntervalMinutes ?? 0,
  syncApiKey: Boolean(EMPTY_PERSISTED_APP_STATE.settings.syncApiKey),
  localBackupFolderPath:
    EMPTY_PERSISTED_APP_STATE.settings.localBackupFolderPath ?? '',
  localBackupIntervalMinutes:
    EMPTY_PERSISTED_APP_STATE.settings.localBackupIntervalMinutes ?? 0,
  theme: normalizeThemeName(EMPTY_PERSISTED_APP_STATE.settings.theme),
  customThemeSeedColor: EMPTY_PERSISTED_APP_STATE.settings.customThemeSeedColor
    ? normalizeHexColor(EMPTY_PERSISTED_APP_STATE.settings.customThemeSeedColor)
    : '#3b82f6',
  globalRounding: 'md',
  interfaceFont: 'Inter Variable',
  headingFont: 'Manrope Variable',
  tutorPersona: EMPTY_PERSISTED_APP_STATE.settings.tutorPersona ?? '',
  tutorModel:
    EMPTY_PERSISTED_APP_STATE.settings.tutorModel ??
    EMPTY_PERSISTED_APP_STATE.settings.model,
  markerStyle:
    (EMPTY_PERSISTED_APP_STATE.settings.markerStyle as
      | 'strict'
      | 'relaxed'
      | 'targeted'
      | 'custom') ?? 'strict',
  customMarkerStyle: EMPTY_PERSISTED_APP_STATE.settings.customMarkerStyle ?? '',
  presets: [],

  selectedTopics: EMPTY_PERSISTED_APP_STATE.preferences.selectedTopics,
  difficulty: EMPTY_PERSISTED_APP_STATE.preferences.difficulty,
  techMode: EMPTY_PERSISTED_APP_STATE.preferences.techMode,
  avoidSimilarQuestions:
    EMPTY_PERSISTED_APP_STATE.preferences.avoidSimilarQuestions,
  selectedSubtopics: EMPTY_PERSISTED_APP_STATE.preferences.selectedSubtopics,
  questionCount: EMPTY_PERSISTED_APP_STATE.preferences.questionCount,
  averageMarksPerQuestion:
    EMPTY_PERSISTED_APP_STATE.preferences.averageMarksPerQuestion,
  questionMode: EMPTY_PERSISTED_APP_STATE.preferences.questionMode,
  customFocusArea: '',

  aiDifficultyScalingEnabled: true,
  difficultyThresholds: { increase: 85, decrease: 70 },
  diversityStrictness: 'moderate',
  strictLatexValidation: true,
  shuffleSubtopics: false,
  shuffleQuestions: false,
  generationStrategy: 'single-pass',

  // Actions
  setApiKey: (key) => {
    set({ apiKey: key });
    void updateApiKey(key);
  },
  setShowApiKey: (show) => set({ showApiKey: show }),
  setModel: (model) => set({ model }),
  setMarkingModel: (markingModel) => set({ markingModel }),
  setUseSeparateMarkingModel: (useSeparateMarkingModel) =>
    set({ useSeparateMarkingModel }),
  setImageMarkingModel: (imageMarkingModel) => set({ imageMarkingModel }),
  setUseSeparateImageMarkingModel: (useSeparateImageMarkingModel) =>
    set({ useSeparateImageMarkingModel }),
  setDebugMode: (debugMode) => set({ debugMode }),
  setQuestionTextSize: (questionTextSize) => set({ questionTextSize }),
  setResponseTextSize: (responseTextSize) => set({ responseTextSize }),
  setIncludeExamContext: (includeExamContext) => set({ includeExamContext }),
  setAutoSyncIntervalMinutes: (autoSyncIntervalMinutes) =>
    set({ autoSyncIntervalMinutes }),
  setSyncApiKey: (syncApiKey) => set({ syncApiKey }),
  setLocalBackupFolderPath: (localBackupFolderPath) =>
    set({ localBackupFolderPath }),
  setLocalBackupIntervalMinutes: (localBackupIntervalMinutes) =>
    set({ localBackupIntervalMinutes }),
  setTheme: (theme) => set({ theme }),
  setCustomThemeSeedColor: (customThemeSeedColor) =>
    set({ customThemeSeedColor: normalizeHexColor(customThemeSeedColor) }),
  setGlobalRounding: (globalRounding) => set({ globalRounding }),
  setInterfaceFont: (interfaceFont) => set({ interfaceFont }),
  setHeadingFont: (headingFont) => set({ headingFont }),
  setTutorPersona: (tutorPersona) => set({ tutorPersona }),
  setTutorModel: (tutorModel) => set({ tutorModel }),
  setMarkerStyle: (markerStyle) => set({ markerStyle }),
  setCustomMarkerStyle: (customMarkerStyle) => set({ customMarkerStyle }),
  clearApiKey: () => set({ apiKey: '' }),

  setPresets: (presets) => set({ presets }),
  addPreset: (preset) =>
    set((s) => {
      const next = [preset, ...s.presets];
      void updatePresets(next);
      return { presets: next };
    }),
  updatePreset: (preset) =>
    set((s) => {
      const next = s.presets.map((p) => (p.id === preset.id ? preset : p));
      void updatePresets(next);
      return { presets: next };
    }),
  deletePreset: (id) =>
    set((s) => {
      const next = s.presets.filter((p) => p.id !== id);
      void updatePresets(next);
      return { presets: next };
    }),

  setSelectedTopics: (update) =>
    set((s) => ({ selectedTopics: resolve(update, s.selectedTopics) })),
  setDifficulty: (difficulty) => set({ difficulty }),
  setTechMode: (techMode) => set({ techMode }),
  setAvoidSimilarQuestions: (avoidSimilarQuestions) =>
    set({ avoidSimilarQuestions }),
  setSelectedSubtopics: (topic, update) =>
    set((s) => ({
      selectedSubtopics: {
        ...s.selectedSubtopics,
        [topic]: resolve(update, s.selectedSubtopics[topic] || []),
      },
    })),
  toggleSubtopic: (topic, sub) =>
    set((s) => {
      const current = s.selectedSubtopics[topic] || [];
      const subs = Array.isArray(sub) ? sub : [sub];
      const next = [...current];
      subs.forEach((item) => {
        const idx = next.indexOf(item);
        if (idx > -1) next.splice(idx, 1);
        else next.push(item);
      });
      return {
        selectedSubtopics: {
          ...s.selectedSubtopics,
          [topic]: next,
        },
      };
    }),
  setQuestionCount: (questionCount) => set({ questionCount }),
  setAverageMarksPerQuestion: (averageMarksPerQuestion) =>
    set({ averageMarksPerQuestion }),
  setQuestionMode: (questionMode) => set({ questionMode }),
  setCustomFocusArea: (customFocusArea: string) => set({ customFocusArea }),

  setAiDifficultyScalingEnabled: (enabled) =>
    set({ aiDifficultyScalingEnabled: enabled }),

  setDifficultyThresholds: (thresholds) =>
    set({ difficultyThresholds: thresholds }),
  setDiversityStrictness: (diversityStrictness) => set({ diversityStrictness }),
  setStrictLatexValidation: (strictLatexValidation) =>
    set({ strictLatexValidation }),
  setShuffleSubtopics: (shuffleSubtopics) => set({ shuffleSubtopics }),
  setShuffleQuestions: (shuffleQuestions) => set({ shuffleQuestions }),
  setGenerationStrategy: (generationStrategy) => set({ generationStrategy }),
  applyPreferences: (prefs) =>
    set(() => {
      const next: Partial<AppState> = {};
      if (prefs.selectedTopics !== undefined)
        next.selectedTopics = prefs.selectedTopics;
      if (prefs.difficulty !== undefined) next.difficulty = prefs.difficulty;
      if (prefs.techMode !== undefined) next.techMode = prefs.techMode;
      if (prefs.questionCount !== undefined)
        next.questionCount = prefs.questionCount;
      if (prefs.averageMarksPerQuestion !== undefined)
        next.averageMarksPerQuestion = prefs.averageMarksPerQuestion;
      if (prefs.questionMode !== undefined)
        next.questionMode = prefs.questionMode;
      if (prefs.customFocusArea !== undefined)
        next.customFocusArea = prefs.customFocusArea;

      // Atomic replacement to avoid "ghost" state from previous selections
      if (prefs.selectedSubtopics !== undefined) {
        next.selectedSubtopics = prefs.selectedSubtopics;
      }

      return next;
    }),
  resetPreferences: () =>
    set({
      selectedTopics: EMPTY_PERSISTED_APP_STATE.preferences.selectedTopics,
      difficulty: EMPTY_PERSISTED_APP_STATE.preferences.difficulty,
      techMode: EMPTY_PERSISTED_APP_STATE.preferences.techMode,
      avoidSimilarQuestions:
        EMPTY_PERSISTED_APP_STATE.preferences.avoidSimilarQuestions,
      selectedSubtopics: {},
      questionCount: EMPTY_PERSISTED_APP_STATE.preferences.questionCount,
      averageMarksPerQuestion:
        EMPTY_PERSISTED_APP_STATE.preferences.averageMarksPerQuestion,
      questionMode: EMPTY_PERSISTED_APP_STATE.preferences.questionMode,
      aiDifficultyScalingEnabled: true,
      difficultyThresholds: { increase: 85, decrease: 70 },
      diversityStrictness: 'moderate',
      strictLatexValidation: true,
      shuffleSubtopics: false,
      shuffleQuestions: false,
      generationStrategy: 'single-pass',
    }),
});
