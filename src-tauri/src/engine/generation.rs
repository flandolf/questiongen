use crate::catalog;
use crate::engine::context::EngineContext;
use crate::engine::output::{parse_structured_with_meta, StructuredOutput};
use crate::engine::prompt::GenerationPromptParams;
use crate::engine::provider::{complete, CompletionRequest, LlmConfig};
use crate::engine::{
    emit_status, emit_stream_end, emit_stream_error, emit_stream_start, rust_log,
    validate_credentials,
};
use crate::llm::generate_request_id;
use crate::models::{
    AppError, CommandResult, GenerateMcQuestionsRequest, GenerateMcQuestionsResponse,
    GenerateQuestionsRequest, GenerateQuestionsResponse, GeneratedQuestion,
    GenerationQualityDiagnostics, McQuestion,
};
use crate::openrouter_info::compute_generation_cost;
use crate::quality;
use crate::question_traits::{NormalizableQuestion, TechAllowed};
use crate::schemas;
use std::collections::HashSet;
use std::time::Instant;

// ─── Public API ───────────────────────────────────────────────────────────────

pub async fn generate_written_questions(
    ctx: &EngineContext,
    request: GenerateQuestionsRequest,
) -> CommandResult<GenerateQuestionsResponse> {
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
        "generation",
        &provider_id,
        &request.model,
        request.topics.first().cloned(),
        None,
    );

    let result: CommandResult<GenerateQuestionsResponse> = async {
        let start = Instant::now();
        let inputs = validate_and_prepare_inputs(&request)?;

        emit_status(
            ctx,
            serde_json::json!({"stage": "building_prompt", "topic": request.topics.first()}),
        );

        let mut result = run_written_attempt(
            ctx,
            &request,
            &inputs,
            None,
            Vec::new(),
            "initial",
            &request_id,
        )
        .await?;

        // R5 retry gate: defer the predicate to `quality::should_retry` so the
        // policy stays in one place and is unit-testable in isolation. We track
        // `attempts_used` honestly (0 = just made the initial call below).
        let attempts_used: u8 = 0;
        let retry_fired = quality::should_retry(
            result.summary.distinctness_avg,
            result.summary.command_verb_diversity,
            result.questions.len(),
            attempts_used,
        );

        if retry_fired {
            ctx.check_abort()?;
            let texts = GeneratedQuestion::extract_texts(&result.questions);
            let (offender_prompts, anti_verbs) =
                quality::compute_regen_anti_examples(&texts, &result.metrics);
            rust_log(
                ctx,
                "warn",
                "R5 retry triggered (low distinctness/verb diversity)",
                Some(serde_json::json!({
                    "distinctness_avg": result.summary.distinctness_avg,
                    "command_verb_diversity": result.summary.command_verb_diversity,
                    "offender_count": offender_prompts.len(),
                    "anti_verbs": anti_verbs,
                    "topic": request.topics.first(),
                })),
            );
            emit_status(
                ctx,
                serde_json::json!({
                    "stage": "regen_retry",
                    "distinctness_avg": result.summary.distinctness_avg,
                    "verb_diversity": result.summary.command_verb_diversity,
                    "anti_verbs": anti_verbs,
                }),
            );
            // Replace the user-provided priors with the offenders so the retry is
            // explicitly pointed at what went wrong. The note module caps at 3
            // items; if fewer offenders are present we fall back to the user list.
            let prior_overrides = if offender_prompts.is_empty() {
                inputs.prior_question_prompts.clone()
            } else {
                Some(offender_prompts)
            };
            result = run_written_attempt(
                ctx,
                &request,
                &inputs,
                prior_overrides,
                anti_verbs,
                "retry",
                &request_id,
            )
            .await?;
        }

        let duration_ms = start.elapsed().as_millis() as u64;

        rust_log(
            ctx,
            "info",
            &format!(
                "Generated {} written questions in {}ms ({})",
                result.questions.len(),
                duration_ms,
                if retry_fired {
                    "with R5 retry"
                } else {
                    "no retry"
                }
            ),
            Some(serde_json::json!({
                "prompt_tokens": result.prompt_tokens,
                "completion_tokens": result.completion_tokens,
                "total_tokens": result.total_tokens,
                "reasoning_tokens": result.reasoning_tokens,
                "retry_fired": retry_fired,
            })),
        );

        Ok(GenerateQuestionsResponse {
            questions: result.questions,
            duration_ms,
            prompt_tokens: result.prompt_tokens,
            completion_tokens: result.completion_tokens,
            total_tokens: result.total_tokens,
            reasoning_tokens: result.reasoning_tokens,
            estimated_cost_usd: result.cost_usd,
            distinctness_avg: result.summary.distinctness_avg,
            multi_step_depth_avg: result.summary.multi_step_depth_avg,
            command_verb_diversity: result.summary.command_verb_diversity,
            mark_allocation_variance: result.summary.mark_allocation_variance,
            quality_diagnostics: Some(result.diagnostics),
        })
    }
    .await;

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

/// R5 attempt helper: a single end-to-end attempt (build prompt → call model →
/// parse → normalise → score) with optional retry-input overrides.
async fn run_written_attempt(
    ctx: &EngineContext,
    request: &GenerateQuestionsRequest,
    inputs: &PreparedGenerationInputs,
    prior_overrides: Option<Vec<String>>,
    anti_verbs: Vec<String>,
    attempt_label: &'static str,
    request_id: &str,
) -> CommandResult<WrittenAttemptResult> {
    let mut params = build_generation_params(request, inputs);
    params.regen_anti_verbs = anti_verbs;
    if let Some(overrides) = prior_overrides {
        params.prior_question_prompts = Some(overrides);
    }

    let request_base_url = request
        .base_url
        .as_deref()
        .unwrap_or(crate::constants::DEFAULT_OPENROUTER_BASE_URL);
    let system_prompt = crate::engine::prompt::written_system_prompt(
        &request.model,
        request_base_url,
        request.provider_id.as_deref(),
    );
    let user_prompt = params.build_written();

    let response_format = schemas::written_format(
        &request.model,
        request_base_url,
        request.provider_id.as_deref(),
    );
    let max_tokens = estimate_max_tokens(
        request.question_count,
        request.average_marks_per_question,
        false,
    );

    let mut llm_config = LlmConfig::new(&request.api_key, &request.model)
        .with_max_tokens(max_tokens)
        .with_reasoning(
            request.reasoning_enabled.unwrap_or(false),
            request.reasoning_effort.as_deref(),
        )
        .with_temperature(default_written_temperature(&request.difficulty))
        .with_request_id(request_id);
    if let Some(ref url) = request.base_url {
        llm_config = llm_config.with_base_url(url);
    }
    if let Some(ref id) = request.provider_id {
        llm_config = llm_config.with_provider_id(id);
    }

    let user_content = build_user_content_with_pdfs(
        ctx,
        &user_prompt,
        inputs,
        request.include_exam_context.unwrap_or(false),
        request.shuffle_subtopics.unwrap_or(false),
        request.question_count,
    );

    let completion_request = CompletionRequest::new(&system_prompt, user_content, response_format)
        .with_stream(request.question_count >= 3, request.topics.first().cloned());

    ctx.check_abort()?;
    emit_status(
        ctx,
        serde_json::json!({
            "stage": "calling_model",
            "topic": request.topics.first(),
            "attempt": attempt_label,
        }),
    );

    let completion = complete(&llm_config, completion_request, &ctx.app, &ctx.abort_signal).await?;

    emit_status(
        ctx,
        serde_json::json!({"stage": "parsing", "topic": request.topics.first(), "attempt": attempt_label}),
    );

    let structured: StructuredOutput<QuestionsPayload<GeneratedQuestion>> =
        parse_structured_with_meta(
            &completion.content,
            completion.prompt_tokens,
            completion.completion_tokens,
            completion.total_tokens,
            completion.reasoning_tokens,
        )?;

    let mut questions = structured.data.questions;

    let tech_allowed = request.tech_mode.as_deref().unwrap_or("tech-active") == "tech-active";
    for q in &mut questions {
        q.set_tech_allowed(tech_allowed);
    }

    GeneratedQuestion::normalize(&mut questions, &inputs.topics, inputs.subtopics.as_ref());
    GeneratedQuestion::validate(&questions, request.question_count)?;

    let total_marks = inputs.average_marks.unwrap_or(10) as usize * request.question_count;
    GeneratedQuestion::adjust_marks(&mut questions, total_marks);

    emit_status(
        ctx,
        serde_json::json!({"stage": "quality_check", "topic": request.topics.first(), "attempt": attempt_label}),
    );

    let texts = GeneratedQuestion::extract_texts(&questions);
    let mark_values: Vec<u8> = questions.iter().map(|q| q.max_marks).collect();
    let (quality_metrics, summary) = quality::score_batch(&texts, Some(&mark_values));
    for (q, m) in questions.iter_mut().zip(quality_metrics.iter()) {
        q.apply_metrics(m);
    }

    let diagnostics = build_quality_diagnostics(&questions, inputs, &request.topics);

    let stats = crate::openrouter_info::get_cached_model_stats(&request.api_key, &request.model);
    let cost_usd = compute_generation_cost(
        Some(structured.prompt_tokens as u64),
        Some(structured.completion_tokens as u64),
        stats.as_ref().and_then(|s| s.prompt_price_per_token),
        stats.as_ref().and_then(|s| s.completion_price_per_token),
    );

    Ok(WrittenAttemptResult {
        questions,
        metrics: quality_metrics,
        summary,
        diagnostics,
        prompt_tokens: structured.prompt_tokens,
        completion_tokens: structured.completion_tokens,
        total_tokens: structured.total_tokens,
        reasoning_tokens: structured.reasoning_tokens,
        cost_usd,
    })
}

/// Internal result type for `run_written_attempt` and `run_mc_attempt`.
struct WrittenAttemptResult {
    questions: Vec<GeneratedQuestion>,
    metrics: Vec<quality::QuestionQualityMetrics>,
    summary: quality::QualitySummary,
    diagnostics: GenerationQualityDiagnostics,
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
    reasoning_tokens: u32,
    cost_usd: Option<f64>,
}

pub async fn generate_mc_questions(
    ctx: &EngineContext,
    request: GenerateMcQuestionsRequest,
) -> CommandResult<GenerateMcQuestionsResponse> {
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
        "generation",
        &provider_id,
        &request.model,
        request.topics.first().cloned(),
        None,
    );

    let result: CommandResult<GenerateMcQuestionsResponse> = async {
        let start = Instant::now();
        let inputs = validate_and_prepare_mc_inputs(&request)?;

        emit_status(
            ctx,
            serde_json::json!({"stage": "building_prompt", "topic": request.topics.first()}),
        );

        let mut result = run_mc_attempt(
            ctx,
            &request,
            &inputs,
            None,
            Vec::new(),
            "initial",
            &request_id,
        )
        .await?;

        // R5 retry gate: same predicate as the written path so the policy is in
        // one place. `attempts_used` is 0 here because we just made the initial
        // call above; after a retry it would be 1 and the gate would short-circuit.
        let attempts_used: u8 = 0;
        let retry_fired = quality::should_retry(
            result.summary.distinctness_avg,
            result.summary.command_verb_diversity,
            result.questions.len(),
            attempts_used,
        );

        if retry_fired {
            ctx.check_abort()?;
            let texts = McQuestion::extract_texts(&result.questions);
            let (offender_prompts, anti_verbs) =
                quality::compute_regen_anti_examples(&texts, &result.metrics);
            rust_log(
                ctx,
                "warn",
                "R5 retry triggered (low distinctness/verb diversity)",
                Some(serde_json::json!({
                    "mode": "mc",
                    "distinctness_avg": result.summary.distinctness_avg,
                    "command_verb_diversity": result.summary.command_verb_diversity,
                    "offender_count": offender_prompts.len(),
                    "anti_verbs": anti_verbs,
                    "topic": request.topics.first(),
                })),
            );
            emit_status(
                ctx,
                serde_json::json!({
                    "stage": "regen_retry",
                    "mode": "mc",
                    "distinctness_avg": result.summary.distinctness_avg,
                    "verb_diversity": result.summary.command_verb_diversity,
                    "anti_verbs": anti_verbs,
                }),
            );
            let prior_overrides = if offender_prompts.is_empty() {
                inputs.prior_question_prompts.clone()
            } else {
                Some(offender_prompts)
            };
            result = run_mc_attempt(
                ctx,
                &request,
                &inputs,
                prior_overrides,
                anti_verbs,
                "retry",
                &request_id,
            )
            .await?;
        }

        let duration_ms = start.elapsed().as_millis() as u64;

        rust_log(
            ctx,
            "info",
            &format!(
                "Generated {} MC questions in {}ms ({})",
                result.questions.len(),
                duration_ms,
                if retry_fired {
                    "with R5 retry"
                } else {
                    "no retry"
                }
            ),
            Some(serde_json::json!({
                "prompt_tokens": result.prompt_tokens,
                "completion_tokens": result.completion_tokens,
                "total_tokens": result.total_tokens,
                "reasoning_tokens": result.reasoning_tokens,
                "retry_fired": retry_fired,
            })),
        );

        Ok(GenerateMcQuestionsResponse {
            questions: result.questions,
            duration_ms,
            prompt_tokens: result.prompt_tokens,
            completion_tokens: result.completion_tokens,
            total_tokens: result.total_tokens,
            reasoning_tokens: result.reasoning_tokens,
            estimated_cost_usd: result.cost_usd,
            distinctness_avg: result.summary.distinctness_avg,
            multi_step_depth_avg: result.summary.multi_step_depth_avg,
            command_verb_diversity: result.summary.command_verb_diversity,
            mark_allocation_variance: result.summary.mark_allocation_variance,
            quality_diagnostics: Some(result.diagnostics),
        })
    }
    .await;

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

/// R5 attempt helper for MC questions — symmetric to `run_written_attempt`.
async fn run_mc_attempt(
    ctx: &EngineContext,
    request: &GenerateMcQuestionsRequest,
    inputs: &PreparedGenerationInputs,
    prior_overrides: Option<Vec<String>>,
    anti_verbs: Vec<String>,
    attempt_label: &'static str,
    request_id: &str,
) -> CommandResult<McAttemptResult> {
    let mut params = build_mc_generation_params(request, inputs);
    params.regen_anti_verbs = anti_verbs;
    if let Some(overrides) = prior_overrides {
        params.prior_question_prompts = Some(overrides);
    }

    let request_base_url = request
        .base_url
        .as_deref()
        .unwrap_or(crate::constants::DEFAULT_OPENROUTER_BASE_URL);
    let system_prompt = crate::engine::prompt::mc_system_prompt(
        &request.model,
        request_base_url,
        request.provider_id.as_deref(),
    );
    let user_prompt = params.build_mc();

    let response_format = schemas::mc_format(
        &request.model,
        request_base_url,
        request.provider_id.as_deref(),
    );
    let max_tokens = estimate_max_tokens(request.question_count, None, true);

    let mut llm_config = LlmConfig::new(&request.api_key, &request.model)
        .with_max_tokens(max_tokens)
        .with_reasoning(
            request.reasoning_enabled.unwrap_or(false),
            request.reasoning_effort.as_deref(),
        )
        .with_request_id(request_id);
    if let Some(ref url) = request.base_url {
        llm_config = llm_config.with_base_url(url);
    }
    if let Some(ref id) = request.provider_id {
        llm_config = llm_config.with_provider_id(id);
    }

    // R10: Use MC temperature default (0.3) if user did not override.
    if let Some(temp) = request.temperature {
        llm_config = llm_config.with_temperature(temp);
    } else {
        llm_config = llm_config.with_temperature(crate::constants::DEFAULT_TEMPERATURE_MC);
    }

    let user_content = build_user_content_with_pdfs(
        ctx,
        &user_prompt,
        inputs,
        request.include_exam_context.unwrap_or(false),
        request.shuffle_subtopics.unwrap_or(false),
        request.question_count,
    );

    let completion_request = CompletionRequest::new(&system_prompt, user_content, response_format)
        .with_stream(request.question_count >= 3, request.topics.first().cloned());

    ctx.check_abort()?;
    emit_status(
        ctx,
        serde_json::json!({
            "stage": "calling_model",
            "mode": "mc",
            "topic": request.topics.first(),
            "attempt": attempt_label,
        }),
    );

    let completion = complete(&llm_config, completion_request, &ctx.app, &ctx.abort_signal).await?;

    emit_status(
        ctx,
        serde_json::json!({"stage": "parsing", "mode": "mc", "topic": request.topics.first(), "attempt": attempt_label}),
    );

    let structured: StructuredOutput<QuestionsPayload<McQuestion>> = parse_structured_with_meta(
        &completion.content,
        completion.prompt_tokens,
        completion.completion_tokens,
        completion.total_tokens,
        completion.reasoning_tokens,
    )?;

    let mut questions = structured.data.questions;

    let tech_allowed = request.tech_mode.as_deref().unwrap_or("tech-active") == "tech-active";
    for q in &mut questions {
        q.set_tech_allowed(tech_allowed);
    }

    McQuestion::normalize(&mut questions, &inputs.topics, inputs.subtopics.as_ref());
    McQuestion::validate(&questions, request.question_count)?;

    emit_status(
        ctx,
        serde_json::json!({"stage": "quality_check", "mode": "mc", "topic": request.topics.first(), "attempt": attempt_label}),
    );

    let texts = McQuestion::extract_texts(&questions);
    let (quality_metrics, summary) = quality::score_batch(&texts, None);
    for (q, m) in questions.iter_mut().zip(quality_metrics.iter()) {
        q.apply_metrics(m);
    }

    let diagnostics = build_mc_quality_diagnostics(&questions, inputs, &request.topics);

    let stats = crate::openrouter_info::get_cached_model_stats(&request.api_key, &request.model);
    let cost_usd = compute_generation_cost(
        Some(structured.prompt_tokens as u64),
        Some(structured.completion_tokens as u64),
        stats.as_ref().and_then(|s| s.prompt_price_per_token),
        stats.as_ref().and_then(|s| s.completion_price_per_token),
    );

    Ok(McAttemptResult {
        questions,
        metrics: quality_metrics,
        summary,
        diagnostics,
        prompt_tokens: structured.prompt_tokens,
        completion_tokens: structured.completion_tokens,
        total_tokens: structured.total_tokens,
        reasoning_tokens: structured.reasoning_tokens,
        cost_usd,
    })
}

struct McAttemptResult {
    questions: Vec<McQuestion>,
    metrics: Vec<quality::QuestionQualityMetrics>,
    summary: quality::QualitySummary,
    diagnostics: GenerationQualityDiagnostics,
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
    reasoning_tokens: u32,
    cost_usd: Option<f64>,
}

// ─── Internal Types ───────────────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct QuestionsPayload<Q> {
    questions: Vec<Q>,
}

struct PreparedGenerationInputs {
    topics: Vec<String>,
    subtopics: Option<Vec<String>>,
    custom_focus_area: Option<String>,
    prior_question_prompts: Option<Vec<String>>,
    average_marks: Option<u8>,
}

// ─── Input Validation ─────────────────────────────────────────────────────────

fn validate_and_prepare_inputs(
    request: &GenerateQuestionsRequest,
) -> CommandResult<PreparedGenerationInputs> {
    let topics = normalize_unique_strings(&request.topics, false);
    if topics.is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "At least one topic required.",
        ));
    }

    let mut subtopics = request
        .subtopics
        .as_ref()
        .map(|s| normalize_unique_strings(s, true));

    // Merge custom_subtopics into selected subtopics
    if let Some(ref custom) = request.custom_subtopics {
        for (topic_key, custom_list) in custom {
            if topics.iter().any(|t| t.eq_ignore_ascii_case(topic_key)) {
                let custom_subs = normalize_unique_strings(custom_list, true);
                if let Some(ref mut subs) = subtopics {
                    for s in custom_subs {
                        if !subs
                            .iter()
                            .any(|existing| existing.eq_ignore_ascii_case(&s))
                        {
                            subs.push(s);
                        }
                    }
                } else {
                    subtopics = Some(custom_subs);
                }
            }
        }
    }

    let custom_focus_area = normalize_optional_text(request.custom_focus_area.as_ref());
    let prior_question_prompts = request.prior_question_prompts.as_ref().map(|p| {
        p.iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
    });

    if request.question_count == 0 || request.question_count > crate::constants::MAX_QUESTION_COUNT
    {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "question_count must be 1-20.",
        ));
    }

    let average_marks = request.average_marks_per_question;

    Ok(PreparedGenerationInputs {
        topics,
        subtopics,
        custom_focus_area,
        prior_question_prompts,
        average_marks,
    })
}

fn validate_and_prepare_mc_inputs(
    request: &GenerateMcQuestionsRequest,
) -> CommandResult<PreparedGenerationInputs> {
    let topics = normalize_unique_strings(&request.topics, false);
    if topics.is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "At least one topic required.",
        ));
    }

    let mut subtopics = request
        .subtopics
        .as_ref()
        .map(|s| normalize_unique_strings(s, true));

    // Merge custom_subtopics into selected subtopics
    if let Some(ref custom) = request.custom_subtopics {
        for (topic_key, custom_list) in custom {
            if topics.iter().any(|t| t.eq_ignore_ascii_case(topic_key)) {
                let custom_subs = normalize_unique_strings(custom_list, true);
                if let Some(ref mut subs) = subtopics {
                    for s in custom_subs {
                        if !subs
                            .iter()
                            .any(|existing| existing.eq_ignore_ascii_case(&s))
                        {
                            subs.push(s);
                        }
                    }
                } else {
                    subtopics = Some(custom_subs);
                }
            }
        }
    }

    let custom_focus_area = normalize_optional_text(request.custom_focus_area.as_ref());
    let prior_question_prompts = request.prior_question_prompts.as_ref().map(|p| {
        p.iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
    });

    if request.question_count == 0 || request.question_count > crate::constants::MAX_QUESTION_COUNT
    {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "question_count must be 1-20.",
        ));
    }

    let average_marks = request.average_marks_per_question;

    Ok(PreparedGenerationInputs {
        topics,
        subtopics,
        custom_focus_area,
        prior_question_prompts,
        average_marks,
    })
}

// ─── Prompt Building ──────────────────────────────────────────────────────────

fn build_generation_params(
    request: &GenerateQuestionsRequest,
    inputs: &PreparedGenerationInputs,
) -> GenerationPromptParams {
    GenerationPromptParams {
        count: request.question_count,
        topics: inputs.topics.clone(),
        difficulty: request.difficulty.clone(),
        average_marks: inputs.average_marks,
        subtopics: inputs.subtopics.clone(),
        custom_focus_area: inputs.custom_focus_area.clone(),
        tech_mode: request
            .tech_mode
            .clone()
            .unwrap_or_else(|| "tech-active".to_string()),
        include_exam_context: request.include_exam_context.unwrap_or(false),
        avoid_similar_questions: request.avoid_similar_questions.unwrap_or(false),
        diversity_enabled: request.diversity_enabled.unwrap_or(false),
        shuffle_subtopics: request.shuffle_subtopics.unwrap_or(false),
        prior_question_prompts: inputs.prior_question_prompts.clone(),
        regen_anti_verbs: Vec::new(),
    }
}

fn build_mc_generation_params(
    request: &GenerateMcQuestionsRequest,
    inputs: &PreparedGenerationInputs,
) -> GenerationPromptParams {
    GenerationPromptParams {
        count: request.question_count,
        topics: inputs.topics.clone(),
        difficulty: request.difficulty.clone(),
        average_marks: inputs.average_marks,
        subtopics: inputs.subtopics.clone(),
        custom_focus_area: inputs.custom_focus_area.clone(),
        tech_mode: request
            .tech_mode
            .clone()
            .unwrap_or_else(|| "tech-active".to_string()),
        include_exam_context: request.include_exam_context.unwrap_or(false),
        avoid_similar_questions: request.avoid_similar_questions.unwrap_or(false),
        diversity_enabled: request.diversity_enabled.unwrap_or(false),
        shuffle_subtopics: request.shuffle_subtopics.unwrap_or(false),
        prior_question_prompts: inputs.prior_question_prompts.clone(),
        regen_anti_verbs: Vec::new(),
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn build_user_content_with_pdfs(
    ctx: &EngineContext,
    user_prompt: &str,
    inputs: &PreparedGenerationInputs,
    include_exam_context: bool,
    shuffle_subtopics: bool,
    question_count: usize,
) -> serde_json::Value {
    let mut user_content: Vec<serde_json::Value> =
        vec![serde_json::json!({ "type": "text", "text": user_prompt })];

    if include_exam_context {
        let exam_parts = crate::pdf::build_exam_file_parts(&ctx.app, &inputs.topics);
        user_content.extend(exam_parts);
        let report_parts = crate::pdf::build_report_file_parts(&ctx.app, &inputs.topics);
        user_content.extend(report_parts);

        let reanchor = crate::engine::prompt::pdf_reanchor_note(
            inputs.subtopics.as_ref(),
            inputs.custom_focus_area.as_deref(),
            shuffle_subtopics,
            question_count,
        );
        if !reanchor.is_empty() {
            user_content.push(serde_json::json!({ "type": "text", "text": reanchor }));
        }
    }

    serde_json::json!(user_content)
}

fn normalize_unique_strings(values: &[String], is_subtopic: bool) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut cleaned = Vec::new();

    for value in values {
        let stripped = if is_subtopic {
            crate::topic_normalize::strip_subtopic_scope(value)
        } else {
            value.trim().to_string()
        };

        if stripped.is_empty() {
            continue;
        }

        let key = stripped.to_ascii_lowercase();
        if seen.insert(key) {
            cleaned.push(stripped);
        }
    }

    cleaned
}

fn normalize_optional_text(value: Option<&String>) -> Option<String> {
    value
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .map(str::to_string)
}

fn default_written_temperature(difficulty: &str) -> f32 {
    match difficulty.to_ascii_lowercase().as_str() {
        "hard" => crate::constants::DEFAULT_TEMPERATURE_WRITTEN_HARD,
        "extreme" => crate::constants::DEFAULT_TEMPERATURE_WRITTEN_EXTREME,
        _ => crate::constants::DEFAULT_TEMPERATURE_WRITTEN,
    }
}

fn estimate_max_tokens(question_count: usize, average_marks: Option<u8>, is_mc: bool) -> u32 {
    if is_mc {
        (question_count as u32 * 400 + 500).clamp(1500, 8000)
    } else {
        let marks = average_marks.unwrap_or(10) as u32;
        (question_count as u32 * marks * 80 + 1000).clamp(2000, 12000)
    }
}

fn build_quality_diagnostics(
    questions: &[GeneratedQuestion],
    inputs: &PreparedGenerationInputs,
    topics: &[String],
) -> GenerationQualityDiagnostics {
    let selected_subtopics = inputs.subtopics.clone().unwrap_or_default();
    let covered: HashSet<String> = questions
        .iter()
        .filter_map(|q| q.subtopic.clone())
        .map(|s| s.to_ascii_lowercase())
        .collect();

    let uncovered: Vec<String> = selected_subtopics
        .iter()
        .filter(|s| !covered.contains(&s.to_ascii_lowercase()))
        .cloned()
        .collect();

    let out_of_scope: Vec<String> = questions
        .iter()
        .filter_map(|q| q.subtopic.as_ref())
        .filter(|sub| {
            let sub_low = sub.to_ascii_lowercase();
            topics.iter().any(|topic| {
                catalog::topic_out_of_scope(topic)
                    .iter()
                    .any(|oos| oos.to_ascii_lowercase() == sub_low)
                    || catalog::find_subtopic(topic, sub)
                        .map(|e| {
                            !e.out_of_scope.is_empty()
                                && e.out_of_scope
                                    .iter()
                                    .any(|o| o.to_ascii_lowercase() == sub_low)
                        })
                        .unwrap_or(false)
            })
        })
        .cloned()
        .collect();

    let latex_issues: Vec<String> = questions
        .iter()
        .filter_map(|q| {
            let prompt = &q.prompt_markdown;
            if prompt.contains("\\begin{array}") && !prompt.contains("\\\\") {
                Some(format!("Q{}: array without \\", q.id))
            } else {
                None
            }
        })
        .collect();

    GenerationQualityDiagnostics {
        selected_subtopics: selected_subtopics.clone(),
        covered_subtopics: covered.into_iter().collect(),
        uncovered_subtopics: uncovered,
        out_of_scope_subtopics: out_of_scope,
        latex_issue_count: latex_issues.len(),
        latex_issue_examples: latex_issues.into_iter().take(3).collect(),
    }
}

fn build_mc_quality_diagnostics(
    questions: &[McQuestion],
    inputs: &PreparedGenerationInputs,
    _topics: &[String],
) -> GenerationQualityDiagnostics {
    let selected_subtopics = inputs.subtopics.clone().unwrap_or_default();
    let covered: HashSet<String> = questions
        .iter()
        .filter_map(|q| q.subtopic.clone())
        .map(|s| s.to_ascii_lowercase())
        .collect();

    let uncovered: Vec<String> = selected_subtopics
        .iter()
        .filter(|s| !covered.contains(&s.to_ascii_lowercase()))
        .cloned()
        .collect();

    GenerationQualityDiagnostics {
        selected_subtopics: selected_subtopics.clone(),
        covered_subtopics: covered.into_iter().collect(),
        uncovered_subtopics: uncovered,
        out_of_scope_subtopics: Vec::new(),
        latex_issue_count: 0,
        latex_issue_examples: Vec::new(),
    }
}
