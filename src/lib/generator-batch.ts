import {
  generateSeedFromTopics,
  selectSubtopicsLocal,
  shuffleWithSeed,
} from '@/lib/randomization';
import type { McQuestion, Topic } from '@/types';

export function distributeQuestions(topics: Topic[], total: number): number[] {
  if (topics.length === 0) return [];
  const base = Math.floor(total / topics.length);
  const remainder = total % topics.length;
  return topics.map((_, i) => base + (i < remainder ? 1 : 0));
}

export function buildSubtopicCalls(
  subtopics: string[],
  total: number,
  topics: Topic[] = []
) {
  if (!subtopics || subtopics.length === 0)
    return [{ subtopics: [], count: total }];

  const seed = generateSeedFromTopics(topics, subtopics);

  if (total <= subtopics.length) {
    const picked = selectSubtopicsLocal(subtopics, total, seed);
    return picked.map((s) => ({ subtopics: [s], count: 1 }));
  }

  const counts = distributeQuestions(subtopics as Topic[], total);
  const shuffledSubs = shuffleWithSeed(subtopics, seed);
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

  return { ...q, options: relabeled, correctAnswer: newCorrect };
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
