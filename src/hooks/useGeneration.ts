import { useCallback, useState } from 'react';
import { Topic, GenerationTelemetry } from '@/types';
import { useAppSettings, useAppPreferences } from '@/AppContext';

export interface BatchTopicProgress {
  topic: Topic;
  questionCount: number;
  status: 'waiting' | 'active' | 'done' | 'error';
  stage?: string;
  message?: string;
  errorMessage?: string;
}

export function useGeneration() {
  const { apiKey, model } = useAppSettings();
  const {
    selectedTopics,
    questionCount,
    mathMethodsSubtopics,
    specialistMathSubtopics,
    chemistrySubtopics,
    physicalEducationSubtopics,
    subtopicInstructions,
  } = useAppPreferences();

  const [streamText, setStreamText] = useState('');
  const [batchProgress, setBatchProgress] = useState<BatchTopicProgress[]>([]);
  const [lastSessionTelemetry, setLastSessionTelemetry] =
    useState<GenerationTelemetry | null>(null);

  const getSubtopicsForTopic = useCallback(
    (topic: Topic): string[] => {
      switch (topic) {
        case 'Mathematical Methods':
          return mathMethodsSubtopics;
        case 'Specialist Mathematics':
          return specialistMathSubtopics;
        case 'Chemistry':
          return chemistrySubtopics;
        case 'Physical Education':
          return physicalEducationSubtopics;
        default:
          return [];
      }
    },
    [
      mathMethodsSubtopics,
      specialistMathSubtopics,
      chemistrySubtopics,
      physicalEducationSubtopics,
    ]
  );

  const getSelectedSubtopics = useCallback(() => {
    return Array.from(
      new Set([
        ...(selectedTopics.includes('Mathematical Methods')
          ? mathMethodsSubtopics
          : []),
        ...(selectedTopics.includes('Specialist Mathematics')
          ? specialistMathSubtopics
          : []),
        ...(selectedTopics.includes('Chemistry') ? chemistrySubtopics : []),
        ...(selectedTopics.includes('Physical Education')
          ? physicalEducationSubtopics
          : []),
      ])
    );
  }, [
    selectedTopics,
    mathMethodsSubtopics,
    specialistMathSubtopics,
    chemistrySubtopics,
    physicalEducationSubtopics,
  ]);

  const getSelectedSubtopicInstructions = useCallback(() => {
    const subs = getSelectedSubtopics();
    const hasInstructions = subs.some((sub) =>
      subtopicInstructions[sub]?.trim()
    );
    if (!hasInstructions) return {};
    const result: Record<string, string> = {};
    for (const sub of subs) {
      const instr = subtopicInstructions[sub]?.trim();
      if (instr) result[sub] = instr;
    }
    return result;
  }, [getSelectedSubtopics, subtopicInstructions]);

  const canGenerate =
    selectedTopics.length > 0 &&
    apiKey.trim().length > 0 &&
    model.trim().length > 0 &&
    questionCount >= 1 &&
    questionCount <= 20;

  const initBatchProgress = useCallback(
    (topics: Topic[], counts: number[]): BatchTopicProgress[] => {
      return topics.map((topic, i) => ({
        topic,
        questionCount: counts[i],
        status: 'waiting' as const,
      }));
    },
    []
  );

  const setBatchEntryActive = useCallback((idx: number) => {
    setBatchProgress((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        status: 'active',
        stage: 'preparing',
        message: undefined,
        errorMessage: undefined,
      };
      return next;
    });
    setStreamText('');
  }, []);

  const setBatchEntryDone = useCallback((idx: number) => {
    setBatchProgress((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: 'done', stage: 'completed' };
      return next;
    });
  }, []);

  const setBatchEntryError = useCallback((idx: number, message: string) => {
    setBatchProgress((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: 'error', errorMessage: message };
      return next;
    });
  }, []);

  return {
    streamText,
    setStreamText,
    batchProgress,
    setBatchProgress,
    lastSessionTelemetry,
    setLastSessionTelemetry,
    canGenerate,
    getSubtopicsForTopic,
    getSelectedSubtopics,
    getSelectedSubtopicInstructions,
    initBatchProgress,
    setBatchEntryActive,
    setBatchEntryDone,
    setBatchEntryError,
  };
}
