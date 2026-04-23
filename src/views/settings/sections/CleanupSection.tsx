import { invoke } from '@tauri-apps/api/core';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  Check,
  CheckCircle2,
  CheckSquare,
  Database,
  Eye,
  EyeOff,
  Filter,
  Layers,
  Loader2,
  MousePointerClick,
  PencilLine,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Square,
  ThumbsUp,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { useAppContext } from '@/AppContext';
import { Autocomplete } from '@/components/ui/autocomplete';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { readBackendError } from '@/lib/app-utils';
import { cn } from '@/lib/utils';
import { PRESET_MODELS } from '@/views/settings/constants';

import {
  BIOLOGY_SUBTOPICS,
  CHEMISTRY_SUBTOPICS,
  GENERAL_MATHEMATICS_SUBTOPICS,
  MATH_METHODS_SUBTOPICS,
  PHYSICAL_EDUCATION_SUBTOPICS,
  SPECIALIST_MATH_SUBTOPICS,
  TOPICS,
} from '../../../types';
import {
  CHEMISTRY_SUBTOPIC_GROUPS,
  MATH_METHODS_SUBTOPIC_GROUPS,
  PE_SUBTOPIC_GROUPS,
  SPECIALIST_MATH_SUBTOPIC_GROUPS,
  type TopicSubtopicGroup,
} from '../../../types/catalog';
import {
  Divider,
  ErrorBanner,
  ModelSelectRow,
  SectionHeader,
} from '../SettingsUI';

const CANONICAL_TOPICS: string[] = [...TOPICS];
const CANONICAL_TOPICS_SET = new Set(CANONICAL_TOPICS);

const CANONICAL_SUBTOPICS: string[] = [
  ...MATH_METHODS_SUBTOPICS,
  ...SPECIALIST_MATH_SUBTOPICS,
  ...CHEMISTRY_SUBTOPICS,
  ...PHYSICAL_EDUCATION_SUBTOPICS,
  ...BIOLOGY_SUBTOPICS,
  ...GENERAL_MATHEMATICS_SUBTOPICS,
];
const CANONICAL_SUBTOPICS_SET = new Set(CANONICAL_SUBTOPICS);

type TopicsCleanupResponse = {
  topicMapping: Record<string, string>;
};

type SubtopicsCleanupResponse = {
  subtopicMapping: Record<string, string>;
};

type TopicCleanupResult = {
  topicMapping: Record<string, string>;
  topicsUpdated: number;
};

type SubtopicCleanupResult = {
  subtopicMapping: Record<string, string>;
  subtopicsUpdated: number;
};

type ScanResult = {
  unknownTopics: string[];
  unknownSubtopics: string[];
  totalWritten: number;
  totalMc: number;
  totalEntries: number;
  canonicalCount: number;
  healthScore: number;
};

// ─── Fuzzy Matching ───────────────────────────────────────────────────────────

type MatchResult = {
  match: string;
  score: number;
  rationale: string;
  isTie: boolean;
};

const similarityCache = new Map<string, number>();
const MAX_CACHE_SIZE = 10000;
const CONFIDENCE_THRESHOLD = 0.4;

function evictSimilarityCache() {
  if (similarityCache.size >= MAX_CACHE_SIZE) {
    const entriesToRemove = Math.floor(MAX_CACHE_SIZE * 0.25);
    const keyArray = Array.from(similarityCache.keys());
    for (let i = 0; i < entriesToRemove; i++) {
      similarityCache.delete(keyArray[i]);
    }
  }
}

function similarity(a: string, b: string): number {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();

  if (la === lb) return 1;

  const cacheKey = la < lb ? `${la}|||${lb}` : `${lb}|||${la}`;
  const cached = similarityCache.get(cacheKey);
  if (cached !== undefined) return cached;

  evictSimilarityCache();

  let result: number;

  if (lb.includes(la) || la.includes(lb)) {
    result = 0.85;
  } else {
    const lenA = la.length;
    const lenB = lb.length;
    if (lenA === 0 || lenB === 0) {
      result = 0;
    } else {
      const maxLen = Math.max(lenA, lenB);
      if (maxLen > 50) {
        const prevRow: number[] = new Array(lenB + 1).fill(0).map((_, j) => j);
        const currRow: number[] = new Array<number>(lenB + 1);

        for (let i = 1; i <= lenA; i++) {
          currRow[0] = i;
          for (let j = 1; j <= lenB; j++) {
            const cost = la[i - 1] === lb[j - 1] ? 0 : 1;
            let minVal = prevRow[j] + 1;
            const fromLeft = currRow[j - 1] + 1;
            if (fromLeft < minVal) minVal = fromLeft;
            const fromDiag = prevRow[j - 1] + cost;
            if (fromDiag < minVal) minVal = fromDiag;
            currRow[j] = minVal;
          }
          prevRow.splice(0, prevRow.length, ...currRow);
        }

        const distance = prevRow[lenB];
        result = 1 - distance / maxLen;
      } else {
        const prevRow: number[] = new Array(lenB + 1).fill(0).map((_, j) => j);
        const currRow: number[] = new Array<number>(lenB + 1);

        for (let i = 1; i <= lenA; i++) {
          currRow[0] = i;
          for (let j = 1; j <= lenB; j++) {
            const cost = la[i - 1] === lb[j - 1] ? 0 : 1;
            currRow[j] = Math.min(
              prevRow[j] + 1,
              currRow[j - 1] + 1,
              prevRow[j - 1] + cost,
            );
          }
          prevRow.splice(0, prevRow.length, ...currRow);
        }

        const distance = prevRow[lenB];
        result = 1 - distance / maxLen;
      }
    }
  }

  similarityCache.set(cacheKey, result);
  return result;
}

function getMatchRationale(a: string, b: string, score: number): string {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();

  if (score === 1) return 'Exact match';
  if (lb.includes(la)) return `Contains "${la}"`;
  if (la.includes(lb)) return `Contained in "${la}"`;

  const lenA = la.length;
  const lenB = lb.length;
  if (lenA === 0 || lenB === 0) return 'Empty';

  const prevRow: number[] = new Array(lenB + 1).fill(0).map((_, j) => j);
  const currRow: number[] = new Array<number>(lenB + 1);

  for (let i = 1; i <= lenA; i++) {
    currRow[0] = i;
    for (let j = 1; j <= lenB; j++) {
      const cost = la[i - 1] === lb[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,
        currRow[j - 1] + 1,
        prevRow[j - 1] + cost,
      );
    }
    prevRow.splice(0, prevRow.length, ...currRow);
  }

  const distance = prevRow[lenB];
  return `~${distance} edits`;
}

function findBestMatch(item: string, options: string[]): MatchResult | null {
  let bestScore = -1;
  let bestMatch: string | null = null;
  let isTie = false;

  for (const opt of options) {
    const score = similarity(item, opt);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = opt;
      isTie = false;
    } else if (score === bestScore && score > 0) {
      if (opt < (bestMatch ?? '')) {
        bestMatch = opt;
        isTie = true;
      } else {
        isTie = true;
      }
    }
  }

  if (bestMatch === null || bestScore < CONFIDENCE_THRESHOLD) {
    return null;
  }

  return {
    match: bestMatch,
    score: bestScore,
    rationale: getMatchRationale(item, bestMatch, bestScore),
    isTie,
  };
}

function DataLabel({
  children,
  variant = 'unknown',
}: {
  children: React.ReactNode;
  variant?: 'unknown' | 'canonical';
}) {
  return (
    <code
      className={cn(
        'font-mono text-[10px] px-2 py-0.5 rounded border transition-all duration-300',
        variant === 'unknown'
          ? 'bg-amber-500/5 text-amber-600 dark:text-amber-400 border-amber-500/20 group-hover:bg-amber-500/10'
          : 'bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 group-hover:bg-emerald-500/10',
      )}
    >
      {children}
    </code>
  );
}

// ─── Manual Fix Panel ─────────────────────────────────────────────────────────

// eslint-disable-next-line complexity
function ManualFixPanel({
  unknownItems,
  canonicalOptions,
  mappingKind,
  onApply,
  subtopicGroups,
}: {
  unknownItems: string[];
  canonicalOptions: string[];
  mappingKind: 'topic' | 'subtopic';
  onApply: (mapping: Record<string, string>) => number;
  subtopicGroups?: readonly TopicSubtopicGroup[];
}) {
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [resultCount, setResultCount] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'alpha' | 'similarity'>('similarity');
  const [showPreview, setShowPreview] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkValue, setBulkValue] = useState('');

  const bestMatches = useMemo(() => {
    const map: Record<string, MatchResult> = {};
    for (const item of unknownItems) {
      const result = findBestMatch(item, canonicalOptions);
      if (result) map[item] = result;
    }
    return map;
  }, [unknownItems, canonicalOptions]);

  const sortedUnknownItems = useMemo(() => {
    const items = [...unknownItems];
    if (sortBy === 'alpha') {
      items.sort((a, b) => a.localeCompare(b));
    } else {
      items.sort((a, b) => {
        const scoreA = bestMatches[a]?.score ?? 0;
        const scoreB = bestMatches[b]?.score ?? 0;
        return scoreB - scoreA;
      });
    }
    return items;
  }, [unknownItems, sortBy, bestMatches]);

  const filteredUnknownItems = useMemo(() => {
    if (!search.trim()) return sortedUnknownItems;
    const q = search.trim().toLowerCase();
    return sortedUnknownItems.filter(
      (item) =>
        item.toLowerCase().includes(q) ||
        bestMatches[item]?.match.toLowerCase().includes(q),
    );
  }, [search, sortedUnknownItems, bestMatches]);

  const buildMapping = useCallback((): Record<string, string> => {
    const mapping: Record<string, string> = {};
    for (const item of unknownItems) {
      const sel = selections[item];
      if (!sel || sel === '') continue;
      if (sel === '__custom__') {
        const custom = (customInputs[item] ?? '').trim();
        if (custom) mapping[item] = custom;
      } else {
        mapping[item] = sel;
      }
    }
    return mapping;
  }, [unknownItems, selections, customInputs]);

  const handleSelect = (unknown: string, value: string) => {
    setSelections((prev) => ({ ...prev, [unknown]: value }));
    if (value !== '__custom__') {
      setCustomInputs((prev) => {
        const next = { ...prev };
        delete next[unknown];
        return next;
      });
    }
  };

  const handleCustomInput = (unknown: string, text: string) => {
    setCustomInputs((prev) => ({ ...prev, [unknown]: text }));
    setSelections((prev) => ({ ...prev, [unknown]: '__custom__' }));
  };

  const handleApply = () => {
    const mapping = buildMapping();
    if (Object.keys(mapping).length === 0) return;
    const count = onApply(mapping);
    setResultCount(count);
  };

  const handleApplyAllBestMatches = () => {
    const newSelections = { ...selections };
    for (const [item, best] of Object.entries(bestMatches)) {
      newSelections[item] = best.match;
    }
    setSelections(newSelections);
    setCustomInputs({});
  };

  const handleBulkApply = () => {
    if (!bulkValue || bulkSelected.size === 0) return;
    const newSelections = { ...selections };
    for (const item of bulkSelected) {
      newSelections[item] = bulkValue;
    }
    setSelections(newSelections);
    setBulkSelected(new Set());
    setBulkMode(false);
    setBulkValue('');
  };

  const toggleBulkItem = (item: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item)) {
        next.delete(item);
      } else {
        next.add(item);
      }
      return next;
    });
  };

  const selectAllBulk = () => setBulkSelected(new Set(filteredUnknownItems));
  const deselectAllBulk = () => setBulkSelected(new Set());

  const resolvedCount = Object.keys(selections).filter((k) => {
    const sel = selections[k];
    if (!sel || sel === '') return false;
    if (sel === '__custom__') return !!(customInputs[k] ?? '').trim();
    return true;
  }).length;

  const unresolvedCount = unknownItems.filter((item) => {
    const sel = selections[item];
    if (!sel || sel === '') return true;
    if (sel === '__custom__') return !(customInputs[item] ?? '').trim();
    return false;
  }).length;

  const previewMapping = useMemo(
    () => Object.entries(buildMapping()),
    [buildMapping],
  );

  const autocompleteGroups = useMemo(() => {
    const groups =
      subtopicGroups && subtopicGroups.length > 0
        ? subtopicGroups.map((g) => ({
            label: g.label,
            options: g.subtopics.map((s) => ({ value: s, label: s })),
          }))
        : [
            {
              label: 'Canonical Options',
              options: canonicalOptions.map((o) => ({ value: o, label: o })),
            },
          ];

    // Add Manual Override as a special group at the end
    groups.push({
      label: 'Overrides',
      options: [{ value: '__custom__', label: 'Manual Override…' }],
    });

    return groups;
  }, [subtopicGroups, canonicalOptions]);

  const isAndroid =
    typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

  if (resultCount !== null) {
    return (
      <motion.div
        key='success-message'
        initial={{ opacity: 0, scale: 0.95, z: 0 }}
        animate={{ opacity: 1, scale: 1, z: 0 }}
        className='p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex flex-col items-center justify-center text-center space-y-3'
        style={isAndroid ? { willChange: 'opacity, transform' } : undefined}
      >
        <div className='h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500'>
          <CheckCircle2 className='h-6 w-6' />
        </div>
        <div>
          <h4 className='text-sm font-semibold text-emerald-600 dark:text-emerald-400'>
            Cleanup Successful
          </h4>
          <p className='text-xs text-muted-foreground mt-1'>
            Updated {resultCount} {mappingKind}(s) across your history.
          </p>
        </div>
        <Button
          size='sm'
          variant='outline'
          onClick={() => setResultCount(null)}
        >
          Scrub More
        </Button>
      </motion.div>
    );
  }

  return (
    <div key='main-panel' className='space-y-4'>
      {/* Control Bar */}
      <div className='flex flex-wrap items-center gap-3 p-3 bg-muted/30 border border-border rounded-lg'>
        <div className='relative flex-1 min-w-60'>
          <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search unknown ${mappingKind}s…`}
            className='pl-9 h-9 bg-background border-border text-sm'
          />
        </div>

        <div className='flex items-center gap-1 bg-background border border-border rounded-md p-1'>
          <Button
            size='sm'
            variant='ghost'
            onClick={() => setSortBy('similarity')}
            className={cn(
              'h-7 text-xs px-2.5 gap-1.5',
              sortBy === 'similarity' && 'bg-muted font-medium',
            )}
          >
            <Activity className='h-3.5 w-3.5' />
            Match
          </Button>
          <Button
            size='sm'
            variant='ghost'
            onClick={() => setSortBy('alpha')}
            className={cn(
              'h-7 text-xs px-2.5 gap-1.5',
              sortBy === 'alpha' && 'bg-muted font-medium',
            )}
          >
            <ArrowUpDown className='h-3.5 w-3.5' />
            A-Z
          </Button>
        </div>

        <div className='h-6 w-px bg-border mx-1' />

        <div className='flex items-center gap-2'>
          <Button
            size='sm'
            variant={bulkMode ? 'default' : 'outline'}
            onClick={() => setBulkMode(!bulkMode)}
            className='h-9 px-3 gap-2'
          >
            {bulkMode ? (
              <CheckSquare className='h-4 w-4' />
            ) : (
              <Square className='h-4 w-4' />
            )}
            <span className='hidden sm:inline'>Bulk</span>
          </Button>
          <Button
            size='sm'
            variant='outline'
            onClick={() => setShowPreview(!showPreview)}
            disabled={resolvedCount === 0}
            className={cn('h-9 px-3 gap-2', showPreview && 'bg-muted')}
          >
            {showPreview ? (
              <EyeOff className='h-4 w-4' />
            ) : (
              <Eye className='h-4 w-4' />
            )}
            <span className='hidden sm:inline'>Preview</span>
            {resolvedCount > 0 && (
              <span className='ml-1 text-[10px] font-bold px-1.5 rounded-full bg-primary text-primary-foreground'>
                {resolvedCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Auto-fill Suggestions */}
      {Object.keys(bestMatches).length > 0 && unresolvedCount > 0 && (
        <motion.div
          key='suggestions-banner'
          initial={{ opacity: 0, y: -10, z: 0 }}
          animate={{ opacity: 1, y: 0, z: 0 }}
          className='flex items-center justify-between p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg'
          style={isAndroid ? { willChange: 'opacity, transform' } : undefined}
        >
          <div className='flex items-center gap-2 text-blue-600 dark:text-blue-400'>
            <Sparkles className='h-4 w-4' />
            <span className='text-xs font-medium'>
              {Object.keys(bestMatches).length} high-confidence matches found.
            </span>
          </div>
          <Button
            size='sm'
            variant='ghost'
            onClick={handleApplyAllBestMatches}
            className='h-7 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 gap-1.5'
          >
            <MousePointerClick className='h-3.5 w-3.5' />
            Auto-fill All
          </Button>
        </motion.div>
      )}

      {/* Bulk Toolbar */}
      <AnimatePresence>
        {bulkMode && (
          <motion.div
            key='bulk-toolbar'
            initial={{ height: 0, opacity: 0, z: 0 }}
            animate={{ height: 'auto', opacity: 1, z: 0 }}
            exit={{ height: 0, opacity: 0, z: 0 }}
            className='overflow-hidden'
            style={isAndroid ? { willChange: 'opacity, transform' } : undefined}
          >
            <div className='p-3 bg-secondary/50 border border-border rounded-lg flex flex-wrap items-center gap-3'>
              <div className='flex items-center gap-2 mr-auto'>
                <span className='text-xs font-semibold text-muted-foreground px-2 py-1 bg-muted rounded'>
                  {bulkSelected.size} Selected
                </span>
                <Button
                  size='sm'
                  variant='link'
                  onClick={selectAllBulk}
                  className='h-auto p-0 text-xs'
                >
                  Select All
                </Button>
                <Button
                  size='sm'
                  variant='link'
                  onClick={deselectAllBulk}
                  className='h-auto p-0 text-xs text-muted-foreground'
                >
                  Deselect
                </Button>
              </div>

              <div className='w-80'>
                <Autocomplete
                  value={bulkValue}
                  onChange={setBulkValue}
                  groups={autocompleteGroups}
                  placeholder='Map selection to…'
                  className='h-8 bg-background'
                  showMatchScore={false}
                />
              </div>

              <Button
                size='sm'
                onClick={handleBulkApply}
                disabled={bulkSelected.size === 0 || !bulkValue}
                className='h-8 px-4 gap-2'
              >
                <Check className='h-3.5 w-3.5' />
                Apply to Selection
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview Panel */}
      <AnimatePresence>
        {showPreview && previewMapping.length > 0 && (
          <motion.div
            key='preview-panel'
            initial={{ height: 0, opacity: 0, z: 0 }}
            animate={{ height: 'auto', opacity: 1, z: 0 }}
            exit={{ height: 0, opacity: 0, z: 0 }}
            className='overflow-hidden'
            style={isAndroid ? { willChange: 'opacity, transform' } : undefined}
          >
            <div className='p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg space-y-2'>
              <div className='flex items-center justify-between mb-2'>
                <h5 className='text-[10px] uppercase tracking-widest font-bold text-emerald-600 dark:text-emerald-400'>
                  Mapping Preview
                </h5>
                <span className='text-[10px] text-muted-foreground'>
                  {previewMapping.length} changes queued
                </span>
              </div>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5'>
                {previewMapping.map(([from, to]) => (
                  <div key={from} className='flex items-center gap-2 group'>
                    <DataLabel variant='unknown'>{from}</DataLabel>
                    <ArrowRight className='h-3 w-3 text-muted-foreground shrink-0' />
                    <DataLabel variant='canonical'>{to}</DataLabel>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid List */}
      <div className='space-y-2 max-h-125 overflow-y-auto pr-2 custom-scrollbar'>
        {filteredUnknownItems.length === 0 ? (
          <div className='py-12 flex flex-col items-center justify-center text-center space-y-2 opacity-50'>
            <Filter className='h-8 w-8 text-muted-foreground' />
            <p className='text-sm text-muted-foreground'>
              {search.trim()
                ? 'No matching data found.'
                : 'All data is canonical.'}
            </p>
          </div>
        ) : (
          filteredUnknownItems.map((item, idx) => {
            const sel = selections[item] ?? '';
            const isCustom = sel === '__custom__';
            const best = bestMatches[item];
            const isBulkChecked = bulkSelected.has(item);

            // Inject match scores into the options for this specific item
            const itemAutocompleteGroups = autocompleteGroups.map((group) => ({
              ...group,
              options: group.options.map((opt) => ({
                ...opt,
                matchScore:
                  best && opt.value === best.match ? best.score : undefined,
              })),
            }));

            return (
              <motion.div
                layout
                initial={{ opacity: 0, x: -10, z: 0 }}
                animate={{ opacity: 1, x: 0, z: 0 }}
                transition={{ delay: idx * 0.02 }}
                key={item}
                className={cn(
                  'group flex flex-col p-3 rounded-lg border transition-all duration-200',
                  isBulkChecked
                    ? 'bg-blue-500/5 border-blue-500/30'
                    : 'bg-background border-border hover:border-muted-foreground/30 hover:shadow-sm',
                )}
                style={
                  isAndroid ? { willChange: 'opacity, transform' } : undefined
                }
              >
                <div className='flex items-center gap-3'>
                  {bulkMode && (
                    <button
                      type='button'
                      onClick={() => toggleBulkItem(item)}
                      className={cn(
                        'shrink-0 h-5 w-5 rounded border flex items-center justify-center transition-colors',
                        isBulkChecked
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-border bg-muted/50',
                      )}
                    >
                      {isBulkChecked && <Check className='h-3 w-3' />}
                    </button>
                  )}

                  <div className='flex-[0.8] min-w-0 flex flex-col gap-1'>
                    <div className='flex items-center gap-2'>
                      <DataLabel variant='unknown'>{item}</DataLabel>
                      {best && (
                        <div className='flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity'>
                          <span className='text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 rounded'>
                            Suggestion
                          </span>
                        </div>
                      )}
                    </div>
                    {best && (
                      <div className='flex items-center gap-1 text-[10px] text-muted-foreground'>
                        <ThumbsUp className='h-2.5 w-2.5' />
                        <span>
                          Recommended:{' '}
                          <span className='font-semibold text-foreground'>
                            {best.match}
                          </span>{' '}
                          ({Math.round(best.score * 100)}% match)
                        </span>
                      </div>
                    )}
                  </div>

                  <div className='shrink-0 px-2'>
                    <ArrowRight className='h-4 w-4 text-muted-foreground opacity-30' />
                  </div>

                  <div className='flex-[1.2] min-w-0 space-y-1.5'>
                    <Autocomplete
                      value={isCustom ? '__custom__' : sel}
                      onChange={(v) => handleSelect(item, v)}
                      groups={itemAutocompleteGroups}
                      placeholder='Map to canonical…'
                      className='bg-muted/30 group-hover:bg-background transition-colors'
                      showMatchScore={true}
                    />

                    {isCustom && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <div className='relative'>
                          <PencilLine className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground' />
                          <Input
                            value={customInputs[item] ?? ''}
                            onChange={(e) =>
                              handleCustomInput(item, e.target.value)
                            }
                            placeholder='Type custom canonical value…'
                            className='h-8 pl-8 text-xs font-mono bg-background border-dashed border-muted-foreground/30 focus-visible:border-primary'
                          />
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Footer Actions */}
      <div className='flex items-center justify-between pt-4 border-t border-border'>
        <div className='text-xs text-muted-foreground'>
          {resolvedCount} of {unknownItems.length} items mapped
        </div>
        <div className='flex items-center gap-2'>
          <Button
            size='sm'
            variant='ghost'
            onClick={() => {
              setSelections({});
              setCustomInputs({});
              setBulkSelected(new Set());
            }}
            className='h-9 px-4 text-muted-foreground hover:text-destructive gap-2'
          >
            <Trash2 className='h-4 w-4' />
            Reset
          </Button>
          <Button
            size='sm'
            onClick={handleApply}
            disabled={resolvedCount === 0}
            className='h-9 px-6 gap-2 shadow-lg shadow-primary/20 transition-all active:scale-95'
          >
            <Check className='h-4 w-4' />
            Apply Changes
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Extraction Components ───────────────────────────────────────────────────

function HealthDashboard({
  scan,
  hasUnknowns,
  hasUnknownTopics,
  hasUnknownSubtopics,
}: {
  scan: ScanResult;
  hasUnknowns: boolean;
  hasUnknownTopics: boolean;
  hasUnknownSubtopics: boolean;
}) {
  const isAndroid =
    typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

  return (
    <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
      <motion.div
        key='health-score-card'
        layout
        className='lg:col-span-2 p-6 rounded-2xl border border-border bg-linear-to-br from-background to-muted/20 relative overflow-hidden group shadow-sm'
        style={isAndroid ? { willChange: 'opacity, transform' } : undefined}
      >
        <div className='absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity'>
          <Database className='h-32 w-32 rotate-12' />
        </div>

        <div className='relative z-10 space-y-6'>
          <div className='flex items-center justify-between'>
            <div className='space-y-1'>
              <h3 className='text-sm font-bold uppercase tracking-wider text-muted-foreground'>
                Canonical Health
              </h3>
              <div className='flex items-baseline gap-2'>
                <span className='text-4xl font-black tabular-nums tracking-tight'>
                  {Math.round(scan.healthScore)}%
                </span>
                <span className='text-xs font-medium text-muted-foreground'>
                  of history is valid
                </span>
              </div>
            </div>
            <div className='h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20'>
              <Activity className='h-6 w-6' />
            </div>
          </div>

          <div className='space-y-2'>
            <div className='h-3 w-full bg-muted rounded-full overflow-hidden border border-border p-0.5'>
              <motion.div
                key='health-progress-bar'
                initial={{ width: 0, z: 0 }}
                animate={{ width: `${scan.healthScore}%`, z: 0 }}
                className={cn(
                  'h-full rounded-full shadow-sm',
                  scan.healthScore > 90
                    ? 'bg-emerald-500'
                    : scan.healthScore > 60
                      ? 'bg-amber-500'
                      : 'bg-destructive',
                )}
                style={
                  isAndroid ? { willChange: 'width, transform' } : undefined
                }
              />
            </div>
            <div className='flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>
              <span>Valid Entries</span>
              <span>
                {scan.canonicalCount} / {scan.totalEntries}
              </span>
            </div>
          </div>

          <div className='grid grid-cols-2 gap-4'>
            <div
              key='topics-stats'
              className='p-3 rounded-xl bg-background/50 border border-border'
            >
              <div className='text-[10px] font-bold text-muted-foreground uppercase mb-1'>
                Topics
              </div>
              <div className='flex items-center gap-2'>
                <span
                  className={cn(
                    'text-lg font-bold',
                    hasUnknownTopics ? 'text-amber-500' : 'text-emerald-500',
                  )}
                >
                  {scan.unknownTopics.length}
                </span>
                <span className='text-xs text-muted-foreground'>unknown</span>
              </div>
            </div>
            <div
              key='subtopics-stats'
              className='p-3 rounded-xl bg-background/50 border border-border'
            >
              <div className='text-[10px] font-bold text-muted-foreground uppercase mb-1'>
                Subtopics
              </div>
              <div className='flex items-center gap-2'>
                <span
                  className={cn(
                    'text-lg font-bold',
                    hasUnknownSubtopics ? 'text-amber-500' : 'text-emerald-500',
                  )}
                >
                  {scan.unknownSubtopics.length}
                </span>
                <span className='text-xs text-muted-foreground'>unknown</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        key='audit-summary-card'
        layout
        className='p-6 rounded-2xl border border-border bg-card flex flex-col justify-between h-full shadow-sm'
        style={isAndroid ? { willChange: 'opacity, transform' } : undefined}
      >
        <div className='space-y-4'>
          <div className='flex items-center gap-2 text-amber-500'>
            <AlertTriangle className='h-4 w-4' />
            <h4 className='text-xs font-bold uppercase tracking-wider'>
              Audit Summary
            </h4>
          </div>
          <p className='text-xs leading-relaxed text-muted-foreground'>
            Scanning{' '}
            <span className='font-bold text-foreground'>
              {scan.totalWritten}
            </span>{' '}
            written and{' '}
            <span className='font-bold text-foreground'>{scan.totalMc}</span>{' '}
            multiple-choice records.
          </p>
          {!hasUnknowns ? (
            <div
              key='all-valid'
              className='p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-3'
            >
              <div className='h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0'>
                <CheckCircle2 className='h-4 w-4' />
              </div>
              <span className='text-xs font-medium text-emerald-600 dark:text-emerald-400'>
                Metadata Integrity Verified
              </span>
            </div>
          ) : (
            <div key='has-unknowns' className='space-y-3'>
              <p className='text-[11px] text-muted-foreground'>
                Detected{' '}
                <span className='font-mono font-bold text-amber-600 dark:text-amber-400'>
                  {scan.unknownTopics.length + scan.unknownSubtopics.length}
                </span>{' '}
                non-canonical entries that may cause synchronization issues.
              </p>
            </div>
          )}
        </div>

        <Button
          variant='outline'
          size='sm'
          className='w-full mt-6 h-10 rounded-xl gap-2 font-bold uppercase tracking-widest text-[10px]'
          onClick={() => window.location.reload()}
        >
          <RefreshCw className='h-3 w-3' />
          Rescan Database
        </Button>
      </motion.div>
    </div>
  );
}

function AutoAuditCard({
  title,
  subtitle,
  icon: Icon,
  loading,
  result,
  mapping,
  error,
  hasUnknown,
  onAudit,
  iconClass,
}: {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  loading: boolean;
  result: TopicCleanupResult | SubtopicCleanupResult | null;
  mapping: Record<string, string>;
  error: string | null;
  hasUnknown: boolean;
  onAudit: () => void;
  iconClass: string;
}) {
  const updatedCount = result
    ? 'topicsUpdated' in result
      ? result.topicsUpdated
      : result.subtopicsUpdated
    : 0;

  return (
    <div className='p-6 rounded-2xl border border-border bg-card space-y-6 relative overflow-hidden shadow-sm'>
      <div className='flex items-center gap-3 mb-2'>
        <div
          className={cn(
            'h-10 w-10 rounded-xl flex items-center justify-center border',
            iconClass,
          )}
        >
          <Icon className='h-5 w-5' />
        </div>
        <div>
          <h4 className='text-sm font-bold'>{title}</h4>
          <p className='text-xs text-muted-foreground'>{subtitle}</p>
        </div>
      </div>

      <div className='min-h-25 flex flex-col justify-center'>
        {result ? (
          <div
            key='success-panel'
            className='p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-3'
          >
            <div className='flex items-center gap-2 text-emerald-600 dark:text-emerald-400'>
              <CheckCircle2 className='h-4 w-4' />
              <span className='text-xs font-bold'>
                Success: {updatedCount} items updated
              </span>
            </div>
            <div className='max-h-30 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar'>
              {Object.entries(mapping).map(([from, to]) => (
                <div
                  key={from}
                  className='flex items-center gap-1.5 text-[10px]'
                >
                  <span className='font-mono opacity-50 line-through'>
                    {from}
                  </span>
                  <ArrowRight className='h-2 w-2 opacity-30' />
                  <span className='font-mono font-bold text-emerald-500'>
                    {to}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div key='audit-panel' className='space-y-4'>
            <p className='text-xs text-muted-foreground leading-relaxed italic'>
              The AI will analyze the unknown labels and map them to the closest
              VCAA specifications.
            </p>
            <Button
              onClick={onAudit}
              disabled={loading || !hasUnknown}
              className='w-full h-12 rounded-xl gap-3 text-sm font-bold shadow-lg shadow-primary/20 transition-all active:scale-[0.98]'
            >
              {loading ? (
                <Loader2 className='h-5 w-5 animate-spin' />
              ) : (
                <Sparkles className='h-5 w-5' />
              )}
              {loading
                ? 'Processing Data…'
                : `Start ${title.split(' ')[0]} Audit`}
            </Button>
          </div>
        )}
      </div>
      {error && <ErrorBanner message={error} />}
    </div>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────

// eslint-disable-next-line complexity
export function CleanupSection() {
  const {
    apiKey,
    questionHistory,
    updateQuestionHistoryEntry,
    mcHistory,
    updateMcHistoryEntry,
  } = useAppContext();

  const [activeTab, setActiveTab] = useState<'auto' | 'manual'>('auto');
  const [selectedModel, setSelectedModel] = useState(PRESET_MODELS[0].id);

  const [topicLoading, setTopicLoading] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);
  const [topicResult, setTopicResult] = useState<TopicCleanupResult | null>(
    null,
  );

  const [subtopicLoading, setSubtopicLoading] = useState(false);
  const [subtopicError, setSubtopicError] = useState<string | null>(null);
  const [subtopicResult, setSubtopicResult] =
    useState<SubtopicCleanupResult | null>(null);

  const isAndroid =
    typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

  const scan = useMemo((): ScanResult => {
    const topicSet = new Set<string>();
    const subtopicSet = new Set<string>();
    const totalEntriesCount = questionHistory.length + mcHistory.length;
    let nonCanonicalCount = 0;

    for (const entry of questionHistory) {
      const t = entry.question.topic;
      const st = entry.question.subtopic;
      let isUnk = false;
      if (t && !CANONICAL_TOPICS_SET.has(t)) {
        topicSet.add(t);
        isUnk = true;
      }
      if (st && !CANONICAL_SUBTOPICS_SET.has(st)) {
        subtopicSet.add(st);
        isUnk = true;
      }
      if (isUnk) nonCanonicalCount++;
    }
    for (const entry of mcHistory) {
      const t = entry.question.topic;
      const st = entry.question.subtopic;
      let isUnk = false;
      if (t && !CANONICAL_TOPICS_SET.has(t)) {
        topicSet.add(t);
        isUnk = true;
      }
      if (st && !CANONICAL_SUBTOPICS_SET.has(st)) {
        subtopicSet.add(st);
        isUnk = true;
      }
      if (isUnk) nonCanonicalCount++;
    }

    const canonicalCount = totalEntriesCount - nonCanonicalCount;
    const healthScore =
      totalEntriesCount > 0 ? (canonicalCount / totalEntriesCount) * 100 : 100;

    return {
      unknownTopics: [...topicSet].sort(),
      unknownSubtopics: [...subtopicSet].sort(),
      totalWritten: questionHistory.length,
      totalMc: mcHistory.length,
      totalEntries: totalEntriesCount,
      canonicalCount,
      healthScore,
    };
  }, [questionHistory, mcHistory]);

  const applyTopicMapping = useCallback(
    (topicMapping: Record<string, string>): number => {
      let count = 0;
      for (const entry of questionHistory) {
        const mappedTopic = entry.question.topic
          ? topicMapping[entry.question.topic]
          : undefined;
        if (!mappedTopic) continue;
        count++;
        updateQuestionHistoryEntry({
          ...entry,
          question: { ...entry.question, topic: mappedTopic },
          lastModified: Date.now(),
        });
      }
      for (const entry of mcHistory) {
        const mappedTopic = entry.question.topic
          ? topicMapping[entry.question.topic]
          : undefined;
        if (!mappedTopic) continue;
        count++;
        updateMcHistoryEntry({
          ...entry,
          question: { ...entry.question, topic: mappedTopic },
          lastModified: Date.now(),
        });
      }
      return count;
    },
    [
      questionHistory,
      mcHistory,
      updateQuestionHistoryEntry,
      updateMcHistoryEntry,
    ],
  );

  const applySubtopicMapping = useCallback(
    (subtopicMapping: Record<string, string>): number => {
      let count = 0;
      for (const entry of questionHistory) {
        const mappedSubtopic = entry.question.subtopic
          ? subtopicMapping[entry.question.subtopic]
          : undefined;
        if (!mappedSubtopic) continue;
        count++;
        updateQuestionHistoryEntry({
          ...entry,
          question: { ...entry.question, subtopic: mappedSubtopic },
          lastModified: Date.now(),
        });
      }
      for (const entry of mcHistory) {
        const mappedSubtopic = entry.question.subtopic
          ? subtopicMapping[entry.question.subtopic]
          : undefined;
        if (!mappedSubtopic) continue;
        count++;
        updateMcHistoryEntry({
          ...entry,
          question: { ...entry.question, subtopic: mappedSubtopic },
          lastModified: Date.now(),
        });
      }
      return count;
    },
    [
      questionHistory,
      mcHistory,
      updateQuestionHistoryEntry,
      updateMcHistoryEntry,
    ],
  );

  const handleCleanupTopics = useCallback(async () => {
    if (
      !apiKey.trim() ||
      selectedModel === 'custom' ||
      scan.unknownTopics.length === 0
    )
      return;
    setTopicLoading(true);
    setTopicError(null);
    setTopicResult(null);
    try {
      const response = await invoke<TopicsCleanupResponse>('cleanup_topics', {
        request: {
          model: selectedModel,
          apiKey,
          unknownTopics: scan.unknownTopics,
          canonicalTopics: CANONICAL_TOPICS,
        },
      });
      const topicMapping = response.topicMapping ?? {};
      const topicsUpdated = applyTopicMapping(topicMapping);
      setTopicResult({ topicMapping, topicsUpdated });
    } catch (e) {
      setTopicError(readBackendError(e));
    } finally {
      setTopicLoading(false);
    }
  }, [apiKey, selectedModel, scan, applyTopicMapping]);

  const handleCleanupSubtopics = useCallback(async () => {
    if (
      !apiKey.trim() ||
      selectedModel === 'custom' ||
      scan.unknownSubtopics.length === 0
    )
      return;
    setSubtopicLoading(true);
    setSubtopicError(null);
    setSubtopicResult(null);
    try {
      const response = await invoke<SubtopicsCleanupResponse>(
        'cleanup_subtopics',
        {
          request: {
            model: selectedModel,
            apiKey,
            unknownSubtopics: scan.unknownSubtopics,
            canonicalSubtopics: CANONICAL_SUBTOPICS,
          },
        },
      );
      const subtopicMapping = response.subtopicMapping ?? {};
      const subtopicsUpdated = applySubtopicMapping(subtopicMapping);
      setSubtopicResult({ subtopicMapping, subtopicsUpdated });
    } catch (e) {
      setSubtopicError(readBackendError(e));
    } finally {
      setSubtopicLoading(false);
    }
  }, [apiKey, selectedModel, scan, applySubtopicMapping]);

  const hasUnknownTopics = scan.unknownTopics.length > 0;
  const hasUnknownSubtopics = scan.unknownSubtopics.length > 0;
  const hasUnknowns = hasUnknownTopics || hasUnknownSubtopics;

  return (
    <div className='space-y-8 pb-12'>
      <SectionHeader
        key='header'
        title='Data Cleanup & Normalisation'
        description='Audit and sync your question metadata against official study design specifications.'
      />

      <HealthDashboard
        key='health-dashboard'
        scan={scan}
        hasUnknowns={hasUnknowns}
        hasUnknownTopics={hasUnknownTopics}
        hasUnknownSubtopics={hasUnknownSubtopics}
      />

      <AnimatePresence>
        {hasUnknowns && (
          <motion.div
            key='conditional-unknowns'
            initial={{ opacity: 0, y: 20, z: 0 }}
            animate={{ opacity: 1, y: 0, z: 0 }}
            className='space-y-8'
            style={isAndroid ? { willChange: 'opacity, transform' } : undefined}
          >
            <Divider key='cleanup-divider' />

            <div key='cleanup-tabs-container' className='w-full'>
              <div
                key='cleanup-tabs-header'
                className='flex flex-wrap items-center justify-between gap-4 mb-6'
              >
                <div
                  key='tab-switcher'
                  className='flex items-center bg-muted/50 p-1 rounded-xl border border-border shadow-inner'
                >
                  <button
                    key='auto-tab-btn'
                    onClick={() => setActiveTab('auto')}
                    className={cn(
                      'rounded-lg px-6 h-9 gap-2 flex items-center transition-all duration-200',
                      activeTab === 'auto'
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Wand2
                      className={cn(
                        'h-4 w-4',
                        activeTab === 'auto' && 'text-primary',
                      )}
                    />
                    <span className='text-xs font-bold uppercase tracking-wider'>
                      Auto-Normalize
                    </span>
                  </button>
                  <button
                    key='manual-tab-btn'
                    onClick={() => setActiveTab('manual')}
                    className={cn(
                      'rounded-lg px-6 h-9 gap-2 flex items-center transition-all duration-200',
                      activeTab === 'manual'
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Layers
                      className={cn(
                        'h-4 w-4',
                        activeTab === 'manual' && 'text-primary',
                      )}
                    />
                    <span className='text-xs font-bold uppercase tracking-wider'>
                      Manual Scrubbing
                    </span>
                  </button>
                </div>

                {activeTab === 'auto' && (
                  <div
                    key='engine-selector'
                    className='flex items-center gap-4 bg-muted/30 px-4 py-1.5 rounded-xl border border-border'
                  >
                    <span className='text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap'>
                      Engine
                    </span>
                    <ModelSelectRow
                      id='cleanup-model-select'
                      value={selectedModel}
                      models={PRESET_MODELS}
                      disabled={!apiKey}
                      onSelect={(v) => setSelectedModel(v)}
                    />
                  </div>
                )}
              </div>

              <div key='tab-content-container' className='min-h-100'>
                <AnimatePresence mode='wait'>
                  {activeTab === 'auto' ? (
                    <motion.div
                      key='auto'
                      initial={{ opacity: 0, x: -10, z: 0 }}
                      animate={{ opacity: 1, x: 0, z: 0 }}
                      exit={{ opacity: 0, x: 10, z: 0 }}
                      className='grid grid-cols-1 md:grid-cols-2 gap-8 outline-none'
                      style={
                        isAndroid
                          ? { willChange: 'opacity, transform' }
                          : undefined
                      }
                    >
                      <AutoAuditCard
                        key='topic-audit-card'
                        title='Topic Normalization'
                        subtitle='High-level category alignment'
                        icon={Settings2}
                        loading={topicLoading}
                        result={topicResult}
                        mapping={topicResult?.topicMapping ?? {}}
                        error={topicError}
                        hasUnknown={hasUnknownTopics}
                        onAudit={() => void handleCleanupTopics()}
                        iconClass='bg-amber-500/10 text-amber-500 border-amber-500/20'
                      />
                      <AutoAuditCard
                        key='subtopic-audit-card'
                        title='Subtopic Refinement'
                        subtitle='Granular study design mapping'
                        icon={Wand2}
                        loading={subtopicLoading}
                        result={subtopicResult}
                        mapping={subtopicResult?.subtopicMapping ?? {}}
                        error={subtopicError}
                        hasUnknown={hasUnknownSubtopics}
                        onAudit={() => void handleCleanupSubtopics()}
                        iconClass='bg-blue-500/10 text-blue-500 border-blue-500/20'
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key='manual'
                      initial={{ opacity: 0, x: 10, z: 0 }}
                      animate={{ opacity: 1, x: 0, z: 0 }}
                      exit={{ opacity: 0, x: -10, z: 0 }}
                      className='grid grid-cols-1 gap-12 outline-none'
                      style={
                        isAndroid
                          ? { willChange: 'opacity, transform' }
                          : undefined
                      }
                    >
                      {hasUnknownTopics && !topicResult && (
                        <div key='topic-scrubbing' className='space-y-4'>
                          <div className='flex items-center gap-3'>
                            <div className='h-1.5 w-1.5 rounded-full bg-amber-500' />
                            <h4 className='text-xs font-black uppercase tracking-[0.2em] text-muted-foreground'>
                              Topic Scrubbing Station
                            </h4>
                          </div>
                          <ManualFixPanel
                            key='topic-manual-panel'
                            unknownItems={scan.unknownTopics}
                            canonicalOptions={CANONICAL_TOPICS}
                            mappingKind='topic'
                            onApply={applyTopicMapping}
                          />
                        </div>
                      )}

                      {hasUnknownSubtopics && !subtopicResult && (
                        <div key='subtopic-scrubbing' className='space-y-4'>
                          <div className='flex items-center gap-3'>
                            <div className='h-1.5 w-1.5 rounded-full bg-blue-500' />
                            <h4 className='text-xs font-black uppercase tracking-[0.2em] text-muted-foreground'>
                              Subtopic Scrubbing Station
                            </h4>
                          </div>
                          <ManualFixPanel
                            key='subtopic-manual-panel'
                            unknownItems={scan.unknownSubtopics}
                            canonicalOptions={CANONICAL_SUBTOPICS}
                            mappingKind='subtopic'
                            onApply={applySubtopicMapping}
                            subtopicGroups={[
                              ...MATH_METHODS_SUBTOPIC_GROUPS,
                              ...SPECIALIST_MATH_SUBTOPIC_GROUPS,
                              ...CHEMISTRY_SUBTOPIC_GROUPS,
                              ...PE_SUBTOPIC_GROUPS,
                            ]}
                          />
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
