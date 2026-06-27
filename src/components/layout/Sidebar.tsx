import {
  BookmarkIcon,
  ChartColumnIncreasingIcon,
  CircleXIcon,
  FileTextIcon,
  HistoryIcon,
  type LucideIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SettingsIcon,
  SparklesIcon,
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';

type SidebarItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

const PRIMARY_ITEMS: readonly SidebarItem[] = [
  { to: '/', label: 'Generator', icon: SparklesIcon },
  { to: '/pdf-marker', label: 'PDF Marker', icon: FileTextIcon },
  { to: '/history', label: 'History', icon: HistoryIcon },
  { to: '/analytics', label: 'Analytics', icon: ChartColumnIncreasingIcon },
  { to: '/mistakes', label: 'Mistakes', icon: CircleXIcon },
  { to: '/saved', label: 'Saved', icon: BookmarkIcon },
];

const UTILITY_ITEMS: readonly SidebarItem[] = [
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

function SidebarNavItem({ item }: { item: SidebarItem }) {
  const location = useLocation();
  const isActive =
    item.to === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(item.to);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
        <NavLink to={item.to}>
          <item.icon />
          <span>{item.label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SidebarCollapseButton() {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const Icon = isCollapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;

  return (
    <Button
      type='button'
      variant='ghost'
      size='icon'
      aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      onClick={toggleSidebar}
      className='mx-auto'
    >
      <Icon />
    </Button>
  );
}

export function Sidebar() {
  return (
    <ShadcnSidebar collapsible='icon'>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Practice</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {PRIMARY_ITEMS.map((item) => (
                <SidebarNavItem key={item.to} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className='w-full border-b' />
        <SidebarMenu>
          {UTILITY_ITEMS.map((item) => (
            <SidebarNavItem key={item.to} item={item} />
          ))}
        </SidebarMenu>
        <div className='flex justify-center'>
          <SidebarCollapseButton />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </ShadcnSidebar>
  );
}
