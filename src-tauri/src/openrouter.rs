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
    pub plugins: serde_json::Value,
    pub stream: bool,
    pub app: Option<tauri::AppHandle>,
}

impl OpenRouterRequestConfig {
    pub fn new(
        api_key: &str,
        model: &str,
        system_prompt: &str,
        user_content: serde_json::Value,
        response_format: serde_json::Value,
        max_tokens: u32,
    ) -> Self {
        Self {
            api_key: api_key.to_string(),
            model: model.to_string(),
            system_prompt: system_prompt.to_string(),
            user_content,
            response_format,
            max_tokens,
            plugins: serde_json::json!([{ "id": "response-healing" }]),
            stream: false,
            app: None,
        }
    }

    pub fn with_plugins(mut self, plugins: serde_json::Value) -> Self {
        self.plugins = plugins;
        self
    }

    pub fn with_stream(mut self, app: tauri::AppHandle) -> Self {
        self.stream = true;
        self.app = Some(app);
        self
    }
}

/// Result of a single OpenRouter call: raw content string + token usage.
pub struct OpenRouterResult {
    pub content: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// Unified OpenRouter caller.
pub async fn call_openrouter(config: OpenRouterRequestConfig) -> CommandResult<OpenRouterResult> {
    if config.stream {
        call_openrouter_streaming(config).await
    } else {
        call_openrouter_non_streaming(config).await
    }
}

async fn call_openrouter_non_streaming(
    config: OpenRouterRequestConfig,
) -> CommandResult<OpenRouterResult> {
    let mut system_prompt = config.system_prompt.clone();
    if is_anthropic_model(&config.model) {
        system_prompt.push_str("\n\nIMPORTANT: You are in a strict JSON-only mode. Output ONLY the raw JSON object. Do NOT include any preamble, commentary, or markdown fences. Start your response with '{' and end with '}'.");
    }

    let body = serde_json::json!({
        "model": config.model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user",   "content": config.user_content  },
        ],
        "max_tokens": config.max_tokens,
        "response_format": config.response_format,
        "plugins": config.plugins,
    });

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

async fn call_openrouter_streaming(
    config: OpenRouterRequestConfig,
) -> CommandResult<OpenRouterResult> {
    let mut system_prompt = config.system_prompt.clone();
    if is_anthropic_model(&config.model) {
        system_prompt.push_str("\n\nIMPORTANT: You are in a strict JSON-only mode. Output ONLY the raw JSON object. Do NOT include any preamble, commentary, or markdown fences. Start your response with '{' and end with '}'.");
    }

    let body = serde_json::json!({
        "model": config.model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user",   "content": config.user_content  },
        ],
        "max_tokens": config.max_tokens,
        "response_format": config.response_format,
        "plugins": config.plugins,
        "stream": true,
        "stream_options": { "include_usage": true },
    });

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
                        Err(_) => continue,
                    };

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

    let (pt, ct, tt) = usage
        .map(|u| (u.prompt_tokens, u.completion_tokens, u.total_tokens))
        .unwrap_or((0, 0, 0));

    Ok(OpenRouterResult {
        content: assembled,
        prompt_tokens: pt,
        completion_tokens: ct,
        total_tokens: tt,
    })
}

pub fn is_anthropic_model(model: &str) -> bool {
    let model = model.trim().to_ascii_lowercase();
    model.starts_with("anthropic/")
        || model.starts_with("claude")
        || model
            .split('/')
            .nth(1)
            .is_some_and(|id| id.starts_with("claude"))
}

fn strip_integer_constraints(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            if map.get("type").and_then(|v| v.as_str()) == Some("integer") {
                map.remove("minimum");
                map.remove("maximum");
            }
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

fn strip_anthropic_array_constraints(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            if map.get("type").and_then(|v| v.as_str()) == Some("array") {
                map.remove("minItems");
                map.remove("maxItems");
            }
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
