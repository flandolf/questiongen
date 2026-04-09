import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 20 };

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className={cn('flex items-start justify-between gap-4', className)}
    >
      <div className="space-y-1">
        <motion.h1
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...SPRING, delay: 0.1 }}
          className="text-3xl font-black tracking-tight"
        >
          {title}
        </motion.h1>
        {description && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="text-sm text-muted-foreground mb-2"
          >
            {description}
          </motion.p>
        )}
      </div>
      {actions && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...SPRING, delay: 0.1 }}
          className="flex items-center gap-2"
        >
          {actions}
        </motion.div>
      )}
    </motion.div>
  );
}

interface SectionLabelProps {
  children: ReactNode;
}

export function SectionLabel({ children }: SectionLabelProps) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="text-[10px] font-light uppercase tracking-[0.18em] text-muted-foreground/70">
        {children}
      </span>
      <div className="flex-1 border-t border-border/40" />
    </div>
  );
}

interface SectionProps {
  children: ReactNode;
  className?: string;
}

export function Section({ children, className }: SectionProps) {
  return <section className={cn('space-y-4', className)}>{children}</section>;
}

interface ContentGridProps {
  children: ReactNode;
  className?: string;
}

export function ContentGrid({ children, className }: ContentGridProps) {
  return <div className={cn('grid gap-6', className)}>{children}</div>;
}

interface StatCardProps {
  label: string;
  value: string | ReactNode;
  subValue?: string;
  icon?: ReactNode;
  accentColor?: string;
}

export function StatCard({
  label,
  value,
  subValue,
  icon,
  accentColor,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-sm border bg-muted/20 px-4 py-3 space-y-0.5',
        accentColor
      )}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon && <span className="h-3 w-3">{icon}</span>}
        <span className="text-[10px] font-light uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-xl font-black tabular-nums">{value}</div>
      {subValue && (
        <div className="text-[11px] text-muted-foreground">{subValue}</div>
      )}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  actions,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 py-20 text-center',
        className
      )}
    >
      {icon && (
        <div className="w-12 h-12 rounded-sm bg-muted flex items-center justify-center">
          {icon}
        </div>
      )}
      <div>
        <h3 className="text-lg font-light mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
      </div>
      {actions && <div>{actions}</div>}
    </div>
  );
}

interface ToolbarProps {
  children: ReactNode;
  className?: string;
}

export function Toolbar({ children, className }: ToolbarProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {children}
    </div>
  );
}

interface FilterGroupProps {
  children: ReactNode;
  className?: string;
}

export function FilterGroup({ children, className }: FilterGroupProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-sm border bg-muted/30 p-0.5 self-start',
        className
      )}
    >
      {children}
    </div>
  );
}

interface FilterButtonProps {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}

export function FilterButton({ children, active, onClick }: FilterButtonProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={SPRING}
      className={cn(
        'px-3 py-1.5 text-xs rounded-sm font-medium transition-colors flex items-center gap-1.5',
        active
          ? 'bg-background shadow-sm text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </motion.button>
  );
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  className,
}: SearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 pl-9 pr-8 text-sm rounded-sm border bg-background focus:outline-none focus:ring-2 focus:ring-ring/50"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

interface DividerProps {
  className?: string;
}

export function Divider({ className }: DividerProps) {
  return <div className={cn('border-t border-border/40', className)} />;
}

interface KpiRowProps {
  children: ReactNode;
  className?: string;
}

export function KpiRow({ children, className }: KpiRowProps) {
  return <div className={cn('grid gap-3', className)}>{children}</div>;
}

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function PageContainer({
  children,
  className,
  noPadding,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        'min-h-full h-full flex flex-col gap-4',
        noPadding ? '' : 'p-6',
        className
      )}
    >
      {children}
    </div>
  );
}
