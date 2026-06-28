use crate::engine::context::EngineContext;
use crate::engine::output::parse_structured;
use crate::engine::provider::{complete, CompletionRequest, LlmConfig};
use crate::engine::{
    emit_stream_end, emit_stream_error, emit_stream_start, rust_log, validate_credentials,
};
use crate::llm::generate_request_id;
use crate::llm::json_object_format;
use crate::models::{CleanupTopicsRequest, CleanupTopicsResponse, CommandResult};
use crate::openrouter_info::{compute_generation_cost, get_cached_model_stats};
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
            estimated_cost_usd: None,
        });
    }

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
        "cleanup",
        &provider_id,
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

    let mut llm_config = LlmConfig::new(&request.api_key, &request.model)
        .with_max_tokens(2000)
        .with_request_id(&request_id);
    if let Some(ref url) = request.base_url {
        llm_config = llm_config.with_base_url(url);
    }
    if let Some(ref id) = request.provider_id {
        llm_config = llm_config.with_provider_id(id);
    }

    let completion_request = CompletionRequest::new(
        system_prompt,
        serde_json::json!(user_prompt),
        json_object_format(),
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
