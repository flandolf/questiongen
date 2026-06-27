import {
  BookmarkIcon,
  ChartColumnIncreasingIcon,
  CircleXIcon,
  FileTextIcon,
  HistoryIcon,
  type LucideIcon,
  MoonIcon,
  SettingsIcon,
  SparklesIcon,
  SunIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useAppStore } from '@/store';

type CommandAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  keywords?: string[];
  run: () => void;
};

const NAVIGATION_LINKS: {
  to: string;
  label: string;
  icon: LucideIcon;
  keywords: string[];
}[] = [
  {
    to: '/',
    label: 'Generator',
    icon: SparklesIcon,
    keywords: ['create', 'new', 'practice'],
  },
  {
    to: '/pdf-marker',
    label: 'PDF Marker',
    icon: FileTextIcon,
    keywords: ['exam', 'upload'],
  },
  {
    to: '/history',
    label: 'History',
    icon: HistoryIcon,
    keywords: ['past', 'log', 'sessions'],
  },
  {
    to: '/analytics',
    label: 'Analytics',
    icon: ChartColumnIncreasingIcon,
    keywords: ['stats', 'insights'],
  },
  {
    to: '/mistakes',
    label: 'Mistakes',
    icon: CircleXIcon,
    keywords: ['wrong', 'study queue'],
  },
  {
    to: '/saved',
    label: 'Saved',
    icon: BookmarkIcon,
    keywords: ['bank', 'questions'],
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: SettingsIcon,
    keywords: ['preferences'],
  },
];

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const navigationActions = useMemo<CommandAction[]>(
    () =>
      NAVIGATION_LINKS.map((link) => ({
        id: `nav:${link.to}`,
        label: link.label,
        icon: link.icon,
        keywords: link.keywords,
        run: () => {
          void navigate(link.to);
        },
      })),
    [navigate],
  );

  const themeAction = useMemo<CommandAction>(
    () => ({
      id: 'action:toggle-theme',
      label: theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme',
      icon: theme === 'dark' ? SunIcon : MoonIcon,
      keywords: ['appearance', 'mode'],
      run: () => {
        void setTheme(theme === 'dark' ? 'light' : 'dark');
      },
    }),
    [setTheme, theme],
  );

  const runCommand = (action: CommandAction) => {
    action.run();
    onClose();
  };

  return (
    <CommandDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <Command>
        <CommandInput placeholder='Search commands...' />
        <CommandList>
          <CommandEmpty>No command found.</CommandEmpty>
          <CommandGroup heading='Navigate'>
            {navigationActions.map((action) => (
              <CommandItem
                key={action.id}
                value={[action.label, ...(action.keywords ?? [])].join(' ')}
                onSelect={() => runCommand(action)}
              >
                <action.icon />
                <span>{action.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading='Actions'>
            <CommandItem
              value={[themeAction.label, ...(themeAction.keywords ?? [])].join(
                ' ',
              )}
              onSelect={() => runCommand(themeAction)}
            >
              <themeAction.icon />
              <span>{themeAction.label}</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
