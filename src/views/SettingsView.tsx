import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppSettings } from "../AppContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Eye, EyeOff, Bug, RefreshCw, Zap, DollarSign, Clock, Database, Settings, Key, Cpu, CreditCard, Palette, ChevronRight, CheckCircle2, AlertCircle } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { readBackendError } from "../lib/app-utils";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

// ─── Types matching Rust structs ──────────────────────────────────────────────

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

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatPrice(pricePerToken: number | null): string {
  if (pricePerToken === null) return "—";
  const perMillion = pricePerToken * 1_000_000;
  return `$${perMillion.toFixed(2)}/M`;
}

function formatTps(tps: number | null): string {
  if (tps === null) return "—";
  return `${tps.toFixed(0)} tok/s`;
}

function formatLatency(latencyMs: number | null): string {
  if (latencyMs === null) return "—";
  if (latencyMs >= 1000) return `${(latencyMs / 1000).toFixed(2)} s`;
  return `${latencyMs.toFixed(0)} ms`;
}

function formatContext(tokens: number | null): string {
  if (tokens === null) return "—";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
  return String(tokens);
}

function formatUptime(pct: number | null): string {
  if (pct === null) return "—";
  return `${pct.toFixed(1)}%`;
}

function formatLastUpdated(date: Date | null): string {
  if (!date) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_MODELS = [
  { id: "google/gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite" },
  { id: "nvidia/nemotron-3-super-120b-a12b:nitro", name: "Nemotron 3 Super 120B (Nitro)" },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron 3 Super 120B (Free)" },
  { id: "mistralai/mistral-small-2603", name: "Mistral Small 4" },
  { id: "mistralai/ministral-3b-2512", name: "Mistral Ministral 3B" },
  { id: "qwen/qwen3.5-9b", name: "Qwen 3.5 9B" },
  { id: "qwen/qwen3.5-35b-a3b", name: "Qwen 3.5 35B" },
  { id: "openai/gpt-5.4-nano", name: "GPT-5.4 Nano" },
  { id: "custom", name: "Custom…" },
];

type Section = "api" | "models" | "credits" | "appearance" | "debug";

const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode; description: string }[] = [
  { id: "api", label: "API Key", icon: <Key className="h-4 w-4" />, description: "OpenRouter credentials" },
  { id: "models", label: "Models", icon: <Cpu className="h-4 w-4" />, description: "Generation & marking models" },
  { id: "credits", label: "Credits", icon: <CreditCard className="h-4 w-4" />, description: "Account balance" },
  { id: "appearance", label: "Appearance", icon: <Palette className="h-4 w-4" />, description: "Theme preferences" },
  { id: "debug", label: "Debug", icon: <Bug className="h-4 w-4" />, description: "Developer tools" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

function FieldGroup({ label, htmlFor, hint, children }: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-border my-6" />;
}

function StatusBadge({ value }: { value: string | boolean | null; loading?: boolean }) {
  if (value === null) return <span className="text-muted-foreground tabular-nums text-sm">—</span>;
  if (typeof value === "boolean") {
    return value
      ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-sm"><CheckCircle2 className="h-3.5 w-3.5" />Yes</span>
      : <span className="inline-flex items-center gap-1 text-muted-foreground text-sm"><AlertCircle className="h-3.5 w-3.5" />No</span>;
  }
  return <span className="tabular-nums text-sm font-medium">{value}</span>;
}

function StatsTable({
  primary,
  secondary,
  primaryLabel,
  secondaryLabel,
  loading,
  secondaryLoading,
}: {
  primary: ModelStats | null;
  secondary: ModelStats | null;
  primaryLabel: string;
  secondaryLabel?: string;
  loading: boolean;
  secondaryLoading?: boolean;
}) {
  const showSecondary = !!secondaryLabel;
  const rows: { icon: React.ReactNode; label: string; pVal: (s: ModelStats) => string | boolean | null }[] = [
    { icon: <Zap className="h-3.5 w-3.5" />, label: "Throughput (p50)", pVal: s => formatTps(s.tpsP50) },
    { icon: <Clock className="h-3.5 w-3.5" />, label: "Latency TTFT (p50)", pVal: s => formatLatency(s.latencyP50) },
    { icon: <DollarSign className="h-3.5 w-3.5" />, label: "Input price", pVal: s => formatPrice(s.promptPricePerToken) },
    { icon: <DollarSign className="h-3.5 w-3.5" />, label: "Output price", pVal: s => formatPrice(s.completionPricePerToken) },
    { icon: <Database className="h-3.5 w-3.5" />, label: "Context window", pVal: s => formatContext(s.contextLength) },
    { icon: <Clock className="h-3.5 w-3.5" />, label: "Uptime (30m)", pVal: s => formatUptime(s.uptimeLast30m) },
    { icon: <Settings className="h-3.5 w-3.5" />, label: "Structured output", pVal: s => s.supportsStructuredOutput },
  ];

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className={cn("grid text-xs font-medium text-muted-foreground bg-muted/50 px-4 py-2.5 border-b border-border", showSecondary ? "grid-cols-3" : "grid-cols-2")}>
        <span>Metric</span>
        <span className="truncate">{primaryLabel || "Generation"}</span>
        {showSecondary && <span className="truncate">{secondaryLabel}</span>}
      </div>
      {/* Rows */}
      {rows.map((row, i) => (
        <div
          key={i}
          className={cn(
            "grid items-center px-4 py-3 text-sm border-b border-border last:border-0",
            showSecondary ? "grid-cols-3" : "grid-cols-2",
            i % 2 === 0 ? "bg-background" : "bg-muted/20"
          )}
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            {row.icon}
            {row.label}
          </span>
          <span>
            {loading ? (
              <span className="text-muted-foreground animate-pulse">Loading…</span>
            ) : primary ? (
              <StatusBadge value={row.pVal(primary)} />
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </span>
          {showSecondary && (
            <span>
              {secondaryLoading ? (
                <span className="text-muted-foreground animate-pulse">Loading…</span>
              ) : secondary ? (
                <StatusBadge value={row.pVal(secondary)} />
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function CreditBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  return (
    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-primary transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SettingsView() {
  const {
    apiKey, setApiKey,
    model, setModel,
    markingModel, setMarkingModel,
    useSeparateMarkingModel, setUseSeparateMarkingModel,
    clearApiKey,
    showApiKey, setShowApiKey,
    debugMode, setDebugMode,
  } = useAppSettings();

  const [activeSection, setActiveSection] = useState<Section>("api");

  const [localKey, setLocalKey] = useState(apiKey);
  const [localModel, setLocalModel] = useState(model);
  const [localMarkingModel, setLocalMarkingModel] = useState(markingModel);
  const [localUseSeparateMarkingModel, setLocalUseSeparateMarkingModel] = useState(useSeparateMarkingModel);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customModelId, setCustomModelId] = useState("");
  const [keySaved, setKeySaved] = useState(false);

  const [modelStats, setModelStats] = useState<ModelStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsUpdatedAt, setStatsUpdatedAt] = useState<Date | null>(null);
  const [markingModelStats, setMarkingModelStats] = useState<ModelStats | null>(null);
  const [markingStatsLoading, setMarkingStatsLoading] = useState(false);
  const [markingStatsError, setMarkingStatsError] = useState<string | null>(null);
  const [markingStatsUpdatedAt, setMarkingStatsUpdatedAt] = useState<Date | null>(null);

  const [credits, setCredits] = useState<CreditsInfo | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [creditsUpdatedAt, setCreditsUpdatedAt] = useState<Date | null>(null);

  // Sync local state on first hydration
  useEffect(() => { setLocalKey(apiKey); }, [apiKey]);
  useEffect(() => { setLocalModel(model); }, [model]);
  useEffect(() => { setLocalMarkingModel(markingModel); }, [markingModel]);
  useEffect(() => { setLocalUseSeparateMarkingModel(useSeparateMarkingModel); }, [useSeparateMarkingModel]);

  // Auto-save models
  useEffect(() => { if (localModel && localModel !== model) setModel(localModel); }, [localModel, model, setModel]);
  useEffect(() => { if (localMarkingModel && localMarkingModel !== markingModel) setMarkingModel(localMarkingModel); }, [localMarkingModel, markingModel, setMarkingModel]);
  useEffect(() => { if (localUseSeparateMarkingModel !== useSeparateMarkingModel) setUseSeparateMarkingModel(localUseSeparateMarkingModel); }, [localUseSeparateMarkingModel, useSeparateMarkingModel, setUseSeparateMarkingModel]);

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  const fetchModelStats = useCallback(async (key: string, modelId: string) => {
    if (!key.trim() || !modelId.trim() || modelId === "custom") return;
    setStatsLoading(true);
    setStatsError(null);
    setModelStats(null);
    try {
      const stats = await invoke<ModelStats>("get_model_stats", { apiKey: key, modelId });
      setModelStats(stats);
      setStatsUpdatedAt(new Date());
    } catch (err) {
      setStatsError(readBackendError(err));
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchMarkingModelStats = useCallback(async (key: string, modelId: string) => {
    if (!key.trim() || !modelId.trim() || modelId === "custom") return;
    setMarkingStatsLoading(true);
    setMarkingStatsError(null);
    setMarkingModelStats(null);
    try {
      const stats = await invoke<ModelStats>("get_model_stats", { apiKey: key, modelId });
      setMarkingModelStats(stats);
      setMarkingStatsUpdatedAt(new Date());
    } catch (err) {
      setMarkingStatsError(readBackendError(err));
    } finally {
      setMarkingStatsLoading(false);
    }
  }, []);

  const fetchCredits = useCallback(async (key: string) => {
    if (!key.trim()) return;
    setCreditsLoading(true);
    setCreditsError(null);
    try {
      const info = await invoke<CreditsInfo>("get_credits", { apiKey: key });
      setCredits(info);
      setCreditsUpdatedAt(new Date());
    } catch (err) {
      setCreditsError(readBackendError(err));
      setCredits(null);
    } finally {
      setCreditsLoading(false);
    }
  }, []);

  useEffect(() => { if (apiKey && model) fetchModelStats(apiKey, model); }, [apiKey, model, fetchModelStats]);
  useEffect(() => { if (apiKey && useSeparateMarkingModel && markingModel) fetchMarkingModelStats(apiKey, markingModel); }, [apiKey, useSeparateMarkingModel, markingModel, fetchMarkingModelStats]);
  useEffect(() => { if (apiKey) fetchCredits(apiKey); }, [apiKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (apiKey && localModel && localModel !== "custom") fetchModelStats(apiKey, localModel); }, [localModel, apiKey, fetchModelStats]);
  useEffect(() => { if (apiKey && localUseSeparateMarkingModel && localMarkingModel && localMarkingModel !== "custom") fetchMarkingModelStats(apiKey, localMarkingModel); }, [localMarkingModel, apiKey, localUseSeparateMarkingModel, fetchMarkingModelStats]);

  // ── Actions ────────────────────────────────────────────────────────────────

  function handleSaveKey() {
    setApiKey(localKey);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  }

  const isPreset = PRESET_MODELS.some((m) => m.id === localModel && m.id !== "custom");
  const selectValue = isPreset ? localModel : (showCustomInput ? "custom" : localModel);

  // ── Render sections ────────────────────────────────────────────────────────

  function renderSection() {
    switch (activeSection) {

      case "api":
        return (
          <div>
            <SectionHeader title="OpenRouter API Key" description="Required for question generation, marking, and account info." />
            <FieldGroup label="API Key" htmlFor="api-key" hint="Your key is stored locally and never sent anywhere except OpenRouter.">
              <div className="relative">
                <Input
                  id="api-key"
                  type={showApiKey ? "text" : "password"}
                  value={localKey}
                  onChange={(e) => setLocalKey(e.target.value)}
                  placeholder="sk-or-v1-…"
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowApiKey(!showApiKey)}
                  aria-label={showApiKey ? "Hide API key" : "Show API key"}
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </FieldGroup>

            <div className="mt-5 flex items-center gap-3">
              <Button onClick={handleSaveKey} className="gap-2">
                {keySaved ? <CheckCircle2 className="h-4 w-4" /> : <Key className="h-4 w-4" />}
                {keySaved ? "Saved!" : "Save Key"}
              </Button>
              <Button variant="ghost" onClick={clearApiKey} className="text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                Clear Key
              </Button>
            </div>
          </div>
        );

      case "models":
        return (
          <div className="space-y-3">
            {/* Generation model */}
            <div>
              <SectionHeader title="Generation Model" description="Used to generate questions and content." />
              <FieldGroup label="Model" htmlFor="model-select">
                <Select
                  value={selectValue}
                  onValueChange={(value) => {
                    if (value === "custom") {
                      setShowCustomInput(true);
                    } else {
                      setShowCustomInput(false);
                      setLocalModel(value);
                    }
                  }}
                >
                  <SelectTrigger id="model-select" className="w-full">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESET_MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldGroup>

              {showCustomInput && (
                <div className="mt-3 p-4 rounded-lg border border-dashed border-border space-y-3">
                  <FieldGroup label="Custom Model ID" htmlFor="custom-model-id" hint="Format: provider/model-name (e.g. openai/gpt-4o)">
                    <Input
                      id="custom-model-id"
                      value={customModelId}
                      onChange={(e) => setCustomModelId(e.target.value)}
                      placeholder="e.g. openai/gpt-4o"
                      className="font-mono text-sm"
                    />
                  </FieldGroup>
                  <Button
                    size="sm"
                    disabled={!customModelId.trim()}
                    onClick={() => { setLocalModel(customModelId.trim()); setShowCustomInput(false); }}
                  >
                    Apply
                  </Button>
                </div>
              )}
            </div>

            <Divider />

            {/* Marking model */}
            <div>
              <SectionHeader title="Marking Model" description="Optionally use a separate model for grading student answers." />

              <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-muted/50">
                <Checkbox
                  id="use-separate-marking-model"
                  checked={localUseSeparateMarkingModel}
                  onCheckedChange={(checked) => setLocalUseSeparateMarkingModel(!!checked)}
                />
                <div>
                  <Label htmlFor="use-separate-marking-model" className="font-medium cursor-pointer">Use a separate marking model</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">When disabled, the generation model is used for marking too.</p>
                </div>
              </div>

              {localUseSeparateMarkingModel && (
                <div className="space-y-3 pl-0">
                  <FieldGroup label="Marking model" htmlFor="marking-model-select">
                    <Select
                      value={PRESET_MODELS.some((m) => m.id === localMarkingModel && m.id !== "custom") ? localMarkingModel : localMarkingModel}
                      onValueChange={(value) => {
                        setLocalMarkingModel(value === "custom" ? "custom" : value);
                      }}
                    >
                      <SelectTrigger id="marking-model-select" className="w-full">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {PRESET_MODELS.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldGroup>

                  {localMarkingModel === "custom" && (
                    <div className="p-4 rounded-lg border border-dashed border-border space-y-3">
                      <FieldGroup label="Custom Marking Model ID" htmlFor="custom-marking-model-id" hint="Format: provider/model-name">
                        <Input
                          id="custom-marking-model-id"
                          value={customModelId}
                          onChange={(e) => setCustomModelId(e.target.value)}
                          placeholder="e.g. openai/gpt-4o"
                          className="font-mono text-sm"
                        />
                      </FieldGroup>
                      <Button
                        size="sm"
                        disabled={!customModelId.trim()}
                        onClick={() => setLocalMarkingModel(customModelId.trim())}
                      >
                        Apply
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Divider />

            {/* Stats */}
            <div>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold tracking-tight">Live Stats</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">Performance and pricing for the selected models.</p>
                  {(statsUpdatedAt || markingStatsUpdatedAt) && (
                    <p className="mt-0.5 text-xs text-muted-foreground/60">
                      Updated {formatLastUpdated(statsUpdatedAt || markingStatsUpdatedAt)}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={statsLoading || !apiKey || !localModel || localModel === "custom"}
                    onClick={() => fetchModelStats(apiKey, localModel)}
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", statsLoading && "animate-spin")} />
                    {localUseSeparateMarkingModel ? "Generation" : "Refresh"}
                  </Button>
                  {localUseSeparateMarkingModel && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={markingStatsLoading || !apiKey || !localMarkingModel || localMarkingModel === "custom"}
                      onClick={() => fetchMarkingModelStats(apiKey, localMarkingModel)}
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", markingStatsLoading && "animate-spin")} />
                      Marking
                    </Button>
                  )}
                </div>
              </div>

              {(statsError || markingStatsError) && (
                <div className="mb-3 space-y-1.5">
                  {statsError && (
                    <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />{statsError}
                    </div>
                  )}
                  {markingStatsError && (
                    <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />{markingStatsError}
                    </div>
                  )}
                </div>
              )}

              {!apiKey ? (
                <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-3">
                  Save your API key to load model stats.
                </div>
              ) : (
                <StatsTable
                  primary={modelStats}
                  secondary={localUseSeparateMarkingModel ? markingModelStats : null}
                  primaryLabel={localModel || "Generation model"}
                  secondaryLabel={localUseSeparateMarkingModel ? (localMarkingModel || "Marking model") : undefined}
                  loading={statsLoading}
                  secondaryLoading={markingStatsLoading}
                />
              )}
            </div>
          </div>
        );

      case "credits":
        return (
          <div>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Account Credits</h2>
                <p className="mt-1 text-sm text-muted-foreground">OpenRouter credit balance for the current API key.</p>
                {creditsUpdatedAt && !creditsLoading && (
                  <p className="mt-1 text-xs text-muted-foreground/60">Updated {formatLastUpdated(creditsUpdatedAt)}</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={creditsLoading || !apiKey}
                onClick={() => fetchCredits(apiKey)}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", creditsLoading && "animate-spin")} />
                Refresh
              </Button>
            </div>

            {creditsError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2 mb-4">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {creditsError}
              </div>
            )}

            {!credits && !creditsLoading && !creditsError && (
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-3">
                {apiKey ? "Click refresh to load credit info." : "Save your API key to load credit info."}
              </div>
            )}

            {creditsLoading && (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            )}

            {credits && !creditsLoading && (
              <div className="space-y-6">
                {/* Usage bar */}
                <div className="p-5 rounded-xl border border-border bg-card space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Credit usage</span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      ${credits.totalUsage.toFixed(4)} / ${credits.totalCredits.toFixed(4)}
                    </span>
                  </div>
                  <CreditBar used={credits.totalUsage} total={credits.totalCredits} />
                </div>

                {/* Stat rows */}
                <div className="rounded-lg border border-border overflow-hidden">
                  {[
                    { label: "Remaining", value: `$${credits.remaining.toFixed(4)}`, highlight: true },
                    { label: "Used", value: `$${credits.totalUsage.toFixed(4)}` },
                    { label: "Purchased", value: `$${credits.totalCredits.toFixed(4)}` },
                  ].map((row, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center justify-between px-4 py-3 text-sm border-b border-border last:border-0",
                        i % 2 === 0 ? "bg-background" : "bg-muted/20"
                      )}
                    >
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className={cn("tabular-nums font-medium", row.highlight && "text-emerald-600 dark:text-emerald-400")}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case "appearance":
        return (
          <div>
            <SectionHeader title="Appearance" description="Customize the look and feel of the application." />
            <div className="flex items-center justify-between p-4 rounded-lg border border-border">
              <div>
                <p className="text-sm font-medium">Color theme</p>
                <p className="text-xs text-muted-foreground mt-0.5">Choose between light, dark, or follow system.</p>
              </div>
              <ModeToggle />
            </div>
          </div>
        );

      case "debug":
        return (
          <div>
            <SectionHeader title="Debug Mode" description="Developer tools for inspecting LLM payloads." />
            <div className="flex items-center justify-between p-4 rounded-lg border border-border">
              <div>
                <p className="text-sm font-medium">Raw generation payload</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {debugMode
                    ? "Enabled — raw LLM output is shown on problem cards."
                    : "Reveal the raw LLM generation payload from the problem card for prompt inspection."}
                </p>
              </div>
              <Button
                type="button"
                variant={debugMode ? "default" : "outline"}
                size="sm"
                className="gap-2 shrink-0 ml-4"
                onClick={() => setDebugMode(!debugMode)}
              >
                <Bug className="h-4 w-4" />
                {debugMode ? "Disable" : "Enable"}
              </Button>
            </div>
          </div>
        );
    }
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar */}
      <nav className="w-56 shrink-0 border-r border-border flex flex-col py-4 px-2 gap-0.5">
        <p className="px-3 mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">Settings</p>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveSection(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left group",
              activeSection === item.id
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <span className={cn(
              "shrink-0 transition-colors",
              activeSection === item.id ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
            )}>
              {item.icon}
            </span>
            <span className="flex-1 truncate">{item.label}</span>
            {activeSection === item.id && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary/60" />}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 min-w-0 overflow-y-auto p-8">
        <div className="max-w-2xl">
          {renderSection()}
        </div>
      </main>
    </div>
  );
}
