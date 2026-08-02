use crate::engine::chatgpt::{complete, generate_request_id, ChatGptConfig, CompletionRequest};
use crate::engine::context::EngineContext;
use crate::engine::{
    emit_stream_end, emit_stream_error, emit_stream_start, rust_log, validate_model,
};
use crate::models::{AnalyzeImageRequest, AnalyzeImageResponse, AppError, CommandResult};
use base64::{engine::general_purpose, Engine as _};
use std::path::Path;
use std::time::Instant;

pub async fn analyze_image(
    ctx: &EngineContext,
    request: AnalyzeImageRequest,
) -> CommandResult<AnalyzeImageResponse> {
    validate_model(&request.model)?;

    let request_id = generate_request_id();
    emit_stream_start(
        &ctx.app,
        &request_id,
        "image-analysis",
        &request.model,
        None,
        None,
    );

    let result: CommandResult<AnalyzeImageResponse> = async {
        let start = Instant::now();

    // Read image file and encode as base64 data URL
    let image_data = std::fs::read(&request.image_path)
        .map_err(|e| AppError::new("IO_ERROR", format!("Failed to read image: {e}")))?;

    let ext = Path::new(&request.image_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");

    let mime = match ext.to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/png",
    };

    let b64 = general_purpose::STANDARD.encode(&image_data);
    let data_url = format!("data:{};base64,{}", mime, b64);

    let user_prompt = request.prompt.unwrap_or_else(|| {
        "Analyse this image. Describe what you see, identify any mathematical working, chemical structures, diagrams, or text content. If it contains a question, extract it. If it contains student working, evaluate its correctness where possible.".to_string()
    });

    let system_prompt = "IDENTITY: Expert academic image analyst.\n\nRULES:\n1. Analyse the image carefully and thoroughly.\n2. Extract all text, equations, diagrams, and working shown.\n3. If the image contains a question, identify the topic and subtopic.\n4. If the image contains student working, check for correctness and common errors.\n5. Respond with clear, structured analysis.";

    let content_parts = vec![
        serde_json::json!({ "type": "text", "text": user_prompt }),
        serde_json::json!({
            "type": "image_url",
            "image_url": { "url": data_url }
        }),
    ];

    let llm_config = ChatGptConfig::new(&request.model)
        .with_max_tokens(4000)
        .with_request_id(&request_id);

    let completion_request = CompletionRequest::new(
        system_prompt,
        serde_json::json!(content_parts),
        serde_json::Value::Null,
    );

    let completion = complete(&llm_config, completion_request, &ctx.app, &ctx.abort_signal).await?;

    let duration_ms = start.elapsed().as_millis() as u64;

        let estimated_cost_usd = None;

        rust_log(
            ctx,
            "info",
            &format!("Image analysis completed in {}ms", duration_ms),
            Some(serde_json::json!({
                "prompt_tokens": completion.prompt_tokens,
                "completion_tokens": completion.completion_tokens,
                "estimated_cost_usd": estimated_cost_usd,
            })),
        );

        Ok(AnalyzeImageResponse {
            output_text: completion.content,
            estimated_cost_usd,
        })
    }.await;

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
