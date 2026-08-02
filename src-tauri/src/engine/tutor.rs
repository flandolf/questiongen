use crate::engine::chatgpt::{complete_chat, generate_request_id, ChatGptConfig};
use crate::engine::context::EngineContext;
use crate::engine::{
    emit_stream_end, emit_stream_error, emit_stream_start, rust_log, validate_model,
};
use crate::models::{AppError, CommandResult, TutorChatRequest, TutorChatResponse};
use std::time::Instant;

pub async fn tutor_chat(
    ctx: &EngineContext,
    request: TutorChatRequest,
) -> CommandResult<TutorChatResponse> {
    validate_model(&request.model)?;

    if request.messages.is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Messages cannot be empty.",
        ));
    }

    let request_id = generate_request_id();
    emit_stream_start(&ctx.app, &request_id, "tutor", &request.model, None, None);

    let start = Instant::now();

    let llm_config = ChatGptConfig::new(&request.model)
        .with_max_tokens(4000)
        .with_temperature(if request.diagnostic.unwrap_or(false) {
            0.3
        } else {
            0.7
        })
        .with_request_id(&request_id)
        .with_task("tutor");

    let result: CommandResult<TutorChatResponse> = async {
        let completion = complete_chat(
            &llm_config,
            request.messages,
            &ctx.app,
            Some(ctx.abort_signal.clone()),
        )
        .await?;

        let duration_ms = start.elapsed().as_millis() as u64;

        let estimated_cost = None;

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
