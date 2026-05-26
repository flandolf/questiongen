import type { CustomSubtopic, Topic } from '@/types';
import { getSubtopics } from '@/types/catalog';

export function getValidSubtopicsForTopic(topic: Topic): readonly string[] {
  return getSubtopics(topic);
}

export function cleanPresetSubtopics(
  selectedSubtopics: Record<string, string[]> | undefined,
  selectedTopics: Topic[],
  customSubtopics?: Record<Topic, CustomSubtopic[]>,
): Record<string, string[]> | undefined {
  if (!selectedSubtopics || Object.keys(selectedSubtopics).length === 0) {
    return undefined;
  }

  const cleaned: Record<string, string[]> = {};
  const validSubtopics = new Set<string>();

  for (const topic of selectedTopics) {
    for (const sub of getValidSubtopicsForTopic(topic)) {
      validSubtopics.add(sub);
    }
    const topicCustom = customSubtopics?.[topic] || [];
    for (const custom of topicCustom) {
      validSubtopics.add(custom.name);
    }
  }

  for (const [topic, subs] of Object.entries(selectedSubtopics)) {
    const valid = subs.filter((s) => validSubtopics.has(s));
    if (valid.length > 0) {
      cleaned[topic] = valid;
    }
  }

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

export function filterValidSubtopics(
  subtopics: string[],
  topic: Topic,
): string[] {
  const valid = new Set(getValidSubtopicsForTopic(topic));
  return subtopics.filter((s) => valid.has(s));
}
