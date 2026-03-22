use crate::constants::OPENROUTER_CHAT_URL;
use crate::models::{AppError, CommandResult, OpenRouterResponse};
use futures_util::StreamExt;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use tauri::Emitter;

/// Result of a single OpenRouter call: raw content string + token usage.
pub struct OpenRouterResult {
    pub content: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

// ─── Non-streaming (kept for mark_answer / analyze_image) ────────────────────

/// Make a single non-streaming OpenRouter request.
pub async fn call_openrouter(
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_content: serde_json::Value,
    response_format: &serde_json::Value,
    max_tokens: u32,
) -> CommandResult<OpenRouterResult> {
    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user",   "content": user_content  },
        ],
        "temperature": 0.5,
        "max_tokens": max_tokens,
        "response_format": response_format,
        "plugins": [{ "id": "response-healing" }],
    });

    let response = reqwest::Client::new()
        .post(OPENROUTER_CHAT_URL)
        .header(AUTHORIZATION, format!("Bearer {api_key}"))
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

/// Streaming OpenRouter request.
///
/// Emits `"generation-token"` events on `app` as each SSE token arrives:
/// ```json
/// { "text": "…delta…" }
/// ```
/// Returns the fully-assembled content plus actual token usage once complete.
/// Falls back gracefully if the provider sends no usage in the stream (counts
/// completion tokens from deltas as a rough approximation).
pub async fn call_openrouter_streaming(
    app: &tauri::AppHandle,
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_content: serde_json::Value,
    response_format: &serde_json::Value,
    max_tokens: u32,
) -> CommandResult<OpenRouterResult> {
    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user",   "content": user_content  },
        ],
        "temperature": 0.5,
        "max_tokens": max_tokens,
        "response_format": response_format,
        "plugins": [{ "id": "response-healing" }],
        "stream": true,
        // Request usage in the final stream chunk (supported by most providers).
        "stream_options": { "include_usage": true },
    });

    let http = reqwest::Client::new();
    let response = http
        .post(OPENROUTER_CHAT_URL)
        .header(AUTHORIZATION, format!("Bearer {api_key}"))
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

    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|e| AppError::new("NETWORK_ERROR", format!("Stream error: {e}")))?;
        buf.push_str(&String::from_utf8_lossy(&chunk));

        // Process every complete line we've accumulated.
        loop {
            match buf.find('\n') {
                None => break,
                Some(pos) => {
                    let line = buf[..pos].trim_end_matches('\r').to_owned();
                    buf = buf[pos + 1..].to_owned();

                    if line.is_empty() || line == ": OPENROUTER PROCESSING" {
                        continue;
                    }

                    let data = if let Some(rest) = line.strip_prefix("data: ") {
                        rest.trim()
                    } else {
                        continue;
                    };

                    if data == "[DONE]" {
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

    if assembled.is_empty() {
        return Err(AppError::new("EMPTY_RESULT", "OpenRouter returned no content."));
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
