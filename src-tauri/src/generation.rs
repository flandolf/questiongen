use std::time::Instant;
use tauri::{Emitter, Manager};
use crate::models::{CommandResult, AppError, GeneratedQuestion, McQuestion, WrittenQuestionsPayload, McQuestionsPayload, GenerationQualityDiagnostics, GenerateQuestionsResponse, GenerateMcQuestionsResponse, GenerateQuestionsRequest, GenerateMcQuestionsRequest, MarkAnswerRequest, MarkAnswerResponse, AnalyzeImageRequest, AnalyzeImageResponse};
use crate::openrouter::{call_openrouter, OpenRouterRequestConfig, OpenRouterResult};
use crate::openrouter_info::{get_model_stats, compute_generation_cost};
use crate::parsing::{protect_latex_in_raw_json, extract_json_object, extract_json_array, normalise_envelope, sanitize_for_api};
use crate::schemas;
use crate::prompts;
use crate::pdf;
use crate::latex;
use crate::quality;
use crate::difficulty;
use crate::normalization;
use crate::constants;

pub struct GenerationService {
    app: tauri::AppHandle,
}

impl GenerationService {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self { app }
    }


    pub fn calculate_optimal_max_tokens(
        &self,
        question_count: usize,
        average_marks: u8,
        difficulty: &str,
        include_exam_context: bool,
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
            "hard" => 1.15,
            "extreme" => 1.3,
            _ => 1.0,
        };

        let pdf_overhead = if include_exam_context { 1000 } else { 0 };
        let total = (question_count as u32 * (base_per_question as f32 * difficulty_multiplier) as u32)
            + pdf_overhead
            + 2000;

        total.clamp(3000, 64_000)
    }

    pub fn emit_generation_status(&self, payload: serde_json::Value) {
        if let Err(e) = self.app.emit("generation-status", payload) {
            eprintln!("app.emit failed: {e}");
        }
    }

    pub fn parse_payload<T: serde::de::DeserializeOwned>(&self, raw: &str) -> CommandResult<T> {
        let protected = protect_latex_in_raw_json(raw);
        let json_str = extract_json_object(&protected)
            .or_else(|| extract_json_array(&protected))
            .ok_or_else(|| {
                AppError::new("MODEL_PARSE_ERROR", "No JSON object or array in response.")
            })?;
        let value: serde_json::Value = serde_json::from_str(&json_str)
            .map_err(|e| AppError::new("MODEL_PARSE_ERROR", format!("Invalid JSON: {e}")))?;
        let normalised =
            normalise_envelope(value).map_err(|e| AppError::new("MODEL_PARSE_ERROR", e))?;
        serde_json::from_value(normalised)
            .map_err(|e| AppError::new("MODEL_PARSE_ERROR", format!("Schema mismatch: {e}")))
    }

    pub fn build_subtopic_diagnostics(
        &self,
        selected: Option<&Vec<String>>,
        produced: Vec<Option<String>>,
        strict: bool,
        requested_ratio: Option<f32>,
        question_count: usize,
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
            if let Some(found) = selected_unique.iter().find(|s| s.eq_ignore_ascii_case(sub.trim())) {
                if !covered.iter().any(|s| s.eq_ignore_ascii_case(found)) {
                    covered.push(found.clone());
                }
            } else if !out_of_scope.iter().any(|s| s.eq_ignore_ascii_case(sub.trim())) {
                out_of_scope.push(sub.trim().to_string());
            }
        }

        let uncovered: Vec<String> = selected_unique.iter()
            .filter(|sel| !covered.iter().any(|c| c.eq_ignore_ascii_case(sel)))
            .cloned().collect();

        let min_ratio = {
            if selected_unique.is_empty() { 1.0 }
            else {
                let feasible = (question_count as f32 / selected_unique.len() as f32).clamp(0.0, 1.0);
                let base = requested_ratio.unwrap_or(if strict { 1.0 } else { 0.7 }).clamp(0.0, 1.0);
                if strict { feasible } else { base.min(feasible) }
            }
        };

        let ratio = if selected_unique.is_empty() { 1.0 } else { covered.len() as f32 / selected_unique.len() as f32 };

        Some(GenerationQualityDiagnostics {
            selected_subtopics: selected_unique,
            covered_subtopics: covered,
            uncovered_subtopics: uncovered,
            out_of_scope_subtopics: out_of_scope,
            subtopic_coverage_ratio: ratio,
            min_subtopic_coverage_ratio: min_ratio,
            latex_issue_count: latex_issue_examples.len(),
            latex_issue_examples,
        })
    }

    pub fn collect_latex_issues(&self, questions: &[impl QuestionWithMarkdown], _is_mc: bool) -> Vec<String> {
        let mut examples = Vec::new();
        for q in questions {
            for issue in latex::latex_issues_for_text(q.get_prompt()).into_iter().take(2) {
                examples.push(format!("{}: {}", q.get_id(), issue));
                if examples.len() >= 6 { return examples; }
            }
            if let Some(expl) = q.get_explanation() {
                 for issue in latex::latex_issues_for_text(expl).into_iter().take(1) {
                    examples.push(format!("{} explanation: {}", q.get_id(), issue));
                    if examples.len() >= 6 { return examples; }
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

    pub async fn generate_written(&self, request: GenerateQuestionsRequest) -> CommandResult<GenerateQuestionsResponse> {
        if request.topics.is_empty() {
            return Err(AppError::new("VALIDATION_ERROR", "Select at least one topic."));
        }
        if request.question_count == 0 || request.question_count > constants::MAX_QUESTION_COUNT {
            return Err(AppError::new("VALIDATION_ERROR", format!("Question count must be 1–{}.", constants::MAX_QUESTION_COUNT)));
        }
        self.validate_params(&request.api_key, &request.model)?;

        let started = Instant::now();
        let selected_subs = request.subtopics.as_ref().filter(|s| !s.is_empty());
        let tech_mode = self.resolve_tech_mode(request.tech_mode.as_deref());
        let include_exam_context = request.include_exam_context.unwrap_or(false);
        let strict_latex_validation = request.strict_latex_validation.unwrap_or(false);
        let strict_subtopic_coverage = request.strict_subtopic_coverage.unwrap_or(false);
        let (distinctness_threshold, per_question_distinctness_threshold) = self.diversity_thresholds(request.diversity_strictness.as_deref());

        let adjusted_difficulty = difficulty::adjust_difficulty(
            &request.difficulty,
            request.ai_difficulty_scaling_enabled.unwrap_or(false),
            request.recent_average_score,
            request.recent_difficulty.as_deref(),
        );

        let average_marks = request.average_marks_per_question.unwrap_or(10);
        let total_marks = average_marks as usize * request.question_count;

        self.emit_generation_status(serde_json::json!({
            "mode": "written", "stage": "preparing",
            "message": "Building prompt.", "attempt": 1
        }));

        let prompt_builder = prompts::UserPromptBuilder {
            count: request.question_count,
            topics: request.topics.clone(),
            difficulty: adjusted_difficulty.clone(),
            average_marks: Some(average_marks),
            subtopics: request.subtopics.clone(),
            custom_focus_area: request.custom_focus_area.clone(),
            tech_mode: tech_mode.to_string(),
            include_exam_context,
            avoid_similar_questions: request.avoid_similar_questions.unwrap_or(false),
            prior_question_prompts: request.prior_question_prompts.clone(),
        };
        let prompt = prompt_builder.build_written();

        self.emit_generation_status(serde_json::json!({
            "mode": "written", "stage": "generating",
            "message": format!("Generating {} questions…", request.question_count),
            "attempt": 1
        }));

        let written_sys = prompts::written_system();
        let written_fmt = schemas::written_format(&request.model);
        let max_tokens = self.calculate_optimal_max_tokens(request.question_count, average_marks, &adjusted_difficulty, include_exam_context);

        let stats_result = get_model_stats(request.api_key.clone(), request.model.clone()).await;
        let supports_files = stats_result.as_ref().ok().is_some_and(|s| s.supports_files);
        let plugins = pdf::plugins_for_model(supports_files);

        let user_content = if include_exam_context {
            let mut parts = vec![serde_json::json!({ "type": "text", "text": prompt })];
            parts.extend(pdf::build_exam_file_parts(&self.app, &request.topics));
            parts.extend(pdf::build_report_file_parts(&self.app, &request.topics));
            let reanchor = sanitize_for_api(&prompts::pdf_reanchor_note(selected_subs, request.custom_focus_area.as_deref()));
            parts.push(serde_json::json!({ "type": "text", "text": reanchor }));
            serde_json::Value::Array(parts)
        } else {
            serde_json::Value::String(prompt)
        };

        let result = call_openrouter(OpenRouterRequestConfig::new(&request.api_key, &request.model, &written_sys, user_content, written_fmt, max_tokens).with_plugins(plugins.clone()).with_stream(self.app.clone())).await?;

        self.emit_generation_status(serde_json::json!({
            "mode": "written", "stage": "parsing",
            "message": "Parsing and validating questions.",
            "attempt": 1
        }));

        let mut payload: WrittenQuestionsPayload = self.parse_payload(&result.content)?;
        normalization::normalise_written(&mut payload.questions, &request.topics, selected_subs);
        normalization::validate_written(&payload.questions, request.question_count)?;
        self.apply_tech_override(&mut payload.questions, tech_mode);

        let latex_issue_examples = self.collect_latex_issues(&payload.questions, false);
        let mut quality_diagnostics = self.build_subtopic_diagnostics(selected_subs, payload.questions.iter().map(|q| q.subtopic.clone()).collect(), strict_subtopic_coverage, request.min_subtopic_coverage_ratio, request.question_count, latex_issue_examples.clone());

        if strict_latex_validation && !latex_issue_examples.is_empty() {
            return Err(AppError::new("VALIDATION_ERROR", format!("Generated output failed strict LaTeX validation ({} issue(s)); first issue: {}", latex_issue_examples.len(), latex_issue_examples[0])));
        }

        if strict_subtopic_coverage {
            if let Some(diag) = &quality_diagnostics {
                if diag.subtopic_coverage_ratio + 0.0001 < diag.min_subtopic_coverage_ratio {
                    return Err(AppError::new("VALIDATION_ERROR", format!("Generated output did not meet subtopic coverage target ({:.0}% < {:.0}%). Missing: {}", diag.subtopic_coverage_ratio * 100.0, diag.min_subtopic_coverage_ratio * 100.0, diag.uncovered_subtopics.join(", "))));
                }
                if !diag.out_of_scope_subtopics.is_empty() {
                    return Err(AppError::new("VALIDATION_ERROR", format!("Generated output used out-of-scope subtopics: {}", diag.out_of_scope_subtopics.join(", "))));
                }
            }
        }

        if !payload.questions.is_empty() {
            let current_total: i64 = payload.questions.iter().map(|q| q.max_marks as i64).sum();
            let diff = total_marks as i64 - current_total;
            if diff != 0 {
                let q_count = payload.questions.len();
                let base_adj = diff / q_count as i64;
                let remainder = diff.abs() % q_count as i64;
                let mut indices: Vec<usize> = (0..q_count).collect();
                if diff > 0 { indices.sort_by_key(|&i| payload.questions[i].max_marks); }
                else { indices.sort_by_key(|&i| std::cmp::Reverse(payload.questions[i].max_marks)); }
                for (pos, &i) in indices.iter().enumerate() {
                    let adj = base_adj + if (pos as i64) < remainder { diff.signum() } else { 0 };
                    let new_marks = (payload.questions[i].max_marks as i64 + adj).clamp(constants::MIN_MARKS_PER_QUESTION as i64, constants::MAX_MARKS_PER_QUESTION as i64);
                    payload.questions[i].max_marks = new_marks as u8;
                }
            }
        }

        let texts: Vec<String> = payload.questions.iter().map(|q| q.prompt_markdown.clone()).collect();
        let (metrics, mut summary) = quality::score_batch(&texts);
        let mark_values: Vec<u8> = payload.questions.iter().map(|q| q.max_marks).collect();
        summary.mark_allocation_variance = Some(quality::compute_mark_allocation_variance(&mark_values));

        for (q, metric) in payload.questions.iter_mut().zip(metrics.iter()) {
            q.distinctness_score = Some(metric.distinctness);
            q.multi_step_depth = Some(metric.depth);
            q.verb_diversity_count = Some(metric.verb_diversity);
            q.scaffold_pattern = Some(metric.scaffold_pattern.clone());
        }

        let mut metrics = metrics;
        let mut summary = summary;
        if request.avoid_similar_questions.unwrap_or(false) {
            let mut need_retry = summary.distinctness_avg.is_some_and(|v| v < distinctness_threshold) || metrics.iter().any(|m| m.distinctness < per_question_distinctness_threshold);
            let mut attempts = 0;
            while need_retry && attempts < 2 {
                attempts += 1;
                self.emit_generation_status(serde_json::json!({ "mode": "written", "stage": "regenerating-duplicates", "message": format!("Regenerating to improve diversity (attempt {})...", attempts), "attempt": attempts + 1 }));
                let diversity_note = "\nDIVERSITY REGENERATION: The previous output contained similar questions. Now generate a new set of questions, replacing any that are similar with entirely different scenarios, contexts, names, numbers, or methods. Do NOT paraphrase previous questions; invent fresh contexts. Increase creativity and change details.";
                let adaptive_note = prompts::adaptive_quality_note(&metrics);
                let regen_intro = format!("Regenerate {count} written-response questions. Topics: {topics}. Difficulty: {difficulty}.", count = request.question_count, topics = sanitize_for_api(&request.topics.join(", ")), difficulty = adjusted_difficulty);

                let new_user_content = if include_exam_context {
                    let mut parts = vec![serde_json::json!({ "type": "text", "text": regen_intro.clone() })];
                    parts.extend(pdf::build_exam_file_parts(&self.app, &request.topics));
                    parts.extend(pdf::build_report_file_parts(&self.app, &request.topics));
                    parts.push(serde_json::json!({ "type": "text", "text": sanitize_for_api(&prompts::pdf_reanchor_note(selected_subs, request.custom_focus_area.as_deref())) }));
                    let synth = sanitize_for_api(&prompts::subtopic_synthesis_note(selected_subs, request.question_count));
                    if !synth.is_empty() { parts.push(serde_json::json!({ "type": "text", "text": synth })); }
                    let methods_note = prompts::math_methods_exam1_tech_free_note(&request.topics, tech_mode);
                    if !methods_note.is_empty() { parts.push(serde_json::json!({ "type": "text", "text": methods_note })); }
                    parts.push(serde_json::json!({ "type": "text", "text": diversity_note }));
                    if !adaptive_note.is_empty() { parts.push(serde_json::json!({ "type": "text", "text": adaptive_note })); }
                    serde_json::Value::Array(parts)
                } else {
                    let synth = sanitize_for_api(&prompts::subtopic_synthesis_note(selected_subs, request.question_count));
                    let mut p = format!("{}\n\n{}\n\n{}\n\n{}", regen_intro, sanitize_for_api(&prompts::subtopics_note(selected_subs)), synth, diversity_note);
                    if !adaptive_note.is_empty() { p.push_str(&adaptive_note); }
                    let methods_note = prompts::math_methods_exam1_tech_free_note(&request.topics, tech_mode);
                    if !methods_note.is_empty() { p.push_str("\n\n"); p.push_str(methods_note); }
                    serde_json::Value::String(p)
                };

                let retry_result = call_openrouter(OpenRouterRequestConfig::new(&request.api_key, &request.model, &written_sys, new_user_content, schemas::written_format(&request.model), max_tokens).with_plugins(plugins.clone()).with_stream(self.app.clone())).await;
                if let Ok(r) = retry_result {
                    if let Ok(mut new_payload) = self.parse_payload::<WrittenQuestionsPayload>(&r.content) {
                        normalization::normalise_written(&mut new_payload.questions, &request.topics, selected_subs);
                        if normalization::validate_written(&new_payload.questions, request.question_count).is_ok() {
                            let new_texts: Vec<String> = new_payload.questions.iter().map(|q| q.prompt_markdown.clone()).collect();
                            let (new_metrics, new_summary) = quality::score_batch(&new_texts);
                            if new_summary.distinctness_avg.unwrap_or(0.0) > summary.distinctness_avg.unwrap_or(0.0) {
                                payload = new_payload; metrics = new_metrics; summary = new_summary;
                                for (q, metric) in payload.questions.iter_mut().zip(metrics.iter()) {
                                    q.distinctness_score = Some(metric.distinctness); q.multi_step_depth = Some(metric.depth);
                                    q.verb_diversity_count = Some(metric.verb_diversity); q.scaffold_pattern = Some(metric.scaffold_pattern.clone());
                                }
                                break;
                            }
                        }
                    }
                }
                need_retry = attempts < 2 && (summary.distinctness_avg.is_some_and(|v| v < distinctness_threshold) || metrics.iter().any(|m| m.distinctness < per_question_distinctness_threshold));
            }
        }

        let final_latex_issues = self.collect_latex_issues(&payload.questions, false);
        quality_diagnostics = self.build_subtopic_diagnostics(selected_subs, payload.questions.iter().map(|q| q.subtopic.clone()).collect(), strict_subtopic_coverage, request.min_subtopic_coverage_ratio, request.question_count, final_latex_issues);

        let estimated_cost_usd = stats_result.ok().and_then(|stats| compute_generation_cost(Some(result.prompt_tokens as u64), Some(result.completion_tokens as u64), stats.prompt_price_per_token, stats.completion_price_per_token));
        let duration_ms = started.elapsed().as_millis() as u64;

        self.emit_generation_status(serde_json::json!({ "mode": "written", "stage": "completed", "message": format!("Done — {} questions in {:.1}s.", payload.questions.len(), duration_ms as f64 / 1000.0), "attempt": 1, "totalTokens": result.total_tokens, "promptTokens": result.prompt_tokens, "completionTokens": result.completion_tokens, "estimatedCostUsd": estimated_cost_usd, "durationMs": duration_ms }));

        Ok(GenerateQuestionsResponse { questions: payload.questions, duration_ms, prompt_tokens: result.prompt_tokens, completion_tokens: result.completion_tokens, total_tokens: result.total_tokens, estimated_cost_usd, distinctness_avg: summary.distinctness_avg, multi_step_depth_avg: summary.multi_step_depth_avg, command_verb_diversity: summary.command_verb_diversity, mark_allocation_variance: summary.mark_allocation_variance, quality_diagnostics })
    }

    pub async fn generate_mc(&self, request: GenerateMcQuestionsRequest) -> CommandResult<GenerateMcQuestionsResponse> {
        if request.topics.is_empty() {
            return Err(AppError::new("VALIDATION_ERROR", "Select at least one topic."));
        }
        if request.question_count == 0 || request.question_count > constants::MAX_QUESTION_COUNT {
            return Err(AppError::new("VALIDATION_ERROR", format!("Question count must be 1–{}.", constants::MAX_QUESTION_COUNT)));
        }
        self.validate_params(&request.api_key, &request.model)?;

        let started = Instant::now();
        let selected_subs = request.subtopics.as_ref().filter(|s| !s.is_empty());
        let tech_mode = self.resolve_tech_mode(request.tech_mode.as_deref());
        let include_exam_context = request.include_exam_context.unwrap_or(false);
        let strict_latex_validation = request.strict_latex_validation.unwrap_or(false);
        let strict_subtopic_coverage = request.strict_subtopic_coverage.unwrap_or(false);
        let (distinctness_threshold, per_question_distinctness_threshold) = self.diversity_thresholds(request.diversity_strictness.as_deref());

        let adjusted_difficulty = difficulty::adjust_difficulty(
            &request.difficulty,
            request.ai_difficulty_scaling_enabled.unwrap_or(false),
            request.recent_average_score,
            request.recent_difficulty.as_deref(),
        );

        self.emit_generation_status(serde_json::json!({
            "mode": "multiple-choice", "stage": "preparing",
            "message": "Building prompt.", "attempt": 1
        }));

        let prompt_builder = prompts::UserPromptBuilder {
            count: request.question_count,
            topics: request.topics.clone(),
            difficulty: adjusted_difficulty.clone(),
            average_marks: None,
            subtopics: request.subtopics.clone(),
            custom_focus_area: request.custom_focus_area.clone(),
            tech_mode: tech_mode.to_string(),
            include_exam_context,
            avoid_similar_questions: request.avoid_similar_questions.unwrap_or(false),
            prior_question_prompts: request.prior_question_prompts.clone(),
        };
        let prompt = prompt_builder.build_mc();

        self.emit_generation_status(serde_json::json!({
            "mode": "multiple-choice", "stage": "generating",
            "message": format!("Generating {} questions…", request.question_count),
            "attempt": 1
        }));

        let mc_sys = prompts::mc_system();
        let mc_fmt = schemas::mc_format(&request.model);
        let base_mc_tokens = self.calculate_optimal_max_tokens(request.question_count, 3, &adjusted_difficulty, include_exam_context).saturating_mul(3) / 4;

        let stats_result = get_model_stats(request.api_key.clone(), request.model.clone()).await;
        let supports_files = stats_result.as_ref().ok().is_some_and(|s| s.supports_files);
        let plugins = pdf::plugins_for_model(supports_files);

        let user_content = if include_exam_context {
            let mut parts = vec![serde_json::json!({ "type": "text", "text": prompt })];
            parts.extend(pdf::build_exam_file_parts(&self.app, &request.topics));
            parts.extend(pdf::build_report_file_parts(&self.app, &request.topics));
            let reanchor = sanitize_for_api(&prompts::pdf_reanchor_note(selected_subs, request.custom_focus_area.as_deref()));
            parts.push(serde_json::json!({ "type": "text", "text": reanchor }));
            serde_json::Value::Array(parts)
        } else {
            serde_json::Value::String(prompt)
        };

        let result = call_openrouter(OpenRouterRequestConfig::new(&request.api_key, &request.model, &mc_sys, user_content, mc_fmt.clone(), base_mc_tokens).with_plugins(plugins.clone()).with_stream(self.app.clone())).await?;

        self.emit_generation_status(serde_json::json!({
            "mode": "multiple-choice", "stage": "parsing",
            "message": "Parsing and validating questions.",
            "attempt": 1
        }));

        let mut payload: McQuestionsPayload = self.parse_payload(&result.content)?;
        normalization::normalise_mc(&mut payload.questions, &request.topics, selected_subs);
        normalization::validate_mc(&payload.questions, request.question_count)?;
        self.apply_tech_override(&mut payload.questions, tech_mode);

        let latex_issue_examples = self.collect_latex_issues(&payload.questions, true);
        let mut quality_diagnostics = self.build_subtopic_diagnostics(selected_subs, payload.questions.iter().map(|q| q.subtopic.clone()).collect(), strict_subtopic_coverage, request.min_subtopic_coverage_ratio, request.question_count, latex_issue_examples.clone());

        if strict_latex_validation && !latex_issue_examples.is_empty() {
            return Err(AppError::new("VALIDATION_ERROR", format!("Generated output failed strict LaTeX validation ({} issue(s)); first issue: {}", latex_issue_examples.len(), latex_issue_examples[0])));
        }

        if strict_subtopic_coverage {
            if let Some(diag) = &quality_diagnostics {
                if diag.subtopic_coverage_ratio + 0.0001 < diag.min_subtopic_coverage_ratio {
                    return Err(AppError::new("VALIDATION_ERROR", format!("Generated output did not meet subtopic coverage target ({:.0}% < {:.0}%). Missing: {}", diag.subtopic_coverage_ratio * 100.0, diag.min_subtopic_coverage_ratio * 100.0, diag.uncovered_subtopics.join(", "))));
                }
                if !diag.out_of_scope_subtopics.is_empty() {
                    return Err(AppError::new("VALIDATION_ERROR", format!("Generated output used out-of-scope subtopics: {}", diag.out_of_scope_subtopics.join(", "))));
                }
            }
        }

        let texts: Vec<String> = payload.questions.iter().map(|q| {
            let opts = q.options.iter().map(|o| format!("{}: {}", o.label, o.text)).collect::<Vec<_>>().join(" ");
            format!("{} {opts}", q.prompt_markdown)
        }).collect();
        let (metrics, mut summary) = quality::score_batch(&texts);
        summary.mark_allocation_variance = Some(0.0);

        for (q, metric) in payload.questions.iter_mut().zip(metrics.iter()) {
            q.distinctness_score = Some(metric.distinctness); q.multi_step_depth = Some(metric.depth);
            q.verb_diversity_count = Some(metric.verb_diversity); q.scaffold_pattern = Some(metric.scaffold_pattern.clone());
        }

        let mut metrics = metrics;
        let mut summary = summary;
        if request.avoid_similar_questions.unwrap_or(false) {
            let mut need_retry = summary.distinctness_avg.is_some_and(|v| v < distinctness_threshold) || metrics.iter().any(|m| m.distinctness < per_question_distinctness_threshold);
            let mut attempts = 0;
            while need_retry && attempts < 2 {
                attempts += 1;
                self.emit_generation_status(serde_json::json!({ "mode": "multiple-choice", "stage": "regenerating-duplicates", "message": format!("Regenerating to improve diversity (attempt {})...", attempts), "attempt": attempts + 1 }));
                let diversity_note = "\nDIVERSITY REGENERATION: The previous output contained similar questions. Now generate a new set of questions, replacing any that are similar with entirely different scenarios, contexts, names, numbers, or methods. Do NOT paraphrase previous questions; invent fresh contexts. Increase creativity and change details.";
                let adaptive_note = prompts::adaptive_quality_note(&metrics);
                let regen_intro = format!("Regenerate {count} multiple-choice questions. Topics: {topics}. Difficulty: {difficulty}.", count = request.question_count, topics = sanitize_for_api(&request.topics.join(", ")), difficulty = adjusted_difficulty);

                let new_user_content = if include_exam_context {
                    let mut parts = vec![serde_json::json!({ "type": "text", "text": regen_intro.clone() })];
                    parts.extend(pdf::build_exam_file_parts(&self.app, &request.topics));
                    parts.extend(pdf::build_report_file_parts(&self.app, &request.topics));
                    parts.push(serde_json::json!({ "type": "text", "text": sanitize_for_api(&prompts::pdf_reanchor_note(selected_subs, request.custom_focus_area.as_deref())) }));
                    let synth = sanitize_for_api(&prompts::subtopic_synthesis_note(selected_subs, request.question_count));
                    if !synth.is_empty() { parts.push(serde_json::json!({ "type": "text", "text": synth })); }
                    parts.push(serde_json::json!({ "type": "text", "text": diversity_note }));
                    if !adaptive_note.is_empty() { parts.push(serde_json::json!({ "type": "text", "text": adaptive_note })); }
                    serde_json::Value::Array(parts)
                } else {
                    let synth = sanitize_for_api(&prompts::subtopic_synthesis_note(selected_subs, request.question_count));
                    let mut p = format!("{}\n\n{}\n\n{}\n\n{}", regen_intro, sanitize_for_api(&prompts::subtopics_note(selected_subs)), synth, diversity_note);
                    if !adaptive_note.is_empty() { p.push_str(&adaptive_note); }
                    serde_json::Value::String(p)
                };

                let retry_result = call_openrouter(OpenRouterRequestConfig::new(&request.api_key, &request.model, &mc_sys, new_user_content, mc_fmt.clone(), base_mc_tokens).with_plugins(plugins.clone()).with_stream(self.app.clone())).await;
                if let Ok(r) = retry_result {
                    if let Ok(mut new_payload) = self.parse_payload::<McQuestionsPayload>(&r.content) {
                        normalization::normalise_mc(&mut new_payload.questions, &request.topics, selected_subs);
                        if normalization::validate_mc(&new_payload.questions, request.question_count).is_ok() {
                            let new_texts: Vec<String> = new_payload.questions.iter().map(|q| {
                                let opts = q.options.iter().map(|o| format!("{}: {}", o.label, o.text)).collect::<Vec<_>>().join(" ");
                                format!("{} {opts}", q.prompt_markdown)
                            }).collect();
                            let (new_metrics, new_summary) = quality::score_batch(&new_texts);
                            if new_summary.distinctness_avg.unwrap_or(0.0) > summary.distinctness_avg.unwrap_or(0.0) {
                                payload = new_payload; metrics = new_metrics; summary = new_summary;
                                for (q, metric) in payload.questions.iter_mut().zip(metrics.iter()) {
                                    q.distinctness_score = Some(metric.distinctness); q.multi_step_depth = Some(metric.depth);
                                }
                                break;
                            }
                        }
                    }
                }
                need_retry = attempts < 2 && (summary.distinctness_avg.is_some_and(|v| v < distinctness_threshold) || metrics.iter().any(|m| m.distinctness < per_question_distinctness_threshold));
            }
        }

        let final_latex_issues = self.collect_latex_issues(&payload.questions, true);
        quality_diagnostics = self.build_subtopic_diagnostics(selected_subs, payload.questions.iter().map(|q| q.subtopic.clone()).collect(), strict_subtopic_coverage, request.min_subtopic_coverage_ratio, request.question_count, final_latex_issues);

        let estimated_cost_usd = stats_result.ok().and_then(|stats| compute_generation_cost(Some(result.prompt_tokens as u64), Some(result.completion_tokens as u64), stats.prompt_price_per_token, stats.completion_price_per_token));
        let duration_ms = started.elapsed().as_millis() as u64;

        self.emit_generation_status(serde_json::json!({ "mode": "multiple-choice", "stage": "completed", "message": format!("Done — {} questions in {:.1}s.", payload.questions.len(), duration_ms as f64 / 1000.0), "attempt": 1, "totalTokens": result.total_tokens, "promptTokens": result.prompt_tokens, "completionTokens": result.completion_tokens, "estimatedCostUsd": estimated_cost_usd, "durationMs": duration_ms }));

        Ok(GenerateMcQuestionsResponse { questions: payload.questions, duration_ms, prompt_tokens: result.prompt_tokens, completion_tokens: result.completion_tokens, total_tokens: result.total_tokens, estimated_cost_usd, distinctness_avg: summary.distinctness_avg, multi_step_depth_avg: summary.multi_step_depth_avg, command_verb_diversity: summary.command_verb_diversity, mark_allocation_variance: summary.mark_allocation_variance, quality_diagnostics })
    }

    pub async fn mark_answer(&self, request: MarkAnswerRequest) -> CommandResult<MarkAnswerResponse> {
        let has_text = !request.student_answer.trim().is_empty();
        let has_image = request.student_answer_image_data_url.as_ref().is_some_and(|v| !v.trim().is_empty());
        if !has_text && !has_image {
            return Err(AppError::new("VALIDATION_ERROR", "Provide an answer or image."));
        }
        self.validate_params(&request.api_key, &request.model)?;
        if request.question.max_marks == 0 {
            return Err(AppError::new("VALIDATION_ERROR", "maxMarks must be > 0."));
        }

        const MAX_ANSWER_CHARS: usize = 12_000;
        let mut answer = sanitize_for_api(request.student_answer.replace("\r\n", "\n").lines().map(str::trim_end).collect::<Vec<_>>().join("\n").trim());
        if answer.chars().count() > MAX_ANSWER_CHARS {
            answer = answer.chars().take(MAX_ANSWER_CHARS).collect();
            answer.push_str("\n\n[Truncated: answer exceeded length limit.]");
        }

        let question_topic = sanitize_for_api(request.question.topic.trim());
        let question_subtopic = sanitize_for_api(request.question.subtopic.as_deref().unwrap_or("—").trim());
        let question_prompt = sanitize_for_api(&request.question.prompt_markdown);

        let chem_note = if question_topic.eq_ignore_ascii_case(constants::CHEMISTRY_TOPIC) { constants::CHEMISTRY_LATEX_GUIDANCE } else { "" };
        let pe_note = if question_topic.eq_ignore_ascii_case(constants::PHYSICAL_EDUCATION_TOPIC) {
            "\nPHYSICAL EDUCATION MARKING STYLE:\n- DO NOT use mathematical equations, derivations, or formula-based solutions in your exemplarResponseMarkdown, feedbackMarkdown, comparisonToSolutionMarkdown, or workedSolutionMarkdown.\n- VCE PE does not require formal mathematical working. Write all responses in clear prose — paragraphs, bullet points, and short explanations.\n- Simple named formulas are acceptable where the Study Design requires them (e.g. 'Fitt's principle', 'F = ma', 'VO₂max', '1RM') — but do NOT derive, rearrange, or chain equations. Mention the formula by name, then explain its application in words.\n- Award marks for quality of analysis, evaluation, and justification — not for mathematical rigour.\n"
        } else { "" };

        let max_marks = request.question.max_marks;
        let report_parts = pdf::build_report_file_parts(&self.app, std::slice::from_ref(&question_topic));
        let has_reports = !report_parts.is_empty();

        let report_preamble = if has_reports {
            "\n\nVCAA EXAMINERS' REPORT ATTACHED — USE AS MARKING AUTHORITY:\nThe attached PDF(s) are official VCAA examiners' reports containing marking schemes, common student errors, and expected solutions. Use them as the PRIMARY authority for criterion-based marking. Align your marking criteria, expected working, and common error feedback with the patterns described in these reports."
        } else { "" };

        let prompt = format!("Topic: {topic}\nSubtopic: {subtopic}\nQuestion ({max} marks):\n{question}\n\nStudent answer:\n{answer}\n\nMARKING INSTRUCTIONS:\n- Apply VCAA criterion-based marking strictly.\n- Do not award marks for correct answers without correct supporting working or reasoning (except for questions that are purely answer-only).\n- Do not credit vague restatements of the question as explanation.\n- For 'hence' sub-parts: the student must use the result from the immediately preceding part.\n- For 'show that' sub-parts: every algebraic step must be shown; a bare final result is zero.\n- For 'explain/justify': a numerical answer alone is insufficient — reasoning must be stated.\n- Produce one criterion per mark (or group closely related marks where natural).\n- The workedSolution must show every step a student would need to write to receive full marks.{report_preamble}", topic = question_topic, subtopic = question_subtopic, question = question_prompt, max = max_marks, answer = answer, report_preamble = report_preamble);

        let mut content_parts: Vec<serde_json::Value> = Vec::new();
        content_parts.push(serde_json::json!({ "type": "text", "text": prompt }));
        if let Some(url) = request.student_answer_image_data_url.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            if !url.starts_with("data:image/") { return Err(AppError::new("VALIDATION_ERROR", "Image must be a valid data URL.")); }
            const MAX_IMAGE_DATA_URL_LEN: usize = 20 * 1024 * 1024;
            if url.len() > MAX_IMAGE_DATA_URL_LEN { return Err(AppError::new("VALIDATION_ERROR", "Image is too large. Please use a smaller image.")); }
            content_parts.push(serde_json::json!({ "type": "image_url", "image_url": { "url": url } }));
        }
        content_parts.extend(report_parts);

        let user_content = serde_json::Value::Array(content_parts);
        let max_tokens = (max_marks as u32) * 2000 + 4000;
        let plugins = if has_reports {
            let stats_result = get_model_stats(request.api_key.clone(), request.model.clone()).await;
            let supports_files = stats_result.as_ref().ok().is_some_and(|s| s.supports_files);
            pdf::plugins_for_model(supports_files)
        } else { serde_json::json!([{ "id": "response-healing" }]) };

        let result = call_openrouter(OpenRouterRequestConfig::new(&request.api_key, &request.model, &prompts::marking_system(max_marks, chem_note, pe_note), user_content, schemas::marking_format(&request.model), max_tokens).with_plugins(plugins)).await?;

        let protected_marking = protect_latex_in_raw_json(&result.content);
        let json_str = extract_json_object(&protected_marking).ok_or_else(|| AppError::new("MODEL_PARSE_ERROR", format!("No JSON in marking response. Raw:\n{}", &result.content.chars().take(800).collect::<String>())))?;

        let mut parsed: MarkAnswerResponse = serde_json::from_str(&json_str).map_err(|e| AppError::new("MODEL_PARSE_ERROR", format!("Marking schema mismatch: {e}")))?;
        parsed.max_marks = if max_marks > 0 { max_marks } else { 10 };
        parsed.achieved_marks = parsed.achieved_marks.min(parsed.max_marks);

        if !parsed.vcaa_marking_scheme.is_empty() {
            let scheme_total = parsed.vcaa_marking_scheme.iter().map(|c| c.achieved_marks as u16).sum::<u16>().min(parsed.max_marks as u16) as u8;
            if scheme_total != parsed.achieved_marks { parsed.achieved_marks = scheme_total; }
        }

        if parsed.max_marks > 0 {
            parsed.score_out_of_10 = ((parsed.achieved_marks as f32 / parsed.max_marks as f32) * 10.0).round() as u8;
            parsed.score_out_of_10 = parsed.score_out_of_10.min(10);
        } else { parsed.score_out_of_10 = 0; }

        parsed.feedback_markdown = parsing::clean_field(&parsed.feedback_markdown);
        parsed.worked_solution_markdown = parsing::clean_field(&parsed.worked_solution_markdown);
        parsed.comparison_to_solution_markdown = parsing::clean_field(&parsed.comparison_to_solution_markdown);
        parsed.exemplar_response_markdown = parsing::clean_field(&parsed.exemplar_response_markdown);
        for c in &mut parsed.vcaa_marking_scheme {
            c.criterion = parsing::clean_field(&c.criterion);
            c.rationale = parsing::clean_field(&c.rationale);
        }
        for opt in &mut parsed.mc_option_explanations {
            opt.explanation = parsing::clean_field(&opt.explanation);
        }

        parsed.prompt_tokens = result.prompt_tokens;
        parsed.completion_tokens = result.completion_tokens;
        parsed.total_tokens = result.total_tokens;

        Ok(parsed)
    }

    pub async fn analyze_image(&self, request: AnalyzeImageRequest) -> CommandResult<AnalyzeImageResponse> {
        self.validate_params(&request.api_key, &request.model)?;
        if request.image_path.trim().is_empty() {
            return Err(AppError::new("VALIDATION_ERROR", "Image path required."));
        }

        let path = std::path::Path::new(&request.image_path);
        let mime = path.extension().and_then(|e| e.to_str()).and_then(|e| match e.to_ascii_lowercase().as_str() {
            "jpg" | "jpeg" => Some("image/jpeg"),
            "png" => Some("image/png"),
            "webp" => Some("image/webp"),
            "gif" => Some("image/gif"),
            "heic" => Some("image/heic"),
            "heif" => Some("image/heif"),
            _ => None,
        }).ok_or_else(|| AppError::new("VALIDATION_ERROR", "Unsupported format. Use png, jpg, webp, gif, heic, or heif."))?;

        let bytes = std::fs::read(path).map_err(|e| AppError::new(if e.kind() == std::io::ErrorKind::NotFound { "VALIDATION_ERROR" } else { "IO_ERROR" }, if e.kind() == std::io::ErrorKind::NotFound { "Image file not found.".to_string() } else { format!("Failed to read image: {e}") }))?;

        use base64::{engine::general_purpose, Engine as _};
        let data_url = format!("data:{mime};base64,{}", general_purpose::STANDARD.encode(bytes));
        let prompt = request.prompt.as_deref().filter(|v| !v.trim().is_empty()).unwrap_or("What's in this image?");

        let free_text_format = schemas::text_response_format(&request.model);

        let result = call_openrouter(OpenRouterRequestConfig::new(&request.api_key, &request.model, "You are a helpful visual reasoning assistant.", serde_json::json!([ { "type": "text", "text": prompt }, { "type": "image_url", "image_url": { "url": data_url } } ]), free_text_format, 4_500)).await?;

        let output_text = serde_json::from_str::<serde_json::Value>(&result.content).ok().and_then(|v| v.get("text").and_then(|t| t.as_str()).map(str::to_string)).unwrap_or(result.content);

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
    fn get_subtopic(&self) -> Option<String>;
}

impl QuestionWithMarkdown for GeneratedQuestion {
    fn get_id(&self) -> &str { &self.id }
    fn get_prompt(&self) -> &str { &self.prompt_markdown }
    fn get_explanation(&self) -> Option<&str> { None }
    fn get_subtopic(&self) -> Option<String> { self.subtopic.clone() }
}

impl QuestionWithMarkdown for McQuestion {
    fn get_id(&self) -> &str { &self.id }
    fn get_prompt(&self) -> &str { &self.prompt_markdown }
    fn get_explanation(&self) -> Option<&str> { Some(&self.explanation_markdown) }
    fn get_subtopic(&self) -> Option<String> { self.subtopic.clone() }
}
