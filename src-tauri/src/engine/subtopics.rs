use crate::catalog;
use crate::engine::context::EngineContext;
use crate::engine::prompt::{subtopic_generation_system, subtopic_generation_user_prompt};
use crate::engine::provider::{complete, CompletionRequest, LlmConfig};
use crate::engine::{
    emit_stream_end, emit_stream_error, emit_stream_start, rust_log, validate_credentials,
};
use crate::llm::{generate_request_id, json_object_format};
use crate::models::{
    AppError, CommandResult, GenerateSubtopicsRequest, GenerateSubtopicsResponse,
    GeneratedSubtopic, TechniqueNotes,
};
use crate::openrouter_info::{compute_generation_cost, get_cached_model_stats};
use std::time::Instant;

pub async fn generate_subtopics(
    _ctx: &EngineContext,
    request: GenerateSubtopicsRequest,
) -> CommandResult<GenerateSubtopicsResponse> {
    validate_credentials(&request.api_key, &request.model)?;

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
        &_ctx.app,
        &request_id,
        "subtopics",
        &provider_id,
        &request.model,
        Some(request.topic.clone()),
        None,
    );

    let result = async {
        let start = Instant::now();

        let exam_guidance = catalog::topic_exam_guidance(&request.topic);
        if exam_guidance.is_empty() {
            return Err(AppError::new("INVALID_TOPIC", "Topic not found in catalog"));
        }

        let existing = request.existing_subtopics.unwrap_or_default();
        let focus_area = request.focus_area.unwrap_or_default();

        let system_prompt = subtopic_generation_system().to_string();
        let user_prompt =
            subtopic_generation_user_prompt(&request.topic, exam_guidance, &existing, &focus_area);

        let mut content_parts = vec![serde_json::json!({ "type": "text", "text": user_prompt })];

        // Attach PDF if provided
        if let Some(ref pdf_content) = request.pdf_content {
            if !pdf_content.trim().is_empty() {
                let data_url = if pdf_content.starts_with("data:application/pdf;base64,") {
                    pdf_content.clone()
                } else {
                    format!("data:application/pdf;base64,{}", pdf_content)
                };
                content_parts.push(serde_json::json!({
                    "type": "file",
                    "file": {
                        "filename": "reference.pdf",
                        "file_data": data_url
                    }
                }));
            }
        }

        let mut llm_config = LlmConfig::new(&request.api_key, &request.model)
            .with_max_tokens(4000)
            .with_request_id(&request_id)
            .with_task("subtopics");
        if let Some(ref url) = request.base_url {
            llm_config = llm_config.with_base_url(url);
        }
        if let Some(ref id) = request.provider_id {
            llm_config = llm_config.with_provider_id(id);
        }

        let completion_request = CompletionRequest::new(
            &system_prompt,
            serde_json::json!(content_parts),
            json_object_format(),
        )
        .with_request_id(&request_id)
        .with_task("subtopics");

        _ctx.check_abort()?;
        let completion = complete(
            &llm_config,
            completion_request,
            &_ctx.app,
            &_ctx.abort_signal,
        )
        .await?;

        let content = completion.content.trim();
        let json_start = content.find('{').or_else(|| content.find('['));
        let json_str = if let Some(start) = json_start {
            &content[start..]
        } else {
            content
        };

        let parsed: serde_json::Value = serde_json::from_str(json_str).map_err(|e| {
            AppError::new(
                "PARSE_ERROR",
                format!(
                    "Failed to parse response: {}. Content: {}",
                    e,
                    &json_str[..json_str.len().min(200)]
                ),
            )
        })?;

        let subtopics: Vec<GeneratedSubtopic> = parsed
            .get("subtopics")
            .and_then(|s| s.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| {
                        Some(GeneratedSubtopic {
                            name: item.get("name")?.as_str()?.to_string(),
                            group: item.get("group").and_then(|g| g.as_str()).map(String::from),
                            technique_notes: item
                                .get("techniqueNotes")
                                .or_else(|| item.get("technique_notes"))
                                .map(|tn| TechniqueNotes {
                                    core_concepts: tn
                                        .get("coreConcepts")
                                        .or_else(|| tn.get("core_concepts"))
                                        .and_then(|c| c.as_str())
                                        .map(String::from),
                                    exam_style_guidelines: tn
                                        .get("examStyleGuidelines")
                                        .or_else(|| tn.get("exam_style_guidelines"))
                                        .and_then(|e| e.as_str())
                                        .map(String::from),
                                    anti_prompts: tn
                                        .get("antiPrompts")
                                        .or_else(|| tn.get("anti_prompts"))
                                        .and_then(|a| a.as_array())
                                        .map(|arr| {
                                            arr.iter()
                                                .filter_map(|p| p.as_str().map(String::from))
                                                .collect()
                                        })
                                        .unwrap_or_default(),
                                }),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        if subtopics.is_empty() {
            return Err(AppError::new(
                "NO_SUBTOPICS",
                "No valid subtopics found in response",
            ));
        }

        let duration_ms = start.elapsed().as_millis() as u64;

        let stats = get_cached_model_stats(&request.api_key, &request.model);
        let estimated_cost_usd = compute_generation_cost(
            Some(completion.prompt_tokens as u64),
            Some(completion.completion_tokens as u64),
            stats.as_ref().and_then(|s| s.prompt_price_per_token),
            stats.as_ref().and_then(|s| s.completion_price_per_token),
        );

        rust_log(
            _ctx,
            "info",
            &format!(
                "Generated {} subtopics in {}ms",
                subtopics.len(),
                duration_ms
            ),
            Some(serde_json::json!({
                "prompt_tokens": completion.prompt_tokens,
                "completion_tokens": completion.completion_tokens,
                "estimated_cost_usd": estimated_cost_usd,
            })),
        );

        Ok(GenerateSubtopicsResponse {
            subtopics,
            estimated_cost_usd,
        })
    }
    .await;

    match result {
        Ok(res) => {
            emit_stream_end(&_ctx.app, &request_id);
            Ok(res)
        }
        Err(e) => {
            emit_stream_error(&_ctx.app, &request_id, &e.code, &e.message);
            emit_stream_end(&_ctx.app, &request_id);
            Err(e)
        }
    }
}
