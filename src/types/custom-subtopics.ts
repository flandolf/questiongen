import type { Topic } from './catalog';

export interface CustomSubtopic {
  id: string;
  topic: Topic;
  name: string;
  technique_notes?: {
    core_concepts?: string;
    exam_style_guidelines?: string;
    anti_prompts?: string[];
    tech_free_rules?: string;
    tech_active_rules?: string;
  };
  group?: string;
  createdAt: number;
  updatedAt: number;
}

export interface GeneratedSubtopic {
  name: string;
  group?: string;
  technique_notes?: {
    core_concepts?: string;
    exam_style_guidelines?: string;
    anti_prompts?: string[];
  };
}
