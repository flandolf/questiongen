import { invoke } from '@tauri-apps/api/core';
import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Sparkles,
  Square,
  ThumbsUp,
  Wand2,
  X,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { useAppContext } from '../../../AppContext';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { readBackendError } from '../../../lib/app-utils';
import {
  CHEMISTRY_SUBTOPICS,
  MATH_METHODS_SUBTOPICS,
  PHYSICAL_EDUCATION_SUBTOPICS,
  SPECIALIST_MATH_SUBTOPICS,
  type Topic,
  TOPICS,
} from '../../../types';
import {
  CHEMISTRY_SUBTOPIC_GROUPS,
  MATH_METHODS_SUBTOPIC_GROUPS,
  PE_SUBTOPIC_GROUPS,
  SPECIALIST_MATH_SUBTOPIC_GROUPS,
  type TopicSubtopicGroup,
} from '../../../types/catalog';
import { PRESET_MODELS } from '../constants';
import {
  Card,
  Divider,
  ErrorBanner,
  FieldGroup,
  ModelSelectRow,
  SectionHeader,
} from '../SettingsUI';

const CANONICAL_TOPICS: string[] = [...TOPICS];

const CANONICAL_SUBTOPICS: string[] = [
  ...MATH_METHODS_SUBTOPICS,
  ...SPECIALIST_MATH_SUBTOPICS,
  ...CHEMISTRY_SUBTOPICS,
  ...PHYSICAL_EDUCATION_SUBTOPICS,
];

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
};

// ─── Fuzzy Matching ───────────────────────────────────────────────────────────

/**
 * Represents the result of a fuzzy match operation with detailed rationale.
 */
type MatchResult = {
  /** The matched canonical value */
  match: string;
  /** Similarity score between 0 and 1 */
  score: number;
  /** Human-readable explanation of why this match was chosen */
  rationale: string;
  /** Whether multiple options tied for best score */
  isTie: boolean;
};

/**
 * Memoization cache for similarity computations between string pairs.
 * Uses a composite key to avoid recomputing the same pair.
 */
const similarityCache = new Map<string, number>();

/**
 * Computes a normalized similarity score between two strings.
 * Uses multiple heuristics: exact match, substring containment, and Levenshtein distance.
 * Results are cached to avoid redundant computation.
 *
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns Similarity score between 0 (no similarity) and 1 (identical)
 */
function similarity(a: string, b: string): number {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();

  // Create cache key with consistent ordering
  const cacheKey = la < lb ? `${la}|||${lb}` : `${lb}|||${la}`;
  if (similarityCache.has(cacheKey)) {
    return similarityCache.get(cacheKey)!;
  }

  let result: number;

  if (la === lb) {
    result = 1;
  } else if (lb.includes(la) || la.includes(lb)) {
    // Substring containment indicates high similarity
    result = 0.85;
  } else {
    // Levenshtein-based similarity for more nuanced comparison
    const lenA = la.length;
    const lenB = lb.length;
    if (lenA === 0 || lenB === 0) {
      result = 0;
    } else {
      // Optimized Levenshtein using two-row approach
      let prevRow: number[] = new Array(lenB + 1).fill(0).map((_, j) => j);
      const currRow: number[] = new Array<number>(lenB + 1);

      for (let i = 1; i <= lenA; i++) {
        currRow[0] = i;
        for (let j = 1; j <= lenB; j++) {
          const cost = la[i - 1] === lb[j - 1] ? 0 : 1;
          currRow[j] = Math.min(
            prevRow[j] + 1, // deletion
            currRow[j - 1] + 1, // insertion
            prevRow[j - 1] + cost, // substitution
          );
        }
        prevRow = [...currRow];
      }

      const distance = prevRow[lenB];
      result = 1 - distance / Math.max(lenA, lenB);
    }
  }

  similarityCache.set(cacheKey, result);
  return result;
}

/**
 * Determines the reason for a match score to provide user-facing rationale.
 *
 * @param a - Original unknown item
 * @param b - Matched canonical option
 * @param score - Computed similarity score
 * @returns Human-readable explanation of the match
 */
function getMatchRationale(a: string, b: string, score: number): string {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();

  if (score === 1) return 'Exact match';
  if (lb.includes(la)) return `Contains "${la}"`;
  if (la.includes(lb)) return `Contained in "${la}"`;

  const lenA = la.length;
  const lenB = lb.length;
  if (lenA === 0 || lenB === 0) return 'Empty string comparison';

  // Calculate approximate edit distance for rationale
  let prevRow: number[] = new Array(lenB + 1).fill(0).map((_, j) => j);
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
    prevRow = [...currRow];
  }

  const distance = prevRow[lenB];
  return `~${distance} edit${distance !== 1 ? 's' : ''} difference`;
}

/**
 * Finds the best canonical match for an unknown item using optimized search.
 * Handles ties deterministically by selecting the alphabetically first option.
 *
 * @param item - The unknown topic/subtopic to match
 * @param options - Array of canonical options to match against
 * @returns Best match result with score and rationale, or null if below threshold
 */
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
      // Deterministic tie-breaking: prefer alphabetically first option
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

const CONFIDENCE_THRESHOLD = 0.4;

// ─── Manual Fix Panel ─────────────────────────────────────────────────────────

/* eslint-disable-next-line complexity */
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
  const [expanded, setExpanded] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [resultCount, setResultCount] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'alpha' | 'similarity'>('similarity');
  const [showPreview, setShowPreview] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkValue, setBulkValue] = useState('');

  // Compute best matches for all unknown items with memoization
  const bestMatches = useMemo(() => {
    const map: Record<string, MatchResult> = {};
    for (const item of unknownItems) {
      const result = findBestMatch(item, canonicalOptions);
      if (result) {
        map[item] = result;
      }
    }
    return map;
  }, [unknownItems, canonicalOptions]);

  // Sort items
  const sortedUnknownItems = useMemo(() => {
    const items = [...unknownItems];
    if (sortBy === 'alpha') {
      items.sort((a, b) => a.localeCompare(b));
    } else {
      // Sort by best match score descending (most confident suggestions first)
      items.sort((a, b) => {
        const scoreA = bestMatches[a]?.score ?? 0;
        const scoreB = bestMatches[b]?.score ?? 0;
        return scoreB - scoreA;
      });
    }
    return items;
  }, [unknownItems, sortBy, bestMatches]);

  // Filter by search
  const filteredUnknownItems = useMemo(() => {
    if (!search.trim()) return sortedUnknownItems;
    const q = search.trim().toLowerCase();
    return sortedUnknownItems.filter(
      (item) =>
        item.toLowerCase().includes(q) ||
        bestMatches[item]?.match.toLowerCase().includes(q),
    );
  }, [search, sortedUnknownItems, bestMatches]);

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

  const buildMapping = (): Record<string, string> => {
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

  const selectAllBulk = () => {
    setBulkSelected(new Set(filteredUnknownItems));
  };

  const deselectAllBulk = () => {
    setBulkSelected(new Set());
  };

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

  // Live preview mapping
  const previewMapping = useMemo(() => {
    const mapping = buildMapping();
    return Object.entries(mapping);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections, customInputs, unknownItems]);

  // Reset state when panel collapses
  const handleExpandToggle = () => {
    setExpanded((v) => {
      if (v) {
        setSearch('');
        setBulkMode(false);
        setBulkSelected(new Set());
        setShowPreview(false);
      }
      return !v;
    });
  };

  if (resultCount !== null) {
    return (
      <Card className='p-4 space-y-3'>
        <div className='flex items-center gap-2'>
          <CheckCircle2 className='h-4 w-4 text-emerald-500' />
          <p className='text-sm font-medium'>
            Manual {mappingKind === 'topic' ? 'Topic' : 'Subtopic'} Fix Complete
          </p>
        </div>
        <p className='text-xs text-muted-foreground'>
          Updated {resultCount} {mappingKind}(s) across your history.
        </p>
      </Card>
    );
  }

  return (
    <Card className='overflow-hidden'>
      <button
        type='button'
        onClick={handleExpandToggle}
        className='w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors'
      >
        <div className='flex items-center gap-2'>
          <Pencil className='h-4 w-4 text-muted-foreground' />
          <span className='text-sm font-medium'>
            Manually Fix Unknown{' '}
            {mappingKind === 'topic' ? 'Topics' : 'Subtopics'}
          </span>
          <span className='text-xs text-muted-foreground'>
            ({unknownItems.length})
          </span>
          {Object.keys(bestMatches).length > 0 && (
            <span className='text-xs text-blue-600 dark:text-blue-400 flex items-center gap-0.5'>
              <Sparkles className='h-3 w-3' />
              {Object.keys(bestMatches).length} suggestions
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className='h-4 w-4 text-muted-foreground' />
        ) : (
          <ChevronDown className='h-4 w-4 text-muted-foreground' />
        )}
      </button>

      {expanded && (
        <div className='border-t border-border p-4 space-y-4'>
          {/* Toolbar */}
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search unknown ${mappingKind}s or canonical matches…`}
              className='h-7 text-xs font-mono flex-1 min-w-45'
              autoFocus
            />
            <Button
              size='sm'
              variant='outline'
              onClick={() =>
                setSortBy((s) => (s === 'alpha' ? 'similarity' : 'alpha'))
              }
              className='h-7 gap-1 text-xs'
              title={
                sortBy === 'alpha'
                  ? 'Sort by best match'
                  : 'Sort alphabetically'
              }
            >
              <ArrowUpDown className='h-3 w-3' />
              {sortBy === 'alpha' ? 'A-Z' : 'Best match'}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={() => setBulkMode((v) => !v)}
              className={`h-7 gap-1 text-xs ${bulkMode ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700' : ''}`}
            >
              {bulkMode ? (
                <CheckSquare className='h-3 w-3' />
              ) : (
                <Square className='h-3 w-3' />
              )}
              Bulk
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={() => setShowPreview((v) => !v)}
              className='h-7 gap-1 text-xs'
              disabled={resolvedCount === 0}
            >
              {showPreview ? (
                <EyeOff className='h-3 w-3' />
              ) : (
                <Eye className='h-3 w-3' />
              )}
              Preview {resolvedCount > 0 ? `(${resolvedCount})` : ''}
            </Button>
          </div>

          {/* Apply all best matches */}
          {Object.keys(bestMatches).length > 0 && unresolvedCount > 0 && (
            <Button
              size='sm'
              variant='outline'
              onClick={handleApplyAllBestMatches}
              className='gap-1.5 text-xs border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20'
            >
              <Sparkles className='h-3 w-3' />
              Auto-fill {Object.keys(bestMatches).length} best match
              {Object.keys(bestMatches).length !== 1 ? 'es' : ''}
            </Button>
          )}

          {/* Bulk mode toolbar */}
          {bulkMode && (
            <div className='flex flex-wrap items-center gap-2 p-2 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'>
              <span className='text-xs text-muted-foreground'>
                {bulkSelected.size} selected
              </span>
              <Button
                size='sm'
                variant='ghost'
                onClick={selectAllBulk}
                className='h-6 text-xs px-2'
              >
                Select all
              </Button>
              <Button
                size='sm'
                variant='ghost'
                onClick={deselectAllBulk}
                className='h-6 text-xs px-2'
              >
                Deselect all
              </Button>
              <div className='flex-1' />
              <Select value={bulkValue} onValueChange={setBulkValue}>
                <SelectTrigger className='h-6 text-xs w-50'>
                  <SelectValue placeholder='Map all selected to…' />
                </SelectTrigger>
                <SelectContent>
                  {canonicalOptions.map((opt) => (
                    <SelectItem key={opt} value={opt} className='text-xs'>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size='sm'
                onClick={handleBulkApply}
                disabled={bulkSelected.size === 0 || !bulkValue}
                className='h-6 text-xs gap-1'
              >
                <Check className='h-3 w-3' />
                Apply
              </Button>
            </div>
          )}

          {/* Preview panel */}
          {showPreview && previewMapping.length > 0 && (
            <div className='rounded border border-border bg-muted/30 p-3 space-y-1.5'>
              <p className='text-xs font-medium text-muted-foreground mb-2'>
                Mapping Preview ({previewMapping.length} change
                {previewMapping.length !== 1 ? 's' : ''}):
              </p>
              {previewMapping.map(([from, to]) => (
                <div key={from} className='text-xs flex items-center gap-1.5'>
                  <span className='font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 line-through truncate max-w-[45%]'>
                    {from}
                  </span>
                  <span className='text-muted-foreground shrink-0'>→</span>
                  <span className='font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 truncate max-w-[45%]'>
                    {to}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Item list */}
          {filteredUnknownItems.length === 0 ? (
            <div className='text-xs text-muted-foreground'>
              {search.trim() ? 'No matches found.' : 'No unknown items.'}
            </div>
          ) : (
            filteredUnknownItems.map((item) => {
              const sel = selections[item] ?? '';
              const isCustom = sel === '__custom__';
              const best = bestMatches[item];
              const isBulkChecked = bulkSelected.has(item);

              return (
                <div key={item} className='space-y-1.5'>
                  <div className='flex items-center gap-2'>
                    {bulkMode && (
                      <button
                        type='button'
                        onClick={() => toggleBulkItem(item)}
                        className='shrink-0 text-muted-foreground hover:text-foreground transition-colors'
                      >
                        {isBulkChecked ? (
                          <CheckSquare className='h-3.5 w-3.5 text-blue-600 dark:text-blue-400' />
                        ) : (
                          <Square className='h-3.5 w-3.5' />
                        )}
                      </button>
                    )}
                    <div className='shrink-0 flex flex-col items-start'>
                      <span className='font-mono text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200'>
                        {item}
                      </span>
                      {best && (
                        <span className='text-[10px] text-muted-foreground mt-0.5 flex items-center gap-0.5'>
                          <ThumbsUp className='h-2.5 w-2.5' />
                          {Math.round(best.score * 100)}% → {best.match}
                          {best.isTie && (
                            <span
                              className='text-blue-600 dark:text-blue-400 ml-0.5'
                              title='Multiple options tied'
                            >
                              ≈
                            </span>
                          )}
                          <span className='text-muted-foreground/70 ml-0.5'>
                            ({best.rationale})
                          </span>
                        </span>
                      )}
                    </div>
                    <span className='text-muted-foreground text-xs shrink-0'>
                      →
                    </span>
                    <div className='min-w-0 flex-1'>
                      <Select
                        value={isCustom ? '__custom__' : sel}
                        onValueChange={(v) => handleSelect(item, v)}
                      >
                        <SelectTrigger className='w-full h-7 text-xs'>
                          <SelectValue placeholder='Choose canonical…' />
                        </SelectTrigger>
                        <SelectContent>
                          {subtopicGroups && subtopicGroups.length > 0
                            ? subtopicGroups.map((group) => (
                                <SelectGroup key={group.groupId}>
                                  <SelectLabel className='font-semibold text-[10px] uppercase tracking-wider px-2 py-1 bg-muted/50 sticky top-0'>
                                    {group.label}
                                  </SelectLabel>
                                  {group.subtopics.map((opt) => {
                                    const matchScore =
                                      best && opt === best.match
                                        ? best.score
                                        : null;
                                    return (
                                      <SelectItem
                                        key={opt}
                                        value={opt}
                                        className='text-xs'
                                      >
                                        {opt}
                                        {matchScore !== null &&
                                        matchScore >= CONFIDENCE_THRESHOLD
                                          ? ` (${Math.round(matchScore * 100)}%)`
                                          : ''}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectGroup>
                              ))
                            : canonicalOptions.map((opt) => {
                                const matchScore =
                                  best && opt === best.match
                                    ? best.score
                                    : null;
                                return (
                                  <SelectItem
                                    key={opt}
                                    value={opt}
                                    className='text-xs'
                                  >
                                    {opt}
                                    {matchScore !== null &&
                                    matchScore >= CONFIDENCE_THRESHOLD
                                      ? ` (${Math.round(matchScore * 100)}%)`
                                      : ''}
                                  </SelectItem>
                                );
                              })}
                          <SelectItem
                            value='__custom__'
                            className='text-xs text-muted-foreground'
                          >
                            Custom value…
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {isCustom && (
                    <Input
                      value={customInputs[item] ?? ''}
                      onChange={(e) => handleCustomInput(item, e.target.value)}
                      placeholder='Type custom canonical value…'
                      className='h-7 text-xs font-mono'
                    />
                  )}
                </div>
              );
            })
          )}

          {/* Action buttons */}
          <div className='flex items-center gap-2 pt-2'>
            <Button
              size='sm'
              onClick={handleApply}
              disabled={resolvedCount === 0}
              className='gap-1.5'
            >
              <Check className='h-3.5 w-3.5' />
              Apply {resolvedCount > 0 ? `(${resolvedCount})` : ''}
            </Button>
            <Button
              size='sm'
              variant='ghost'
              onClick={() => {
                setSelections({});
                setCustomInputs({});
                setBulkSelected(new Set());
              }}
              className='gap-1.5 text-muted-foreground'
            >
              <X className='h-3.5 w-3.5' />
              Clear
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────

/* eslint-disable-next-line complexity */
export function CleanupSection() {
  const {
    apiKey,
    questionHistory,
    updateQuestionHistoryEntry,
    mcHistory,
    updateMcHistoryEntry,
  } = useAppContext();

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

  const scan = useMemo((): ScanResult => {
    const topicSet = new Set<string>();
    const subtopicSet = new Set<string>();

    for (const entry of questionHistory) {
      const t = entry.question.topic;
      if (t && !CANONICAL_TOPICS.includes(t)) topicSet.add(t);
      const st = entry.question.subtopic;
      if (st && !CANONICAL_SUBTOPICS.includes(st)) subtopicSet.add(st);
    }
    for (const entry of mcHistory) {
      const t = entry.question.topic;
      if (t && !CANONICAL_TOPICS.includes(t)) topicSet.add(t);
      const st = entry.question.subtopic;
      if (st && !CANONICAL_SUBTOPICS.includes(st)) subtopicSet.add(st);
    }

    return {
      unknownTopics: [...topicSet].sort(),
      unknownSubtopics: [...subtopicSet].sort(),
      totalWritten: questionHistory.length,
      totalMc: mcHistory.length,
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
          question: { ...entry.question, topic: mappedTopic as Topic },
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
          question: { ...entry.question, topic: mappedTopic as Topic },
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
    if (!apiKey.trim()) {
      setTopicError('API key is required.');
      return;
    }
    if (selectedModel === 'custom') {
      setTopicError('Select a specific model (not custom).');
      return;
    }
    if (scan.unknownTopics.length === 0) {
      setTopicError('No unknown topics found.');
      return;
    }

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
    if (!apiKey.trim()) {
      setSubtopicError('API key is required.');
      return;
    }
    if (selectedModel === 'custom') {
      setSubtopicError('Select a specific model (not custom).');
      return;
    }
    if (scan.unknownSubtopics.length === 0) {
      setSubtopicError('No unknown subtopics found.');
      return;
    }

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
    <div className='space-y-6'>
      <SectionHeader
        title='Data Cleanup'
        description='Normalize topics and subtopics in your question history to match canonical VCAA study design values.'
      />

      <Card className='p-4 space-y-3'>
        <div className='flex items-center gap-2'>
          <AlertTriangle className='h-4 w-4 text-amber-500' />
          <p className='text-sm font-medium'>Scan Results</p>
        </div>
        <p className='text-xs text-muted-foreground'>
          Scanning {scan.totalWritten} written and {scan.totalMc}{' '}
          multiple-choice history entries.
        </p>
        {!hasUnknowns ? (
          <p className='text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5'>
            <CheckCircle2 className='h-4 w-4' />
            All topics and subtopics are canonical.
          </p>
        ) : (
          <div className='space-y-2'>
            {hasUnknownTopics && (
              <div>
                <p className='text-xs font-medium text-muted-foreground mb-1'>
                  Unknown topics ({scan.unknownTopics.length}):
                </p>
                <div className='flex flex-wrap gap-1'>
                  {scan.unknownTopics.map((t) => (
                    <span
                      key={t}
                      className='inline-flex items-center px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs font-mono'
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {hasUnknownSubtopics && (
              <div>
                <p className='text-xs font-medium text-muted-foreground mb-1'>
                  Unknown subtopics ({scan.unknownSubtopics.length}):
                </p>
                <div className='flex flex-wrap gap-1'>
                  {scan.unknownSubtopics.map((st) => (
                    <span
                      key={st}
                      className='inline-flex items-center px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs font-mono'
                    >
                      {st}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {hasUnknowns && (
        <>
          <Divider />
          <section className='space-y-3'>
            <FieldGroup label='LLM Model' htmlFor='cleanup-model-select'>
              <ModelSelectRow
                id='cleanup-model-select'
                value={selectedModel}
                models={PRESET_MODELS}
                disabled={!apiKey}
                onSelect={(v) => setSelectedModel(v)}
              />
            </FieldGroup>
            <p className='text-xs text-muted-foreground'>
              The selected model will map non-canonical values to their closest
              canonical match.
            </p>
          </section>

          {hasUnknownTopics && (
            <div className='space-y-3'>
              {topicError && <ErrorBanner message={topicError} />}
              <Button
                onClick={() => void handleCleanupTopics()}
                disabled={topicLoading || !apiKey || selectedModel === 'custom'}
                className='gap-2'
              >
                {topicLoading ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <Wand2 className='h-4 w-4' />
                )}
                {topicLoading ? 'Normalizing Topics…' : 'Normalize Topics'}
              </Button>
            </div>
          )}

          {hasUnknownTopics && !topicResult && (
            <ManualFixPanel
              unknownItems={scan.unknownTopics}
              canonicalOptions={CANONICAL_TOPICS}
              mappingKind='topic'
              onApply={applyTopicMapping}
            />
          )}

          {hasUnknownSubtopics && !subtopicResult && (
            <ManualFixPanel
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
          )}

          {hasUnknownSubtopics && (
            <div className='space-y-3'>
              {subtopicError && <ErrorBanner message={subtopicError} />}
              <Button
                onClick={() => void handleCleanupSubtopics()}
                disabled={
                  subtopicLoading || !apiKey || selectedModel === 'custom'
                }
                className='gap-2'
              >
                {subtopicLoading ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <Wand2 className='h-4 w-4' />
                )}
                {subtopicLoading
                  ? 'Normalizing Subtopics…'
                  : 'Normalize Subtopics'}
              </Button>
            </div>
          )}

          {hasUnknownSubtopics && !subtopicResult && (
            <ManualFixPanel
              unknownItems={scan.unknownSubtopics}
              canonicalOptions={CANONICAL_SUBTOPICS}
              mappingKind='subtopic'
              onApply={applySubtopicMapping}
            />
          )}
        </>
      )}

      {topicResult && (
        <>
          <Divider />
          <Card className='p-4 space-y-3'>
            <div className='flex items-center gap-2'>
              <CheckCircle2 className='h-4 w-4 text-emerald-500' />
              <p className='text-sm font-medium'>Topic Cleanup Complete</p>
            </div>
            <p className='text-xs text-muted-foreground'>
              Updated {topicResult.topicsUpdated} topic(s) across your history.
            </p>
            {Object.keys(topicResult.topicMapping).length > 0 && (
              <div>
                <p className='text-xs font-medium text-muted-foreground mb-1'>
                  Topic mappings:
                </p>
                <div className='space-y-1'>
                  {Object.entries(topicResult.topicMapping).map(
                    ([from, to]) => (
                      <div
                        key={from}
                        className='text-xs flex items-center gap-1.5'
                      >
                        <span className='font-mono px-1.5 py-0.5 rounded bg-muted line-through'>
                          {from}
                        </span>
                        <span className='text-muted-foreground'>→</span>
                        <span className='font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200'>
                          {to}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {subtopicResult && (
        <>
          <Divider />
          <Card className='p-4 space-y-3'>
            <div className='flex items-center gap-2'>
              <CheckCircle2 className='h-4 w-4 text-emerald-500' />
              <p className='text-sm font-medium'>Subtopic Cleanup Complete</p>
            </div>
            <p className='text-xs text-muted-foreground'>
              Updated {subtopicResult.subtopicsUpdated} subtopic(s) across your
              history.
            </p>
            {Object.keys(subtopicResult.subtopicMapping).length > 0 && (
              <div>
                <p className='text-xs font-medium text-muted-foreground mb-1'>
                  Subtopic mappings:
                </p>
                <div className='space-y-1'>
                  {Object.entries(subtopicResult.subtopicMapping).map(
                    ([from, to]) => (
                      <div
                        key={from}
                        className='text-xs flex items-center gap-1.5'
                      >
                        <span className='font-mono px-1.5 py-0.5 rounded bg-muted line-through'>
                          {from}
                        </span>
                        <span className='text-muted-foreground'>→</span>
                        <span className='font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200'>
                          {to}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
