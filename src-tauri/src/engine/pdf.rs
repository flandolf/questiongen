use crate::engine::context::EngineContext;
use crate::engine::output::parse_structured;
use crate::engine::provider::{complete, CompletionRequest, LlmConfig};
use crate::engine::{rust_log, validate_credentials};
use crate::llm::json_object_format;
use crate::models::{
    CommandResult, DiscoverPdfQuestionsRequest, DiscoverPdfQuestionsResponse, DiscoveredQuestion,
};
use std::time::Instant;

pub async fn discover_pdf_questions(
    ctx: &EngineContext,
    request: DiscoverPdfQuestionsRequest,
) -> CommandResult<DiscoverPdfQuestionsResponse> {
    validate_credentials(&request.api_key, &request.model)?;

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

    let mut llm_config = LlmConfig::new(&request.api_key, &request.model).with_max_tokens(6000);
    if let Some(ref url) = request.base_url {
        llm_config = llm_config.with_base_url(url);
    }

    let completion_request = CompletionRequest::new(
        system_prompt,
        serde_json::json!(content_parts),
        json_object_format(),
    );

    let completion = complete(&llm_config, completion_request, &ctx.app, &ctx.abort_signal).await?;

    let discovered: DiscoveredPayload = parse_structured(&completion.content)?;

    let duration_ms = start.elapsed().as_millis() as u64;

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
        })),
    );

    Ok(DiscoverPdfQuestionsResponse {
        questions: discovered.questions,
    })
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscoveredPayload {
    questions: Vec<DiscoveredQuestion>,
}
