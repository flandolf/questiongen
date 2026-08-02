use crate::engine::chatgpt::{complete, generate_request_id, ChatGptConfig, CompletionRequest};
use crate::engine::context::EngineContext;
use crate::engine::output::parse_structured;
use crate::engine::{
    emit_stream_end, emit_stream_error, emit_stream_start, rust_log, validate_model,
};
use crate::models::{CleanupTopicsRequest, CleanupTopicsResponse, CommandResult};
use std::collections::HashMap;
use std::time::Instant;

pub async fn cleanup_topics(
    _ctx: &EngineContext,
    request: CleanupTopicsRequest,
) -> CommandResult<CleanupTopicsResponse> {
    validate_model(&request.model)?;

    if request.unknown_topics.is_empty() || request.canonical_topics.is_empty() {
        return Ok(CleanupTopicsResponse {
            topic_mapping: HashMap::new(),
            estimated_cost_usd: None,
        });
    }

    let request_id = generate_request_id();
    emit_stream_start(
        &_ctx.app,
        &request_id,
        "cleanup",
        &request.model,
        None,
        None,
    );

    let result: CommandResult<CleanupTopicsResponse> = async {
        let start = Instant::now();

    let canonical_topics: Vec<String> = request
        .canonical_topics
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    let system_prompt = "You are a strict data-cleaning assistant. You MUST output ONLY valid JSON.\nRespond with an object containing a \"mappings\" array. Each item must have\nan \"unknown\" string and a \"canonical\" string.\nExample response:\n{\"mappings\":[{\"unknown\":\"Some Name\",\"canonical\":\"Exact Name\"}]}\nRules:\n- The \"canonical\" value MUST be copied exactly from the canonical list provided.\n- Only include mappings where you are confident.\n- If an input does not match any canonical value, omit it from the array.\n- Do NOT include markdown fences, explanations, or any text outside the JSON.";

    let user_prompt = format!(
        "CANONICAL TOPICS (exact matches only):\n{}\n\nUNKNOWN TOPICS TO MAP:\n{}\n\nMap each unknown topic to the most appropriate canonical topic. Output ONLY JSON with a 'mappings' array.",
        canonical_topics.join("\n"),
        request.unknown_topics.join("\n")
    );

    let llm_config = ChatGptConfig::new(&request.model)
        .with_max_tokens(2000)
        .with_request_id(&request_id);

    let completion_request = CompletionRequest::new(
        system_prompt,
        serde_json::json!(user_prompt),
        serde_json::Value::Null,
    );

    let completion = complete(
        &llm_config,
        completion_request,
        &_ctx.app,
        &_ctx.abort_signal,
    )
    .await?;

    let mappings: MappingsPayload = parse_structured(&completion.content)?;

    let mut topic_mapping = HashMap::new();
    for mapping in mappings.mappings {
        if canonical_topics.contains(&mapping.canonical) {
            topic_mapping.insert(mapping.unknown, mapping.canonical);
        }
    }

    let duration_ms = start.elapsed().as_millis() as u64;

        let estimated_cost_usd = None;

        rust_log(
            _ctx,
            "info",
            &format!(
                "Cleaned up {} topics in {}ms",
                topic_mapping.len(),
                duration_ms
            ),
            Some(serde_json::json!({
                "prompt_tokens": completion.prompt_tokens,
                "completion_tokens": completion.completion_tokens,
                "estimated_cost_usd": estimated_cost_usd,
            })),
        );

        Ok(CleanupTopicsResponse { topic_mapping, estimated_cost_usd })
    }.await;

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

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct MappingsPayload {
    mappings: Vec<Mapping>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Mapping {
    unknown: String,
    canonical: String,
}
