mod catalog;
mod constants;
mod difficulty;
mod models;
mod openrouter;
mod openrouter_info;
mod parsing;
mod persistence;
mod quality;

#[allow(unused_imports)]
use base64::{engine::general_purpose, Engine as _};
use once_cell::sync::OnceCell;
#[allow(unused_imports)]
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::Instant;
use tauri::{Emitter, Manager};

static APP_HANDLE: OnceCell<tauri::AppHandle> = OnceCell::new();

use difficulty::difficulty_guidance;

fn adjust_difficulty(
    base_difficulty: &str,
    scaling_enabled: bool,
    recent_average_score: Option<f64>,
    recent_difficulty: Option<&str>,
) -> String {
    if !scaling_enabled {
        return base_difficulty.to_string();
    }
    let Some(score) = recent_average_score else {
        return base_difficulty.to_string();
    };
    let levels = ["Essential Skills", "Easy", "Medium", "Hard", "Extreme"];
    let mut current_index = levels
        .iter()
        .position(|&r| r == base_difficulty)
        .unwrap_or(2); // default Medium

    // If recent difficulty was different, adjust baseline
    if let Some(recent_diff) = recent_difficulty {
        if let Some(recent_idx) = levels.iter().position(|&r| r == recent_diff) {
            current_index = recent_idx;
        }
    }

    let new_index = if score > 85.0 {
        (current_index + 1).min(4)
    } else if score < 70.0 {
        current_index.saturating_sub(1)
    } else {
        current_index
    };

    levels[new_index].to_string()
}
use models::*;
use openrouter::{
    call_openrouter, call_openrouter_streaming_with_plugins, call_openrouter_with_plugins,
    is_anthropic_model, json_schema_format, json_schema_format_anthropic, OpenRouterRequestConfig,
};
use openrouter_info::{compute_generation_cost, get_credits, get_model_stats};
use parsing::{
    clean_field, extract_json_array, extract_json_object, normalise_envelope, normalise_mc,
    normalise_written, protect_latex_in_raw_json, repair_llm_json_trailing_commas,
    sanitize_for_api, validate_mc, validate_written,
};
use persistence::{
    export_data_file, export_data_file_to_directory, list_json_files_in_directory,
    load_persisted_state, read_text_file, save_persisted_state,
};
use quality::score_batch;

// ─── Token calculation helpers ────────────────────────────────────────────────

/// Calculate optimal token budget based on question count, average marks, and complexity.
/// More efficient than fixed multiplier: reduces tokens for simple batches, increases for complex ones.
fn calculate_optimal_max_tokens(
    question_count: usize,
    average_marks: u8,
    difficulty: &str,
    include_exam_context: bool,
) -> u32 {
    // Base tokens: 2000 per question for short/simple, scale with marks
    let base_per_question = match average_marks {
        1..=3 => 1800,   // Short answer questions
        4..=7 => 2500,   // Medium questions
        8..=15 => 3500,  // Complex multi-part
        16..=30 => 4500, // Extended response
        _ => 3000,
    };

    // Difficulty multiplier (affects expected depth/length of output)
    let difficulty_multiplier = match difficulty.to_ascii_lowercase().as_str() {
        "essential skills" => 0.85,
        "easy" => 0.95,
        "medium" => 1.0,
        "hard" => 1.15,
        "extreme" => 1.3,
        _ => 1.0,
    };

    // PDF context adds complexity (more instructions, anchoring text)
    let pdf_overhead = if include_exam_context { 1000 } else { 0 };

    // Calculate total with floor and ceiling
    let total = (question_count as u32 * (base_per_question as f32 * difficulty_multiplier) as u32)
        + pdf_overhead
        + 2000; // System instruction buffer

    total.clamp(3000, 64_000)
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/// Validate api_key + model, returning an error if either is empty.
fn validate_generation_params(api_key: &str, model: &str) -> CommandResult<()> {
    if api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "API key required."));
    }
    if model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model required."));
    }
    Ok(())
}

/// Emit a generation-status event, logging failures silently.
fn emit_generation_status(app: &tauri::AppHandle, payload: serde_json::Value) {
    if let Err(e) = app.emit("generation-status", payload) {
        eprintln!("app.emit failed: {e}");
    }
}

/// Map a difficulty label to (temperature, top_p) defaults.
fn difficulty_to_temperature(difficulty: &str) -> (f32, f32) {
    match difficulty {
        "Essential Skills" | "Easy" => (1.1, 0.9),
        "Medium" => (1.3, 0.9),
        "Hard" => (1.35, 0.9),
        "Extreme" => (1.5, 0.9),
        _ => (1.0, 0.9),
    }
}

// ─── Response format schemas ──────────────────────────────────────────────────

fn written_format(model: &str) -> serde_json::Value {
    let schema = serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["questions"],
        "properties": {
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["id","topic","subtopic","promptMarkdown","maxMarks","techAllowed"],
                    "properties": {
                        "id": { "type": "string" },
                        "topic": { "type": "string" },
                        "subtopic": { "type": ["string","null"] },
                        "promptMarkdown": { "type": "string" },
                        "maxMarks": { "type": "integer", "minimum": 1, "maximum": 30 },
                        "techAllowed": { "type": "boolean" }
                    }
                }
            }
        }
    });

    if is_anthropic_model(model) {
        json_schema_format_anthropic("written_questions", schema)
    } else {
        json_schema_format("written_questions", schema)
    }
}

fn mc_format(model: &str) -> serde_json::Value {
    let schema = serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["questions"],
        "properties": {
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["id","topic","subtopic","promptMarkdown","options","correctAnswer","explanationMarkdown","techAllowed"],
                    "properties": {
                        "id":                  { "type": "string" },
                        "topic":               { "type": "string" },
                        "subtopic":            { "type": ["string","null"] },
                        "promptMarkdown":      { "type": "string" },
                        "options": {
                            "type": "array", "minItems": 4, "maxItems": 4,
                            "items": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["label","text"],
                                "properties": {
                                    "label": { "type": "string" },
                                    "text":  { "type": "string" }
                                }
                            }
                        },
                        "correctAnswer":       { "type": "string", "enum": ["A","B","C","D"] },
                        "explanationMarkdown": { "type": "string" },
                        "techAllowed":         { "type": "boolean" }
                    }
                }
            }
        }
    });

    if is_anthropic_model(model) {
        json_schema_format_anthropic("mc_questions", schema)
    } else {
        json_schema_format("mc_questions", schema)
    }
}

fn marking_format(model: &str) -> serde_json::Value {
    let schema = serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["verdict","achievedMarks","maxMarks","scoreOutOf10",
                     "vcaaMarkingScheme","comparisonToSolutionMarkdown",
                     "feedbackMarkdown","workedSolutionMarkdown",
                     "exemplarResponseMarkdown","mcOptionExplanations","promptTokens","completionTokens","totalTokens"],
        "properties": {
            "verdict":       { "type": "string" },
            "achievedMarks": { "type": "integer", "minimum": 0 },
            "maxMarks":      { "type": "integer", "minimum": 1 },
            "scoreOutOf10":  { "type": "integer", "minimum": 0, "maximum": 10 },
            "vcaaMarkingScheme": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["criterion","achievedMarks","maxMarks","rationale"],
                    "properties": {
                        "criterion":     { "type": "string" },
                        "achievedMarks": { "type": "integer", "minimum": 0 },
                        "maxMarks":      { "type": "integer", "minimum": 0 },
                        "rationale":     { "type": "string" }
                    }
                }
            },
            "comparisonToSolutionMarkdown": { "type": "string" },
            "feedbackMarkdown":             { "type": "string" },
            "workedSolutionMarkdown":       { "type": "string" },
            "exemplarResponseMarkdown":     { "type": "string" },
            // Present for MC questions; empty array for written questions.
            "mcOptionExplanations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["option","isCorrect","explanation"],
                    "properties": {
                        "option":      { "type": "string" },
                        "isCorrect":   { "type": "boolean" },
                        "explanation": { "type": "string" }
                    }
                }
            },
            "promptTokens": { "type": "integer", "minimum": 0 },
            "completionTokens": { "type": "integer", "minimum": 0 },
            "totalTokens": { "type": "integer", "minimum": 0 }
        }
    });

    if is_anthropic_model(model) {
        json_schema_format_anthropic("mark_answer", schema)
    } else {
        json_schema_format("mark_answer", schema)
    }
}

// ─── System prompt builders ───────────────────────────────────────────────────
//
// Each system prompt ends with:
//   (a) the global LATEX_RULES constant, and
//   (b) a concise description of the expected JSON schema so the model knows
//       exactly what fields to emit even before it sees the response_format.
//       This is more reliable than relying on response_format alone.

fn generation_compliance_contract() -> &'static str {
    "CONTRACT: 1. Only assessable Study Design content. 2. Focus constraints override style PDFs. 3. PDFs are style-only; do NOT copy scenarios/content. 4. Valid JSON only."
}

fn topic_field_contract() -> &'static str {
    "FIELDS: 'topic' = subject name (e.g. Mathematical Methods); 'subtopic' = focus area label. No subtopics in 'topic' field."
}

fn written_system() -> String {
    format!(
        "You are an expert VCE exam writer for written-response questions.\n\
                 {contract}\n\
                 {latex_rules}\n\
                 {question_style_rules}\n\n\
                 RULES:\n\
                 - Sum of part marks must equal maxMarks.\n\
                 - 'show that': explicit steps required.\n\
                 - 'hence': must use previous result.\n\
                 - 'explain/justify': reasoning required.\n\n\
                 {field_contract}\n\n\
                 'promptMarkdown' contains STEM ONLY. No worked solutions or answers.",
        contract = generation_compliance_contract(),
        latex_rules = constants::LATEX_RULES,
        question_style_rules = constants::QUESTION_STYLE_RULES,
        field_contract = topic_field_contract(),
    )
}

fn mc_system() -> String {
    format!(
                "You are an expert VCE exam writer for multiple-choice questions.\n\
                 Provide only final answers and concise rationale, never chain-of-thought.\n\
                 {contract}\n\
                 {latex_rules}\n\
                 {mc_distractor_rules}\n\n\
                 {field_contract}\n\n\
                 'promptMarkdown' contains STEM ONLY. No options (A-D) in stem. Return valid JSON only.",
                 contract = generation_compliance_contract(),
                 latex_rules = constants::LATEX_RULES,
                 mc_distractor_rules = constants::MC_DISTRACTOR_RULES,
                 field_contract = topic_field_contract(),
    )
}

/// Build the marking system prompt with word limits scaled to question size.
///
/// Limits scale with `max_marks` so a 10-mark question gets generous space for a
/// worked solution while a 1-mark question stays concise. The minimum ensures the
/// model always has enough room for a useful response.
fn marking_system(max_marks: u8, chem_note: &str, phys_ed_note: &str) -> String {
    // Scale word limits by marks, with sensible floors.
    let worked_words = (max_marks as usize * 200).clamp(500, 2000);
    let comparison_words = (max_marks as usize * 60).clamp(200, 800);
    let feedback_words = (max_marks as usize * 50).clamp(200, 600);
    let rationale_words = (max_marks as usize * 30).clamp(100, 400);

    format!(
        "You are a strict VCE marker. \
         MARKING: 1. Apply criterion-based marking (steps, not just answers). 2. Award for method even if arithmetic slips. 3. 'show that' needs steps. 4. 'hence' must use previous part. 5. MC: explain all 4 options. \
         REPORTS: If PDFs attached, they are PRIMARY authority for criteria and common errors. \
         LIMITS: Verdict ('Correct'/'Incorrect'), Rationale (≤{rationale_words} words), Comparison (≤{comparison_words}), Feedback (≤{feedback_words}), Worked Solution (≤{worked_words} words). \
         FEEDBACK STYLE: Use ## Strengths, ## Areas for Improvement, ## Common Pitfalls headers ONLY. Keep tone professional and measured. Avoid excessive exclamation marks (!). \
         {latex_rules}{chem_note}{phys_ed_note}\n\n\
         Return valid JSON only. No fences/commentary.",
         rationale_words = rationale_words,
         comparison_words = comparison_words,
         feedback_words = feedback_words,
         worked_words = worked_words,
         latex_rules = constants::LATEX_RULES,
         chem_note = chem_note,
          phys_ed_note = phys_ed_note
    )
}

// ─── Shared prompt-note builders ──────────────────────────────────────────────

fn topic_notes(topics: &[String], _selected_subs: Option<&Vec<String>>) -> String {
    let mut s = String::new();
    for topic_name in topics {
        let guidance = catalog::topic_exam_guidance(topic_name);
        if !guidance.is_empty() {
            s.push('\n');
            s.push_str(guidance);
        }
    }
    s
}

fn tech_note(mode: &str, topics: &[String]) -> String {
    let is_math = topics.iter().any(|t| {
        let low = t.to_lowercase();
        low.contains("methods") || low.contains("specialist")
    });

    match mode {
        "tech-free" => {
            let mut s = " All questions tech-free; set techAllowed:false.".to_string();
            if is_math {
                s.push_str(" For math, focus on direct application of skills.");
            }
            s
        }
        "tech-active" => {
            let mut s = " All questions tech-active; set techAllowed:true.".to_string();
            if is_math {
                s.push_str(" For math, focus on application in realistic scenarios/contexts.");
            }
            s
        }
        _ => " Mix tech-free and tech-active; set techAllowed per question.".to_string(),
    }
}

fn subtopics_note(selected: Option<&Vec<String>>) -> String {
    let Some(subs) = selected.filter(|s| !s.is_empty()) else {
        return String::new();
    };
    let mut s = format!("\nFocus subtopics: {}.", subs.join(", "));

    // Inject Study Design key knowledge and exam technique notes from the catalog.
    let exam_map = constants::shared_subtopic_exam_technique_notes();
    for sub in subs {
        let key = sub.trim().to_ascii_lowercase();

        if let Some(exam) = exam_map.get(key.as_str()) {
            s.push_str(&format!("\n\n[{sub}]\n{exam}"));
        }
    }
    s
}

fn subtopic_synthesis_note(selected: Option<&Vec<String>>, question_count: usize) -> String {
    let Some(_) = selected.filter(|s| s.len() > 1) else {
        return String::new();
    };

    let min_to_blend = if question_count <= 3 { 2 } else { 1 };
    let blend_scope = if min_to_blend >= 2 {
        "integrate at least two focus areas per question"
    } else {
        "integrate multiple areas where valid"
    };

    format!("\nINTEGRATED: {blend_scope}. Prefer exam-style synthesis. Use one primary subtopic label per question.")
}

fn focus_lock_note(selected: Option<&Vec<String>>, custom_focus_area: Option<&str>) -> String {
    let mut constraints = Vec::<String>::new();
    if let Some(subs) = selected {
        if !subs.is_empty() {
            constraints.push(format!("Subtopics: {}.", subs.join(", ")));
        }
    }
    if let Some(area) = custom_focus_area {
        let trimmed = area.trim();
        if !trimmed.is_empty() {
            constraints.push(format!("Custom focus: \"{trimmed}\"."));
        }
    }

    if constraints.is_empty() {
        return String::new();
    }

    format!(
        "\nFOCUS LOCK: {}. Use these focus constraints exclusively; prioritize over PDF content.",
        constraints.join(" ")
    )
}

/// Builds a post-PDF re-anchor text block that is appended AFTER the PDF bytes in the message
/// array. After processing a large PDF the model's attention drifts toward the PDF content;
/// this block immediately reasserts the user-specified focus constraints so the model generates
/// from those constraints rather than from whatever was last prominent in context.
fn pdf_reanchor_note(selected: Option<&Vec<String>>, custom_focus_area: Option<&str>) -> String {
    let mut lines = vec![
        "── PDF STYLE REFERENCE ENDS HERE ──".to_string(),
        "Return to the focus constraints specified earlier:".to_string(),
    ];
    if let Some(subs) = selected {
        if !subs.is_empty() {
            lines.push(format!("• Subtopics: {}.", subs.join(", ")));
        }
    }
    if let Some(area) = custom_focus_area {
        let trimmed = area.trim();
        if !trimmed.is_empty() {
            lines.push(format!("• Custom focus: \"{trimmed}\"."));
        }
    }
    lines.push(
        "IMPORTANT: PDFs are for style ONLY. DO NOT reuse any content, scenarios, or numbers. \
         Generate original contexts mapping exclusively to focus constraints."
            .to_string(),
    );
    lines.join("\n")
}

fn diversity_thresholds(level: Option<&str>) -> (f32, f32) {
    match level.unwrap_or("moderate") {
        "lenient" => (0.5, 0.25),
        "strict" => (0.75, 0.5),
        _ => (0.6, 0.35),
    }
}

fn resolve_min_subtopic_coverage_ratio(
    strict: bool,
    requested: Option<f32>,
    question_count: usize,
    selected_count: usize,
) -> f32 {
    if selected_count == 0 {
        return 1.0;
    }
    let feasible = (question_count as f32 / selected_count as f32).clamp(0.0, 1.0);
    let base = requested
        .unwrap_or(if strict { 1.0 } else { 0.7 })
        .clamp(0.0, 1.0);
    if strict {
        feasible
    } else {
        base.min(feasible)
    }
}

fn build_subtopic_coverage_diagnostics(
    selected: Option<&Vec<String>>,
    produced: Vec<Option<String>>,
    strict: bool,
    requested_ratio: Option<f32>,
    question_count: usize,
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

    let min_ratio = resolve_min_subtopic_coverage_ratio(
        strict,
        requested_ratio,
        question_count,
        selected_unique.len(),
    );
    let ratio = if selected_unique.is_empty() {
        1.0
    } else {
        covered.len() as f32 / selected_unique.len() as f32
    };

    Some(GenerationQualityDiagnostics {
        selected_subtopics: selected_unique,
        covered_subtopics: covered,
        uncovered_subtopics: uncovered,
        out_of_scope_subtopics: out_of_scope,
        subtopic_coverage_ratio: ratio,
        min_subtopic_coverage_ratio: min_ratio,
        latex_issue_count: 0,
        latex_issue_examples: Vec::new(),
    })
}

fn latex_brace_issues(segment: &str) -> Option<String> {
    let mut stack: Vec<char> = Vec::new();
    let mut chars = segment.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            let _ = chars.next();
            continue;
        }
        match ch {
            '{' | '[' | '(' => stack.push(ch),
            '}' => {
                if stack.pop() != Some('{') {
                    return Some("mismatched braces".to_string());
                }
            }
            ']' => {
                if stack.pop() != Some('[') {
                    return Some("mismatched brackets".to_string());
                }
            }
            ')' => {
                if stack.pop() != Some('(') {
                    return Some("mismatched parentheses".to_string());
                }
            }
            _ => {}
        }
    }
    if stack.is_empty() {
        None
    } else {
        Some("unbalanced delimiters".to_string())
    }
}

fn first_brace_group(content: &str) -> Option<(String, usize)> {
    let mut chars = content.chars();
    if chars.next()? != '{' {
        return None;
    }

    let mut depth = 1usize;
    let mut consumed = 1usize;
    let mut out = String::new();
    let mut escaped = false;

    for ch in chars {
        consumed += ch.len_utf8();
        if escaped {
            out.push(ch);
            escaped = false;
            continue;
        }
        if ch == '\\' {
            out.push(ch);
            escaped = true;
            continue;
        }
        if ch == '{' {
            depth += 1;
            out.push(ch);
            continue;
        }
        if ch == '}' {
            depth -= 1;
            if depth == 0 {
                return Some((out, consumed));
            }
            out.push(ch);
            continue;
        }
        out.push(ch);
    }

    None
}

fn latex_semantic_issues(segment: &str) -> Vec<String> {
    let mut issues = Vec::<String>::new();
    let mut i = 0usize;
    let bytes = segment.as_bytes();

    while i < bytes.len() {
        if bytes[i] != b'\\' {
            i += 1;
            continue;
        }

        let mut j = i + 1;
        while j < bytes.len() && bytes[j].is_ascii_alphabetic() {
            j += 1;
        }

        if j == i + 1 {
            i += 1;
            continue;
        }

        let command = &segment[i + 1..j];
        if matches!(command, "frac" | "dfrac" | "tfrac") {
            let after = &segment[j..];
            let Some((numerator, used_numerator)) = first_brace_group(after) else {
                issues.push(format!("\\{} missing numerator braces", command));
                i = j;
                continue;
            };
            let after_numerator = &after[used_numerator..];
            let Some((denominator, used_denominator)) = first_brace_group(after_numerator) else {
                issues.push(format!("\\{} missing denominator braces", command));
                i = j + used_numerator;
                continue;
            };

            if numerator.trim().is_empty() {
                issues.push(format!("\\{} has empty numerator", command));
            }
            if denominator.trim().is_empty() {
                issues.push(format!("\\{} has empty denominator", command));
            }

            i = j + used_numerator + used_denominator;
            continue;
        }

        i = j;
    }

    issues
}

fn latex_issues_for_text(text: &str) -> Vec<String> {
    let mut issues = Vec::<String>::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0usize;
    let mut inline_open = false;
    let mut display_open = false;
    let mut segment_start = 0usize;
    let mut math_ranges = Vec::<(usize, usize)>::new();

    while i < chars.len() {
        let ch = chars[i];
        if ch == '\\' {
            i += 2;
            continue;
        }
        if ch == '$' {
            let is_display = i + 1 < chars.len() && chars[i + 1] == '$';
            if is_display {
                if display_open {
                    let segment: String = chars[segment_start..i].iter().collect();
                    if let Some(issue) = latex_brace_issues(&segment) {
                        issues.push(format!("display math {issue}"));
                    }
                    for semantic_issue in latex_semantic_issues(&segment) {
                        issues.push(format!("display math {semantic_issue}"));
                    }
                    math_ranges.push((segment_start, i));
                    display_open = false;
                } else {
                    display_open = true;
                    segment_start = i + 2;
                }
                i += 2;
                continue;
            }

            if inline_open {
                let segment: String = chars[segment_start..i].iter().collect();
                if let Some(issue) = latex_brace_issues(&segment) {
                    issues.push(format!("inline math {issue}"));
                }
                for semantic_issue in latex_semantic_issues(&segment) {
                    issues.push(format!("inline math {semantic_issue}"));
                }
                math_ranges.push((segment_start, i));
                inline_open = false;
            } else {
                inline_open = true;
                segment_start = i + 1;
            }
        }
        i += 1;
    }

    if inline_open {
        issues.push("unclosed inline math delimiter ($)".to_string());
    }
    if display_open {
        issues.push("unclosed display math delimiter ($$)".to_string());
    }
    if text.contains("\\$") && text.contains("$") && !text.matches('$').count().is_multiple_of(2) {
        issues.push("mixed currency/math dollar usage".to_string());
    }

    let mut index = 0usize;
    while let Some(pos) = text[index..].find("\\frac") {
        let absolute_pos = index + pos;
        let inside_math = math_ranges
            .iter()
            .any(|(start, end)| absolute_pos >= *start && absolute_pos < *end);
        if !inside_math {
            issues.push("\\frac found outside math delimiters".to_string());
            break;
        }
        index = absolute_pos + 5;
    }

    issues
}

fn truncate_for_prompt(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        return s.to_string();
    }
    let mut out = String::new();
    for ch in s.chars().take(max_chars) {
        out.push(ch);
    }
    out.push_str("...");
    out
}

fn prior_examples_note(prior: Option<&[String]>) -> String {
    let Some(prior) = prior else {
        return String::new();
    };
    let mut out = Vec::new();
    for item in prior.iter().take(3) {
        let trimmed = item.trim();
        if trimmed.is_empty() {
            continue;
        }
        out.push(format!(
            "- {}",
            sanitize_for_api(&truncate_for_prompt(trimmed, 140))
        ));
    }
    if out.is_empty() {
        return String::new();
    }
    format!(
        "\nRECENT QUESTIONS TO AVOID PARAPHRASING:\n{}\nTreat these as banned scenario/style anchors.",
        out.join("\n")
    )
}

fn similarity_note(enabled: bool, prior: Option<&[String]>) -> String {
    // Compressed diversity constraint: reduced token overhead while maintaining clarity
    if !enabled {
        return String::from(
            "\nDIVERSITY: Each question must use distinct scenarios, contexts, and methods. \
             No repetition of previous questions' structure, numbers, or wording.",
        );
    }
    format!(
        "\nSTRICT DIVERSITY: Generate wholly distinct questions. Avoid reusing scenarios, \
         characters, names, settings, numbers, or reasoning patterns. If unable to invent \
         a unique question for a concept, choose a different concept instead. Prioritize \
         creative variation in context and approach over paraphrased similarity.{}",
        prior_examples_note(prior)
    )
}

/// Generate adaptive guidance based on detected quality issues in the batch.
fn adaptive_quality_note(metrics: &[crate::quality::QuestionQualityMetrics]) -> String {
    let (has_issues, issues_desc) = crate::quality::analyze_batch_quality_issues(metrics);
    if !has_issues {
        return String::new();
    }

    format!(
        "\n\nADAPTIVE QUALITY GUIDANCE:\n\
         Previous generation showed these patterns: {}\n\
         For this retry: ensure {}\n\
         Use varied command verbs (define, derive, analyze, evaluate, justify, compare, etc.).\n\
         Vary scaffolding: mix single-part questions with multi-part (a), (b), (c) structures.",
        issues_desc,
        if issues_desc.contains("single-part") {
            "at least 50% of questions include multi-part structure"
        } else {
            "strong variety in question structure"
        }
    )
}

fn exam_pdf_names_for_topics(topics: &[String]) -> Vec<&str> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for topic in topics {
        for name in catalog::topic_exam_pdfs(topic) {
            if seen.insert(name.as_str()) {
                out.push(name.as_str());
            }
        }
    }
    out
}

fn report_pdf_names_for_topics(topics: &[String]) -> Vec<&str> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for topic in topics {
        for name in catalog::topic_report_pdfs(topic) {
            if seen.insert(name.as_str()) {
                out.push(name.as_str());
            }
        }
    }
    out
}

fn resolve_pdf_path(app: &tauri::AppHandle, subdir: &str, filename: &str) -> Option<PathBuf> {
    let mut dirs = Vec::<PathBuf>::new();
    if let Ok(cwd) = std::env::current_dir() {
        dirs.push(cwd.join(subdir));
        dirs.push(cwd.join("../").join(subdir));
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        dirs.push(resource_dir.clone());
        dirs.push(resource_dir.join(subdir));
    }

    let mut seen = HashSet::<PathBuf>::new();
    for dir in dirs {
        if !seen.insert(dir.clone()) {
            continue;
        }
        let candidate = dir.join(filename);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn build_pdf_file_parts(
    app: &tauri::AppHandle,
    subdir: &str,
    filenames: &[&str],
) -> Vec<serde_json::Value> {
    let mut parts = Vec::new();
    for &filename in filenames {
        let Some(path) = resolve_pdf_path(app, subdir, filename) else {
            continue;
        };
        let Ok(bytes) = std::fs::read(&path) else {
            continue;
        };
        let data_url = format!(
            "data:application/pdf;base64,{}",
            general_purpose::STANDARD.encode(&bytes)
        );
        parts.push(serde_json::json!({
            "type": "file",
            "file": {
                "filename": filename,
                "file_data": data_url,
            }
        }));
    }
    parts
}

fn build_exam_file_parts(app: &tauri::AppHandle, topics: &[String]) -> Vec<serde_json::Value> {
    let filenames = exam_pdf_names_for_topics(topics);
    build_pdf_file_parts(app, "exams", &filenames)
}

fn build_report_file_parts(app: &tauri::AppHandle, topics: &[String]) -> Vec<serde_json::Value> {
    let filenames = report_pdf_names_for_topics(topics);
    build_pdf_file_parts(app, "reports", &filenames)
}

/// Determine the plugins configuration based on whether the model supports files natively.
fn plugins_for_model(supports_files: bool) -> serde_json::Value {
    if supports_files {
        serde_json::json!([{ "id": "response-healing" }])
    } else {
        serde_json::json!([
            { "id": "response-healing" },
            {
                "id": "file-parser",
                "pdf": { "engine": "cloudflare-ai" }
            }
        ])
    }
}

fn math_difficulty_note(difficulty: &str, topics: &[String]) -> &'static str {
    if topics
        .iter()
        .any(|t| t.trim().eq_ignore_ascii_case("Mathematical Methods"))
    {
        match difficulty.to_ascii_lowercase().as_str() {
            "essential skills" => {
                " Math Essential Skills: single-skill items, direct substitution only."
            }
            "extreme" => {
                " Math Extreme: multi-part proofs, chain reasoning, first-principles derivation."
            }
            _ => "",
        }
    } else {
        match difficulty.to_ascii_lowercase().as_str() {
            "essential skills" => {
                " Essential Skills: straightforward questions, minimal inference."
            }
            "extreme" => " Extreme: multi-step reasoning, synthesis of multiple concepts.",
            _ => "",
        }
    }
}

fn math_methods_exam1_tech_free_note(topics: &[String], tech_mode: &str) -> &'static str {
    let is_methods = topics
        .iter()
        .any(|t| t.trim().eq_ignore_ascii_case("Mathematical Methods"));
    if !is_methods || tech_mode != "tech-free" {
        return "";
    }

    "\nMATHEMATICAL METHODS EXAM 1 STYLE (TECH-FREE, MANDATORY):\n\
     - Follow a scaffolded structure where earlier parts produce results that are explicitly reused in later parts.\n\
     - Sequence cognitive demand as procedural setup -> analysis -> synthesis/justification.\n\
     - Balance the batch across algebra/functions, calculus, and probability/statistics.\n\
     - Include both discrete and continuous probability contexts where syllabus-valid; continuous tasks should require integral reasoning in a tech-free way.\n\
     - For any item worth more than 1 mark, design prompts that require clear intermediate working, not just a final answer.\n\
     - Include some later-question style tasks with literal constants/parameters (for example, w) that require symbolic reasoning rather than numeric-only substitution.\n\
     - Maintain strict non-CAS framing: exact values and method-focused working where appropriate."
}

fn probability_distribution_table_note(topics: &[String]) -> &'static str {
    let needs_table_note = topics.iter().any(|t| {
        let low = t.to_lowercase();
        low.contains("probability")
            || low.contains("random variables")
            || low.contains("statistics")
            || low.contains("data analysis")
            || low.contains("mathematical methods")
            || low.contains("specialist mathematics")
    });

    if !needs_table_note {
        return "";
    }

    // Removed the semicolon to allow the expression to return
    // Used a Raw String literal for cleaner LaTeX and quote handling
    r#"
PROBABILITY DISTRIBUTION TABLE FORMAT (MANDATORY, STRICT):
- USE LATEX ARRAY WITH DOUBLE BACKSLASH ROW TERMINATOR: \\ (TWO CONSECUTIVE BACKSLASHES)
- CORRECT EXAMPLES:
  * \begin{array}{c|cc} X & 0 & 1 \\ \hline P(X=x) & 0.5 & 0.5 \end{array}
  * \begin{array}{c|ccc} Y & 1 & 2 & 3 \\ \hline P(Y=y) & \frac{1}{6} & \frac{1}{3} & \frac{1}{2} \end{array}
- CRITICAL: Row breaks use \\ (double backslash), NOT \ (single backslash followed by space).
- FORBIDDEN FORMATS:
  * Using single backslash: x & 1 & 2 \ \hline (WRONG — generates LaTeX errors)
  * Markdown tables: | X | 0 | 1 | (WRONG — invalid)
  * Plain text columns: X: 0, 1 (WRONG — invalid)
- Mathematical Integrity: All probabilities must satisfy $\sum_y P(Y=y) = 1$. If the model's probabilities do not sum to 1, correct them or show the algebraic normalisation step.
- Parametric Calculation: If probabilities are expressed using a parameter (e.g., $k$), explicitly solve for the parameter and substitute the numeric values. Example: if $10k = 1$ then state $k = 0.1$ and show substituted probabilities.
- Numeric/Precision: Provide probabilities as decimals or exact fractions in LaTeX; avoid imprecise text like "about 0.2".
- Continuous Variables: For PDFs provide an explicit LaTeX expression for the PDF and state the domain and integration limits used to verify total probability equals 1."#
}
// ─── Shared parse pipeline ────────────────────────────────────────────────────

/// Extract + deserialise a `{"questions":[...]}` payload from a raw model string.
fn parse_questions_payload<T: serde::de::DeserializeOwned>(raw: &str) -> CommandResult<T> {
    // Protect LaTeX commands (\frac, \text, \beta, etc.) from being destroyed
    // by JSON escape-sequence interpretation before any parsing occurs.
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

fn apply_tech_override<T: TechAllowed>(questions: &mut [T], mode: &str) {
    match mode {
        "tech-free" => questions.iter_mut().for_each(|q| q.set_tech_allowed(false)),
        "tech-active" => questions.iter_mut().for_each(|q| q.set_tech_allowed(true)),
        _ => {}
    }
}

trait TechAllowed {
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

#[tauri::command]
async fn generate_questions(
    app: tauri::AppHandle,
    request: GenerateQuestionsRequest,
) -> CommandResult<GenerateQuestionsResponse> {
    if request.topics.is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Select at least one topic.",
        ));
    }
    if request.question_count == 0 || request.question_count > constants::MAX_QUESTION_COUNT {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            format!(
                "Question count must be 1–{}.",
                constants::MAX_QUESTION_COUNT
            ),
        ));
    }
    validate_generation_params(&request.api_key, &request.model)?;

    let started = Instant::now();
    let selected_subs = request.subtopics.as_ref().filter(|s| !s.is_empty());
    let tech_mode = request.tech_mode.as_deref().unwrap_or("mix");
    let include_exam_context = request.include_exam_context.unwrap_or(false);
    let strict_latex_validation = request.strict_latex_validation.unwrap_or(false);
    let strict_subtopic_coverage = request.strict_subtopic_coverage.unwrap_or(false);
    let (distinctness_threshold, per_question_distinctness_threshold) =
        diversity_thresholds(request.diversity_strictness.as_deref());

    // Adjust difficulty based on AI scaling
    let adjusted_difficulty = adjust_difficulty(
        &request.difficulty,
        request.ai_difficulty_scaling_enabled.unwrap_or(false),
        request.recent_average_score,
        request.recent_difficulty.as_deref(),
    );

    let average_marks = request.average_marks_per_question.unwrap_or(10);
    let total_marks = average_marks as usize * request.question_count;
    let custom_note = request
        .custom_focus_area
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map_or(String::new(), |v| {
            format!(" Custom focus: \"{v}\". Align all questions to this where syllabus-valid.")
        });
    let methods_exam1_note = math_methods_exam1_tech_free_note(&request.topics, tech_mode);
    let prob_table_note = probability_distribution_table_note(&request.topics);

    emit_generation_status(
        &app,
        serde_json::json!({
            "mode": "written", "stage": "preparing",
            "message": "Building prompt.", "attempt": 1
        }),
    );

    let exam_context_preamble = if include_exam_context {
        "\n\nEXAM PDF CONTEXT:\n\
         - Use attached PDFs for wording/layout style only.\n\
         - Do not source topics, facts, numbers, or scenarios from PDFs.\n\
         - Apply focus constraints and Study Design limits before final output."
    } else {
        ""
    };

    let prompt = format!(
        "Generate {count} VCE written questions. Topics: {topics}. Difficulty: {difficulty}, {diff_rules}. \
         Avg marks: {average_marks}. Total marks: {total_marks}. \
         Complexity must match marks (e.g., 5-6 marks = 2-3 parts). \
         {subs_note}{synth_note}{custom_note}{tech}{topic_notes}{math_diff}{methods_exam1_note}{prob_table_note}{sim_note}{focus_lock}{exam_context_preamble} \
         Output exactly {count} questions.",
        count                 = request.question_count,
        topics                = sanitize_for_api(&request.topics.join(", ")),
        difficulty            = adjusted_difficulty,
        diff_rules            = difficulty_guidance(&adjusted_difficulty),
        subs_note             = sanitize_for_api(&subtopics_note(selected_subs)),
        synth_note            = sanitize_for_api(&subtopic_synthesis_note(selected_subs, request.question_count)),
        custom_note           = sanitize_for_api(&custom_note),
        tech                  = tech_note(tech_mode, &request.topics),
        topic_notes           = topic_notes(&request.topics, selected_subs),
        math_diff             = math_difficulty_note(&adjusted_difficulty, &request.topics),
        methods_exam1_note    = methods_exam1_note,
        prob_table_note       = prob_table_note,
        focus_lock            = sanitize_for_api(&focus_lock_note(selected_subs, request.custom_focus_area.as_deref())),
        exam_context_preamble = exam_context_preamble,
        average_marks         = average_marks,
        total_marks           = total_marks,
        sim_note              = sanitize_for_api(&similarity_note(
            request.avoid_similar_questions.unwrap_or(false),
            request.prior_question_prompts.as_deref(),
        )),
    );

    emit_generation_status(
        &app,
        serde_json::json!({
            "mode": "written", "stage": "generating",
            "message": format!("Generating {} questions…", request.question_count),
            "attempt": 1
        }),
    );

    let written_sys = written_system();
    let written_fmt = written_format(&request.model);
    let max_tokens = calculate_optimal_max_tokens(
        request.question_count,
        average_marks,
        &adjusted_difficulty,
        include_exam_context,
    );

    // Determine model capabilities and plugins before building the request.
    let stats_result = get_model_stats(request.api_key.clone(), request.model.clone()).await;
    let supports_files = stats_result.as_ref().ok().is_some_and(|s| s.supports_files);
    let plugins = plugins_for_model(supports_files);

    let user_content = if include_exam_context {
        let mut parts = vec![serde_json::json!({ "type": "text", "text": prompt })];
        let exam_parts = build_exam_file_parts(&app, &request.topics);
        parts.extend(exam_parts);
        let report_parts = build_report_file_parts(&app, &request.topics);
        parts.extend(report_parts);
        let reanchor = sanitize_for_api(&pdf_reanchor_note(
            selected_subs,
            request.custom_focus_area.as_deref(),
        ));
        parts.push(serde_json::json!({ "type": "text", "text": reanchor }));
        serde_json::Value::Array(parts)
    } else {
        serde_json::Value::String(prompt)
    };

    // Determine temperature, top_p, seed (difficulty-aware tuning)
    let (base_temp, base_top_p) = difficulty_to_temperature(&adjusted_difficulty);
    let temperature = request.temperature.unwrap_or(base_temp);
    let top_p = request.top_p.unwrap_or(base_top_p);
    let seed = request.seed;

    let result = call_openrouter_streaming_with_plugins(OpenRouterRequestConfig::with_app(
        app.clone(),
        &request.api_key,
        &request.model,
        &written_sys,
        user_content,
        &written_fmt,
        max_tokens,
        temperature,
        top_p,
        seed,
        plugins.clone(),
    ))
    .await?;

    emit_generation_status(
        &app,
        serde_json::json!({
            "mode": "written", "stage": "parsing",
            "message": "Parsing and validating questions.",
            "attempt": 1
        }),
    );

    let mut payload: WrittenQuestionsPayload = parse_questions_payload(&result.content)?;
    normalise_written(&mut payload.questions, &request.topics, selected_subs);
    validate_written(&payload.questions, request.question_count)?;
    apply_tech_override(&mut payload.questions, tech_mode);

    let mut latex_issue_examples = Vec::<String>::new();
    for q in &payload.questions {
        for issue in latex_issues_for_text(&q.prompt_markdown)
            .into_iter()
            .take(2)
        {
            latex_issue_examples.push(format!("{}: {}", q.id, issue));
            if latex_issue_examples.len() >= 6 {
                break;
            }
        }
        if latex_issue_examples.len() >= 6 {
            break;
        }
    }

    let mut quality_diagnostics = build_subtopic_coverage_diagnostics(
        selected_subs,
        payload
            .questions
            .iter()
            .map(|q| q.subtopic.clone())
            .collect(),
        strict_subtopic_coverage,
        request.min_subtopic_coverage_ratio,
        request.question_count,
    );
    if let Some(diag) = quality_diagnostics.as_mut() {
        diag.latex_issue_count = latex_issue_examples.len();
        diag.latex_issue_examples = latex_issue_examples.clone();
    }

    if strict_latex_validation && !latex_issue_examples.is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            format!(
                "Generated output failed strict LaTeX validation ({} issue(s)); first issue: {}",
                latex_issue_examples.len(),
                latex_issue_examples[0]
            ),
        ));
    }

    if strict_subtopic_coverage {
        if let Some(diag) = &quality_diagnostics {
            if diag.subtopic_coverage_ratio + 0.0001 < diag.min_subtopic_coverage_ratio {
                return Err(AppError::new(
                    "VALIDATION_ERROR",
                    format!(
                        "Generated output did not meet subtopic coverage target ({:.0}% < {:.0}%). Missing: {}",
                        diag.subtopic_coverage_ratio * 100.0,
                        diag.min_subtopic_coverage_ratio * 100.0,
                        diag.uncovered_subtopics.join(", ")
                    ),
                ));
            }
            if !diag.out_of_scope_subtopics.is_empty() {
                return Err(AppError::new(
                    "VALIDATION_ERROR",
                    format!(
                        "Generated output used out-of-scope subtopics: {}",
                        diag.out_of_scope_subtopics.join(", ")
                    ),
                ));
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
            if diff > 0 {
                indices.sort_by_key(|&i| payload.questions[i].max_marks);
            } else {
                indices.sort_by_key(|&i| std::cmp::Reverse(payload.questions[i].max_marks));
            }

            for (pos, &i) in indices.iter().enumerate() {
                let adj = base_adj
                    + if (pos as i64) < remainder {
                        diff.signum()
                    } else {
                        0
                    };
                let new_marks = (payload.questions[i].max_marks as i64 + adj).clamp(
                    constants::MIN_MARKS_PER_QUESTION as i64,
                    constants::MAX_MARKS_PER_QUESTION as i64,
                );
                payload.questions[i].max_marks = new_marks as u8;
            }
        }
    }

    let texts: Vec<String> = payload
        .questions
        .iter()
        .map(|q| q.prompt_markdown.clone())
        .collect();
    let (metrics, mut summary) = score_batch(&texts);

    let mark_values: Vec<u8> = payload.questions.iter().map(|q| q.max_marks).collect();
    summary.mark_allocation_variance =
        Some(quality::compute_mark_allocation_variance(&mark_values));

    for (q, metric) in payload.questions.iter_mut().zip(metrics.iter()) {
        q.distinctness_score = Some(metric.distinctness);
        q.multi_step_depth = Some(metric.depth);
        q.verb_diversity_count = Some(metric.verb_diversity);
        q.scaffold_pattern = Some(metric.scaffold_pattern.clone());
    }

    // If de-duplication requested and batch shows low distinctness, attempt a
    // small number of retries with stronger diversity instruction and slightly
    // higher temperature. This gives the model another chance to produce more
    // unique questions when the first output is too similar.
    let mut metrics = metrics;
    let metrics_ref = &metrics;
    if request.avoid_similar_questions.unwrap_or(false) {
        let mut need_retry = summary
            .distinctness_avg
            .is_some_and(|v| v < distinctness_threshold)
            || metrics_ref
                .iter()
                .any(|m| m.distinctness < per_question_distinctness_threshold);

        let mut attempts = 0;
        while need_retry && attempts < 2 {
            attempts += 1;
            emit_generation_status(
                &app,
                serde_json::json!({
                    "mode": "written",
                    "stage": "regenerating-duplicates",
                    "message": format!("Regenerating to improve diversity (attempt {})...", attempts),
                    "attempt": attempts + 1
                }),
            );

            let diversity_note = "\nDIVERSITY REGENERATION: The previous output contained similar questions. Now generate a new set of questions, replacing any that are similar with entirely different scenarios, contexts, names, numbers, or methods. Do NOT paraphrase previous questions; invent fresh contexts. Increase creativity and change details.";
            let adaptive_note = adaptive_quality_note(metrics_ref);

            // Build a compact regeneration prompt that does not reuse the original
            // `prompt` variable (which may have been moved). This focuses the
            // model on topics + strict diversity instructions to avoid priming.
            let regen_intro = format!(
                "Regenerate {count} written-response questions. Topics: {topics}. Difficulty: {difficulty}.",
                count = request.question_count,
                topics = sanitize_for_api(&request.topics.join(", ")),
                difficulty = adjusted_difficulty
            );
            let new_user_content = if include_exam_context {
                let mut parts =
                    vec![serde_json::json!({ "type": "text", "text": regen_intro.clone() })];
                let exam_parts = build_exam_file_parts(&app, &request.topics);
                parts.extend(exam_parts);
                let report_parts = build_report_file_parts(&app, &request.topics);
                parts.extend(report_parts);
                let reanchor = sanitize_for_api(&pdf_reanchor_note(
                    selected_subs,
                    request.custom_focus_area.as_deref(),
                ));
                parts.push(serde_json::json!({ "type": "text", "text": reanchor }));
                let synth = sanitize_for_api(&subtopic_synthesis_note(
                    selected_subs,
                    request.question_count,
                ));
                if !synth.is_empty() {
                    parts.push(serde_json::json!({ "type": "text", "text": synth }));
                }
                if !methods_exam1_note.is_empty() {
                    parts.push(serde_json::json!({ "type": "text", "text": methods_exam1_note }));
                }
                parts.push(serde_json::json!({ "type": "text", "text": diversity_note }));
                if !adaptive_note.is_empty() {
                    parts.push(serde_json::json!({ "type": "text", "text": adaptive_note }));
                }
                serde_json::Value::Array(parts)
            } else {
                let synth = sanitize_for_api(&subtopic_synthesis_note(
                    selected_subs,
                    request.question_count,
                ));
                let mut prompt = format!(
                    "{}\n\n{}\n\n{}\n\n{}",
                    regen_intro,
                    sanitize_for_api(&subtopics_note(selected_subs)),
                    synth,
                    diversity_note
                );
                if !adaptive_note.is_empty() {
                    prompt.push_str(&adaptive_note);
                }
                if !methods_exam1_note.is_empty() {
                    prompt.push_str("\n\n");
                    prompt.push_str(methods_exam1_note);
                }
                serde_json::Value::String(prompt)
            };

            let retry_temp = (temperature + 0.2 * attempts as f32).min(1.0);

            let retry_result =
                call_openrouter_streaming_with_plugins(OpenRouterRequestConfig::with_app(
                    app.clone(),
                    &request.api_key,
                    &request.model,
                    &written_sys,
                    new_user_content,
                    &written_fmt,
                    max_tokens,
                    retry_temp,
                    top_p,
                    None,
                    plugins.clone(),
                ))
                .await;

            if let Ok(r) = retry_result {
                if let Ok(mut new_payload) =
                    parse_questions_payload::<WrittenQuestionsPayload>(&r.content)
                {
                    normalise_written(&mut new_payload.questions, &request.topics, selected_subs);
                    if validate_written(&new_payload.questions, request.question_count).is_ok() {
                        let new_texts: Vec<String> = new_payload
                            .questions
                            .iter()
                            .map(|q| q.prompt_markdown.clone())
                            .collect();
                        let (new_metrics, new_summary) = score_batch(&new_texts);
                        // Accept retry if distinctness improved.
                        if new_summary.distinctness_avg.unwrap_or(0.0)
                            > summary.distinctness_avg.unwrap_or(0.0)
                        {
                            payload = new_payload;
                            metrics = new_metrics;
                            summary = new_summary;
                            for (q, metric) in payload.questions.iter_mut().zip(metrics.iter()) {
                                q.distinctness_score = Some(metric.distinctness);
                                q.multi_step_depth = Some(metric.depth);
                                q.verb_diversity_count = Some(metric.verb_diversity);
                                q.scaffold_pattern = Some(metric.scaffold_pattern.clone());
                            }
                            break;
                        }
                    }
                }
            }

            need_retry = attempts < 2
                && (summary
                    .distinctness_avg
                    .is_some_and(|v| v < distinctness_threshold)
                    || metrics_ref
                        .iter()
                        .any(|m| m.distinctness < per_question_distinctness_threshold));
        }
    }

    // Recompute diagnostics from the final payload after any retry pass.
    let mut final_latex_issue_examples = Vec::<String>::new();
    for q in &payload.questions {
        for issue in latex_issues_for_text(&q.prompt_markdown)
            .into_iter()
            .take(2)
        {
            final_latex_issue_examples.push(format!("{}: {}", q.id, issue));
            if final_latex_issue_examples.len() >= 6 {
                break;
            }
        }
        if final_latex_issue_examples.len() >= 6 {
            break;
        }
    }
    quality_diagnostics = build_subtopic_coverage_diagnostics(
        selected_subs,
        payload
            .questions
            .iter()
            .map(|q| q.subtopic.clone())
            .collect(),
        strict_subtopic_coverage,
        request.min_subtopic_coverage_ratio,
        request.question_count,
    );
    if let Some(diag) = quality_diagnostics.as_mut() {
        diag.latex_issue_count = final_latex_issue_examples.len();
        diag.latex_issue_examples = final_latex_issue_examples;
    }

    let estimated_cost_usd = stats_result.ok().and_then(|stats| {
        compute_generation_cost(
            Some(result.prompt_tokens as u64),
            Some(result.completion_tokens as u64),
            stats.prompt_price_per_token,
            stats.completion_price_per_token,
        )
    });

    let duration_ms = started.elapsed().as_millis() as u64;

    emit_generation_status(
        &app,
        serde_json::json!({
            "mode": "written", "stage": "completed",
            "message": format!("Done — {} questions in {:.1}s.", payload.questions.len(), duration_ms as f64 / 1000.0),
            "attempt": 1,
            "totalTokens": result.total_tokens,
            "promptTokens": result.prompt_tokens,
            "completionTokens": result.completion_tokens,
            "estimatedCostUsd": estimated_cost_usd,
            "durationMs": duration_ms,
        }),
    );

    Ok(GenerateQuestionsResponse {
        questions: payload.questions,
        duration_ms,
        prompt_tokens: result.prompt_tokens,
        completion_tokens: result.completion_tokens,
        total_tokens: result.total_tokens,
        estimated_cost_usd,
        distinctness_avg: summary.distinctness_avg,
        multi_step_depth_avg: summary.multi_step_depth_avg,
        command_verb_diversity: summary.command_verb_diversity,
        mark_allocation_variance: summary.mark_allocation_variance,
        quality_diagnostics,
    })
}

// ─── Tauri command: generate MC questions ─────────────────────────────────────

#[tauri::command]
async fn generate_mc_questions(
    app: tauri::AppHandle,
    request: GenerateMcQuestionsRequest,
) -> CommandResult<GenerateMcQuestionsResponse> {
    if request.topics.is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Select at least one topic.",
        ));
    }
    if request.question_count == 0 || request.question_count > constants::MAX_QUESTION_COUNT {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            format!(
                "Question count must be 1–{}.",
                constants::MAX_QUESTION_COUNT
            ),
        ));
    }
    validate_generation_params(&request.api_key, &request.model)?;

    let started = Instant::now();
    let selected_subs = request.subtopics.as_ref().filter(|s| !s.is_empty());
    let tech_mode = request.tech_mode.as_deref().unwrap_or("mix");
    let include_exam_context = request.include_exam_context.unwrap_or(false);
    let strict_latex_validation = request.strict_latex_validation.unwrap_or(false);
    let strict_subtopic_coverage = request.strict_subtopic_coverage.unwrap_or(false);
    let (distinctness_threshold, per_question_distinctness_threshold) =
        diversity_thresholds(request.diversity_strictness.as_deref());

    // Adjust difficulty based on AI scaling
    let adjusted_difficulty = adjust_difficulty(
        &request.difficulty,
        request.ai_difficulty_scaling_enabled.unwrap_or(false),
        request.recent_average_score,
        request.recent_difficulty.as_deref(),
    );

    let custom_note = request
        .custom_focus_area
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map_or(String::new(), |v| {
            format!(" Custom focus: \"{v}\". Align all questions to this where syllabus-valid.")
        });
    let prob_table_note = probability_distribution_table_note(&request.topics);

    emit_generation_status(
        &app,
        serde_json::json!({
            "mode": "multiple-choice", "stage": "preparing",
            "message": "Building prompt.", "attempt": 1
        }),
    );

    let exam_context_preamble = if include_exam_context {
        "\n\nEXAM PDF CONTEXT:\n\
         - Use attached PDFs for wording/layout style only.\n\
         - Do not source topics, facts, numbers, or scenarios from PDFs.\n\
         - Apply focus constraints and Study Design limits before final output."
    } else {
        ""
    };

    let prompt = format!(
        "Generate {count} VCE multiple-choice questions (1 mark each). Topics: {topics}. Difficulty: {difficulty}, {diff_rules}. \
         {subs_note}{synth_note}{custom_note}{tech}{topic_notes}{math_diff}{prob_table_note}{sim_note}{focus_lock}{exam_context_preamble} \
         Output exactly {count} questions.",
        count                 = request.question_count,
        topics                = sanitize_for_api(&request.topics.join(", ")),
        difficulty            = adjusted_difficulty,
        diff_rules            = difficulty_guidance(&adjusted_difficulty),
        subs_note             = sanitize_for_api(&subtopics_note(selected_subs)),
        synth_note            = sanitize_for_api(&subtopic_synthesis_note(selected_subs, request.question_count)),
        custom_note           = sanitize_for_api(&custom_note),
        tech                  = tech_note(tech_mode, &request.topics),
        topic_notes           = topic_notes(&request.topics, selected_subs),
        math_diff             = math_difficulty_note(&adjusted_difficulty, &request.topics),
        prob_table_note       = prob_table_note,
        focus_lock            = sanitize_for_api(&focus_lock_note(selected_subs, request.custom_focus_area.as_deref())),
        exam_context_preamble = exam_context_preamble,
        sim_note              = sanitize_for_api(&similarity_note(
            request.avoid_similar_questions.unwrap_or(false),
            request.prior_question_prompts.as_deref(),
        )),
    );

    emit_generation_status(
        &app,
        serde_json::json!({
            "mode": "multiple-choice", "stage": "generating",
            "message": format!("Generating {} questions…", request.question_count),
            "attempt": 1
        }),
    );

    let mc_sys = mc_system();
    let mc_fmt = mc_format(&request.model);
    // MC questions need less tokens per question (single answer + brief explanation)
    // but still benefit from the complexity-aware calculation
    let base_mc_tokens = calculate_optimal_max_tokens(
        request.question_count,
        3, // MC is typically 1-3 marks
        &adjusted_difficulty,
        include_exam_context,
    )
    .saturating_mul(3)
        / 4; // MC uses ~75% of written token budget

    // Determine model capabilities and plugins before building the request.
    let stats_result = get_model_stats(request.api_key.clone(), request.model.clone()).await;
    let supports_files = stats_result.as_ref().ok().is_some_and(|s| s.supports_files);
    let plugins = plugins_for_model(supports_files);

    let user_content = if include_exam_context {
        let mut parts = vec![serde_json::json!({ "type": "text", "text": prompt })];
        let exam_parts = build_exam_file_parts(&app, &request.topics);
        parts.extend(exam_parts);
        let report_parts = build_report_file_parts(&app, &request.topics);
        parts.extend(report_parts);
        let reanchor = sanitize_for_api(&pdf_reanchor_note(
            selected_subs,
            request.custom_focus_area.as_deref(),
        ));
        parts.push(serde_json::json!({ "type": "text", "text": reanchor }));
        serde_json::Value::Array(parts)
    } else {
        serde_json::Value::String(prompt)
    };

    // MC: τ = 0.6, top-p = 0.9 by default, difficulty-aware tuning
    let (base_temp, base_top_p) = difficulty_to_temperature(&adjusted_difficulty);
    let temperature = request.temperature.unwrap_or(base_temp);
    let top_p = request.top_p.unwrap_or(base_top_p);
    let seed = request.seed;

    let result = call_openrouter_streaming_with_plugins(OpenRouterRequestConfig::with_app(
        app.clone(),
        &request.api_key,
        &request.model,
        &mc_sys,
        user_content,
        &mc_fmt,
        base_mc_tokens,
        temperature,
        top_p,
        seed,
        plugins.clone(),
    ))
    .await?;

    emit_generation_status(
        &app,
        serde_json::json!({
            "mode": "multiple-choice", "stage": "parsing",
            "message": "Parsing and validating questions.",
            "attempt": 1
        }),
    );

    let mut payload: McQuestionsPayload = parse_questions_payload(&result.content)?;
    normalise_mc(&mut payload.questions, &request.topics, selected_subs);
    validate_mc(&payload.questions, request.question_count)?;
    apply_tech_override(&mut payload.questions, tech_mode);

    let mut latex_issue_examples = Vec::<String>::new();
    for q in &payload.questions {
        for issue in latex_issues_for_text(&q.prompt_markdown)
            .into_iter()
            .take(2)
        {
            latex_issue_examples.push(format!("{} prompt: {}", q.id, issue));
            if latex_issue_examples.len() >= 6 {
                break;
            }
        }
        for issue in latex_issues_for_text(&q.explanation_markdown)
            .into_iter()
            .take(1)
        {
            latex_issue_examples.push(format!("{} explanation: {}", q.id, issue));
            if latex_issue_examples.len() >= 6 {
                break;
            }
        }
        if latex_issue_examples.len() >= 6 {
            break;
        }
    }

    let mut quality_diagnostics = build_subtopic_coverage_diagnostics(
        selected_subs,
        payload
            .questions
            .iter()
            .map(|q| q.subtopic.clone())
            .collect(),
        strict_subtopic_coverage,
        request.min_subtopic_coverage_ratio,
        request.question_count,
    );
    if let Some(diag) = quality_diagnostics.as_mut() {
        diag.latex_issue_count = latex_issue_examples.len();
        diag.latex_issue_examples = latex_issue_examples.clone();
    }

    if strict_latex_validation && !latex_issue_examples.is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            format!(
                "Generated output failed strict LaTeX validation ({} issue(s)); first issue: {}",
                latex_issue_examples.len(),
                latex_issue_examples[0]
            ),
        ));
    }

    if strict_subtopic_coverage {
        if let Some(diag) = &quality_diagnostics {
            if diag.subtopic_coverage_ratio + 0.0001 < diag.min_subtopic_coverage_ratio {
                return Err(AppError::new(
                    "VALIDATION_ERROR",
                    format!(
                        "Generated output did not meet subtopic coverage target ({:.0}% < {:.0}%). Missing: {}",
                        diag.subtopic_coverage_ratio * 100.0,
                        diag.min_subtopic_coverage_ratio * 100.0,
                        diag.uncovered_subtopics.join(", ")
                    ),
                ));
            }
            if !diag.out_of_scope_subtopics.is_empty() {
                return Err(AppError::new(
                    "VALIDATION_ERROR",
                    format!(
                        "Generated output used out-of-scope subtopics: {}",
                        diag.out_of_scope_subtopics.join(", ")
                    ),
                ));
            }
        }
    }

    let texts: Vec<String> = payload
        .questions
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
        .collect();
    let (metrics, mut summary) = score_batch(&texts);

    // MC questions are all 1 mark each, so mark variance is always 0.0 (no distribution)
    summary.mark_allocation_variance = Some(0.0);

    for (q, metric) in payload.questions.iter_mut().zip(metrics.iter()) {
        q.distinctness_score = Some(metric.distinctness);
        q.multi_step_depth = Some(metric.depth);
        q.verb_diversity_count = Some(metric.verb_diversity);
        q.scaffold_pattern = Some(metric.scaffold_pattern.clone());
    }

    let mut metrics = metrics;
    let metrics_ref = &metrics;
    if request.avoid_similar_questions.unwrap_or(false) {
        let mut need_retry = summary
            .distinctness_avg
            .is_some_and(|v| v < distinctness_threshold)
            || metrics_ref
                .iter()
                .any(|m| m.distinctness < per_question_distinctness_threshold);

        let mut attempts = 0;
        while need_retry && attempts < 2 {
            attempts += 1;
            emit_generation_status(
                &app,
                serde_json::json!({
                    "mode": "multiple-choice",
                    "stage": "regenerating-duplicates",
                    "message": format!("Regenerating to improve diversity (attempt {})...", attempts),
                    "attempt": attempts + 1
                }),
            );

            let diversity_note = "\nDIVERSITY REGENERATION: The previous output contained similar questions. Now generate a new set of questions, replacing any that are similar with entirely different scenarios, contexts, names, numbers, or methods. Do NOT paraphrase previous questions; invent fresh contexts. Increase creativity and change details.";
            let adaptive_note = adaptive_quality_note(metrics_ref);

            let regen_intro = format!(
                "Regenerate {count} multiple-choice questions. Topics: {topics}. Difficulty: {difficulty}.",
                count = request.question_count,
                topics = sanitize_for_api(&request.topics.join(", ")),
                difficulty = adjusted_difficulty
            );
            let new_user_content = if include_exam_context {
                let mut parts =
                    vec![serde_json::json!({ "type": "text", "text": regen_intro.clone() })];
                let exam_parts = build_exam_file_parts(&app, &request.topics);
                parts.extend(exam_parts);
                let report_parts = build_report_file_parts(&app, &request.topics);
                parts.extend(report_parts);
                let reanchor = sanitize_for_api(&pdf_reanchor_note(
                    selected_subs,
                    request.custom_focus_area.as_deref(),
                ));
                parts.push(serde_json::json!({ "type": "text", "text": reanchor }));
                let synth = sanitize_for_api(&subtopic_synthesis_note(
                    selected_subs,
                    request.question_count,
                ));
                if !synth.is_empty() {
                    parts.push(serde_json::json!({ "type": "text", "text": synth }));
                }
                parts.push(serde_json::json!({ "type": "text", "text": diversity_note }));
                if !adaptive_note.is_empty() {
                    parts.push(serde_json::json!({ "type": "text", "text": adaptive_note }));
                }
                serde_json::Value::Array(parts)
            } else {
                let synth = sanitize_for_api(&subtopic_synthesis_note(
                    selected_subs,
                    request.question_count,
                ));
                let mut prompt = format!(
                    "{}\n\n{}\n\n{}\n\n{}",
                    regen_intro,
                    sanitize_for_api(&subtopics_note(selected_subs)),
                    synth,
                    diversity_note
                );
                if !adaptive_note.is_empty() {
                    prompt.push_str(&adaptive_note);
                }
                serde_json::Value::String(prompt)
            };

            let retry_temp = (temperature + 0.2 * attempts as f32).min(1.0);

            let retry_result =
                call_openrouter_streaming_with_plugins(OpenRouterRequestConfig::with_app(
                    app.clone(),
                    &request.api_key,
                    &request.model,
                    &mc_sys,
                    new_user_content,
                    &mc_fmt,
                    base_mc_tokens,
                    retry_temp,
                    top_p,
                    None,
                    plugins.clone(),
                ))
                .await;

            if let Ok(r) = retry_result {
                if let Ok(mut new_payload) =
                    parse_questions_payload::<McQuestionsPayload>(&r.content)
                {
                    normalise_mc(&mut new_payload.questions, &request.topics, selected_subs);
                    if validate_mc(&new_payload.questions, request.question_count).is_ok() {
                        let new_texts: Vec<String> = new_payload
                            .questions
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
                            .collect();
                        let (new_metrics, new_summary) = score_batch(&new_texts);
                        if new_summary.distinctness_avg.unwrap_or(0.0)
                            > summary.distinctness_avg.unwrap_or(0.0)
                        {
                            payload = new_payload;
                            metrics = new_metrics;
                            summary = new_summary;
                            for (q, metric) in payload.questions.iter_mut().zip(metrics.clone()) {
                                q.distinctness_score = Some(metric.distinctness);
                                q.multi_step_depth = Some(metric.depth);
                            }
                            break;
                        }
                    }
                }
            }

            need_retry = attempts < 2
                && (summary
                    .distinctness_avg
                    .is_some_and(|v| v < distinctness_threshold)
                    || metrics_ref
                        .iter()
                        .any(|m| m.distinctness < per_question_distinctness_threshold));
        }
    }

    // Recompute diagnostics from the final payload after any retry pass.
    let mut final_latex_issue_examples = Vec::<String>::new();
    for q in &payload.questions {
        for issue in latex_issues_for_text(&q.prompt_markdown)
            .into_iter()
            .take(2)
        {
            final_latex_issue_examples.push(format!("{} prompt: {}", q.id, issue));
            if final_latex_issue_examples.len() >= 6 {
                break;
            }
        }
        for issue in latex_issues_for_text(&q.explanation_markdown)
            .into_iter()
            .take(1)
        {
            final_latex_issue_examples.push(format!("{} explanation: {}", q.id, issue));
            if final_latex_issue_examples.len() >= 6 {
                break;
            }
        }
        if final_latex_issue_examples.len() >= 6 {
            break;
        }
    }
    quality_diagnostics = build_subtopic_coverage_diagnostics(
        selected_subs,
        payload
            .questions
            .iter()
            .map(|q| q.subtopic.clone())
            .collect(),
        strict_subtopic_coverage,
        request.min_subtopic_coverage_ratio,
        request.question_count,
    );
    if let Some(diag) = quality_diagnostics.as_mut() {
        diag.latex_issue_count = final_latex_issue_examples.len();
        diag.latex_issue_examples = final_latex_issue_examples;
    }

    let estimated_cost_usd = stats_result.ok().and_then(|stats| {
        compute_generation_cost(
            Some(result.prompt_tokens as u64),
            Some(result.completion_tokens as u64),
            stats.prompt_price_per_token,
            stats.completion_price_per_token,
        )
    });

    let duration_ms = started.elapsed().as_millis() as u64;

    emit_generation_status(
        &app,
        serde_json::json!({
            "mode": "multiple-choice", "stage": "completed",
            "message": format!("Done — {} questions in {:.1}s.", payload.questions.len(), duration_ms as f64 / 1000.0),
            "attempt": 1,
            "totalTokens": result.total_tokens,
            "promptTokens": result.prompt_tokens,
            "completionTokens": result.completion_tokens,
            "estimatedCostUsd": estimated_cost_usd,
            "durationMs": duration_ms,
        }),
    );

    Ok(GenerateMcQuestionsResponse {
        questions: payload.questions,
        duration_ms,
        prompt_tokens: result.prompt_tokens,
        completion_tokens: result.completion_tokens,
        total_tokens: result.total_tokens,
        estimated_cost_usd,
        distinctness_avg: summary.distinctness_avg,
        multi_step_depth_avg: summary.multi_step_depth_avg,
        command_verb_diversity: summary.command_verb_diversity,
        mark_allocation_variance: summary.mark_allocation_variance,
        quality_diagnostics,
    })
}
// ─── Tauri command: mark answer ───────────────────────────────────────────────

#[tauri::command]
async fn mark_answer(
    app: tauri::AppHandle,
    request: MarkAnswerRequest,
) -> CommandResult<MarkAnswerResponse> {
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
    validate_generation_params(&request.api_key, &request.model)?;
    if request.question.max_marks == 0 {
        return Err(AppError::new("VALIDATION_ERROR", "maxMarks must be > 0."));
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

    // Sanitize question fields that go into the API prompt.
    let question_topic = sanitize_for_api(request.question.topic.trim());
    let question_subtopic =
        sanitize_for_api(request.question.subtopic.as_deref().unwrap_or("—").trim());
    let question_prompt = sanitize_for_api(&request.question.prompt_markdown);

    let is_chem = question_topic.eq_ignore_ascii_case(constants::CHEMISTRY_TOPIC);
    let chem_note = if is_chem {
        constants::CHEMISTRY_LATEX_GUIDANCE
    } else {
        ""
    };

    let is_pe = question_topic.eq_ignore_ascii_case(constants::PHYSICAL_EDUCATION_TOPIC);
    let pe_note = if is_pe {
        "\nPHYSICAL EDUCATION MARKING STYLE:\n\
         - DO NOT use mathematical equations, derivations, or formula-based solutions in your \
exemplarResponseMarkdown, feedbackMarkdown, comparisonToSolutionMarkdown, or workedSolutionMarkdown.\n\
         - VCE PE does not require formal mathematical working. Write all responses in clear \
prose — paragraphs, bullet points, and short explanations.\n\
         - Simple named formulas are acceptable where the Study Design requires them \
(e.g. 'Fitt's principle', 'F = ma', 'VO₂max', '1RM') — but do NOT derive, rearrange, \
or chain equations. Mention the formula by name, then explain its application in words.\n\
         - Award marks for quality of analysis, evaluation, and justification — not for \
mathematical rigour.\n"
    } else {
        ""
    };

    let max_marks = request.question.max_marks;

    // Load VCAA examiners' report PDFs for the question's topic to guide marking.
    let report_parts = build_report_file_parts(&app, std::slice::from_ref(&question_topic));
    let has_reports = !report_parts.is_empty();

    let report_preamble = if has_reports {
        "\n\nVCAA EXAMINERS' REPORT ATTACHED — USE AS MARKING AUTHORITY:\n\
         The attached PDF(s) are official VCAA examiners' reports containing marking schemes, \
         common student errors, and expected solutions. Use them as the PRIMARY authority for \
         criterion-based marking. Align your marking criteria, expected working, and common \
         error feedback with the patterns described in these reports."
    } else {
        ""
    };

    let prompt = format!(
        "Topic: {topic}\n\
         Subtopic: {subtopic}\n\
         Question ({max} marks):\n{question}\n\n\
         Student answer:\n{answer}\n\n\
         MARKING INSTRUCTIONS:\n\
         - Apply VCAA criterion-based marking strictly.\n\
         - Do not award marks for correct answers without correct supporting working or reasoning \
(except for questions that are purely answer-only).\n\
         - Do not credit vague restatements of the question as explanation.\n\
         - For 'hence' sub-parts: the student must use the result from the immediately preceding part.\n\
         - For 'show that' sub-parts: every algebraic step must be shown; a bare final result is zero.\n\
         - For 'explain/justify': a numerical answer alone is insufficient — reasoning must be stated.\n\
         - Produce one criterion per mark (or group closely related marks where natural).\n\
         - The workedSolution must show every step a student would need to write to receive full marks.\
         {report_preamble}",
        topic    = question_topic,
        subtopic = question_subtopic,
        question = question_prompt,
        max      = max_marks,
        answer   = answer,
        report_preamble = report_preamble,
    );

    // Build user content: text prompt + optional image + optional report PDFs.
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
        // Reject impossibly large image payloads (>20 MB base64 ≈ 15 MB raw)
        // that would exceed OpenRouter's request size limits.
        const MAX_IMAGE_DATA_URL_LEN: usize = 20 * 1024 * 1024;
        if url.len() > MAX_IMAGE_DATA_URL_LEN {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                "Image is too large. Please use a smaller image.",
            ));
        }
        content_parts.push(serde_json::json!({ "type": "image_url", "image_url": { "url": url } }));
    }

    content_parts.extend(report_parts);

    let user_content = serde_json::Value::Array(content_parts);

    // Scale token budget with mark count. MC option explanations (4 options × ~60 words each)
    // add ~400 tokens on top of the written-question budget.
    let max_tokens = (max_marks as u32) * 2000 + 4000;

    // Marking: τ = 0.2, top-p = 0.8, seed = fixed (unless overridden)
    let temperature = request.temperature.unwrap_or(0.2);
    let top_p = request.top_p.unwrap_or(0.8);
    let seed = request.seed;

    // Use plugins with file-parser when report PDFs are attached.
    let plugins = if has_reports {
        // Determine model file support for plugin configuration.
        let stats_result = get_model_stats(request.api_key.clone(), request.model.clone()).await;
        let supports_files = stats_result.as_ref().ok().is_some_and(|s| s.supports_files);
        plugins_for_model(supports_files)
    } else {
        serde_json::json!([{ "id": "response-healing" }])
    };

    let result = call_openrouter_with_plugins(OpenRouterRequestConfig::with_plugins(
        &request.api_key,
        &request.model,
        &marking_system(max_marks, chem_note, pe_note),
        user_content,
        &marking_format(&request.model),
        max_tokens,
        temperature,
        top_p,
        seed,
        plugins,
    ))
    .await?;

    // Protect LaTeX commands before JSON parsing — same pipeline as question generation.
    let protected_marking = protect_latex_in_raw_json(&result.content);
    let json_str = extract_json_object(&protected_marking).ok_or_else(|| {
        AppError::new(
            "MODEL_PARSE_ERROR",
            format!(
                "No JSON in marking response. Raw:\n{}",
                &result.content.chars().take(800).collect::<String>()
            ),
        )
    })?;

    let mut parsed: MarkAnswerResponse = serde_json::from_str(&json_str)
        .map_err(|e| AppError::new("MODEL_PARSE_ERROR", format!("Marking schema mismatch: {e}")))?;

    // Clamp / fix marks
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

    // Always compute score_out_of_10 from achieved_marks and max_marks, do not use LLM value
    if parsed.max_marks > 0 {
        parsed.score_out_of_10 =
            ((parsed.achieved_marks as f32 / parsed.max_marks as f32) * 10.0).round() as u8;
        parsed.score_out_of_10 = parsed.score_out_of_10.min(10);
    } else {
        parsed.score_out_of_10 = 0;
    }

    parsed.feedback_markdown = clean_field(&parsed.feedback_markdown);
    parsed.worked_solution_markdown = clean_field(&parsed.worked_solution_markdown);
    parsed.comparison_to_solution_markdown = clean_field(&parsed.comparison_to_solution_markdown);
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

// ─── Tauri command: batch mark answers ──────────────────────────────────────

#[tauri::command]
async fn batch_mark_answers(
    app: tauri::AppHandle,
    request: BatchMarkRequest,
) -> CommandResult<BatchMarkResponse> {
    use futures_util::stream::{self, StreamExt};

    let results: Vec<BatchMarkItem> = stream::iter(request.items)
        .map(|item| {
            let app = app.clone();
            async move {
                let question_id = item.question.id.clone();
                match mark_answer(app, item).await {
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

// ─── Tauri command: analyze image ────────────────────────────────────────────

#[tauri::command]
async fn analyze_image(request: AnalyzeImageRequest) -> CommandResult<AnalyzeImageResponse> {
    if request.api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "API key required."));
    }
    if request.model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model required."));
    }
    if request.image_path.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Image path required."));
    }

    let path = Path::new(&request.image_path);
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
                format!("Failed to read image: {e}").to_string()
            },
        )
    })?;
    let data_url = format!(
        "data:{mime};base64,{}",
        general_purpose::STANDARD.encode(bytes)
    );
    let prompt = request
        .prompt
        .as_deref()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or("What's in this image?");

    let free_text_format = if is_anthropic_model(&request.model) {
        json_schema_format_anthropic(
            "text_response",
            serde_json::json!({
                "type": "object",
                "additionalProperties": false,
                "required": ["text"],
                "properties": { "text": { "type": "string" } }
            }),
        )
    } else {
        json_schema_format(
            "text_response",
            serde_json::json!({
                "type": "object",
                "additionalProperties": false,
                "required": ["text"],
                "properties": { "text": { "type": "string" } }
            }),
        )
    };

    let temperature = request.temperature.unwrap_or(0.2);
    let top_p = request.top_p.unwrap_or(0.8);
    let seed = request.seed;
    let result = call_openrouter(
        &request.api_key,
        &request.model,
        "You are a helpful visual reasoning assistant.",
        serde_json::json!([
            { "type": "text",      "text": prompt },
            { "type": "image_url", "image_url": { "url": data_url } }
        ]),
        &free_text_format,
        4_500,
        temperature,
        top_p,
        seed,
    )
    .await?;

    let output_text = serde_json::from_str::<serde_json::Value>(&result.content)
        .ok()
        .and_then(|v| v.get("text").and_then(|t| t.as_str()).map(str::to_string))
        .unwrap_or(result.content);

    Ok(AnalyzeImageResponse { output_text })
}

/// Parse a `{"mappings":[{"unknown":"…","canonical":"…"},…]}` payload from raw
/// LLM output.  Uses the same JSON extraction / LaTeX-protection pipeline that
/// question generation relies on so fenced code blocks, preamble text, and
/// LaTeX in values are all handled gracefully.
fn parse_cleanup_mappings(raw: &str) -> CommandResult<Vec<(String, String)>> {
    let protected = protect_latex_in_raw_json(raw);

    // Try to parse as a complete JSON value first (handles both objects and arrays).
    let value: Option<serde_json::Value> = serde_json::from_str(&protected)
        .ok()
        .or_else(|| serde_json::from_str(&repair_llm_json_trailing_commas(&protected)).ok());

    // If direct parse fails, try extracting a JSON object (for wrapped/text responses).
    let value = match value {
        Some(v) => v,
        None => {
            // Try extracting a JSON array first (bare array case)
            if let Some(arr_str) = extract_json_array(&protected) {
                serde_json::from_str(&arr_str).map_err(|e| {
                    AppError::new(
                        "MODEL_PARSE_ERROR",
                        format!(
                            "Invalid JSON array in cleanup response: {e}. Raw:\n{}",
                            raw.chars().take(500).collect::<String>()
                        ),
                    )
                })?
            } else if let Some(obj_str) = extract_json_object(&protected) {
                serde_json::from_str(&obj_str).map_err(|e| {
                    AppError::new(
                        "MODEL_PARSE_ERROR",
                        format!(
                            "Invalid JSON object in cleanup response: {e}. Raw:\n{}",
                            raw.chars().take(500).collect::<String>()
                        ),
                    )
                })?
            } else {
                return Err(AppError::new(
                    "MODEL_PARSE_ERROR",
                    format!(
                        "No JSON in cleanup response. Raw:\n{}",
                        raw.chars().take(500).collect::<String>()
                    ),
                ));
            }
        }
    };

    // Accept: {"mappings":[…]}, bare array […], or a single mapping object {"unknown":"…","canonical":"…"}.
    let arr_opt = value
        .get("mappings")
        .and_then(|v| v.as_array())
        .or_else(|| value.as_array());

    // If we got a single mapping object (not wrapped in mappings), arr_opt will be
    // None but value will be
    // an object with "unknown"/"canonical" keys. Treat it as a single-element list.
    let items: Vec<&serde_json::Value> = match arr_opt {
        Some(arr) => arr.iter().collect(),
        None => {
            // Single object case: treat as one mapping
            vec![&value]
        }
    };

    let mut out = Vec::new();
    for item in items {
        let unknown = item
            .get("unknown")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let canonical = item
            .get("canonical")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        if let (Some(u), Some(c)) = (unknown, canonical) {
            out.push((u, c));
        }
    }
    Ok(out)
}

/// Build the cleanup system prompt.  Kept as a helper so both topic and
/// subtopic commands share identical instructions.
fn cleanup_system_prompt() -> &'static str {
    "You are a strict data-cleaning assistant. You MUST output ONLY valid JSON.\n\
     Respond with an object containing a \"mappings\" array. Each item must have\n\
     an \"unknown\" string and a \"canonical\" string.\n\
     Example response:\n\
     {\"mappings\":[{\"unknown\":\"Some Name\",\"canonical\":\"Exact Name\"}]}\n\
     Rules:\n\
     - The \"canonical\" value MUST be copied exactly from the canonical list provided.\n\
     - Only include mappings where you are confident.\n\
     - If an input does not match any canonical value, omit it from the array.\n\
     - Do NOT include markdown fences, explanations, or any text outside the JSON."
}

/// Auto-map items that already exactly match a canonical value (case-insensitive).
/// Returns (mapping, remaining_unknowns).
fn auto_map_exact(
    unknowns: &[String],
    canonical: &[String],
) -> (HashMap<String, String>, Vec<String>) {
    let canonical_lower: Vec<(String, String)> = canonical
        .iter()
        .map(|c| (c.to_ascii_lowercase(), c.clone()))
        .collect();
    let mut mapping = HashMap::new();
    let mut remaining = Vec::new();
    for u in unknowns {
        let u_trimmed = u.trim();
        if let Some((_, exact)) = canonical_lower
            .iter()
            .find(|(lc, _)| lc == &u_trimmed.to_ascii_lowercase())
        {
            mapping.insert(u_trimmed.to_string(), exact.clone());
        } else {
            remaining.push(u_trimmed.to_string());
        }
    }
    (mapping, remaining)
}

/// Validate and filter LLM-produced mappings: trim, skip blanks, enforce
/// canonical membership, deduplicate.
fn validate_and_filter_mappings(
    raw_mappings: Vec<(String, String)>,
    canonical: &[String],
    existing: &HashMap<String, String>,
) -> HashMap<String, String> {
    let canonical_set: HashSet<&str> = canonical.iter().map(|s| s.as_str()).collect();
    let mut result = existing.clone();
    for (unknown, canonical_val) in raw_mappings {
        let u = unknown.trim();
        let c = canonical_val.trim();
        if u.is_empty() || c.is_empty() {
            continue;
        }
        // Skip self-maps (unknown already equals canonical)
        if u.eq_ignore_ascii_case(c) {
            continue;
        }
        // Only insert if canonical value is in the allowed set
        if !canonical_set.contains(c) {
            continue;
        }
        // Don't overwrite existing mappings
        if !result.contains_key(u) {
            result.insert(u.to_string(), c.to_string());
        }
    }
    result
}

const CLEANUP_BATCH_SIZE: usize = 10;

/// Process unknowns in batches of `CLEANUP_BATCH_SIZE` via LLM calls,
/// merging results into a single mapping. Auto-maps exact matches first,
/// then sends remaining unknowns in chunks to avoid overwhelming the model.
async fn batch_cleanup(
    unknowns: &[String],
    canonical: &[String],
    api_key: &str,
    model: &str,
    temperature: f32,
    top_p: f32,
    seed: Option<u64>,
) -> CommandResult<HashMap<String, String>> {
    // Auto-map exact (case-insensitive) matches first
    let (mut mapping, remaining) = auto_map_exact(unknowns, canonical);
    if remaining.is_empty() {
        return Ok(mapping);
    }

    let schema = if is_anthropic_model(model) {
        json_schema_format_anthropic(
            "cleanup_mappings",
            serde_json::json!({
                "type": "object",
                "additionalProperties": false,
                "required": ["mappings"],
                "properties": {
                    "mappings": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["unknown", "canonical"],
                            "properties": {
                                "unknown": { "type": "string" },
                                "canonical": { "type": "string" }
                            }
                        }
                    }
                }
            }),
        )
    } else {
        json_schema_format(
            "cleanup_mappings",
            serde_json::json!({
                "type": "object",
                "additionalProperties": false,
                "required": ["mappings"],
                "properties": {
                    "mappings": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["unknown", "canonical"],
                            "properties": {
                                "unknown": { "type": "string" },
                                "canonical": { "type": "string" }
                            }
                        }
                    }
                }
            }),
        )
    };

    let system_prompt = cleanup_system_prompt();

    for chunk in remaining.chunks(CLEANUP_BATCH_SIZE) {
        let user_prompt = format!(
            "Map each 'Unknown' item to the closest 'Canonical' item.\n\n\
             Canonical items:\n- {}\n\n\
             Unknown items to map:\n- {}\n\n\
             The \"canonical\" value MUST be an exact copy from the list above.",
            canonical.join("\n- "),
            sanitize_for_api(&chunk.join("\n- "))
        );

        let result = call_openrouter(
            api_key,
            model,
            system_prompt,
            serde_json::Value::String(user_prompt),
            &schema,
            2048,
            temperature,
            top_p,
            seed,
        )
        .await?;

        let raw_mappings = parse_cleanup_mappings(&result.content)?;
        mapping = validate_and_filter_mappings(raw_mappings, canonical, &mapping);
    }

    Ok(mapping)
}

// ─── Tauri command: cleanup topics only ───────────────────────────────────────

#[tauri::command]
async fn cleanup_topics(request: CleanupTopicsRequest) -> CommandResult<CleanupTopicsResponse> {
    if request.api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "API key required."));
    }
    if request.model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model required."));
    }
    if request.unknown_topics.is_empty() {
        return Ok(CleanupTopicsResponse {
            topic_mapping: HashMap::new(),
        });
    }

    // Normalise canonical list: trim, drop blanks
    let canonical_topics: Vec<String> = request
        .canonical_topics
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    let topic_mapping = batch_cleanup(
        &request.unknown_topics,
        &canonical_topics,
        &request.api_key,
        &request.model,
        request.temperature.unwrap_or(0.0),
        request.top_p.unwrap_or(0.9),
        request.seed,
    )
    .await?;

    Ok(CleanupTopicsResponse { topic_mapping })
}

// ─── Tauri command: cleanup subtopics only ────────────────────────────────────

#[tauri::command]
async fn cleanup_subtopics(
    request: CleanupSubtopicsRequest,
) -> CommandResult<CleanupSubtopicsResponse> {
    if request.api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "API key required."));
    }
    if request.model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model required."));
    }
    if request.unknown_subtopics.is_empty() {
        return Ok(CleanupSubtopicsResponse {
            subtopic_mapping: HashMap::new(),
        });
    }

    let canonical_subtopics: Vec<String> = request
        .canonical_subtopics
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    let subtopic_mapping = batch_cleanup(
        &request.unknown_subtopics,
        &canonical_subtopics,
        &request.api_key,
        &request.model,
        request.temperature.unwrap_or(0.0),
        request.top_p.unwrap_or(0.9),
        request.seed,
    )
    .await?;

    Ok(CleanupSubtopicsResponse { subtopic_mapping })
}

// ─── App entry-point ──────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Store a global AppHandle so Android native code can emit events
            // into the webview via the Rust side. An external native function
            // will call `stylus_double_tap` which uses this handle.
            let _ = APP_HANDLE.set(app.handle().clone());
            #[cfg(target_os = "android")]
            {
                let ctx = ndk_context::android_context();
                let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }
                    .expect("failed to obtain JavaVM from Android context");
                let mut env = vm
                    .attach_current_thread()
                    .expect("failed to attach current thread to JavaVM");
                let context = unsafe { jni::objects::JObject::from_raw(ctx.context().cast()) };
                rustls_platform_verifier::android::init_with_env(&mut env, context)
                    .expect("failed to initialize rustls-platform-verifier on Android");
            }
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_persisted_state,
            save_persisted_state,
            export_data_file,
            export_data_file_to_directory,
            list_json_files_in_directory,
            read_text_file,
            generate_questions,
            mark_answer,
            batch_mark_answers,
            analyze_image,
            generate_mc_questions,
            get_model_stats,
            get_credits,
            cleanup_topics,
            cleanup_subtopics,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "C" fn stylus_double_tap() {
    if let Some(handle) = APP_HANDLE.get() {
        let _ = handle.emit("stylus-double-tap", ());
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use parsing::{extract_json_object, normalise_envelope, validate_mc, validate_written};

    #[test]
    fn extract_json_strips_fence() {
        let input = "```json\n{\"questions\":[]}\n```";
        let out = extract_json_object(input).unwrap();
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert!(v.get("questions").is_some());
    }

    #[test]
    fn extract_json_returns_none_for_garbage() {
        assert!(extract_json_object("not json {missing: quotes}").is_none());
    }

    #[test]
    fn normalise_envelope_wraps_array() {
        let v = serde_json::json!([{"id":"q1"}]);
        let out = normalise_envelope(v).unwrap();
        assert!(out.get("questions").unwrap().is_array());
    }

    #[test]
    fn normalise_envelope_handles_nested_data() {
        let v = serde_json::json!({"data":{"questions":[{"id":"q1"}]}});
        let out = normalise_envelope(v).unwrap();
        assert_eq!(out["questions"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn validate_written_rejects_wrong_count() {
        let questions = vec![GeneratedQuestion {
            id: "q1".into(),
            topic: "Mathematical Methods".into(),
            subtopic: None,
            prompt_markdown: "Find the derivative.".into(),
            max_marks: 4,
            tech_allowed: false,
            distinctness_score: None,
            multi_step_depth: None,
            verb_diversity_count: None,
            scaffold_pattern: None,
        }];
        assert!(validate_written(&questions, 2).is_err());
    }

    #[test]
    fn validate_mc_rejects_bad_labels() {
        let questions = vec![McQuestion {
            id: "mc1".into(),
            topic: "Chemistry".into(),
            subtopic: None,
            prompt_markdown: "Question?".into(),
            options: vec![
                McOption {
                    label: "A".into(),
                    text: "1".into(),
                },
                McOption {
                    label: "B".into(),
                    text: "2".into(),
                },
                McOption {
                    label: "C".into(),
                    text: "3".into(),
                },
                McOption {
                    label: "E".into(),
                    text: "4".into(),
                }, // invalid
            ],
            correct_answer: "A".into(),
            explanation_markdown: "Because.".into(),
            tech_allowed: false,
            distinctness_score: None,
            multi_step_depth: None,
            verb_diversity_count: None,
            scaffold_pattern: None,
        }];
        assert!(validate_mc(&questions, 1).is_err());
    }

    #[test]
    fn marking_system_scales_word_limits_with_marks() {
        let sys_1 = marking_system(1, "", "");
        assert!(sys_1.contains("≤100 words"));

        let sys_10 = marking_system(10, "", "");
        assert!(sys_10.contains("≤2000 words"));
    }

    #[test]
    fn latex_issue_detector_flags_unclosed_inline_math() {
        let issues = latex_issues_for_text("Solve $\\frac{x+1}{2 for x.");
        assert!(!issues.is_empty());
        assert!(issues.iter().any(|i| i.contains("unclosed inline math")));
    }

    #[test]
    fn latex_issue_detector_flags_empty_fraction_parts() {
        let issues = latex_issues_for_text("Compute $\\frac{}{x}$ and $\\frac{y}{}$.");
        assert!(issues.iter().any(|i| i.contains("empty numerator")));
        assert!(issues.iter().any(|i| i.contains("empty denominator")));
    }

    #[test]
    fn latex_issue_detector_flags_frac_outside_math_delimiters() {
        let issues = latex_issues_for_text("Compute \\frac{1}{2} as a decimal.");
        assert!(issues.iter().any(|i| i.contains("outside math delimiters")));
    }

    #[test]
    fn subtopic_coverage_diagnostics_marks_missing_items() {
        let selected = vec!["Functions and graphs".to_string(), "Calculus".to_string()];
        let produced = vec![Some("Functions and graphs".to_string())];
        let diag = build_subtopic_coverage_diagnostics(Some(&selected), produced, true, None, 1)
            .expect("expected diagnostics");

        assert_eq!(diag.covered_subtopics.len(), 1);
        assert_eq!(diag.uncovered_subtopics.len(), 1);
        assert!(diag.subtopic_coverage_ratio < 1.0);
    }

    #[test]
    fn methods_exam1_note_applies_only_for_tech_free_methods() {
        let topics = vec!["Mathematical Methods".to_string()];
        let note = math_methods_exam1_tech_free_note(&topics, "tech-free");
        assert!(note.contains("EXAM 1 STYLE"));

        let mix_note = math_methods_exam1_tech_free_note(&topics, "mix");
        assert!(mix_note.is_empty());

        let other_topics = vec!["Chemistry".to_string()];
        let other_note = math_methods_exam1_tech_free_note(&other_topics, "tech-free");
        assert!(other_note.is_empty());
    }
}
