use crate::deepseek_info::list_deepseek_models;
use crate::http_client::get_json;
use crate::models::{AppError, CommandResult};
use crate::nvidia_info::list_nvidia_models;
use crate::openrouter_info::{get_model_stats, ModelStats};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

// ─── Shared catalogue type returned to the frontend ──────────────────────────
//
// `name` and `supportsImages` are best-effort. The frontend already
// supports `null`/`undefined` for these fields, so it's safe to leave
// them absent when the upstream provider doesn't expose them (custom
// endpoints, for example).

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModelEntry {
    pub id: String,
    pub name: Option<String>,
    pub context_length: Option<u64>,
    /// `true` ⇒ model accepts image inputs (vision). For NVIDIA + custom
    /// providers this is a heuristic; OpenRouter resolves from
    /// `architecture.input_modalities`. DeepSeek direct is text-only.
    pub supports_images: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModelList {
    pub provider_id: String,
    pub data: Vec<ProviderModelEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModelStats {
    pub provider_id: String,
    pub stats: ModelStats,
}

// ─── Provider-id resolution ───────────────────────────────────────────────────
//
// `providerId` is the frontend's authoritative identifier — for built-ins
// it matches `BUILTIN_PROVIDERS`, for custom providers it matches the
// `custom-<uuid>` pattern stored on disk. The frontend passes its
// current `baseUrl` so we can route to the right endpoint without
// trusting id strings alone (a custom provider can technically spoof
// any id).

#[derive(Debug, Clone)]
pub enum ProviderKind {
    OpenRouter,
    DeepSeek,
    Nvidia,
    Custom { base_url: String },
}

const OPENROUTER_BASE: &str = "https://openrouter.ai/api/v1";
const DEEPSEEK_BASE: &str = "https://api.deepseek.com/v1";
const NVIDIA_BASE: &str = "https://integrate.api.nvidia.com/v1";

pub fn classify_provider(provider_id: &str, base_url: Option<&str>) -> ProviderKind {
    match provider_id {
        "openrouter" => ProviderKind::OpenRouter,
        "deepseek" => ProviderKind::DeepSeek,
        "nvidia" => ProviderKind::Nvidia,
        _ => ProviderKind::Custom {
            base_url: normalize_base_url(base_url).unwrap_or_default(),
        },
    }
}

fn normalize_base_url(base_url: Option<&str>) -> Option<String> {
    base_url
        .map(|s| s.trim().trim_end_matches('/').to_string())
        .filter(|s| !s.is_empty())
}

fn base_url_matches(haystack: &str, needle: &str) -> bool {
    let h = haystack.trim().trim_end_matches('/');
    let n = needle.trim().trim_end_matches('/');
    h == n || h.starts_with(n) || n.starts_with(h)
}

pub fn classify_from_base_url(provider_id: &str, base_url: Option<&str>) -> ProviderKind {
    if let Some(url) = normalize_base_url(base_url) {
        if base_url_matches(&url, OPENROUTER_BASE) {
            return ProviderKind::OpenRouter;
        }
        if base_url_matches(&url, DEEPSEEK_BASE) {
            return ProviderKind::DeepSeek;
        }
        if base_url_matches(&url, NVIDIA_BASE) {
            return ProviderKind::Nvidia;
        }
        let _ = provider_id;
        return ProviderKind::Custom { base_url: url };
    }
    classify_provider(provider_id, None)
}

// ─── Cache for custom-provider model lists ────────────────────────────────────
//
// OpenRouter / DeepSeek / NVIDIA each manage their own cache. We add a
// short-lived cache here for custom endpoints so repeated pupil-do
// catalogues don't hammer the user's LLM server. 15 minutes keeps
// provider churn (adding/removing models) visible within a session.

const CUSTOM_CACHE_TTL_SECS: u64 = 60 * 15;

#[derive(Debug, Clone)]
struct CustomCacheEntry {
    list: ProviderModelList,
    fetched_at: u64,
}

static CUSTOM_CACHE: Lazy<Mutex<HashMap<String, CustomCacheEntry>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn custom_cache_get(base_url: &str) -> Option<ProviderModelList> {
    let cache = CUSTOM_CACHE.lock().ok()?;
    let entry = cache.get(base_url)?;
    if now_secs().saturating_sub(entry.fetched_at) <= CUSTOM_CACHE_TTL_SECS {
        Some(entry.list.clone())
    } else {
        None
    }
}

fn custom_cache_put(base_url: &str, list: ProviderModelList) {
    if let Ok(mut cache) = CUSTOM_CACHE.lock() {
        cache.insert(
            base_url.to_string(),
            CustomCacheEntry {
                list,
                fetched_at: now_secs(),
            },
        );
    }
}

// ─── Generic list parser ─────────────────────────────────────────────────────
//
// OpenAI-compatible `/v1/models` shape:
//
//     { "object": "list", "data": [ { "id": "...", "owned_by": "..." }, … ] }
//
// We tolerate missing `owned_by` (some providers simply omit it) and
// ignore any other fields we don't care about.

#[derive(Debug, Deserialize)]
struct GenericModelsResponse {
    data: Vec<GenericModelsEntry>,
}

#[derive(Debug, Deserialize)]
struct GenericModelsEntry {
    id: String,
    #[serde(default)]
    owned_by: Option<String>,
}

fn parse_generic(raw: &GenericModelsResponse) -> Vec<ProviderModelEntry> {
    raw.data
        .iter()
        .map(|m| ProviderModelEntry {
            id: m.id.clone(),
            name: m.owned_by.as_ref().and_then(|o| {
                if o.is_empty() {
                    None
                } else {
                    Some(format!("{o} {}", m.id))
                }
            }),
            context_length: None,
            supports_images: false,
        })
        .collect()
}

// ─── Stats thunks for non-OpenRouter providers ────────────────────────────────
//
// NVIDIA and custom endpoints don't expose the rich stats
// (`tps`, `pricing`, `endpoints`) that OpenRouter does. The Live
// Stats table relies on per-model stats, so we synthesize a
// "best-effort minimal" result: name from the supplied id, all
// metrics null. Vision support comes from the catalogue; users
// can still see throughput for OpenRouter-routed models.

fn empty_stats(model_id: &str, supports_images: bool, name: Option<String>) -> ModelStats {
    ModelStats {
        tps_p50: None,
        prompt_price_per_token: None,
        completion_price_per_token: None,
        context_length: None,
        supports_structured_output: true,
        name: name.or_else(|| Some(model_id.to_string())),
        latency_p50: None,
        uptime_last_30m: None,
        supports_images,
        supports_files: false,
    }
}

// ─── Tauri command surface ────────────────────────────────────────────────────

/// List models for a provider. Dispatched by `provider_id` and an
/// optional `base_url`. Built-ins hit their dedicated upstream
/// (`deepseek_info`, `nvidia_info`, `openrouter_info`). Custom
/// providers hit `<base>/models` and parse the OpenAI-compatible
/// shape.
#[tauri::command]
pub async fn list_provider_models(
    provider_id: String,
    api_key: String,
    base_url: Option<String>,
) -> CommandResult<ProviderModelList> {
    if api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "API key required."));
    }

    let kind = classify_from_base_url(&provider_id, base_url.as_deref());

    match kind {
        ProviderKind::OpenRouter => {
            let raw = list_openrouter_models_typed(&api_key).await?;
            Ok(ProviderModelList {
                provider_id,
                data: raw,
            })
        }
        ProviderKind::DeepSeek => {
            let raw = list_deepseek_models(api_key).await?;
            let entries = raw
                .data
                .into_iter()
                .map(|m| ProviderModelEntry {
                    id: m.id,
                    name: None,
                    context_length: None,
                    supports_images: false,
                })
                .collect();
            Ok(ProviderModelList {
                provider_id,
                data: entries,
            })
        }
        ProviderKind::Nvidia => {
            let raw = list_nvidia_models(api_key).await?;
            let entries = raw
                .data
                .into_iter()
                .map(|m| ProviderModelEntry {
                    id: m.id,
                    name: m.name,
                    context_length: None,
                    supports_images: m.supports_images,
                })
                .collect();
            Ok(ProviderModelList {
                provider_id,
                data: entries,
            })
        }
        ProviderKind::Custom { base_url } => {
            if let Some(cached) = custom_cache_get(&base_url) {
                return Ok(ProviderModelList {
                    provider_id,
                    data: cached.data,
                });
            }
            let url = format!("{}/models", base_url);
            let response = get_json(&url, api_key.trim()).await?;
            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                return Err(AppError::new(
                    "PROVIDER_ERROR",
                    format!("Provider returned {status}: {body}"),
                ));
            }
            let parsed: GenericModelsResponse = match response.json().await {
                Ok(p) => p,
                Err(e) => {
                    return Err(AppError::new(
                        "PROVIDER_ERROR",
                        format!("Invalid response from {url}: {e}"),
                    ))
                }
            };
            let list = ProviderModelList {
                provider_id: provider_id.clone(),
                data: parse_generic(&parsed),
            };
            custom_cache_put(&base_url, list.clone());
            Ok(list)
        }
    }
}

/// Resolve per-provider stats for a model id. Same dispatch rules as
/// `list_provider_models`. For OpenRouter the full stats bundle comes
/// from `openrouter_info::get_model_stats`. Other providers get a
/// synthesized minimal stats record — sufficient to populate model
/// rows in the Live Stats table.
#[tauri::command]
pub async fn get_provider_model_stats(
    provider_id: String,
    api_key: String,
    base_url: Option<String>,
    model_id: String,
) -> CommandResult<ProviderModelStats> {
    if api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "API key required."));
    }
    if model_id.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model ID required."));
    }

    let kind = classify_from_base_url(&provider_id, base_url.as_deref());

    match kind {
        ProviderKind::OpenRouter => {
            let stats = get_model_stats(api_key, model_id).await?;
            Ok(ProviderModelStats { provider_id, stats })
        }
        ProviderKind::DeepSeek => {
            let supports_images = false;
            let stats = empty_stats(&model_id, supports_images, None);
            Ok(ProviderModelStats { provider_id, stats })
        }
        ProviderKind::Nvidia => {
            let supports_images = id_signals_vision(&model_id);
            let stats = empty_stats(&model_id, supports_images, None);
            Ok(ProviderModelStats { provider_id, stats })
        }
        ProviderKind::Custom { .. } => {
            // For custom providers we don't know vision support
            // without an upstream catalogue. The search panel itself
            // declared `supportsImages` so the frontend already has
            // the right value — pass `false` here (stdlib + name) and
            // let the panel render the row.
            let stats = empty_stats(&model_id, false, None);
            Ok(ProviderModelStats { provider_id, stats })
        }
    }
}

/// Validate a provider endpoints by hitting `/models` with the user's
/// key. Mirrors the cache contract used elsewhere: returns `Ok(true)`
/// on 2xx and `Ok(false)` on auth failure (401/403) so the UI can
/// surface "invalid API key" without the user needing to type
/// anything.
#[tauri::command]
pub async fn validate_provider_key(
    provider_id: String,
    api_key: String,
    base_url: Option<String>,
) -> CommandResult<bool> {
    if api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "API key required."));
    }
    let kind = classify_from_base_url(&provider_id, base_url.as_deref());
    let url = match &kind {
        ProviderKind::OpenRouter => format!("{OPENROUTER_BASE}/models"),
        ProviderKind::DeepSeek => format!("{DEEPSEEK_BASE}/models"),
        ProviderKind::Nvidia => format!("{NVIDIA_BASE}/models"),
        ProviderKind::Custom { base_url } => format!("{base_url}/models"),
    };
    let response = get_json(&url, api_key.trim()).await?;
    Ok(response.status().is_success())
}

// ─── Internal typed helper for OpenRouter ────────────────────────────────────

#[derive(Debug, Deserialize)]
struct OpenRouterModelsResponse {
    data: Vec<OpenRouterModelEntry>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterModelEntry {
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    context_length: Option<u64>,
    #[serde(default)]
    architecture: Option<OpenRouterArchitecture>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterArchitecture {
    #[serde(default)]
    input_modalities: Option<Vec<String>>,
}

fn modalities_include_image(modalities: &[String]) -> bool {
    modalities.iter().any(|m| {
        m.eq_ignore_ascii_case("image")
            || m.eq_ignore_ascii_case("vision")
            || m.eq_ignore_ascii_case("multimodal")
    })
}

async fn list_openrouter_models_typed(api_key: &str) -> CommandResult<Vec<ProviderModelEntry>> {
    let response = get_json(&format!("{OPENROUTER_BASE}/models"), api_key).await?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::new(
            "OPENROUTER_ERROR",
            format!("OpenRouter returned {status}: {body}"),
        ));
    }
    let parsed: OpenRouterModelsResponse = response
        .json()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Invalid response: {e}")))?;
    let entries = parsed
        .data
        .into_iter()
        .filter(|m| m.id.contains('/'))
        .map(|m| {
            let supports_images = m
                .architecture
                .as_ref()
                .and_then(|a| a.input_modalities.as_deref())
                .map(modalities_include_image)
                .unwrap_or(false);
            ProviderModelEntry {
                id: m.id,
                name: m.name,
                context_length: m.context_length,
                supports_images,
            }
        })
        .collect();
    Ok(entries)
}

// Helper used by `get_provider_model_stats` for NVIDIA vision
// heuristic — kept private to this module so we don't ripple a
// public symbol.
fn id_signals_vision(id: &str) -> bool {
    let lower = id.to_ascii_lowercase();
    if lower.contains("-vl-") || lower.contains("-vl:") || lower.ends_with("-vl") {
        return true;
    }
    if lower.contains("nemotron-vl") || lower.contains("vila") {
        return true;
    }
    if lower.contains("cosmos") || lower.contains("nv-grounding") {
        return true;
    }
    false
}
