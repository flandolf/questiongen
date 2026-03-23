use crate::models::{AppError, CommandResult};
use reqwest::header::AUTHORIZATION;
use serde::{Deserialize, Serialize};
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const OPENROUTER_BASE: &str = "https://openrouter.ai/api/v1";

// ─── Response types ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStats {
    pub tps_p50: Option<f64>,
    pub prompt_price_per_token: Option<f64>,
    pub completion_price_per_token: Option<f64>,
    pub context_length: Option<u64>,
    pub supports_structured_output: bool,
    pub name: Option<String>,
    pub latency_p50: Option<f64>,
    pub uptime_last_30m: Option<f64>,
    /// Derived from `architecture.input_modalities` in the /api/v1/models catalogue.
    pub supports_images: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditsInfo {
    pub total_credits: f64,
    pub total_usage: f64,
    pub remaining: f64,
}

// ─── Stats cache (per api_key:model_id) ───────────────────────────────────────

const STATS_CACHE_TTL_SECS: u64 = 60 * 15; // 15 minutes

static STATS_CACHE: Lazy<Mutex<HashMap<String, (ModelStats, u64)>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// ─── Models catalogue cache ───────────────────────────────────────────────────
//
// Keyed by api_key. Maps model_id → supports_images.
// We fetch /api/v1/models once and cache the whole map so every subsequent
// get_model_stats call resolves image support with a simple HashMap lookup
// rather than another network round-trip.

const CATALOGUE_CACHE_TTL_SECS: u64 = 60 * 30; // 30 minutes

struct CatalogueCache {
    /// model_id → supports_images
    map: HashMap<String, bool>,
    fetched_at: u64,
}

static CATALOGUE_CACHE: Lazy<Mutex<HashMap<String, CatalogueCache>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// ─── Wire types: /models/{author}/{slug}/endpoints ────────────────────────────

#[derive(Debug, Deserialize)]
struct EndpointsResponse {
    data: EndpointsData,
}

#[derive(Debug, Deserialize)]
struct EndpointsData {
    name: Option<String>,
    endpoints: Vec<Endpoint>,
}

#[derive(Debug, Deserialize)]
struct Endpoint {
    pricing: Option<Pricing>,
    context_length: Option<u64>,
    supported_parameters: Option<Vec<String>>,
    throughput_last_30m: Option<ThroughputStats>,
    latency_last_30m: Option<LatencyStats>,
    uptime_last_30m: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct Pricing {
    prompt: Option<String>,
    completion: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ThroughputStats {
    p50: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct LatencyStats {
    p50: Option<f64>,
}

// ─── Wire types: GET /api/v1/models ──────────────────────────────────────────
//
// This is the canonical source for `architecture.input_modalities`.
// The /endpoints response does NOT carry modality data — its
// `supported_parameters` only lists API parameters like `response_format`,
// `tools`, `temperature`, etc.

#[derive(Debug, Deserialize)]
struct ModelsListResponse {
    data: Vec<ModelListEntry>,
}

#[derive(Debug, Deserialize)]
struct ModelListEntry {
    id: String,
    architecture: Option<ModelArchitecture>,
}

#[derive(Debug, Deserialize)]
struct ModelArchitecture {
    /// e.g. ["text", "image"] — the canonical vision support signal.
    input_modalities: Option<Vec<String>>,
}

// ─── Wire types: /credits ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct CreditsResponse {
    data: CreditsData,
}

#[derive(Debug, Deserialize)]
struct CreditsData {
    total_credits: f64,
    total_usage: f64,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn split_model_id(model_id: &str) -> CommandResult<(&str, &str)> {
    model_id.split_once('/').ok_or_else(|| {
        AppError::new(
            "VALIDATION_ERROR",
            format!("Model ID '{model_id}' must be in 'author/slug' format."),
        )
    })
}

fn parse_price(s: Option<&String>) -> Option<f64> {
    s?.parse::<f64>().ok()
}

/// True if any of the input_modalities strings indicate image/vision support.
fn modalities_include_image(modalities: &[String]) -> bool {
    modalities
        .iter()
        .any(|m| m.eq_ignore_ascii_case("image") || m.eq_ignore_ascii_case("vision"))
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

// ─── Catalogue fetch / cache ──────────────────────────────────────────────────

/// Look up image support for `model_id` from the in-memory catalogue cache.
/// Returns `None` if the cache is absent or stale (caller should re-fetch).
fn catalogue_lookup(api_key: &str, model_id: &str) -> Option<bool> {
    let cache = CATALOGUE_CACHE.lock().ok()?;
    let entry = cache.get(api_key)?;
    if now_secs().saturating_sub(entry.fetched_at) > CATALOGUE_CACHE_TTL_SECS {
        return None; // stale — let caller trigger a refresh
    }
    // A missing key means the model wasn't in the catalogue (unknown → false).
    Some(entry.map.get(model_id).copied().unwrap_or(false))
}

/// Fetch `GET /api/v1/models`, build a model_id → supports_images map, store
/// it in the catalogue cache, and return the image-support value for `model_id`.
async fn fetch_catalogue_and_lookup(
    client: &reqwest::Client,
    api_key: &str,
    model_id: &str,
) -> bool {
    let url = format!("{OPENROUTER_BASE}/models");

    let resp = match client
        .get(&url)
        .header(AUTHORIZATION, format!("Bearer {api_key}"))
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => r,
        _ => return false,
    };

    let parsed: ModelsListResponse = match resp.json().await {
        Ok(p) => p,
        Err(_) => return false,
    };

    let mut map: HashMap<String, bool> = HashMap::with_capacity(parsed.data.len());
    for entry in &parsed.data {
        let supports = entry
            .architecture
            .as_ref()
            .and_then(|a| a.input_modalities.as_deref())
            .map(modalities_include_image)
            .unwrap_or(false);
        map.insert(entry.id.clone(), supports);
    }

    let result = map.get(model_id).copied().unwrap_or(false);

    if let Ok(mut cache) = CATALOGUE_CACHE.lock() {
        cache.insert(
            api_key.to_string(),
            CatalogueCache {
                map,
                fetched_at: now_secs(),
            },
        );
    }

    result
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

/// Fetch TPS, pricing, context length, latency, uptime, structured-output
/// support, and image/vision support for the given model.
///
/// Vision support is resolved from `architecture.input_modalities` in the
/// `/api/v1/models` catalogue — the only API that carries this data.
/// The catalogue is fetched once and cached for 30 minutes; the per-model
/// stats result is cached separately for 15 minutes.
///
/// On the first call (cold catalogue cache) the endpoints request and the
/// catalogue fetch run in parallel via `tokio::join!` so there is no
/// sequential latency penalty.
#[tauri::command]
pub async fn get_model_stats(api_key: String, model_id: String) -> CommandResult<ModelStats> {
    if api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "API key required."));
    }
    if model_id.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model ID required."));
    }

    // ── Stats cache hit ───────────────────────────────────────────────────────
    let cache_key = format!("{}:{}", api_key.trim(), model_id.trim());
    if let Ok(cache) = STATS_CACHE.lock() {
        if let Some((cached, ts)) = cache.get(&cache_key) {
            if now_secs().saturating_sub(*ts) <= STATS_CACHE_TTL_SECS {
                return Ok(cached.clone());
            }
        }
    }

    let (author, slug) = split_model_id(model_id.trim())?;
    let endpoints_url = format!("{OPENROUTER_BASE}/models/{author}/{slug}/endpoints");
    let client = reqwest::Client::new();

    // ── Resolve image support ─────────────────────────────────────────────────
    // Try the catalogue cache first (no I/O). On a miss, run both fetches in
    // parallel so we don't serialise two network calls.
    let (endpoints_res, image_support) =
        match catalogue_lookup(api_key.trim(), model_id.trim()) {
            Some(cached_support) => {
                // Catalogue cache hit — only need the endpoints call.
                let ep = client
                    .get(&endpoints_url)
                    .header(AUTHORIZATION, format!("Bearer {api_key}"))
                    .send()
                    .await;
                (ep, cached_support)
            }
            None => {
                // Catalogue cache miss — fetch both in parallel.
                let (ep, img) = tokio::join!(
                    client
                        .get(&endpoints_url)
                        .header(AUTHORIZATION, format!("Bearer {api_key}"))
                        .send(),
                    fetch_catalogue_and_lookup(&client, api_key.trim(), model_id.trim()),
                );
                (ep, img)
            }
        };

    // ── Parse endpoints response ──────────────────────────────────────────────
    let endpoints_resp = endpoints_res
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Request failed: {e}")))?;

    if !endpoints_resp.status().is_success() {
        let status = endpoints_resp.status();
        let body = endpoints_resp.text().await.unwrap_or_default();
        return Err(AppError::new(
            "OPENROUTER_ERROR",
            format!("OpenRouter returned {status}: {body}"),
        ));
    }

    let endpoints_parsed: EndpointsResponse = endpoints_resp
        .json()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Invalid response: {e}")))?;

    let data = endpoints_parsed.data;

    // ── Aggregate endpoint metrics ────────────────────────────────────────────
    let mut best_tps: Option<f64> = None;
    let mut best_prompt_price: Option<f64> = None;
    let mut best_completion_price: Option<f64> = None;
    let mut context_length: Option<u64> = None;
    let mut supports_structured = false;
    let mut best_latency: Option<f64> = None;
    let mut best_uptime: Option<f64> = None;

    for ep in &data.endpoints {
        if let Some(tps) = ep.throughput_last_30m.as_ref().and_then(|t| t.p50) {
            best_tps = Some(best_tps.map_or(tps, |prev: f64| prev.max(tps)));
        }

        let prompt_price = parse_price(ep.pricing.as_ref().and_then(|p| p.prompt.as_ref()));
        let completion_price =
            parse_price(ep.pricing.as_ref().and_then(|p| p.completion.as_ref()));
        if let Some(pp) = prompt_price {
            if best_prompt_price.map_or(true, |prev: f64| pp < prev) {
                best_prompt_price = Some(pp);
                best_completion_price = completion_price;
            }
        }

        if let Some(ctx) = ep.context_length {
            context_length = Some(context_length.map_or(ctx, |prev: u64| prev.max(ctx)));
        }

        if ep
            .supported_parameters
            .as_deref()
            .map_or(false, |params| params.iter().any(|p| p == "response_format"))
        {
            supports_structured = true;
        }

        if let Some(lat) = ep.latency_last_30m.as_ref().and_then(|l| l.p50) {
            best_latency = Some(best_latency.map_or(lat, |prev: f64| prev.min(lat)));
        }

        if let Some(up) = ep.uptime_last_30m {
            best_uptime = Some(best_uptime.map_or(up, |prev: f64| prev.max(up)));
        }
    }

    let result = ModelStats {
        tps_p50: best_tps,
        prompt_price_per_token: best_prompt_price,
        completion_price_per_token: best_completion_price,
        context_length,
        supports_structured_output: supports_structured,
        name: data.name,
        latency_p50: best_latency,
        uptime_last_30m: best_uptime,
        supports_images: image_support,
    };

    // ── Cache result ──────────────────────────────────────────────────────────
    if let Ok(mut cache) = STATS_CACHE.lock() {
        cache.insert(cache_key, (result.clone(), now_secs()));
    }

    Ok(result)
}

#[tauri::command]
pub async fn get_credits(api_key: String) -> CommandResult<CreditsInfo> {
    if api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "API key required."));
    }

    let response = reqwest::Client::new()
        .get(format!("{OPENROUTER_BASE}/credits"))
        .header(AUTHORIZATION, format!("Bearer {api_key}"))
        .send()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Request failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::new(
            "OPENROUTER_ERROR",
            format!("OpenRouter returned {status}: {body}"),
        ));
    }

    let parsed: CreditsResponse = response
        .json()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Invalid response: {e}")))?;

    let d = parsed.data;
    Ok(CreditsInfo {
        total_credits: d.total_credits,
        total_usage: d.total_usage,
        remaining: d.total_credits - d.total_usage,
    })
}

pub fn compute_generation_cost(
    prompt_tokens: Option<u64>,
    completion_tokens: Option<u64>,
    prompt_price_per_token: Option<f64>,
    completion_price_per_token: Option<f64>,
) -> Option<f64> {
    let mut total_cost = 0f64;
    let mut has_cost = false;

    if let (Some(price), Some(tokens)) = (prompt_price_per_token, prompt_tokens) {
        total_cost += price * tokens as f64;
        has_cost = true;
    }

    if let (Some(price), Some(tokens)) = (completion_price_per_token, completion_tokens) {
        total_cost += price * tokens as f64;
        has_cost = true;
    }

    has_cost.then_some(total_cost)
}