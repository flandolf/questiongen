use crate::constants::OPENROUTER_CHAT_URL;
use crate::models::{AppError, CommandResult, OpenRouterResponse};
use futures_util::StreamExt;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use tauri::Emitter;

/// Shared HTTP client — reuses TLS context and connection pool across all requests.
pub fn http_client() -> &'static reqwest::Client {
    use std::sync::OnceLock;
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

/// Configuration for OpenRouter requests.
pub struct OpenRouterRequestConfig {
    pub api_key: String,
    pub model: String,
    pub system_prompt: String,
    pub user_content: serde_json::Value,
    pub response_format: serde_json::Value,
    pub max_tokens: u32,
    pub temperature: f32,
    pub top_p: f32,
    pub seed: Option<u64>,
    pub plugins: serde_json::Value,
    pub app: Option<tauri::AppHandle>,
}

impl OpenRouterRequestConfig {
    // pub fn new(
    //     api_key: &str,
    //     model: &str,
    //     system_prompt: &str,
    //     user_content: serde_json::Value,
    //     response_format: &serde_json::Value,
    //     max_tokens: u32,
    //     temperature: f32,
    //     top_p: f32,
    //     seed: Option<u64>,
    // ) -> Self {
    //     Self {
    //         api_key: api_key.to_string(),
    //         model: model.to_string(),
    //         system_prompt: system_prompt.to_string(),
    //         user_content,
    //         response_format: response_format.clone(),
    //         max_tokens,
    //         temperature,
    //         top_p,
    //         seed,
    //         plugins: serde_json::json!([{ "id": "response-healing" }]),
    //         app: None,
    //     }
    // }

    #[allow(clippy::too_many_arguments)]
    pub fn with_plugins(
        api_key: &str,
        model: &str,
        system_prompt: &str,
        user_content: serde_json::Value,
        response_format: &serde_json::Value,
        max_tokens: u32,
        temperature: f32,
        top_p: f32,
        seed: Option<u64>,
        plugins: serde_json::Value,
    ) -> Self {
        Self {
            api_key: api_key.to_string(),
            model: model.to_string(),
            system_prompt: system_prompt.to_string(),
            user_content,
            response_format: response_format.clone(),
            max_tokens,
            temperature,
            top_p,
            seed,
            plugins,
            app: None,
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn with_app(
        app: tauri::AppHandle,
        api_key: &str,
        model: &str,
        system_prompt: &str,
        user_content: serde_json::Value,
        response_format: &serde_json::Value,
        max_tokens: u32,
        temperature: f32,
        top_p: f32,
        seed: Option<u64>,
        plugins: serde_json::Value,
    ) -> Self {
        Self {
            api_key: api_key.to_string(),
            model: model.to_string(),
            system_prompt: system_prompt.to_string(),
            user_content,
            response_format: response_format.clone(),
            max_tokens,
            temperature,
            top_p,
            seed,
            plugins,
            app: Some(app),
        }
    }
}

/// Result of a single OpenRouter call: raw content string + token usage.
pub struct OpenRouterResult {
    pub content: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

// ─── Non-streaming (kept for mark_answer / analyze_image) ────────────────────

#[allow(clippy::too_many_arguments)]
pub async fn call_openrouter(
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_content: serde_json::Value,
    response_format: &serde_json::Value,
    max_tokens: u32,
    temperature: f32,
    top_p: f32,
    seed: Option<u64>,
) -> CommandResult<OpenRouterResult> {
    call_openrouter_with_plugins(OpenRouterRequestConfig::with_plugins(
        api_key,
        model,
        system_prompt,
        user_content,
        response_format,
        max_tokens,
        temperature,
        top_p,
        seed,
        serde_json::json!([{ "id": "response-healing" }]),
    ))
    .await
}

/// Make a single non-streaming OpenRouter request with custom plugins.
pub async fn call_openrouter_with_plugins(
    config: OpenRouterRequestConfig,
) -> CommandResult<OpenRouterResult> {
    let mut system_prompt = config.system_prompt.clone();
    if is_anthropic_model(&config.model) {
        system_prompt.push_str("\n\nIMPORTANT: You are in a strict JSON-only mode. Output ONLY the raw JSON object. Do NOT include any preamble, commentary, or markdown fences. Start your response with '{' and end with '}'.");
    }

    let mut body = serde_json::json!({
        "model": config.model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user",   "content": config.user_content  },
        ],
        "temperature": config.temperature,
        "top_p": config.top_p,
        "max_tokens": config.max_tokens,
        "response_format": config.response_format,
        "plugins": config.plugins,
    });
    if let Some(seed) = config.seed {
        body["seed"] = serde_json::json!(seed);
    }

    let response = http_client()
        .post(OPENROUTER_CHAT_URL)
        .header(AUTHORIZATION, format!("Bearer {}", config.api_key))
        .header(CONTENT_TYPE, "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Request failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".into());
        return Err(AppError::new(
            "OPENROUTER_ERROR",
            format!("OpenRouter request failed ({status}): {body}"),
        ));
    }

    let parsed: OpenRouterResponse = response
        .json()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Invalid API response: {e}")))?;

    let content = parsed
        .choices
        .first()
        .map(|c| c.message.content.clone())
        .ok_or_else(|| AppError::new("EMPTY_RESULT", "OpenRouter returned no content."))?;

    let (prompt_tokens, completion_tokens, total_tokens) = parsed
        .usage
        .map(|u| (u.prompt_tokens, u.completion_tokens, u.total_tokens))
        .unwrap_or((0, 0, 0));

    Ok(OpenRouterResult {
        content,
        prompt_tokens,
        completion_tokens,
        total_tokens,
    })
}

// ─── Streaming ────────────────────────────────────────────────────────────────

/// SSE chunk payload — only the fields we care about.
#[derive(serde::Deserialize, Debug)]
struct SseChoice {
    delta: Option<SseDelta>,
}

#[derive(serde::Deserialize, Debug)]
struct SseDelta {
    content: Option<String>,
}

#[derive(serde::Deserialize, Debug)]
struct SseChunk {
    choices: Option<Vec<SseChoice>>,
    /// Present in the final `[DONE]`-adjacent usage chunk some providers send.
    usage: Option<SseUsage>,
}

#[derive(serde::Deserialize, Debug)]
struct SseUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

/// Streaming OpenRouter request with custom plugins.
pub async fn call_openrouter_streaming_with_plugins(
    config: OpenRouterRequestConfig,
) -> CommandResult<OpenRouterResult> {
    let mut system_prompt = config.system_prompt.clone();
    if is_anthropic_model(&config.model) {
        system_prompt.push_str("\n\nIMPORTANT: You are in a strict JSON-only mode. Output ONLY the raw JSON object. Do NOT include any preamble, commentary, or markdown fences. Start your response with '{' and end with '}'.");
    }

    let mut body = serde_json::json!({
        "model": config.model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user",   "content": config.user_content  },
        ],
        "temperature": config.temperature,
        "top_p": config.top_p,
        "max_tokens": config.max_tokens,
        "response_format": config.response_format,
        "plugins": config.plugins,
        "stream": true,
        // Request usage in the final stream chunk (supported by most providers).
        "stream_options": { "include_usage": true },
    });
    if let Some(seed) = config.seed {
        body["seed"] = serde_json::json!(seed);
    }

    let response = http_client()
        .post(OPENROUTER_CHAT_URL)
        .header(AUTHORIZATION, format!("Bearer {}", config.api_key))
        .header(CONTENT_TYPE, "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Request failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".into());
        return Err(AppError::new(
            "OPENROUTER_ERROR",
            format!("OpenRouter request failed ({status}): {body}"),
        ));
    }

    let mut stream = response.bytes_stream();
    let mut assembled = String::new();
    let mut usage: Option<SseUsage> = None;
    // Rolling incomplete-line buffer (SSE lines can be split across chunks).
    let mut buf = String::new();
    let mut done = false;

    let app = config.app;

    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|e| AppError::new("NETWORK_ERROR", format!("Stream error: {e}")))?;
        buf.push_str(&String::from_utf8_lossy(&chunk));

        if done {
            continue;
        }

        // Process every complete line we've accumulated.
        loop {
            match buf.find('\n') {
                None => break,
                Some(pos) => {
                    let line = buf[..pos].trim_end_matches('\r').to_owned();
                    buf.drain(..=pos);

                    if line.is_empty() || line == ": OPENROUTER PROCESSING" {
                        continue;
                    }

                    let data = if let Some(rest) = line.strip_prefix("data: ") {
                        rest.trim()
                    } else {
                        continue;
                    };

                    if data == "[DONE]" {
                        done = true;
                        break;
                    }

                    let chunk_val: SseChunk = match serde_json::from_str(data) {
                        Ok(v) => v,
                        Err(_) => continue, // ignore malformed lines
                    };

                    // Capture usage if the provider includes it.
                    if let Some(u) = chunk_val.usage {
                        usage = Some(u);
                    }

                    // Accumulate and emit content deltas.
                    if let Some(choices) = chunk_val.choices {
                        for choice in choices {
                            if let Some(delta) = choice.delta {
                                if let Some(text) = delta.content {
                                    if !text.is_empty() {
                                        assembled.push_str(&text);
                                        if let Some(ref app) = app {
                                            let _ = app.emit(
                                                "generation-token",
                                                serde_json::json!({ "text": text }),
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Process any remaining buffered content that wasn't terminated by a newline
    if !done && !buf.is_empty() {
        let trimmed = buf.trim_end_matches('\r').to_owned();
        if let Some(rest) = trimmed.strip_prefix("data: ") {
            let data = rest.trim();
            if data != "[DONE]" {
                if let Ok(chunk_val) = serde_json::from_str::<SseChunk>(data) {
                    if let Some(u) = chunk_val.usage {
                        usage = Some(u);
                    }
                    if let Some(choices) = chunk_val.choices {
                        for choice in choices {
                            if let Some(delta) = choice.delta {
                                if let Some(text) = delta.content {
                                    if !text.is_empty() {
                                        assembled.push_str(&text);
                                        if let Some(ref app) = app {
                                            let _ = app.emit(
                                                "generation-token",
                                                serde_json::json!({ "text": text }),
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if assembled.is_empty() {
        return Err(AppError::new(
            "EMPTY_RESULT",
            "OpenRouter returned no content.",
        ));
    }

    // If the provider didn't include usage, fall back to a character-based
    // approximation (~4 chars per token) so the UI shows *something* plausible
    // instead of zero. Prompt tokens are unknown without a separate count call,
    // so we leave them at 0; the UI should show them as "unknown" rather than "$0".
    let (pt, ct, tt) = usage
        .map(|u| (u.prompt_tokens, u.completion_tokens, u.total_tokens))
        .unwrap_or_else(|| {
            let ct = (assembled.len() as u32).saturating_div(4);
            (0, ct, ct)
        });

    Ok(OpenRouterResult {
        content: assembled,
        prompt_tokens: pt,
        completion_tokens: ct,
        total_tokens: tt,
    })
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/// Check if a model is an Anthropic model.
pub fn is_anthropic_model(model: &str) -> bool {
    let model_lower = model.to_lowercase();
    model_lower.contains("anthropic") || model_lower.starts_with("claude")
}

/// Recursively strip minimum/maximum constraints from integer types in a JSON schema.
/// This is needed for Anthropic models which don't support these constraints.
fn strip_integer_constraints(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            // Remove minimum and maximum for integer types
            if map.get("type").and_then(|v| v.as_str()) == Some("integer") {
                map.remove("minimum");
                map.remove("maximum");
            }
            // Recursively process nested objects and arrays
            for (_, v) in map.iter_mut() {
                strip_integer_constraints(v);
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr.iter_mut() {
                strip_integer_constraints(v);
            }
        }
        _ => {}
    }
}

/// Recursively strip additional schema constraints that Anthropic providers may reject.
///
/// Azure-backed Anthropic endpoints can reject schemas that include richer array
/// constraints (for example `minItems` > 1) and some array-form `type` unions.
/// We already validate outputs after parsing, so keeping the transport schema more
/// permissive is safe and avoids provider-side 400 errors.
fn strip_anthropic_array_constraints(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            if map.get("type").and_then(|v| v.as_str()) == Some("array") {
                map.remove("minItems");
                map.remove("maxItems");
            }

            // Anthropic compatibility: avoid nullable/type unions encoded as arrays
            // such as { "type": ["string", "null"] }.
            if let Some(serde_json::Value::Array(type_variants)) = map.get("type") {
                if let Some(primary_type) = type_variants
                    .iter()
                    .filter_map(|v| v.as_str())
                    .find(|t| *t != "null")
                {
                    map.insert(
                        "type".to_string(),
                        serde_json::Value::String(primary_type.to_string()),
                    );
                }
            }

            // Some Anthropic providers also reject large `required` arrays when
            // strict JSON schema is enabled. We keep only single-field required
            // constraints and rely on downstream validation for completeness.
            if let Some(serde_json::Value::Array(required)) = map.get("required") {
                if required.len() > 1 {
                    map.remove("required");
                }
            }

            for (_, v) in map.iter_mut() {
                strip_anthropic_array_constraints(v);
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr.iter_mut() {
                strip_anthropic_array_constraints(v);
            }
        }
        _ => {}
    }
}

/// Build a `response_format` value for a named JSON schema.
pub fn json_schema_format(name: &'static str, schema: serde_json::Value) -> serde_json::Value {
    serde_json::json!({
        "type": "json_schema",
        "json_schema": {
            "name": name,
            "strict": true,
            "schema": schema,
        }
    })
}

/// Build a `response_format` value for a named JSON schema, stripped for Anthropic compatibility.
/// Removes minimum/maximum constraints that Anthropic models don't support.
pub fn json_schema_format_anthropic(
    name: &'static str,
    mut schema: serde_json::Value,
) -> serde_json::Value {
    strip_integer_constraints(&mut schema);
    strip_anthropic_array_constraints(&mut schema);
    serde_json::json!({
        "type": "json_schema",
        "json_schema": {
            "name": name,
            "strict": true,
            "schema": schema,
        }
    })
}