/**
 * Client-side randomization utilities for deterministic question generation.
 * Provides seeded random number generation for reproducible randomization.
 */

import type { McOption } from '@/types';

/**
 * Create a stateful random generator with a seed.
 * Each call advances the internal state.
 */
export function createSeededRandom(seed: number = Date.now()) {
  let current = seed || 1;

  return {
    seed,
    next: () => {
      current = (current * 1103515245 + 12345) & 0x7fffffff;
      return current / 0x7fffffff;
    },
    nextInt: function (max: number) {
      return Math.floor(this.next() * max);
    },
  };
}

/**
 * Create a seeded pseudo-random generator with `next()` and `nextInt()`.
 * @param seed - Numeric seed to initialize the generator
 */

/**
 * Generate a seed from topic and subtopic names for reproducible results.
 */
export function generateSeedFromTopics(
  topics: string[],
  subtopics?: string[],
): number {
  const combined = [...topics, ...(subtopics || [])].join('|');
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Derive an integer seed from topic and subtopic names for reproducible
 * randomization across sessions.
 */

/**
 * Shuffle array in-place using Fisher-Yates with optional seeding.
 */
export function shuffleWithSeed<T>(arr: T[], seed?: number): T[] {
  const copy = [...arr];
  const rng = createSeededRandom(seed);

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

/**
 * Sample k items from array without replacement using seeded random.
 */
export function sampleWithSeed<T>(arr: T[], k: number, seed?: number): T[] {
  if (k >= arr.length) return [...arr];
  const shuffled = shuffleWithSeed(arr, seed);
  return shuffled.slice(0, k);
}

/**
 * Optimized subtopic selection: select k subtopics from array,
 * with optional seeding for reproducibility.
 */
export function selectSubtopicsLocal(
  subtopics: string[],
  count: number,
  seed?: number,
): string[] {
  if (count >= subtopics.length) return [...subtopics];
  if (count <= 0) return [];

  return sampleWithSeed(subtopics, count, seed);
}

/**
 * Validate and deduplicate a list of options.
 */
export function validateAndDeduplicateOptions(
  options: Array<{ label: string; text: string }>,
): Array<{ label: string; text: string }> {
  const seen = new Set<string>();
  const deduped = [];

  for (const opt of options) {
    const normalized = opt.text.toLowerCase().trim();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      deduped.push(opt);
    }
  }

  return deduped;
}

/**
 * Detect and report MCQ quality issues.
 */
export function validateMcqQuality(question: {
  options?: McOption[];
  correctAnswer?: string;
}): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];
  const options = question.options || [];

  if (!options || options.length < 4) {
    issues.push('MCQ has fewer than 4 options');
  }

  if (!question.correctAnswer) {
    issues.push('MCQ has no correct answer specified');
  }

  // Check for duplicate options
  const optionTexts = options.map((o) => o.text.toLowerCase().trim());
  const uniqueTexts = new Set<string>(optionTexts);
  if (uniqueTexts.size < optionTexts.length) {
    issues.push('MCQ has duplicate options');
  }

  // Verify correct answer is in options
  const correctLabel = question.correctAnswer;
  const hasCorrect = options.some((o) => o.label === correctLabel);
  if (!hasCorrect && correctLabel) {
    issues.push(`Correct answer label "${correctLabel}" not found in options`);
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}
