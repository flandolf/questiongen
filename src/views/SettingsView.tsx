import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppSettings } from "../AppContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Eye, EyeOff, Bug, RefreshCw, Zap, DollarSign, Clock, Database,
  Settings, Key, Cpu, CreditCard, Palette, ChevronRight, CheckCircle2,
  AlertCircle, Search, Image, X, ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { readBackendError } from "../lib/app-utils";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModelStats {
  tpsP50: number | null;
  promptPricePerToken: number | null;
  completionPricePerToken: number | null;
  contextLength: number | null;
  supportsStructuredOutput: boolean;
  name: string | null;
  latencyP50: number | null;
  uptimeLast30m: number | null;
}

interface CreditsInfo {
  totalCredits: number;
  totalUsage: number;
  remaining: number;
}

interface ModelSearchResult {
  id: string;
  name: string;
  tpsP50: number | null;
  uptimeLast30m: number | null;
  promptPricePerToken: number | null;
  completionPricePerToken: number | null;
  contextLength: number | null;
  latencyP50: number | null;
  supportsStructuredOutput: boolean;
  supportsImages: boolean;
}

type SortKey = "speed" | "price" | "latency" | "context";
type SortDir = "asc" | "desc";
type Section = "api" | "models" | "credits" | "appearance" | "debug";

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_MODELS = [
  { id: "google/gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite" },
  { id: "google/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
  { id: "google/gemma-3n-e2b-it:free", name: "Gemma 3n E2B IT (Free)" },
  { id: "nvidia/nemotron-3-super-120b-a12b:nitro", name: "Nemotron 3 Super 120B (Nitro)" },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron 3 Super 120B (Free)" },
  { id: "mistralai/mistral-small-2603", name: "Mistral Small 4" },
  { id: "mistralai/ministral-3b-2512", name: "Mistral Ministral 3B" },
  { id: "qwen/qwen3.5-9b", name: "Qwen 3.5 9B" },
  { id: "qwen/qwen3.5-35b-a3b", name: "Qwen 3.5 35B" },
  { id: "openai/gpt-5.4-nano", name: "GPT-5.4 Nano" },
  { id: "custom", name: "Custom…" },
];


const SEARCH_MIN_TPS = 30;  // tok/s
const SEARCH_MIN_UPTIME = 80;  // %

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "speed", label: "Speed" },
  { key: "price", label: "Price" },
  { key: "latency", label: "Latency" },
  { key: "context", label: "Context" },
];

const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "api", label: "API Key", icon: <Key className="h-4 w-4" /> },
  { id: "models", label: "Models", icon: <Cpu className="h-4 w-4" /> },
  { id: "credits", label: "Credits", icon: <CreditCard className="h-4 w-4" /> },
  { id: "appearance", label: "Appearance", icon: <Palette className="h-4 w-4" /> },
  { id: "debug", label: "Debug", icon: <Bug className="h-4 w-4" /> },
];

// ─── Formatting helpers ───────────────────────────────────────────────────────

const fmt = {
  price(p: number | null) { return p == null ? "—" : `$${(p * 1e6).toFixed(2)}/M`; },
  tps(v: number | null) { return v == null ? "—" : `${v.toFixed(0)} t/s`; },
  latency(v: number | null) { return v == null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v.toFixed(0)} ms`; },
  context(v: number | null) { return v == null ? "—" : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v); },
  uptime(v: number | null) { return v == null ? "—" : `${v.toFixed(1)}%`; },
  time(d: Date | null) { return d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""; },
};

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

function FieldGroup({ label, htmlFor, hint, children }: {
  label: string; htmlFor?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Divider() { return <div className="border-t border-border my-6" />; }

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border border-border", className)}>{children}</div>;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
      <AlertCircle className="h-4 w-4 shrink-0" />{message}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-3">{message}</div>;
}

function StatusBadge({ value }: { value: string | boolean | null }) {
  if (value === null) return <span className="text-muted-foreground text-sm">—</span>;
  if (typeof value === "boolean") {
    return value
      ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-sm"><CheckCircle2 className="h-3.5 w-3.5" />Yes</span>
      : <span className="inline-flex items-center gap-1 text-muted-foreground text-sm"><AlertCircle className="h-3.5 w-3.5" />No</span>;
  }
  return <span className="tabular-nums text-sm font-medium">{value}</span>;
}

function ToggleRow({ id, checked, onChange, label, description }: {
  id: string; checked: boolean; onChange: (v: boolean) => void;
  label: string; description?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      <div>
        <Label htmlFor={id} className="font-medium cursor-pointer">{label}</Label>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

function ModelSelectRow({ id, value, models, disabled, onSelect, onSearch, placeholder = "Select a model" }: {
  id: string; value: string; models: { id: string; name: string }[];
  disabled?: boolean; onSelect: (v: string) => void; onSearch?: () => void; placeholder?: string;
}) {
  // Determine if the current value is a known preset (including "custom" sentinel)
  const isKnown = models.some((m) => m.id === value);

  // If it's a real model ID not in the list (e.g. picked via search or custom input),
  // inject it as an extra entry so the Select always has a matching item to display.
  const extraEntry = !isKnown && value && value !== "custom"
    ? [{ id: value, name: value.includes("/") ? value.split("/").slice(1).join("/") : value }]
    : [];

  // The Select's controlled value — always either a known ID or the injected one
  const selectVal = value && value !== "custom" ? value : (isKnown ? value : "");

  return (
    <div className="flex gap-2">
      <Select value={selectVal} onValueChange={onSelect}>
        <SelectTrigger id={id} className="w-full min-w-0">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {/* Injected entry for an out-of-preset model, shown at top with a subtle badge */}
          {extraEntry.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              <span className="flex items-center gap-2 min-w-0">
                <span className="truncate font-mono text-xs">{m.name}</span>
                <span className="shrink-0 text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-medium leading-none">custom</span>
              </span>
            </SelectItem>
          ))}
          {/* Separator between injected entry and presets */}
          {extraEntry.length > 0 && (
            <div className="my-1 border-t border-border" />
          )}
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {onSearch && (
        <Button
          variant="outline" size="sm" className="shrink-0"
          disabled={disabled} onClick={onSearch} title="Search all OpenRouter models"
        >
          <Search className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

function CustomModelInput({ id, value, onChange, onApply, label, hint }: {
  id: string; value: string; onChange: (v: string) => void; onApply: () => void;
  label: string; hint?: string;
}) {
  return (
    <div className="p-4 rounded-lg border border-dashed border-border space-y-3">
      <FieldGroup label={label} htmlFor={id} hint={hint ?? "Format: provider/model-name"}>
        <Input
          id={id} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. openai/gpt-4o" className="font-mono text-sm"
          onKeyDown={(e) => e.key === "Enter" && value.trim() && onApply()}
        />
      </FieldGroup>
      <Button size="sm" disabled={!value.trim()} onClick={onApply}>Apply</Button>
    </div>
  );
}

// ─── StatsTable ───────────────────────────────────────────────────────────────

const STAT_ROWS: { icon: React.ReactNode; label: string; get: (s: ModelStats) => string | boolean | null }[] = [
  { icon: <Zap className="h-3.5 w-3.5" />, label: "Throughput (p50)", get: s => fmt.tps(s.tpsP50) },
  { icon: <Clock className="h-3.5 w-3.5" />, label: "Latency TTFT (p50)", get: s => fmt.latency(s.latencyP50) },
  { icon: <DollarSign className="h-3.5 w-3.5" />, label: "Input price", get: s => fmt.price(s.promptPricePerToken) },
  { icon: <DollarSign className="h-3.5 w-3.5" />, label: "Output price", get: s => fmt.price(s.completionPricePerToken) },
  { icon: <Database className="h-3.5 w-3.5" />, label: "Context window", get: s => fmt.context(s.contextLength) },
  { icon: <Clock className="h-3.5 w-3.5" />, label: "Uptime (30 m)", get: s => fmt.uptime(s.uptimeLast30m) },
  { icon: <Settings className="h-3.5 w-3.5" />, label: "Structured output", get: s => s.supportsStructuredOutput },
];

interface StatsColumn { stats: ModelStats | null; label: string; loading: boolean; }

function StatsTable({ columns }: { columns: StatsColumn[] }) {
  const gridCols = (["", "grid-cols-2", "grid-cols-3", "grid-cols-4"] as const)[columns.length];
  return (
    <Card className="overflow-hidden">
      <div className={cn("grid text-xs font-medium text-muted-foreground bg-muted/50 px-4 py-2.5 border-b border-border", gridCols)}>
        <span>Metric</span>
        {columns.map((c, i) => (
          <span key={i} className="truncate min-w-0" title={c.label}>{c.label}</span>
        ))}
      </div>
      <div className="divide-y divide-border">
        {STAT_ROWS.map((row, ri) => (
          <div key={ri} className={cn("grid items-center px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors", gridCols)}>
            <span className="flex items-center gap-2 text-muted-foreground">{row.icon}{row.label}</span>
            {columns.map((col, ci) => (
              <span key={ci}>
                {col.loading
                  ? <span className="text-muted-foreground animate-pulse text-sm">Loading…</span>
                  : col.stats
                    ? <StatusBadge value={row.get(col.stats)} />
                    : <span className="text-muted-foreground text-sm">—</span>}
              </span>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── CreditBar ────────────────────────────────────────────────────────────────

function CreditBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const color = pct > 90 ? "bg-destructive" : pct > 70 ? "bg-amber-500" : "bg-primary";
  return (
    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
      <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

const SEARCH_MAX_RESULTS = 15;           // initial page size
const SEARCH_LOAD_MORE = 10;           // results to add per "Load more"
const SEARCH_CACHE_TTL_MS = 45 * 60_000;  // 45-minute cache

interface SearchCache {
  results: ModelSearchResult[];
  catalogueOffset: number;   // where to resume scanning from
  exhausted: boolean;        // true when the full catalogue has been scanned
  fetchedAt: number;
}

// Keyed by `${apiKey}:${target}` — generation/marking share one cache, imageMarking gets its own
const searchCache = new Map<string, SearchCache>();

function getCacheKey(apiKey: string, target: ModelSearchPanelProps["target"]): string {
  return `${apiKey}:${target === "imageMarking" ? "image" : "text"}`;
}

function getCachedEntry(apiKey: string, target: ModelSearchPanelProps["target"]): SearchCache | null {
  const key = getCacheKey(apiKey, target);
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > SEARCH_CACHE_TTL_MS) { searchCache.delete(key); return null; }
  return entry;
}

// ─── ModelSearchPanel ─────────────────────────────────────────────────────────


interface ModelSearchPanelProps {
  target: "generation" | "marking" | "imageMarking";
  onClose: () => void;
  onSelect: (id: string) => void;
  apiKey: string;
}

function ModelSearchPanel({ target, onClose, onSelect, apiKey }: ModelSearchPanelProps) {
  const [results, setResults] = useState<ModelSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("speed");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [fromCache, setFromCache] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const scanStateSetter = useState<{
    catalogue: { id: string; name: string; context_length?: number; supportsImages: boolean }[];
    offset: number;
  }>(() => ({ catalogue: [], offset: 0 }))[1];

  const isImageTarget = target === "imageMarking";

  function modelPasses(stats: ModelStats, supportsImages: boolean): boolean {
    if (!stats.supportsStructuredOutput) return false;
    if (isImageTarget && !supportsImages) return false;
    // Generation/marking: structured output is enough
    // Image marking: additionally need image support + TPS/uptime gates
    if (isImageTarget) {
      if (stats.tpsP50 != null && stats.tpsP50 < SEARCH_MIN_TPS) return false;
      if (stats.uptimeLast30m != null && stats.uptimeLast30m < SEARCH_MIN_UPTIME) return false;
    }
    return true;
  }

  async function scanBatch(
    catalogue: { id: string; name: string; context_length?: number; supportsImages: boolean }[],
    startOffset: number,
    needed: number,
    currentResults: ModelSearchResult[],
    signal: { cancelled: boolean },
  ): Promise<{ newResults: ModelSearchResult[]; nextOffset: number; done: boolean }> {
    const BATCH = 8;
    const found: ModelSearchResult[] = [...currentResults];
    let offset = startOffset;

    outer:
    for (let i = offset; i < catalogue.length; i += BATCH) {
      if (signal.cancelled || found.length - currentResults.length >= needed) break;
      const batch = catalogue.slice(i, i + BATCH);
      await Promise.allSettled(
        batch.map(async (m) => {
          if (signal.cancelled || found.length - currentResults.length >= needed) return;
          try {
            const stats = await invoke<ModelStats>("get_model_stats", { apiKey, modelId: m.id });
            if (signal.cancelled) return;
            if (modelPasses(stats, m.supportsImages)) {
              found.push({
                id: m.id, name: stats.name ?? m.name ?? m.id,
                tpsP50: stats.tpsP50, uptimeLast30m: stats.uptimeLast30m,
                promptPricePerToken: stats.promptPricePerToken,
                completionPricePerToken: stats.completionPricePerToken,
                contextLength: stats.contextLength ?? m.context_length ?? null,
                latencyP50: stats.latencyP50,
                supportsStructuredOutput: true,
                supportsImages: m.supportsImages,
              });
              setResults([...found]);
            }
          } catch { /* skip */ }
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
    setLoading(true); setError(null); setResults([]); setFromCache(false); setExhausted(false);

    async function run() {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) throw new Error(`OpenRouter returned ${res.status}`);
        const catalog: {
          data: {
            id: string; name: string; context_length?: number;
            architecture?: { input_modalities?: string[] };
          }[];
        } = await res.json();

        const models = catalog.data
          .filter((m) => m.id?.includes("/"))
          .map((m) => ({
            id: m.id, name: m.name, context_length: m.context_length,
            supportsImages: (m.architecture?.input_modalities ?? []).some(
              (mod) => mod === "image" || mod === "vision" || mod === "multimodal"
            ),
          }));

        if (signal.cancelled) return;
        scanStateSetter({ catalogue: models, offset: 0 });

        const { newResults, nextOffset, done } = await scanBatch(models, 0, SEARCH_MAX_RESULTS, [], signal);
        if (signal.cancelled) return;

        setResults(newResults);
        setExhausted(done);
        scanStateSetter({ catalogue: models, offset: nextOffset });

        const cacheKey = getCacheKey(apiKey, target);
        searchCache.set(cacheKey, { results: newResults, catalogueOffset: nextOffset, exhausted: done, fetchedAt: Date.now() });
      } catch (e) {
        if (!signal.cancelled) setError(String(e));
      } finally {
        if (!signal.cancelled) setLoading(false);
      }
    }

    run();
    return () => { signal.cancelled = true; };
  }, [apiKey, target]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLoadMore() {
    const cached = getCachedEntry(apiKey, target);
    if (!cached || cached.exhausted) return;

    setLoadingMore(true);
    const signal = { cancelled: false };
    try {
      // Re-fetch catalogue if needed (cache doesn't store it to save memory)
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`OpenRouter returned ${res.status}`);
      const catalog: {
        data: { id: string; name: string; context_length?: number; architecture?: { input_modalities?: string[] } }[];
      } = await res.json();
      const models = catalog.data
        .filter((m) => m.id?.includes("/"))
        .map((m) => ({
          id: m.id, name: m.name, context_length: m.context_length,
          supportsImages: (m.architecture?.input_modalities ?? []).some(
            (mod) => mod === "image" || mod === "vision" || mod === "multimodal"
          ),
        }));

      const { newResults, nextOffset, done } = await scanBatch(
        models, cached.catalogueOffset, SEARCH_LOAD_MORE, cached.results, signal
      );
      if (signal.cancelled) return;

      setResults(newResults);
      setExhausted(done);

      const cacheKey = getCacheKey(apiKey, target);
      searchCache.set(cacheKey, {
        results: newResults, catalogueOffset: nextOffset, exhausted: done,
        fetchedAt: cached.fetchedAt, // preserve original fetch time for TTL
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
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
    }
    const dir = sortDir === "desc" ? -1 : 1;
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case "speed": return dir * ((a.tpsP50 ?? -1) - (b.tpsP50 ?? -1));
        case "price": return dir * ((a.promptPricePerToken ?? Infinity) - (b.promptPricePerToken ?? Infinity));
        case "latency": return dir * ((a.latencyP50 ?? Infinity) - (b.latencyP50 ?? Infinity));
        case "context": return dir * ((a.contextLength ?? 0) - (b.contextLength ?? 0));
      }
    });
  }, [results, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir(key === "price" || key === "latency" ? "asc" : "desc"); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />;
  }

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => toggleSort(k)}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors",
        sortKey === k ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <SortIcon k={k} />{label}
    </button>
  );

  const cacheMinutesLeft = fromCache
    ? Math.max(1, Math.ceil((SEARCH_CACHE_TTL_MS - (Date.now() - (getCachedEntry(apiKey, target)?.fetchedAt ?? 0))) / 60_000))
    : null;

  const requiresDesc = isImageTarget
    ? "structured output + vision + speed/uptime"
    : "structured output + response_format";

  return (
    <Card className="overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
        <div className="min-w-0">
          <p className="text-sm font-semibold flex items-center gap-2">
            Model Search
            {target !== "generation" && (
              <span className="text-xs font-normal text-muted-foreground">
                for {isImageTarget ? "image marking" : "marking"}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {loading
              ? `Scanning for models with ${requiresDesc}…`
              : fromCache
                ? `${results.length} models · cached (~${cacheMinutesLeft}m left)`
                : `${displayed.length} of ${results.length} shown`}
          </p>
        </div>
        <button
          onClick={onClose}
          className="ml-4 shrink-0 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress bar — indeterminate pulse while loading */}
      <div className="h-0.5 bg-border overflow-hidden">
        {loading
          ? <div className="h-full w-1/3 bg-primary animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full" style={{ animation: "pulse 1.5s ease-in-out infinite" }} />
          : <div className="h-full bg-emerald-500 w-full transition-all" />}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-background flex-wrap gap-y-2">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name or ID…" className="pl-8 h-8 text-sm"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 ml-auto">
          {SORT_OPTIONS.map(({ key, label }) => <SortBtn key={key} k={key} label={label} />)}
        </div>
      </div>

      {/* Error */}
      {error && !loading && <div className="px-4 py-3"><ErrorBanner message={error} /></div>}

      {/* Empty states */}
      {!loading && !error && results.length === 0 && (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          No models found with {requiresDesc}.
        </div>
      )}
      {!loading && !error && results.length > 0 && displayed.length === 0 && (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          No models match your filter.{" "}
          <button className="underline text-primary" onClick={() => setQuery("")}>Clear</button>
        </div>
      )}

      {/* Initial skeleton */}
      {loading && results.length === 0 && (
        <div className="px-4 py-3 space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-9 rounded-md bg-muted animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      )}

      {/* Results table */}
      {displayed.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur border-b border-border">
              <tr className="text-xs text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">Model</th>
                {([
                  { k: "speed" as SortKey, label: "TPS" },
                  { k: "latency" as SortKey, label: "Latency" },
                  { k: "price" as SortKey, label: "$/M in" },
                  { k: "price" as SortKey, label: "$/M out" },
                  { k: "context" as SortKey, label: "Context" },
                ] as { k: SortKey; label: string }[]).map(({ k, label }, i) => (
                  <th
                    key={`${k}-${i}`}
                    className={cn("text-right px-3 py-2 font-medium cursor-pointer hover:text-foreground transition-colors whitespace-nowrap select-none", sortKey === k && "text-foreground")}
                    onClick={() => toggleSort(k)}
                  >
                    <span className="inline-flex items-center justify-end gap-1"><SortIcon k={k} />{label}</span>
                  </th>
                ))}
                <th className="w-16 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayed.map((r) => (
                <tr key={r.id} className="hover:bg-muted/40 transition-colors group">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-sm truncate max-w-[180px]" title={r.name}>{r.name}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[180px]" title={r.id}>{r.id}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-sm text-muted-foreground">{fmt.tps(r.tpsP50)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-sm text-muted-foreground">{fmt.latency(r.latencyP50)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-sm text-muted-foreground">{fmt.price(r.promptPricePerToken)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-sm text-muted-foreground">{fmt.price(r.completionPricePerToken)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-sm text-muted-foreground">{fmt.context(r.contextLength)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Button
                      size="sm" variant="outline"
                      className="h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => { onSelect(r.id); onClose(); }}
                    >
                      Use
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Load more / end of results footer */}
          <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {exhausted ? `All ${results.length} qualifying models shown` : `${results.length} models loaded`}
            </p>
            {!exhausted && (
              <Button
                variant="outline" size="sm" className="gap-1.5 h-7 text-xs"
                disabled={loadingMore} onClick={handleLoadMore}
              >
                {loadingMore
                  ? <><RefreshCw className="h-3 w-3 animate-spin" />Loading…</>
                  : <>Load {SEARCH_LOAD_MORE} more</>}
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SettingsView() {
  const {
    apiKey, setApiKey,
    model, setModel,
    markingModel, setMarkingModel,
    useSeparateMarkingModel, setUseSeparateMarkingModel,
    imageMarkingModel, setImageMarkingModel,
    useSeparateImageMarkingModel, setUseSeparateImageMarkingModel,
    clearApiKey, showApiKey, setShowApiKey,
    debugMode, setDebugMode,
  } = useAppSettings();

  const [activeSection, setActiveSection] = useState<Section>("api");

  const [localKey, setLocalKey] = useState(apiKey);
  const [localModel, setLocalModel] = useState(model);
  const [localMarkingModel, setLocalMarkingModel] = useState(markingModel);
  const [localImageMarkingModel, setLocalImageMarkingModel] = useState(imageMarkingModel);
  const [localUseSeparateMarkingModel, setLocalUseSeparateMarkingModel] = useState(useSeparateMarkingModel);
  const [localUseSeparateImageMarkingModel, setLocalUseSeparateImageMarkingModel] = useState(useSeparateImageMarkingModel);

  // Per-slot custom model inputs (isolated so they don't clobber each other)
  const [showCustom, setShowCustom] = useState(false);
  const [customId, setCustomId] = useState("");
  const [showCustomMarking, setShowCustomMarking] = useState(false);
  const [customMarkingId, setCustomMarkingId] = useState("");
  const [showCustomImage, setShowCustomImage] = useState(false);
  const [customImageId, setCustomImageId] = useState("");

  const [keySaved, setKeySaved] = useState(false);

  // Model search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTarget, setSearchTarget] = useState<"generation" | "marking" | "imageMarking">("generation");

  // Live stats
  const [modelStats, setModelStats] = useState<ModelStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsUpdatedAt, setStatsUpdatedAt] = useState<Date | null>(null);

  const [markingModelStats, setMarkingModelStats] = useState<ModelStats | null>(null);
  const [markingStatsLoading, setMarkingStatsLoading] = useState(false);
  const [markingStatsError, setMarkingStatsError] = useState<string | null>(null);
  const [markingStatsUpdatedAt, setMarkingStatsUpdatedAt] = useState<Date | null>(null);

  const [imageMarkingModelStats, setImageMarkingModelStats] = useState<ModelStats | null>(null);
  const [imageMarkingStatsLoading, setImageMarkingStatsLoading] = useState(false);
  const [imageMarkingStatsError, setImageMarkingStatsError] = useState<string | null>(null);
  const [imageMarkingStatsUpdatedAt, setImageMarkingStatsUpdatedAt] = useState<Date | null>(null);

  const [credits, setCredits] = useState<CreditsInfo | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [creditsUpdatedAt, setCreditsUpdatedAt] = useState<Date | null>(null);

  // ── Sync from context on mount ──────────────────────────────────────────────
  useEffect(() => { setLocalKey(apiKey); }, [apiKey]);
  useEffect(() => { setLocalModel(model); }, [model]);
  useEffect(() => { setLocalMarkingModel(markingModel); }, [markingModel]);
  useEffect(() => { setLocalUseSeparateMarkingModel(useSeparateMarkingModel); }, [useSeparateMarkingModel]);
  useEffect(() => { setLocalImageMarkingModel(imageMarkingModel); }, [imageMarkingModel]);
  useEffect(() => { setLocalUseSeparateImageMarkingModel(useSeparateImageMarkingModel); }, [useSeparateImageMarkingModel]);

  // ── Auto-persist model selections ──────────────────────────────────────────
  useEffect(() => { if (localModel && localModel !== model) setModel(localModel); }, [localModel, model, setModel]);
  useEffect(() => { if (localMarkingModel && localMarkingModel !== markingModel) setMarkingModel(localMarkingModel); }, [localMarkingModel, markingModel, setMarkingModel]);
  useEffect(() => { if (localUseSeparateMarkingModel !== useSeparateMarkingModel) setUseSeparateMarkingModel(localUseSeparateMarkingModel); }, [localUseSeparateMarkingModel, useSeparateMarkingModel, setUseSeparateMarkingModel]);
  useEffect(() => { if (localImageMarkingModel && localImageMarkingModel !== imageMarkingModel) setImageMarkingModel(localImageMarkingModel); }, [localImageMarkingModel, imageMarkingModel, setImageMarkingModel]);
  useEffect(() => { if (localUseSeparateImageMarkingModel !== useSeparateImageMarkingModel) setUseSeparateImageMarkingModel(localUseSeparateImageMarkingModel); }, [localUseSeparateImageMarkingModel, useSeparateImageMarkingModel, setUseSeparateImageMarkingModel]);

  // ── Fetch helpers ───────────────────────────────────────────────────────────

  const fetchModelStats = useCallback(async (key: string, modelId: string) => {
    if (!key.trim() || !modelId.trim() || modelId === "custom") return;
    setStatsLoading(true); setStatsError(null); setModelStats(null);
    try { const s = await invoke<ModelStats>("get_model_stats", { apiKey: key, modelId }); setModelStats(s); setStatsUpdatedAt(new Date()); }
    catch (e) { setStatsError(readBackendError(e)); } finally { setStatsLoading(false); }
  }, []);

  const fetchMarkingModelStats = useCallback(async (key: string, modelId: string) => {
    if (!key.trim() || !modelId.trim() || modelId === "custom") return;
    setMarkingStatsLoading(true); setMarkingStatsError(null); setMarkingModelStats(null);
    try { const s = await invoke<ModelStats>("get_model_stats", { apiKey: key, modelId }); setMarkingModelStats(s); setMarkingStatsUpdatedAt(new Date()); }
    catch (e) { setMarkingStatsError(readBackendError(e)); } finally { setMarkingStatsLoading(false); }
  }, []);

  const fetchImageMarkingModelStats = useCallback(async (key: string, modelId: string) => {
    if (!key.trim() || !modelId.trim() || modelId === "custom") return;
    setImageMarkingStatsLoading(true); setImageMarkingStatsError(null); setImageMarkingModelStats(null);
    try { const s = await invoke<ModelStats>("get_model_stats", { apiKey: key, modelId }); setImageMarkingModelStats(s); setImageMarkingStatsUpdatedAt(new Date()); }
    catch (e) { setImageMarkingStatsError(readBackendError(e)); } finally { setImageMarkingStatsLoading(false); }
  }, []);

  const fetchCredits = useCallback(async (key: string) => {
    if (!key.trim()) return;
    setCreditsLoading(true); setCreditsError(null);
    try { const info = await invoke<CreditsInfo>("get_credits", { apiKey: key }); setCredits(info); setCreditsUpdatedAt(new Date()); }
    catch (e) { setCreditsError(readBackendError(e)); setCredits(null); } finally { setCreditsLoading(false); }
  }, []);

  // Auto-fetch stats when relevant state changes
  useEffect(() => { if (apiKey && model) fetchModelStats(apiKey, model); }, [apiKey, model, fetchModelStats]);
  useEffect(() => { if (apiKey && useSeparateMarkingModel && markingModel) fetchMarkingModelStats(apiKey, markingModel); }, [apiKey, useSeparateMarkingModel, markingModel, fetchMarkingModelStats]);
  useEffect(() => { if (apiKey && useSeparateImageMarkingModel && imageMarkingModel) fetchImageMarkingModelStats(apiKey, imageMarkingModel); }, [apiKey, useSeparateImageMarkingModel, imageMarkingModel, fetchImageMarkingModelStats]);
  useEffect(() => { if (apiKey) fetchCredits(apiKey); }, [apiKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (apiKey && localModel && localModel !== "custom") fetchModelStats(apiKey, localModel); }, [localModel, apiKey, fetchModelStats]);
  useEffect(() => { if (apiKey && localUseSeparateMarkingModel && localMarkingModel && localMarkingModel !== "custom") fetchMarkingModelStats(apiKey, localMarkingModel); }, [localMarkingModel, apiKey, localUseSeparateMarkingModel, fetchMarkingModelStats]);
  useEffect(() => { if (apiKey && localUseSeparateImageMarkingModel && localImageMarkingModel && localImageMarkingModel !== "custom") fetchImageMarkingModelStats(apiKey, localImageMarkingModel); }, [localImageMarkingModel, apiKey, localUseSeparateImageMarkingModel, fetchImageMarkingModelStats]);

  // These are passed directly to ModelSelectRow — it handles injecting out-of-list values.
  // The showCustom* flags only control whether the CustomModelInput panel is visible.
  const selectValue = localModel;
  const markingValue = localMarkingModel;
  const imageValue = localImageMarkingModel;

  function handleSaveKey() { setApiKey(localKey); setKeySaved(true); setTimeout(() => setKeySaved(false), 2000); }
  function openSearch(t: typeof searchTarget) { setSearchTarget(t); setSearchOpen(true); }
  function applySearchResult(id: string) {
    if (searchTarget === "generation") { setLocalModel(id); setShowCustom(false); }
    else if (searchTarget === "marking") { setLocalMarkingModel(id); setShowCustomMarking(false); }
    else { setLocalImageMarkingModel(id); setShowCustomImage(false); }
  }

  const latestUpdate = statsUpdatedAt ?? markingStatsUpdatedAt ?? imageMarkingStatsUpdatedAt;

  // ── Section renderer ────────────────────────────────────────────────────────

  function renderSection() {
    switch (activeSection) {

      case "api":
        return (
          <div className="space-y-6">
            <SectionHeader title="OpenRouter API Key" description="Required for question generation, marking, and account info." />
            <FieldGroup label="API Key" htmlFor="api-key" hint="Stored locally — never leaves your device except to OpenRouter.">
              <div className="relative">
                <Input
                  id="api-key" type={showApiKey ? "text" : "password"} value={localKey}
                  onChange={(e) => setLocalKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSaveKey()}
                  placeholder="sk-or-v1-…" className="pr-10 font-mono text-sm"
                />
                <button
                  type="button" aria-label={showApiKey ? "Hide API key" : "Show API key"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </FieldGroup>
            <div className="flex items-center gap-3">
              <Button onClick={handleSaveKey} className="gap-2">
                {keySaved ? <CheckCircle2 className="h-4 w-4" /> : <Key className="h-4 w-4" />}
                {keySaved ? "Saved!" : "Save Key"}
              </Button>
              <Button variant="ghost" onClick={clearApiKey} className="text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                Clear
              </Button>
            </div>
          </div>
        );

      case "models":
        return (
          <div className="space-y-6">

            {/* Search panel — shared across all three model slots */}
            {searchOpen && (
              <ModelSearchPanel
                target={searchTarget} apiKey={apiKey}
                onClose={() => setSearchOpen(false)} onSelect={applySearchResult}
              />
            )}

            {/* Generation model */}
            <section className="space-y-3">
              <SectionHeader title="Generation Model" description="Used to generate questions and content." />
              <FieldGroup label="Model" htmlFor="model-select">
                <ModelSelectRow
                  id="model-select" value={selectValue} models={PRESET_MODELS} disabled={!apiKey}
                  onSelect={(v) => v === "custom" ? setShowCustom(true) : (setShowCustom(false), setLocalModel(v))}
                  onSearch={() => openSearch("generation")}
                />
              </FieldGroup>
              {showCustom && (
                <CustomModelInput
                  id="custom-model-id" label="Custom Model ID" value={customId} onChange={setCustomId}
                  onApply={() => { setLocalModel(customId.trim()); setShowCustom(false); }}
                />
              )}
            </section>

            <Divider />

            {/* Marking model */}
            <section className="space-y-3">
              <SectionHeader title="Marking Model" description="Optionally use a separate model for grading student answers." />
              <ToggleRow
                id="use-separate-marking-model" checked={localUseSeparateMarkingModel}
                onChange={setLocalUseSeparateMarkingModel} label="Use a separate marking model"
                description="When disabled, the generation model is used for marking too."
              />
              {localUseSeparateMarkingModel && (
                <>
                  <FieldGroup label="Marking model" htmlFor="marking-model-select">
                    <ModelSelectRow
                      id="marking-model-select" value={markingValue} models={PRESET_MODELS} disabled={!apiKey}
                      onSelect={(v) => v === "custom" ? setShowCustomMarking(true) : (setShowCustomMarking(false), setLocalMarkingModel(v))}
                      onSearch={() => openSearch("marking")}
                    />
                  </FieldGroup>
                  {showCustomMarking && (
                    <CustomModelInput
                      id="custom-marking-id" label="Custom Marking Model ID" value={customMarkingId} onChange={setCustomMarkingId}
                      onApply={() => { setLocalMarkingModel(customMarkingId.trim()); setShowCustomMarking(false); }}
                    />
                  )}
                </>
              )}
            </section>

            <Divider />

            {/* Image marking model */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-semibold tracking-tight">Image Marking Model</h2>
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                  <Image className="h-3 w-3" />Vision
                </span>
              </div>
              <p className="text-sm text-muted-foreground">Choose any model — ensure it supports image inputs. Use search to find vision-capable options.</p>
              <ToggleRow
                id="use-separate-image-marking-model" checked={localUseSeparateImageMarkingModel}
                onChange={setLocalUseSeparateImageMarkingModel} label="Use a separate image marking model"
                description="When disabled, the marking model handles image answers too."
              />
              {localUseSeparateImageMarkingModel && (
                <>
                  <FieldGroup label="Image marking model" htmlFor="image-marking-model-select">
                    <ModelSelectRow
                      id="image-marking-model-select" value={imageValue} models={PRESET_MODELS} disabled={!apiKey}
                      placeholder="Select a model"
                      onSelect={(v) => v === "custom" ? setShowCustomImage(true) : (setShowCustomImage(false), setLocalImageMarkingModel(v))}
                      onSearch={() => openSearch("imageMarking")}
                    />
                  </FieldGroup>
                  {showCustomImage && (
                    <CustomModelInput
                      id="custom-image-id" label="Custom Image Marking Model ID" value={customImageId} onChange={setCustomImageId}
                      hint="Format: provider/model-name — must support vision inputs"
                      onApply={() => { setLocalImageMarkingModel(customImageId.trim()); setShowCustomImage(false); }}
                    />
                  )}
                </>
              )}
            </section>

            <Divider />

            {/* Live Stats */}
            <section>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold tracking-tight">Live Stats</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">Performance and pricing for the selected models.</p>
                  {latestUpdate && <p className="mt-0.5 text-xs text-muted-foreground/60">Updated {fmt.time(latestUpdate)}</p>}
                </div>
                <div className="flex gap-1.5 shrink-0 ml-4 flex-wrap justify-end">
                  {(
                    [
                      { label: "Generation", loading: statsLoading, m: localModel, fn: () => fetchModelStats(apiKey, localModel) },
                      ...(localUseSeparateMarkingModel ? [{ label: "Marking", loading: markingStatsLoading, m: localMarkingModel, fn: () => fetchMarkingModelStats(apiKey, localMarkingModel) }] : []),
                      ...(localUseSeparateImageMarkingModel ? [{ label: "Image", loading: imageMarkingStatsLoading, m: localImageMarkingModel, fn: () => fetchImageMarkingModelStats(apiKey, localImageMarkingModel) }] : []),
                    ] as { label: string; loading: boolean; m: string; fn: () => void }[]
                  ).map(({ label, loading, m, fn }) => (
                    <Button key={label} variant="outline" size="sm" className="gap-1.5"
                      disabled={loading || !apiKey || !m || m === "custom"} onClick={fn}>
                      <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
              {(statsError || markingStatsError || imageMarkingStatsError) && (
                <div className="mb-4 space-y-1.5">
                  {statsError && <ErrorBanner message={statsError} />}
                  {markingStatsError && <ErrorBanner message={markingStatsError} />}
                  {imageMarkingStatsError && <ErrorBanner message={imageMarkingStatsError} />}
                </div>
              )}
              {!apiKey ? (
                <EmptyState message="Save your API key to load model stats." />
              ) : (
                <StatsTable columns={[
                  { stats: modelStats, label: localModel || "Generation", loading: statsLoading },
                  ...(localUseSeparateMarkingModel ? [{ stats: markingModelStats, label: localMarkingModel || "Marking", loading: markingStatsLoading }] : []),
                  ...(localUseSeparateImageMarkingModel ? [{ stats: imageMarkingModelStats, label: localImageMarkingModel || "Image marking", loading: imageMarkingStatsLoading }] : []),
                ]} />
              )}
            </section>
          </div>
        );

      case "credits":
        return (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Account Credits</h2>
                <p className="mt-1 text-sm text-muted-foreground">OpenRouter credit balance for the current API key.</p>
                {creditsUpdatedAt && !creditsLoading && <p className="mt-1 text-xs text-muted-foreground/60">Updated {fmt.time(creditsUpdatedAt)}</p>}
              </div>
              <Button variant="outline" size="sm" className="gap-2 shrink-0" disabled={creditsLoading || !apiKey} onClick={() => fetchCredits(apiKey)}>
                <RefreshCw className={cn("h-3.5 w-3.5", creditsLoading && "animate-spin")} />Refresh
              </Button>
            </div>
            {creditsError && <ErrorBanner message={creditsError} />}
            {!credits && !creditsLoading && !creditsError && (
              <EmptyState message={apiKey ? "Click refresh to load credit info." : "Save your API key to load credit info."} />
            )}
            {creditsLoading && (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}
              </div>
            )}
            {credits && !creditsLoading && (
              <div className="space-y-4">
                <Card className="p-5 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Credit usage</span>
                    <span className="text-muted-foreground tabular-nums">${credits.totalUsage.toFixed(4)} / ${credits.totalCredits.toFixed(4)}</span>
                  </div>
                  <CreditBar used={credits.totalUsage} total={credits.totalCredits} />
                </Card>
                <Card className="overflow-hidden divide-y divide-border">
                  {[
                    { label: "Remaining", value: `$${credits.remaining.toFixed(4)}`, highlight: true },
                    { label: "Used", value: `$${credits.totalUsage.toFixed(4)}` },
                    { label: "Purchased", value: `$${credits.totalCredits.toFixed(4)}` },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/30 transition-colors">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className={cn("tabular-nums font-medium", row.highlight && "text-emerald-600 dark:text-emerald-400")}>{row.value}</span>
                    </div>
                  ))}
                </Card>
              </div>
            )}
          </div>
        );

      case "appearance":
        return (
          <div className="space-y-6">
            <SectionHeader title="Appearance" description="Customize the look and feel of the application." />
            <Card className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium">Color theme</p>
                <p className="text-xs text-muted-foreground mt-0.5">Light, dark, or follow system.</p>
              </div>
              <ModeToggle />
            </Card>
          </div>
        );

      case "debug":
        return (
          <div className="space-y-6">
            <SectionHeader title="Debug Mode" description="Developer tools for inspecting LLM payloads." />
            <Card className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium">Raw generation payload</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {debugMode ? "Enabled — raw LLM output shown on problem cards." : "Reveal the raw LLM generation payload for prompt inspection."}
                </p>
              </div>
              <Button type="button" variant={debugMode ? "default" : "outline"} size="sm" className="gap-2 shrink-0 ml-4" onClick={() => setDebugMode(!debugMode)}>
                <Bug className="h-4 w-4" />{debugMode ? "Disable" : "Enable"}
              </Button>
            </Card>
          </div>
        );
    }
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0">
      <nav className="w-52 shrink-0 border-r border-border flex flex-col py-4 px-2 gap-0.5">
        <p className="px-3 mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">Settings</p>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id} onClick={() => setActiveSection(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left group",
              activeSection === item.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <span className={cn("shrink-0 transition-colors", activeSection === item.id ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}>
              {item.icon}
            </span>
            <span className="flex-1 truncate">{item.label}</span>
            {activeSection === item.id && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary/60" />}
          </button>
        ))}
      </nav>
      <main className="flex-1 min-w-0 overflow-y-auto p-8">
        <div className="max-w-screen">{renderSection()}</div>
      </main>
    </div>
  );
}