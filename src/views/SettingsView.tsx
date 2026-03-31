import { useState } from 'react';
import {
  Key,
  Cpu,
  CreditCard,
  Palette,
  TrendingUp,
  Bug,
  ChevronRight,
  Cloud,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_VERSION, type Section } from './settings/types';
import { ApiSection } from './settings/sections/ApiSection';
import { ModelsSection } from './settings/sections/ModelsSection';
import { CreditsSection } from './settings/sections/CreditsSection';
import { AppearanceSection } from './settings/sections/AppearanceSection';
import { GoalsSection } from './settings/sections/GoalsSection';
import { DebugSection } from './settings/sections/DebugSection';
import { SyncSection } from './settings/sections/SyncSection';
import { CleanupSection } from './settings/sections/CleanupSection';

const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'api', label: 'API Key', icon: <Key className="h-4 w-4" /> },
  { id: 'models', label: 'Models', icon: <Cpu className="h-4 w-4" /> },
  { id: 'credits', label: 'Credits', icon: <CreditCard className="h-4 w-4" /> },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: <Palette className="h-4 w-4" />,
  },
  {
    id: 'goals',
    label: 'Study Goals',
    icon: <TrendingUp className="h-4 w-4" />,
  },
  { id: 'debug', label: 'Debug', icon: <Bug className="h-4 w-4" /> },
  { id: 'sync', label: 'Cloud Sync', icon: <Cloud className="h-4 w-4" /> },
  { id: 'cleanup', label: 'Data Cleanup', icon: <Wand2 className="h-4 w-4" /> },
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
    case 'debug':
      return <DebugSection />;
    case 'sync':
      return <SyncSection />;
    case 'cleanup':
      return <CleanupSection />;
  }
}

export function SettingsView() {
  const [activeSection, setActiveSection] = useState<Section>('api');

  return (
    <div className="flex h-full min-h-0">
      <nav className="w-52 shrink-0 border-r border-border flex flex-col py-4 px-2 gap-0.5">
        <p className="px-3 mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
          Settings
        </p>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveSection(item.id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm transition-colors text-left group',
              activeSection === item.id
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <span
              className={cn(
                'shrink-0 transition-colors',
                activeSection === item.id
                  ? 'text-primary'
                  : 'text-muted-foreground group-hover:text-foreground'
              )}
            >
              {item.icon}
            </span>
            <span className="flex-1 truncate">{item.label}</span>
            {activeSection === item.id && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary/60" />
            )}
          </button>
        ))}
        <div className="mt-auto pt-4 px-3">
          <p className="text-[10px] text-muted-foreground/40 font-mono">
            v{APP_VERSION}
          </p>
        </div>
      </nav>
      <main className="flex-1 min-w-0 overflow-y-auto p-8">
        <div className="max-w-screen">{renderSection(activeSection)}</div>
      </main>
    </div>
  );
}
