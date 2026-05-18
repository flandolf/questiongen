import { invoke } from '@tauri-apps/api/core';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Image as ImageIcon,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { fmt } from './formatters';
import { setCachedImageValidation } from './imageValidationCache';
import { Card, ErrorBanner } from './SettingsUI';
import type { ModelSearchResult, ModelStats, SortDir, SortKey } from './types';

const SEARCH_MAX_RESULTS = 15;
const SEARCH_LOAD_MORE = 10;
const SEARCH_CACHE_TTL_MS = 45 * 60_000;
const SEARCH_MIN_TPS = 30;
const SEARCH_MIN_UPTIME = 80;

const SORT_OPTIONS: { key: SortKey; label: string; description: string }[] = [
  { key: 'speed', label: 'Speed', description: 'Tokens/sec (p50)' },
  { key: 'priceIn', label: 'Input $', description: 'Prompt price per token' },
  {
    key: 'priceOut',
    label: 'Output $',
    description: 'Completion price per token',
  },
  {
    key: 'priceCombined',
    label: 'Combined $',
    description: 'Average of input + output price',
  },
  {
    key: 'latency',
    label: 'Latency',
    description: 'Time to first token (p50)',
  },
  { key: 'context', label: 'Context', description: 'Context window size' },
];

interface SearchCache {
  results: ModelSearchResult[];
  catalogueOffset: number;
  exhausted: boolean;
  fetchedAt: number;
}

interface CatalogueModel {
  id: string;
  name?: string;
  context_length?: number;
  supportsImages: boolean;
}

interface OpenRouterModelsResponse {
  data: {
    id: string;
    name?: string;
    context_length?: number;
    architecture?: { input_modalities?: string[] };
  }[];
}

const TABLE_SORT_COLUMNS: { k: SortKey; label: string; title: string }[] = [
  {
    k: 'speed',
    label: 'TPS',
    title: 'Throughput, tokens/sec (p50)',
  },
  {
    k: 'latency',
    label: 'Latency',
    title: 'Time to first token (p50)',
  },
  {
    k: 'priceIn',
    label: '$/M in',
    title: 'Input (prompt) price per 1M tokens',
  },
  {
    k: 'priceOut',
    label: '$/M out',
    title: 'Output (completion) price per 1M tokens',
  },
  {
    k: 'priceCombined',
    label: '$/M in+out',
    title: 'Combined input + output price per 1M tokens',
  },
  {
    k: 'context',
    label: 'Context',
    title: 'Context window size',
  },
];

const searchCache = new Map<string, SearchCache>();

function getCacheKey(
  apiKey: string,
  target: ModelSearchPanelProps['target'],
): string {
  return `${apiKey}:${target === 'imageMarking' ? 'image' : 'text'}`;
}

function getCachedEntry(
  apiKey: string,
  target: ModelSearchPanelProps['target'],
): SearchCache | null {
  const key = getCacheKey(apiKey, target);
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > SEARCH_CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  return entry;
}

function parseOpenRouterModels(raw: unknown): CatalogueModel[] {
  const catalog = raw as OpenRouterModelsResponse;
  return catalog.data
    .filter((m) => m.id?.includes('/'))
    .map((m) => ({
      id: m.id,
      name: m.name,
      context_length: m.context_length,
      supportsImages: (m.architecture?.input_modalities ?? []).some(
        (mod) => mod === 'image' || mod === 'vision' || mod === 'multimodal',
      ),
    }));
}

async function fetchOpenRouterModels(
  apiKey: string,
): Promise<CatalogueModel[]> {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenRouter returned ${res.status}`);
  const raw = (await res.json()) as unknown;
  return parseOpenRouterModels(raw);
}

function getSortValue(result: ModelSearchResult, sortKey: SortKey): number {
  switch (sortKey) {
    case 'speed':
      return result.tpsP50 ?? -1;
    case 'priceIn':
      return result.promptPricePerToken ?? Infinity;
    case 'priceOut':
      return result.completionPricePerToken ?? Infinity;
    case 'priceCombined':
      return (
        (result.promptPricePerToken ?? Infinity) +
        (result.completionPricePerToken ?? Infinity)
      );
    case 'latency':
      return result.latencyP50 ?? Infinity;
    case 'context':
      return result.contextLength ?? 0;
  }
}

function getDisplayedResults(
  results: ModelSearchResult[],
  query: string,
  sortKey: SortKey,
  sortDir: SortDir,
): ModelSearchResult[] {
  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? results.filter(
        (r) =>
          r.name.toLowerCase().includes(trimmed) ||
          r.id.toLowerCase().includes(trimmed),
      )
    : results;
  const dir = sortDir === 'desc' ? -1 : 1;
  return [...filtered].sort(
    (a, b) => dir * (getSortValue(a, sortKey) - getSortValue(b, sortKey)),
  );
}

function getCacheMinutesLeft(
  fromCache: boolean,
  apiKey: string,
  target: ModelSearchPanelProps['target'],
): number | null {
  if (!fromCache) return null;
  return Math.max(
    1,
    Math.ceil(
      (SEARCH_CACHE_TTL_MS -
        (Date.now() - (getCachedEntry(apiKey, target)?.fetchedAt ?? 0))) /
        60_000,
    ),
  );
}

function getStatusLine({
  loading,
  fromCache,
  cacheMinutesLeft,
  query,
  displayedCount,
  totalResults,
  requiresDesc,
}: {
  loading: boolean;
  fromCache: boolean;
  cacheMinutesLeft: number | null;
  query: string;
  displayedCount: number;
  totalResults: number;
  requiresDesc: string;
}): string {
  if (loading) return `Scanning for models with ${requiresDesc}…`;
  if (fromCache) {
    return `${totalResults} models · from cache (${cacheMinutesLeft}m remaining)`;
  }
  if (query.trim())
    return `${displayedCount} of ${totalResults} match "${query}"`;
  return `${totalResults} models loaded`;
}

interface ModelSearchPanelViewProps {
  target: ModelSearchPanelProps['target'];
  isImageTarget: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  query: string;
  setQuery: (value: string) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  toggleSort: (key: SortKey) => void;
  fromCache: boolean;
  exhausted: boolean;
  results: ModelSearchResult[];
  displayed: ModelSearchResult[];
  requiresDesc: string;
  statusLine: string;
  onLoadMore: () => void;
}

function ModelSearchHeader({
  target,
  isImageTarget,
  fromCache,
  loading,
  statusLine,
  onClose,
}: {
  target: ModelSearchPanelProps['target'];
  isImageTarget: boolean;
  fromCache: boolean;
  loading: boolean;
  statusLine: string;
  onClose: () => void;
}) {
  return (
    <div className='flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40'>
      <div className='min-w-0'>
        <p className='text-sm font-semibold flex items-center gap-2'>
          Model Search
          {target !== 'generation' && (
            <span className='text-xs font-normal text-muted-foreground'>
              for {isImageTarget ? 'image marking' : 'marking'}
            </span>
          )}
          {isImageTarget && (
            <span className='text-xs font-semibold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border border-sky-200 dark:border-sky-800 leading-none flex items-center gap-0.5'>
              <ImageIcon className='h-2.5 w-2.5' />
              Vision only
            </span>
          )}
          {fromCache && !loading && (
            <span className='text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 leading-none'>
              cached
            </span>
          )}
        </p>
        <p className='text-xs text-muted-foreground mt-0.5'>{statusLine}</p>
      </div>
      <button
        onClick={onClose}
        className='ml-4 shrink-0 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors'
        aria-label='Close'
      >
        <X className='h-4 w-4' />
      </button>
    </div>
  );
}

function ModelSearchLoadingBar({ loading }: { loading: boolean }) {
  return (
    <div className='h-0.5 bg-border overflow-hidden'>
      {loading ? (
        <div
          className='h-full w-1/3 bg-primary animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full'
          style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
        />
      ) : (
        <div className='h-full bg-emerald-500 w-full transition-all' />
      )}
    </div>
  );
}

function ModelSearchControls({
  query,
  setQuery,
  sortKey,
  toggleSort,
  SortIcon,
}: {
  query: string;
  setQuery: (value: string) => void;
  sortKey: SortKey;
  toggleSort: (key: SortKey) => void;
  SortIcon: ({ k }: { k: SortKey }) => React.JSX.Element;
}) {
  const SortBtn = ({
    k,
    label,
    title,
  }: {
    k: SortKey;
    label: string;
    title?: string;
  }) => (
    <button
      onClick={() => toggleSort(k)}
      title={title}
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors',
        sortKey === k
          ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <SortIcon k={k} />
      {label}
    </button>
  );

  return (
    <div className='flex items-center gap-2 px-4 py-2.5 border-b border-border bg-background flex-wrap gap-y-2'>
      <div className='relative flex-1 min-w-40'>
        <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none' />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Filter by name or ID…'
          className='pl-8 pr-8 h-8 text-sm'
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className='absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors'
            aria-label='Clear search'
          >
            <X className='h-3.5 w-3.5' />
          </button>
        )}
      </div>
      <div className='flex items-center gap-1 ml-auto flex-wrap'>
        <span className='text-xs text-muted-foreground/60 mr-1 hidden sm:inline'>
          Sort:
        </span>
        {SORT_OPTIONS.map(({ key, label, description }) => (
          <SortBtn key={key} k={key} label={label} title={description} />
        ))}
      </div>
    </div>
  );
}

function ModelSearchStates({
  error,
  loading,
  resultsLength,
  displayedLength,
  requiresDesc,
  query,
  setQuery,
}: {
  error: string | null;
  loading: boolean;
  resultsLength: number;
  displayedLength: number;
  requiresDesc: string;
  query: string;
  setQuery: (value: string) => void;
}) {
  if (error && !loading) {
    return (
      <div className='px-4 py-3'>
        <ErrorBanner message={error} />
      </div>
    );
  }

  if (!loading && resultsLength === 0) {
    return (
      <div className='px-4 py-10 text-center text-sm text-muted-foreground'>
        No models found matching the required capabilities ({requiresDesc}).
      </div>
    );
  }

  if (!loading && resultsLength > 0 && displayedLength === 0) {
    return (
      <div className='px-4 py-10 text-center'>
        <p className='text-sm text-muted-foreground mb-1.5'>
          No models match{' '}
          <span className='font-medium text-foreground'>"{query}"</span>
        </p>
        <button
          className='text-xs text-primary underline underline-offset-2'
          onClick={() => setQuery('')}
        >
          Clear filter
        </button>
      </div>
    );
  }

  if (loading && resultsLength === 0) {
    return (
      <div className='px-4 py-3 space-y-2'>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className='h-9 rounded-md bg-muted animate-pulse'
            style={{ opacity: 1 - i * 0.15 }}
          />
        ))}
      </div>
    );
  }

  return null;
}

function getResultsSummary(
  exhausted: boolean,
  query: string,
  displayedLength: number,
  resultsLength: number,
): string {
  if (exhausted) return `All ${resultsLength} qualifying models shown`;
  if (query.trim()) {
    return `Showing ${displayedLength} filtered · ${resultsLength} loaded`;
  }
  return `${resultsLength} models loaded`;
}

function ModelSearchResultsTable({
  displayed,
  isImageTarget,
  sortKey,
  toggleSort,
  SortIcon,
  onSelect,
  onClose,
  exhausted,
  query,
  resultsLength,
  loadingMore,
  onLoadMore,
}: {
  displayed: ModelSearchResult[];
  isImageTarget: boolean;
  sortKey: SortKey;
  toggleSort: (key: SortKey) => void;
  SortIcon: ({ k }: { k: SortKey }) => React.JSX.Element;
  onSelect: (id: string) => void;
  onClose: () => void;
  exhausted: boolean;
  query: string;
  resultsLength: number;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (displayed.length === 0) return null;

  return (
    <div className='overflow-x-auto'>
      <table className='w-full text-sm'>
        <thead className='sticky top-0 z-10 bg-muted/80 backdrop-blur border-b border-border'>
          <tr className='text-xs text-muted-foreground'>
            <th className='text-left px-4 py-2 font-medium'>Model</th>
            {TABLE_SORT_COLUMNS.map(({ k, label, title }) => (
              <th
                key={k}
                title={title}
                className={cn(
                  'text-right px-3 py-2 font-medium cursor-pointer hover:text-foreground transition-colors whitespace-nowrap select-none',
                  sortKey === k && 'text-foreground',
                )}
                onClick={() => toggleSort(k)}
              >
                <span className='inline-flex items-center justify-end gap-1'>
                  <SortIcon k={k} />
                  {label}
                </span>
              </th>
            ))}
            <th className='w-16 px-3 py-2' />
          </tr>
        </thead>
        <tbody className='divide-y divide-border'>
          {displayed.map((r) => {
            const idLower = r.id?.toLowerCase();
            const nameLower = r.name?.toLowerCase();
            const isDeepSeek = Boolean(
              idLower?.startsWith('deepseek') ||
                nameLower?.startsWith('deepseek') ||
                nameLower === 'deepseek',
            );

            return (
            <tr
              key={r.id}
              className='hover:bg-muted/40 transition-colors group'
            >
              <td className='px-4 py-2.5'>
                <div className='flex items-center gap-1.5 min-w-0'>
                  <div className='min-w-0'>
                    <p
                      className='font-medium text-sm truncate max-w-40'
                      title={r.name}
                    >
                      {r.name}
                    </p>
                    <p
                      className='text-xs text-muted-foreground truncate max-w-40'
                      title={r.id}
                    >
                      {r.id}
                    </p>
                  </div>
                  {isImageTarget && r.supportsImages && (
                    <span className='shrink-0 text-[10px] font-semibold px-1 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 leading-none'>
                      Vision
                    </span>
                  )}
                </div>
              </td>
              <td className='px-3 py-2.5 text-right tabular-nums text-sm text-muted-foreground'>
                {fmt.tps(r.tpsP50)}
              </td>
              <td className='px-3 py-2.5 text-right tabular-nums text-sm text-muted-foreground'>
                {fmt.latency(r.latencyP50)}
              </td>
              <td className='px-3 py-2.5 text-right tabular-nums text-sm text-muted-foreground'>
                {fmt.price(r.promptPricePerToken, isDeepSeek)}
              </td>
              <td className='px-3 py-2.5 text-right tabular-nums text-sm text-muted-foreground'>
                {fmt.price(r.completionPricePerToken, isDeepSeek)}
              </td>
              <td
                className={cn(
                  'px-3 py-2.5 text-right tabular-nums text-sm transition-colors',
                  sortKey === 'priceCombined'
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground',
                )}
              >
                {fmt.priceCombined(
                  r.promptPricePerToken,
                  r.completionPricePerToken,
                  isDeepSeek,
                )}
              </td>
              <td className='px-3 py-2.5 text-right tabular-nums text-sm text-muted-foreground'>
                {fmt.context(r.contextLength)}
              </td>
              <td className='px-3 py-2.5 text-right'>
                <Button
                  size='sm'
                  variant='outline'
                  className='h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity'
                  onClick={() => {
                    onSelect(r.id);
                    onClose();
                  }}
                >
                  Use
                </Button>
              </td>
            </tr>
          );
          })}
        </tbody>
      </table>

      <div className='px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between gap-3'>
        <p className='text-xs text-muted-foreground'>
          {getResultsSummary(exhausted, query, displayed.length, resultsLength)}
        </p>
        {!exhausted && (
          <Button
            variant='outline'
            size='sm'
            className='gap-1.5 h-7 text-xs shrink-0'
            disabled={loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore ? (
              <>
                <RefreshCw className='h-3 w-3 animate-spin' />
                Loading…
              </>
            ) : (
              <>Load {SEARCH_LOAD_MORE} more</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function ModelSearchPanelView({
  target,
  isImageTarget,
  onClose,
  onSelect,
  loading,
  loadingMore,
  error,
  query,
  setQuery,
  sortKey,
  sortDir,
  toggleSort,
  fromCache,
  exhausted,
  results,
  displayed,
  requiresDesc,
  statusLine,
  onLoadMore,
}: ModelSearchPanelViewProps) {
  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ArrowUpDown className='h-3 w-3 opacity-30' />;
    return sortDir === 'desc' ? (
      <ArrowDown className='h-3 w-3' />
    ) : (
      <ArrowUp className='h-3 w-3' />
    );
  }

  return (
    <Card className='overflow-hidden shadow-sm'>
      <ModelSearchHeader
        target={target}
        isImageTarget={isImageTarget}
        fromCache={fromCache}
        loading={loading}
        statusLine={statusLine}
        onClose={onClose}
      />

      <ModelSearchLoadingBar loading={loading} />

      <ModelSearchControls
        query={query}
        setQuery={setQuery}
        sortKey={sortKey}
        toggleSort={toggleSort}
        SortIcon={SortIcon}
      />

      <ModelSearchStates
        error={error}
        loading={loading}
        resultsLength={results.length}
        displayedLength={displayed.length}
        requiresDesc={requiresDesc}
        query={query}
        setQuery={setQuery}
      />

      <ModelSearchResultsTable
        displayed={displayed}
        isImageTarget={isImageTarget}
        sortKey={sortKey}
        toggleSort={toggleSort}
        SortIcon={SortIcon}
        onSelect={onSelect}
        onClose={onClose}
        exhausted={exhausted}
        query={query}
        resultsLength={results.length}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
      />
    </Card>
  );
}

export interface ModelSearchPanelProps {
  target: 'generation' | 'marking' | 'imageMarking' | 'tutor';
  onClose: () => void;
  onSelect: (id: string) => void;
  apiKey: string;
}

export function ModelSearchPanel({
  target,
  onClose,
  onSelect,
  apiKey,
}: ModelSearchPanelProps) {
  const [results, setResults] = useState<ModelSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('speed');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [fromCache, setFromCache] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const scanStateSetter = useState<{
    catalogue: CatalogueModel[];
    offset: number;
  }>(() => ({ catalogue: [], offset: 0 }))[1];

  const isImageTarget = target === 'imageMarking';

  const modelPasses = useCallback(
    (stats: ModelStats, supportsImages: boolean): boolean => {
      if (!stats.supportsStructuredOutput) return false;
      if (isImageTarget && !supportsImages) return false;
      if (isImageTarget) {
        if (stats.tpsP50 != null && stats.tpsP50 < SEARCH_MIN_TPS) return false;
        if (
          stats.uptimeLast30m != null &&
          stats.uptimeLast30m < SEARCH_MIN_UPTIME
        ) {
          return false;
        }
      }
      return true;
    },
    [isImageTarget],
  );

  const scanBatch = useCallback(
    async (
      catalogue: CatalogueModel[],
      startOffset: number,
      needed: number,
      currentResults: ModelSearchResult[],
      signal: { cancelled: boolean },
    ): Promise<{
      newResults: ModelSearchResult[];
      nextOffset: number;
      done: boolean;
    }> => {
      const BATCH = 8;
      const found: ModelSearchResult[] = [...currentResults];
      let offset = startOffset;

      outer: for (let i = offset; i < catalogue.length; i += BATCH) {
        if (
          signal.cancelled ||
          found.length - currentResults.length >= needed
        ) {
          break;
        }
        const batch = catalogue.slice(i, i + BATCH);
        await Promise.allSettled(
          batch.map(async (m) => {
            if (
              signal.cancelled ||
              found.length - currentResults.length >= needed
            ) {
              return;
            }
            try {
              const stats = await invoke<ModelStats>('get_model_stats', {
                apiKey,
                modelId: m.id,
              });
              if (signal.cancelled) return;
              if (modelPasses(stats, m.supportsImages)) {
                setCachedImageValidation(
                  apiKey,
                  m.id,
                  stats.supportsImages === true,
                );
                found.push({
                  id: m.id,
                  name: stats.name ?? m.name ?? m.id,
                  tpsP50: stats.tpsP50,
                  uptimeLast30m: stats.uptimeLast30m,
                  promptPricePerToken: stats.promptPricePerToken,
                  completionPricePerToken: stats.completionPricePerToken,
                  contextLength:
                    stats.contextLength ?? m.context_length ?? null,
                  latencyP50: stats.latencyP50,
                  supportsStructuredOutput: true,
                  supportsImages: m.supportsImages,
                });
                setResults([...found]);
              } else if (stats.supportsImages !== undefined) {
                setCachedImageValidation(
                  apiKey,
                  m.id,
                  stats.supportsImages === true,
                );
              }
            } catch {
              /* skip */
            }
          }),
        );
        offset = i + BATCH;
        if (found.length - currentResults.length >= needed) break outer;
      }

      const done = offset >= catalogue.length;
      return { newResults: found, nextOffset: offset, done };
    },
    [apiKey, modelPasses],
  );

  useEffect(() => {
    if (!apiKey.trim()) return;
    const cached = getCachedEntry(apiKey, target);
    if (cached) {
      setResults(cached.results);
      scanStateSetter({ catalogue: [], offset: cached.catalogueOffset });
      setExhausted(cached.exhausted);
      setLoading(false);
      setFromCache(true);
      return;
    }

    const signal = { cancelled: false };
    setLoading(true);
    setError(null);
    setResults([]);
    setFromCache(false);
    setExhausted(false);

    async function run() {
      try {
        const models = await fetchOpenRouterModels(apiKey);

        if (signal.cancelled) return;
        scanStateSetter({ catalogue: models, offset: 0 });

        const { newResults, nextOffset, done } = await scanBatch(
          models,
          0,
          SEARCH_MAX_RESULTS,
          [],
          signal,
        );
        if (signal.cancelled) return;

        setResults(newResults);
        setExhausted(done);
        scanStateSetter({ catalogue: models, offset: nextOffset });

        const cacheKey = getCacheKey(apiKey, target);
        searchCache.set(cacheKey, {
          results: newResults,
          catalogueOffset: nextOffset,
          exhausted: done,
          fetchedAt: Date.now(),
        });
      } catch (e) {
        if (!signal.cancelled) setError(String(e));
      } finally {
        if (!signal.cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      signal.cancelled = true;
    };
  }, [apiKey, target, scanBatch, scanStateSetter]);

  async function handleLoadMore() {
    const cached = getCachedEntry(apiKey, target);
    if (!cached || cached.exhausted) return;

    setLoadingMore(true);
    const signal = { cancelled: false };
    try {
      const models = await fetchOpenRouterModels(apiKey);

      const { newResults, nextOffset, done } = await scanBatch(
        models,
        cached.catalogueOffset,
        SEARCH_LOAD_MORE,
        cached.results,
        signal,
      );
      if (signal.cancelled) return;

      setResults(newResults);
      setExhausted(done);

      const cacheKey = getCacheKey(apiKey, target);
      searchCache.set(cacheKey, {
        results: newResults,
        catalogueOffset: nextOffset,
        exhausted: done,
        fetchedAt: cached.fetchedAt,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      if (!signal.cancelled) setLoadingMore(false);
    }
  }

  const displayed = useMemo(
    () => getDisplayedResults(results, query, sortKey, sortDir),
    [results, query, sortKey, sortDir],
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      const defaultAsc: SortKey[] = [
        'priceIn',
        'priceOut',
        'priceCombined',
        'latency',
      ];
      setSortDir(defaultAsc.includes(key) ? 'asc' : 'desc');
    }
  }

  const cacheMinutesLeft = getCacheMinutesLeft(fromCache, apiKey, target);

  const requiresDesc = isImageTarget
    ? 'structured output + vision + speed/uptime'
    : 'structured output + response_format';

  const statusLine = getStatusLine({
    loading,
    fromCache,
    cacheMinutesLeft,
    query,
    displayedCount: displayed.length,
    totalResults: results.length,
    requiresDesc,
  });

  return (
    <ModelSearchPanelView
      target={target}
      isImageTarget={isImageTarget}
      onClose={onClose}
      onSelect={onSelect}
      loading={loading}
      loadingMore={loadingMore}
      error={error}
      query={query}
      setQuery={setQuery}
      sortKey={sortKey}
      sortDir={sortDir}
      toggleSort={toggleSort}
      fromCache={fromCache}
      exhausted={exhausted}
      results={results}
      displayed={displayed}
      requiresDesc={requiresDesc}
      statusLine={statusLine}
      onLoadMore={() => void handleLoadMore()}
    />
  );
}
