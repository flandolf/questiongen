use crate::constants::DEFAULT_OPENROUTER_BASE_URL;
use crate::llm::{
    call_chat_completion, call_chat_streaming, ChatRequestConfig, ChatStreamingConfig,
};
use crate::models::{AbortSignal, CommandResult};

/// Provider-agnostic configuration for an LLM call.
///
/// The `provider_id` field is the canonical signal for provider-specific
/// request shaping. Base-url heuristics are a fallback only.
#[derive(Clone, Debug)]
pub struct LlmConfig {
    pub api_key: String,
    pub model: String,
    pub base_url: Option<String>,
    /// Canonical provider id (e.g. "openrouter", "deepseek", "nvidia", "custom-{uuid}").
    pub provider_id: Option<String>,
    pub max_tokens: u32,
    pub temperature: Option<f32>,

    pub reasoning_enabled: bool,
    pub reasoning_effort: Option<String>,

    /// Unified stream event correlation id.
    pub request_id: Option<String>,
    /// Task label for unified stream events (e.g. "generation", "marking", "tutor").
    pub task: Option<String>,
}

impl LlmConfig {
    pub fn new(api_key: &str, model: &str) -> Self {
        Self {
            api_key: api_key.to_string(),
            model: model.to_string(),
            base_url: None,
            provider_id: None,
            max_tokens: 4096,
            temperature: None,
            reasoning_enabled: false,
            reasoning_effort: None,
            request_id: None,
            task: None,
        }
    }

    pub fn with_base_url(mut self, url: &str) -> Self {
        self.base_url = Some(url.to_string());
        self
    }

    pub fn with_provider_id(mut self, id: &str) -> Self {
        self.provider_id = Some(id.to_string());
        self
    }

    pub fn with_max_tokens(mut self, tokens: u32) -> Self {
        self.max_tokens = tokens;
        self
    }

    pub fn with_temperature(mut self, temp: f32) -> Self {
        self.temperature = Some(temp);
        self
    }

    pub fn with_reasoning(mut self, enabled: bool, effort: Option<&str>) -> Self {
        self.reasoning_enabled = enabled;
        self.reasoning_effort = effort.map(|s| s.to_string());
        self
    }

    pub fn with_request_id(mut self, request_id: &str) -> Self {
        self.request_id = Some(request_id.to_string());
        self
    }

    pub fn with_task(mut self, task: &str) -> Self {
        self.task = Some(task.to_string());
        self
    }
}

/// A single completion request.
pub struct CompletionRequest {
    pub system_prompt: String,
    pub user_content: serde_json::Value,
    pub response_format: serde_json::Value,
    pub stream: bool,
    pub topic: Option<String>,
    pub plugins: serde_json::Value,
    /// Unified stream event correlation id.
    pub request_id: Option<String>,
    /// Task label for unified stream events.
    pub task: Option<String>,
}

impl CompletionRequest {
    pub fn new(system: &str, user: serde_json::Value, format: serde_json::Value) -> Self {
        Self {
            system_prompt: system.to_string(),
            user_content: user,
            response_format: format,
            stream: false,
            topic: None,
            plugins: serde_json::json!([{ "id": "response-healing" }]),
            request_id: None,
            task: None,
        }
    }

    pub fn with_stream(mut self, enabled: bool, topic: Option<String>) -> Self {
        self.stream = enabled;
        self.topic = topic;
        self
    }

    #[allow(dead_code)]
    pub fn with_plugins(mut self, plugins: serde_json::Value) -> Self {
        self.plugins = plugins;
        self
    }

    pub fn with_request_id(mut self, request_id: &str) -> Self {
        self.request_id = Some(request_id.to_string());
        self
    }

    pub fn with_task(mut self, task: &str) -> Self {
        self.task = Some(task.to_string());
        self
    }
}

/// Result of a successful LLM completion.
pub struct CompletionResponse {
    pub content: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    pub reasoning_tokens: u32,
}

/// Execute a single LLM completion through the provider layer.
///
/// This is the primary abstraction point: all pipelines call this function
/// instead of talking to `llm.rs` directly.
pub async fn complete(
    config: &LlmConfig,
    request: CompletionRequest,
    app: &tauri::AppHandle,
    abort_signal: &AbortSignal,
) -> CommandResult<CompletionResponse> {
    let mut cfg = ChatRequestConfig::new(
        &config.api_key,
        &config.model,
        &request.system_prompt,
        request.user_content,
        request.response_format,
        config.max_tokens,
    )
    .with_plugins(request.plugins)
    .with_app(app.clone())
    .with_abort_signal(abort_signal.clone())
    .with_reasoning_enabled(config.reasoning_enabled);

    if config.reasoning_enabled {
        if let Some(ref effort) = config.reasoning_effort {
            cfg = cfg.with_reasoning_effort(effort);
        }
    }

    if let Some(ref url) = config.base_url {
        cfg = cfg.with_base_url(url);
    }

    if let Some(ref id) = config.provider_id {
        cfg = cfg.with_provider_id(id);
    }

    if let Some(temp) = config.temperature {
        cfg = cfg.with_temperature(temp);
    }

    if request.stream {
        cfg = cfg.with_stream(app.clone(), request.topic);
    }
    if let Some(ref id) = config.request_id {
        cfg = cfg.with_request_id(id);
    }
    if let Some(ref task) = config.task {
        cfg = cfg.with_task(task);
    }
    if let Some(ref id) = request.request_id {
        cfg = cfg.with_request_id(id);
    }
    if let Some(ref task) = request.task {
        cfg = cfg.with_task(task);
    }

    let result = call_chat_completion(cfg).await?;

    Ok(CompletionResponse {
        content: result.content,
        prompt_tokens: result.prompt_tokens,
        completion_tokens: result.completion_tokens,
        total_tokens: result.total_tokens,
        reasoning_tokens: result.reasoning_tokens,
    })
}

/// Execute a streaming chat completion (tutor mode).
pub async fn complete_chat(
    config: &LlmConfig,
    messages: Vec<crate::models::TutorMessage>,
    app: &tauri::AppHandle,
    abort_signal: Option<AbortSignal>,
) -> CommandResult<CompletionResponse> {
    let chat_config = ChatStreamingConfig {
        base_url: config
            .base_url
            .clone()
            .unwrap_or_else(|| DEFAULT_OPENROUTER_BASE_URL.to_string()),
        api_key: config.api_key.clone(),
        model: config.model.clone(),
        provider_id: config.provider_id.clone(),
        messages,
        max_tokens: config.max_tokens,
        temperature: config.temperature,
        app: app.clone(),
        abort_signal,
        request_id: config.request_id.clone(),
    };

    let result = call_chat_streaming(chat_config).await?;

    Ok(CompletionResponse {
        content: result.content,
        prompt_tokens: result.prompt_tokens,
        completion_tokens: result.completion_tokens,
        total_tokens: result.total_tokens,
        reasoning_tokens: result.reasoning_tokens,
    })
}
