/**
 * Advanced batch distribution and question variety optimization.
 * Ensures questions are well-distributed across topics and subtopics.
 */

import type { Topic } from '@/types';

interface BatchDistributionConfig {
  topics: Topic[];
  totalQuestions: number;
  minPerTopic?: number;
  preferVariety?: boolean;
}

interface SubtopicDistribution {
  subtopic: string;
  count: number;
}

/**
 * Intelligent batch distribution that:
 * 1. Ensures every topic gets represented (minimum 1 question)
 * 2. Distributes remaining questions proportionally
 * 3. Prefers variety over balance if requested
 */
export function calculateOptimalBatchDistribution(
  config: BatchDistributionConfig,
): Map<Topic, number> {
  const {
    topics,
    totalQuestions,
    minPerTopic = 1,
    preferVariety = true,
  } = config;

  const distribution = new Map<Topic, number>();

  // Ensure minimum representation for all topics
  const minTotal = topics.length * minPerTopic;
  if (totalQuestions < minTotal) {
    // Not enough questions for minimum per topic, distribute as evenly as possible
    const baseCount = Math.floor(totalQuestions / topics.length);
    const remainder = totalQuestions % topics.length;
    topics.forEach((topic, idx) => {
      distribution.set(topic, baseCount + (idx < remainder ? 1 : 0));
    });
    return distribution;
  }

  // Give each topic minimum
  topics.forEach((topic) => {
    distribution.set(topic, minPerTopic);
  });

  // Distribute remaining questions
  const remaining = totalQuestions - minTotal;
  if (preferVariety) {
    // Spread remaining across topics as evenly as possible
    const baseExtra = Math.floor(remaining / topics.length);
    const extraRemainder = remaining % topics.length;
    topics.forEach((topic, idx) => {
      const current = distribution.get(topic) || 0;
      distribution.set(
        topic,
        current + baseExtra + (idx < extraRemainder ? 1 : 0),
      );
    });
  } else {
    // Concentrate in each topic equally
    const baseExtra = Math.floor(remaining / topics.length);
    topics.forEach((topic) => {
      const current = distribution.get(topic) || 0;
      distribution.set(topic, current + baseExtra);
    });
  }

  return distribution;
}

/**
 * Calculate optimal subtopic distribution for a given question count.
 * Ensures good coverage while avoiding fragment counts.
 */
export function calculateSubtopicDistribution(
  subtopics: string[],
  questionCount: number,
): SubtopicDistribution[] {
  if (!subtopics || subtopics.length === 0) {
    return [];
  }

  const distribution: SubtopicDistribution[] = [];

  if (questionCount <= subtopics.length) {
    // One question per subtopic (up to count)
    subtopics.slice(0, questionCount).forEach((sub) => {
      distribution.push({ subtopic: sub, count: 1 });
    });
  } else {
    // Distribute across all subtopics
    const baseCount = Math.floor(questionCount / subtopics.length);
    const remainder = questionCount % subtopics.length;

    subtopics.forEach((sub, idx) => {
      const count = baseCount + (idx < remainder ? 1 : 0);
      distribution.push({ subtopic: sub, count });
    });
  }

  return distribution;
}

/**
 * Validate that a batch meets minimum quality standards for distribution.
 */
export function validateBatchDistribution(
  topicCounts: Map<Topic, number>,
  expectedTopics: Topic[],
): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check all topics are represented
  expectedTopics.forEach((topic) => {
    if (!topicCounts.has(topic) || (topicCounts.get(topic) || 0) === 0) {
      issues.push(`Missing topic: ${topic}`);
    }
  });

  // Check for over-concentration in single topic (>70% from one topic)
  const totalQuestions = Array.from(topicCounts.values()).reduce(
    (sum, count) => sum + count,
    0,
  );
  topicCounts.forEach((count, topic) => {
    const ratio = count / totalQuestions;
    if (ratio > 0.7) {
      issues.push(
        `Over-represented topic "${topic}": ${(ratio * 100).toFixed(1)}% of batch`,
      );
    }
  });

  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * Estimate the optimal difficulty level for the next generation based on performance.
 * Considers both recent performance and target difficulty range.
 */
export function estimateNextDifficulty(
  currentDifficulty: string,
  recentScore: number | undefined,
  performanceHistory: number[] = [],
): string {
  if (recentScore === undefined || recentScore === null) {
    return currentDifficulty;
  }

  const difficulties = [
    'Essential Skills',
    'Easy',
    'Medium',
    'Hard',
    'Extreme',
  ];
  const currentIndex = difficulties.indexOf(currentDifficulty);

  // Calculate average performance across recent sessions
  const avgScore =
    performanceHistory.length > 0
      ? performanceHistory.reduce((a, b) => a + b, 0) /
        performanceHistory.length
      : recentScore;

  // Clear underperformance: drop difficulty
  if (avgScore < 65) {
    const newIndex = Math.max(0, currentIndex - 1);
    return difficulties[newIndex];
  }

  // Consistent high performance: increase difficulty
  if (avgScore > 82 && performanceHistory.filter((s) => s > 75).length >= 2) {
    const newIndex = Math.min(difficulties.length - 1, currentIndex + 1);
    return difficulties[newIndex];
  }

  // Maintain current difficulty
  return currentDifficulty;
}

/**
 * Calculate recommended question count based on available time and average marks per question.
 */
export function recommendedQuestionCount(
  timeAvailableMinutes: number,
  averageMarksPerQuestion: number,
  estimatedMinutesPerMark: number = 1.5,
): number {
  const minutesPerQuestion = averageMarksPerQuestion * estimatedMinutesPerMark;
  const maxQuestions = Math.floor(timeAvailableMinutes / minutesPerQuestion);

  // Clamp between 1 and 20
  return Math.max(1, Math.min(20, maxQuestions));
}
