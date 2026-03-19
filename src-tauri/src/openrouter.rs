use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use crate::constants::{OPENROUTER_CHAT_URL, OPENROUTER_MAX_TOKENS};
use crate::models::{AppError, CommandResult, OpenRouterResponse};

/// Result of a single OpenRouter call: raw content string + token usage.
pub struct OpenRouterResult {
    pub content: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// Make a single OpenRouter request.
///
/// `response_format` is always required — every call site passes a JSON Schema.
/// The Response Healing plugin is enabled automatically so the server handles
/// malformed JSON before it ever reaches us, eliminating manual repair loops.
pub async fn call_openrouter(
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_content: serde_json::Value,
    response_format: &serde_json::Value,
) -> CommandResult<OpenRouterResult> {
    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user",   "content": user_content  },
        ],
        "temperature": 0.5,
        "max_tokens": OPENROUTER_MAX_TOKENS,
        "response_format": response_format,
        // Response Healing: server-side JSON repair for json_schema requests.
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
        let body = response.text().await.unwrap_or_else(|_| "Unknown error".into());
        return Err(AppError::new("OPENROUTER_ERROR",
            format!("OpenRouter request failed ({status}): {body}")));
    }

    let parsed: OpenRouterResponse = response
        .json()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Invalid API response: {e}")))?;

    let content = parsed.choices.first()
        .map(|c| c.message.content.clone())
        .ok_or_else(|| AppError::new("EMPTY_RESULT", "OpenRouter returned no content."))?;

    let (prompt_tokens, completion_tokens, total_tokens) = parsed.usage
        .map(|u| (u.prompt_tokens, u.completion_tokens, u.total_tokens))
        .unwrap_or((0, 0, 0));

    Ok(OpenRouterResult { content, prompt_tokens, completion_tokens, total_tokens })
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
