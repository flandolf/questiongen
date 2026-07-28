import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppSettings } from '@/AppContext';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDeepSeekModels } from '@/hooks/useDeepSeekInfo';
import { useModelStats } from '@/hooks/useModelStats';
import { useNvidiaModels } from '@/hooks/useNvidiaInfo';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import type {
  PresetModel,
  ProviderResolutionContext,
  ProviderState,
} from '@/types/provider';
import { toProviderModelId } from '@/types/provider';
import {
  getImageModelsForProvider,
  getModelsForProvider,
  MARKER_STYLE_OPTIONS,
} from '@/views/settings/constants';
import { fmt } from '@/views/settings/formatters';
import { ImageModelSelectRow } from '@/views/settings/ImageModelSelectRow';
import { ModelSearchPanel } from '@/views/settings/ModelSearchPanel';
import { StatsTable } from '@/views/settings/StatsTable';

import {
  AnimatedSection,
  CustomModelInput,
  Divider,
  EmptyState,
  ErrorBanner,
  FieldGroup,
  ModelSelectRow,
  SectionHeader,
  ToggleRow,
} from '../SettingsUI';

/**
 * Higher-order component to wrap sections with consistent padding and grouping.
 */
function ConfigSection({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'relative px-4 py-5 rounded-xl border border-border/40 bg-muted/20 transition-all duration-200 hover:border-border/60 hover:bg-muted/30',
        className,
      )}
    >
      {children}
    </section>
  );
}

function ProviderSelectSection({
  activeProviderId,
  providers,
  onChange,
}: {
  activeProviderId: string;
  providers: Record<string, ProviderState>;
  onChange: (providerId: string) => void;
}) {
  const activeProvider = providers[activeProviderId];

  return (
    <ConfigSection key='provider-section' className='space-y-3'>
      <SectionHeader
        title='Provider'
        description='Choose the API provider these model selections should use.'
      />
      <FieldGroup label='Active provider' htmlFor='provider-select'>
        <Select value={activeProviderId} onValueChange={onChange}>
          <SelectTrigger
            id='provider-select'
            className='h-9 bg-background/50 border-border/40 text-xs font-medium'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.values(providers).map((provider) => (
              <SelectItem
                key={provider.config.id}
                value={provider.config.id}
                className='text-xs font-medium'
              >
                <span className='flex items-center gap-2'>
                  <span>{provider.config.name}</span>
                  {provider.apiKey ? (
                    <span className='text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 leading-none'>
                      key saved
                    </span>
                  ) : (
                    <span className='text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground leading-none'>
                      no key
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldGroup>
      {activeProvider && (
        <p className='text-xs text-muted-foreground font-mono truncate'>
          {activeProvider.config.baseUrl}
        </p>
      )}
    </ConfigSection>
  );
}

function ErrorBanners({ stats }: { stats: ReturnType<typeof useModelStats> }) {
  const errors = [
    stats.generation.error,
    stats.marking.error,
    stats.image.error,
    stats.tutor.error,
  ].filter(Boolean);

  if (errors.length === 0) return null;

  return (
    <div className='mb-4 space-y-1.5'>
      {errors.map((error, i) => (
        <ErrorBanner key={i} message={error!} />
      ))}
    </div>
  );
}

/**
 * Sub-component to manage the Live Stats table and refresh buttons.
 */
function LiveStatsSection({
  stats,
  apiKey,
  models,
}: {
  stats: ReturnType<typeof useModelStats>;
  apiKey?: string;
  models: {
    gen: string;
    mark: string;
    img: string;
    tutor: string;
    useMark: boolean;
    useImg: boolean;
  };
}) {
  const latestUpdate =
    stats.generation.updatedAt ??
    stats.marking.updatedAt ??
    stats.image.updatedAt ??
    stats.tutor.updatedAt;

  const activeModels = useMemo(
    () => [
      { label: 'Gen', state: stats.generation, m: models.gen },
      ...(models.useMark
        ? [{ label: 'Mark', state: stats.marking, m: models.mark }]
        : []),
      ...(models.useImg
        ? [{ label: 'Image', state: stats.image, m: models.img }]
        : []),
      { label: 'Tutor', state: stats.tutor, m: models.tutor },
    ],
    [stats, models],
  );

  const columns = useMemo(
    () => [
      {
        stats: stats.generation.stats,
        label: models.gen || 'Generation',
        loading: stats.generation.loading,
      },
      ...(models.useMark
        ? [
            {
              stats: stats.marking.stats,
              label: models.mark || 'Marking',
              loading: stats.marking.loading,
            },
          ]
        : []),
      ...(models.useImg
        ? [
            {
              stats: stats.image.stats,
              label: models.img || 'Image marking',
              loading: stats.image.loading,
            },
          ]
        : []),
      {
        stats: stats.tutor.stats,
        label: models.tutor || 'Tutor',
        loading: stats.tutor.loading,
      },
    ],
    [stats, models],
  );

  if (!apiKey)
    return <EmptyState message='Save your API key to load model stats.' />;

  return (
    <section className='pt-2'>
      <div className='flex items-start justify-between mb-5 px-1'>
        <div className='space-y-0.5'>
          <h2 className='text-xs font-bold uppercase tracking-widest text-foreground/70'>
            Live Performance Metrics
          </h2>
          {latestUpdate && (
            <p className='text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5'>
              <span className='h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' />
              Last sync: {fmt.time(latestUpdate)}
            </p>
          )}
        </div>
        <div className='flex gap-1.5'>
          {activeModels.map(({ label, state, m }) => (
            <Button
              key={label}
              variant='outline'
              size='xs'
              className='h-7 text-[10px] font-bold uppercase tracking-wider px-2 hover:bg-primary/5 hover:text-primary transition-all active:scale-95'
              disabled={state.loading || !m || m === 'custom'}
              onClick={() => {
                void state.fetch(m);
              }}
            >
              <RefreshCw
                className={cn(
                  'h-3 w-3 mr-1',
                  state.loading && 'animate-spin text-primary',
                )}
              />
              {label}
            </Button>
          ))}
        </div>
      </div>

      <ErrorBanners stats={stats} />

      <StatsTable columns={columns} />
    </section>
  );
}

function ReasoningEffortSelect({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  const activeProviderId = useAppStore((s) => s.activeProviderId);
  // NVIDIA NIMs and custom endpoints don't accept the OpenRouter
  // reasoning-effort param. Hidden entirely in that case so users
  // don't think the slider is doing anything.
  const isOpenRouterOrDeepSeek =
    activeProviderId === 'deepseek' || activeProviderId === 'openrouter';
  if (!isOpenRouterOrDeepSeek) {
    return null;
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className='w-40'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {activeProviderId === 'deepseek' ? (
          <>
            <SelectItem value='high'>High</SelectItem>
            <SelectItem value='max'>Max</SelectItem>
          </>
        ) : (
          <>
            <SelectItem value='xhigh'>Extra High</SelectItem>
            <SelectItem value='high'>High</SelectItem>
            <SelectItem value='medium'>Medium</SelectItem>
            <SelectItem value='low'>Low</SelectItem>
            <SelectItem value='minimal'>Minimal</SelectItem>
            <SelectItem value='none'>None</SelectItem>
          </>
        )}
      </SelectContent>
    </Select>
  );
}

function ReasoningEffortField({
  enabled,
  value,
  onChange,
  id,
}: {
  enabled: boolean;
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  const activeProviderId = useAppStore((s) => s.activeProviderId);
  const isOpenRouterOrDeepSeek =
    activeProviderId === 'deepseek' || activeProviderId === 'openrouter';
  if (!isOpenRouterOrDeepSeek) return null;
  return (
    <AnimatePresence>
      {enabled && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className='overflow-hidden'
        >
          <FieldGroup
            label={
              activeProviderId === 'deepseek'
                ? 'Thinking effort'
                : 'Reasoning effort'
            }
            htmlFor={id}
          >
            <ReasoningEffortSelect value={value} onChange={onChange} id={id} />
          </FieldGroup>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CustomModelSlideDown({
  show,
  id,
  label,
  value,
  onChange,
  onApply,
}: {
  show: boolean;
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onApply: () => void;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className='overflow-hidden'
        >
          <CustomModelInput
            id={id}
            label={label}
            value={value}
            onChange={onChange}
            onApply={onApply}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ModelsSection() {
  const settings = useAppSettings();
  const activeProviderId = useAppStore((s) => s.activeProviderId);
  const providers = useAppStore((s) => s.providers);
  const setActiveProvider = useAppStore((s) => s.setActiveProvider);
  const activeApiKey = providers[activeProviderId]?.apiKey ?? settings.apiKey;
  const stats = useModelStats(activeApiKey);

  // Dynamic DeepSeek model list (fetched regardless of active provider)
  const deepseekApiKey = useAppStore((s) => s.providers['deepseek']?.apiKey);
  const deepseekModels = useDeepSeekModels(deepseekApiKey);

  // Dynamic NVIDIA NIM list (fetched regardless of active provider)
  const nvidiaApiKey = useAppStore((s) => s.providers['nvidia']?.apiKey);
  const nvidiaModels = useNvidiaModels(nvidiaApiKey);

  useEffect(() => {
    if (deepseekApiKey) {
      void deepseekModels.fetch();
    }
    if (nvidiaApiKey) {
      void nvidiaModels.fetch();
    }
  }, [deepseekApiKey, nvidiaApiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Catalog Sets — feed `getProviderForModel` so shared author/slug
  // models (e.g. `moonshotai/kimi-k2.6`) route to NVIDIA when NVIDIA
  // is in the fetched catalogue even if not yet selected.
  const nvidiaCatalog = useMemo(
    () => new Set((nvidiaModels.models?.data ?? []).map((m) => m.id)),
    [nvidiaModels.models],
  );
  const deepseekCatalog = useMemo(
    () => new Set((deepseekModels.models?.data ?? []).map((m) => m.id)),
    [deepseekModels.models],
  );
  const resolutionContext = useMemo<ProviderResolutionContext>(
    () => ({ nvidiaCatalog, deepseekCatalog }),
    [nvidiaCatalog, deepseekCatalog],
  );

  const modelPresets = useMemo(() => {
    const base: PresetModel[] = [...getModelsForProvider(activeProviderId)];

    if (activeProviderId === 'deepseek' && deepseekModels.models?.data.length) {
      const seen = new Set(base.map((m) => m.id));
      for (const m of deepseekModels.models.data) {
        const id = toProviderModelId('deepseek', m.id);
        if (!seen.has(id)) {
          base.push({ id, name: m.id, providerId: 'deepseek' });
          seen.add(id);
        }
      }
      if (!seen.has('custom')) {
        base.push({ id: 'custom', name: 'Custom…' });
      }
    }
    if (activeProviderId === 'nvidia' && nvidiaModels.models?.data.length) {
      const seen = new Set(base.map((m) => m.id));
      for (const m of nvidiaModels.models.data) {
        const id = toProviderModelId('nvidia', m.id);
        if (!seen.has(id)) {
          base.push({ id, name: m.id, providerId: 'nvidia' });
          seen.add(id);
        }
      }
    }
    return base;
  }, [activeProviderId, deepseekModels.models, nvidiaModels.models]);
  const imageModelPresets = useMemo(
    () => getImageModelsForProvider(activeProviderId),
    [activeProviderId],
  );
  const [localState, setLocalState] = useState({
    model: settings.model,
    markingModel: settings.markingModel,
    imageMarkingModel: settings.imageMarkingModel,
    tutorModel: settings.tutorModel,
    useSeparateMarkingModel: settings.useSeparateMarkingModel,
    useSeparateImageMarkingModel: settings.useSeparateImageMarkingModel,
    includeExamContext: settings.includeExamContext,
    markerStyle: settings.markerStyle,
    customMarkerStyle: settings.customMarkerStyle,
    modelReasoningEnabled: settings.modelReasoningEnabled,
    modelReasoningEffort: settings.modelReasoningEffort,
    markingReasoningEnabled: settings.markingReasoningEnabled,
    markingReasoningEffort: settings.markingReasoningEffort,
  });

  const [showCustom, setShowCustom] = useState<Record<string, boolean>>({});
  const [customIds, setCustomIds] = useState<Record<string, string>>({});

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTarget, setSearchTarget] = useState<
    'generation' | 'marking' | 'imageMarking' | 'tutor'
  >('generation');

  // Sync settings from store to local state
  useEffect(() => {
    setLocalState((prev) => ({
      ...prev,
      model: settings.model,
      markingModel: settings.markingModel,
      imageMarkingModel: settings.imageMarkingModel,
      tutorModel: settings.tutorModel,
      useSeparateMarkingModel: settings.useSeparateMarkingModel,
      useSeparateImageMarkingModel: settings.useSeparateImageMarkingModel,
      includeExamContext: settings.includeExamContext,
      markerStyle: settings.markerStyle,
      customMarkerStyle: settings.customMarkerStyle,
      modelReasoningEnabled: settings.modelReasoningEnabled,
      modelReasoningEffort: settings.modelReasoningEffort,
      markingReasoningEnabled: settings.markingReasoningEnabled,
      markingReasoningEffort: settings.markingReasoningEffort,
    }));
  }, [
    settings.model,
    settings.markingModel,
    settings.imageMarkingModel,
    settings.tutorModel,
    settings.useSeparateMarkingModel,
    settings.useSeparateImageMarkingModel,
    settings.includeExamContext,
    settings.markerStyle,
    settings.customMarkerStyle,
    settings.modelReasoningEnabled,
    settings.modelReasoningEffort,
    settings.markingReasoningEnabled,
    settings.markingReasoningEffort,
  ]);

  // Sync from local state to store
  const updateSetting = useCallback(
    <K extends keyof typeof localState>(
      key: K,
      value: (typeof localState)[K],
    ) => {
      setLocalState((prev) => ({ ...prev, [key]: value }));
      const setterName =
        `set${key.charAt(0).toUpperCase()}${key.slice(1)}` as keyof typeof settings;
      const setter = settings[setterName] as
        | ((v: (typeof localState)[K]) => void)
        | undefined;
      if (typeof setter === 'function') {
        setter(value);
      }
    },
    [settings],
  );

  /**
   * Refined useEffects for fetching stats
   */
  const { fetch: fetchGen } = stats.generation;
  useEffect(() => {
    if (activeApiKey && localState.model) {
      void fetchGen(localState.model);
    }
  }, [activeApiKey, localState.model, fetchGen]);

  const { fetch: fetchMark } = stats.marking;
  useEffect(() => {
    if (
      activeApiKey &&
      localState.useSeparateMarkingModel &&
      localState.markingModel
    ) {
      void fetchMark(localState.markingModel);
    }
  }, [
    activeApiKey,
    localState.useSeparateMarkingModel,
    localState.markingModel,
    fetchMark,
  ]);

  const { fetch: fetchImg } = stats.image;
  useEffect(() => {
    if (
      activeApiKey &&
      localState.useSeparateImageMarkingModel &&
      localState.imageMarkingModel
    ) {
      void fetchImg(localState.imageMarkingModel);
    }
  }, [
    activeApiKey,
    localState.useSeparateImageMarkingModel,
    localState.imageMarkingModel,
    fetchImg,
  ]);

  const { fetch: fetchTutor } = stats.tutor;
  useEffect(() => {
    if (activeApiKey && localState.tutorModel) {
      void fetchTutor(localState.tutorModel);
    }
  }, [activeApiKey, localState.tutorModel, fetchTutor]);

  const openSearch = useCallback((t: typeof searchTarget) => {
    setSearchTarget(t);
    setSearchOpen(true);
  }, []);

  const toggleCustom = useCallback((target: string, value: boolean) => {
    setShowCustom((prev) => ({ ...prev, [target]: value }));
  }, []);

  const setCustomId = (target: string, id: string) => {
    setCustomIds((prev) => ({ ...prev, [target]: id }));
  };

  const updateModelSelection = useCallback(
    (
      target: typeof searchTarget,
      id: string,
      providerId = activeProviderId,
    ) => {
      if (providerId !== activeProviderId && providers[providerId]) {
        setActiveProvider(providerId);
      }
      if (target === 'generation') {
        updateSetting('model', id);
      } else if (target === 'marking') {
        updateSetting('markingModel', id);
      } else if (target === 'imageMarking') {
        updateSetting('imageMarkingModel', id);
      } else {
        updateSetting('tutorModel', id);
      }
    },
    [activeProviderId, providers, setActiveProvider, updateSetting],
  );

  const selectPresetModel = useCallback(
    (target: typeof searchTarget, id: string) => {
      if (id === 'custom') {
        toggleCustom(target, true);
        return;
      }
      const preset =
        target === 'imageMarking'
          ? imageModelPresets.find((m) => m.id === id)
          : modelPresets.find((m) => m.id === id);
      toggleCustom(target, false);
      updateModelSelection(target, id, preset?.providerId);
    },
    [imageModelPresets, modelPresets, toggleCustom, updateModelSelection],
  );

  const applySearchResult = (id: string) => {
    updateModelSelection(searchTarget, id);
    setShowCustom((prev) => ({ ...prev, [searchTarget]: false }));
    setSearchOpen(false);
  };

  const applyCustomModel = (target: typeof searchTarget, id: string) => {
    const trimmed = id.trim();
    if (!trimmed) return;
    updateModelSelection(target, trimmed);
    toggleCustom(target, false);
  };

  const handleProviderChange = useCallback(
    (providerId: string) => {
      setActiveProvider(providerId);
      setShowCustom({});
      setSearchOpen(false);
    },
    [setActiveProvider],
  );

  const currentModelConfig = useMemo(
    () => ({
      gen: localState.model,
      mark: localState.markingModel,
      img: localState.imageMarkingModel,
      tutor: localState.tutorModel,
      useMark: localState.useSeparateMarkingModel,
      useImg: localState.useSeparateImageMarkingModel,
    }),
    [localState],
  );

  return (
    <AnimatedSection className='space-y-5'>
      {searchOpen && (
        <ModelSearchPanel
          key='model-search-panel'
          target={searchTarget}
          apiKey={activeApiKey}
          providerId={activeProviderId}
          baseUrl={providers[activeProviderId]?.config?.baseUrl ?? null}
          onClose={() => setSearchOpen(false)}
          onSelect={applySearchResult}
        />
      )}

      <ProviderSelectSection
        activeProviderId={activeProviderId}
        providers={providers}
        onChange={handleProviderChange}
      />

      <ConfigSection key='gen-model-section' className='space-y-4'>
        <SectionHeader
          key='gen-model-header'
          title='Question Generation'
          description='Primary model used to generate exam questions.'
        />
        <FieldGroup
          key='gen-model-field'
          label='Model Identifier'
          htmlFor='model-select'
        >
          <ModelSelectRow
            id='model-select'
            value={localState.model}
            models={modelPresets}
            disabled={!activeApiKey}
            providers={providers}
            activeProviderId={activeProviderId}
            resolutionContext={resolutionContext}
            onSelect={(v) => selectPresetModel('generation', v)}
            onSearch={() => openSearch('generation')}
          />
        </FieldGroup>
        <ToggleRow
          id='model-reasoning'
          checked={localState.modelReasoningEnabled}
          onChange={(v) => updateSetting('modelReasoningEnabled', v)}
          label={
            activeProviderId === 'deepseek'
              ? 'Enable thinking mode'
              : 'Enable extended reasoning'
          }
          description='Allow model to use extended thinking for better quality'
        />
        <ReasoningEffortField
          enabled={localState.modelReasoningEnabled}
          value={localState.modelReasoningEffort}
          onChange={(v) =>
            updateSetting(
              'modelReasoningEffort',
              v as
                | 'xhigh'
                | 'high'
                | 'max'
                | 'medium'
                | 'low'
                | 'minimal'
                | 'none',
            )
          }
          id='reasoning-effort'
        />
        <CustomModelSlideDown
          show={showCustom['generation']}
          id='custom-model-id'
          label='Custom Model ID'
          value={customIds['generation'] || ''}
          onChange={(v) => setCustomId('generation', v)}
          onApply={() =>
            applyCustomModel('generation', customIds['generation'] || '')
          }
        />
      </ConfigSection>

      <ConfigSection key='marking-model-section' className='space-y-4'>
        <div className='flex items-start justify-between'>
          <SectionHeader
            key='marking-model-header'
            title='Marking & Grading'
            description='Independent model used for objective marking.'
          />
          <ToggleRow
            id='use-separate-marking-model'
            checked={localState.useSeparateMarkingModel}
            onChange={(v) => updateSetting('useSeparateMarkingModel', v)}
            label='Seperate marking model'
          />
        </div>
        <AnimatePresence>
          {localState.useSeparateMarkingModel && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className='space-y-4 overflow-hidden'
            >
              <div className='pt-2 border-t border-border/20'>
                <FieldGroup
                  key='marking-model-field'
                  label='Marking engine'
                  htmlFor='marking-model-select'
                >
                  <ModelSelectRow
                    id='marking-model-select'
                    value={localState.markingModel}
                    models={modelPresets}
                    disabled={!activeApiKey}
                    providers={providers}
                    activeProviderId={activeProviderId}
                    resolutionContext={resolutionContext}
                    onSelect={(v) => selectPresetModel('marking', v)}
                    onSearch={() => openSearch('marking')}
                  />
                </FieldGroup>
              </div>
              <ToggleRow
                id='marking-reasoning'
                checked={localState.markingReasoningEnabled}
                onChange={(v) => updateSetting('markingReasoningEnabled', v)}
                label={
                  activeProviderId === 'deepseek'
                    ? 'Enable thinking mode'
                    : 'Enable extended reasoning'
                }
                description='Allow model to use extended thinking for marking answers'
              />
              <ReasoningEffortField
                enabled={localState.markingReasoningEnabled}
                value={localState.markingReasoningEffort}
                onChange={(v) =>
                  updateSetting(
                    'markingReasoningEffort',
                    v as
                      | 'xhigh'
                      | 'high'
                      | 'max'
                      | 'medium'
                      | 'low'
                      | 'minimal'
                      | 'none',
                  )
                }
                id='marking-reasoning-effort'
              />
              <CustomModelSlideDown
                show={showCustom['marking']}
                id='custom-marking-model-id'
                label='Custom Marking Model ID'
                value={customIds['marking'] || ''}
                onChange={(v) => setCustomId('marking', v)}
                onApply={() =>
                  applyCustomModel('marking', customIds['marking'] || '')
                }
              />
            </motion.div>
          )}
        </AnimatePresence>
      </ConfigSection>

      <ConfigSection key='image-marking-model-section' className='space-y-4'>
        <div className='flex items-start justify-between'>
          <SectionHeader
            key='image-marking-model-header'
            title='Handwritten Response Marking'
            description='Vision model used for marking handwritten student work.'
          />
          <ToggleRow
            id='use-separate-image-marking-model'
            checked={localState.useSeparateImageMarkingModel}
            onChange={(v) => updateSetting('useSeparateImageMarkingModel', v)}
            label='Seperate image model'
          />
        </div>
        <AnimatePresence>
          {localState.useSeparateImageMarkingModel && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className='space-y-4 overflow-hidden'
            >
              <div className='pt-2 border-t border-border/20'>
                <FieldGroup
                  key='image-marking-model-field'
                  label='Vision model'
                  htmlFor='image-marking-model-select'
                >
                  <ImageModelSelectRow
                    id='image-marking-model-select'
                    value={localState.imageMarkingModel}
                    disabled={!activeApiKey}
                    apiKey={activeApiKey}
                    models={imageModelPresets}
                    providers={providers}
                    activeProviderId={activeProviderId}
                    resolutionContext={resolutionContext}
                    onSelect={(v) => selectPresetModel('imageMarking', v)}
                    onSearch={() => openSearch('imageMarking')}
                  />
                </FieldGroup>
              </div>
              <ToggleRow
                id='image-marking-reasoning'
                checked={localState.markingReasoningEnabled}
                onChange={(v) => updateSetting('markingReasoningEnabled', v)}
                label={
                  activeProviderId === 'deepseek'
                    ? 'Enable thinking mode'
                    : 'Enable extended reasoning'
                }
                description='Allow model to use extended thinking for marking handwritten answers'
              />
              <ReasoningEffortField
                enabled={localState.markingReasoningEnabled}
                value={localState.markingReasoningEffort}
                onChange={(v) =>
                  updateSetting(
                    'markingReasoningEffort',
                    v as
                      | 'xhigh'
                      | 'high'
                      | 'max'
                      | 'medium'
                      | 'low'
                      | 'minimal'
                      | 'none',
                  )
                }
                id='image-marking-reasoning-effort'
              />
              <CustomModelSlideDown
                show={showCustom['imageMarking']}
                id='custom-image-marking-model-id'
                label='Custom Vision ID'
                value={customIds['imageMarking'] || ''}
                onChange={(v) => setCustomId('imageMarking', v)}
                onApply={() =>
                  applyCustomModel(
                    'imageMarking',
                    customIds['imageMarking'] || '',
                  )
                }
              />
            </motion.div>
          )}
        </AnimatePresence>
      </ConfigSection>

      <ConfigSection key='tutor-model-section' className='space-y-4'>
        <SectionHeader
          key='tutor-model-header'
          title='Interactive Tutor'
          description='Model for the tutor.'
        />
        <FieldGroup
          key='tutor-model-field'
          label='Tutor engine'
          htmlFor='tutor-model-select'
        >
          <ModelSelectRow
            id='tutor-model-select'
            value={localState.tutorModel}
            models={modelPresets}
            disabled={!activeApiKey}
            providers={providers}
            activeProviderId={activeProviderId}
            resolutionContext={resolutionContext}
            onSelect={(v) => selectPresetModel('tutor', v)}
            onSearch={() => openSearch('tutor')}
          />
        </FieldGroup>
        <CustomModelSlideDown
          show={showCustom['tutor']}
          id='custom-tutor-model-id'
          label='Custom Tutor ID'
          value={customIds['tutor'] || ''}
          onChange={(v) => setCustomId('tutor', v)}
          onApply={() => applyCustomModel('tutor', customIds['tutor'] || '')}
        />
      </ConfigSection>

      <ConfigSection key='exam-context-section' className='space-y-4'>
        <SectionHeader
          key='exam-context-header'
          title='Academic Context'
          description='Provide the model with previous exam references to improve quality.'
        />
        <ToggleRow
          id='include-exam-context'
          checked={localState.includeExamContext}
          onChange={(v) => updateSetting('includeExamContext', v)}
          label='Reference local exam PDFs'
          description='Uses your local materials to ensure alignment with VCE standards.'
        />
      </ConfigSection>

      <ConfigSection key='marker-style-section' className='space-y-4'>
        <SectionHeader
          key='marker-style-header'
          title='Marking Style'
          description='Choose how strictly answers are graded.'
        />
        <FieldGroup
          key='marker-style-field'
          label='Marker style'
          htmlFor='marker-style-select'
        >
          <div className='flex flex-col gap-3'>
            {MARKER_STYLE_OPTIONS.map((opt) => (
              <label
                key={opt.id}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:bg-muted/30',
                  localState.markerStyle === opt.id
                    ? 'border-primary/60 bg-primary/5'
                    : 'border-border/40 bg-background/30',
                )}
              >
                <input
                  type='radio'
                  name='marker-style'
                  value={opt.id}
                  checked={localState.markerStyle === opt.id}
                  onChange={() =>
                    updateSetting(
                      'markerStyle',
                      opt.id as 'strict' | 'relaxed' | 'targeted' | 'custom',
                    )
                  }
                  className='mt-1 h-4 w-4 text-primary accent-primary'
                />
                <div className='flex-1 space-y-1'>
                  <p className='text-sm font-semibold'>{opt.name}</p>
                  <p className='text-xs text-muted-foreground'>
                    {opt.description}
                  </p>
                </div>
              </label>
            ))}
            {localState.markerStyle === 'custom' && (
              <div className='mt-2'>
                <FieldGroup
                  key='custom-marker-style-field'
                  label='Custom marking instructions'
                  htmlFor='custom-marker-style-input'
                  hint='Describe how to mark (e.g. "Be lenient but penalize factual errors.")'
                >
                  <textarea
                    id='custom-marker-style-input'
                    value={localState.customMarkerStyle}
                    onChange={(e) =>
                      setLocalState((prev) => ({
                        ...prev,
                        customMarkerStyle: e.target.value,
                      }))
                    }
                    onBlur={() =>
                      updateSetting(
                        'customMarkerStyle',
                        localState.customMarkerStyle,
                      )
                    }
                    placeholder='Define your custom marking style...'
                    rows={3}
                    className='min-h-20 w-full rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm font-medium shadow-inner transition-colors hover:bg-muted/50 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y'
                  />
                </FieldGroup>
              </div>
            )}
          </div>
        </FieldGroup>
      </ConfigSection>

      {activeProviderId === 'openrouter' && (
        <>
          <div className='py-4'>
            <Divider key='divider-live' />
          </div>

          <LiveStatsSection
            key='live-stats-section'
            stats={stats}
            apiKey={settings.apiKey}
            models={currentModelConfig}
          />
        </>
      )}
    </AnimatedSection>
  );
}
