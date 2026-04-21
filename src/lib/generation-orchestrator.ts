import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

import { readBackendError } from '@/lib/app-utils';
import {
  buildSubtopicCalls,
  distributeQuestions,
  shuffleMcQuestionOptions,
} from '@/lib/generator-batch';
import { rekeyMc, rekeyWritten } from '@/lib/generator-helpers';
import { applyBatchQualityChecks } from '@/lib/question-cache';
import { shuffleWithSeed } from '@/lib/randomization';
import { useAppStore } from '@/store';
import type { AppActions, AppState } from '@/store/types';
import type {
  BatchTopicProgress,
  GeneratedQuestion,
  GenerateMcQuestionsResponse,
  GenerateQuestionsResponse,
  GenerationTelemetry,
  McQuestion,
  Topic,
} from '@/types';

export const getCanGenerate = (s: AppState) =>
  s.selectedTopics.length > 0 &&
  s.apiKey.trim().length > 0 &&
  s.model.trim().length > 0 &&
  s.questionCount >= 1 &&
  s.questionCount <= 20 &&
  !s.isGenerating;

function getSubtopicsForTopic(topic: Topic, store: AppState): string[] {
  return store.selectedSubtopics[topic] || [];
}

function updateBatchEntry(idx: number, update: Partial<BatchTopicProgress>) {
  const store = useAppStore.getState();
  store.setBatchProgress((prev) => {
    const next = [...prev];
    const entry = next[idx];
    if (entry) next[idx] = { ...entry, ...update };
    return next;
  });
}

function accumulateTopicTelemetry(
  total: GenerationTelemetry,
  current: GenerateQuestionsResponse | GenerateMcQuestionsResponse,
) {
  total.durationMs += current.durationMs || 0;
  total.promptTokens = (total.promptTokens || 0) + (current.promptTokens || 0);
  total.completionTokens =
    (total.completionTokens || 0) + (current.completionTokens || 0);
  total.totalTokens = (total.totalTokens || 0) + (current.totalTokens || 0);
  total.estimatedCostUsd =
    (total.estimatedCostUsd || 0) + (current.estimatedCostUsd || 0);
  if (current.distinctnessAvg !== undefined)
    total.distinctnessAvg = current.distinctnessAvg;
  if (current.multiStepDepthAvg !== undefined)
    total.multiStepDepthAvg = current.multiStepDepthAvg;
}

async function generateTopicQuestions(
  topic: Topic,
  count: number,
  idx: number,
  isMultiTopic: boolean,
  generationSeed: number,
  store: AppState & AppActions,
): Promise<{
  questions: (GeneratedQuestion | McQuestion)[];
  telemetry: GenerationTelemetry | null;
  topic: Topic;
}> {
  if (count === 0) {
    if (isMultiTopic)
      updateBatchEntry(idx, { status: 'done', stage: 'completed' });
    return { questions: [], telemetry: null, topic };
  }

  if (isMultiTopic) {
    updateBatchEntry(idx, {
      status: 'active',
      stage: 'preparing',
      message: 'Preparing focus area...',
    });
  }

  const {
    apiKey,
    model,
    questionMode,
    difficulty,
    techMode,
    includeExamContext,
    avoidSimilarQuestions,
    aiDifficultyScalingEnabled,
    diversityStrictness,
    strictLatexValidation,
    shuffleSubtopics,
    averageMarksPerQuestion,
    generationStrategy,
    customFocusArea,
  } = store;

  try {
    const topicSubtopics = getSubtopicsForTopic(topic, store);
    let topicQuestions: (GeneratedQuestion | McQuestion)[] = [];
    const topicTelemetry: GenerationTelemetry = {
      durationMs: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      distinctnessAvg: 0,
      multiStepDepthAvg: 0,
    };

    if (generationStrategy === 'single-pass') {
      const shuffled = shuffleWithSeed(
        topicSubtopics,
        generationSeed + idx * 17,
      );
      const invokeTarget =
        questionMode === 'written'
          ? 'generate_questions'
          : 'generate_mc_questions';

      store.setStreamText('', topic); // Clear for single pass
      const response = await invoke<
        GenerateQuestionsResponse | GenerateMcQuestionsResponse
      >(invokeTarget, {
        request: {
          topics: [topic],
          difficulty,
          questionCount: count,
          model,
          apiKey,
          techMode,
          includeExamContext,
          subtopics: shuffled,
          shuffleSubtopics: true,
          avoidSimilarQuestions,
          aiDifficultyScalingEnabled,
          diversityStrictness,
          strictLatexValidation,
          averageMarksPerQuestion,
          customFocusArea,
        },
      });
      topicQuestions = response.questions;
      accumulateTopicTelemetry(topicTelemetry, response);
    } else {
      const subCalls = buildSubtopicCalls(topicSubtopics, count, [topic], {
        seed: generationSeed + idx * 1009,
        combineForSmallBatches: true,
      });

      for (let si = 0; si < subCalls.length; si++) {
        const call = subCalls[si];
        if (call.count === 0) continue;

        if (subCalls.length > 1) {
          store.setGenerationSubCallProgress({
            current: si + 1,
            total: subCalls.length,
          });
        }

        const invokeTarget =
          questionMode === 'written'
            ? 'generate_questions'
            : 'generate_mc_questions';

        store.setStreamText('', topic); // Clear for each focus area pass
        const response = await invoke<
          GenerateQuestionsResponse | GenerateMcQuestionsResponse
        >(invokeTarget, {
          request: {
            topics: [topic],
            difficulty,
            questionCount: call.count,
            model,
            apiKey,
            techMode,
            includeExamContext,
            subtopics: call.subtopics,
            shuffleSubtopics,
            avoidSimilarQuestions,
            aiDifficultyScalingEnabled,
            diversityStrictness,
            strictLatexValidation,
            averageMarksPerQuestion,
            customFocusArea,
          },
        });

        const currentQs = response.questions;
        if (questionMode === 'multiple-choice') {
          const adjusted = (currentQs as McQuestion[]).map((q) =>
            shuffleMcQuestionOptions(q),
          );
          topicQuestions = [...topicQuestions, ...adjusted];
        } else {
          topicQuestions = [...topicQuestions, ...currentQs];
        }
        accumulateTopicTelemetry(topicTelemetry, response);
      }
      store.setGenerationSubCallProgress(null);
    }

    if (isMultiTopic)
      updateBatchEntry(idx, { status: 'done', stage: 'completed' });

    return {
      questions: topicQuestions,
      telemetry: topicTelemetry,
      topic,
    };
  } catch (err: unknown) {
    if (isMultiTopic) {
      updateBatchEntry(idx, {
        status: 'error',
        errorMessage: readBackendError(err),
      });
      return { questions: [], telemetry: null, topic };
    }
    throw err;
  }
}

function processResults(
  results: {
    questions: (GeneratedQuestion | McQuestion)[];
    telemetry: GenerationTelemetry | null;
    topic: Topic;
  }[],
  counts: number[],
) {
  let allQuestions: (GeneratedQuestion | McQuestion)[] = [];
  const totalTelemetry: GenerationTelemetry = {
    durationMs: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    distinctnessAvg: 0,
    multiStepDepthAvg: 0,
  };
  let distinctnessWeight = 0;
  let multiStepDepthWeight = 0;
  const failedTopics: string[] = [];

  results.forEach((res, i) => {
    if (!res.telemetry) {
      if (counts[i] > 0) failedTopics.push(res.topic);
      return;
    }
    allQuestions = [...allQuestions, ...res.questions];
    totalTelemetry.durationMs += res.telemetry.durationMs;
    totalTelemetry.promptTokens =
      (totalTelemetry.promptTokens || 0) + (res.telemetry.promptTokens || 0);
    totalTelemetry.completionTokens =
      (totalTelemetry.completionTokens || 0) +
      (res.telemetry.completionTokens || 0);
    totalTelemetry.totalTokens =
      (totalTelemetry.totalTokens || 0) + (res.telemetry.totalTokens || 0);
    totalTelemetry.estimatedCostUsd =
      (totalTelemetry.estimatedCostUsd || 0) +
      (res.telemetry.estimatedCostUsd || 0);

    if (res.telemetry.distinctnessAvg) {
      totalTelemetry.distinctnessAvg =
        (totalTelemetry.distinctnessAvg || 0) +
        res.telemetry.distinctnessAvg * res.questions.length;
      distinctnessWeight += res.questions.length;
    }
    if (res.telemetry.multiStepDepthAvg) {
      totalTelemetry.multiStepDepthAvg =
        (totalTelemetry.multiStepDepthAvg || 0) +
        res.telemetry.multiStepDepthAvg * res.questions.length;
      multiStepDepthWeight += res.questions.length;
    }
  });

  if (distinctnessWeight > 0)
    totalTelemetry.distinctnessAvg =
      (totalTelemetry.distinctnessAvg || 0) / distinctnessWeight;
  if (multiStepDepthWeight > 0)
    totalTelemetry.multiStepDepthAvg =
      (totalTelemetry.multiStepDepthAvg || 0) / multiStepDepthWeight;

  return { allQuestions, totalTelemetry, failedTopics };
}

export async function generateQuestionsOrchestrator() {
  const store = useAppStore.getState();

  if (!getCanGenerate(store)) return;

  const {
    selectedTopics,
    questionCount,
    questionMode,
    difficulty,
    techMode,
    shuffleQuestions,
    averageMarksPerQuestion,
  } = store;

  store.setIsGenerating(true);
  store.setGenerationStartedAt(Date.now());
  store.setErrorMessage(null);

  const generationSeed =
    ((Date.now() & 0x7fffffff) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  const counts = distributeQuestions(selectedTopics, questionCount);
  const isMultiTopic = selectedTopics.length > 1;

  if (isMultiTopic) {
    store.setBatchProgress(
      selectedTopics.map((topic, i) => ({
        topic,
        questionCount: counts[i],
        status: 'waiting' as const,
      })),
    );
  } else {
    store.setBatchProgress([]);
  }

  try {
    const results = await Promise.all(
      selectedTopics.map((topic, i) => {
        // Clear stream text for each new topic pass
        store.setStreamText('', topic);

        return generateTopicQuestions(
          topic,
          counts[i],
          i,
          isMultiTopic,
          generationSeed,
          store,
        );
      }),
    );

    const { allQuestions, totalTelemetry, failedTopics } = processResults(
      results,
      counts,
    );

    if (allQuestions.length === 0) throw new Error('No questions generated');

    if (failedTopics.length > 0) {
      store.setErrorMessage(`Failed for: ${failedTopics.join(', ')}`);
    }

    if (questionMode === 'written') {
      const cleaned = applyBatchQualityChecks(
        rekeyWritten(allQuestions as GeneratedQuestion[]),
      );
      const finalQs = shuffleQuestions
        ? shuffleWithSeed(cleaned.cleanedQuestions, generationSeed + 99)
        : cleaned.cleanedQuestions;
      store.setQuestions(finalQs);
      store.setWrittenGenerationTelemetry(totalTelemetry);
      store.setActiveWrittenSavedSetId(null);
    } else {
      const finalQs = shuffleQuestions
        ? shuffleWithSeed(
            rekeyMc(allQuestions as McQuestion[]),
            generationSeed + 99,
          )
        : rekeyMc(allQuestions as McQuestion[]);
      store.setMcQuestions(finalQs);
      store.setMcGenerationTelemetry(totalTelemetry);
      store.setActiveMcSavedSetId(null);
    }

    store.setActiveQuestionIndex(0);
    store.setActiveMcQuestionIndex(0);
    if (questionMode === 'written') {
      store.setWrittenQuestionPresentedAtById({});
      store.setAnswersByQuestionId({});
      store.setImagesByQuestionId({});
      store.setFeedbackByQuestionId({});
    } else {
      store.setMcQuestionPresentedAtById({});
      store.setMcAnswersByQuestionId({});
    }

    results.forEach((res) => {
      if (res.telemetry && res.topic) {
        store.addGenerationRecord({
          id: `gen-${res.topic}-${Date.now()}`,
          timestamp: new Date().toISOString(),
          inputs: {
            topic: res.topic,
            difficulty,
            questionCount: res.questions.length,
            questionMode,
            techMode,
            averageMarksPerQuestion,
          },
          outputs: res.telemetry,
        });
      }
    });

    toast.success(`Generated ${allQuestions.length} questions.`);
  } catch (err: unknown) {
    console.error('Generation failed:', err);
    store.setErrorMessage(readBackendError(err));
    toast.error('Generation failed.');
  } finally {
    store.setIsGenerating(false);
  }
}
