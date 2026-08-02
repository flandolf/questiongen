use crate::engine::chatgpt::{complete, generate_request_id, ChatGptConfig, CompletionRequest};
use crate::engine::context::EngineContext;
use crate::engine::output::parse_structured;
use crate::engine::{
    emit_stream_end, emit_stream_error, emit_stream_start, rust_log, validate_model,
};
use crate::models::{
    CommandResult, DiscoverPdfQuestionsRequest, DiscoverPdfQuestionsResponse, DiscoveredQuestion,
};
use std::time::Instant;

pub async fn discover_pdf_questions(
    ctx: &EngineContext,
    request: DiscoverPdfQuestionsRequest,
) -> CommandResult<DiscoverPdfQuestionsResponse> {
    validate_model(&request.model)?;

    let request_id = generate_request_id();
    emit_stream_start(
        &ctx.app,
        &request_id,
        "pdf-discovery",
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

    let llm_config = ChatGptConfig::new(&request.model)
        .with_max_tokens(6000)
        .with_request_id(&request_id);

    let completion_request = CompletionRequest::new(
        system_prompt,
        serde_json::json!(content_parts),
        serde_json::Value::Null,
    );

    let completion = complete(&llm_config, completion_request, &ctx.app, &ctx.abort_signal).await?;

    let discovered: DiscoveredPayload = parse_structured(&completion.content)?;

    let duration_ms = start.elapsed().as_millis() as u64;

        let estimated_cost_usd = None;

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
