use crate::engine::context::EngineContext;
use crate::engine::provider::{complete, CompletionRequest, LlmConfig};
use crate::engine::{rust_log, validate_credentials};
use crate::llm::json_object_format;
use crate::models::{AnalyzeImageRequest, AnalyzeImageResponse, AppError, CommandResult};
use base64::{engine::general_purpose, Engine as _};
use std::path::Path;
use std::time::Instant;

pub async fn analyze_image(
    ctx: &EngineContext,
    request: AnalyzeImageRequest,
) -> CommandResult<AnalyzeImageResponse> {
    validate_credentials(&request.api_key, &request.model)?;

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

    let mut llm_config = LlmConfig::new(&request.api_key, &request.model).with_max_tokens(4000);
    if let Some(ref url) = request.base_url {
        llm_config = llm_config.with_base_url(url);
    }

    let completion_request = CompletionRequest::new(
        system_prompt,
        serde_json::json!(content_parts),
        json_object_format(),
    );

    let completion = complete(&llm_config, completion_request, &ctx.app, &ctx.abort_signal).await?;

    let duration_ms = start.elapsed().as_millis() as u64;

    rust_log(
        ctx,
        "info",
        &format!("Image analysis completed in {}ms", duration_ms),
        Some(serde_json::json!({
            "prompt_tokens": completion.prompt_tokens,
            "completion_tokens": completion.completion_tokens,
        })),
    );

    Ok(AnalyzeImageResponse {
        output_text: completion.content,
    })
}
