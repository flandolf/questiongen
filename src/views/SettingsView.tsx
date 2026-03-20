import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppSettings } from "../AppContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../components/ui/card";
import { Eye, EyeOff, Bug, RefreshCw, Zap, DollarSign, Clock, Database, Settings } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { readBackendError } from "../lib/app-utils";
import { Checkbox } from "@/components/ui/checkbox";

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
  return `$${perMillion.toFixed(2)}/M tokens`;
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
  return `Updated ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

// ─── Stat row ─────────────────────────────────────────────────────────────────

function StatRow({ icon, label, value, dimmed }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  dimmed?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <span className={`text-sm font-medium tabular-nums ${dimmed ? "text-muted-foreground" : ""}`}>
        {value}
      </span>
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_MODELS = [
  { id: "openai/gpt-5.4-nano", name: "GPT-5.4 Nano" },
  { id: "qwen/qwen3.5-9b", name: "Qwen 3.5 9B" },
  { id: "qwen/qwen3.5-35b-a3b", name: "Qwen 3.5 35B" },
  { id: "nvidia/nemotron-3-super-120b-a12b:freeze", name: "Nemotron 3 Super 120B" },
  { id: "mistralai/mistral-small-2603", name: "Mistral Small 4" },
  { id: "mistralai/ministral-3b-2512", name: "Mistral Ministral 3B" },
  { id: "google/gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite" },
  { id: "custom", name: "Custom..." },
];

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

  const [localKey, setLocalKey] = useState(apiKey);
  const [localModel, setLocalModel] = useState(model);
  const [localMarkingModel, setLocalMarkingModel] = useState(markingModel);
  const [localUseSeparateMarkingModel, setLocalUseSeparateMarkingModel] = useState(useSeparateMarkingModel);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customModelId, setCustomModelId] = useState("");

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

  // Auto-save models when the user changes them (no need to press "Save Settings")
  useEffect(() => {
    if (localModel && localModel !== model) {
      setModel(localModel);
    }
  }, [localModel, model, setModel]);

  useEffect(() => {
    if (localMarkingModel && localMarkingModel !== markingModel) {
      setMarkingModel(localMarkingModel);
    }
  }, [localMarkingModel, markingModel, setMarkingModel]);

  // Auto-save API key when it changes locally
  useEffect(() => {
    if (localKey !== apiKey) {
      setApiKey(localKey);
    }
  }, [localKey, apiKey, setApiKey]);

  // Auto-save the "use separate marking model" toggle
  useEffect(() => {
    if (localUseSeparateMarkingModel !== useSeparateMarkingModel) {
      setUseSeparateMarkingModel(localUseSeparateMarkingModel);
    }
  }, [localUseSeparateMarkingModel, useSeparateMarkingModel, setUseSeparateMarkingModel]);

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  const fetchModelStats = useCallback(async (key: string, modelId: string) => {
    if (!key.trim() || !modelId.trim() || modelId === "custom") return;
    setStatsLoading(true);
    setStatsError(null);
    setModelStats(null); // clear stale data immediately
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

  // Fetch stats whenever the committed model changes (covers initial load + saves)
  useEffect(() => {
    if (apiKey && model) {
      fetchModelStats(apiKey, model);
    }
  }, [apiKey, model, fetchModelStats]);

  // Fetch stats for committed marking model when separate-marking toggle is enabled
  useEffect(() => {
    if (apiKey && useSeparateMarkingModel && markingModel) {
      // fetch stats for committed marking model
      (async () => {
        setMarkingStatsLoading(true);
        setMarkingStatsError(null);
        setMarkingModelStats(null);
        try {
          const stats = await invoke<ModelStats>("get_model_stats", { apiKey, modelId: markingModel });
          setMarkingModelStats(stats);
          setMarkingStatsUpdatedAt(new Date());
        } catch (err) {
          setMarkingStatsError(readBackendError(err));
        } finally {
          setMarkingStatsLoading(false);
        }
      })();
    }
  }, [apiKey, useSeparateMarkingModel, markingModel]);

  // Fetch credits on initial load only (user refreshes manually after that)
  useEffect(() => {
    if (apiKey) {
      fetchCredits(apiKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]); // intentionally omit fetchCredits — only re-run when key changes

  // Fetch model stats immediately when localModel changes, using the committed key
  useEffect(() => {
    if (apiKey && localModel && localModel !== "custom") {
      fetchModelStats(apiKey, localModel);
    }
  }, [localModel, apiKey, fetchModelStats]);

  // Fetch model stats immediately when local marking model changes (if toggle enabled)
  useEffect(() => {
    if (apiKey && localUseSeparateMarkingModel && localMarkingModel && localMarkingModel !== "custom") {
      (async () => {
        setMarkingStatsLoading(true);
        setMarkingStatsError(null);
        setMarkingModelStats(null);
        try {
          const stats = await invoke<ModelStats>("get_model_stats", { apiKey, modelId: localMarkingModel });
          setMarkingModelStats(stats);
          setMarkingStatsUpdatedAt(new Date());
        } catch (err) {
          setMarkingStatsError(readBackendError(err));
        } finally {
          setMarkingStatsLoading(false);
        }
      })();
    }
  }, [localMarkingModel, apiKey, localUseSeparateMarkingModel]);

  // ── Actions ────────────────────────────────────────────────────────────────

  function handleSave() {
    setApiKey(localKey);
    setModel(localModel);
    setMarkingModel(localMarkingModel);
    setUseSeparateMarkingModel(localUseSeparateMarkingModel);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const isPreset = PRESET_MODELS.some((m) => m.id === localModel && m.id !== "custom");
  const selectValue = isPreset ? localModel : (showCustomInput ? "custom" : localModel);

  return (
    <div className="min-w-full p-4.5 mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your OpenRouter API key and model preferences.</p>
      </div>

      {/* ── API Key ── */}
      <Card>
        <CardHeader>
          <CardTitle>OpenRouter API Key</CardTitle>
          <CardDescription>
            Required for question generation, marking, and account info.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-key">API Key</Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showApiKey ? "text" : "password"}
                value={localKey}
                onChange={(e) => setLocalKey(e.target.value)}
                placeholder="sk-or-v1-..."
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={clearApiKey}>Clear Key</Button>
          <Button onClick={handleSave}>Save Settings</Button>
        </CardFooter>
      </Card>

      {/* ── Separate Marking Model ── */}
      <Card>
        <CardHeader>
          <CardTitle>Separate Marking Model</CardTitle>
          <CardDescription>Optionally use a different model for marking student answers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Checkbox
              id="use-separate-marking-model"
              checked={localUseSeparateMarkingModel}
              onCheckedChange={(checked) => setLocalUseSeparateMarkingModel(!!checked)}
            />
            <Label htmlFor="use-separate-marking-model">Use separate model for marking</Label>
          </div>

          {localUseSeparateMarkingModel && (
            <div className="space-y-2">
              <Label htmlFor="marking-model-select">Marking model</Label>
              <Select
                value={PRESET_MODELS.some((m) => m.id === localMarkingModel && m.id !== "custom") ? localMarkingModel : (localMarkingModel === "custom" ? "custom" : localMarkingModel)}
                onValueChange={(value) => {
                  if (value === "custom") {
                    // reveal custom input by setting to custom sentinel
                    setLocalMarkingModel("custom");
                  } else {
                    setLocalMarkingModel(value);
                  }
                }}
              >
                <SelectTrigger id="marking-model-select">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {PRESET_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {localMarkingModel === "custom" && (
                <div className="mt-2 space-y-2">
                  <Label htmlFor="custom-marking-model-id">Custom Marking Model ID</Label>
                  <Input
                    id="custom-marking-model-id"
                    value={customModelId}
                    onChange={(e) => setCustomModelId(e.target.value)}
                    placeholder="e.g. openai/gpt-4o"
                  />
                  <Button
                    className="mt-2"
                    disabled={!customModelId.trim()}
                    onClick={() => {
                      setLocalMarkingModel(customModelId.trim());
                    }}
                  >
                    Use Custom Marking Model
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Model Selection ── */}
      <Card>
        <CardHeader>
          <CardTitle>Model Selection</CardTitle>
          <CardDescription>
            Which OpenRouter model to use for generation and marking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="model-select">Model</Label>
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
            <SelectTrigger id="model-select">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {PRESET_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {showCustomInput && (
            <div className="mt-2 space-y-2">
              <Label htmlFor="custom-model-id">Custom Model ID</Label>
              <Input
                id="custom-model-id"
                value={customModelId}
                onChange={(e) => setCustomModelId(e.target.value)}
                placeholder="e.g. openai/gpt-4o"
              />
              <Button
                className="mt-2"
                disabled={!customModelId.trim()}
                onClick={() => {
                  setLocalModel(customModelId.trim());
                  setShowCustomInput(false);
                }}
              >
                Use Custom Model
              </Button>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave}>Save Settings</Button>
        </CardFooter>
      </Card>

      {/* ── Combined Model Stats Table ── */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Model Stats</CardTitle>
            <CardDescription>
              Live performance and pricing for selected models.
              {statsUpdatedAt && !statsLoading && (
                <span className="ml-2 text-xs text-muted-foreground/70">{formatLastUpdated(statsUpdatedAt)}</span>
              )}
              {markingStatsUpdatedAt && !markingStatsLoading && (
                <span className="ml-2 text-xs text-muted-foreground/70">{formatLastUpdated(markingStatsUpdatedAt)}</span>
              )}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              disabled={statsLoading || !apiKey || !localModel || localModel === "custom"}
              onClick={() => fetchModelStats(apiKey, localModel)}
              title="Refresh model stats"
            >
              <RefreshCw className={`h-4 w-4 ${statsLoading ? "animate-spin" : ""}`} />
            </Button>
            {localUseSeparateMarkingModel && (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                disabled={markingStatsLoading || !apiKey || !localMarkingModel || localMarkingModel === "custom"}
                onClick={() => {
                  if (apiKey && localMarkingModel) {
                    void (async () => {
                      setMarkingStatsLoading(true);
                      setMarkingStatsError(null);
                      setMarkingModelStats(null);
                      try {
                        const stats = await invoke<ModelStats>("get_model_stats", { apiKey, modelId: localMarkingModel });
                        setMarkingModelStats(stats);
                        setMarkingStatsUpdatedAt(new Date());
                      } catch (err) {
                        setMarkingStatsError(readBackendError(err));
                      } finally {
                        setMarkingStatsLoading(false);
                      }
                    })();
                  }
                }}
                title="Refresh marking model stats"
              >
                <RefreshCw className={`h-4 w-4 ${markingStatsLoading ? "animate-spin" : ""}`} />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {(statsError || markingStatsError) && (
            <div className="space-y-1">
              {statsError && <p className="text-sm text-destructive">{statsError}</p>}
              {markingStatsError && <p className="text-sm text-destructive">{markingStatsError}</p>}
            </div>
          )}

          <Table className="mt-2">
            <TableHeader>
              <tr>
                <TableHead>Metric</TableHead>
                <TableHead>{localModel || "Generation model"}</TableHead>
                {localUseSeparateMarkingModel && <TableHead>{localMarkingModel || "Marking model"}</TableHead>}
              </tr>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="flex flex-row items-center gap-2 "><Zap className="h-4 w-4"/> Throughput (p50)</TableCell>
                <TableCell>{statsLoading ? "Loading…" : modelStats ? formatTps(modelStats.tpsP50) : "—"}</TableCell>
                {localUseSeparateMarkingModel && <TableCell>{markingStatsLoading ? "Loading…" : markingModelStats ? formatTps(markingModelStats.tpsP50) : "—"}</TableCell>}
              </TableRow>

              <TableRow>
                <TableCell className="flex flex-row items-center gap-2 "><Clock className="h-4 w-4"/> Latency TTFT (p50)</TableCell>
                <TableCell>{statsLoading ? "Loading…" : modelStats ? formatLatency(modelStats.latencyP50) : "—"}</TableCell>
                {localUseSeparateMarkingModel && <TableCell>{markingStatsLoading ? "Loading…" : markingModelStats ? formatLatency(markingModelStats.latencyP50) : "—"}</TableCell>}
              </TableRow>

              <TableRow>
                <TableCell className="flex flex-row items-center gap-2 "><DollarSign className="h-4 w-4"/> Input price</TableCell>
                <TableCell>{statsLoading ? "Loading…" : modelStats ? formatPrice(modelStats.promptPricePerToken) : "—"}</TableCell>
                {localUseSeparateMarkingModel && <TableCell>{markingStatsLoading ? "Loading…" : markingModelStats ? formatPrice(markingModelStats.promptPricePerToken) : "—"}</TableCell>}
              </TableRow>

              <TableRow>
                <TableCell className="flex flex-row items-center gap-2 "><DollarSign className="h-4 w-4"/> Output price</TableCell>
                <TableCell>{statsLoading ? "Loading…" : modelStats ? formatPrice(modelStats.completionPricePerToken) : "—"}</TableCell>
                {localUseSeparateMarkingModel && <TableCell>{markingStatsLoading ? "Loading…" : markingModelStats ? formatPrice(markingModelStats.completionPricePerToken) : "—"}</TableCell>}
              </TableRow>

              <TableRow>
                <TableCell className="flex flex-row items-center gap-2 "><Database className="h-4 w-4"/> Context window</TableCell>
                <TableCell>{statsLoading ? "Loading…" : modelStats ? formatContext(modelStats.contextLength) : "—"}</TableCell>
                {localUseSeparateMarkingModel && <TableCell>{markingStatsLoading ? "Loading…" : markingModelStats ? formatContext(markingModelStats.contextLength) : "—"}</TableCell>}
              </TableRow>

              <TableRow>
                <TableCell className="flex flex-row items-center gap-2 "><Clock className="h-4 w-4"/> Uptime (30m)</TableCell>
                <TableCell>{statsLoading ? "Loading…" : modelStats ? formatUptime(modelStats.uptimeLast30m) : "—"}</TableCell>
                {localUseSeparateMarkingModel && <TableCell>{markingStatsLoading ? "Loading…" : markingModelStats ? formatUptime(markingModelStats.uptimeLast30m) : "—"}</TableCell>}
              </TableRow>

              <TableRow>
                <TableCell className="flex flex-row items-center gap-2 "><Settings className="h-4 w-4"/> Structured output</TableCell>
                <TableCell>{modelStats ? (modelStats.supportsStructuredOutput ? "Supported" : "Not supported") : "—"}</TableCell>
                {localUseSeparateMarkingModel && <TableCell>{markingModelStats ? (markingModelStats.supportsStructuredOutput ? "Supported" : "Not supported") : "—"}</TableCell>}
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Credits ── */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Account Credits</CardTitle>
            <CardDescription>
              OpenRouter credit balance for the current API key.
              {creditsUpdatedAt && !creditsLoading && (
                <span className="ml-2 text-xs text-muted-foreground/70">{formatLastUpdated(creditsUpdatedAt)}</span>
              )}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            disabled={creditsLoading || !apiKey}
            onClick={() => fetchCredits(apiKey)}
            title="Refresh credits"
          >
            <RefreshCw className={`h-4 w-4 ${creditsLoading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {creditsError && (
            <p className="text-sm text-destructive">{creditsError}</p>
          )}
          {!credits && !creditsLoading && !creditsError && (
            <p className="text-sm text-muted-foreground">
              {apiKey ? "Click refresh to load credit info." : "Save your API key to load credit info."}
            </p>
          )}
          {creditsLoading && (
            <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
          )}
          {credits && !creditsLoading && (
            <div className="space-y-0">
              <StatRow icon={<DollarSign className="h-3.5 w-3.5" />} label="Remaining" value={`$${credits.remaining.toFixed(4)}`} />
              <StatRow icon={<DollarSign className="h-3.5 w-3.5" />} label="Used" value={`$${credits.totalUsage.toFixed(4)}`} dimmed />
              <StatRow icon={<DollarSign className="h-3.5 w-3.5" />} label="Total purchased" value={`$${credits.totalCredits.toFixed(4)}`} dimmed />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Theme ── */}
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>Toggle between light, dark, or system theme.</CardDescription>
        </CardHeader>
        <CardContent>
          <ModeToggle />
        </CardContent>
      </Card>

      {/* ── Debug Mode ── */}
      <Card>
        <CardHeader>
          <CardTitle>Debug Mode</CardTitle>
          <CardDescription>
            Reveal the raw LLM generation payload from the problem card for prompt inspection.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {debugMode ? "Debug mode is enabled." : "Debug mode is disabled."}
          </p>
          <Button
            type="button"
            variant={debugMode ? "default" : "outline"}
            className="gap-2"
            onClick={() => setDebugMode(!debugMode)}
          >
            <Bug className="h-4 w-4" />
            {debugMode ? "Disable Debug Mode" : "Enable Debug Mode"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
