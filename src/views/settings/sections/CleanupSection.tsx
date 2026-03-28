import { useState, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Wand2, Loader2, CheckCircle2, AlertTriangle, Pencil, ChevronDown, ChevronUp, X, Check } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { readBackendError } from "../../../lib/app-utils";
import { useAppContext } from "../../../AppContext";
import {
  SectionHeader, FieldGroup, Divider, ErrorBanner, Card, ModelSelectRow,
} from "../SettingsUI";
import { PRESET_MODELS } from "../constants";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../../components/ui/select";
import {
  TOPICS, MATH_METHODS_SUBTOPICS, SPECIALIST_MATH_SUBTOPICS,
  CHEMISTRY_SUBTOPICS, PHYSICAL_EDUCATION_SUBTOPICS,
  type Topic,
} from "../../../types";

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

// ─── Manual Fix Panel ─────────────────────────────────────────────────────────

function ManualFixPanel({
  unknownItems,
  canonicalOptions,
  mappingKind,
  onApply,
}: {
  unknownItems: string[];
  canonicalOptions: string[];
  mappingKind: "topic" | "subtopic";
  onApply: (mapping: Record<string, string>) => number;
}) {
  const [expanded, setExpanded] = useState(false);
  // For each unknown value, store either a canonical pick or a custom text override.
  // "custom:<text>" prefix denotes a custom entry.
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [resultCount, setResultCount] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const handleSelect = (unknown: string, value: string) => {
    setSelections((prev) => ({ ...prev, [unknown]: value }));
    if (value !== "__custom__") {
      setCustomInputs((prev) => {
        const next = { ...prev };
        delete next[unknown];
        return next;
      });
    }
  };

  const handleCustomInput = (unknown: string, text: string) => {
    setCustomInputs((prev) => ({ ...prev, [unknown]: text }));
    setSelections((prev) => ({ ...prev, [unknown]: "__custom__" }));
  };

  const handleApply = () => {
    const mapping: Record<string, string> = {};
    for (const item of unknownItems) {
      const sel = selections[item];
      if (!sel || sel === "") continue;
      if (sel === "__custom__") {
        const custom = (customInputs[item] ?? "").trim();
        if (custom) mapping[item] = custom;
      } else {
        mapping[item] = sel;
      }
    }
    if (Object.keys(mapping).length === 0) return;
    const count = onApply(mapping);
    setResultCount(count);
  };

  const resolvedCount = Object.keys(selections).filter((k) => {
    const sel = selections[k];
    if (!sel || sel === "") return false;
    if (sel === "__custom__") return !!(customInputs[k] ?? "").trim();
    return true;
  }).length;

  // Filter unknown items by search query
  const filteredUnknownItems = useMemo(() => {
    if (!search.trim()) return unknownItems;
    const q = search.trim().toLowerCase();
    return unknownItems.filter((item) => item.toLowerCase().includes(q));
  }, [search, unknownItems]);

  // Reset search when panel is collapsed
  const handleExpandToggle = () => {
    setExpanded((v) => {
      if (v) setSearch("");
      return !v;
    });
  };

  if (resultCount !== null) {
    return (
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <p className="text-sm font-medium">Manual {mappingKind === "topic" ? "Topic" : "Subtopic"} Fix Complete</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Updated {resultCount} {mappingKind}(s) across your history.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={handleExpandToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Pencil className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            Manually Fix Unknown {mappingKind === "topic" ? "Topics" : "Subtopics"}
          </span>
          <span className="text-xs text-muted-foreground">({unknownItems.length})</span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search unknown ${mappingKind}s…`}
            className="h-7 text-xs font-mono mb-2"
            autoFocus
          />
          {filteredUnknownItems.length === 0 ? (
            <div className="text-xs text-muted-foreground">No matches found.</div>
          ) : (
            filteredUnknownItems.map((item) => {
              const sel = selections[item] ?? "";
              const isCustom = sel === "__custom__";
              return (
                <div key={item} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 shrink-0">
                      {item}
                    </span>
                    <span className="text-muted-foreground text-xs shrink-0">→</span>
                    <div className="min-w-0 flex-1">
                      <Select
                        value={isCustom ? "__custom__" : sel}
                        onValueChange={(v) => handleSelect(item, v)}
                      >
                        <SelectTrigger className="w-full h-7 text-xs">
                          <SelectValue placeholder="Choose canonical…" />
                        </SelectTrigger>
                        <SelectContent>
                          {canonicalOptions.map((opt) => (
                            <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                          ))}
                          <SelectItem value="__custom__" className="text-xs text-muted-foreground">Custom value…</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {isCustom && (
                    <Input
                      value={customInputs[item] ?? ""}
                      onChange={(e) => handleCustomInput(item, e.target.value)}
                      placeholder="Type custom canonical value…"
                      className="h-7 text-xs font-mono"
                    />
                  )}
                </div>
              );
            })
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button
              size="sm"
              onClick={handleApply}
              disabled={resolvedCount === 0}
              className="gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              Apply {resolvedCount > 0 ? `(${resolvedCount})` : ""}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelections({});
                setCustomInputs({});
              }}
              className="gap-1.5 text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────

export function CleanupSection() {
  const { apiKey, questionHistory, setQuestionHistory, mcHistory, setMcHistory } = useAppContext();

  const [selectedModel, setSelectedModel] = useState(PRESET_MODELS[0].id);

  const [topicLoading, setTopicLoading] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);
  const [topicResult, setTopicResult] = useState<TopicCleanupResult | null>(null);

  const [subtopicLoading, setSubtopicLoading] = useState(false);
  const [subtopicError, setSubtopicError] = useState<string | null>(null);
  const [subtopicResult, setSubtopicResult] = useState<SubtopicCleanupResult | null>(null);

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

      const newWritten = questionHistory.map((entry) => {
        const q = { ...entry.question };
        if (q.topic && topicMapping[q.topic]) {
          q.topic = topicMapping[q.topic] as Topic;
          count++;
          return { ...entry, question: q, lastModified: Date.now() };
        }
        return entry;
      });

      const newMc = mcHistory.map((entry) => {
        const q = { ...entry.question };
        if (q.topic && topicMapping[q.topic]) {
          q.topic = topicMapping[q.topic] as Topic;
          count++;
          return { ...entry, question: q, lastModified: Date.now() };
        }
        return entry;
      });

      setQuestionHistory(newWritten);
      setMcHistory(newMc);
      return count;
    },
    [questionHistory, mcHistory, setQuestionHistory, setMcHistory],
  );

  const applySubtopicMapping = useCallback(
    (subtopicMapping: Record<string, string>): number => {
      let count = 0;

      const newWritten = questionHistory.map((entry) => {
        const q = { ...entry.question };
        if (q.subtopic && subtopicMapping[q.subtopic]) {
          q.subtopic = subtopicMapping[q.subtopic];
          count++;
          return { ...entry, question: q, lastModified: Date.now() };
        }
        return entry;
      });

      const newMc = mcHistory.map((entry) => {
        const q = { ...entry.question };
        if (q.subtopic && subtopicMapping[q.subtopic]) {
          q.subtopic = subtopicMapping[q.subtopic];
          count++;
          return { ...entry, question: q, lastModified: Date.now() };
        }
        return entry;
      });

      setQuestionHistory(newWritten);
      setMcHistory(newMc);
      return count;
    },
    [questionHistory, mcHistory, setQuestionHistory, setMcHistory],
  );

  const handleCleanupTopics = useCallback(async () => {
    if (!apiKey.trim()) {
      setTopicError("API key is required.");
      return;
    }
    if (selectedModel === "custom") {
      setTopicError("Select a specific model (not custom).");
      return;
    }
    if (scan.unknownTopics.length === 0) {
      setTopicError("No unknown topics found.");
      return;
    }

    setTopicLoading(true);
    setTopicError(null);
    setTopicResult(null);

    try {
      const response = await invoke<TopicsCleanupResponse>("cleanup_topics", {
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
      setSubtopicError("API key is required.");
      return;
    }
    if (selectedModel === "custom") {
      setSubtopicError("Select a specific model (not custom).");
      return;
    }
    if (scan.unknownSubtopics.length === 0) {
      setSubtopicError("No unknown subtopics found.");
      return;
    }

    setSubtopicLoading(true);
    setSubtopicError(null);
    setSubtopicResult(null);

    try {
      const response = await invoke<SubtopicsCleanupResponse>("cleanup_subtopics", {
        request: {
          model: selectedModel,
          apiKey,
          unknownSubtopics: scan.unknownSubtopics,
          canonicalSubtopics: CANONICAL_SUBTOPICS,
        },
      });

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
    <div className="space-y-6">
      <SectionHeader
        title="Data Cleanup"
        description="Normalize topics and subtopics in your question history to match canonical VCAA study design values."
      />

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <p className="text-sm font-medium">Scan Results</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Scanning {scan.totalWritten} written and {scan.totalMc} multiple-choice history entries.
        </p>
        {!hasUnknowns ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" />All topics and subtopics are canonical.
          </p>
        ) : (
          <div className="space-y-2">
            {hasUnknownTopics && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Unknown topics ({scan.unknownTopics.length}):</p>
                <div className="flex flex-wrap gap-1">
                  {scan.unknownTopics.map((t) => (
                    <span key={t} className="inline-flex items-center px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs font-mono">{t}</span>
                  ))}
                </div>
              </div>
            )}
            {hasUnknownSubtopics && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Unknown subtopics ({scan.unknownSubtopics.length}):</p>
                <div className="flex flex-wrap gap-1">
                  {scan.unknownSubtopics.map((st) => (
                    <span key={st} className="inline-flex items-center px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs font-mono">{st}</span>
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
          <section className="space-y-3">
            <FieldGroup label="LLM Model" htmlFor="cleanup-model-select">
              <ModelSelectRow
                id="cleanup-model-select"
                value={selectedModel}
                models={PRESET_MODELS}
                disabled={!apiKey}
                onSelect={(v) => setSelectedModel(v)}
              />
            </FieldGroup>
            <p className="text-xs text-muted-foreground">
              The selected model will map non-canonical values to their closest canonical match.
            </p>
          </section>

          {hasUnknownTopics && (
            <div className="space-y-3">
              {topicError && <ErrorBanner message={topicError} />}
              <Button
                onClick={handleCleanupTopics}
                disabled={topicLoading || !apiKey || selectedModel === "custom"}
                className="gap-2"
              >
                {topicLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {topicLoading ? "Normalizing Topics…" : "Normalize Topics"}
              </Button>
            </div>
          )}

          {hasUnknownTopics && !topicResult && (
            <ManualFixPanel
              unknownItems={scan.unknownTopics}
              canonicalOptions={CANONICAL_TOPICS}
              mappingKind="topic"
              onApply={applyTopicMapping}
            />
          )}

          {hasUnknownSubtopics && (
            <div className="space-y-3">
              {subtopicError && <ErrorBanner message={subtopicError} />}
              <Button
                onClick={handleCleanupSubtopics}
                disabled={subtopicLoading || !apiKey || selectedModel === "custom"}
                className="gap-2"
              >
                {subtopicLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {subtopicLoading ? "Normalizing Subtopics…" : "Normalize Subtopics"}
              </Button>
            </div>
          )}

          {hasUnknownSubtopics && !subtopicResult && (
            <ManualFixPanel
              unknownItems={scan.unknownSubtopics}
              canonicalOptions={CANONICAL_SUBTOPICS}
              mappingKind="subtopic"
              onApply={applySubtopicMapping}
            />
          )}
        </>
      )}

      {topicResult && (
        <>
          <Divider />
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <p className="text-sm font-medium">Topic Cleanup Complete</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Updated {topicResult.topicsUpdated} topic(s) across your history.
            </p>
            {Object.keys(topicResult.topicMapping).length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Topic mappings:</p>
                <div className="space-y-1">
                  {Object.entries(topicResult.topicMapping).map(([from, to]) => (
                    <div key={from} className="text-xs flex items-center gap-1.5">
                      <span className="font-mono px-1.5 py-0.5 rounded bg-muted line-through">{from}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200">{to}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {subtopicResult && (
        <>
          <Divider />
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <p className="text-sm font-medium">Subtopic Cleanup Complete</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Updated {subtopicResult.subtopicsUpdated} subtopic(s) across your history.
            </p>
            {Object.keys(subtopicResult.subtopicMapping).length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Subtopic mappings:</p>
                <div className="space-y-1">
                  {Object.entries(subtopicResult.subtopicMapping).map(([from, to]) => (
                    <div key={from} className="text-xs flex items-center gap-1.5">
                      <span className="font-mono px-1.5 py-0.5 rounded bg-muted line-through">{from}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200">{to}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
