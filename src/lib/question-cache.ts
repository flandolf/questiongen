/**
 * Question deduplication and caching utilities.
 * Prevents duplicate questions from being generated and caches results.
 */

import type { GeneratedQuestion, McQuestion } from '@/types';

function getQuestionStem(question: GeneratedQuestion | McQuestion): string {
  /**
   * Extract a normalized stem for similarity checks from a question.
   */
  if (typeof question.promptMarkdown === 'string') {
    return question.promptMarkdown.toLowerCase().trim();
  }
  return '';
}

interface GenerationCacheEntry {
  questions: GeneratedQuestion[] | McQuestion[];
  timestamp: number;
  topics: string[];
  difficulty: string;
  mode: 'written' | 'multiple-choice';
}

/**
 * Simple LRU cache for generation results.
 * Stores up to 5 recent generation results per mode.
 */
class GenerationResultCache {
  private cache: Map<string, GenerationCacheEntry> = new Map();
  private readonly maxSize = 5;

  /**
   * Generate a cache key from generation parameters.
   */
  private generateKey(
    topics: string[],
    difficulty: string,
    mode: 'written' | 'multiple-choice',
  ): string {
    return `${mode}:${topics.sort().join('|')}:${difficulty}`;
  }

  /**
   * Store a generation result in the cache.
   */
  set(
    topics: string[],
    difficulty: string,
    mode: 'written' | 'multiple-choice',
    questions: GeneratedQuestion[] | McQuestion[],
  ): void {
    /**
     * Store a generation result in the cache keyed by topics/difficulty/mode.
     */
    const key = this.generateKey(topics, difficulty, mode);

    // Remove oldest entry if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      questions,
      timestamp: Date.now(),
      topics,
      difficulty,
      mode,
    });
  }

  /**
   * Retrieve a cached generation result (valid for 1 hour).
   */
  get(
    topics: string[],
    difficulty: string,
    mode: 'written' | 'multiple-choice',
  ): GeneratedQuestion[] | McQuestion[] | null {
    /**
     * Retrieve a cached generation result if not expired (1 hour).
     */
    const key = this.generateKey(topics, difficulty, mode);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Cache expires after 1 hour
    const isExpired = Date.now() - entry.timestamp > 3600000;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return entry.questions;
  }

  /**
   * Clear the cache.
   */
  clear(): void {
    /**
     * Clear the in-memory generation cache.
     */
    this.cache.clear();
  }
}

export const generationCache = new GenerationResultCache();

const WHITESPACE_REGEX = /\s+/g;
function normalizeWhitespace(text: string): string {
  return text.replace(WHITESPACE_REGEX, ' ');
}

/**
 * Detect duplicate or very similar questions in a batch.
 * Uses simple heuristics: question stem length, topic, and subtopic.
 */
export function identifyDuplicateQuestions(
  questions: GeneratedQuestion[] | McQuestion[],
): { isDuplicate: boolean; duplicateIndices: number[] }[] {
  /**
   * Identify duplicated or near-duplicate questions in a batch.
   * Returns an array of match info per input index.
   */
  const results: { isDuplicate: boolean; duplicateIndices: number[] }[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q1 = questions[i];
    const duplicateIndices: number[] = [];

    for (let j = i + 1; j < questions.length; j++) {
      const q2 = questions[j];

      // Check if prompts are effectively duplicates.
      const stem1 = getQuestionStem(q1);
      const stem2 = getQuestionStem(q2);

      // Skip duplicate checks when prompts are missing.
      if (!stem1 || !stem2) continue;

      const sameTopic = q1.topic === q2.topic;
      const normalizedStem1 = normalizeWhitespace(stem1);
      const normalizedStem2 = normalizeWhitespace(stem2);
      const isExactDuplicate = normalizedStem1 === normalizedStem2;

      if (sameTopic && isExactDuplicate) {
        duplicateIndices.push(j);
      }
    }

    results.push({
      isDuplicate: duplicateIndices.length > 0,
      duplicateIndices,
    });
  }

  return results;
}

/**
 * Filter out duplicate questions while preserving order.
 * Keeps first occurrence, removes later duplicates.
 */
export function deduplicateQuestions<T extends GeneratedQuestion | McQuestion>(
  questions: T[],
): T[] {
  const duplicateInfo = identifyDuplicateQuestions(
    questions as GeneratedQuestion[] | McQuestion[],
  );
  const indicesToRemove = new Set<number>();

  duplicateInfo.forEach((info) => {
    // Mark all duplicate indices for removal
    info.duplicateIndices.forEach((dupIdx) => {
      indicesToRemove.add(dupIdx);
    });
  });

  return questions.filter((_, idx) => !indicesToRemove.has(idx));
}

/**
 * Ensure minimum question variance by topic distribution.
 * Returns true if variance is acceptable.
 */
export function validateQuestionVariance(
  questions: GeneratedQuestion[] | McQuestion[],
): boolean {
  const topicCounts = new Map<string, number>();

  questions.forEach((q) => {
    const topic = q.topic;
    topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
  });

  // All topics should be represented if multiple were requested
  // At least 80% from primary topic is acceptable
  const counts = Array.from(topicCounts.values()).sort((a, b) => b - a);
  if (counts.length === 0) return false;

  const primaryTopicRatio = counts[0] / questions.length;
  return primaryTopicRatio <= 0.95; // At most 95% from one topic
}

/**
 * Apply comprehensive quality checks to a question batch.
 * Returns the cleaned batch and a report of issues found.
 */
export function applyBatchQualityChecks<
  T extends GeneratedQuestion | McQuestion,
>(questions: T[]): { cleanedQuestions: T[]; issuesFound: string[] } {
  const issues: string[] = [];

  // Check for duplicates
  const duplicateInfo = identifyDuplicateQuestions(
    questions as GeneratedQuestion[] | McQuestion[],
  );
  const duplicateCount = duplicateInfo.filter((d) => d.isDuplicate).length;
  if (duplicateCount > 0) {
    issues.push(`Found ${duplicateCount} potential duplicate questions`);
  }

  // Deduplicate
  let cleaned = deduplicateQuestions(questions);

  // Check variance
  if (
    !validateQuestionVariance(cleaned as GeneratedQuestion[] | McQuestion[])
  ) {
    issues.push('Low question variance detected (mostly one topic)');
  }

  // Validate all questions have required fields
  const invalidCount = cleaned.filter((q) => !q.topic || !q.id).length;
  if (invalidCount > 0) {
    issues.push(`${invalidCount} questions missing required fields`);
    cleaned = cleaned.filter((q) => q.topic && q.id);
  }

  if (issues.length > 0) {
    console.warn('Batch quality issues:', issues);
  }

  return { cleanedQuestions: cleaned, issuesFound: issues };
}
