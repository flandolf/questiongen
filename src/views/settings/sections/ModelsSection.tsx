import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useModelStats } from '@/hooks/useModelStats';
import { cn } from '@/lib/utils';

import { useAppSettings } from '../../../AppContext';
import { Button } from '../../../components/ui/button';
import { PRESET_MODELS } from '../constants';
import { fmt } from '../formatters';
import { ModelSearchPanel } from '../ModelSearchPanel';
import {
  CustomModelInput,
  Divider,
  EmptyState,
  ErrorBanner,
  FieldGroup,
  ModelSelectRow,
  SectionHeader,
  ToggleRow,
} from '../SettingsUI';
import { StatsTable } from '../StatsTable';

/**
 * Sub-component to manage the Live Stats table and refresh buttons.
 * This extraction significantly reduces the complexity of the main ModelsSection.
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
    useMark: boolean;
    useImg: boolean;
  };
}) {
  const latestUpdate =
    stats.generation.updatedAt ??
    stats.marking.updatedAt ??
    stats.image.updatedAt;

  if (!apiKey)
    return <EmptyState message="Save your API key to load model stats." />;

  return (
    <section>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold">Live Stats</h2>
          {latestUpdate && (
            <p className="text-xs text-muted-foreground">
              Updated {fmt.time(latestUpdate)}
            </p>
          )}
        </div>
        <div className="flex gap-1.5">
          {[
            { label: 'Generation', state: stats.generation, m: models.gen },
            ...(models.useMark
              ? [{ label: 'Marking', state: stats.marking, m: models.mark }]
              : []),
            ...(models.useImg
              ? [{ label: 'Image', state: stats.image, m: models.img }]
              : []),
          ].map(({ label, state, m }) => (
            <Button
              key={label}
              variant="outline"
              size="sm"
              disabled={state.loading || !m || m === 'custom'}
              onClick={() => {
                void state.fetch(m);
              }}
            >
              <RefreshCw
                className={cn(
                  'h-3.5 w-3.5 mr-1.5',
                  state.loading && 'animate-spin'
                )}
              />
              {label}
            </Button>
          ))}
        </div>
      </div>

      {(stats.generation.error || stats.marking.error || stats.image.error) && (
        <div className="mb-4 space-y-1.5">
          {stats.generation.error && (
            <ErrorBanner message={stats.generation.error} />
          )}
          {stats.marking.error && <ErrorBanner message={stats.marking.error} />}
          {stats.image.error && <ErrorBanner message={stats.image.error} />}
        </div>
      )}

      <StatsTable
        columns={[
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
        ]}
      />
    </section>
  );
}

export function ModelsSection() {
  const settings = useAppSettings();
  const stats = useModelStats(settings.apiKey);

  const [localModel, setLocalModel] = useState(settings.model);
  const [localMarkingModel, setLocalMarkingModel] = useState(
    settings.markingModel
  );
  const [localImageMarkingModel, setLocalImageMarkingModel] = useState(
    settings.imageMarkingModel
  );
  const [localUseSeparateMarkingModel, setLocalUseSeparateMarkingModel] =
    useState(settings.useSeparateMarkingModel);

  const [showCustom, setShowCustom] = useState(false);
  const [_showCustomMarking, setShowCustomMarking] = useState(false);
  const [customId, setCustomId] = useState('');

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTarget, setSearchTarget] = useState<
    'generation' | 'marking' | 'imageMarking'
  >('generation');

  // Sync settings effects
  useEffect(() => {
    if (localModel && localModel !== settings.model)
      settings.setModel(localModel);
  }, [localModel, settings]);

  useEffect(() => {
    if (localMarkingModel && localMarkingModel !== settings.markingModel)
      settings.setMarkingModel(localMarkingModel);
  }, [localMarkingModel, settings]);

  /**
   * Refined useEffects: We pull the specific fetcher and state objects
   * out of 'stats' to satisfy exhaustive-deps without triggering infinite loops.
   */
  const { fetch: fetchGen } = stats.generation;
  useEffect(() => {
    if (settings.apiKey && localModel) {
      void fetchGen(localModel);
    }
  }, [settings.apiKey, localModel, fetchGen]);

  const { fetch: fetchMark } = stats.marking;
  useEffect(() => {
    if (settings.apiKey && localUseSeparateMarkingModel && localMarkingModel) {
      void fetchMark(localMarkingModel);
    }
  }, [
    settings.apiKey,
    localUseSeparateMarkingModel,
    localMarkingModel,
    fetchMark,
  ]);

  const { fetch: fetchImg } = stats.image;
  useEffect(() => {
    if (
      settings.apiKey &&
      settings.useSeparateImageMarkingModel &&
      localImageMarkingModel
    ) {
      void fetchImg(localImageMarkingModel);
    }
  }, [
    settings.apiKey,
    settings.useSeparateImageMarkingModel,
    localImageMarkingModel,
    fetchImg,
  ]);

  const openSearch = useCallback((t: typeof searchTarget) => {
    setSearchTarget(t);
    setSearchOpen(true);
  }, []);

  const applySearchResult = (id: string) => {
    if (searchTarget === 'generation') {
      setLocalModel(id);
      setShowCustom(false);
    } else if (searchTarget === 'marking') {
      setLocalMarkingModel(id);
      setShowCustomMarking(false);
    } else {
      setLocalImageMarkingModel(id);
    }
    setSearchOpen(false);
  };

  const currentModelConfig = useMemo(
    () => ({
      gen: localModel,
      mark: localMarkingModel,
      img: localImageMarkingModel,
      useMark: localUseSeparateMarkingModel,
      useImg: settings.useSeparateImageMarkingModel,
    }),
    [
      localModel,
      localMarkingModel,
      localImageMarkingModel,
      localUseSeparateMarkingModel,
      settings.useSeparateImageMarkingModel,
    ]
  );

  return (
    <div className="space-y-6">
      {searchOpen && (
        <ModelSearchPanel
          target={searchTarget}
          apiKey={settings.apiKey}
          onClose={() => setSearchOpen(false)}
          onSelect={applySearchResult}
        />
      )}

      <section className="space-y-3">
        <SectionHeader
          title="Generation Model"
          description="Used to generate questions."
        />
        <FieldGroup label="Model" htmlFor="model-select">
          <ModelSelectRow
            id="model-select"
            value={localModel}
            models={PRESET_MODELS}
            disabled={!settings.apiKey}
            onSelect={(v) =>
              v === 'custom'
                ? setShowCustom(true)
                : (setShowCustom(false), setLocalModel(v))
            }
            onSearch={() => openSearch('generation')}
          />
        </FieldGroup>
        {showCustom && (
          <CustomModelInput
            id="custom-model-id"
            label="Custom Model ID"
            value={customId}
            onChange={setCustomId}
            onApply={() => {
              setLocalModel(customId.trim());
              setShowCustom(false);
            }}
          />
        )}
      </section>

      <Divider />

      <section>
        <SectionHeader
          title="Marking Model"
          description="Optional separate model for grading."
        />
        <ToggleRow
          id="use-separate-marking-model"
          checked={localUseSeparateMarkingModel}
          onChange={setLocalUseSeparateMarkingModel}
          label="Use a separate marking model"
        />
        {localUseSeparateMarkingModel && (
          <FieldGroup label="Marking model" htmlFor="marking-model-select">
            <ModelSelectRow
              id="marking-model-select"
              value={localMarkingModel}
              models={PRESET_MODELS}
              disabled={!settings.apiKey}
              onSelect={(v) =>
                v === 'custom'
                  ? setShowCustomMarking(true)
                  : (setShowCustomMarking(false), setLocalMarkingModel(v))
              }
              onSearch={() => openSearch('marking')}
            />
          </FieldGroup>
        )}
      </section>

      <Divider />

      <LiveStatsSection
        stats={stats}
        apiKey={settings.apiKey}
        models={currentModelConfig}
      />
    </div>
  );
}
