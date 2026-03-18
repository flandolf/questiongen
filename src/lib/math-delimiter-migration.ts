import {
  GeneratedPassage,
  GeneratedQuestion,
  MarkAnswerResponse,
  McHistoryEntry,
  McOption,
  McQuestion,
  PersistedAppState,
  PersistedMcSession,
  PersistedPassageSession,
  PersistedWrittenSession,
  QuestionHistoryEntry,
  SavedQuestionSet,
} from "../types";

export type DelimiterMigrationTarget = Pick<
  PersistedAppState,
  "writtenSession" | "passageSession" | "mcSession" | "questionHistory" | "mcHistory" | "savedSets"
>;

export type DelimiterMigrationResult = {
  state: DelimiterMigrationTarget;
  updatedFieldCount: number;
};

type MigrationStats = {
  updatedFieldCount: number;
};

const BLOCK_DOLLAR_MATH_PATTERN = /(^|[^\\])\$\$([\s\S]+?)\$\$/g;
const INLINE_DOLLAR_MATH_PATTERN = /(^|[^\\$])\$(?!\s)([^$\n]*?[^$\s])\$/g;

export function countDollarMathDelimiterMigrations(state: DelimiterMigrationTarget): number {
  return migrateDollarMathDelimitersInState(state).updatedFieldCount;
}

export function migrateDollarMathDelimitersInState(state: DelimiterMigrationTarget): DelimiterMigrationResult {
  const stats: MigrationStats = { updatedFieldCount: 0 };

  const writtenSession = migrateWrittenSession(state.writtenSession, stats);
  const passageSession = migratePassageSession(state.passageSession, stats);
  const mcSession = migrateMcSession(state.mcSession, stats);
  const questionHistory = migrateQuestionHistory(state.questionHistory, stats);
  const mcHistory = migrateMcHistory(state.mcHistory, stats);
  const savedSets = migrateSavedSets(state.savedSets, stats);

  return {
    state: {
      writtenSession,
      passageSession,
      mcSession,
      questionHistory,
      mcHistory,
      savedSets,
    },
    updatedFieldCount: stats.updatedFieldCount,
  };
}

function migrateText(value: string, stats: MigrationStats): string {
  if (!value.includes("$")) {
    return value;
  }

  let updated = value.replace(BLOCK_DOLLAR_MATH_PATTERN, (_match, prefix: string, content: string) => {
    return `${prefix}\\[${content.trim()}\\]`;
  });
  updated = updated.replace(INLINE_DOLLAR_MATH_PATTERN, (_match, prefix: string, content: string) => {
    return `${prefix}\\(${content}\\)`;
  });

  if (updated !== value) {
    stats.updatedFieldCount += 1;
  }

  return updated;
}

function migrateStringRecord(record: Record<string, string>, stats: MigrationStats): Record<string, string> {
  let changed = false;
  const next: Record<string, string> = {};

  for (const [key, value] of Object.entries(record)) {
    const migrated = migrateText(value, stats);
    next[key] = migrated;
    if (migrated !== value) {
      changed = true;
    }
  }

  return changed ? next : record;
}

function migrateGeneratedQuestion(question: GeneratedQuestion, stats: MigrationStats): GeneratedQuestion {
  const promptMarkdown = migrateText(question.promptMarkdown, stats);
  if (promptMarkdown === question.promptMarkdown) {
    return question;
  }

  return {
    ...question,
    promptMarkdown,
  };
}

function migrateGeneratedQuestions(questions: GeneratedQuestion[], stats: MigrationStats): GeneratedQuestion[] {
  let changed = false;
  const next = questions.map((question) => {
    const migrated = migrateGeneratedQuestion(question, stats);
    if (migrated !== question) {
      changed = true;
    }
    return migrated;
  });

  return changed ? next : questions;
}

function migrateMcOption(option: McOption, stats: MigrationStats): McOption {
  const text = migrateText(option.text, stats);
  if (text === option.text) {
    return option;
  }

  return {
    ...option,
    text,
  };
}

function migrateMcQuestion(question: McQuestion, stats: MigrationStats): McQuestion {
  const promptMarkdown = migrateText(question.promptMarkdown, stats);
  const explanationMarkdown = migrateText(question.explanationMarkdown, stats);

  let optionsChanged = false;
  const options = question.options.map((option) => {
    const migrated = migrateMcOption(option, stats);
    if (migrated !== option) {
      optionsChanged = true;
    }
    return migrated;
  });

  if (
    promptMarkdown === question.promptMarkdown &&
    explanationMarkdown === question.explanationMarkdown &&
    !optionsChanged
  ) {
    return question;
  }

  return {
    ...question,
    promptMarkdown,
    explanationMarkdown,
    options: optionsChanged ? options : question.options,
  };
}

function migrateMcQuestions(questions: McQuestion[], stats: MigrationStats): McQuestion[] {
  let changed = false;
  const next = questions.map((question) => {
    const migrated = migrateMcQuestion(question, stats);
    if (migrated !== question) {
      changed = true;
    }
    return migrated;
  });

  return changed ? next : questions;
}

function migrateMarkAnswerResponse(response: MarkAnswerResponse, stats: MigrationStats): MarkAnswerResponse {
  const comparisonToSolutionMarkdown = migrateText(response.comparisonToSolutionMarkdown, stats);
  const feedbackMarkdown = migrateText(response.feedbackMarkdown, stats);
  const workedSolutionMarkdown = migrateText(response.workedSolutionMarkdown, stats);

  let vcaaChanged = false;
  const vcaaMarkingScheme = response.vcaaMarkingScheme.map((criterion) => {
    const criterionText = migrateText(criterion.criterion, stats);
    const rationale = migrateText(criterion.rationale, stats);

    if (criterionText === criterion.criterion && rationale === criterion.rationale) {
      return criterion;
    }

    vcaaChanged = true;
    return {
      ...criterion,
      criterion: criterionText,
      rationale,
    };
  });

  if (
    comparisonToSolutionMarkdown === response.comparisonToSolutionMarkdown &&
    feedbackMarkdown === response.feedbackMarkdown &&
    workedSolutionMarkdown === response.workedSolutionMarkdown &&
    !vcaaChanged
  ) {
    return response;
  }

  return {
    ...response,
    comparisonToSolutionMarkdown,
    feedbackMarkdown,
    workedSolutionMarkdown,
    vcaaMarkingScheme: vcaaChanged ? vcaaMarkingScheme : response.vcaaMarkingScheme,
  };
}

function migrateMarkResponseRecord(
  record: Record<string, MarkAnswerResponse>,
  stats: MigrationStats,
): Record<string, MarkAnswerResponse> {
  let changed = false;
  const next: Record<string, MarkAnswerResponse> = {};

  for (const [key, value] of Object.entries(record)) {
    const migrated = migrateMarkAnswerResponse(value, stats);
    next[key] = migrated;
    if (migrated !== value) {
      changed = true;
    }
  }

  return changed ? next : record;
}

function migrateGeneratedPassage(passage: GeneratedPassage | null, stats: MigrationStats): GeneratedPassage | null {
  if (!passage) {
    return passage;
  }

  const text = migrateText(passage.text, stats);

  let questionsChanged = false;
  const questions = passage.questions.map((question) => {
    const promptMarkdown = migrateText(question.promptMarkdown, stats);
    if (promptMarkdown === question.promptMarkdown) {
      return question;
    }

    questionsChanged = true;
    return {
      ...question,
      promptMarkdown,
    };
  });

  if (text === passage.text && !questionsChanged) {
    return passage;
  }

  return {
    ...passage,
    text,
    questions: questionsChanged ? questions : passage.questions,
  };
}

function migrateWrittenSession(session: PersistedWrittenSession, stats: MigrationStats): PersistedWrittenSession {
  const questions = migrateGeneratedQuestions(session.questions, stats);
  const answersByQuestionId = migrateStringRecord(session.answersByQuestionId, stats);
  const feedbackByQuestionId = migrateMarkResponseRecord(session.feedbackByQuestionId, stats);

  if (
    questions === session.questions &&
    answersByQuestionId === session.answersByQuestionId &&
    feedbackByQuestionId === session.feedbackByQuestionId
  ) {
    return session;
  }

  return {
    ...session,
    questions,
    answersByQuestionId,
    feedbackByQuestionId,
  };
}

function migratePassageSession(session: PersistedPassageSession, stats: MigrationStats): PersistedPassageSession {
  const passage = migrateGeneratedPassage(session.passage, stats);
  const answersByQuestionId = migrateStringRecord(session.answersByQuestionId, stats);
  const feedbackByQuestionId = migrateMarkResponseRecord(session.feedbackByQuestionId, stats);

  if (
    passage === session.passage &&
    answersByQuestionId === session.answersByQuestionId &&
    feedbackByQuestionId === session.feedbackByQuestionId
  ) {
    return session;
  }

  return {
    ...session,
    passage,
    answersByQuestionId,
    feedbackByQuestionId,
  };
}

function migrateMcSession(session: PersistedMcSession, stats: MigrationStats): PersistedMcSession {
  const questions = migrateMcQuestions(session.questions, stats);

  if (questions === session.questions) {
    return session;
  }

  return {
    ...session,
    questions,
  };
}

function migrateQuestionHistory(entries: QuestionHistoryEntry[], stats: MigrationStats): QuestionHistoryEntry[] {
  let changed = false;
  const next = entries.map((entry) => {
    const question = migrateGeneratedQuestion(entry.question, stats);
    const uploadedAnswer = migrateText(entry.uploadedAnswer, stats);
    const workedSolutionMarkdown = migrateText(entry.workedSolutionMarkdown, stats);
    const markResponse = migrateMarkAnswerResponse(entry.markResponse, stats);

    if (
      question === entry.question &&
      uploadedAnswer === entry.uploadedAnswer &&
      workedSolutionMarkdown === entry.workedSolutionMarkdown &&
      markResponse === entry.markResponse
    ) {
      return entry;
    }

    changed = true;
    return {
      ...entry,
      question,
      uploadedAnswer,
      workedSolutionMarkdown,
      markResponse,
    };
  });

  return changed ? next : entries;
}

function migrateMcHistory(entries: McHistoryEntry[], stats: MigrationStats): McHistoryEntry[] {
  let changed = false;
  const next = entries.map((entry) => {
    const question = migrateMcQuestion(entry.question, stats);
    if (question === entry.question) {
      return entry;
    }

    changed = true;
    return {
      ...entry,
      question,
    };
  });

  return changed ? next : entries;
}

function migrateSavedSet(entry: SavedQuestionSet, stats: MigrationStats): SavedQuestionSet {
  const writtenSession = entry.writtenSession ? migrateWrittenSession(entry.writtenSession, stats) : undefined;
  const passageSession = entry.passageSession ? migratePassageSession(entry.passageSession, stats) : undefined;
  const mcSession = entry.mcSession ? migrateMcSession(entry.mcSession, stats) : undefined;

  if (
    writtenSession === entry.writtenSession &&
    passageSession === entry.passageSession &&
    mcSession === entry.mcSession
  ) {
    return entry;
  }

  return {
    ...entry,
    writtenSession,
    passageSession,
    mcSession,
  };
}

function migrateSavedSets(savedSets: SavedQuestionSet[], stats: MigrationStats): SavedQuestionSet[] {
  let changed = false;
  const next = savedSets.map((entry) => {
    const migrated = migrateSavedSet(entry, stats);
    if (migrated !== entry) {
      changed = true;
    }
    return migrated;
  });

  return changed ? next : savedSets;
}
