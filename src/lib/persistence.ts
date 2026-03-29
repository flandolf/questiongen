import { invoke } from "@tauri-apps/api/core";
import {
  AnswerAnalytics,
  API_KEY_STORAGE_KEY,
  APP_STATE_STORAGE_KEY,
  CHEMISTRY_SUBTOPICS,
  DEBUG_MODE_STORAGE_KEY,
  McAnswerAnalytics,
  MC_HISTORY_STORAGE_KEY,
  MATH_METHODS_SUBTOPICS,
  McHistoryEntry,
  McOption,
  McQuestion,
  PHYSICAL_EDUCATION_SUBTOPICS,
  PERSISTED_APP_STATE_VERSION,
  PerQuestionTiming,
  PersistedAppState,
  PersistedGeneratorPreferences,
  PersistedMcSession,
  PersistedSettings,
  PersistedTimerState,
  PersistedWrittenSession,
  QUESTION_HISTORY_STORAGE_KEY,
  QuestionHistoryEntry,
  QuestionMode,
  SavedQuestionSet,
  SUBTOPIC_INSTRUCTIONS,
  StudentAnswerImage,
  TOPICS,
  WrittenAnswerAnalytics,
  SPECIALIST_MATH_SUBTOPICS,
   StudyGoals,
   StreakData,
   ExamRecord,
   GenerationRecord,
   Preset,
} from "../types";
import { clampWholeNumber, normalizeMarkResponse } from "./app-utils";

const DEFAULT_SETTINGS: PersistedSettings = {
  apiKey: "",
  model: "google/gemini-3.1-flash-lite-preview",
  markingModel: "google/gemini-3.1-flash-lite-preview",
  useSeparateMarkingModel: false,
  imageMarkingModel: "google/gemini-3.1-flash-lite-preview",
  useSeparateImageMarkingModel: false,
  debugMode: false,
  questionTextSize: 16,
  includeExamContext: true,
};

const DEFAULT_PREFERENCES: PersistedGeneratorPreferences = {
  selectedTopics: [],
  difficulty: "Medium",
  techMode: "mix",
  avoidSimilarQuestions: false,
  mathMethodsSubtopics: [],
  specialistMathSubtopics: [],
  chemistrySubtopics: [],
  physicalEducationSubtopics: [],
  questionCount: 3,
  averageMarksPerQuestion: 10,
  questionMode: "written",
  generationMode: "practice",
  examTimeLimitMinutes: 30,
  subtopicInstructions: SUBTOPIC_INSTRUCTIONS,
  aiDifficultyScalingEnabled: true,
  difficultyThresholds: { increase: 85, decrease: 70 },
};

const DEFAULT_WRITTEN_SESSION: PersistedWrittenSession = {
  questions: [],
  activeQuestionIndex: 0,
  presentedAtByQuestionId: {},
  answersByQuestionId: {},
  imagesByQuestionId: {},
  feedbackByQuestionId: {},
  rawModelOutput: "",
  generationTelemetry: null,
  savedSetId: null,
};

const DEFAULT_MC_SESSION: PersistedMcSession = {
  questions: [],
  activeQuestionIndex: 0,
  presentedAtByQuestionId: {},
  answersByQuestionId: {},
  rawModelOutput: "",
  generationTelemetry: null,
  savedSetId: null,
};

const DEFAULT_STUDY_GOALS: StudyGoals = {
  dailyQuestionGoal: 10,
  dailyWrittenGoal: 5,
  dailyMcGoal: 5,
  weeklyStreakGoal: 5,
};

const DEFAULT_STREAK_DATA: StreakData = {
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: "",
  dailyCompletions: {},
};

export const EMPTY_PERSISTED_APP_STATE: PersistedAppState = {
  version: PERSISTED_APP_STATE_VERSION,
  settings: DEFAULT_SETTINGS,
  preferences: DEFAULT_PREFERENCES,
  writtenSession: DEFAULT_WRITTEN_SESSION,
  mcSession: DEFAULT_MC_SESSION,
  questionHistory: [],
  mcHistory: [],
  savedSets: [],
  studyGoals: DEFAULT_STUDY_GOALS,
  streakData: DEFAULT_STREAK_DATA,
  generationHistory: [],
  presets: [], // Generator parameter presets (Firebase-synced)
};

export async function loadPersistedAppState(): Promise<PersistedAppState> {
  const raw = await loadRawPersistedState();
  const hasDurableState = isRecord(raw) && Object.keys(raw).length > 0;
  const normalized = normalizePersistedAppState(raw);
  return hasDurableState ? normalized : applyLegacyMigration(normalized);
}

export async function savePersistedAppState(state: PersistedAppState): Promise<void> {
  if (isTauriRuntime()) {
    await invoke("save_persisted_state", { state });
    clearLegacyLocalStorage();
    return;
  }

  window.localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(state));
}

// Convenience helper to persist immediately from other modules.
export async function persistNow(state: PersistedAppState): Promise<void> {
  return savePersistedAppState(state);
}

export function normalizePersistedAppState(raw: unknown): PersistedAppState {
  const data = isRecord(raw) ? raw : {};
  return {
    version: PERSISTED_APP_STATE_VERSION,
    settings: normalizeSettings(data.settings),
    preferences: normalizePreferences(data.preferences),
    writtenSession: normalizeWrittenSession(data.writtenSession),
    mcSession: normalizeMcSession(data.mcSession),
    questionHistory: normalizeQuestionHistory(data.questionHistory),
    mcHistory: normalizeMcHistory(data.mcHistory),
    savedSets: normalizeSavedSets(data.savedSets),
    studyGoals: normalizeStudyGoals(data.studyGoals),
    streakData: normalizeStreakData(data.streakData),
    examHistory: normalizeExamHistory(data.examHistory),
    generationHistory: normalizeGenerationHistory(data.generationHistory),
    presets: normalizePresets(data.presets),
    writtenTimerState: normalizeTimerState(data.writtenTimerState),
    mcTimerState: normalizeTimerState(data.mcTimerState),
  };
}

function normalizeExamHistory(raw: unknown): ExamRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is ExamRecord =>
    isRecord(item) &&
    typeof item.id === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.topic === "string" &&
    Array.isArray(item.questionResults)
  );
}

function normalizeGenerationHistory(raw: unknown): GenerationRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is GenerationRecord =>
    isRecord(item) &&
    typeof item.id === "string" &&
    typeof item.timestamp === "string" &&
    isRecord(item.inputs) &&
    typeof item.inputs.topic === "string" &&
    typeof item.inputs.difficulty === "string" &&
    typeof item.inputs.questionCount === "number" &&
    typeof item.inputs.questionMode === "string" &&
    typeof item.inputs.techMode === "string" &&
    isRecord(item.outputs) &&
    typeof item.outputs.durationMs === "number"
  );
}

function applyLegacyMigration(state: PersistedAppState): PersistedAppState {
  const next = { ...state };
  const legacyApiKey = window.localStorage.getItem(API_KEY_STORAGE_KEY)?.trim() ?? "";
  const legacyDebugMode = window.localStorage.getItem(DEBUG_MODE_STORAGE_KEY) === "true";

  if (legacyApiKey.length > 0) {
    next.settings = { ...next.settings, apiKey: legacyApiKey };
  }
  if (legacyDebugMode) {
    next.settings = { ...next.settings, debugMode: true };
  }

  const legacyWrittenHistory = parseJsonArray(window.localStorage.getItem(QUESTION_HISTORY_STORAGE_KEY));
  if (legacyWrittenHistory.length > 0) {
    next.questionHistory = normalizeQuestionHistory(legacyWrittenHistory);
  }

  const legacyMcHistory = parseJsonArray(window.localStorage.getItem(MC_HISTORY_STORAGE_KEY));
  if (legacyMcHistory.length > 0) {
    next.mcHistory = normalizeMcHistory(legacyMcHistory);
  }

  return next;
}

async function loadRawPersistedState(): Promise<unknown> {
  if (isTauriRuntime()) {
    try {
      return await invoke("load_persisted_state");
    } catch {
      return {};
    }
  }

  const serialized = window.localStorage.getItem(APP_STATE_STORAGE_KEY);
  if (!serialized) {
    return {};
  }

  try {
  return JSON.parse(serialized);
  } catch {
    window.localStorage.removeItem(APP_STATE_STORAGE_KEY);
    return {};
  }
}

// Expose a helper to persist generation history when saving entire state
export function persistGenerationHistory(history: GenerationRecord[]) {
  try {
    // Best-effort localStorage write for non-Tauri runtime
    if (typeof window !== "undefined") {
      const existing = JSON.parse(window.localStorage.getItem(APP_STATE_STORAGE_KEY) || "{}");
      existing.generationHistory = history;
      window.localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(existing));
    }
  } catch {
    // best-effort only
  }
}

function normalizeSettings(raw: unknown): PersistedSettings {
  const data = isRecord(raw) ? raw : {};
  return {
    apiKey: asString(data.apiKey),
    model: asString(data.model) || DEFAULT_SETTINGS.model,
    markingModel: asString(data.markingModel) || asString(data.model) || DEFAULT_SETTINGS.markingModel,
    useSeparateMarkingModel: Boolean(data.useSeparateMarkingModel),
    imageMarkingModel: asString(data.imageMarkingModel) || asString(data.markingModel) || asString(data.model) || DEFAULT_SETTINGS.imageMarkingModel,
    useSeparateImageMarkingModel: Boolean(data.useSeparateImageMarkingModel),
    debugMode: Boolean(data.debugMode),
    questionTextSize: clampWholeNumber(data.questionTextSize, DEFAULT_SETTINGS.questionTextSize ?? 16, 12, 28),
    includeExamContext: data.includeExamContext !== undefined ? Boolean(data.includeExamContext) : DEFAULT_SETTINGS.includeExamContext,
  };
}

function normalizePreferences(raw: unknown): PersistedGeneratorPreferences {
  const data = isRecord(raw) ? raw : {};

  return {
    selectedTopics: filterStringLiterals(data.selectedTopics, TOPICS),
    difficulty: isDifficulty(data.difficulty) ? data.difficulty : DEFAULT_PREFERENCES.difficulty,
    techMode: isTechMode(data.techMode) ? data.techMode : DEFAULT_PREFERENCES.techMode,
    avoidSimilarQuestions: Boolean(data.avoidSimilarQuestions),
    mathMethodsSubtopics: filterStringLiterals(data.mathMethodsSubtopics, MATH_METHODS_SUBTOPICS),
    specialistMathSubtopics: filterStringLiterals(data.specialistMathSubtopics, SPECIALIST_MATH_SUBTOPICS),
    chemistrySubtopics: filterStringLiterals(data.chemistrySubtopics, CHEMISTRY_SUBTOPICS),
    physicalEducationSubtopics: filterStringLiterals(data.physicalEducationSubtopics, PHYSICAL_EDUCATION_SUBTOPICS),
    questionCount: clampWholeNumber(data.questionCount, DEFAULT_PREFERENCES.questionCount, 1, 20),
    averageMarksPerQuestion: clampWholeNumber(data.averageMarksPerQuestion, DEFAULT_PREFERENCES.averageMarksPerQuestion, 1, 30),
    questionMode: isQuestionMode(data.questionMode) ? data.questionMode : DEFAULT_PREFERENCES.questionMode,
    generationMode: isGenerationMode(data.generationMode) ? data.generationMode : DEFAULT_PREFERENCES.generationMode,
    examTimeLimitMinutes: clampWholeNumber(data.examTimeLimitMinutes, DEFAULT_PREFERENCES.examTimeLimitMinutes ?? 30, 5, 180),
    subtopicInstructions: normalizeSubtopicInstructions(data.subtopicInstructions),
  };
}

function normalizeSubtopicInstructions(raw: unknown): Record<string, string> {
  const merged: Record<string, string> = { ...SUBTOPIC_INSTRUCTIONS };
  if (!isRecord(raw)) {
    return merged;
  }

  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      continue;
    }
    if (typeof value !== "string") {
      continue;
    }
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      continue;
    }
    merged[normalizedKey] = normalizedValue;
  }

  return merged;
}

function normalizeWrittenSession(raw: unknown): PersistedWrittenSession {
  const data = isRecord(raw) ? raw : {};
  const questions = normalizeGeneratedQuestions(data.questions);
  const feedbackByQuestionId = normalizeFeedbackRecord(data.feedbackByQuestionId, questions);

  return {
    questions,
    activeQuestionIndex: clampIndex(data.activeQuestionIndex, questions.length),
    presentedAtByQuestionId: normalizeNumberRecord(data.presentedAtByQuestionId),
    answersByQuestionId: normalizeStringRecord(data.answersByQuestionId),
    imagesByQuestionId: normalizeImageRecord(data.imagesByQuestionId),
    feedbackByQuestionId,
    rawModelOutput: asString(data.rawModelOutput),
    generationTelemetry: normalizeGenerationTelemetry(data.generationTelemetry),
    savedSetId: normalizeNullableString(data.savedSetId),
    timerState: normalizeTimerState(data.timerState) ?? undefined,
  };
}

function normalizeMcSession(raw: unknown): PersistedMcSession {
  const data = isRecord(raw) ? raw : {};
  const questions = normalizeMcQuestions(data.questions);

  return {
    questions,
    activeQuestionIndex: clampIndex(data.activeQuestionIndex, questions.length),
    presentedAtByQuestionId: normalizeNumberRecord(data.presentedAtByQuestionId),
    answersByQuestionId: normalizeStringRecord(data.answersByQuestionId),
    rawModelOutput: asString(data.rawModelOutput),
    generationTelemetry: normalizeGenerationTelemetry(data.generationTelemetry),
    savedSetId: normalizeNullableString(data.savedSetId),
    timerState: normalizeTimerState(data.timerState) ?? undefined,
  };
}

function normalizeSavedSets(raw: unknown): SavedQuestionSet[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => normalizeSavedSet(item))
    .filter((item): item is SavedQuestionSet => item !== null);
}

function normalizeSavedSet(raw: unknown): SavedQuestionSet | null {
  const data = isRecord(raw) ? raw : null;
  if (!data) {
    return null;
  }

  const questionMode = isQuestionMode(data.questionMode) ? data.questionMode : "written";
  const title = asString(data.title) || "Saved set";
  const id = asString(data.id);
  const createdAt = asString(data.createdAt) || new Date(0).toISOString();
  const updatedAt = asString(data.updatedAt) || createdAt;
  const createdAtMs = Date.parse(createdAt);
  const updatedAtMs = Date.parse(updatedAt);
  const fallbackLastModified = Number.isFinite(updatedAtMs)
    ? updatedAtMs
    : Number.isFinite(createdAtMs)
      ? createdAtMs
      : 0;

  if (!id) {
    return null;
  }

  return {
    id,
    title,
    questionMode,
    createdAt,
    updatedAt,
    lastModified: asFiniteNonNegativeNumber(data.lastModified) ?? fallbackLastModified,
    preferences: normalizePreferences(data.preferences),
    writtenSession: questionMode === "written" ? normalizeWrittenSession(data.writtenSession) : undefined,
    mcSession: questionMode === "multiple-choice" ? normalizeMcSession(data.mcSession) : undefined,
  };
}

function normalizeQuestionHistory(raw: unknown): QuestionHistoryEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => normalizeQuestionHistoryEntry(entry))
    .filter((entry): entry is QuestionHistoryEntry => entry !== null);
}

function normalizeQuestionHistoryEntry(raw: unknown): QuestionHistoryEntry | null {
  const data = isRecord(raw) ? raw : null;
  if (!data) {
    return null;
  }

  const question = normalizeGeneratedQuestion(data.question);
  if (!question) {
    return null;
  }

  const createdAt = asString(data.createdAt) || new Date(0).toISOString();
  const fallbackId = deterministicId("qh", {
    createdAt,
    questionId: question.id,
    topic: question.topic,
    promptMarkdown: question.promptMarkdown,
    uploadedAnswer: asString(data.uploadedAnswer),
    workedSolutionMarkdown: asString(data.workedSolutionMarkdown),
  });
  const createdAtMs = Date.parse(createdAt);
  const fallbackLastModified = Number.isFinite(createdAtMs) ? createdAtMs : 0;

  return {
    id: asString(data.id) || fallbackId,
    createdAt,
    lastModified: asFiniteNonNegativeNumber(data.lastModified) ?? fallbackLastModified,
    question,
    uploadedAnswer: asString(data.uploadedAnswer),
    uploadedAnswerImage: normalizeImage(data.uploadedAnswerImage) ?? undefined,
    workedSolutionMarkdown: asString(data.workedSolutionMarkdown),
    markResponse: normalizeMarkResponse(data.markResponse, question.maxMarks),
    generationTelemetry: normalizeGenerationTelemetry(data.generationTelemetry) ?? undefined,
    analytics: normalizeWrittenAnswerAnalytics(data.analytics) ?? undefined,
  };
}

function normalizeMcHistory(raw: unknown): McHistoryEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => normalizeMcHistoryEntry(entry))
    .filter((entry): entry is McHistoryEntry => entry !== null);
}

function normalizeMcHistoryEntry(raw: unknown): McHistoryEntry | null {
  const data = isRecord(raw) ? raw : null;
  if (!data) {
    return null;
  }

  const question = normalizeMcQuestion(data.question);
  if (!question) {
    return null;
  }

  const createdAt = asString(data.createdAt) || new Date(0).toISOString();
  const fallbackId = deterministicId("mch", {
    createdAt,
    questionId: question.id,
    topic: question.topic,
    promptMarkdown: question.promptMarkdown,
    selectedAnswer: asString(data.selectedAnswer),
    correct: Boolean(data.correct),
  });
  const createdAtMs = Date.parse(createdAt);
  const fallbackLastModified = Number.isFinite(createdAtMs) ? createdAtMs : 0;

  return {
    type: "multiple-choice",
    id: asString(data.id) || fallbackId,
    createdAt,
    lastModified: asFiniteNonNegativeNumber(data.lastModified) ?? fallbackLastModified,
    question,
    selectedAnswer: asString(data.selectedAnswer),
    correct: Boolean(data.correct),
    generationTelemetry: normalizeGenerationTelemetry(data.generationTelemetry) ?? undefined,
    analytics: normalizeMcAnswerAnalytics(data.analytics) ?? undefined,
  };
}

function normalizeGeneratedQuestions(raw: unknown) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((question) => normalizeGeneratedQuestion(question))
    .filter((question): question is NonNullable<ReturnType<typeof normalizeGeneratedQuestion>> => question !== null);
}

function normalizeGeneratedQuestion(raw: unknown) {
  const data = isRecord(raw) ? raw : null;
  if (!data) {
    return null;
  }

  const id = asString(data.id);
  const topic = asString(data.topic);
  const promptMarkdown = asString(data.promptMarkdown);
  if (!id || !topic || !promptMarkdown) {
    return null;
  }

  return {
    id,
    topic,
    subtopic: normalizeNullableString(data.subtopic) ?? undefined,
    promptMarkdown,
    maxMarks: clampWholeNumber(data.maxMarks, 10, 1, 30),
    techAllowed: typeof data.techAllowed === "boolean" ? data.techAllowed : undefined,
    distinctnessScore: asFiniteNumber(data.distinctnessScore),
    multiStepDepth: asFiniteNumber(data.multiStepDepth),
  };
}

function normalizeMcQuestions(raw: unknown) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((question) => normalizeMcQuestion(question))
    .filter((question): question is McQuestion => question !== null);
}

function normalizeMcQuestion(raw: unknown): McQuestion | null {
  const data = isRecord(raw) ? raw : null;
  if (!data) {
    return null;
  }

  const id = asString(data.id);
  const topic = asString(data.topic);
  const promptMarkdown = asString(data.promptMarkdown);
  const correctAnswer = asString(data.correctAnswer);
  const explanationMarkdown = asString(data.explanationMarkdown);
  const options = normalizeMcOptions(data.options);

  if (!id || !topic || !promptMarkdown || !correctAnswer || !explanationMarkdown || options.length === 0) {
    return null;
  }

  return {
    id,
    topic,
    subtopic: normalizeNullableString(data.subtopic) ?? undefined,
    promptMarkdown,
    options,
    correctAnswer,
    explanationMarkdown,
    techAllowed: typeof data.techAllowed === "boolean" ? data.techAllowed : undefined,
    distinctnessScore: asFiniteNumber(data.distinctnessScore),
    multiStepDepth: asFiniteNumber(data.multiStepDepth),
  };
}

function normalizeMcOptions(raw: unknown): McOption[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((option) => {
      const data = isRecord(option) ? option : null;
      if (!data) {
        return null;
      }
      const label = asString(data.label);
      const text = asString(data.text);
      if (!label || !text) {
        return null;
      }
      return { label, text };
    })
    .filter((option): option is McOption => option !== null);
}

function normalizeFeedbackRecord(raw: unknown, questions: Array<{ id: string; maxMarks: number }>) {
  if (!isRecord(raw)) {
    return {};
  }

  const maxMarksById = new Map(questions.map((question) => [question.id, question.maxMarks]));
  return Object.entries(raw).reduce<Record<string, ReturnType<typeof normalizeMarkResponse>>>((acc, [key, value]) => {
    acc[key] = normalizeMarkResponse(value, maxMarksById.get(key) ?? 10);
    return acc;
  }, {});
}

function normalizeStringRecord(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) {
    return {};
  }

  return Object.entries(raw).reduce<Record<string, string>>((acc, [key, value]) => {
    if (typeof value === "string") {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function normalizeNumberRecord(raw: unknown): Record<string, number> {
  if (!isRecord(raw)) {
    return {};
  }

  return Object.entries(raw).reduce<Record<string, number>>((acc, [key, value]) => {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function normalizeImageRecord(raw: unknown): Record<string, StudentAnswerImage | undefined> {
  if (!isRecord(raw)) {
    return {};
  }

  return Object.entries(raw).reduce<Record<string, StudentAnswerImage | undefined>>((acc, [key, value]) => {
    const image = normalizeImage(value);
    if (image) {
      acc[key] = image;
    }
    return acc;
  }, {});
}

function normalizeImage(raw: unknown): StudentAnswerImage | null {
  const data = isRecord(raw) ? raw : null;
  if (!data) {
    return null;
  }

  const name = asString(data.name);
  const dataUrl = asString(data.dataUrl);
  if (!name || !dataUrl) {
    return null;
  }

  return { name, dataUrl };
}

function normalizeGenerationTelemetry(raw: unknown) {
  const data = isRecord(raw) ? raw : null;
  if (!data) {
    return null;
  }

  return {
    durationMs: clampWholeNumber(data.durationMs, 0, 0, Number.MAX_SAFE_INTEGER),
    promptTokens: clampWholeNumber(data.promptTokens, 0, 0, Number.MAX_SAFE_INTEGER),
    completionTokens: clampWholeNumber(data.completionTokens, 0, 0, Number.MAX_SAFE_INTEGER),
    totalTokens: clampWholeNumber(data.totalTokens, 0, 0, Number.MAX_SAFE_INTEGER),
    estimatedCostUsd: asFiniteNumber(data.estimatedCostUsd),
    distinctnessAvg: asFiniteNumber(data.distinctnessAvg),
    multiStepDepthAvg: asFiniteNumber(data.multiStepDepthAvg),
  };
}

function normalizeWrittenAnswerAnalytics(raw: unknown): WrittenAnswerAnalytics | null {
  const base = normalizeAnswerAnalytics(raw);
  const data = isRecord(raw) ? raw : null;
  if (!base || !data) {
    return null;
  }

  return {
    ...base,
    attemptKind: isWrittenAttemptKind(data.attemptKind) ? data.attemptKind : "initial",
    markingLatencyMs: asFiniteNumber(data.markingLatencyMs),
  };
}

function normalizeMcAnswerAnalytics(raw: unknown): McAnswerAnalytics | null {
  return normalizeAnswerAnalytics(raw);
}

function normalizeAnswerAnalytics(raw: unknown): AnswerAnalytics | null {
  const data = isRecord(raw) ? raw : null;
  if (!data) {
    return null;
  }

  const attemptSequence = clampWholeNumber(data.attemptSequence, 1, 1, 999);
  const answerCharacterCount = clampWholeNumber(data.answerCharacterCount, 0, 0, 1_000_000);
  const answerWordCount = clampWholeNumber(data.answerWordCount, 0, 0, 200_000);

  return {
    attemptSequence,
    answerCharacterCount,
    answerWordCount,
    usedImageUpload: Boolean(data.usedImageUpload),
    responseLatencyMs: asFiniteNumber(data.responseLatencyMs),
  };
}

function isWrittenAttemptKind(raw: unknown): raw is WrittenAnswerAnalytics["attemptKind"] {
  return raw === "initial" || raw === "appeal" || raw === "override";
}

function clampIndex(raw: unknown, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return clampWholeNumber(raw, 0, 0, length - 1);
}

function parseJsonArray(raw: string | null): unknown[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clearLegacyLocalStorage() {
  window.localStorage.removeItem(API_KEY_STORAGE_KEY);
  window.localStorage.removeItem(DEBUG_MODE_STORAGE_KEY);
  window.localStorage.removeItem(QUESTION_HISTORY_STORAGE_KEY);
  window.localStorage.removeItem(MC_HISTORY_STORAGE_KEY);
}

const isTauri = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

function isTauriRuntime() {
  return isTauri;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeNullableString(value: unknown): string | null {
  const normalized = asString(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function asFiniteNonNegativeNumber(value: unknown): number | undefined {
  const parsed = asFiniteNumber(value);
  if (parsed === undefined || parsed < 0) {
    return undefined;
  }
  return parsed;
}

function deterministicId(prefix: string, payload: Record<string, unknown>): string {
  const input = JSON.stringify(payload);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function isDifficulty(value: unknown): value is PersistedGeneratorPreferences["difficulty"] {
  return value === "Essential Skills" || value === "Easy" || value === "Medium" || value === "Hard" || value === "Extreme";
}

function isTechMode(value: unknown): value is PersistedGeneratorPreferences["techMode"] {
  return value === "tech-free" || value === "tech-active" || value === "mix";
}

function isQuestionMode(value: unknown): value is QuestionMode {
  return value === "written" || value === "multiple-choice";
}

function isGenerationMode(value: unknown): value is "practice" | "exam" {
  return value === "practice" || value === "exam";
}

function filterStringLiterals<T extends readonly string[]>(value: unknown, allowed: T): T[number][] {
  if (!Array.isArray(value)) {
    return [];
  }

  const allowedSet = new Set<string>(allowed);
  return value.filter((item): item is T[number] => typeof item === "string" && allowedSet.has(item));
}

function normalizeStudyGoals(raw: unknown): StudyGoals {
  if (!isRecord(raw)) return DEFAULT_STUDY_GOALS;
  return {
    dailyQuestionGoal: clampWholeNumber(raw.dailyQuestionGoal, DEFAULT_STUDY_GOALS.dailyQuestionGoal, 1, 50),
    dailyWrittenGoal: clampWholeNumber(raw.dailyWrittenGoal, DEFAULT_STUDY_GOALS.dailyWrittenGoal, 0, 20),
    dailyMcGoal: clampWholeNumber(raw.dailyMcGoal, DEFAULT_STUDY_GOALS.dailyMcGoal, 0, 20),
    weeklyStreakGoal: clampWholeNumber(raw.weeklyStreakGoal, DEFAULT_STUDY_GOALS.weeklyStreakGoal, 1, 7),
  };
}

function normalizeStreakData(raw: unknown): StreakData {
  if (!isRecord(raw)) return DEFAULT_STREAK_DATA;
  const completions: Record<string, { total: number; written: number; mc: number }> = {};
  if (isRecord(raw.dailyCompletions)) {
    for (const [key, val] of Object.entries(raw.dailyCompletions)) {
      if (isRecord(val)) {
        completions[key] = {
          total: typeof val.total === "number" && val.total >= 0 ? Math.floor(val.total) : 0,
          written: typeof val.written === "number" && val.written >= 0 ? Math.floor(val.written) : 0,
          mc: typeof val.mc === "number" && val.mc >= 0 ? Math.floor(val.mc) : 0,
        };
      }
    }
  }
  return {
    currentStreak: typeof raw.currentStreak === "number" && raw.currentStreak >= 0 ? Math.floor(raw.currentStreak) : 0,
    longestStreak: typeof raw.longestStreak === "number" && raw.longestStreak >= 0 ? Math.floor(raw.longestStreak) : 0,
    lastActiveDate: typeof raw.lastActiveDate === "string" ? raw.lastActiveDate : "",
    dailyCompletions: completions,
  };
}

function normalizePresets(raw: unknown): Preset[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => normalizePreset(item))
    .filter((item): item is Preset => item !== null);
}

function normalizePreset(raw: unknown): Preset | null {
  const data = isRecord(raw) ? raw : null;
  if (!data) return null;

  const id = asString(data.id);
  const name = asString(data.name);
  if (!id || !name) return null;

  return {
    id,
    name,
    preferences: normalizePreferences(data.preferences),
    createdAt: asString(data.createdAt) || new Date(0).toISOString(),
    updatedAt: asString(data.updatedAt) || new Date(0).toISOString(),
    lastModified: asFiniteNonNegativeNumber(data.lastModified) ?? undefined,
  };
}

function normalizeTimerState(raw: unknown): PersistedTimerState | null {
  const data = isRecord(raw) ? raw : null;
  if (!data) return null;
  if (data.sessionStartedAt === null || data.sessionStartedAt === undefined) return null;

  const byQuestionIdRaw = isRecord(data.byQuestionId) ? data.byQuestionId : {};
  const byQuestionId: Record<string, PerQuestionTiming> = {};
  for (const [key, val] of Object.entries(byQuestionIdRaw)) {
    if (!isRecord(val)) continue;
    byQuestionId[key] = {
      timeLimitSeconds: asFiniteNumber(val.timeLimitSeconds) ?? 0,
      originalTimeLimitSeconds: asFiniteNumber(val.originalTimeLimitSeconds) ?? 0,
      startedAt: asFiniteNumber(val.startedAt) ?? null,
      answeredAt: asFiniteNumber(val.answeredAt) ?? null,
      timeUsedSeconds: asFiniteNumber(val.timeUsedSeconds) ?? 0,
      isExpired: Boolean(val.isExpired),
      finishedEarly: Boolean(val.finishedEarly),
      pausedDurationMsAtPresentation: asFiniteNumber(val.pausedDurationMsAtPresentation) ?? 0,
    };
  }

  return {
    byQuestionId,
    totalTimeLimitSeconds: asFiniteNumber(data.totalTimeLimitSeconds) ?? 0,
    sessionStartedAt: asFiniteNumber(data.sessionStartedAt) ?? null,
    sessionFinishedAt: asFiniteNumber(data.sessionFinishedAt) ?? null,
    bankedSeconds: asFiniteNumber(data.bankedSeconds) ?? 0,
    parTimeSeconds: asFiniteNumber(data.parTimeSeconds) ?? 0,
    isPaused: Boolean(data.isPaused),
    pausedDurationMs: asFiniteNumber(data.pausedDurationMs) ?? 0,
    activeQuestionIndex: clampWholeNumber(data.activeQuestionIndex, 0, 0, 999),
    mode: data.mode === "exam" ? "exam" : "practice",
  };
}
