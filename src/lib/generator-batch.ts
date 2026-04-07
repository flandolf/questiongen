import { generateSeedFromTopics, shuffleWithSeed } from '@/lib/randomization';
import type { McQuestion, Topic } from '@/types';

interface SubtopicCall {
  subtopics: string[];
  count: number;
}

interface SubtopicCallOptions {
  seed?: number;
  combineForSmallBatches?: boolean;
  minSubtopicsPerQuestion?: number;
  maxSubtopicsPerQuestion?: number;
}

export function distributeQuestions(topics: Topic[], total: number): number[] {
  if (topics.length === 0) return [];
  const base = Math.floor(total / topics.length);
  const remainder = total % topics.length;
  return topics.map((_, i) => base + (i < remainder ? 1 : 0));
}

export function buildSubtopicCalls(
  subtopics: string[],
  total: number,
  topics: Topic[] = [],
  options: SubtopicCallOptions = {}
): SubtopicCall[] {
  if (!subtopics || subtopics.length === 0)
    return [{ subtopics: [], count: total }];

  const seed = options.seed ?? generateSeedFromTopics(topics, subtopics);
  const shuffledSubs = shuffleWithSeed(subtopics, seed);

  const combineForSmallBatches =
    options.combineForSmallBatches !== false && shuffledSubs.length > 1;

  const minSubtopicsPerQuestion = Math.max(
    1,
    Math.min(shuffledSubs.length, options.minSubtopicsPerQuestion ?? 2)
  );
  const maxSubtopicsPerQuestion = Math.max(
    minSubtopicsPerQuestion,
    Math.min(shuffledSubs.length, options.maxSubtopicsPerQuestion ?? 3)
  );

  if (total <= subtopics.length) {
    const calls: SubtopicCall[] = [];

    // For small batches, bundle multiple focus areas into each question call
    // so integrated exam-style questions are more likely and coverage is wider.
    const targetSubtopicsPerQuestion = combineForSmallBatches
      ? Math.max(
        minSubtopicsPerQuestion,
        Math.min(
          maxSubtopicsPerQuestion,
          Math.ceil(shuffledSubs.length / total)
        )
      )
      : 1;

    for (let i = 0; i < total; i++) {
      if (targetSubtopicsPerQuestion <= 1) {
        calls.push({
          subtopics: [shuffledSubs[i % shuffledSubs.length]],
          count: 1,
        });
        continue;
      }

      const stride = Math.max(
        1,
        Math.floor(shuffledSubs.length / targetSubtopicsPerQuestion)
      );
      const chosen: string[] = [];
      const seen = new Set<string>();

      // Spread picks across the shuffled list to reduce overlap between calls.
      for (
        let step = 0;
        step < shuffledSubs.length &&
        chosen.length < targetSubtopicsPerQuestion;
        step++
      ) {
        const idx = (i + step * stride) % shuffledSubs.length;
        const candidate = shuffledSubs[idx];
        if (!seen.has(candidate)) {
          seen.add(candidate);
          chosen.push(candidate);
        }
      }

      calls.push({ subtopics: chosen, count: 1 });
    }

    return calls;
  }

  const counts = distributeQuestions(subtopics as Topic[], total);
  return shuffledSubs.map((s, i) => ({ subtopics: [s], count: counts[i] }));
}

export function shuffleMcQuestionOptions(q: McQuestion): McQuestion {
  const originalOptions = q.options ?? [];
  if (originalOptions.length < 2) return q;

  const correctText = originalOptions.find(
    (o) => o.label === q.correctAnswer
  )?.text;

  const seed = hashStringForSeed(
    q.id ?? `${q.topic}-${q.promptMarkdown.slice(0, 50)}`
  );
  const shuffled = shuffleWithSeed([...originalOptions], seed);

  const labels = shuffled.map((_, i) => String.fromCharCode(65 + i));
  const relabeled = shuffled.map((o, i) => ({
    label: labels[i],
    text: o.text,
  }));

  const newCorrect =
    relabeled.find((o) =>
      correctText ? o.text.trim() === correctText.trim() : false
    )?.label ??
    relabeled[0]?.label ??
    q.correctAnswer;

  // Fix any remaining letter references in explanation
  let fixedExplanation = q.explanationMarkdown;

  // Map original letter positions to their option text for context-aware replacement
  const oldToNewLabel: Record<string, string> = {};
  originalOptions.forEach((opt, index) => {
    const oldLabel = String.fromCharCode(65 + index);
    const newOpt = relabeled.find(o => o.text.trim() === opt.text.trim());
    if (newOpt) {
      oldToNewLabel[oldLabel] = newOpt.label;
    }
  });

  // Replace letter references with the new labels
  // Match patterns like "Option A", " A:", " A,", " A.", " A is", etc.
  // but avoid replacing letters mid-word
  Object.entries(oldToNewLabel).forEach(([oldLabel, newLabel]) => {
    // Replace common patterns: " A " (space-letter-space), "A.", "A,", "A:", etc.
    const patterns = [
      new RegExp(`\\b${oldLabel}\\b`, 'g'), // Word boundary (catches "A" as standalone)
      new RegExp(`\\(${oldLabel}\\)`, 'g'), // (A)
    ];
    patterns.forEach(pattern => {
      fixedExplanation = fixedExplanation.replace(pattern, newLabel);
    });
  });

  return { ...q, options: relabeled, correctAnswer: newCorrect, explanationMarkdown: fixedExplanation };
}

export function hashStringForSeed(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash | 0);
}

export function preprocessMcQuestions(questions: McQuestion[]): McQuestion[] {
  return questions.map((q) => {
    return shuffleMcQuestionOptions(q);
  });
}
