import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Image as ImageIcon } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { cn } from "@/lib/utils";
import { readBackendError } from "../../../lib/app-utils";
import { useAppSettings } from "../../../AppContext";
import {
  SectionHeader, FieldGroup, Divider, ToggleRow,
  ModelSelectRow, CustomModelInput, ErrorBanner, EmptyState,
} from "../SettingsUI";
import { ImageModelSelectRow } from "../ImageModelSelectRow";
import { ModelSearchPanel } from "../ModelSearchPanel";
import { StatsTable } from "../StatsTable";
import { fmt } from "../formatters";
import { PRESET_MODELS } from "../constants";
import { setCachedImageValidation } from "../imageValidationCache";
import type { ModelStats } from "../types";

export function ModelsSection() {
  const {
    apiKey,
    model, setModel,
    markingModel, setMarkingModel,
    useSeparateMarkingModel, setUseSeparateMarkingModel,
    imageMarkingModel, setImageMarkingModel,
    useSeparateImageMarkingModel, setUseSeparateImageMarkingModel,
    includeExamContext, setIncludeExamContext,
  } = useAppSettings();

  const [localModel, setLocalModel] = useState(model);
  const [localMarkingModel, setLocalMarkingModel] = useState(markingModel);
  const [localImageMarkingModel, setLocalImageMarkingModel] = useState(imageMarkingModel);
  const [localUseSeparateMarkingModel, setLocalUseSeparateMarkingModel] = useState(useSeparateMarkingModel);
  const [localUseSeparateImageMarkingModel, setLocalUseSeparateImageMarkingModel] = useState(useSeparateImageMarkingModel);

  const [showCustom, setShowCustom] = useState(false);
  const [customId, setCustomId] = useState("");
  const [showCustomMarking, setShowCustomMarking] = useState(false);
  const [customMarkingId, setCustomMarkingId] = useState("");
  const [showCustomImage, setShowCustomImage] = useState(false);
  const [customImageId, setCustomImageId] = useState("");

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTarget, setSearchTarget] = useState<"generation" | "marking" | "imageMarking">("generation");

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

  useEffect(() => { setLocalModel(model); }, [model]);
  useEffect(() => { setLocalMarkingModel(markingModel); }, [markingModel]);
  useEffect(() => { setLocalUseSeparateMarkingModel(useSeparateMarkingModel); }, [useSeparateMarkingModel]);
  useEffect(() => { setLocalImageMarkingModel(imageMarkingModel); }, [imageMarkingModel]);
  useEffect(() => { setLocalUseSeparateImageMarkingModel(useSeparateImageMarkingModel); }, [useSeparateImageMarkingModel]);

  useEffect(() => { if (localModel && localModel !== model) setModel(localModel); }, [localModel, model, setModel]);
  useEffect(() => { if (localMarkingModel && localMarkingModel !== markingModel) setMarkingModel(localMarkingModel); }, [localMarkingModel, markingModel, setMarkingModel]);
  useEffect(() => { if (localUseSeparateMarkingModel !== useSeparateMarkingModel) setUseSeparateMarkingModel(localUseSeparateMarkingModel); }, [localUseSeparateMarkingModel, useSeparateMarkingModel, setUseSeparateMarkingModel]);
  useEffect(() => { if (localImageMarkingModel && localImageMarkingModel !== imageMarkingModel) setImageMarkingModel(localImageMarkingModel); }, [localImageMarkingModel, imageMarkingModel, setImageMarkingModel]);
  useEffect(() => { if (localUseSeparateImageMarkingModel !== useSeparateImageMarkingModel) setUseSeparateImageMarkingModel(localUseSeparateImageMarkingModel); }, [localUseSeparateImageMarkingModel, useSeparateImageMarkingModel, setUseSeparateImageMarkingModel]);

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
    try {
      const s = await invoke<ModelStats>("get_model_stats", { apiKey: key, modelId });
      setImageMarkingModelStats(s);
      setImageMarkingStatsUpdatedAt(new Date());
      setCachedImageValidation(key, modelId, s.supportsImages === true);
    }
    catch (e) { setImageMarkingStatsError(readBackendError(e)); }
    finally { setImageMarkingStatsLoading(false); }
  }, []);

  useEffect(() => { if (apiKey && model) fetchModelStats(apiKey, model); }, [apiKey, model, fetchModelStats]);
  useEffect(() => { if (apiKey && useSeparateMarkingModel && markingModel) fetchMarkingModelStats(apiKey, markingModel); }, [apiKey, useSeparateMarkingModel, markingModel, fetchMarkingModelStats]);
  useEffect(() => { if (apiKey && useSeparateImageMarkingModel && imageMarkingModel) fetchImageMarkingModelStats(apiKey, imageMarkingModel); }, [apiKey, useSeparateImageMarkingModel, imageMarkingModel, fetchImageMarkingModelStats]);
  useEffect(() => { if (apiKey && localModel && localModel !== "custom") fetchModelStats(apiKey, localModel); }, [localModel, apiKey, fetchModelStats]);
  useEffect(() => { if (apiKey && localUseSeparateMarkingModel && localMarkingModel && localMarkingModel !== "custom") fetchMarkingModelStats(apiKey, localMarkingModel); }, [localMarkingModel, apiKey, localUseSeparateMarkingModel, fetchMarkingModelStats]);
  useEffect(() => { if (apiKey && localUseSeparateImageMarkingModel && localImageMarkingModel && localImageMarkingModel !== "custom") fetchImageMarkingModelStats(apiKey, localImageMarkingModel); }, [localImageMarkingModel, apiKey, localUseSeparateImageMarkingModel, fetchImageMarkingModelStats]);

  function openSearch(t: typeof searchTarget) { setSearchTarget(t); setSearchOpen(true); }
  function applySearchResult(id: string) {
    if (searchTarget === "generation") { setLocalModel(id); setShowCustom(false); }
    else if (searchTarget === "marking") { setLocalMarkingModel(id); setShowCustomMarking(false); }
    else { setLocalImageMarkingModel(id); setShowCustomImage(false); }
  }

  const latestUpdate = statsUpdatedAt ?? markingStatsUpdatedAt ?? imageMarkingStatsUpdatedAt;

  return (
    <div className="space-y-6">
      {searchOpen && (
        <ModelSearchPanel
          target={searchTarget} apiKey={apiKey}
          onClose={() => setSearchOpen(false)} onSelect={applySearchResult}
        />
      )}

      <section className="space-y-3">
        <SectionHeader title="Generation Model" description="Used to generate questions and content." />
        <FieldGroup label="Model" htmlFor="model-select">
          <ModelSelectRow
            id="model-select" value={localModel} models={PRESET_MODELS} disabled={!apiKey}
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

      <section className="space-y-3">
        <SectionHeader
          title="Exam Context"
          description="Include exam PDF files as context when generating questions."
        />
        <ToggleRow
          id="include-exam-context"
          checked={includeExamContext}
          onChange={setIncludeExamContext}
          label="Include exam PDFs in prompts"
          description="When enabled, exam files from the exams/ folder will be sent to the LLM to inform question generation."
        />
        {includeExamContext && (
          <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">Available exam files:</p>
            <div className="flex flex-wrap gap-1.5">
              {["MathMethods1", "MathMethods2", "SpecialistMaths1", "SpecialistMaths2", "Chemistry", "PhysicalEducation"].map((name) => (
                <span key={name} className="inline-flex items-center px-2 py-0.5 rounded bg-background text-xs font-mono border border-border">
                  2025-{name}.pdf
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <Divider />

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
                id="marking-model-select" value={localMarkingModel} models={PRESET_MODELS} disabled={!apiKey}
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

      <section className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-semibold tracking-tight">Image Marking Model</h2>
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
            <ImageIcon className="h-3 w-3" />Vision
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Only vision-capable models can process image answer uploads.
        </p>
        <ToggleRow
          id="use-separate-image-marking-model" checked={localUseSeparateImageMarkingModel}
          onChange={setLocalUseSeparateImageMarkingModel} label="Use a separate image marking model"
          description="When disabled, the marking model handles image answers too."
        />
        {localUseSeparateImageMarkingModel && (
          <>
            <FieldGroup label="Image marking model" htmlFor="image-marking-model-select">
              <ImageModelSelectRow
                id="image-marking-model-select"
                value={localImageMarkingModel}
                apiKey={apiKey}
                disabled={!apiKey}
                onSelect={(v) => v === "custom" ? setShowCustomImage(true) : (setShowCustomImage(false), setLocalImageMarkingModel(v))}
                onSearch={() => openSearch("imageMarking")}
              />
            </FieldGroup>
            {showCustomImage && (
              <CustomModelInput
                id="custom-image-id" label="Custom Image Marking Model ID" value={customImageId} onChange={setCustomImageId}
                hint="Format: provider/model-name — must support vision/image inputs"
                onApply={() => {
                  const id = customImageId.trim();
                  setLocalImageMarkingModel(id);
                  setShowCustomImage(false);
                }}
              />
            )}
          </>
        )}
      </section>

      <Divider />

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
}
