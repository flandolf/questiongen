import { AnimatePresence, motion } from 'framer-motion';
import {
  Bug,
  ChevronRight,
  Clock,
  Cloud,
  Cpu,
  CreditCard,
  GraduationCap,
  HardDriveDownload,
  Key,
  Palette,
  ScrollText,
  TrendingUp,
  Wand2,
} from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

import { ApiSection } from './settings/sections/ApiSection';
import { AppearanceSection } from './settings/sections/AppearanceSection';
import { CleanupSection } from './settings/sections/CleanupSection';
import { CreditsSection } from './settings/sections/CreditsSection';
import { DebugSection } from './settings/sections/DebugSection';
import { GenerationSettingsSection } from './settings/sections/GenerationSettingsSection';
import { GoalsSection } from './settings/sections/GoalsSection';
import { ImportExportSection } from './settings/sections/ImportExportSection';
import { LogsSection } from './settings/sections/LogsSection';
import { ModelsSection } from './settings/sections/ModelsSection';
import { SyncSection } from './settings/sections/SyncSection';
import { TimeAllocationSection } from './settings/sections/TimeAllocationSection';
import { TutorSection } from './settings/sections/TutorSection';
import { SECTION_ANIMATION_VARIANTS } from './settings/SettingsUI';
import { APP_VERSION, type Section } from './settings/types';

const SIDEBAR_CATEGORIES: {
  label: string;
  items: { id: Section; label: string; icon: React.ReactNode }[];
}[] = [
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
        icon: <Wand2 className='h-4 w-4' />,
      },
      { id: 'debug', label: 'Debug', icon: <Bug className='h-4 w-4' /> },
      { id: 'logs', label: 'Logs', icon: <ScrollText className='h-4 w-4' /> },
    ],
  },
];

function renderSection(activeSection: Section) {
  switch (activeSection) {
    case 'api':
      return <ApiSection />;
    case 'models':
      return <ModelsSection />;
    case 'credits':
      return <CreditsSection />;
    case 'appearance':
      return <AppearanceSection />;
    case 'goals':
      return <GoalsSection />;
    case 'generation':
      return <GenerationSettingsSection />;
    case 'tutor':
      return <TutorSection />;
    case 'time-allocation':
      return <TimeAllocationSection />;
    case 'debug':
      return <DebugSection />;
    case 'logs':
      return <LogsSection />;
    case 'sync':
      return <SyncSection />;
    case 'cleanup':
      return <CleanupSection />;
    case 'import-export':
      return <ImportExportSection />;
  }
}

export function SettingsView() {
  const [activeSection, setActiveSection] = useState<Section>('api');

  return (
    <div className='flex h-full min-h-0 bg-background/50 backdrop-blur-3xl'>
      <nav className='w-64 shrink-0 border-r border-border/50 flex flex-col py-6 px-3 overflow-y-auto overflow-x-hidden bg-muted/20'>
        <div className='flex flex-col gap-8'>
          {SIDEBAR_CATEGORIES.map((category) => (
            <div key={category.label} className='flex flex-col gap-1'>
              <div className='flex items-center gap-2 px-3 mb-2'>
                <div className='h-px flex-1 bg-linear-to-r from-border/50 to-transparent' />
                <p className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30 font-manrope whitespace-nowrap'>
                  {category.label}
                </p>
              </div>

              <div className='flex flex-col gap-0.5'>
                {category.items.map((item) => {
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      className={cn(
                        'relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left group overflow-hidden',
                        !isActive &&
                          'hover:bg-muted/50 text-muted-foreground hover:text-foreground active:scale-[0.98]',
                      )}
                    >
                      {isActive && (
                        <motion.div
                          layoutId='active-pill'
                          className='absolute inset-0 bg-primary/10 border-l-2 border-primary shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]'
                          transition={{
                            type: 'spring',
                            stiffness: 400,
                            damping: 30,
                          }}
                        />
                      )}

                      <span
                        className={cn(
                          'relative shrink-0 transition-all duration-300',
                          isActive
                            ? 'text-primary scale-110'
                            : 'text-muted-foreground group-hover:text-foreground group-hover:scale-105',
                        )}
                      >
                        {item.icon}
                      </span>

                      <span
                        className={cn(
                          'relative flex-1 truncate font-medium transition-colors duration-300',
                          isActive
                            ? 'text-primary font-semibold'
                            : 'text-muted-foreground group-hover:text-foreground',
                        )}
                      >
                        {item.label}
                      </span>

                      <AnimatePresence>
                        {isActive && (
                          <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className='relative'
                          >
                            <ChevronRight className='h-3.5 w-3.5 text-primary/60' />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className='mt-auto pt-8 px-3'>
          <div className='flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/50 group hover:border-primary/20 transition-colors'>
            <div className='flex flex-col gap-0.5'>
              <span className='text-[10px] text-muted-foreground/40 font-bold uppercase tracking-tighter'>
                Build Version
              </span>
              <span className='text-[11px] font-mono text-muted-foreground/60 group-hover:text-primary/60 transition-colors'>
                v{APP_VERSION}
              </span>
            </div>
            <div className='size-1.5 rounded-full bg-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.5)]' />
          </div>
        </div>
      </nav>

      <main className='flex-1 min-w-0 overflow-y-auto bg-background/30'>
        <div className='max-w-4xl mx-auto p-12'>
          <AnimatePresence mode='wait'>
            <motion.div
              key={activeSection}
              variants={SECTION_ANIMATION_VARIANTS}
              initial='hidden'
              animate='visible'
              exit='exit'
              className='w-full'
            >
              {renderSection(activeSection)}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
