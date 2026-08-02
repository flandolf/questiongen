import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import React from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export const SECTION_ANIMATION_VARIANTS = {
  hidden: { opacity: 0, y: 10, filter: 'blur(10px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.3, ease: 'easeOut' as const },
  },
  exit: {
    opacity: 0,
    y: -10,
    filter: 'blur(10px)',
    transition: { duration: 0.2, ease: 'easeIn' as const },
  },
};

export const STAGGER_CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

export const STAGGER_ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 10, filter: 'blur(4px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.3, ease: 'easeOut' as const },
  },
};

export function AnimatedSection({
  children,
  className = 'space-y-6',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={STAGGER_CONTAINER_VARIANTS}
      initial='hidden'
      animate='visible'
      className={className}
    >
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement(child)) return child;
        return (
          <motion.div key={child.key ?? index} variants={STAGGER_ITEM_VARIANTS}>
            {child}
          </motion.div>
        );
      })}
    </motion.div>
  );
}
export function SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <h2 className='text-base font-semibold tracking-tight text-foreground'>
        {title}
      </h2>
      {description && (
        <p className='mt-1 text-xs text-muted-foreground font-medium leading-relaxed opacity-80'>
          {description}
        </p>
      )}
    </div>
  );
}

export function FieldGroup({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className='space-y-1.5'>
      <Label htmlFor={htmlFor} className='text-sm font-medium'>
        {label}
      </Label>
      {children}
      {hint && <p className='text-xs text-muted-foreground'>{hint}</p>}
    </div>
  );
}

export function Divider() {
  return (
    <div className='relative h-px w-full my-6 flex items-center justify-center'>
      <div className='absolute inset-0 bg-gradient-to-r from-transparent via-border/60 to-transparent' />
    </div>
  );
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/40 bg-card/50 shadow-sm backdrop-blur-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className='flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2'>
      <AlertCircle className='h-4 w-4 shrink-0' />
      {message}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className='text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-3'>
      {message}
    </div>
  );
}

export function StatusBadge({ value }: { value: string | boolean | null }) {
  if (value === null)
    return (
      <span className='text-muted-foreground/30 text-xs font-mono tracking-tighter'>
        —
      </span>
    );
  if (typeof value === 'boolean') {
    return value ? (
      <span className='inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded'>
        <CheckCircle2 className='h-3 w-3' />
        Enabled
      </span>
    ) : (
      <span className='inline-flex items-center gap-1.5 text-muted-foreground/60 text-xs font-semibold bg-muted/50 px-1.5 py-0.5 rounded'>
        <AlertCircle className='h-3 w-3' />
        No
      </span>
    );
  }
  return (
    <span className='tabular-nums text-xs font-bold tracking-tight text-foreground/90'>
      {value}
    </span>
  );
}

export function ToggleRow({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-2.5 rounded-lg transition-all duration-200',
        checked
          ? 'bg-primary/5 ring-1 ring-primary/20 shadow-[0_2px_8px_rgba(var(--primary),0.05)]'
          : 'bg-muted/40',
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(!!v)}
        className='data-[state=checked]:bg-primary data-[state=checked]:border-primary transition-all active:scale-90'
      />
      <div className='select-none'>
        <Label
          htmlFor={id}
          className='text-sm font-semibold cursor-pointer text-foreground/90 leading-none'
        >
          {label}
        </Label>
        {description && (
          <p className='text-xs text-muted-foreground mt-1 font-medium opacity-70'>
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
