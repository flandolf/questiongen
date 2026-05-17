use crate::constants::{self, chat_completions_url};
use crate::http_client::post_json;
use crate::models::{AbortSignal, AppError, CommandResult, OpenRouterResponse};
use futures_util::StreamExt;
use tauri::Emitter;

/// Configuration for LLM API requests (OpenRouter, DeepSeek, OpenAI-compatible).
pub struct OpenRouterRequestConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub system_prompt: String,
    pub user_content: serde_json::Value,
    pub response_format: serde_json::Value,
    pub max_tokens: u32,
    pub plugins: serde_json::Value,
    pub stream: bool,
    pub app: Option<tauri::AppHandle>,
    pub topic: Option<String>,
    pub abort_signal: Option<AbortSignal>,
    pub reasoning_effort: Option<String>,
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
            base_url: constants::DEFAULT_OPENROUTER_CHAT_URL
                .trim_end_matches("/chat/completions")
                .to_string(),
            api_key: api_key.to_string(),
            model: model.to_string(),
            system_prompt: system_prompt.to_string(),
            user_content,
            response_format,
            max_tokens,
            plugins: serde_json::json!([{ "id": "response-healing" }]),
            stream: false,
            app: None,
            topic: None,
            abort_signal: None,
            reasoning_effort: None,
        }
    }

    pub fn with_base_url(mut self, base_url: &str) -> Self {
        self.base_url = base_url.to_string();
        self
    }

    pub fn with_plugins(mut self, plugins: serde_json::Value) -> Self {
        self.plugins = plugins;
        self
    }

    pub fn with_stream(mut self, app: tauri::AppHandle, topic: Option<String>) -> Self {
        self.stream = true;
        self.app = Some(app);
        self.topic = topic;
        self
    }

    pub fn with_abort_signal(mut self, abort_signal: AbortSignal) -> Self {
        self.abort_signal = Some(abort_signal);
        self
    }

    pub fn with_reasoning_effort(mut self, effort: &str) -> Self {
        self.reasoning_effort = Some(effort.to_string());
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
    let mut last_error = None;
    let max_retries = 2;

    for attempt in 0..=max_retries {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(500 * attempt as u64)).await;
        }

        let result = if config.stream {
            let retry_config = OpenRouterRequestConfig {
                base_url: config.base_url.clone(),
                api_key: config.api_key.clone(),
                model: config.model.clone(),
                system_prompt: config.system_prompt.clone(),
                user_content: config.user_content.clone(),
                response_format: config.response_format.clone(),
                max_tokens: config.max_tokens,
                plugins: config.plugins.clone(),
                stream: config.stream,
                app: config.app.clone(),
                topic: config.topic.clone(),
                abort_signal: config.abort_signal.clone(),
                reasoning_effort: config.reasoning_effort.clone(),
            };
            if attempt > 0 {
                if let Some(ref app) = retry_config.app {
                    let _ = app.emit(
                        "generation-reset",
                        serde_json::json!({ "topic": retry_config.topic }),
                    );
                }
            }
            call_openrouter_streaming(retry_config).await
        } else {
            let retry_config = OpenRouterRequestConfig {
                base_url: config.base_url.clone(),
                api_key: config.api_key.clone(),
                model: config.model.clone(),
                system_prompt: config.system_prompt.clone(),
                user_content: config.user_content.clone(),
                response_format: config.response_format.clone(),
                max_tokens: config.max_tokens,
                plugins: config.plugins.clone(),
                stream: config.stream,
                app: config.app.clone(),
                topic: config.topic.clone(),
                abort_signal: config.abort_signal.clone(),
                reasoning_effort: config.reasoning_effort.clone(),
            };
            call_openrouter_non_streaming(retry_config).await
        };

        match result {
            Ok(res) => return Ok(res),
            Err(e) => {
                // If it was aborted, don't retry
                if e.code == "ABORTED" {
                    return Err(e);
                }
                if e.is_transient() {
                    last_error = Some(e);
                    continue;
                } else {
                    return Err(e);
                }
            }
        }
    }

    Err(last_error.unwrap_or_else(|| AppError::new("UNKNOWN_ERROR", "Multiple retries failed")))
}

async fn call_openrouter_non_streaming(
    config: OpenRouterRequestConfig,
) -> CommandResult<OpenRouterResult> {
    let mut system_prompt = config.system_prompt.clone();
    system_prompt.push_str("\n\nIMPORTANT: You are in a strict JSON-only mode. Output ONLY the raw JSON object. Do NOT include any preamble, commentary, or markdown fences. Start your response with '{' and end with '}'.");

    if let Some(signal) = &config.abort_signal {
        if signal.is_aborted() {
            return Err(AppError::new("ABORTED", "Generation aborted by user"));
        }
    }

    let mut body_map = serde_json::Map::new();
    body_map.insert(
        "model".to_string(),
        serde_json::Value::String(config.model.clone()),
    );
    body_map.insert(
        "messages".to_string(),
        serde_json::json!([
            { "role": "system", "content": system_prompt },
            { "role": "user",   "content": config.user_content  },
        ]),
    );
    body_map.insert(
        "max_tokens".to_string(),
        serde_json::Value::Number(config.max_tokens.into()),
    );
    body_map.insert(
        "response_format".to_string(),
        config.response_format.clone(),
    );
    body_map.insert("plugins".to_string(), config.plugins.clone());

    if is_deepseek_direct_model(&config.model) {
        if let Some(ref effort) = config.reasoning_effort {
            body_map.insert(
                "thinking".to_string(),
                serde_json::json!({"type": "enabled"}),
            );
            body_map.insert(
                "reasoning_effort".to_string(),
                serde_json::json!(effort),
            );
        } else {
            body_map.insert(
                "thinking".to_string(),
                serde_json::json!({"type": "disabled"}),
            );
        }
    } else if let Some(ref effort) = config.reasoning_effort {
        body_map.insert(
            "reasoning".to_string(),
            serde_json::json!({ "effort": effort }),
        );
    }

    let body = serde_json::Value::Object(body_map);

    let response = post_json(
        &chat_completions_url(&config.base_url),
        &config.api_key,
        &body,
    )
    .await?;

    let status = response.status();
    if !response.is_success() {
        let err_body = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".into());
        return Err(AppError::new(
            "OPENROUTER_ERROR",
            format!("OpenRouter request failed ({status}): {err_body}"),
        )
        .with_status(status.as_u16()));
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
    system_prompt.push_str("\n\nIMPORTANT: You are in a strict JSON-only mode. Output ONLY the raw JSON object. Do NOT include any preamble, commentary, or markdown fences. Start your response with '{' and end with '}'.");

    let mut body_map = serde_json::Map::new();
    body_map.insert(
        "model".to_string(),
        serde_json::Value::String(config.model.clone()),
    );
    body_map.insert(
        "messages".to_string(),
        serde_json::json!([
            { "role": "system", "content": system_prompt },
            { "role": "user",   "content": config.user_content  },
        ]),
    );
    body_map.insert(
        "max_tokens".to_string(),
        serde_json::Value::Number(config.max_tokens.into()),
    );
    body_map.insert(
        "response_format".to_string(),
        config.response_format.clone(),
    );
    body_map.insert("plugins".to_string(), config.plugins.clone());
    body_map.insert("stream".to_string(), serde_json::Value::Bool(true));
    body_map.insert(
        "stream_options".to_string(),
        serde_json::json!({ "include_usage": true }),
    );

    if is_deepseek_direct_model(&config.model) {
        if let Some(ref effort) = config.reasoning_effort {
            body_map.insert(
                "thinking".to_string(),
                serde_json::json!({"type": "enabled"}),
            );
            body_map.insert(
                "reasoning_effort".to_string(),
                serde_json::json!(effort),
            );
        } else {
            body_map.insert(
                "thinking".to_string(),
                serde_json::json!({"type": "disabled"}),
            );
        }
    } else if let Some(ref effort) = config.reasoning_effort {
        body_map.insert(
            "reasoning".to_string(),
            serde_json::json!({ "effort": effort }),
        );
    }

    let body = serde_json::Value::Object(body_map);

    let response = post_json(
        &chat_completions_url(&config.base_url),
        &config.api_key,
        &body,
    )
    .await?;

    let status = response.status();
    if !response.is_success() {
        let err_body = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".into());
        return Err(AppError::new(
            "OPENROUTER_ERROR",
            format!("OpenRouter request failed ({status}): {err_body}"),
        )
        .with_status(status.as_u16()));
    }

    let mut stream = response.byte_stream();
    let mut assembled = String::new();
    let mut usage: Option<SseUsage> = None;
    let mut buf = String::new();
    let mut done = false;

    let app = config.app;
    let topic = config.topic;
    let abort_signal = config.abort_signal;

    loop {
        let chunk_opt = tokio::select! {
            biased;
            _ = async {
                if let Some(signal) = &abort_signal {
                    while !signal.is_aborted() {
                        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    }
                    true
                } else {
                    futures_util::future::pending::<bool>().await
                }
            } => {
                return Err(AppError::new("ABORTED", "Generation aborted by user"));
            }
            res = stream.next() => res,
        };

        let chunk = match chunk_opt {
            Some(c) => c,
            None => break,
        };

        let chunk =
            chunk.map_err(|e| AppError::new("NETWORK_ERROR", format!("Stream error: {e}")))?;
        buf.push_str(&String::from_utf8_lossy(&chunk));

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
                        continue;
                    }

                    let chunk_val: SseChunk = match serde_json::from_str(data) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };

                    if let Some(u) = chunk_val.usage {
                        usage = Some(u);
                    }

                    if !done {
                        if let Some(choices) = chunk_val.choices {
                            for choice in choices {
                                if let Some(delta) = choice.delta {
                                    if let Some(text) = delta.content {
                                        if !text.is_empty() {
                                            assembled.push_str(&text);
                                            if let Some(ref app) = app {
                                                let _ = app.emit(
                                                    "generation-token",
                                                    serde_json::json!({
                                                        "text": text,
                                                        "topic": topic
                                                    }),
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
                                                serde_json::json!({
                                                    "text": text,
                                                    "topic": topic
                                                }),
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

pub struct OpenRouterChatConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub messages: Vec<crate::models::TutorMessage>,
    pub max_tokens: u32,
    pub temperature: Option<f32>,
    pub app: tauri::AppHandle,
    pub abort_signal: Option<AbortSignal>,
}

pub async fn call_openrouter_chat_streaming(
    config: OpenRouterChatConfig,
) -> CommandResult<OpenRouterResult> {
    let mut body_json = serde_json::json!({
        "model": config.model,
        "messages": config.messages,
        "max_tokens": config.max_tokens,
        "stream": true,
        "stream_options": { "include_usage": true },
    });

    if let Some(temp) = config.temperature {
        if let Some(obj) = body_json.as_object_mut() {
            obj.insert("temperature".into(), serde_json::json!(temp));
        }
    }

    let body = body_json;

    let response = post_json(
        &chat_completions_url(&config.base_url),
        &config.api_key,
        &body,
    )
    .await?;

    if !response.status().is_success() {
        let status = response.status();
        let err_body = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".into());
        return Err(AppError::new(
            "OPENROUTER_ERROR",
            format!("OpenRouter request failed ({status}): {err_body}"),
        ));
    }

    let mut stream = response.byte_stream();
    let mut assembled = String::new();
    let mut usage: Option<SseUsage> = None;
    let mut buf = String::new();
    let mut done = false;

    let app = config.app;
    let abort_signal = config.abort_signal;

    loop {
        let chunk_opt = tokio::select! {
            biased;
            _ = async {
                if let Some(signal) = &abort_signal {
                    while !signal.is_aborted() {
                        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    }
                    true
                } else {
                    futures_util::future::pending::<bool>().await
                }
            } => {
                return Err(AppError::new("ABORTED", "Generation aborted by user"));
            }
            res = stream.next() => res,
        };

        let chunk = match chunk_opt {
            Some(c) => c,
            None => break,
        };

        let chunk =
            chunk.map_err(|e| AppError::new("NETWORK_ERROR", format!("Stream error: {e}")))?;
        buf.push_str(&String::from_utf8_lossy(&chunk));

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
                        continue;
                    }

                    let chunk_val: SseChunk = match serde_json::from_str(data) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };

                    if let Some(u) = chunk_val.usage {
                        usage = Some(u);
                    }

                    if !done {
                        if let Some(choices) = chunk_val.choices {
                            for choice in choices {
                                if let Some(delta) = choice.delta {
                                    if let Some(text) = delta.content {
                                        if !text.is_empty() {
                                            assembled.push_str(&text);
                                            let _ = app.emit(
                                                "tutor-generation-token",
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
                                        let _ = app.emit(
                                            "tutor-generation-token",
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

pub fn is_deepseek_model(model: &str) -> bool {
    let model = model.trim().to_ascii_lowercase();
    model.starts_with("deepseek-") || model.starts_with("deepseek/")
}

/// True if the model is called via DeepSeek's direct API (not routed through OpenRouter).
/// Direct DeepSeek models use `deepseek-*` (no `/`), whereas OpenRouter-routed
/// models use `deepseek/*`. This distinction matters because their thinking/reasoning
/// APIs use different wire formats.
pub fn is_deepseek_direct_model(model: &str) -> bool {
    let model = model.trim().to_ascii_lowercase();
    model.starts_with("deepseek-")
}

/// Returns true if the model supports structured output with `json_schema` type.
/// OpenRouter models (with `provider/name` format) support it. DeepSeek direct
/// models and custom-provider models (no `/` prefix) only support `json_object`.
pub fn supports_json_schema_format(model: &str) -> bool {
    if is_deepseek_model(model) {
        return false;
    }
    // OpenRouter models use provider/model-name format (contain '/')
    // Plain model IDs without '/' likely come from non-OpenRouter providers
    // that only support basic json_object.
    model.trim().contains('/')
}

pub fn json_object_format() -> serde_json::Value {
    serde_json::json!({"type": "json_object"})
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
