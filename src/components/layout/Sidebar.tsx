import { motion } from 'framer-motion';
import {
  Bookmark,
  ChartColumnIncreasing,
  CircleX,
  FileText,
  History,
  type LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';

type SidebarItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

const PRIMARY_ITEMS: readonly SidebarItem[] = [
  { to: '/', label: 'Generator', icon: Sparkles },
  { to: '/pdf-marker', label: 'PDF Marker', icon: FileText },
  { to: '/history', label: 'History', icon: History },
  { to: '/analytics', label: 'Analytics', icon: ChartColumnIncreasing },
  { to: '/mistakes', label: 'Mistakes', icon: CircleX },
  { to: '/saved', label: 'Saved', icon: Bookmark },
];

const UTILITY_ITEMS: readonly SidebarItem[] = [
  { to: '/settings', label: 'Settings', icon: Settings },
];

function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  if (collapsed) return null;

  return (
    <div className='flex h-11 w-full items-center gap-3 px-2'>
      <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
        <Sparkles className='h-[18px] w-[18px]' />
      </div>
      <div className='min-w-0'>
        <div className='truncate text-sm font-semibold leading-5 text-foreground'>
          QuestionGen
        </div>
        <div className='truncate text-xs leading-4 text-muted-foreground'>
          VCE practice
        </div>
      </div>
    </div>
  );
}

function SidebarNavItem({
  item,
  collapsed,
}: {
  item: SidebarItem;
  collapsed: boolean;
}) {
  const link = (
    <NavLink
      to={item.to}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex h-10 w-full items-center rounded-lg text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar',
          collapsed ? 'mx-auto w-10 justify-center px-0' : 'justify-start px-3',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        )
      }
    >
      <item.icon className='h-[18px] w-[18px] shrink-0 transition-transform duration-150 group-hover:scale-[1.04]' />
      {!collapsed && (
        <span className='ml-3 truncate font-medium'>{item.label}</span>
      )}
    </NavLink>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side='right' sideOffset={10}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

function CollapseButton({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const button = (
    <button
      type='button'
      onClick={onToggle}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      className={cn(
        'flex h-10 w-full items-center rounded-lg text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar',
        collapsed ? 'mx-auto w-10 justify-center px-0' : 'justify-start px-3',
      )}
    >
      {collapsed ? (
        <PanelLeftOpen className='h-[18px] w-[18px]' />
      ) : (
        <>
          <PanelLeftClose className='h-[18px] w-[18px] shrink-0' />
          <span className='ml-3 truncate'>Collapse</span>
        </>
      )}
    </button>
  );

  if (!collapsed) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side='right' sideOffset={10}>
        Expand sidebar
      </TooltipContent>
    </Tooltip>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebarCollapsed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(collapsed));
  }, [collapsed]);

  return (
    <TooltipProvider delayDuration={120}>
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 56 : 224 }}
        transition={SPRING}
        className='flex h-full shrink-0 flex-col overflow-hidden border-r border-border/70 bg-sidebar text-sidebar-foreground'
      >
        <div
          className={cn(
            'flex flex-1 flex-col py-3',
            collapsed ? 'gap-1.5 px-0' : 'gap-4 px-3',
          )}
        >
          <SidebarBrand collapsed={collapsed} />

          <nav aria-label='Primary' className='flex flex-col gap-1.5'>
            {PRIMARY_ITEMS.map((item) => (
              <SidebarNavItem
                key={item.to}
                item={item}
                collapsed={collapsed}
              />
            ))}
          </nav>

          <div className='mt-auto flex flex-col gap-1.5 border-t border-border/60 pt-3'>
            {UTILITY_ITEMS.map((item) => (
              <SidebarNavItem
                key={item.to}
                item={item}
                collapsed={collapsed}
              />
            ))}
          </div>
        </div>

        <div className={cn('border-t border-border/60 py-2', collapsed ? 'px-0' : 'px-3')}>
          <CollapseButton
            collapsed={collapsed}
            onToggle={() => setCollapsed((value) => !value)}
          />
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}
