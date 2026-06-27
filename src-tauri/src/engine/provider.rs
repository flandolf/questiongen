use crate::llm::{
    call_openrouter, call_openrouter_chat_streaming, OpenRouterChatConfig, OpenRouterRequestConfig,
};
use crate::models::{AbortSignal, CommandResult};

/// Provider-agnostic configuration for an LLM call.
///
/// Currently backed by OpenRouter (and DeepSeek direct), but structured
/// so a new provider can be swapped in without touching pipeline code.
#[derive(Clone, Debug)]
pub struct LlmConfig {
    pub api_key: String,
    pub model: String,
    pub base_url: Option<String>,
    pub max_tokens: u32,
    pub temperature: Option<f32>,

    pub reasoning_enabled: bool,
    pub reasoning_effort: Option<String>,
}

impl LlmConfig {
    pub fn new(api_key: &str, model: &str) -> Self {
        Self {
            api_key: api_key.to_string(),
            model: model.to_string(),
            base_url: None,
            max_tokens: 4096,
            temperature: None,
            reasoning_enabled: false,
            reasoning_effort: None,
        }
    }

    pub fn with_base_url(mut self, url: &str) -> Self {
        self.base_url = Some(url.to_string());
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
}

/// A single completion request.
pub struct CompletionRequest {
    pub system_prompt: String,
    pub user_content: serde_json::Value,
    pub response_format: serde_json::Value,
    pub stream: bool,
    pub topic: Option<String>,
    pub plugins: serde_json::Value,
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
    let mut cfg = OpenRouterRequestConfig::new(
        &config.api_key,
        &config.model,
        &request.system_prompt,
        request.user_content,
        request.response_format,
        config.max_tokens,
    )
    .with_plugins(request.plugins)
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

    if let Some(temp) = config.temperature {
        cfg = cfg.with_temperature(temp);
    }

    if request.stream {
        cfg = cfg.with_stream(app.clone(), request.topic);
    }

    let result = call_openrouter(cfg).await?;

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
    let chat_config = OpenRouterChatConfig {
        base_url: config
            .base_url
            .clone()
            .unwrap_or_else(|| "https://openrouter.ai/api/v1".to_string()),
        api_key: config.api_key.clone(),
        model: config.model.clone(),
        messages,
        max_tokens: config.max_tokens,
        temperature: config.temperature,
        app: app.clone(),
        abort_signal,
    };

    let result = call_openrouter_chat_streaming(chat_config).await?;

    Ok(CompletionResponse {
        content: result.content,
        prompt_tokens: result.prompt_tokens,
        completion_tokens: result.completion_tokens,
        total_tokens: result.total_tokens,
        reasoning_tokens: result.reasoning_tokens,
    })
}
