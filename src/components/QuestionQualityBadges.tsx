import { BookOpen, Zap } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

interface QuestionQualityBadgesProps {
  distinctness?: number;
  multiStepDepth?: number;
  verbDiversityCount?: number;
  scaffoldPattern?: string;
  compact?: boolean;
}

export function QuestionQualityBadges({
  distinctness,
  multiStepDepth,
  verbDiversityCount,
  scaffoldPattern,
  compact = false,
}: QuestionQualityBadgesProps) {
  const badges = [];

  // Distinctness score (0-1) - how unique this question is
  if (distinctness !== undefined) {
    let color =
      'bg-rose-500/5 text-rose-600 border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30';

    if (distinctness >= 0.7) {
      color =
        'bg-emerald-500/5 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30';
    } else if (distinctness >= 0.5) {
      color =
        'bg-amber-500/5 text-amber-600 border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30';
    }

    badges.push(
      <Badge
        key='distinctness'
        variant='outline'
        className={`${color} text-xs py-0.5`}
      >
        {compact ? '⬡' : 'Uniqueness'} {(distinctness * 100).toFixed(0)}%
      </Badge>,
    );
  }

  // Multi-step depth (1-5) - cognitive complexity
  if (multiStepDepth !== undefined) {
    let color =
      'bg-blue-500/5 text-blue-600 border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30';
    let complexity = 'Basic';

    if (multiStepDepth >= 4) {
      complexity = 'Very Complex';
      color =
        'bg-rose-500/5 text-rose-600 border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30';
    } else if (multiStepDepth >= 3) {
      complexity = 'Complex';
      color =
        'bg-orange-500/5 text-orange-600 border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30';
    } else if (multiStepDepth >= 2) {
      complexity = 'Moderate';
      color =
        'bg-amber-500/5 text-amber-600 border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30';
    }

    badges.push(
      <Badge
        key='depth'
        variant='outline'
        className={`${color} text-xs py-0.5`}
      >
        <Zap className='w-3 h-3 mr-1 inline' />
        {complexity}
      </Badge>,
    );
  }

  // Scaffold pattern - multi-part structure
  if (scaffoldPattern) {
    const isMultiPart = scaffoldPattern.includes('multi-part');
    const color = isMultiPart
      ? 'bg-primary/5 text-primary border-primary/20 dark:bg-primary/10 dark:text-primary dark:border-primary/30'
      : 'bg-muted/50 text-muted-foreground border-border/50 dark:bg-muted/10 dark:text-muted-foreground dark:border-border/30';

    badges.push(
      <Badge
        key='scaffold'
        variant='outline'
        className={`${color} text-xs py-0.5`}
      >
        <BookOpen className='w-3 h-3 mr-1 inline' />
        {scaffoldPattern}
      </Badge>,
    );
  }

  // Verb diversity count
  if (verbDiversityCount !== undefined && verbDiversityCount > 0) {
    let color =
      'bg-emerald-500/5 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30';
    if (verbDiversityCount < 2) {
      color =
        'bg-orange-500/5 text-orange-600 border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30';
    }

    badges.push(
      <Badge
        key='verbs'
        variant='outline'
        className={`${color} text-xs py-0.5`}
      >
        {verbDiversityCount.toFixed(0)} Command Verbs
      </Badge>,
    );
  }

  if (badges.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? 'gap-1' : ''}`}>
      {badges}
    </div>
  );
}
