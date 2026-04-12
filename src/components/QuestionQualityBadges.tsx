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
      'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-200 dark:border-red-800';

    if (distinctness >= 0.7) {
      color =
        'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800';
    } else if (distinctness >= 0.5) {
      color =
        'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800';
    }

    badges.push(
      <Badge
        key='distinctness'
        variant='outline'
        className={`${color} text-xs`}
      >
        {compact ? '⬡' : 'Uniqueness'} {(distinctness * 100).toFixed(0)}%
      </Badge>,
    );
  }

  // Multi-step depth (1-5) - cognitive complexity
  if (multiStepDepth !== undefined) {
    let color =
      'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800';
    let complexity = 'Basic';

    if (multiStepDepth >= 4) {
      complexity = 'Very Complex';
      color =
        'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-200 dark:border-red-800';
    } else if (multiStepDepth >= 3) {
      complexity = 'Complex';
      color =
        'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-800';
    } else if (multiStepDepth >= 2) {
      complexity = 'Moderate';
      color =
        'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800';
    }

    badges.push(
      <Badge key='depth' variant='outline' className={`${color} text-xs`}>
        <Zap className='w-3 h-3 mr-1 inline' />
        {complexity}
      </Badge>,
    );
  }

  // Scaffold pattern - multi-part structure
  if (scaffoldPattern) {
    const isMultiPart = scaffoldPattern.includes('multi-part');
    const color = isMultiPart
      ? 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800'
      : 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-950/40 dark:text-slate-200 dark:border-slate-800';

    badges.push(
      <Badge key='scaffold' variant='outline' className={`${color} text-xs`}>
        <BookOpen className='w-3 h-3 mr-1 inline' />
        {scaffoldPattern}
      </Badge>,
    );
  }

  // Verb diversity count
  if (verbDiversityCount !== undefined && verbDiversityCount > 0) {
    let color =
      'bg-green-100 text-green-800 border-green-300 dark:bg-green-950/40 dark:text-green-200 dark:border-green-800';
    if (verbDiversityCount < 2) {
      color =
        'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-800';
    }

    badges.push(
      <Badge key='verbs' variant='outline' className={`${color} text-xs`}>
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
