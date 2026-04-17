import { generateSeedFromTopics, shuffleWithSeed } from '@/lib/randomization';
import type { McQuestion, Topic } from '@/types';

export { generateSeedFromTopics, shuffleWithSeed };

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
  /**
   * Evenly distribute `total` question slots across provided `topics`.
   * Returns array of counts aligned with `topics` order.
   */
  if (topics.length === 0) return [];
  const base = Math.floor(total / topics.length);
  const remainder = total % topics.length;
  return topics.map((_, i) => base + (i < remainder ? 1 : 0));
}

export function buildSubtopicCalls(
  subtopics: string[],
  total: number,
  topics: Topic[] = [],
  options: SubtopicCallOptions = {},
): SubtopicCall[] {
  /**
   * Build subtopic-focused generation calls that partition `total` questions
   * across `subtopics`, optionally combining subtopics for small batches.
   */
  if (!subtopics || subtopics.length === 0)
    return [{ subtopics: [], count: total }];

  const seed = options.seed ?? generateSeedFromTopics(topics, subtopics);
  const shuffledSubs = shuffleWithSeed(subtopics, seed);

  const combineForSmallBatches =
    options.combineForSmallBatches !== false && shuffledSubs.length > 1;

  const minSubtopicsPerQuestion = Math.max(
    1,
    Math.min(shuffledSubs.length, options.minSubtopicsPerQuestion ?? 1),
  );
  const maxSubtopicsPerQuestion = Math.max(
    minSubtopicsPerQuestion,
    Math.min(
      shuffledSubs.length,
      total <= 3 ? 1 : (options.maxSubtopicsPerQuestion ?? 3),
    ),
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
            Math.ceil(shuffledSubs.length / total),
          ),
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
        Math.floor(shuffledSubs.length / targetSubtopicsPerQuestion),
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
  return shuffledSubs.map((s: string, i: number) => ({
    subtopics: [s],
    count: counts[i],
  }));
}

export function shuffleMcQuestionOptions(q: McQuestion): McQuestion {
  /**
   * Shuffle and relabel multiple-choice options deterministically based on
   * the question id so shuffling is reproducible across clients.
   */
  const originalOptions = q.options ?? [];
  if (originalOptions.length < 2) return q;

  const correctText = originalOptions.find(
    (o: { label: string; text: string }) => o.label === q.correctAnswer,
  )?.text;

  const seed = hashStringForSeed(
    q.id ?? `${q.topic}-${q.promptMarkdown.slice(0, 50)}`,
  );
  const shuffled = shuffleWithSeed([...originalOptions], seed);

  const labels = shuffled.map((_: unknown, i: number) =>
    String.fromCharCode(65 + i),
  );
  const relabeled = shuffled.map(
    (o: { label: string; text: string }, i: number) => ({
      label: labels[i],
      text: o.text,
    }),
  );

  const newCorrect =
    relabeled.find((o: { label: string; text: string }) =>
      correctText ? o.text.trim() === correctText.trim() : false,
    )?.label ??
    relabeled[0]?.label ??
    q.correctAnswer;

  // Fix any remaining letter references in explanation
  let fixedExplanation = q.explanationMarkdown;

  // Map original letter positions to their option text for context-aware replacement
  const oldToNewLabel: Record<string, string> = {};
  originalOptions.forEach(
    (opt: { label: string; text: string }, index: number) => {
      const oldLabel = String.fromCharCode(65 + index);
      const newOpt = relabeled.find(
        (o: { label: string; text: string }) =>
          o.text.trim() === opt.text.trim(),
      );
      if (newOpt) {
        oldToNewLabel[oldLabel] = newOpt.label;
      }
    },
  );

  // Simultaneous replacement of all labels to avoid the swap problem (A->B, B->A).
  // We use specific patterns to avoid accidentally replacing the article "A".
  const labelChars = Object.keys(oldToNewLabel).join('');
  if (labelChars) {
    const combinedRegex = new RegExp(
      `(\\b(?:[Oo]ption|[Cc]hoice|[Ss]election|[Aa]nswer|[Pp]art)\\s+)?\\(?([${labelChars}])\\)?(?=\\b|$)`,
      'g',
    );

    fixedExplanation = fixedExplanation.replace(
      combinedRegex,
      (
        match: string,
        prefix: string | undefined,
        label: string,
        offset: number,
      ) => {
        const newLabel = oldToNewLabel[label];
        if (!newLabel || newLabel === label) return match;

        // Heuristic to avoid replacing "A" when it's used as an article
        if (label === 'A' && !prefix && !match.includes('(')) {
          const following = fixedExplanation.slice(offset + match.length);
          const nextWordMatch = following.match(/^\s+([a-zA-Z]+)/);
          if (nextWordMatch) {
            const nextWord = nextWordMatch[1].toLowerCase();
            const predicates = [
              'is',
              'was',
              'refers',
              'represents',
              'shows',
              'indicates',
              'correct',
              'incorrect',
              'true',
              'false',
              'the',
              'only',
            ];
            // If it's "A" followed by something that's not a known predicate,
            // it's probably an article (e.g., "A tennis serve...")
            if (!predicates.includes(nextWord)) {
              return match;
            }
          }
        }

        // Safely replace the label within the matched context (e.g., "Option A" -> "Option B")
        const labelIndex = match.lastIndexOf(label);
        return (
          match.slice(0, labelIndex) +
          newLabel +
          match.slice(labelIndex + label.length)
        );
      },
    );
  }

  return {
    ...q,
    options: relabeled,
    correctAnswer: newCorrect,
    explanationMarkdown: fixedExplanation,
  };
}

export function hashStringForSeed(str: string): number {
  /**
   * Lightweight string-to-integer hash used for deterministic seeding.
   */
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash | 0);
}

export function preprocessMcQuestions(questions: McQuestion[]): McQuestion[] {
  /**
   * Run preprocessing steps on MC questions such as deterministic shuffling
   * of options and explanation label fixes.
   */
  return questions.map((q) => {
    return shuffleMcQuestionOptions(q);
  });
}
