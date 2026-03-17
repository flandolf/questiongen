import { useState } from "react";
import {
  ChemistrySubtopic,
  Difficulty,
  EnglishLanguageSubtopic,
  EnglishLanguageTaskType,
  MathMethodsSubtopic,
  PhysicalEducationSubtopic,
  QuestionMode,
  SpecialistMathSubtopic,
  TechMode,
  Topic,
  VceCommandTerm,
} from "../../types";
import { EMPTY_PERSISTED_APP_STATE } from "../../lib/persistence";

export function usePreferencesState() {
  const [selectedTopics, setSelectedTopics] = useState<Topic[]>(
    EMPTY_PERSISTED_APP_STATE.preferences.selectedTopics,
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(
    EMPTY_PERSISTED_APP_STATE.preferences.difficulty,
  );
  const [techMode, setTechMode] = useState<TechMode>(
    EMPTY_PERSISTED_APP_STATE.preferences.techMode,
  );
  const [avoidSimilarQuestions, setAvoidSimilarQuestions] = useState(
    EMPTY_PERSISTED_APP_STATE.preferences.avoidSimilarQuestions,
  );
  const [mathMethodsSubtopics, setMathMethodsSubtopics] = useState<MathMethodsSubtopic[]>(
    EMPTY_PERSISTED_APP_STATE.preferences.mathMethodsSubtopics,
  );
  const [specialistMathSubtopics, setSpecialistMathSubtopics] = useState<SpecialistMathSubtopic[]>(
    EMPTY_PERSISTED_APP_STATE.preferences.specialistMathSubtopics,
  );
  const [chemistrySubtopics, setChemistrySubtopics] = useState<ChemistrySubtopic[]>(
    EMPTY_PERSISTED_APP_STATE.preferences.chemistrySubtopics,
  );
  const [physicalEducationSubtopics, setPhysicalEducationSubtopics] = useState<PhysicalEducationSubtopic[]>(
    EMPTY_PERSISTED_APP_STATE.preferences.physicalEducationSubtopics,
  );
  const [englishLanguageSubtopics, setEnglishLanguageSubtopics] = useState<EnglishLanguageSubtopic[]>(
    EMPTY_PERSISTED_APP_STATE.preferences.englishLanguageSubtopics,
  );
  const [englishLanguageTaskTypes, setEnglishLanguageTaskTypes] = useState<EnglishLanguageTaskType[]>(
    EMPTY_PERSISTED_APP_STATE.preferences.englishLanguageTaskTypes,
  );
  const [questionCount, setQuestionCount] = useState(
    EMPTY_PERSISTED_APP_STATE.preferences.questionCount,
  );
  const [maxMarksPerQuestion, setMaxMarksPerQuestion] = useState(
    EMPTY_PERSISTED_APP_STATE.preferences.maxMarksPerQuestion,
  );
  const [passageAosSubtopic, setPassageAosSubtopic] = useState<EnglishLanguageSubtopic>(
    EMPTY_PERSISTED_APP_STATE.preferences.passageAosSubtopic,
  );
  const [passageQuestionCount, setPassageQuestionCount] = useState(
    EMPTY_PERSISTED_APP_STATE.preferences.passageQuestionCount,
  );
  const [prioritizedCommandTerms, setPrioritizedCommandTerms] = useState<VceCommandTerm[]>(
    EMPTY_PERSISTED_APP_STATE.preferences.prioritizedCommandTerms,
  );
  const [questionMode, setQuestionMode] = useState<QuestionMode>(
    EMPTY_PERSISTED_APP_STATE.preferences.questionMode,
  );
  const [subtopicInstructions, setSubtopicInstructions] = useState<Record<string, string>>(
    EMPTY_PERSISTED_APP_STATE.preferences.subtopicInstructions,
  );

  return {
    selectedTopics,
    setSelectedTopics,
    difficulty,
    setDifficulty,
    techMode,
    setTechMode,
    avoidSimilarQuestions,
    setAvoidSimilarQuestions,
    mathMethodsSubtopics,
    setMathMethodsSubtopics,
    specialistMathSubtopics,
    setSpecialistMathSubtopics,
    chemistrySubtopics,
    setChemistrySubtopics,
    physicalEducationSubtopics,
    setPhysicalEducationSubtopics,
    englishLanguageSubtopics,
    setEnglishLanguageSubtopics,
    englishLanguageTaskTypes,
    setEnglishLanguageTaskTypes,
    questionCount,
    setQuestionCount,
    maxMarksPerQuestion,
    setMaxMarksPerQuestion,
    passageAosSubtopic,
    setPassageAosSubtopic,
    passageQuestionCount,
    setPassageQuestionCount,
    prioritizedCommandTerms,
    setPrioritizedCommandTerms,
    questionMode,
    setQuestionMode,
    subtopicInstructions,
    setSubtopicInstructions,
  };
}
