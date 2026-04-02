import SUBTOPIC_CATALOG from '../shared/subtopic-catalog.json';

type CatalogSubtopicEntry = {
  name: string;
  instruction: string | null;
  group?: string;
};

type CatalogTopicEntry = {
  name: string;
  icon?: string;
  examPdfs?: string[];
  reportPdfs?: string[];
  examGuidance?: string;
  subtopics: CatalogSubtopicEntry[];
};

const CATALOG = SUBTOPIC_CATALOG as {
  topics: CatalogTopicEntry[];
};

function toTitleCase(value: string): string {
  return value.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function parseGroupMeta(groupId: string): { unit: string; aos: string } {
  const [rawUnit = 'General', ...rest] = groupId.split('-');
  const unitMatch = rawUnit.match(/^unit(\d+)$/i);
  const unit = unitMatch ? `Unit ${unitMatch[1]}` : toTitleCase(rawUnit);
  const aosRaw = rest.join(' ');
  const aos = aosRaw ? toTitleCase(aosRaw) : 'General';
  return { unit, aos };
}

export function getSubtopics(topicName: string): readonly string[] {
  const topic = CATALOG.topics.find((entry) => entry.name === topicName);
  return topic ? topic.subtopics.map((subtopic) => subtopic.name) : [];
}

export function getTopicIcon(topicName: string): string {
  const topic = CATALOG.topics.find((entry) => entry.name === topicName);
  return topic?.icon ?? 'BookOpen';
}

export function getTopicExamPdfs(topicName: string): string[] {
  const topic = CATALOG.topics.find((entry) => entry.name === topicName);
  return topic?.examPdfs ?? [];
}

export function getTopicReportPdfs(topicName: string): string[] {
  const topic = CATALOG.topics.find((entry) => entry.name === topicName);
  return topic?.reportPdfs ?? [];
}

export function getTopicExamGuidance(topicName: string): string {
  const topic = CATALOG.topics.find((entry) => entry.name === topicName);
  return topic?.examGuidance ?? '';
}

export function getTopicNames(): string[] {
  return CATALOG.topics.map((t) => t.name);
}

export type Topic =
  | 'Mathematical Methods'
  | 'Specialist Mathematics'
  | 'Chemistry'
  | 'Physical Education';

export type MathMethodsSubtopic = string;
export type SpecialistMathSubtopic = string;
export type ChemistrySubtopic = string;
export type PhysicalEducationSubtopic = string;

export const MATH_METHODS_SUBTOPICS = getSubtopics('Mathematical Methods');
export const SPECIALIST_MATH_SUBTOPICS = getSubtopics('Specialist Mathematics');
export const CHEMISTRY_SUBTOPICS = getSubtopics('Chemistry');
export const PHYSICAL_EDUCATION_SUBTOPICS = getSubtopics('Physical Education');

export const TOPICS: Topic[] = CATALOG.topics.map(
  (topic) => topic.name as Topic
);

const PE_GROUP_LABELS: Record<string, { unit: string; aos: string }> = {
  'unit3-skill-acquisition': { unit: 'Unit 3', aos: 'Skill Acquisition' },
  'unit3-biomechanics': { unit: 'Unit 3', aos: 'Biomechanics' },
  'unit3-energy-systems': { unit: 'Unit 3', aos: 'Energy Systems' },
  'unit4-foundations': { unit: 'Unit 4', aos: 'Foundations' },
  'unit4-training': { unit: 'Unit 4', aos: 'Training Principles and Methods' },
  'unit4-adaptations': { unit: 'Unit 4', aos: 'Adaptations and Monitoring' },
  'unit4-integration': { unit: 'Unit 4', aos: 'Integration and Application' },
};

type GroupLabelOverrides = Partial<
  Record<string, Record<string, { unit: string; aos: string }>>
>;

const GROUP_LABEL_OVERRIDES: GroupLabelOverrides = {
  'Physical Education': PE_GROUP_LABELS,
};

export type TopicSubtopicGroup = {
  topic: string;
  groupId: string;
  unit: string;
  aos: string;
  label: string;
  subtopics: readonly string[];
};

function parseUnitSortValue(unit: string): number {
  const match = unit.match(/^Unit\s+(\d+)$/i);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

export function getTopicSubtopicGroups(
  topicName: string
): readonly TopicSubtopicGroup[] {
  const topic = CATALOG.topics.find((t) => t.name === topicName);
  if (!topic) return [];

  const grouped = new Map<
    string,
    {
      order: number;
      subtopics: string[];
    }
  >();

  for (const [index, sub] of topic.subtopics.entries()) {
    if (!sub.group) continue;
    if (!grouped.has(sub.group)) {
      grouped.set(sub.group, { order: index, subtopics: [] });
    }
    grouped.get(sub.group)!.subtopics.push(sub.name);
  }

  const overrides = GROUP_LABEL_OVERRIDES[topicName] ?? {};
  const result: TopicSubtopicGroup[] = [];
  for (const [groupId, entry] of grouped) {
    const meta = overrides[groupId] ?? parseGroupMeta(groupId);
    result.push({
      topic: topicName,
      groupId,
      unit: meta.unit,
      aos: meta.aos,
      label: `${meta.unit} — ${meta.aos}`,
      subtopics: entry.subtopics,
    });
  }

  return result.sort((a, b) => {
    const unitDiff = parseUnitSortValue(a.unit) - parseUnitSortValue(b.unit);
    if (unitDiff !== 0) return unitDiff;
    if (a.unit !== b.unit) return a.unit.localeCompare(b.unit);
    const aOrder = grouped.get(a.groupId)?.order ?? 0;
    const bOrder = grouped.get(b.groupId)?.order ?? 0;
    return aOrder - bOrder;
  });
}

export type PhysicalEducationSubtopicGroup = TopicSubtopicGroup;

export const PE_SUBTOPIC_GROUPS: readonly PhysicalEducationSubtopicGroup[] =
  getTopicSubtopicGroups('Physical Education');

export const MATH_METHODS_SUBTOPIC_GROUPS: readonly TopicSubtopicGroup[] =
  getTopicSubtopicGroups('Mathematical Methods');
export const SPECIALIST_MATH_SUBTOPIC_GROUPS: readonly TopicSubtopicGroup[] =
  getTopicSubtopicGroups('Specialist Mathematics');
export const CHEMISTRY_SUBTOPIC_GROUPS: readonly TopicSubtopicGroup[] =
  getTopicSubtopicGroups('Chemistry');
