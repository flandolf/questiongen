import {
  Bug,
  Clock,
  Cloud,
  Cpu,
  CreditCard,
  GraduationCap,
  HardDriveDownload,
  Key,
  Layers,
  Palette,
  ScrollText,
  Trash2,
  TrendingUp,
  Wand2,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

import type { Section } from '@/views/settings/types';

import { ApiSection } from './sections/ApiSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { CleanupSection } from './sections/CleanupSection';
import { CreditsSection } from './sections/CreditsSection';
import { DebugSection } from './sections/DebugSection';
import { GenerationSettingsSection } from './sections/GenerationSettingsSection';
import { GoalsSection } from './sections/GoalsSection';
import { ImportExportSection } from './sections/ImportExportSection';
import { LogsSection } from './sections/LogsSection';
import { ModelsSection } from './sections/ModelsSection';
import { SubtopicsSection } from './sections/SubtopicsSection';
import { SyncSection } from './sections/SyncSection';
import { TimeAllocationSection } from './sections/TimeAllocationSection';
import { TutorSection } from './sections/TutorSection';

type SidebarEntry = {
  id: Section;
  label: string;
  icon: ReactNode;
};

type SidebarCategory = {
  label: string;
  items: SidebarEntry[];
};

type SectionComponentMap = Record<Section, ComponentType>;

// ─── Sidebar categories ──────────────────────────────────────────────────────

export const SETTINGS_SIDEBAR_CATEGORIES: readonly SidebarCategory[] = [
  {
    label: 'AI & Models',
    items: [
      { id: 'api', label: 'API Key', icon: <Key className='h-4 w-4' /> },
      { id: 'models', label: 'Models', icon: <Cpu className='h-4 w-4' /> },
      {
        id: 'credits',
        label: 'Credits',
        icon: <CreditCard className='h-4 w-4' />,
      },
    ],
  },
  {
    label: 'Study & Generation',
    items: [
      {
        id: 'generation',
        label: 'Generation',
        icon: <Wand2 className='h-4 w-4' />,
      },
      {
        id: 'tutor',
        label: 'AI Tutor',
        icon: <GraduationCap className='h-4 w-4' />,
      },
      {
        id: 'goals',
        label: 'Study Goals',
        icon: <TrendingUp className='h-4 w-4' />,
      },
      {
        id: 'time-allocation',
        label: 'Time & Marks',
        icon: <Clock className='h-4 w-4' />,
      },
      {
        id: 'subtopics',
        label: 'Custom Subtopics',
        icon: <Layers className='h-4 w-4' />,
      },
    ],
  },
  {
    label: 'Application',
    items: [
      {
        id: 'appearance',
        label: 'Appearance',
        icon: <Palette className='h-4 w-4' />,
      },
      { id: 'sync', label: 'Cloud Sync', icon: <Cloud className='h-4 w-4' /> },
    ],
  },
  {
    label: 'Data & System',
    items: [
      {
        id: 'import-export',
        label: 'Import / Export',
        icon: <HardDriveDownload className='h-4 w-4' />,
      },
      {
        id: 'cleanup',
        label: 'Data Cleanup',
        icon: <Trash2 className='h-4 w-4' />,
      },
      { id: 'debug', label: 'Debug', icon: <Bug className='h-4 w-4' /> },
      { id: 'logs', label: 'Logs', icon: <ScrollText className='h-4 w-4' /> },
    ],
  },
] as const;

/**
 * Registry mapping each Section id to its React component.
 *
 * Centralising this here means the page-level view doesn't need to grow a
 * new switch arm every time a section is added. The exhaustive `Record`
 * type also gives a typecheck error if a section forgets to register.
 */
export const SETTINGS_SECTIONS: SectionComponentMap = {
  api: ApiSection,
  models: ModelsSection,
  credits: CreditsSection,
  appearance: AppearanceSection,
  goals: GoalsSection,
  generation: GenerationSettingsSection,
  tutor: TutorSection,
  'time-allocation': TimeAllocationSection,
  debug: DebugSection,
  logs: LogsSection,
  sync: SyncSection,
  cleanup: CleanupSection,
  'import-export': ImportExportSection,
  subtopics: SubtopicsSection,
};

/** Resolve the React component for a section id. */
export function getSectionComponent(section: Section): ComponentType {
  return SETTINGS_SECTIONS[section];
}
