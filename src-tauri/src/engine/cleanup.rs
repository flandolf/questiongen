use crate::engine::context::EngineContext;
use crate::engine::output::parse_structured;
use crate::engine::provider::{complete, CompletionRequest, LlmConfig};
use crate::engine::{rust_log, validate_credentials};
use crate::llm::json_object_format;
use crate::models::{
    CleanupTopicsRequest, CleanupTopicsResponse, CommandResult,
};
use std::collections::HashMap;
use std::time::Instant;

pub async fn cleanup_topics(
    _ctx: &EngineContext,
    request: CleanupTopicsRequest,
) -> CommandResult<CleanupTopicsResponse> {
    validate_credentials(&request.api_key, &request.model)?;

    if request.unknown_topics.is_empty() || request.canonical_topics.is_empty() {
        return Ok(CleanupTopicsResponse {
            topic_mapping: HashMap::new(),
        });
    }

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

    let mut llm_config = LlmConfig::new(&request.api_key, &request.model)
        .with_max_tokens(2000);
    if let Some(ref url) = request.base_url {
        llm_config = llm_config.with_base_url(url);
    }

    let completion_request = CompletionRequest::new(
        system_prompt,
        serde_json::json!(user_prompt),
        json_object_format(),
    );

    let completion = complete(&llm_config, completion_request, &_ctx.app, &_ctx.abort_signal).await?;

    let mappings: MappingsPayload = parse_structured(&completion.content)?;

    let mut topic_mapping = HashMap::new();
    for mapping in mappings.mappings {
        if canonical_topics.contains(&mapping.canonical) {
            topic_mapping.insert(mapping.unknown, mapping.canonical);
        }
    }

    let duration_ms = start.elapsed().as_millis() as u64;

    rust_log(
        _ctx,
        "info",
        &format!(
            "Cleaned up {} topics in {}ms",
            topic_mapping.len(),
            duration_ms
        ),
        None,
    );

    Ok(CleanupTopicsResponse { topic_mapping })
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
