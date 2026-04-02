import { useShallow } from 'zustand/react/shallow';
import { useMemo } from 'react';
import { useAppStore } from '@/store';
import { useAppSettings } from '@/AppContext';

/**
 * Hook that provides all generator settings from Zustand store,
 * eliminating the need for 40+ individually-drilled props.
 */
export function useGeneratorSettings() {
  const prefs = useAppStore(
    useShallow((s) => ({
      questionMode: s.questionMode,
      setQuestionMode: s.setQuestionMode,
      selectedTopics: s.selectedTopics,
      setSelectedTopics: s.setSelectedTopics,
      difficulty: s.difficulty,
      setDifficulty: s.setDifficulty,
      techMode: s.techMode,
      setTechMode: s.setTechMode,
      mathMethodsSubtopics: s.mathMethodsSubtopics,
      setMathMethodsSubtopics: s.setMathMethodsSubtopics,
      specialistMathSubtopics: s.specialistMathSubtopics,
      setSpecialistMathSubtopics: s.setSpecialistMathSubtopics,
      chemistrySubtopics: s.chemistrySubtopics,
      setChemistrySubtopics: s.setChemistrySubtopics,
      physicalEducationSubtopics: s.physicalEducationSubtopics,
      setPhysicalEducationSubtopics: s.setPhysicalEducationSubtopics,
      questionCount: s.questionCount,
      setQuestionCount: s.setQuestionCount,
      averageMarksPerQuestion: s.averageMarksPerQuestion,
      setAverageMarksPerQuestion: s.setAverageMarksPerQuestion,
      avoidSimilarQuestions: s.avoidSimilarQuestions,
      setAvoidSimilarQuestions: s.setAvoidSimilarQuestions,
      aiDifficultyScalingEnabled: s.aiDifficultyScalingEnabled,
      setAiDifficultyScalingEnabled: s.setAiDifficultyScalingEnabled,
      difficultyThresholds: s.difficultyThresholds,
      setDifficultyThresholds: s.setDifficultyThresholds,
    }))
  );

  const settings = useAppSettings();

  return useMemo(() => ({ ...prefs, ...settings }), [prefs, settings]);
}
