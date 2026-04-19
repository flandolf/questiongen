use crate::catalog;
use crate::constants;
use crate::difficulty;
use crate::envelope::normalise_envelope;
use crate::json_input::{extract_json_array, extract_json_object};
use crate::latex;
use crate::models::{
    AnalyzeImageRequest, AnalyzeImageResponse, AppError, CommandResult, GenerateMcQuestionsRequest,
    GenerateMcQuestionsResponse, GenerateQuestionsRequest, GenerateQuestionsResponse,
    GeneratedQuestion, GenerationQualityDiagnostics, MarkAnswerRequest, MarkAnswerResponse,
    McQuestion,
};
use crate::normalization;
use crate::openrouter::{call_openrouter, OpenRouterRequestConfig};
use crate::openrouter_info::{compute_generation_cost, get_model_stats};
use crate::parsing::protect_latex_in_raw_json;
use crate::pdf;
use crate::prompts;
use crate::quality;
use crate::schemas;
use crate::text_clean::{clean_field, sanitize_for_api};
use std::collections::HashSet;
use std::time::Instant;
use tauri::Emitter;

/// Orchestrates interaction with AI models for question generation and marking.
///
/// This service handles prompt construction, API communication with OpenRouter,
/// and post-processing of model outputs (normalization and validation).
pub struct GenerationService {
    app: tauri::AppHandle,
}

struct PreparedGenerationInputs {
    topics: Vec<String>,
    subtopics: Option<Vec<String>>,
    custom_focus_area: Option<String>,
    prior_question_prompts: Option<Vec<String>>,
    average_marks: Option<u8>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionsPayload<Q> {
    pub questions: Vec<Q>,
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

fn validate_and_prepare_generation_inputs(
    topics: &[String],
    subtopics: Option<&Vec<String>>,
    custom_focus_area: Option<&String>,
    prior_question_prompts: Option<&Vec<String>>,
    average_marks: Option<u8>,
    question_count: usize,
) -> CommandResult<PreparedGenerationInputs> {
    let topics = normalize_unique_strings(topics, false);
    if topics.is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Select at least one topic.",
        ));
    }

    if question_count == 0 || question_count > constants::MAX_QUESTION_COUNT {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            format!(
                "Question count must be 1–{}.",
                constants::MAX_QUESTION_COUNT
            ),
        ));
    }

    let catalog_topics: HashSet<String> = catalog::topic_names()
        .into_iter()
        .map(|t| t.to_ascii_lowercase())
        .collect();
    let unknown_topics: Vec<String> = topics
        .iter()
        .filter(|topic| !catalog_topics.contains(&topic.to_ascii_lowercase()))
        .cloned()
        .collect();
    if !unknown_topics.is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            format!("Unknown topic(s): {}.", unknown_topics.join(", ")),
        ));
    }

    let subtopics: Option<Vec<String>> = subtopics
        .map(|items| normalize_unique_strings(items, true))
        .filter(|s| !s.is_empty());
    if let Some(ref selected_subtopics) = subtopics {
        let selected_topics: HashSet<String> =
            topics.iter().map(|t| t.to_ascii_lowercase()).collect();
        let allowed_subtopics: HashSet<String> = catalog::all_topics()
            .iter()
            .filter(|topic| selected_topics.contains(&topic.name.to_ascii_lowercase()))
            .flat_map(|topic| topic.subtopics.iter())
            .map(|subtopic| subtopic.name.to_ascii_lowercase())
            .collect();

        let unknown_subtopics: Vec<String> = selected_subtopics
            .iter()
            .filter(|subtopic| !allowed_subtopics.contains(&subtopic.to_ascii_lowercase()))
            .cloned()
            .collect();

        if !unknown_subtopics.is_empty() {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!(
                    "Unknown subtopic(s) for the selected topic(s): {}.",
                    unknown_subtopics.join(", ")
                ),
            ));
        }
    }

    if let Some(marks) = average_marks {
        if marks == 0 || marks > constants::MAX_MARKS_PER_QUESTION {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!(
                    "Average marks per question must be 1–{}.",
                    constants::MAX_MARKS_PER_QUESTION
                ),
            ));
        }
    }

    Ok(PreparedGenerationInputs {
        topics,
        subtopics,
        custom_focus_area: normalize_optional_text(custom_focus_area),
        prior_question_prompts: prior_question_prompts
            .map(|prompts| normalize_unique_strings(prompts, false))
            .filter(|prompts| !prompts.is_empty()),
        average_marks,
    })
}

#[allow(clippy::too_many_arguments)]
fn estimate_completion_budget(
    question_count: usize,
    average_marks: u8,
    difficulty: &str,
    include_exam_context: bool,
    topic_count: usize,
    subtopic_count: usize,
    prior_question_count: usize,
    has_custom_focus_area: bool,
    avoid_similar_questions: bool,
) -> u32 {
    let base_per_question = match average_marks {
        1..=3 => 1800,
        4..=7 => 2500,
        8..=15 => 3500,
        16..=30 => 4500,
        _ => 3000,
    };

    let difficulty_multiplier = match difficulty.to_ascii_lowercase().as_str() {
        "essential skills" => 0.85,
        "easy" => 0.95,
        "medium" => 1.0,
        "hard" => 1.25,
        "extreme" => 1.45,
        _ => 1.0,
    };

    let topic_multiplier = 1.0 + (topic_count.saturating_sub(1).min(3) as f32 * 0.05);
    let subtopic_multiplier = if subtopic_count == 0 {
        1.0
    } else {
        1.0 + (subtopic_count.min(6) as f32 * 0.04)
    };
    let prior_example_multiplier = 1.0 + (prior_question_count.min(6) as f32 * 0.02);
    let custom_focus_multiplier = if has_custom_focus_area { 1.08 } else { 1.0 };
    let similarity_multiplier = if avoid_similar_questions { 1.05 } else { 1.0 };
    let pdf_overhead = if include_exam_context { 1200 } else { 0 };

    let estimated = question_count as f32
        * base_per_question as f32
        * difficulty_multiplier
        * topic_multiplier
        * subtopic_multiplier
        * prior_example_multiplier
        * custom_focus_multiplier
        * similarity_multiplier;

    (estimated as u32 + pdf_overhead + 2000).clamp(3000, 64_000)
}

pub trait GenerationRequestTrait {
    fn topics(&self) -> &[String];
    fn subtopics(&self) -> Option<&Vec<String>>;
    fn custom_focus_area(&self) -> Option<&String>;
    fn prior_question_prompts(&self) -> Option<&Vec<String>>;
    fn average_marks(&self) -> Option<u8>;
    fn difficulty(&self) -> &str;
    fn model(&self) -> &str;
    fn api_key(&self) -> &str;
    fn include_exam_context(&self) -> bool;
    fn strict_latex_validation(&self) -> bool;
    fn diversity_strictness(&self) -> Option<&str>;
    fn ai_difficulty_scaling_enabled(&self) -> bool;
    fn recent_average_score(&self) -> Option<f64>;
    fn recent_difficulty(&self) -> Option<&str>;
    fn avoid_similar_questions(&self) -> bool;
    fn shuffle_subtopics(&self) -> bool;
    fn tech_mode(&self) -> Option<&str>;
    fn question_count(&self) -> usize;
}

impl GenerationRequestTrait for GenerateQuestionsRequest {
    fn topics(&self) -> &[String] {
        &self.topics
    }
    fn subtopics(&self) -> Option<&Vec<String>> {
        self.subtopics.as_ref()
    }
    fn custom_focus_area(&self) -> Option<&String> {
        self.custom_focus_area.as_ref()
    }
    fn prior_question_prompts(&self) -> Option<&Vec<String>> {
        self.prior_question_prompts.as_ref()
    }
    fn average_marks(&self) -> Option<u8> {
        self.average_marks_per_question
    }
    fn difficulty(&self) -> &str {
        &self.difficulty
    }
    fn model(&self) -> &str {
        &self.model
    }
    fn api_key(&self) -> &str {
        &self.api_key
    }
    fn include_exam_context(&self) -> bool {
        self.include_exam_context.unwrap_or(false)
    }
    fn strict_latex_validation(&self) -> bool {
        self.strict_latex_validation.unwrap_or(false)
    }
    fn diversity_strictness(&self) -> Option<&str> {
        self.diversity_strictness.as_deref()
    }
    fn ai_difficulty_scaling_enabled(&self) -> bool {
        self.ai_difficulty_scaling_enabled.unwrap_or(false)
    }
    fn recent_average_score(&self) -> Option<f64> {
        self.recent_average_score
    }
    fn recent_difficulty(&self) -> Option<&str> {
        self.recent_difficulty.as_deref()
    }
    fn avoid_similar_questions(&self) -> bool {
        self.avoid_similar_questions.unwrap_or(false)
    }
    fn shuffle_subtopics(&self) -> bool {
        self.shuffle_subtopics.unwrap_or(false)
    }
    fn tech_mode(&self) -> Option<&str> {
        self.tech_mode.as_deref()
    }
    fn question_count(&self) -> usize {
        self.question_count
    }
}

impl GenerationRequestTrait for GenerateMcQuestionsRequest {
    fn topics(&self) -> &[String] {
        &self.topics
    }
    fn subtopics(&self) -> Option<&Vec<String>> {
        self.subtopics.as_ref()
    }
    fn custom_focus_area(&self) -> Option<&String> {
        self.custom_focus_area.as_ref()
    }
    fn prior_question_prompts(&self) -> Option<&Vec<String>> {
        self.prior_question_prompts.as_ref()
    }
    fn average_marks(&self) -> Option<u8> {
        self.average_marks_per_question
    }
    fn difficulty(&self) -> &str {
        &self.difficulty
    }
    fn model(&self) -> &str {
        &self.model
    }
    fn api_key(&self) -> &str {
        &self.api_key
    }
    fn include_exam_context(&self) -> bool {
        self.include_exam_context.unwrap_or(false)
    }
    fn strict_latex_validation(&self) -> bool {
        self.strict_latex_validation.unwrap_or(false)
    }
    fn diversity_strictness(&self) -> Option<&str> {
        self.diversity_strictness.as_deref()
    }
    fn ai_difficulty_scaling_enabled(&self) -> bool {
        self.ai_difficulty_scaling_enabled.unwrap_or(false)
    }
    fn recent_average_score(&self) -> Option<f64> {
        self.recent_average_score
    }
    fn recent_difficulty(&self) -> Option<&str> {
        self.recent_difficulty.as_deref()
    }
    fn avoid_similar_questions(&self) -> bool {
        self.avoid_similar_questions.unwrap_or(false)
    }
    fn shuffle_subtopics(&self) -> bool {
        self.shuffle_subtopics.unwrap_or(false)
    }
    fn tech_mode(&self) -> Option<&str> {
        self.tech_mode.as_deref()
    }
    fn question_count(&self) -> usize {
        self.question_count
    }
}

impl GenerationService {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self { app }
    }

    async fn execute_generation_pipeline<Q>(
        &self,
        request: &impl GenerationRequestTrait,
        is_mc: bool,
    ) -> CommandResult<(
        Vec<Q>,
        u64,
        u32,
        u32,
        u32,
        Option<f64>,
        quality::QualitySummary,
        Option<GenerationQualityDiagnostics>,
    )>
    where
        Q: NormalizableQuestion + Clone + serde::Serialize + for<'de> serde::Deserialize<'de>,
    {
        let topics = normalize_unique_strings(request.topics(), false);
        let prepared = validate_and_prepare_generation_inputs(
            &topics,
            request.subtopics(),
            request.custom_focus_area(),
            request.prior_question_prompts(),
            request.average_marks(),
            request.question_count(),
        )?;
        let PreparedGenerationInputs {
            topics,
            subtopics,
            custom_focus_area,
            prior_question_prompts,
            average_marks,
        } = prepared;

        let started = Instant::now();
        let selected_subs = subtopics.as_ref();
        let tech_mode = self.resolve_tech_mode(request.tech_mode());
        let include_exam_context = request.include_exam_context();
        let strict_latex_validation = request.strict_latex_validation();
        let (distinctness_threshold, per_question_distinctness_threshold) =
            self.diversity_thresholds(request.diversity_strictness());

        let adjusted_difficulty = difficulty::adjust_difficulty(
            request.difficulty(),
            request.ai_difficulty_scaling_enabled(),
            request.recent_average_score(),
            request.recent_difficulty(),
        );

        let average_marks_val = average_marks.unwrap_or(if is_mc { 1 } else { 10 });
        let total_marks = average_marks_val as usize * request.question_count();
        let mode_str = if is_mc { "multiple-choice" } else { "written" };

        self.emit_generation_status(serde_json::json!({
            "mode": mode_str, "stage": "preparing",
            "message": "Building prompt.", "attempt": 1
        }));

        let prompt_builder = prompts::UserPromptBuilder {
            count: request.question_count(),
            topics: topics.clone(),
            difficulty: adjusted_difficulty.clone(),
            average_marks: if is_mc { None } else { Some(average_marks_val) },
            subtopics: subtopics.clone(),
            custom_focus_area: custom_focus_area.clone(),
            tech_mode: tech_mode.to_string(),
            include_exam_context,
            avoid_similar_questions: request.avoid_similar_questions(),
            shuffle_subtopics: request.shuffle_subtopics(),
            prior_question_prompts: prior_question_prompts.clone(),
        };
        let prompt = if is_mc {
            prompt_builder.build_mc()
        } else {
            prompt_builder.build_written()
        };

        self.emit_generation_status(serde_json::json!({
            "mode": mode_str, "stage": "generating",
            "message": format!("Generating {} questions…", request.question_count()),
            "attempt": 1
        }));

        let sys_prompt = if is_mc {
            prompts::mc_system()
        } else {
            prompts::written_system()
        };
        let format = if is_mc {
            schemas::mc_format(request.model())
        } else {
            schemas::written_format(request.model())
        };
        let max_tokens = self.calculate_optimal_max_tokens(
            request.question_count(),
            average_marks_val,
            &adjusted_difficulty,
            include_exam_context,
            topics.len(),
            subtopics.as_ref().map_or(0, Vec::len),
            prior_question_prompts.as_ref().map_or(0, Vec::len),
            custom_focus_area.is_some(),
            request.avoid_similar_questions(),
        );

        let stats_result =
            get_model_stats(request.api_key().to_string(), request.model().to_string()).await;
        let supports_files = stats_result.as_ref().ok().is_some_and(|s| s.supports_files);
        let plugins = pdf::plugins_for_model(supports_files);

        let user_content = if include_exam_context {
            let mut parts = vec![serde_json::json!({ "type": "text", "text": prompt })];
            parts.extend(pdf::build_exam_file_parts(&self.app, &topics));
            parts.extend(pdf::build_report_file_parts(&self.app, &topics));
            let reanchor = sanitize_for_api(&prompts::pdf_reanchor_note(
                selected_subs,
                custom_focus_area.as_deref(),
                request.shuffle_subtopics(),
                request.question_count(),
            ));
            parts.push(serde_json::json!({ "type": "text", "text": reanchor }));
            serde_json::Value::Array(parts)
        } else {
            serde_json::Value::String(prompt)
        };

        let result = call_openrouter(
            OpenRouterRequestConfig::new(
                request.api_key(),
                request.model(),
                &sys_prompt,
                user_content,
                format.clone(),
                max_tokens,
            )
            .with_plugins(plugins.clone())
            .with_stream(self.app.clone(), topics.first().map(|s| s.to_string())),
        )
        .await?;

        self.emit_generation_status(serde_json::json!({
            "mode": mode_str, "stage": "parsing",
            "message": "Parsing and validating questions.",
            "attempt": 1
        }));

        let mut payload: QuestionsPayload<Q> = self.parse_payload(&result.content)?;
        Q::normalize(&mut payload.questions, &topics, selected_subs);
        Q::validate(&payload.questions, request.question_count())?;
        self.apply_tech_override(&mut payload.questions, tech_mode);

        let latex_issue_examples = self.collect_latex_issues(&payload.questions, is_mc);
        if strict_latex_validation && !latex_issue_examples.is_empty() {
            return Err(AppError::new("VALIDATION_ERROR", format!("Generated output failed strict LaTeX validation ({} issue(s)); first issue: {}", latex_issue_examples.len(), latex_issue_examples[0])));
        }

        Q::adjust_marks(&mut payload.questions, total_marks);

        let texts = Q::extract_texts(&payload.questions);
        let marks: Vec<u8> = payload
            .questions
            .iter()
            .map(|q| q.get_max_marks())
            .collect();
        let (mut metrics, mut summary) = quality::score_batch(&texts, Some(&marks));
        if is_mc {
            summary.mark_allocation_variance = Some(0.0);
        }

        for (q, metric) in payload.questions.iter_mut().zip(metrics.iter()) {
            q.apply_metrics(metric);
        }

        let mut final_prompt_tokens = result.prompt_tokens;
        let mut final_completion_tokens = result.completion_tokens;
        let mut final_total_tokens = result.total_tokens;

        let mut retry_deficit = self.retry_deficit(
            &summary,
            &metrics,
            distinctness_threshold,
            per_question_distinctness_threshold,
            request.avoid_similar_questions(),
            &adjusted_difficulty,
            is_mc,
        );

        if retry_deficit > 0.0 {
            let mut attempts = 0;
            while retry_deficit > 0.0 && attempts < 2 {
                attempts += 1;
                self.emit_generation_status(serde_json::json!({ "mode": mode_str, "stage": "regenerating-duplicates", "message": format!("Regenerating to improve quality (attempt {})...", attempts), "attempt": attempts + 1 }));

                let diversity_note = "\nDIVERSITY REGENERATION: The previous output contained similar questions. Now generate a new set of questions, replacing any that are similar with entirely different scenarios, contexts, names, numbers, or methods. Do NOT paraphrase previous questions; invent fresh contexts. Increase creativity and change details.";
                let adaptive_note = prompts::adaptive_quality_note(&metrics);
                let hard_difficulty_note =
                    self.high_difficulty_regen_note(&adjusted_difficulty, is_mc);
                let regen_intro = format!("Regenerate {count} {mode} questions. Topics: {topics}. Difficulty: {difficulty}.", count = request.question_count(), mode = mode_str, topics = sanitize_for_api(&topics.join(", ")), difficulty = adjusted_difficulty);

                let new_user_content = if include_exam_context {
                    let mut parts =
                        vec![serde_json::json!({ "type": "text", "text": regen_intro.clone() })];
                    parts.extend(pdf::build_exam_file_parts(&self.app, &topics));
                    parts.extend(pdf::build_report_file_parts(&self.app, &topics));
                    parts.push(serde_json::json!({ "type": "text", "text": sanitize_for_api(&prompts::pdf_reanchor_note(selected_subs, custom_focus_area.as_deref(), request.shuffle_subtopics(), request.question_count())) }));
                    let synth = sanitize_for_api(&prompts::subtopic_synthesis_note(
                        selected_subs,
                        request.question_count(),
                    ));
                    if !synth.is_empty() {
                        parts.push(serde_json::json!({ "type": "text", "text": synth }));
                    }
                    if !is_mc {
                        let methods_note =
                            prompts::math_methods_exam1_tech_free_note(&topics, tech_mode);
                        if !methods_note.is_empty() {
                            parts.push(serde_json::json!({ "type": "text", "text": methods_note }));
                        }
                    }
                    parts.push(serde_json::json!({ "type": "text", "text": diversity_note }));
                    if !hard_difficulty_note.is_empty() {
                        parts.push(
                            serde_json::json!({ "type": "text", "text": hard_difficulty_note }),
                        );
                    }
                    if !adaptive_note.is_empty() {
                        parts.push(serde_json::json!({ "type": "text", "text": adaptive_note }));
                    }
                    serde_json::Value::Array(parts)
                } else {
                    let synth = sanitize_for_api(&prompts::subtopic_synthesis_note(
                        selected_subs,
                        request.question_count(),
                    ));
                    let mut p = format!(
                        "{}\n\n{}\n\n{}\n\n{}",
                        regen_intro,
                        sanitize_for_api(&prompts::subtopics_note(
                            &topics,
                            selected_subs,
                            request.shuffle_subtopics(),
                            &adjusted_difficulty,
                            tech_mode
                        )),
                        synth,
                        diversity_note
                    );
                    if !hard_difficulty_note.is_empty() {
                        p.push_str("\n\n");
                        p.push_str(hard_difficulty_note);
                    }
                    if !adaptive_note.is_empty() {
                        p.push_str(&adaptive_note);
                    }
                    if !is_mc {
                        let methods_note =
                            prompts::math_methods_exam1_tech_free_note(&topics, tech_mode);
                        if !methods_note.is_empty() {
                            p.push_str("\n\n");
                            p.push_str(methods_note);
                        }
                    }
                    serde_json::Value::String(p)
                };

                let retry_result = call_openrouter(
                    OpenRouterRequestConfig::new(
                        request.api_key(),
                        request.model(),
                        &sys_prompt,
                        new_user_content,
                        format.clone(),
                        max_tokens,
                    )
                    .with_plugins(plugins.clone())
                    .with_stream(self.app.clone(), topics.first().map(|s| s.to_string())),
                )
                .await;
                if let Ok(r) = retry_result {
                    if let Ok(mut new_payload) =
                        self.parse_payload::<QuestionsPayload<Q>>(&r.content)
                    {
                        Q::normalize(&mut new_payload.questions, &topics, selected_subs);
                        if Q::validate(&new_payload.questions, request.question_count()).is_ok() {
                            Q::adjust_marks(&mut new_payload.questions, total_marks);
                            let new_texts = Q::extract_texts(&new_payload.questions);
                            let new_marks: Vec<u8> = new_payload
                                .questions
                                .iter()
                                .map(|q| q.get_max_marks())
                                .collect();
                            let (new_metrics, new_summary) =
                                quality::score_batch(&new_texts, Some(&new_marks));
                            let new_retry_deficit = self.retry_deficit(
                                &new_summary,
                                &new_metrics,
                                distinctness_threshold,
                                per_question_distinctness_threshold,
                                request.avoid_similar_questions(),
                                &adjusted_difficulty,
                                is_mc,
                            );
                            if new_retry_deficit < retry_deficit {
                                payload = new_payload;
                                metrics = new_metrics;
                                summary = new_summary;
                                retry_deficit = new_retry_deficit;
                                final_prompt_tokens = r.prompt_tokens;
                                final_completion_tokens = r.completion_tokens;
                                final_total_tokens = r.total_tokens;
                                for (q, metric) in payload.questions.iter_mut().zip(metrics.iter())
                                {
                                    q.apply_metrics(metric);
                                }
                                if retry_deficit <= 0.0 {
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        let final_latex_issues = self.collect_latex_issues(&payload.questions, is_mc);
        let quality_diagnostics = self.build_subtopic_diagnostics(
            selected_subs,
            payload
                .questions
                .iter()
                .map(|q| q.get_subtopic().map(|s| s.to_string()))
                .collect(),
            final_latex_issues,
        );

        let estimated_cost_usd = stats_result.ok().and_then(|stats| {
            compute_generation_cost(
                Some(final_prompt_tokens as u64),
                Some(final_completion_tokens as u64),
                stats.prompt_price_per_token,
                stats.completion_price_per_token,
            )
        });
        let duration_ms = started.elapsed().as_millis() as u64;

        self.emit_generation_status(serde_json::json!({ "mode": mode_str, "stage": "completed", "message": format!("Done — {} questions in {:.1}s.", payload.questions.len(), duration_ms as f64 / 1000.0), "attempt": 1, "totalTokens": final_total_tokens, "promptTokens": final_prompt_tokens, "completionTokens": final_completion_tokens, "estimatedCostUsd": estimated_cost_usd, "durationMs": duration_ms }));

        Ok((
            payload.questions,
            duration_ms,
            final_prompt_tokens,
            final_completion_tokens,
            final_total_tokens,
            estimated_cost_usd,
            summary,
            quality_diagnostics,
        ))
    }
    #[allow(clippy::too_many_arguments)]
    pub fn calculate_optimal_max_tokens(
        &self,
        question_count: usize,
        average_marks: u8,
        difficulty: &str,
        include_exam_context: bool,
        topic_count: usize,
        subtopic_count: usize,
        prior_question_count: usize,
        has_custom_focus_area: bool,
        avoid_similar_questions: bool,
    ) -> u32 {
        estimate_completion_budget(
            question_count,
            average_marks,
            difficulty,
            include_exam_context,
            topic_count,
            subtopic_count,
            prior_question_count,
            has_custom_focus_area,
            avoid_similar_questions,
        )
    }

    pub fn emit_generation_status(&self, payload: serde_json::Value) {
        if let Err(e) = self.app.emit("generation-status", payload) {
            eprintln!("app.emit failed: {e}");
        }
    }

    pub fn rust_log(&self, level: &str, message: &str, data: Option<serde_json::Value>) {
        let _ = self.app.emit(
            "rust-log",
            serde_json::json!({
                "level": level,
                "message": message,
                "data": data,
            }),
        );
    }

    pub fn parse_payload<T: serde::de::DeserializeOwned>(&self, raw: &str) -> CommandResult<T> {
        self.rust_log(
            "debug",
            "Parsing payload from model",
            Some(serde_json::json!({ "raw": raw })),
        );
        let protected = protect_latex_in_raw_json(raw);
        self.rust_log(
            "debug",
            "Protected LaTeX in JSON",
            Some(serde_json::json!({ "protected": protected })),
        );
        let json_str = extract_json_object(&protected)
            .or_else(|| extract_json_array(&protected))
            .ok_or_else(|| {
                AppError::new("MODEL_PARSE_ERROR", "No JSON object or array in response.")
            })?;
        self.rust_log(
            "debug",
            "Extracted JSON string",
            Some(serde_json::json!({ "json_str": json_str })),
        );
        let value: serde_json::Value = serde_json::from_str(&json_str)
            .map_err(|e| AppError::new("MODEL_PARSE_ERROR", format!("Invalid JSON: {e}")))?;
        let normalised =
            normalise_envelope(value).map_err(|e| AppError::new("MODEL_PARSE_ERROR", e))?;
        self.rust_log(
            "debug",
            "Normalised JSON value",
            Some(serde_json::json!({ "normalised": normalised })),
        );
        serde_json::from_value(normalised)
            .map_err(|e| AppError::new("MODEL_PARSE_ERROR", format!("Schema mismatch: {e}")))
    }

    pub fn build_subtopic_diagnostics(
        &self,
        selected: Option<&Vec<String>>,
        produced: Vec<Option<String>>,
        latex_issue_examples: Vec<String>,
    ) -> Option<GenerationQualityDiagnostics> {
        let selected_raw = selected?;
        let mut selected_unique: Vec<String> = Vec::new();
        for item in selected_raw {
            if !selected_unique.iter().any(|s| s.eq_ignore_ascii_case(item)) {
                selected_unique.push(item.clone());
            }
        }

        let mut covered: Vec<String> = Vec::new();
        let mut out_of_scope: Vec<String> = Vec::new();
        for sub in produced.into_iter().flatten() {
            if let Some(found) = selected_unique
                .iter()
                .find(|s| s.eq_ignore_ascii_case(sub.trim()))
            {
                if !covered.iter().any(|s| s.eq_ignore_ascii_case(found)) {
                    covered.push(found.clone());
                }
            } else if !out_of_scope
                .iter()
                .any(|s| s.eq_ignore_ascii_case(sub.trim()))
            {
                out_of_scope.push(sub.trim().to_string());
            }
        }

        let uncovered: Vec<String> = selected_unique
            .iter()
            .filter(|sel| !covered.iter().any(|c| c.eq_ignore_ascii_case(sel)))
            .cloned()
            .collect();

        Some(GenerationQualityDiagnostics {
            selected_subtopics: selected_unique,
            covered_subtopics: covered,
            uncovered_subtopics: uncovered,
            out_of_scope_subtopics: out_of_scope,
            latex_issue_count: latex_issue_examples.len(),
            latex_issue_examples,
        })
    }

    pub fn collect_latex_issues(
        &self,
        questions: &[impl QuestionWithMarkdown],
        _is_mc: bool,
    ) -> Vec<String> {
        let mut examples = Vec::new();
        for q in questions {
            for issue in latex::latex_issues_for_text(q.get_prompt())
                .into_iter()
                .take(2)
            {
                examples.push(format!("{}: {}", q.get_id(), issue));
                if examples.len() >= 6 {
                    return examples;
                }
            }
            if let Some(expl) = q.get_explanation() {
                for issue in latex::latex_issues_for_text(expl).into_iter().take(1) {
                    examples.push(format!("{} explanation: {}", q.get_id(), issue));
                    if examples.len() >= 6 {
                        return examples;
                    }
                }
            }
        }
        examples
    }

    pub fn diversity_thresholds(&self, level: Option<&str>) -> (f32, f32) {
        match level.unwrap_or("moderate") {
            "lenient" => (0.5, 0.25),
            "strict" => (0.75, 0.5),
            _ => (0.6, 0.35),
        }
    }

    fn high_difficulty_quality_thresholds(
        &self,
        difficulty: &str,
        is_mc: bool,
    ) -> Option<(f32, f32)> {
        match difficulty.to_ascii_lowercase().as_str() {
            "hard" => {
                if is_mc {
                    Some((2.2, 0.45))
                } else {
                    Some((2.8, 0.55))
                }
            }
            "extreme" => {
                if is_mc {
                    Some((2.5, 0.55))
                } else {
                    Some((3.2, 0.7))
                }
            }
            _ => None,
        }
    }

    fn high_difficulty_regen_note(&self, difficulty: &str, is_mc: bool) -> &'static str {
        match difficulty.to_ascii_lowercase().as_str() {
            "hard" => {
                if is_mc {
                    "HIGH-DIFFICULTY CORRECTION (HARD): Increase cognitive demand. Require non-routine distractors, multi-step inference, and explicit discrimination between closely plausible options. Avoid direct recall and one-step substitutions."
                } else {
                    "HIGH-DIFFICULTY CORRECTION (HARD): Increase cognitive demand. Each question should require multi-step reasoning, method selection, and justification. Include non-routine structure and richer data/context; avoid direct template substitution."
                }
            }
            "extreme" => {
                if is_mc {
                    "HIGH-DIFFICULTY CORRECTION (EXTREME): Push to top-end challenge. Use layered reasoning with subtle distractor traps that test synthesis across concepts, not recall."
                } else {
                    "HIGH-DIFFICULTY CORRECTION (EXTREME): Push to top-end challenge. Require deep synthesis across concepts, chain reasoning, and rigorous argumentation/proof-style justification where syllabus-valid."
                }
            }
            _ => "",
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn retry_deficit(
        &self,
        summary: &quality::QualitySummary,
        metrics: &[quality::QuestionQualityMetrics],
        distinctness_threshold: f32,
        per_question_distinctness_threshold: f32,
        enforce_distinctness: bool,
        difficulty: &str,
        is_mc: bool,
    ) -> f32 {
        let mut deficit = 0.0;

        if enforce_distinctness {
            let distinctness_avg = summary.distinctness_avg.unwrap_or(0.0);
            deficit += (distinctness_threshold - distinctness_avg).max(0.0);

            let per_question_shortfall = metrics
                .iter()
                .map(|m| (per_question_distinctness_threshold - m.distinctness).max(0.0))
                .sum::<f32>();
            deficit += per_question_shortfall;
        }

        if let Some((min_depth, min_verb_diversity)) =
            self.high_difficulty_quality_thresholds(difficulty, is_mc)
        {
            let depth = summary.multi_step_depth_avg.unwrap_or(0.0);
            let verb_diversity = summary.command_verb_diversity.unwrap_or(0.0);
            deficit += (min_depth - depth).max(0.0);
            deficit += (min_verb_diversity - verb_diversity).max(0.0);
        }

        deficit
    }

    pub fn resolve_tech_mode(&self, mode: Option<&str>) -> &'static str {
        match mode {
            Some("tech-active") => "tech-active",
            _ => "tech-free",
        }
    }

    pub fn apply_tech_override<T: TechAllowed>(&self, questions: &mut [T], mode: &str) {
        let tech_allowed = mode == "tech-active";
        questions
            .iter_mut()
            .for_each(|q| q.set_tech_allowed(tech_allowed));
    }

    pub fn validate_params(&self, api_key: &str, model: &str) -> CommandResult<()> {
        if api_key.trim().is_empty() {
            return Err(AppError::new("VALIDATION_ERROR", "API key required."));
        }
        if model.trim().is_empty() {
            return Err(AppError::new("VALIDATION_ERROR", "Model required."));
        }
        Ok(())
    }

    pub async fn generate_written(
        &self,
        request: GenerateQuestionsRequest,
    ) -> CommandResult<GenerateQuestionsResponse> {
        self.rust_log(
            "info",
            "Starting written question generation",
            Some(serde_json::json!({
                "topics": request.topics,
                "count": request.question_count,
                "difficulty": request.difficulty,
                "model": request.model
            })),
        );
        self.validate_params(&request.api_key, &request.model)?;

        let (
            questions,
            duration_ms,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            estimated_cost_usd,
            summary,
            quality_diagnostics,
        ) = self
            .execute_generation_pipeline::<GeneratedQuestion>(&request, false)
            .await?;

        Ok(GenerateQuestionsResponse {
            questions,
            duration_ms,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            estimated_cost_usd,
            distinctness_avg: summary.distinctness_avg,
            multi_step_depth_avg: summary.multi_step_depth_avg,
            command_verb_diversity: summary.command_verb_diversity,
            mark_allocation_variance: summary.mark_allocation_variance,
            quality_diagnostics,
        })
    }

    pub async fn generate_mc(
        &self,
        request: GenerateMcQuestionsRequest,
    ) -> CommandResult<GenerateMcQuestionsResponse> {
        self.rust_log(
            "info",
            "Starting multiple-choice question generation",
            Some(serde_json::json!({
                "topics": request.topics,
                "count": request.question_count,
                "difficulty": request.difficulty,
                "model": request.model
            })),
        );
        self.validate_params(&request.api_key, &request.model)?;

        let (
            questions,
            duration_ms,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            estimated_cost_usd,
            summary,
            quality_diagnostics,
        ) = self
            .execute_generation_pipeline::<McQuestion>(&request, true)
            .await?;

        Ok(GenerateMcQuestionsResponse {
            questions,
            duration_ms,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            estimated_cost_usd,
            distinctness_avg: summary.distinctness_avg,
            multi_step_depth_avg: summary.multi_step_depth_avg,
            command_verb_diversity: summary.command_verb_diversity,
            mark_allocation_variance: summary.mark_allocation_variance,
            quality_diagnostics,
        })
    }

    pub async fn mark_answer(
        &self,
        request: MarkAnswerRequest,
    ) -> CommandResult<MarkAnswerResponse> {
        self.rust_log(
            "info",
            "Starting marking for question",
            Some(serde_json::json!({
                "question_id": request.question.id,
                "topic": request.question.topic,
                "model": request.model
            })),
        );
        let has_text = !request.student_answer.trim().is_empty();
        let has_image = request
            .student_answer_image_data_url
            .as_ref()
            .is_some_and(|v| !v.trim().is_empty());
        if !has_text && !has_image {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                "Provide an answer or image.",
            ));
        }
        self.validate_params(&request.api_key, &request.model)?;
        const MAX_ALLOWED_MARKS: u8 = 50;
        if request.question.max_marks == 0 {
            return Err(AppError::new("VALIDATION_ERROR", "maxMarks must be > 0."));
        }
        if request.question.max_marks > MAX_ALLOWED_MARKS {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("maxMarks cannot exceed {}.", MAX_ALLOWED_MARKS),
            ));
        }

        const MAX_ANSWER_CHARS: usize = 12_000;
        let mut answer = sanitize_for_api(
            request
                .student_answer
                .replace("\r\n", "\n")
                .lines()
                .map(str::trim_end)
                .collect::<Vec<_>>()
                .join("\n")
                .trim(),
        );
        if answer.chars().count() > MAX_ANSWER_CHARS {
            answer = answer.chars().take(MAX_ANSWER_CHARS).collect();
            answer.push_str("\n\n[Truncated: answer exceeded length limit.]");
        }

        let question_topic = sanitize_for_api(request.question.topic.trim());
        let question_subtopic =
            sanitize_for_api(request.question.subtopic.as_deref().unwrap_or("—").trim());
        let question_prompt = sanitize_for_api(&request.question.prompt_markdown);

        let chem_note = if question_topic.eq_ignore_ascii_case(constants::CHEMISTRY_TOPIC) {
            constants::CHEMISTRY_LATEX_GUIDANCE
        } else {
            ""
        };
        let pe_note = if question_topic.eq_ignore_ascii_case(constants::PHYSICAL_EDUCATION_TOPIC) {
            "\nPHYSICAL EDUCATION MARKING STYLE:\n- DO NOT use mathematical equations, derivations, or formula-based solutions in your exemplarResponseMarkdown, feedbackMarkdown, comparisonToSolutionMarkdown, or workedSolutionMarkdown.\n- VCE PE does not require formal mathematical working. Write all responses in clear prose — paragraphs, bullet points, and short explanations.\n- Simple named formulas are acceptable where the Study Design requires them (e.g. 'Fitt's principle', 'F = ma', 'VO₂max', '1RM') — but do NOT derive, rearrange, or chain equations. Mention the formula by name, then explain its application in words.\n- Award marks for quality of analysis, evaluation, and justification — not for mathematical rigour.\n"
        } else {
            ""
        };

        let max_marks = request.question.max_marks;

        let (stats_result, report_parts) = tokio::join!(
            get_model_stats(request.api_key.clone(), request.model.clone()),
            async {
                pdf::build_report_file_parts(&self.app, std::slice::from_ref(&question_topic))
            }
        );

        let has_reports = !report_parts.is_empty();

        let report_preamble = if has_reports {
            "\n\nVCAA EXAMINERS' REPORT ATTACHED — USE AS MARKING AUTHORITY:\nThe attached PDF(s) are official VCAA examiners' reports containing marking schemes, common student errors, and expected solutions. Use them as the PRIMARY authority for criterion-based marking. Align your marking criteria, expected working, and common error feedback with the patterns described in these reports."
        } else {
            ""
        };

        let prompt = prompts::marking_prompt(
            &question_topic,
            &question_subtopic,
            &question_prompt,
            max_marks,
            &answer,
            report_preamble,
        );

        let mut content_parts: Vec<serde_json::Value> = Vec::new();
        content_parts.push(serde_json::json!({ "type": "text", "text": prompt }));
        if let Some(url) = request
            .student_answer_image_data_url
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            if !url.starts_with("data:image/") {
                return Err(AppError::new(
                    "VALIDATION_ERROR",
                    "Image must be a valid data URL.",
                ));
            }
            const MAX_IMAGE_DATA_URL_LEN: usize = 20 * 1024 * 1024;
            if url.len() > MAX_IMAGE_DATA_URL_LEN {
                return Err(AppError::new(
                    "VALIDATION_ERROR",
                    "Image is too large. Please use a smaller image.",
                ));
            }
            content_parts
                .push(serde_json::json!({ "type": "image_url", "image_url": { "url": url } }));
        }
        content_parts.extend(report_parts);

        let user_content = serde_json::Value::Array(content_parts);
        const MAX_TOKENS_CAP: u32 = 128_000;
        let max_tokens = ((max_marks as u32) * 2000 + 4000).min(MAX_TOKENS_CAP);
        let plugins = if has_reports {
            let supports_files = stats_result.as_ref().ok().is_some_and(|s| s.supports_files);
            pdf::plugins_for_model(supports_files)
        } else {
            serde_json::json!([{ "id": "response-healing" }])
        };

        let result = call_openrouter(
            OpenRouterRequestConfig::new(
                &request.api_key,
                &request.model,
                &prompts::marking_system(max_marks, chem_note, pe_note),
                user_content,
                schemas::marking_format(&request.model),
                max_tokens,
            )
            .with_plugins(plugins),
        )
        .await?;

        self.rust_log(
            "debug",
            "Marking payload from model",
            Some(serde_json::json!({ "raw": result.content })),
        );
        let protected_marking = protect_latex_in_raw_json(&result.content);
        self.rust_log(
            "debug",
            "Protected LaTeX in Marking JSON",
            Some(serde_json::json!({ "protected": protected_marking })),
        );
        let json_str = extract_json_object(&protected_marking).ok_or_else(|| {
            AppError::new(
                "MODEL_PARSE_ERROR",
                format!(
                    "No JSON in marking response. Raw:\n{}",
                    &result.content.chars().take(800).collect::<String>()
                ),
            )
        })?;

        let mut parsed: MarkAnswerResponse = serde_json::from_str(&json_str).map_err(|e| {
            AppError::new("MODEL_PARSE_ERROR", format!("Marking schema mismatch: {e}"))
        })?;
        parsed.max_marks = if max_marks > 0 { max_marks } else { 10 };
        parsed.achieved_marks = parsed.achieved_marks.min(parsed.max_marks);

        if !parsed.vcaa_marking_scheme.is_empty() {
            let scheme_total = parsed
                .vcaa_marking_scheme
                .iter()
                .map(|c| c.achieved_marks as u16)
                .sum::<u16>()
                .min(parsed.max_marks as u16) as u8;
            if scheme_total != parsed.achieved_marks {
                parsed.achieved_marks = scheme_total;
            }
        }

        parsed.feedback_markdown = clean_field(&parsed.feedback_markdown);
        parsed.worked_solution_markdown = clean_field(&parsed.worked_solution_markdown);
        parsed.comparison_to_solution_markdown =
            clean_field(&parsed.comparison_to_solution_markdown);
        parsed.exemplar_response_markdown = clean_field(&parsed.exemplar_response_markdown);
        for c in &mut parsed.vcaa_marking_scheme {
            c.criterion = clean_field(&c.criterion);
            c.rationale = clean_field(&c.rationale);
        }
        for opt in &mut parsed.mc_option_explanations {
            opt.explanation = clean_field(&opt.explanation);
        }

        parsed.prompt_tokens = result.prompt_tokens;
        parsed.completion_tokens = result.completion_tokens;
        parsed.total_tokens = result.total_tokens;

        Ok(parsed)
    }

    pub async fn tutor_chat(
        &self,
        request: crate::models::TutorChatRequest,
    ) -> CommandResult<crate::models::TutorChatResponse> {
        let api_key = request.api_key.clone();
        let model = request.model.clone();

        let temperature = if request.diagnostic == Some(true) {
            Some(0.1)
        } else {
            None
        };

        let config = crate::openrouter::OpenRouterChatConfig {
            api_key: request.api_key,
            model: request.model,
            messages: request.messages,
            max_tokens: 50000,
            temperature,
            app: self.app.clone(),
        };

        let result = crate::openrouter::call_openrouter_chat_streaming(config).await?;

        let stats_result = get_model_stats(api_key, model).await;
        let estimated_cost_usd = stats_result.ok().and_then(|stats| {
            compute_generation_cost(
                Some(result.prompt_tokens as u64),
                Some(result.completion_tokens as u64),
                stats.prompt_price_per_token,
                stats.completion_price_per_token,
            )
        });

        Ok(crate::models::TutorChatResponse {
            content: result.content,
            prompt_tokens: result.prompt_tokens,
            completion_tokens: result.completion_tokens,
            total_tokens: result.total_tokens,
            estimated_cost_usd,
        })
    }

    pub async fn analyze_image(
        &self,
        request: AnalyzeImageRequest,
    ) -> CommandResult<AnalyzeImageResponse> {
        self.validate_params(&request.api_key, &request.model)?;
        if request.image_path.trim().is_empty() {
            return Err(AppError::new("VALIDATION_ERROR", "Image path required."));
        }

        let path = std::path::Path::new(&request.image_path);
        let mime = path
            .extension()
            .and_then(|e| e.to_str())
            .and_then(|e| match e.to_ascii_lowercase().as_str() {
                "jpg" | "jpeg" => Some("image/jpeg"),
                "png" => Some("image/png"),
                "webp" => Some("image/webp"),
                "gif" => Some("image/gif"),
                "heic" => Some("image/heic"),
                "heif" => Some("image/heif"),
                _ => None,
            })
            .ok_or_else(|| {
                AppError::new(
                    "VALIDATION_ERROR",
                    "Unsupported format. Use png, jpg, webp, gif, heic, or heif.",
                )
            })?;

        const MAX_IMAGE_SIZE: u64 = 50 * 1024 * 1024; // 50 MB
        let metadata = std::fs::metadata(path).map_err(|e| {
            AppError::new(
                if e.kind() == std::io::ErrorKind::NotFound {
                    "VALIDATION_ERROR"
                } else {
                    "IO_ERROR"
                },
                if e.kind() == std::io::ErrorKind::NotFound {
                    "Image file not found.".to_string()
                } else {
                    format!("Failed to read image metadata: {e}")
                },
            )
        })?;
        if metadata.len() > MAX_IMAGE_SIZE {
            return Err(AppError::new("VALIDATION_ERROR", "Image file too large."));
        }

        let bytes = std::fs::read(path).map_err(|e| {
            AppError::new(
                if e.kind() == std::io::ErrorKind::NotFound {
                    "VALIDATION_ERROR"
                } else {
                    "IO_ERROR"
                },
                if e.kind() == std::io::ErrorKind::NotFound {
                    "Image file not found.".to_string()
                } else {
                    format!("Failed to read image: {e}")
                },
            )
        })?;

        use base64::{engine::general_purpose, Engine as _};
        let data_url = format!(
            "data:{mime};base64,{}",
            general_purpose::STANDARD.encode(bytes)
        );
        let prompt = request
            .prompt
            .as_deref()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or("What's in this image?");

        let free_text_format = schemas::text_response_format(&request.model);

        let result = call_openrouter(OpenRouterRequestConfig::new(&request.api_key, &request.model, "You are a helpful visual reasoning assistant.", serde_json::json!([ { "type": "text", "text": prompt }, { "type": "image_url", "image_url": { "url": data_url } } ]), free_text_format, 4_500)).await?;

        let output_text = serde_json::from_str::<serde_json::Value>(&result.content)
            .ok()
            .and_then(|v| v.get("text").and_then(|t| t.as_str()).map(str::to_string))
            .unwrap_or(result.content);

        Ok(AnalyzeImageResponse { output_text })
    }
}

pub trait TechAllowed {
    fn set_tech_allowed(&mut self, v: bool);
}
impl TechAllowed for GeneratedQuestion {
    fn set_tech_allowed(&mut self, v: bool) {
        self.tech_allowed = v;
    }
}
impl TechAllowed for McQuestion {
    fn set_tech_allowed(&mut self, v: bool) {
        self.tech_allowed = v;
    }
}

pub trait QuestionWithMarkdown {
    fn get_id(&self) -> &str;
    fn get_prompt(&self) -> &str;
    fn get_explanation(&self) -> Option<&str>;
    fn get_subtopic(&self) -> Option<&str>;
}

impl QuestionWithMarkdown for GeneratedQuestion {
    fn get_id(&self) -> &str {
        &self.id
    }
    fn get_prompt(&self) -> &str {
        &self.prompt_markdown
    }
    fn get_explanation(&self) -> Option<&str> {
        None
    }
    fn get_subtopic(&self) -> Option<&str> {
        self.subtopic.as_deref()
    }
}

impl QuestionWithMarkdown for McQuestion {
    fn get_id(&self) -> &str {
        &self.id
    }
    fn get_prompt(&self) -> &str {
        &self.prompt_markdown
    }
    fn get_explanation(&self) -> Option<&str> {
        Some(&self.explanation_markdown)
    }
    fn get_subtopic(&self) -> Option<&str> {
        self.subtopic.as_deref()
    }
}

pub trait NormalizableQuestion: QuestionWithMarkdown + TechAllowed {
    fn normalize(questions: &mut [Self], topics: &[String], subtopics: Option<&Vec<String>>)
    where
        Self: Sized;
    fn validate(questions: &[Self], expected: usize) -> CommandResult<()>
    where
        Self: Sized;
    fn extract_texts(questions: &[Self]) -> Vec<String>
    where
        Self: Sized;
    fn apply_metrics(&mut self, metrics: &quality::QuestionQualityMetrics);
    fn get_max_marks(&self) -> u8;
    fn adjust_marks(questions: &mut [Self], total_marks: usize)
    where
        Self: Sized;
}

impl NormalizableQuestion for GeneratedQuestion {
    fn normalize(questions: &mut [Self], topics: &[String], subtopics: Option<&Vec<String>>) {
        normalization::normalise_written(questions, topics, subtopics);
    }
    fn validate(questions: &[Self], expected: usize) -> CommandResult<()> {
        normalization::validate_written(questions, expected)
    }
    fn extract_texts(questions: &[Self]) -> Vec<String> {
        questions
            .iter()
            .map(|q| q.prompt_markdown.clone())
            .collect()
    }
    fn apply_metrics(&mut self, m: &quality::QuestionQualityMetrics) {
        self.distinctness_score = Some(m.distinctness);
        self.multi_step_depth = Some(m.depth);
        self.verb_diversity_count = Some(m.verb_diversity);
        self.scaffold_pattern = Some(m.scaffold_pattern.clone());
    }
    fn get_max_marks(&self) -> u8 {
        self.max_marks
    }
    fn adjust_marks(questions: &mut [Self], total_marks: usize) {
        if questions.is_empty() {
            return;
        }
        let current_total: i64 = questions.iter().map(|q| q.max_marks as i64).sum();
        let diff = total_marks as i64 - current_total;
        if diff == 0 {
            return;
        }
        let q_count = questions.len();
        let base_adj = diff / q_count as i64;
        let remainder = diff.abs() % q_count as i64;
        let mut indices: Vec<usize> = (0..q_count).collect();
        if diff > 0 {
            indices.sort_by_key(|&i| questions[i].max_marks);
        } else {
            indices.sort_by_key(|&i| std::cmp::Reverse(questions[i].max_marks));
        }
        for (pos, &i) in indices.iter().enumerate() {
            let adj = base_adj
                + if (pos as i64) < remainder {
                    diff.signum()
                } else {
                    0
                };
            let new_marks = (questions[i].max_marks as i64 + adj).clamp(
                constants::MIN_MARKS_PER_QUESTION as i64,
                constants::MAX_MARKS_PER_QUESTION as i64,
            );
            questions[i].max_marks = new_marks as u8;
        }
    }
}

impl NormalizableQuestion for McQuestion {
    fn normalize(questions: &mut [Self], topics: &[String], subtopics: Option<&Vec<String>>) {
        normalization::normalise_mc(questions, topics, subtopics);
    }
    fn validate(questions: &[Self], expected: usize) -> CommandResult<()> {
        normalization::validate_mc(questions, expected)
    }
    fn extract_texts(questions: &[Self]) -> Vec<String> {
        questions
            .iter()
            .map(|q| {
                let opts = q
                    .options
                    .iter()
                    .map(|o| format!("{}: {}", o.label, o.text))
                    .collect::<Vec<_>>()
                    .join(" ");
                format!("{} {opts}", q.prompt_markdown)
            })
            .collect()
    }
    fn apply_metrics(&mut self, m: &quality::QuestionQualityMetrics) {
        self.distinctness_score = Some(m.distinctness);
        self.multi_step_depth = Some(m.depth);
        self.verb_diversity_count = Some(m.verb_diversity);
        self.scaffold_pattern = Some(m.scaffold_pattern.clone());
    }
    fn get_max_marks(&self) -> u8 {
        1
    }
    fn adjust_marks(_questions: &mut [Self], _total_marks: usize) {
        // MC questions are always 1 mark each, no adjustment.
    }
}

#[cfg(test)]
mod tests {
    use super::{estimate_completion_budget, validate_and_prepare_generation_inputs};

    #[test]
    fn prepare_generation_inputs_trims_and_deduplicates() {
        let topics = vec![
            " Chemistry ".to_string(),
            "chemistry".to_string(),
            "Mathematical Methods".to_string(),
        ];
        let subtopics = vec![
            "Graphing Circular Functions@@unit3-functions#12".to_string(),
            "Graphing Circular Functions".to_string(),
        ];
        let custom_focus_area = Some("  Focus area  ".to_string());
        let prior_prompts = vec![
            " First prompt ".to_string(),
            "first prompt".to_string(),
            "Second prompt".to_string(),
            "   ".to_string(),
        ];

        let prepared = validate_and_prepare_generation_inputs(
            &topics,
            Some(&subtopics),
            custom_focus_area.as_ref(),
            Some(&prior_prompts),
            Some(10),
            3,
        )
        .expect("valid inputs");

        assert_eq!(prepared.topics, vec!["Chemistry", "Mathematical Methods"]);
        assert_eq!(
            prepared.subtopics,
            Some(vec!["Graphing Circular Functions".to_string()])
        );
        assert_eq!(prepared.custom_focus_area.as_deref(), Some("Focus area"));
        assert_eq!(
            prepared.prior_question_prompts,
            Some(vec![
                "First prompt".to_string(),
                "Second prompt".to_string()
            ])
        );
    }

    #[test]
    fn estimate_completion_budget_scales_with_context() {
        let base = estimate_completion_budget(5, 10, "Medium", false, 1, 0, 0, false, false);
        let contextual = estimate_completion_budget(5, 10, "Medium", true, 3, 4, 3, true, true);

        assert!(contextual > base);
    }

    #[test]
    fn estimate_completion_budget_scales_with_higher_difficulty() {
        let medium = estimate_completion_budget(4, 8, "Medium", false, 1, 1, 0, false, false);
        let hard = estimate_completion_budget(4, 8, "Hard", false, 1, 1, 0, false, false);
        let extreme = estimate_completion_budget(4, 8, "Extreme", false, 1, 1, 0, false, false);

        assert!(hard > medium);
        assert!(extreme > hard);
    }
}
