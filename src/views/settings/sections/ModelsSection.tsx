import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, DollarSign, RefreshCw, Server } from 'lucide-react';
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
import { useDeepSeekBalance, useDeepSeekModels } from '@/hooks/useDeepSeekInfo';
import { useModelStats } from '@/hooks/useModelStats';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
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

function DeepSeekInfoSection({
  apiKey,
}: {
  apiKey: string | undefined;
}) {
  const balance = useDeepSeekBalance(apiKey);
  const models = useDeepSeekModels(apiKey);

  useEffect(() => {
    if (apiKey) {
      void balance.fetch();
      void models.fetch();
    }
  }, [apiKey, balance, models]);

  if (!apiKey) {
    return <EmptyState message='Save your API key to load DeepSeek info.' />;
  }

  return (
    <section className='space-y-4 pt-2'>
      <div className='flex items-start justify-between px-1'>
        <h2 className='text-xs font-bold uppercase tracking-widest text-foreground/70'>
          Account
        </h2>
        <div className='flex gap-1.5'>
          <Button
            variant='outline'
            size='xs'
            className='h-7 text-[10px] font-bold uppercase tracking-wider px-2'
            disabled={balance.loading}
            onClick={() => { void balance.fetch(); }}
          >
            <RefreshCw
              className={cn('h-3 w-3 mr-1', balance.loading && 'animate-spin')}
            />
            Balance
          </Button>
          <Button
            variant='outline'
            size='xs'
            className='h-7 text-[10px] font-bold uppercase tracking-wider px-2'
            disabled={models.loading}
            onClick={() => { void models.fetch(); }}
          >
            <RefreshCw
              className={cn('h-3 w-3 mr-1', models.loading && 'animate-spin')}
            />
            Models
          </Button>
        </div>
      </div>

      {balance.error && <ErrorBanner message={balance.error} />}

      {balance.balance && (
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 px-1'>
          {balance.balance.balanceInfos.map((info) => (
            <div
              key={info.currency}
              className='rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2'
            >
              <div className='flex items-center justify-between'>
                <span className='text-xs font-semibold uppercase tracking-wider text-foreground/60'>
                  {info.currency}
                </span>
                {balance.balance?.isAvailable ? (
                  <span className='flex items-center gap-1 text-[10px] font-bold text-emerald-500 uppercase tracking-wider'>
                    <CheckCircle2 className='h-3 w-3' />
                    Active
                  </span>
                ) : (
                  <span className='flex items-center gap-1 text-[10px] font-bold text-amber-500 uppercase tracking-wider'>
                    <AlertCircle className='h-3 w-3' />
                    Low Balance
                  </span>
                )}
              </div>
              <div className='flex items-center gap-2'>
                <DollarSign className='h-4 w-4 text-muted-foreground' />
                <span className='text-lg font-bold'>
                  {info.totalBalance}
                </span>
              </div>
              <div className='text-[11px] text-muted-foreground space-y-0.5'>
                <div className='flex justify-between'>
                  <span>Granted</span>
                  <span className='font-medium'>{info.grantedBalance}</span>
                </div>
                <div className='flex justify-between'>
                  <span>Topped up</span>
                  <span className='font-medium'>{info.toppedUpBalance}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {models.error && <ErrorBanner message={models.error} />}

      {models.models && models.models.data.length > 0 && (
        <div className='px-1'>
          <h3 className='text-[10px] font-bold uppercase tracking-widest text-foreground/50 mb-2'>
            Available Models ({models.models.data.length})
          </h3>
          <div className='flex flex-wrap gap-1.5'>
            {models.models.data.map((m) => (
              <span
                key={m.id}
                className='inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-muted/30 border border-border/30 text-foreground/80'
              >
                <Server className='h-3 w-3 text-muted-foreground' />
                {m.id}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// eslint-disable-next-line complexity -- multiple provider-specific branches
export function ModelsSection() {
  const settings = useAppSettings();
  const activeProviderId = useAppStore((s) => s.activeProviderId);
  const stats = useModelStats(settings.apiKey);

  const modelPresets = useMemo(
    () => getModelsForProvider(activeProviderId),
    [activeProviderId],
  );
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
    if (settings.apiKey && localState.model) {
      void fetchGen(localState.model);
    }
  }, [settings.apiKey, localState.model, fetchGen]);

  const { fetch: fetchMark } = stats.marking;
  useEffect(() => {
    if (
      settings.apiKey &&
      localState.useSeparateMarkingModel &&
      localState.markingModel
    ) {
      void fetchMark(localState.markingModel);
    }
  }, [
    settings.apiKey,
    localState.useSeparateMarkingModel,
    localState.markingModel,
    fetchMark,
  ]);

  const { fetch: fetchImg } = stats.image;
  useEffect(() => {
    if (
      settings.apiKey &&
      localState.useSeparateImageMarkingModel &&
      localState.imageMarkingModel
    ) {
      void fetchImg(localState.imageMarkingModel);
    }
  }, [
    settings.apiKey,
    localState.useSeparateImageMarkingModel,
    localState.imageMarkingModel,
    fetchImg,
  ]);

  const { fetch: fetchTutor } = stats.tutor;
  useEffect(() => {
    if (settings.apiKey && localState.tutorModel) {
      void fetchTutor(localState.tutorModel);
    }
  }, [settings.apiKey, localState.tutorModel, fetchTutor]);

  const openSearch = useCallback((t: typeof searchTarget) => {
    setSearchTarget(t);
    setSearchOpen(true);
  }, []);

  const applySearchResult = (id: string) => {
    if (searchTarget === 'generation') {
      updateSetting('model', id);
    } else if (searchTarget === 'marking') {
      updateSetting('markingModel', id);
    } else if (searchTarget === 'imageMarking') {
      updateSetting('imageMarkingModel', id);
    } else {
      updateSetting('tutorModel', id);
    }
    setShowCustom((prev) => ({ ...prev, [searchTarget]: false }));
    setSearchOpen(false);
  };

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

  const toggleCustom = (target: string, value: boolean) => {
    setShowCustom((prev) => ({ ...prev, [target]: value }));
  };

  const setCustomId = (target: string, id: string) => {
    setCustomIds((prev) => ({ ...prev, [target]: id }));
  };

  return (
    <AnimatedSection className='space-y-5'>
      {searchOpen && (
        <ModelSearchPanel
          key='model-search-panel'
          target={searchTarget}
          apiKey={settings.apiKey}
          onClose={() => setSearchOpen(false)}
          onSelect={applySearchResult}
        />
      )}

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
            disabled={!settings.apiKey}
            onSelect={(v) =>
              v === 'custom'
                ? toggleCustom('generation', true)
                : (toggleCustom('generation', false), updateSetting('model', v))
            }
            onSearch={() => openSearch('generation')}
          />
        </FieldGroup>
        <ToggleRow
          id='model-reasoning'
          checked={localState.modelReasoningEnabled}
          onChange={(v) => updateSetting('modelReasoningEnabled', v)}
          label={activeProviderId === 'deepseek' ? 'Enable thinking mode' : 'Enable extended reasoning'}
          description='Allow model to use extended thinking for better quality'
        />
        <AnimatePresence>
          {localState.modelReasoningEnabled && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className='overflow-hidden'
            >
              <FieldGroup
                label={activeProviderId === 'deepseek' ? 'Thinking effort' : 'Reasoning effort'}
                htmlFor='reasoning-effort'
              >
                <Select
                  value={localState.modelReasoningEffort}
                  onValueChange={(v) =>
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
                >
                  <SelectTrigger id='reasoning-effort' className='w-40'>
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
              </FieldGroup>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showCustom['generation'] && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className='overflow-hidden'
            >
              <CustomModelInput
                key='gen-model-custom'
                id='custom-model-id'
                label='Custom Model ID'
                value={customIds['generation'] || ''}
                onChange={(v) => setCustomId('generation', v)}
                onApply={() => {
                  updateSetting(
                    'model',
                    (customIds['generation'] || '').trim(),
                  );
                  toggleCustom('generation', false);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
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
                    disabled={!settings.apiKey}
                    onSelect={(v) =>
                      v === 'custom'
                        ? toggleCustom('marking', true)
                        : (toggleCustom('marking', false),
                          updateSetting('markingModel', v))
                    }
                    onSearch={() => openSearch('marking')}
                  />
                </FieldGroup>
              </div>
              <AnimatePresence>
                {showCustom['marking'] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className='overflow-hidden'
                  >
                    <CustomModelInput
                      key='marking-model-custom'
                      id='custom-marking-model-id'
                      label='Custom Marking Model ID'
                      value={customIds['marking'] || ''}
                      onChange={(v) => setCustomId('marking', v)}
                      onApply={() => {
                        updateSetting(
                          'markingModel',
                          (customIds['marking'] || '').trim(),
                        );
                        toggleCustom('marking', false);
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
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
                    disabled={!settings.apiKey}
                    apiKey={settings.apiKey}
                    models={imageModelPresets}
                    onSelect={(v) =>
                      v === 'custom'
                        ? toggleCustom('imageMarking', true)
                        : (toggleCustom('imageMarking', false),
                          updateSetting('imageMarkingModel', v))
                    }
                    onSearch={() => openSearch('imageMarking')}
                  />
                </FieldGroup>
              </div>
              <AnimatePresence>
                {showCustom['imageMarking'] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className='overflow-hidden'
                  >
                    <CustomModelInput
                      key='image-marking-model-custom'
                      id='custom-image-marking-model-id'
                      label='Custom Vision ID'
                      value={customIds['imageMarking'] || ''}
                      onChange={(v) => setCustomId('imageMarking', v)}
                      onApply={() => {
                        updateSetting(
                          'imageMarkingModel',
                          (customIds['imageMarking'] || '').trim(),
                        );
                        toggleCustom('imageMarking', false);
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
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
            disabled={!settings.apiKey}
            onSelect={(v) =>
              v === 'custom'
                ? toggleCustom('tutor', true)
                : (toggleCustom('tutor', false), updateSetting('tutorModel', v))
            }
            onSearch={() => openSearch('tutor')}
          />
        </FieldGroup>
        <AnimatePresence>
          {showCustom['tutor'] && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className='overflow-hidden'
            >
              <CustomModelInput
                key='tutor-model-custom'
                id='custom-tutor-model-id'
                label='Custom Tutor ID'
                value={customIds['tutor'] || ''}
                onChange={(v) => setCustomId('tutor', v)}
                onApply={() => {
                  updateSetting(
                    'tutorModel',
                    (customIds['tutor'] || '').trim(),
                  );
                  toggleCustom('tutor', false);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
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
      {activeProviderId === 'deepseek' && (
        <>
          <div className='py-4'>
            <Divider key='divider-deepseek' />
          </div>

          <div className='pt-2'>
            <DeepSeekInfoSection apiKey={settings.apiKey} />
          </div>
        </>
      )}
    </AnimatedSection>
  );
}
