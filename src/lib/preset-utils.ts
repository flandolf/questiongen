import type { CustomSubtopic, Topic } from '@/types';

const CATALOG_SUBTOPICS: Record<Topic, readonly string[]> = {
  Biology: [
    'Cells as the basis of life',
    'Plasma membrane',
    'Nucleus',
    'Mitosis',
    'DNA, genes and chromosomes',
    'Gene expression',
    'Mutations',
    'Genetic inheritance',
    '生态系统',
    'Dynamics of ecosystems',
    'Evolution',
    'Natural selection',
    'Human impact on ecosystems',
    'Aerobic respiration',
    'Anaerobic respiration',
    'Photosynthesis',
    'Enzyme function',
    'Protein synthesis',
    'Nucleic acids',
  ],
  Chemistry: [
    'Atomic structure and the periodic table',
    'Ionic bonding',
    'Covalent bonding',
    'Metallic bonding',
    'Intermolecular forces',
    'Gas laws',
    'Moles and stoichiometry',
    'Concentration calculations',
    'Acids and bases',
    'Redox reactions',
    'Rates of reactions',
    'Equilibrium',
    'Organic chemistry',
    'Analytical techniques',
    'Synthesis pathways',
  ],
  'General Mathematics': [
    'Algebra',
    'Linear equations',
    'Quadratic equations',
    'Indices',
    'Probability',
    'Statistics',
    'Geometry',
    'Measurement',
    'Finance',
    'Networks',
  ],
  'Mathematical Methods': [
    'Functions and graphs',
    'Algebra',
    'Calculus',
    'Trigonometry',
    'Exponential and logarithmic functions',
    'Probability',
    'Statistics',
  ],
  'Specialist Mathematics': [
    'Complex numbers',
    'Vectors',
    'Mechanics',
    'Kinematics',
    'Dynamics',
    'Circular motion',
    'Vector calculus',
    'Differential equations',
    'Linear algebra',
    'Probability',
    'Statistics',
  ],
  'Physical Education': [
    'Anatomy',
    'Physiology',
    'Biomechanics',
    'Motor learning',
    'Sport psychology',
    'Nutrition',
    'Training methods',
    'Exercise physiology',
    'Energy systems',
    'Skill acquisition',
    'Performance analysis',
  ],
};

export function getValidSubtopicsForTopic(topic: Topic): readonly string[] {
  return CATALOG_SUBTOPICS[topic] ?? [];
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
