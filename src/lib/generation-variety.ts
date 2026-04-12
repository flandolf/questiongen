/**
 * Question generation helpers for ensuring variety and avoiding repetition.
 * Tracks question patterns and prevents similar questions from being generated.
 */

interface QuestionPattern {
  topic: string;
  subtopic?: string;
  commandVerb?: string;
  estimatedMarks?: number;
}

interface GenerationContext {
  recentQuestions: QuestionPattern[];
  topicFocusAreas?: string[];
  avoidPatterns?: QuestionPattern[];
}

/**
 * Extract command verbs from question text to identify pattern.
 * Examples: "describe", "explain", "calculate", "derive", etc.
 */
export function extractCommandVerbs(questionText: string): string[] {
  /**
   * Identify common command verbs in question text to detect patterns.
   * @param questionText - Question prompt text
   * @returns Array of matched verbs
   */
  const commonVerbs = [
    'describe',
    'explain',
    'calculate',
    'derive',
    'show',
    'prove',
    'evaluate',
    'analyze',
    'compare',
    'contrast',
    'list',
    'identify',
    'define',
    'state',
    'find',
    'determine',
    'hence',
    'state',
  ];

  const normalizedText = questionText.toLowerCase();
  return commonVerbs.filter((verb) => normalizedText.includes(verb + ' '));
}

/**
 * Calculate similarity between two question patterns (0-1).
 */
export function calculatePatternSimilarity(
  p1: QuestionPattern,
  p2: QuestionPattern,
): number {
  /**
   * Compute a heuristic similarity (0-1) between two question patterns.
   */
  let similarity = 0;
  let factors = 0;

  // Topic match
  if (p1.topic === p2.topic) similarity += 1;
  factors += 1;

  // Subtopic match
  if (p1.subtopic && p2.subtopic && p1.subtopic === p2.subtopic) {
    similarity += 1;
  }
  factors += 1;

  // Command verb match
  if (p1.commandVerb && p2.commandVerb && p1.commandVerb === p2.commandVerb) {
    similarity += 0.5;
  }
  factors += 1;

  // Mark similarity (within 2 marks)
  if (
    p1.estimatedMarks &&
    p2.estimatedMarks &&
    Math.abs(p1.estimatedMarks - p2.estimatedMarks) <= 2
  ) {
    similarity += 0.3;
  }
  factors += 1;

  return Math.min(1, similarity / factors);
}

/**
 * Find patterns that might be too similar to recent generations.
 */
export function findSimilarPatterns(
  pattern: QuestionPattern,
  recentPatterns: QuestionPattern[],
  similarityThreshold: number = 0.6,
): QuestionPattern[] {
  /**
   * Return recent patterns that exceed the similarity threshold for a
   * candidate pattern.
   */
  return recentPatterns.filter((recent) => {
    const similarity = calculatePatternSimilarity(pattern, recent);
    return similarity >= similarityThreshold;
  });
}

/**
 * Build a set of constraints to avoid pattern repetition.
 */
export function buildAvoidanceConstraints(
  generationContext: GenerationContext,
): string {
  /**
   * Build human-readable constraints to include in a generation prompt
   * to avoid repeating recently observed patterns.
   */
  const avoiders: string[] = [];

  if (
    !generationContext.recentQuestions ||
    generationContext.recentQuestions.length === 0
  ) {
    return '';
  }

  // Identify over-represented patterns
  const topicCounts = new Map<string, number>();
  const verbCounts = new Map<string, number>();

  generationContext.recentQuestions.forEach((q) => {
    topicCounts.set(q.topic, (topicCounts.get(q.topic) || 0) + 1);
    if (q.commandVerb) {
      verbCounts.set(q.commandVerb, (verbCounts.get(q.commandVerb) || 0) + 1);
    }
  });

  // Find dominant patterns
  const totalQuestions = generationContext.recentQuestions.length;
  topicCounts.forEach((count, topic) => {
    const ratio = count / totalQuestions;
    if (ratio > 0.4) {
      avoiders.push(
        `Avoid over-relying on ${topic} again (${(ratio * 100).toFixed(0)}% of recent)`,
      );
    }
  });

  verbCounts.forEach((count, verb) => {
    const ratio = count / totalQuestions;
    if (ratio > 0.4) {
      avoiders.push(
        `Use fewer "${verb}" questions (${(ratio * 100).toFixed(0)}% of recent)`,
      );
    }
  });

  if (avoiders.length === 0) {
    return '';
  }

  return '\nVARIETY CONSTRAINTS:\n' + avoiders.map((a) => `- ${a}`).join('\n');
}

/**
 * Score a question for variety based on its patterns.
 * Higher score = more variety from recent questions.
 */
export function scoreVariety(
  question: QuestionPattern,
  recentQuestions: QuestionPattern[],
): number {
  /**
   * Score how novel a question is relative to recentQuestions. Higher means
   * more variety.
   */
  if (recentQuestions.length === 0) return 1;

  const similarities = recentQuestions.map((recent) =>
    calculatePatternSimilarity(question, recent),
  );

  // Average similarity (0-1)
  const avgSimilarity =
    similarities.reduce((a, b) => a + b, 0) / similarities.length;

  // Variety score = 1 - avgSimilarity (higher is better)
  return 1 - avgSimilarity;
}

/**
 * Suggest focus areas to improve question variety.
 */
export function suggestFocusAreas(
  selectedTopics: string[],
  recentQuestions: QuestionPattern[],
): string[] {
  /**
   * Suggest topics to focus on to improve variety based on recent coverage.
   */
  if (recentQuestions.length === 0) {
    return selectedTopics;
  }

  const coveredTopics = new Set(recentQuestions.map((q) => q.topic));
  const underrepresentedTopics = selectedTopics.filter(
    (t) => !coveredTopics.has(t),
  );

  if (underrepresentedTopics.length > 0) {
    return underrepresentedTopics;
  }

  // All topics covered - suggest topic with fewest recent questions
  const topicCounts = new Map<string, number>();
  recentQuestions.forEach((q) => {
    topicCounts.set(q.topic, (topicCounts.get(q.topic) || 0) + 1);
  });

  let minTopic = selectedTopics[0];
  let minCount = Infinity;
  selectedTopics.forEach((t) => {
    const count = topicCounts.get(t) || 0;
    if (count < minCount) {
      minCount = count;
      minTopic = t;
    }
  });

  return [minTopic];
}
