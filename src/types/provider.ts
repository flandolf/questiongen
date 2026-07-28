import { DEFAULT_MODEL } from './constants';

export type ProviderId = 'openrouter' | 'deepseek' | 'nvidia' | 'custom';

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
}

export interface ProviderModelSelections {
  model: string;
  markingModel: string;
  useSeparateMarkingModel: boolean;
  imageMarkingModel: string;
  useSeparateImageMarkingModel: boolean;
  tutorModel: string;
}

export type KeyStatus = 'untested' | 'valid' | 'invalid';

export interface ProviderState {
  config: ProviderConfig;
  apiKey: string;
  keyStatus: KeyStatus;
  keyLastTestedAt: number | null;
  modelSelections: ProviderModelSelections;
}

/** Subset of preset items exposed to UI dropdowns. */
export interface PresetModel {
  id: string;
  name: string;
  /** Authoritative ownership hint (e.g., `openrouter`, `nvidia`, `deepseek`,
   *  or a custom provider id). Stronger than active-provider heuristics. */
  providerId?: string;
}

/**
 * Rich context for `getProviderForModel` / `getProviderLabelForModel`.
 * Pass either a single string (interpreted as `activeProviderId` for
 * back-compat) or an object that combines multiple signals.
 */
export interface ProviderResolutionContext {
  /** Globally active provider id from the store (weak signal;
   *  primarily the fallback for plain-id models). */
  activeProviderId?: string;
  /** Per-row listing hint (e.g., from preset tagging). Strong
   *  signal that overrides the active-provider fallback. */
  listingProviderId?: string;
  /** Set of model ids known to be served by NVIDIA's catalogue
   *  (fetched via `useNvidiaModels`). */
  nvidiaCatalog?: Set<string>;
  /** Set of model ids known to be served by DeepSeek direct
   *  (fetched via `useDeepSeekModels`). */
  deepseekCatalog?: Set<string>;
  /** Map from custom provider id → set of model ids known to be
   *  served by that custom endpoint. */
  customCatalog?: Record<string, Set<string>>;
}

function toContext(
  arg?: string | ProviderResolutionContext,
): ProviderResolutionContext {
  if (arg == null) return {};
  if (typeof arg === 'string') return { activeProviderId: arg };
  return arg;
}

/**
 * Built-in providers. Each ships with a default base URL and is seeded
 * automatically on first launch (and for migrated users). Custom
 * providers are added at runtime via `addCustomProvider`.
 */
export const BUILTIN_PROVIDERS: Record<string, ProviderConfig> = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
  },
  nvidia: {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
  },
};

export const DEFAULT_PROVIDER_ID = 'openrouter';

/**
 * Identifier-to-base-URL resolvers.
 */
export const PROVIDER_BASE_URLS: Record<string, string> = Object.fromEntries(
  Object.values(BUILTIN_PROVIDERS).map((p) => [p.id, p.baseUrl]),
);

export function mergeProvidersWithBuiltins(
  persisted: Record<string, ProviderState> = {},
): Record<string, ProviderState> {
  const providers = { ...persisted };
  for (const [id, config] of Object.entries(BUILTIN_PROVIDERS)) {
    providers[id] = providers[id]
      ? { ...providers[id], config }
      : createDefaultProviderState(config);
  }
  return providers;
}

/** DeepSeek direct model ids routed through DeepSeek's API. */
const DEEPSEEK_PLAIN_IDS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);
const BUILTIN_PROVIDER_MODEL_PREFIXES = new Set(['deepseek', 'nvidia']);

export function toProviderModelId(providerId: string, modelId: string): string {
  if (!BUILTIN_PROVIDER_MODEL_PREFIXES.has(providerId) || modelId === 'custom')
    return modelId;
  if (stripProviderModelPrefix(modelId).providerId === providerId) return modelId;
  return `${providerId}/${modelId}`;
}

export function stripProviderModelPrefix(modelId: string): {
  providerId: string | null;
  modelId: string;
} {
  const [prefix, ...rest] = modelId.split('/');
  const isExplicitNvidia = prefix === 'nvidia' && rest.length >= 2;
  const isExplicitDeepSeek = prefix === 'deepseek' && rest.length >= 1;
  if (!isExplicitNvidia && !isExplicitDeepSeek) {
    return { providerId: null, modelId };
  }
  return { providerId: prefix, modelId: rest.join('/') };
}

/** Ordered fallback when no other signal resolves the model. */
const PROVIDER_FALLBACK_ORDER: ProviderId[] = [
  'openrouter',
  'nvidia',
  'deepseek',
];

/**
 * Returns the provider id whose modelSelections include `modelId`, or
 * `null` if zero or more than one provider "owns" it. (When multiple
 * providers share a model id we fall through to other rules so the
 * caller can pick the active provider explicitly.)
 */
function resolveSelectionOwner(
  modelId: string,
  providers: Record<string, ProviderState>,
): string | null {
  let owner: string | null = null;
  let count = 0;
  for (const [providerId, provider] of Object.entries(providers)) {
    if (!provider?.apiKey) continue;
    const ms = provider.modelSelections;
    const matched =
      ms.model === modelId ||
      ms.markingModel === modelId ||
      ms.imageMarkingModel === modelId ||
      ms.tutorModel === modelId;
    if (matched) {
      owner = providerId;
      count += 1;
    }
  }
  return count === 1 ? owner : null;
}

/**
 * Returns true for any configured provider (built-in or custom).
 */
function firstConfiguredProvider(
  providers: Record<string, ProviderState>,
): string | null {
  for (const id of PROVIDER_FALLBACK_ORDER) {
    if (providers[id]?.apiKey) return id;
  }
  const customKeys = Object.keys(providers).filter(
    (id) =>
      id !== 'openrouter' && id !== 'deepseek' && id !== 'nvidia' &&
      providers[id]?.apiKey,
  );
  return customKeys.length === 1 ? customKeys[0] : null;
}

/** Step 1 — selection-owner. */
function trySelectionOwner(
  modelId: string,
  providers: Record<string, ProviderState>,
): string | null {
  return resolveSelectionOwner(modelId, providers);
}

/** Step 0 — explicit provider prefix (`nvidia/...`, `deepseek/...`). */
function tryExplicitProviderPrefix(
  modelId: string,
  providers: Record<string, ProviderState>,
): string | null {
  const explicit = stripProviderModelPrefix(modelId).providerId;
  return explicit && providers[explicit]?.apiKey ? explicit : null;
}

/** Step 2 — namespace exclusivity (`nvidia/*` and `deepseek/...`). */
function tryNamespaceExclusivity(
  modelId: string,
  providers: Record<string, ProviderState>,
): string | null {
  const { modelId: rawModelId } = stripProviderModelPrefix(modelId);
  const isDeepSeekId = DEEPSEEK_PLAIN_IDS.has(rawModelId);
  if (isDeepSeekId && providers['deepseek']?.apiKey) {
    return 'deepseek';
  }
  return null;
}

/** Step 3 — catalogue membership (fetched NVIDIA / DeepSeek / custom). */
function tryCatalogMembership(
  modelId: string,
  providers: Record<string, ProviderState>,
  ctx: ProviderResolutionContext,
): string | null {
  const { modelId: rawModelId } = stripProviderModelPrefix(modelId);
  if (ctx.nvidiaCatalog?.has(rawModelId) && providers['nvidia']?.apiKey) {
    return 'nvidia';
  }
  if (ctx.deepseekCatalog?.has(rawModelId) && providers['deepseek']?.apiKey) {
    return 'deepseek';
  }
  if (ctx.customCatalog) {
    for (const [customId, models] of Object.entries(ctx.customCatalog)) {
      if (models.has(rawModelId) && providers[customId]?.apiKey) {
        return customId;
      }
    }
  }
  return null;
}

/** Step 4 — listing context (per-row providerId from preset tagging). */
function tryListingContext(
  providers: Record<string, ProviderState>,
  ctx: ProviderResolutionContext,
): string | null {
  if (ctx.listingProviderId && providers[ctx.listingProviderId]?.apiKey) {
    return ctx.listingProviderId;
  }
  return null;
}

/** Step 5a — author/slug with active-provider disambiguation. */
function tryAuthorSlugHint(
  modelId: string,
  providers: Record<string, ProviderState>,
  ctx: ProviderResolutionContext,
): string | null {
  if (!modelId.includes('/')) return null;
  if (
    ctx.activeProviderId &&
    ctx.activeProviderId !== 'openrouter' &&
    ctx.activeProviderId !== 'deepseek' &&
    providers[ctx.activeProviderId]?.apiKey
  ) {
    return ctx.activeProviderId;
  }
  if (providers['openrouter']?.apiKey) return 'openrouter';
  if (providers['nvidia']?.apiKey) return 'nvidia';
  return null;
}

/** Step 5b — plain-id active-provider hint. */
function tryPlainIdHint(
  modelId: string,
  providers: Record<string, ProviderState>,
  ctx: ProviderResolutionContext,
): string | null {
  if (modelId.includes('/')) return null;
  if (ctx.activeProviderId && providers[ctx.activeProviderId]?.apiKey) {
    return ctx.activeProviderId;
  }
  return null;
}

/**
 * Routed provider id for a model id based on the user's configured
 * providers + resolution context (active id, listing hint, fetched
 * catalogs).  Each step is implemented as a small helper function
 * (kept complexity-friendly) and chained in priority order:
 *
 *  1. Selection-owner — a model uniquely bound to one provider's
 *     `modelSelections` wins unconditionally. This is the user's
 *     explicit choice.
 *  2. Namespace exclusivity — `nvidia/*` → NVIDIA when configured.
 *     Plain `deepseek-*` ids and `deepseek/*` → DeepSeek when
 *     configured (OpenRouter may still host these via `:nitro` etc.
 *     but with a different model id suffix; treat plain namespace as
 *     DeepSeek-direct).
 *  3. Catalogue membership — if the model id appears in the fetched
 *     NVIDIA / DeepSeek / custom catalogue for a configured
 *     provider, that provider wins. This is the strongest signal
 *     for shared `author/slug` namespaces like `moonshotai/*`.
 *  4. Listing context — if the caller knows which catalogue they're
 *     rendering (per-row `providerId` from `PRESET_MODELS` etc.) and
 *     that provider has a key, use it. This handles the Models tab
 *     injecting NVIDIA models into the OpenRouter preset list.
 *  5. Active provider hint (weak) — author/slug falls to
 *     non-default active provider (NVIDIA or custom) when
 *     configured, then OpenRouter, then NVIDIA. Plain ids fall to
 *     the configured active provider.
 *  6. Any configured built-in.
 */
export function getProviderForModel(
  modelId: string,
  providers: Record<string, ProviderState>,
  context?: string | ProviderResolutionContext,
): string | null {
  if (!modelId || modelId === 'custom') return null;
  const ctx = toContext(context);

  return (
    tryExplicitProviderPrefix(modelId, providers) ??
    trySelectionOwner(modelId, providers) ??
    tryNamespaceExclusivity(modelId, providers) ??
    tryCatalogMembership(modelId, providers, ctx) ??
    tryListingContext(providers, ctx) ??
    tryAuthorSlugHint(modelId, providers, ctx) ??
    tryPlainIdHint(modelId, providers, ctx) ??
    firstConfiguredProvider(providers)
  );
}

/** Get API credentials for a given model ID. */
export function getModelCredentials(
  modelId: string,
  providers: Record<string, ProviderState>,
  context?: string | ProviderResolutionContext,
): { apiKey: string; baseUrl: string; providerId: string; modelId: string } | null {
  const providerId = getProviderForModel(modelId, providers, context);
  if (!providerId) return null;
  const provider = providers[providerId];
  if (!provider?.apiKey) return null;
  return {
    apiKey: provider.apiKey,
    baseUrl: provider.config.baseUrl,
    providerId,
    modelId: stripProviderModelPrefix(modelId).modelId,
  };
}

/**
 * Resolve the active base URL for a given provider id with a fallback.
 * Useful for code paths that have only a `providerId` (no full
 * provider state) — e.g. health-check calls.
 */
export function getBaseUrlForProvider(
  providerId: string,
  providers: Record<string, ProviderState>,
): string | null {
  const provider = providers[providerId];
  if (provider?.config?.baseUrl) return provider.config.baseUrl;
  return PROVIDER_BASE_URLS[providerId] ?? null;
}

/**
 * Returns a short, human-readable badge label for a model id given
 * the user's currently-configured providers and resolution context.
 */
export function getProviderLabelForModel(
  modelId: string,
  providers: Record<string, ProviderState>,
  context?: string | ProviderResolutionContext,
): string {
  if (!modelId || modelId === 'custom') return '';
  const resolvedId = getProviderForModel(modelId, providers, context);
  if (resolvedId) {
    const provider = providers[resolvedId];
    if (provider?.config?.name) return abbreviate(provider.config.name);
  }
  const { providerId: explicitProviderId, modelId: rawModelId } =
    stripProviderModelPrefix(modelId);
  if (explicitProviderId === 'nvidia') return 'NVIDIA NIM';
  if (explicitProviderId === 'deepseek') return 'DeepSeek';
  if (rawModelId.startsWith('deepseek-')) {
    return 'DeepSeek';
  }
  if (modelId.includes('/')) return 'OpenRouter';
  return '';
}

function abbreviate(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 18) return trimmed;
  return `${trimmed.slice(0, 16)}\u2026`;
}

export function createDefaultProviderState(
  config: ProviderConfig,
): ProviderState {
  let defaultModel = DEFAULT_MODEL;
  if (config.id === 'deepseek') {
    defaultModel = 'deepseek/deepseek-v4-flash';
  } else if (config.id === 'nvidia') {
    // NVIDIA has no canonical default — leave empty so users must
    // pick a model (or paste a custom id like
    // `moonshotai/kimi-k2.6`).
    defaultModel = '';
  }
  return {
    config,
    apiKey: '',
    keyStatus: 'untested',
    keyLastTestedAt: null,
    modelSelections: {
      model: defaultModel,
      markingModel: defaultModel,
      useSeparateMarkingModel: false,
      imageMarkingModel: defaultModel,
      useSeparateImageMarkingModel: false,
      tutorModel: defaultModel,
    },
  };
}
