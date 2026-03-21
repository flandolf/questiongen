use crate::models::{AppError, CommandResult};
use reqwest::header::AUTHORIZATION;
use serde::{Deserialize, Serialize};

const OPENROUTER_BASE: &str = "https://openrouter.ai/api/v1";

// ─── Response types ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStats {
    /// Median tokens per second across providers (p50 throughput).
    pub tps_p50: Option<f64>,
    /// Input price in USD per token.
    pub prompt_price_per_token: Option<f64>,
    /// Output price in USD per token.
    pub completion_price_per_token: Option<f64>,
    /// Context window in tokens.
    pub context_length: Option<u64>,
    /// Whether the model supports structured output (`response_format: json_schema`).
    pub supports_structured_output: bool,
    /// Human-readable model name.
    pub name: Option<String>,
    /// p50 latency to first token in seconds.
    pub latency_p50: Option<f64>,
    /// Uptime percentage over the last 30 minutes.
    pub uptime_last_30m: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditsInfo {
    /// Total credits purchased (USD).
    pub total_credits: f64,
    /// Total credits consumed (USD).
    pub total_usage: f64,
    /// Remaining credits (total_credits - total_usage).
    pub remaining: f64,
}

// ─── Internal API wire types (not exposed to frontend) ────────────────────────

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

/// Split `"author/slug"` into `("author", "slug")`.
/// Handles models with extra path segments by splitting on the first `/` only.
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

// ─── Tauri commands ───────────────────────────────────────────────────────────

/// Fetch TPS, pricing, context length, latency, uptime, and structured-output
/// support for the given model in a single API call.
#[tauri::command]
pub async fn get_model_stats(api_key: String, model_id: String) -> CommandResult<ModelStats> {
    if api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "API key required."));
    }
    if model_id.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model ID required."));
    }

    let (author, slug) = split_model_id(model_id.trim())?;
    let url = format!("{OPENROUTER_BASE}/models/{author}/{slug}/endpoints");

    let response = reqwest::Client::new()
        .get(&url)
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

    let parsed: EndpointsResponse = response
        .json()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Invalid response: {e}")))?;

    let data = parsed.data;

    // Aggregate across all endpoints: take the best (highest) p50 TPS,
    // and the lowest prompt price (most cost-effective provider).
    let mut best_tps: Option<f64> = None;
    let mut best_prompt_price: Option<f64> = None;
    let mut best_completion_price: Option<f64> = None;
    let mut context_length: Option<u64> = None;
    let mut supports_structured = false;
    let mut best_latency: Option<f64> = None;
    let mut best_uptime: Option<f64> = None;

    for ep in &data.endpoints {
        // TPS — higher is better
        if let Some(tps) = ep.throughput_last_30m.as_ref().and_then(|t| t.p50) {
            best_tps = Some(best_tps.map_or(tps, |prev: f64| prev.max(tps)));
        }

        // Pricing — lower is better; use lowest prompt price as the lead
        let prompt_price = parse_price(ep.pricing.as_ref().and_then(|p| p.prompt.as_ref()));
        let completion_price = parse_price(ep.pricing.as_ref().and_then(|p| p.completion.as_ref()));
        if let Some(pp) = prompt_price {
            if best_prompt_price.map_or(true, |prev: f64| pp < prev) {
                best_prompt_price = Some(pp);
                best_completion_price = completion_price;
            }
        }

        // Context length — take the largest available
        if let Some(ctx) = ep.context_length {
            context_length = Some(context_length.map_or(ctx, |prev: u64| prev.max(ctx)));
        }

        // Structured output support
        if ep.supported_parameters.as_deref().map_or(false, |params| {
            params.iter().any(|p| p == "response_format")
        }) {
            supports_structured = true;
        }

        // Latency p50 — lower is better
        if let Some(lat) = ep.latency_last_30m.as_ref().and_then(|l| l.p50) {
            best_latency = Some(best_latency.map_or(lat, |prev: f64| prev.min(lat)));
        }

        // Uptime — take the highest
        if let Some(up) = ep.uptime_last_30m {
            best_uptime = Some(best_uptime.map_or(up, |prev: f64| prev.max(up)));
        }
    }

    Ok(ModelStats {
        tps_p50: best_tps,
        prompt_price_per_token: best_prompt_price,
        completion_price_per_token: best_completion_price,
        context_length,
        supports_structured_output: supports_structured,
        name: data.name,
        latency_p50: best_latency,
        uptime_last_30m: best_uptime,
    })
}

/// Fetch total credits purchased, used, and remaining for the authenticated key.
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

/// Compute the estimated USD cost of a generation call.
///
/// Returns `None` if either token count or either price is unavailable.
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
