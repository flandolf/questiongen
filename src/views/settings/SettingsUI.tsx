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
        hidden: { opacity: 0, y: 10, z: 0 },
        visible: {
          opacity: 1,
          y: 0,
          z: 0,
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
      style={isAndroid ? { willChange: 'opacity, transform' } : undefined}
    >
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement(child)) return child;
        return (
          <motion.div
            key={child.key ?? index}
            variants={itemVariants}
            style={isAndroid ? { willChange: 'opacity, transform' } : undefined}
          >
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

export function ModelSelectRow({
  id,
  value,
  models,
  disabled,
  onSelect,
  onSearch,
  placeholder = 'Select model...',
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
        <SelectTrigger
          id={id}
          className='flex-1 min-w-0 h-9 bg-background/50 border-border/40 hover:bg-muted/50 transition-colors text-xs font-medium'
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className='max-h-80'>
          {extraEntry.map((m) => (
            <SelectItem key={m.id} value={m.id} className='text-xs font-medium'>
              <span className='flex items-center gap-2 min-w-0'>
                <span className='truncate font-mono text-[10px] opacity-70'>
                  {m.name}
                </span>
                <span className='shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold leading-none'>
                  custom
                </span>
              </span>
            </SelectItem>
          ))}
          {extraEntry.length > 0 && (
            <div className='my-1 border-t border-border/40' />
          )}
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id} className='text-xs font-medium'>
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
          className='h-9 w-9 border-border/40 hover:bg-primary/5 hover:text-primary transition-all active:scale-90'
        >
          <Search className='h-3.5 w-3.5' />
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
    <div className='p-4 rounded-xl border border-border/40 bg-muted/40 shadow-inner space-y-4'>
      <FieldGroup
        label={label}
        htmlFor={id}
        hint={
          hint ?? 'Format: provider/model-name (e.g. anthropic/claude-3-opus)'
        }
      >
        <div className='relative'>
          <Input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder='provider/model-name'
            className='font-mono text-xs h-9 bg-background/80 border-border/40 focus:ring-primary/30 transition-all'
            onKeyDown={(e) => e.key === 'Enter' && value.trim() && onApply()}
          />
        </div>
      </FieldGroup>
      <div className='flex justify-end'>
        <Button
          size='sm'
          disabled={!value.trim()}
          onClick={onApply}
          className='h-8 text-xs font-semibold px-4 active:scale-95 transition-transform'
        >
          Initialize Engine
        </Button>
      </div>
    </div>
  );
}
