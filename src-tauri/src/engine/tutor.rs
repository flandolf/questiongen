use crate::engine::context::EngineContext;
use crate::engine::provider::{complete_chat, LlmConfig};
use crate::engine::{rust_log, validate_credentials};
use crate::models::{AppError, CommandResult, TutorChatRequest, TutorChatResponse};
use crate::openrouter_info::{compute_generation_cost, get_cached_model_stats};
use std::time::Instant;

pub async fn tutor_chat(
    ctx: &EngineContext,
    request: TutorChatRequest,
) -> CommandResult<TutorChatResponse> {
    validate_credentials(&request.api_key, &request.model)?;

    let start = Instant::now();

    if request.messages.is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Messages cannot be empty."));
    }

    let mut llm_config = LlmConfig::new(&request.api_key, &request.model)
        .with_max_tokens(4000)
        .with_temperature(request.diagnostic.unwrap_or(false).then_some(0.3).unwrap_or(0.7));
    if let Some(ref url) = request.base_url {
        llm_config = llm_config.with_base_url(url);
    }

    let completion = complete_chat(
        &llm_config,
        request.messages,
        &ctx.app,
        Some(ctx.abort_signal.clone()),
    )
    .await?;

    let duration_ms = start.elapsed().as_millis() as u64;

    let stats = get_cached_model_stats(&request.api_key, &request.model);
    let estimated_cost = compute_generation_cost(
        Some(completion.prompt_tokens as u64),
        Some(completion.completion_tokens as u64),
        stats.as_ref().and_then(|s| s.prompt_price_per_token),
        stats.as_ref().and_then(|s| s.completion_price_per_token),
    );

    rust_log(
        ctx,
        "info",
        &format!("Tutor chat completed in {}ms", duration_ms),
        Some(serde_json::json!({
            "prompt_tokens": completion.prompt_tokens,
            "completion_tokens": completion.completion_tokens,
        })),
    );

    Ok(TutorChatResponse {
        content: completion.content,
        prompt_tokens: completion.prompt_tokens,
        completion_tokens: completion.completion_tokens,
        total_tokens: completion.total_tokens,
        estimated_cost_usd: estimated_cost,
    })
}
