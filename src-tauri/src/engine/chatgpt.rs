use serde::Deserialize;

use crate::engine::{emit_stream_token, emit_stream_usage};
use crate::http_client::post_local_json;
use crate::models::{AbortSignal, AppError, CommandResult, CostQuality, TutorMessage};

const COMPLETION_URL: &str = "http://127.0.0.1:41732/internal/completion";

pub fn generate_request_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{nanos:x}")
}

#[derive(Clone, Debug)]
pub struct ChatGptConfig {
    pub model: String,
    pub max_tokens: u32,
    pub temperature: Option<f32>,
    pub reasoning_enabled: bool,
    pub reasoning_effort: Option<String>,
    pub request_id: Option<String>,
    pub task: Option<String>,
}

impl ChatGptConfig {
    pub fn new(model: &str) -> Self {
        Self {
            model: model.to_owned(),
            max_tokens: 4096,
            temperature: None,
            reasoning_enabled: false,
            reasoning_effort: None,
            request_id: None,
            task: None,
        }
    }

    pub fn with_max_tokens(mut self, tokens: u32) -> Self {
        self.max_tokens = tokens;
        self
    }

    pub fn with_temperature(mut self, temperature: f32) -> Self {
        self.temperature = Some(temperature);
        self
    }

    pub fn with_reasoning(mut self, enabled: bool, effort: Option<&str>) -> Self {
        self.reasoning_enabled = enabled;
        self.reasoning_effort = effort.map(normalize_reasoning_effort);
        self
    }

    pub fn with_request_id(mut self, request_id: &str) -> Self {
        self.request_id = Some(request_id.to_owned());
        self
    }

    pub fn with_task(mut self, task: &str) -> Self {
        self.task = Some(task.to_owned());
        self
    }
}

fn normalize_reasoning_effort(value: &str) -> String {
    match value {
        "minimal" => "low",
        "max" => "xhigh",
        other => other,
    }
    .to_owned()
}

pub struct CompletionRequest {
    pub system_prompt: String,
    pub user_content: serde_json::Value,
    pub response_format: serde_json::Value,
    pub stream: bool,
    pub topic: Option<String>,
    pub request_id: Option<String>,
    pub task: Option<String>,
}

impl CompletionRequest {
    pub fn new(system: &str, user: serde_json::Value, format: serde_json::Value) -> Self {
        Self {
            system_prompt: system.to_owned(),
            user_content: user,
            response_format: format,
            stream: false,
            topic: None,
            request_id: None,
            task: None,
        }
    }

    pub fn with_stream(mut self, enabled: bool, topic: Option<String>) -> Self {
        self.stream = enabled;
        self.topic = topic;
        self
    }

    pub fn with_request_id(mut self, request_id: &str) -> Self {
        self.request_id = Some(request_id.to_owned());
        self
    }

    pub fn with_task(mut self, task: &str) -> Self {
        self.task = Some(task.to_owned());
        self
    }
}

pub struct CompletionResponse {
    pub content: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    pub reasoning_tokens: u32,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Usage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
    reasoning_tokens: u32,
}

#[derive(Deserialize)]
struct SidecarResponse {
    text: String,
    #[serde(default)]
    usage: Usage,
}

async fn send(
    app: &tauri::AppHandle,
    body: serde_json::Value,
) -> CommandResult<CompletionResponse> {
    let secret = crate::chatgpt::secret(app)?;
    let response = post_local_json(COMPLETION_URL, &secret, &body).await?;
    if !response.is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        let message = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|value| value["error"].as_str().map(str::to_owned))
            .unwrap_or(text);
        return Err(AppError::new(
            if status.as_u16() == 401 {
                "CHATGPT_NOT_CONNECTED"
            } else {
                "CHATGPT_ERROR"
            },
            message,
        ));
    }

    let response: SidecarResponse = response.json().await?;
    Ok(CompletionResponse {
        content: response.text,
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens,
        reasoning_tokens: response.usage.reasoning_tokens,
    })
}

pub async fn complete(
    config: &ChatGptConfig,
    request: CompletionRequest,
    app: &tauri::AppHandle,
    abort_signal: &AbortSignal,
) -> CommandResult<CompletionResponse> {
    if abort_signal.is_aborted() {
        return Err(AppError::new("ABORTED", "Generation aborted by user"));
    }

    let body = serde_json::json!({
        "model": config.model,
        "instructions": request.system_prompt,
        "input": request.user_content,
        "responseFormat": request.response_format,
        "maxOutputTokens": config.max_tokens,
        "temperature": config.temperature,
        "reasoningEffort": config.reasoning_enabled.then(|| config.reasoning_effort.clone()).flatten(),
    });
    let result = send(app, body).await?;

    if request.stream {
        let request_id = request
            .request_id
            .as_deref()
            .or(config.request_id.as_deref())
            .unwrap_or("generation");
        emit_stream_token(app, request_id, &result.content);
        emit_stream_usage(
            app,
            request_id,
            result.prompt_tokens,
            result.completion_tokens,
            result.total_tokens,
            result.reasoning_tokens,
            None,
            CostQuality::Unknown,
        );
    }
    Ok(result)
}

pub async fn complete_chat(
    config: &ChatGptConfig,
    messages: Vec<TutorMessage>,
    app: &tauri::AppHandle,
    abort_signal: Option<AbortSignal>,
) -> CommandResult<CompletionResponse> {
    if abort_signal.as_ref().is_some_and(AbortSignal::is_aborted) {
        return Err(AppError::new("ABORTED", "Generation aborted by user"));
    }

    let instructions = messages
        .iter()
        .filter(|message| message.role == "system")
        .filter_map(|message| message.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");
    let body = serde_json::json!({
        "model": config.model,
        "instructions": instructions,
        "messages": messages,
        "maxOutputTokens": config.max_tokens,
        "temperature": config.temperature,
    });
    let result = send(app, body).await?;
    let request_id = config.request_id.as_deref().unwrap_or("tutor");
    emit_stream_token(app, request_id, &result.content);
    Ok(result)
}
