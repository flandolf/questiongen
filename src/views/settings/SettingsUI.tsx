import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Search } from 'lucide-react';
import React from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  const isAndroid =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('platform-android');

  const itemVariants = isAndroid
    ? {
        hidden: { opacity: 0, y: 10 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.3, ease: 'easeOut' as const },
        },
      }
    : STAGGER_ITEM_VARIANTS;

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
          <motion.div key={child.key ?? index} variants={itemVariants}>
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
    <div className='mb-6'>
      <h2 className='text-lg font-semibold tracking-tight'>{title}</h2>
      {description && (
        <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
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
  return <div className='border-t border-border my-6' />;
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-border', className)}>
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
    return <span className='text-muted-foreground text-sm'>—</span>;
  if (typeof value === 'boolean') {
    return value ? (
      <span className='inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-sm'>
        <CheckCircle2 className='h-3.5 w-3.5' />
        Yes
      </span>
    ) : (
      <span className='inline-flex items-center gap-1 text-muted-foreground text-sm'>
        <AlertCircle className='h-3.5 w-3.5' />
        No
      </span>
    );
  }
  return <span className='tabular-nums text-sm font-medium'>{value}</span>;
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
    <div className='flex items-center gap-3 p-3 rounded-lg bg-muted/50'>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(!!v)}
      />
      <div>
        <Label htmlFor={id} className='font-medium cursor-pointer'>
          {label}
        </Label>
        {description && (
          <p className='text-xs text-muted-foreground mt-0.5'>{description}</p>
        )}
      </div>
    </div>
  );
}

export function ModelSelectRow({
  id,
  value,
  models,
  disabled,
  onSelect,
  onSearch,
  placeholder = 'Select a model',
}: {
  id: string;
  value: string;
  models: { id: string; name: string }[];
  disabled?: boolean;
  onSelect: (v: string) => void;
  onSearch?: () => void;
  placeholder?: string;
}) {
  const isKnown = models.some((m) => m.id === value);
  const extraEntry =
    !isKnown && value && value !== 'custom'
      ? [
          {
            id: value,
            name: value.includes('/')
              ? value.split('/').slice(1).join('/')
              : value,
          },
        ]
      : [];
  const selectVal = value && value !== 'custom' ? value : isKnown ? value : '';

  return (
    <div className='flex flex-row items-center gap-2'>
      <Select value={selectVal} onValueChange={onSelect}>
        <SelectTrigger id={id} className='flex-1 min-w-0'>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {extraEntry.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              <span className='flex items-center gap-2 min-w-0'>
                <span className='truncate font-mono text-xs'>{m.name}</span>
                <span className='shrink-0 text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-medium leading-none'>
                  custom
                </span>
              </span>
            </SelectItem>
          ))}
          {extraEntry.length > 0 && (
            <div className='my-1 border-t border-border' />
          )}
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {onSearch && (
        <Button
          variant='outline'
          size='icon'
          disabled={disabled}
          onClick={onSearch}
          title='Search all OpenRouter models'
        >
          <Search size={4} />
        </Button>
      )}
    </div>
  );
}

export function CustomModelInput({
  id,
  value,
  onChange,
  onApply,
  label,
  hint,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onApply: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className='p-4 rounded-lg border border-dashed border-border space-y-3'>
      <FieldGroup
        label={label}
        htmlFor={id}
        hint={hint ?? 'Format: provider/model-name'}
      >
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder='e.g. openai/gpt-oss-120b'
          className='font-mono text-sm'
          onKeyDown={(e) => e.key === 'Enter' && value.trim() && onApply()}
        />
      </FieldGroup>
      <Button size='sm' disabled={!value.trim()} onClick={onApply}>
        Apply
      </Button>
    </div>
  );
}
