use crate::engine::context::EngineContext;
use crate::engine::provider::{complete_chat, LlmConfig};
use crate::engine::{
    emit_stream_end, emit_stream_error, emit_stream_start, rust_log, validate_credentials,
};
use crate::llm::generate_request_id;
use crate::models::{AppError, CommandResult, TutorChatRequest, TutorChatResponse};
use crate::openrouter_info::{compute_generation_cost, get_cached_model_stats};
use std::time::Instant;

pub async fn tutor_chat(
    ctx: &EngineContext,
    request: TutorChatRequest,
) -> CommandResult<TutorChatResponse> {
    validate_credentials(&request.api_key, &request.model)?;

    if request.messages.is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Messages cannot be empty.",
        ));
    }

    let request_id = generate_request_id();
    let provider_id = request.provider_id.clone().unwrap_or_else(|| {
        let url = request
            .base_url
            .as_deref()
            .unwrap_or(crate::constants::DEFAULT_OPENROUTER_BASE_URL)
            .trim()
            .trim_end_matches('/')
            .to_ascii_lowercase();
        if url.contains("openrouter.ai") {
            "openrouter".to_string()
        } else if url.contains("deepseek.com") {
            "deepseek".to_string()
        } else if url.contains("nvidia.com") {
            "nvidia".to_string()
        } else {
            "custom".to_string()
        }
    });

    emit_stream_start(
        &ctx.app,
        &request_id,
        "tutor",
        &provider_id,
        &request.model,
        None,
        None,
    );

    let start = Instant::now();

    let mut llm_config = LlmConfig::new(&request.api_key, &request.model)
        .with_max_tokens(4000)
        .with_temperature(if request.diagnostic.unwrap_or(false) {
            0.3
        } else {
            0.7
        })
        .with_request_id(&request_id)
        .with_task("tutor");
    if let Some(ref url) = request.base_url {
        llm_config = llm_config.with_base_url(url);
    }
    if let Some(ref id) = request.provider_id {
        llm_config = llm_config.with_provider_id(id);
    }

    let result: CommandResult<TutorChatResponse> = async {
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
    .await;

    match result {
        Ok(res) => {
            emit_stream_end(&ctx.app, &request_id);
            Ok(res)
        }
        Err(e) => {
            emit_stream_error(&ctx.app, &request_id, &e.code, &e.message);
            emit_stream_end(&ctx.app, &request_id);
            Err(e)
        }
    }
}
