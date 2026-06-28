use crate::engine::context::EngineContext;
use crate::engine::output::parse_structured;
use crate::engine::provider::{complete, CompletionRequest, LlmConfig};
use crate::engine::{
    emit_stream_end, emit_stream_error, emit_stream_start, rust_log, validate_credentials,
};
use crate::llm::generate_request_id;
use crate::llm::json_object_format;
use crate::models::{
    CommandResult, DiscoverPdfQuestionsRequest, DiscoverPdfQuestionsResponse, DiscoveredQuestion,
};
use crate::openrouter_info::{compute_generation_cost, get_cached_model_stats};
use std::time::Instant;

pub async fn discover_pdf_questions(
    ctx: &EngineContext,
    request: DiscoverPdfQuestionsRequest,
) -> CommandResult<DiscoverPdfQuestionsResponse> {
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
        &ctx.app,
        &request_id,
        "pdf-discovery",
        &provider_id,
        &request.model,
        None,
        None,
    );

    let result: CommandResult<DiscoverPdfQuestionsResponse> = async {
        let start = Instant::now();

    let system_prompt = "IDENTITY: Expert VCE Exam Analyst.\nTASK: Analyze the attached PDF of a student's exam and identify all questions present.\nRULES:\n1. Extract the EXACT text of each question (the prompt/stem).\n2. Identify the 'topic' (e.g. 'Question 1', 'Section A Question 4').\n3. Identify the maximum marks available for that question (usually noted in square brackets like [4 marks]).\n4. Identify which page(s) in the PDF contain the student's answer for that question.\n5. Output valid JSON in the specified format.\n6. Be exhaustive; find every question the student has attempted or is present in the exam paper.";

    let user_prompt = "Analyze the attached PDF. Identify each question, its full prompt text, its maximum marks, and the page numbers where the student's response is located.";

    let data_url = if request
        .pdf_base64
        .starts_with("data:application/pdf;base64,")
    {
        request.pdf_base64.clone()
    } else {
        format!("data:application/pdf;base64,{}", request.pdf_base64)
    };

    let content_parts = vec![
        serde_json::json!({ "type": "text", "text": user_prompt }),
        serde_json::json!({
            "type": "file",
            "file": {
                "filename": "exam.pdf",
                "file_data": data_url
            }
        }),
    ];

    let mut llm_config = LlmConfig::new(&request.api_key, &request.model)
        .with_max_tokens(6000)
        .with_request_id(&request_id);
    if let Some(ref url) = request.base_url {
        llm_config = llm_config.with_base_url(url);
    }
    if let Some(ref id) = request.provider_id {
        llm_config = llm_config.with_provider_id(id);
    }

    let completion_request = CompletionRequest::new(
        system_prompt,
        serde_json::json!(content_parts),
        json_object_format(),
    );

    let completion = complete(&llm_config, completion_request, &ctx.app, &ctx.abort_signal).await?;

    let discovered: DiscoveredPayload = parse_structured(&completion.content)?;

    let duration_ms = start.elapsed().as_millis() as u64;

        let stats = get_cached_model_stats(&request.api_key, &request.model);
        let estimated_cost_usd = compute_generation_cost(
            Some(completion.prompt_tokens as u64),
            Some(completion.completion_tokens as u64),
            stats.as_ref().and_then(|s| s.prompt_price_per_token),
            stats.as_ref().and_then(|s| s.completion_price_per_token),
        );

        rust_log(
            ctx,
            "info",
            &format!(
                "Discovered {} PDF questions in {}ms",
                discovered.questions.len(),
                duration_ms
            ),
            Some(serde_json::json!({
                "prompt_tokens": completion.prompt_tokens,
                "completion_tokens": completion.completion_tokens,
                "estimated_cost_usd": estimated_cost_usd,
            })),
        );

        Ok(DiscoverPdfQuestionsResponse {
            questions: discovered.questions,
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

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscoveredPayload {
    questions: Vec<DiscoveredQuestion>,
}
