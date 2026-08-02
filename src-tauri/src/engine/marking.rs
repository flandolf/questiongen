use crate::catalog;
use crate::engine::chatgpt::{complete, generate_request_id, ChatGptConfig, CompletionRequest};
use crate::engine::context::EngineContext;
use crate::engine::output::parse_structured;
use crate::engine::prompt::{marking_system_prompt, marking_user_prompt};
use crate::engine::{
    emit_status, emit_stream_end, emit_stream_error, emit_stream_start, rust_log, validate_model,
};
use crate::models::{
    AppError, BatchMarkItem, BatchMarkRequest, BatchMarkResponse, CommandResult, MarkAnswerRequest,
    MarkAnswerResponse, MarkPdfRequest, MarkPdfResponse, MarkPdfResultItem,
};
use crate::schemas;
use std::time::Instant;

// ─── Public API ───────────────────────────────────────────────────────────────

pub async fn mark_answer(
    ctx: &EngineContext,
    request: MarkAnswerRequest,
) -> CommandResult<MarkAnswerResponse> {
    validate_model(&request.model)?;

    let request_id = generate_request_id();
    emit_stream_start(
        &ctx.app,
        &request_id,
        "marking",
        &request.model,
        Some(request.question.topic.clone()),
        Some(request.question.id.clone()),
    );

    let result: CommandResult<MarkAnswerResponse> = async {
        let start = Instant::now();
        let question = &request.question;

    emit_status(ctx, serde_json::json!({"stage": "building_marking_prompt"}));

    let topic = question.topic.clone();
    let subtopic = question.subtopic.clone().unwrap_or_default();
    let max_marks = question.max_marks;
    let question_text = question.prompt_markdown.clone();
    let student_answer = request.student_answer.clone();

    let marking_guidance = catalog::topic_marking_guidance(&topic);
    let marking_scheme_style = "criterion-per-mark"; // Default style

    let system_prompt = marking_system_prompt(
        max_marks,
        marking_guidance,
        marking_scheme_style,
        request.marker_style.clone(),
        request.custom_marker_style.clone(),
    );

    let report_preamble = if let Some(ref image_url) = request.student_answer_image_data_url {
        if !image_url.is_empty() {
            "\n\nIMAGE ANALYSIS:\nAnalyse the attached image(s) containing the student's handwritten or typed response. Extract all visible mathematical working, chemical equations, and textual reasoning. Use this as the basis for marking."
        } else {
            ""
        }
    } else {
        ""
    };

    let user_prompt = marking_user_prompt(
        &topic,
        &subtopic,
        &question_text,
        max_marks,
        &student_answer,
        report_preamble,
        "",
    );

    let mut user_content = vec![serde_json::json!({ "type": "text", "text": user_prompt })];

    // Add image if provided
    if let Some(ref image_url) = request.student_answer_image_data_url {
        if !image_url.is_empty() {
            user_content.push(serde_json::json!({
                "type": "image_url",
                "image_url": { "url": image_url }
            }));
        }
    }

    // Add multiple images if provided
    if let Some(ref image_urls) = request.student_answer_image_data_urls {
        for url in image_urls {
            if !url.is_empty() {
                user_content.push(serde_json::json!({
                    "type": "image_url",
                    "image_url": { "url": url }
                }));
            }
        }
    }

    let response_format = schemas::marking_format();

    let llm_config = ChatGptConfig::new(&request.model)
        .with_max_tokens(estimate_marking_tokens(max_marks))
        .with_reasoning(
            request.reasoning_enabled,
            request.reasoning_effort.as_deref(),
        )
        .with_request_id(&request_id);

    let completion_request = CompletionRequest::new(
        &system_prompt,
        serde_json::json!(user_content),
        response_format,
    )
    .with_stream(true, Some(question.id.clone()))
    .with_task("marking");

    ctx.check_abort()?;
    emit_status(ctx, serde_json::json!({"stage": "calling_model"}));

    let completion = complete(&llm_config, completion_request, &ctx.app, &ctx.abort_signal)
        .await
        .map_err(|e| {
            AppError::new(
                e.code,
                format!("Marking failed while calling the model: {}", e.message),
            )
        })?;

    emit_status(ctx, serde_json::json!({"stage": "parsing_marking"}));

    let mut response: MarkAnswerResponse = parse_structured(&completion.content).map_err(|e| {
        AppError::new(
            e.code,
            format!(
                "Marking failed while parsing the model response. \
                 ChatGPT returned an invalid structured response. \
                 Original error: {}",
                e.message
            ),
        )
    })?;

    // Ensure max_marks matches the question
    response.max_marks = max_marks;

    // Clamp achieved marks
    response.achieved_marks = response.achieved_marks.min(max_marks);

    // Ensure verdict consistency
    if response.achieved_marks == 0 {
        response.verdict = "Incorrect".to_string();
    } else if response.achieved_marks == max_marks {
        response.verdict = "Correct".to_string();
    } else if response.verdict != "Partial" {
        response.verdict = "Partial".to_string();
    }

    // Set partial reason if needed
    if response.verdict == "Partial" && response.partial_reason.is_empty() {
        response.partial_reason = "PartialUnderstanding".to_string();
    }

        response.prompt_tokens = completion.prompt_tokens;
        response.completion_tokens = completion.completion_tokens;
        response.total_tokens = completion.total_tokens;

        response.estimated_cost_usd = None;

        let duration_ms = start.elapsed().as_millis() as u64;

        rust_log(
            ctx,
            "info",
            &format!(
                "Marked answer: {}/{} in {}ms",
                response.achieved_marks, max_marks, duration_ms
            ),
            Some(serde_json::json!({
                "verdict": &response.verdict,
                "prompt_tokens": completion.prompt_tokens,
                "completion_tokens": completion.completion_tokens,
            })),
        );

        Ok(response)
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

pub async fn batch_mark_answers(
    ctx: &EngineContext,
    request: BatchMarkRequest,
) -> CommandResult<BatchMarkResponse> {
    use futures_util::stream::{self, StreamExt};

    let results: Vec<BatchMarkItem> = stream::iter(request.items)
        .map(|item| {
            let ctx = ctx.clone();
            async move {
                let question_id = item.question.id.clone();
                match mark_answer(&ctx, item).await {
                    Ok(response) => BatchMarkItem {
                        question_id,
                        response: Some(response),
                        error: None,
                    },
                    Err(e) => BatchMarkItem {
                        question_id,
                        response: None,
                        error: Some(e.message),
                    },
                }
            }
        })
        .buffer_unordered(4)
        .collect()
        .await;

    Ok(BatchMarkResponse { results })
}

pub async fn mark_pdf(
    ctx: &EngineContext,
    request: MarkPdfRequest,
) -> CommandResult<MarkPdfResponse> {
    validate_model(&request.model)?;

    let mut results = Vec::new();

    for mapping in request.page_mapping.iter() {
        if let Some(question) = request.questions.get(mapping.question_index) {
            let question_id = question.id.clone();

            // Build per-question mark request with PDF context
            let pdf_note = format!(
                "The student's answer is on PDF page(s): {}. Please mark the answer based on the question text and expected student responses. If page numbers are insufficient to determine the answer, note this in your feedback.",
                mapping.page_indices.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(", ")
            );
            let mark_request = MarkAnswerRequest {
                question: question.clone(),
                student_answer: pdf_note,
                student_answer_image_data_url: None,
                student_answer_image_data_urls: None,
                model: request.model.clone(),
                marker_style: request.marker_style.clone(),
                custom_marker_style: request.custom_marker_style.clone(),
                reasoning_enabled: request.reasoning_enabled,
                reasoning_effort: request.reasoning_effort.clone(),
            };

            match mark_answer(ctx, mark_request).await {
                Ok(response) => {
                    results.push(MarkPdfResultItem {
                        question_id,
                        response: Some(response),
                        error: None,
                    });
                }
                Err(e) => {
                    results.push(MarkPdfResultItem {
                        question_id,
                        response: None,
                        error: Some(e.message),
                    });
                }
            }
        }
    }

    Ok(MarkPdfResponse { results })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn estimate_marking_tokens(max_marks: u8) -> u32 {
    (max_marks as u32 * 300 + 1500).clamp(2000, 8000)
}
