import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import {
  Search,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Image as ImageIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, ErrorBanner } from './SettingsUI';
import { fmt } from './formatters';
import { setCachedImageValidation } from './imageValidationCache';
import type { ModelStats, ModelSearchResult, SortKey, SortDir } from './types';

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

const searchCache = new Map<string, SearchCache>();

function getCacheKey(
  apiKey: string,
  target: ModelSearchPanelProps['target']
): string {
  return `${apiKey}:${target === 'imageMarking' ? 'image' : 'text'}`;
}

function getCachedEntry(
  apiKey: string,
  target: ModelSearchPanelProps['target']
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

export interface ModelSearchPanelProps {
  target: 'generation' | 'marking' | 'imageMarking';
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
    catalogue: {
      id: string;
      name: string;
      context_length?: number;
      supportsImages: boolean;
    }[];
    offset: number;
  }>(() => ({ catalogue: [], offset: 0 }))[1];

  const isImageTarget = target === 'imageMarking';

  function modelPasses(stats: ModelStats, supportsImages: boolean): boolean {
    if (!stats.supportsStructuredOutput) return false;
    if (isImageTarget && !supportsImages) return false;
    if (isImageTarget) {
      if (stats.tpsP50 != null && stats.tpsP50 < SEARCH_MIN_TPS) return false;
      if (
        stats.uptimeLast30m != null &&
        stats.uptimeLast30m < SEARCH_MIN_UPTIME
      )
        return false;
    }
    return true;
  }

  async function scanBatch(
    catalogue: {
      id: string;
      name: string;
      context_length?: number;
      supportsImages: boolean;
    }[],
    startOffset: number,
    needed: number,
    currentResults: ModelSearchResult[],
    signal: { cancelled: boolean }
  ): Promise<{
    newResults: ModelSearchResult[];
    nextOffset: number;
    done: boolean;
  }> {
    const BATCH = 8;
    const found: ModelSearchResult[] = [...currentResults];
    let offset = startOffset;

    outer: for (let i = offset; i < catalogue.length; i += BATCH) {
      if (signal.cancelled || found.length - currentResults.length >= needed)
        break;
      const batch = catalogue.slice(i, i + BATCH);
      await Promise.allSettled(
        batch.map(async (m) => {
          if (
            signal.cancelled ||
            found.length - currentResults.length >= needed
          )
            return;
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
                stats.supportsImages === true
              );
              found.push({
                id: m.id,
                name: stats.name ?? m.name ?? m.id,
                tpsP50: stats.tpsP50,
                uptimeLast30m: stats.uptimeLast30m,
                promptPricePerToken: stats.promptPricePerToken,
                completionPricePerToken: stats.completionPricePerToken,
                contextLength: stats.contextLength ?? m.context_length ?? null,
                latencyP50: stats.latencyP50,
                supportsStructuredOutput: true,
                supportsImages: m.supportsImages,
              });
              setResults([...found]);
            } else if (stats.supportsImages !== undefined) {
              setCachedImageValidation(
                apiKey,
                m.id,
                stats.supportsImages === true
              );
            }
          } catch {
            /* skip */
          }
        })
      );
      offset = i + BATCH;
      if (found.length - currentResults.length >= needed) break outer;
    }

    const done = offset >= catalogue.length;
    return { newResults: found, nextOffset: offset, done };
  }

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
        const res = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) throw new Error(`OpenRouter returned ${res.status}`);
        const catalog: {
          data: {
            id: string;
            name: string;
            context_length?: number;
            architecture?: { input_modalities?: string[] };
          }[];
        } = await res.json();

        const models = catalog.data
          .filter((m) => m.id?.includes('/'))
          .map((m) => ({
            id: m.id,
            name: m.name,
            context_length: m.context_length,
            supportsImages: (m.architecture?.input_modalities ?? []).some(
              (mod) =>
                mod === 'image' || mod === 'vision' || mod === 'multimodal'
            ),
          }));

        if (signal.cancelled) return;
        scanStateSetter({ catalogue: models, offset: 0 });

        const { newResults, nextOffset, done } = await scanBatch(
          models,
          0,
          SEARCH_MAX_RESULTS,
          [],
          signal
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

    run();
    return () => {
      signal.cancelled = true;
    };
  }, [apiKey, target]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLoadMore() {
    const cached = getCachedEntry(apiKey, target);
    if (!cached || cached.exhausted) return;

    setLoadingMore(true);
    const signal = { cancelled: false };
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`OpenRouter returned ${res.status}`);
      const catalog: {
        data: {
          id: string;
          name: string;
          context_length?: number;
          architecture?: { input_modalities?: string[] };
        }[];
      } = await res.json();
      const models = catalog.data
        .filter((m) => m.id?.includes('/'))
        .map((m) => ({
          id: m.id,
          name: m.name,
          context_length: m.context_length,
          supportsImages: (m.architecture?.input_modalities ?? []).some(
            (mod) => mod === 'image' || mod === 'vision' || mod === 'multimodal'
          ),
        }));

      const { newResults, nextOffset, done } = await scanBatch(
        models,
        cached.catalogueOffset,
        SEARCH_LOAD_MORE,
        cached.results,
        signal
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

  const displayed = useMemo(() => {
    let list = results;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)
      );
    }
    const dir = sortDir === 'desc' ? -1 : 1;
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'speed':
          return dir * ((a.tpsP50 ?? -1) - (b.tpsP50 ?? -1));
        case 'priceIn':
          return (
            dir *
            ((a.promptPricePerToken ?? Infinity) -
              (b.promptPricePerToken ?? Infinity))
          );
        case 'priceOut':
          return (
            dir *
            ((a.completionPricePerToken ?? Infinity) -
              (b.completionPricePerToken ?? Infinity))
          );
        case 'priceCombined': {
          const aCombined =
            (a.promptPricePerToken ?? Infinity) +
            (a.completionPricePerToken ?? Infinity);
          const bCombined =
            (b.promptPricePerToken ?? Infinity) +
            (b.completionPricePerToken ?? Infinity);
          return dir * (aCombined - bCombined);
        }
        case 'latency':
          return (
            dir * ((a.latencyP50 ?? Infinity) - (b.latencyP50 ?? Infinity))
          );
        case 'context':
          return dir * ((a.contextLength ?? 0) - (b.contextLength ?? 0));
      }
    });
  }, [results, query, sortKey, sortDir]);

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

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === 'desc' ? (
      <ArrowDown className="h-3 w-3" />
    ) : (
      <ArrowUp className="h-3 w-3" />
    );
  }

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
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <SortIcon k={k} />
      {label}
    </button>
  );

  const cacheMinutesLeft = fromCache
    ? Math.max(
        1,
        Math.ceil(
          (SEARCH_CACHE_TTL_MS -
            (Date.now() - (getCachedEntry(apiKey, target)?.fetchedAt ?? 0))) /
            60_000
        )
      )
    : null;

  const requiresDesc = isImageTarget
    ? 'structured output + vision + speed/uptime'
    : 'structured output + response_format';

  const statusLine = loading
    ? `Scanning for models with ${requiresDesc}…`
    : fromCache
      ? `${results.length} models · from cache (${cacheMinutesLeft}m remaining)`
      : query.trim()
        ? `${displayed.length} of ${results.length} match "${query}"`
        : `${results.length} models loaded`;

  return (
    <Card className="overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
        <div className="min-w-0">
          <p className="text-sm font-semibold flex items-center gap-2">
            Model Search
            {target !== 'generation' && (
              <span className="text-xs font-normal text-muted-foreground">
                for {isImageTarget ? 'image marking' : 'marking'}
              </span>
            )}
            {isImageTarget && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border border-sky-200 dark:border-sky-800 leading-none flex items-center gap-0.5">
                <ImageIcon className="h-2.5 w-2.5" />
                Vision only
              </span>
            )}
            {fromCache && !loading && (
              <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 leading-none">
                cached
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{statusLine}</p>
        </div>
        <button
          onClick={onClose}
          className="ml-4 shrink-0 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="h-0.5 bg-border overflow-hidden">
        {loading ? (
          <div
            className="h-full w-1/3 bg-primary animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full"
            style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
          />
        ) : (
          <div className="h-full bg-emerald-500 w-full transition-all" />
        )}
      </div>

      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-background flex-wrap gap-y-2">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name or ID…"
            className="pl-8 pr-8 h-8 text-sm"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 ml-auto flex-wrap">
          <span className="text-xs text-muted-foreground/60 mr-1 hidden sm:inline">
            Sort:
          </span>
          {SORT_OPTIONS.map(({ key, label, description }) => (
            <SortBtn key={key} k={key} label={label} title={description} />
          ))}
        </div>
      </div>

      {error && !loading && (
        <div className="px-4 py-3">
          <ErrorBanner message={error} />
        </div>
      )}

      {!loading && !error && results.length === 0 && (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          No models found matching the required capabilities ({requiresDesc}).
        </div>
      )}
      {!loading && !error && results.length > 0 && displayed.length === 0 && (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground mb-1.5">
            No models match{' '}
            <span className="font-medium text-foreground">"{query}"</span>
          </p>
          <button
            className="text-xs text-primary underline underline-offset-2"
            onClick={() => setQuery('')}
          >
            Clear filter
          </button>
        </div>
      )}

      {loading && results.length === 0 && (
        <div className="px-4 py-3 space-y-2">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-9 rounded-md bg-muted animate-pulse"
              style={{ opacity: 1 - i * 0.15 }}
            />
          ))}
        </div>
      )}

      {displayed.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur border-b border-border">
              <tr className="text-xs text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">Model</th>
                {(
                  [
                    {
                      k: 'speed' as SortKey,
                      label: 'TPS',
                      title: 'Throughput, tokens/sec (p50)',
                    },
                    {
                      k: 'latency' as SortKey,
                      label: 'Latency',
                      title: 'Time to first token (p50)',
                    },
                    {
                      k: 'priceIn' as SortKey,
                      label: '$/M in',
                      title: 'Input (prompt) price per 1M tokens',
                    },
                    {
                      k: 'priceOut' as SortKey,
                      label: '$/M out',
                      title: 'Output (completion) price per 1M tokens',
                    },
                    {
                      k: 'priceCombined' as SortKey,
                      label: '$/M in+out',
                      title: 'Combined input + output price per 1M tokens',
                    },
                    {
                      k: 'context' as SortKey,
                      label: 'Context',
                      title: 'Context window size',
                    },
                  ] as { k: SortKey; label: string; title: string }[]
                ).map(({ k, label, title }) => (
                  <th
                    key={k}
                    title={title}
                    className={cn(
                      'text-right px-3 py-2 font-medium cursor-pointer hover:text-foreground transition-colors whitespace-nowrap select-none',
                      sortKey === k && 'text-foreground'
                    )}
                    onClick={() => toggleSort(k)}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      <SortIcon k={k} />
                      {label}
                    </span>
                  </th>
                ))}
                <th className="w-16 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayed.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-muted/40 transition-colors group"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="min-w-0">
                        <p
                          className="font-medium text-sm truncate max-w-[160px]"
                          title={r.name}
                        >
                          {r.name}
                        </p>
                        <p
                          className="text-xs text-muted-foreground truncate max-w-[160px]"
                          title={r.id}
                        >
                          {r.id}
                        </p>
                      </div>
                      {isImageTarget && r.supportsImages && (
                        <span className="shrink-0 text-[9px] font-bold px-1 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 leading-none">
                          Vision
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
                    {fmt.tps(r.tpsP50)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
                    {fmt.latency(r.latencyP50)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
                    {fmt.price(r.promptPricePerToken)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
                    {fmt.price(r.completionPricePerToken)}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2.5 text-right tabular-nums text-sm transition-colors',
                      sortKey === 'priceCombined'
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground'
                    )}
                  >
                    {fmt.priceCombined(
                      r.promptPricePerToken,
                      r.completionPricePerToken
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
                    {fmt.context(r.contextLength)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => {
                        onSelect(r.id);
                        onClose();
                      }}
                    >
                      Use
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {exhausted
                ? `All ${results.length} qualifying models shown`
                : query.trim()
                  ? `Showing ${displayed.length} filtered · ${results.length} loaded`
                  : `${results.length} models loaded`}
            </p>
            {!exhausted && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-7 text-xs shrink-0"
                disabled={loadingMore}
                onClick={handleLoadMore}
              >
                {loadingMore ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Loading…
                  </>
                ) : (
                  <>Load {SEARCH_LOAD_MORE} more</>
                )}
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
