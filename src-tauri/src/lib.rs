mod catalog;
mod constants;
mod difficulty;
mod models;
mod openrouter;
mod openrouter_info;
mod parsing;
mod persistence;
mod quality;

use base64::{engine::general_purpose, Engine as _};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::Instant;
use tauri::{Emitter, Manager};

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
    json_schema_format,
};
use openrouter_info::{compute_generation_cost, get_credits, get_model_stats};
use parsing::{
    clean_field, extract_json_object, normalise_envelope, normalise_mc, normalise_written,
    protect_latex_in_raw_json, sanitize_for_api, validate_mc, validate_written,
};
use persistence::{export_data_file, load_persisted_state, save_persisted_state};
use quality::score_batch;

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
        "Essential Skills" | "Easy" => (0.4, 0.9),
        "Medium" => (0.5, 0.9),
        "Hard" => (0.6, 0.9),
        "Extreme" => (0.65, 0.9),
        _ => (0.5, 0.9),
    }
}

// ─── Response format schemas ──────────────────────────────────────────────────

fn written_format() -> serde_json::Value {
    json_schema_format(
        "written_questions",
        serde_json::json!({
            "type": "object",
            "additionalProperties": false,
            "required": ["questions"],
            "properties": {
                "questions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["topic","subtopic","promptMarkdown","maxMarks","techAllowed"],
                        "properties": {
                            "topic":          { "type": "string" },
                            "subtopic":       { "type": ["string","null"] },
                            "promptMarkdown": { "type": "string" },
                            "maxMarks":       { "type": "integer", "minimum": 1, "maximum": 30 },
                            "techAllowed":    { "type": "boolean" }
                        }
                    }
                }
            }
        }),
    )
}

fn mc_format() -> serde_json::Value {
    json_schema_format(
        "mc_questions",
        serde_json::json!({
            "type": "object",
            "additionalProperties": false,
            "required": ["questions"],
            "properties": {
                "questions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["topic","subtopic","promptMarkdown","options","correctAnswer","explanationMarkdown","techAllowed"],
                        "properties": {
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
        }),
    )
}

fn marking_format() -> serde_json::Value {
    json_schema_format(
        "mark_answer",
        serde_json::json!({
            "type": "object",
            "additionalProperties": false,
            "required": ["verdict","achievedMarks","maxMarks","scoreOutOf10",
                         "vcaaMarkingScheme","comparisonToSolutionMarkdown",
                         "feedbackMarkdown","workedSolutionMarkdown",
                         "exemplarResponseMarkdown","mcOptionExplanations"],
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
                }
            }
        }),
    )
}

// ─── System prompt builders ───────────────────────────────────────────────────
//
// Each system prompt ends with:
//   (a) the global LATEX_RULES constant, and
//   (b) a concise description of the expected JSON schema so the model knows
//       exactly what fields to emit even before it sees the response_format.
//       This is more reliable than relying on response_format alone.

fn generation_compliance_contract() -> &'static str {
    "HIGH-PRIORITY CONTRACT (obey in this order):\n\
         1) Study Design authority: only generate assessable content explicitly covered by the\n\
                provided key knowledge/focus constraints. If unsure, exclude it.\n\
         2) Focus lock authority: selected subtopics/custom focus override all style references.\n\
         3) PDF authority: exam/report PDFs are style+marking references only, never a content source.\n\
         4) Originality: do not copy or paraphrase scenarios, wording, numbers, or structures from PDFs.\n\
         5) Output hygiene: return valid JSON only, no markdown fences, no commentary, no extra keys."
}

fn topic_field_contract() -> &'static str {
    "FIELD CONTRACT:\n\
         - topic: MUST be exactly one user-selected subject (for example, Mathematical Methods).\n\
         - subtopic: MUST be exactly one selected focus area within that subject (or null when unavailable).\n\
         - Never place a subtopic value in the topic field."
}

fn written_system() -> String {
    format!(
                "You are an expert VCE exam writer for written-response questions.\n\
                 {contract}\n\
                 {latex_rules}\n\
                 {question_style_rules}\n\n\
                 HARD CONSTRAINTS:\n\
                 - Question complexity must match maxMarks (parts, reasoning depth, and expected response length).\n\
                 - Before finalizing, verify each question's internal part marks sum exactly to maxMarks.\n\
                 - 'show that' questions: every step of the proof must be explicitly shown; a bald final line with no working scores zero.\n\
                 - 'hence' questions: the student MUST use the result from the previous part; a correct independent method scores zero for the 'hence' mark.\n\
                 - 'explain/justify' questions: a bare numerical answer without explanation scores zero.\n\n\
                 {field_contract}\n\n\
                 The \"promptMarkdown\" field MUST ONLY contain the question stem. You are FORBIDDEN from \
                 including worked solutions or answers inside the \"promptMarkdown\" string.\n\n\
                 No markdown fences, no extra keys, no commentary outside JSON.",
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
                 {field_contract}\n\
                 OUTPUT FORMAT — respond with a JSON object matching this schema exactly:\n\
                 {{\n\
                     \"questions\": [\n\
                         {{\n\
                             \"topic\": string (the SUBJECT — must be one of the user-selected topics, e.g. \"Mathematical Methods\", NOT a subtopic like \"Functions and Graphs\"),\n\
                             \"subtopic\": string | null (the focus area within the subject, e.g. \"Functions and Graphs\"),\n\
                             \"promptMarkdown\": string,\n\
                             \"options\": [\n\
                                 {{ \"label\": \"A\" | \"B\" | \"C\" | \"D\", \"text\": string }}\n\
                             ],\n\
                             \"correctAnswer\": \"A\" | \"B\" | \"C\" | \"D\",\n\
                             \"explanationMarkdown\": string (≤180 words — name the misconception each wrong option targets),\n\
                             \"techAllowed\": boolean\n\
                         }}\n\
                     ]\n\
                 }}\n\
                 STRICT RULE FOR PROMPT MARKDOWN:\n\
                 The \"promptMarkdown\" field MUST ONLY contain the question stem. You are FORBIDDEN from \
                 including the answer options (A, B, C, D) inside the \"promptMarkdown\" string, as these \
                 are handled by the \"options\" array in the JSON schema.\n\n\
                 No markdown fences, no extra keys, no commentary outside JSON.",
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
    let worked_words = (max_marks as usize * 200).max(500).min(2000);
    let comparison_words = (max_marks as usize * 60).max(200).min(800);
    let feedback_words = (max_marks as usize * 50).max(200).min(600);
    let rationale_words = (max_marks as usize * 30).max(100).min(400);

    format!(
        "You are a strict but constructive VCE marker.\n\
         \n\
         MARKING PHILOSOPHY:\n\
         - Apply VCAA criterion-based marking: award marks for correct, clearly demonstrated \
steps — not for lucky final answers where working is absent or incorrect.\n\
         - Do NOT award marks for: restating the question, vague statements without justification, \
correct answers with wrong or missing method (unless the question is answer-only).\n\
         - DO award marks for: correct method even if arithmetic slips, correct use of \
relevant formulas with appropriate substitution, logical reasoning that reaches the right conclusion.\n\
         - For 'show that' questions: every step of the proof must be explicitly shown; \
a bald final line with no working scores zero.\n\
         - For 'hence' questions: the student MUST use the result from the previous part; \
a correct independent method scores zero for the 'hence' mark.\n\
         - For 'explain/justify' questions: a bare numerical answer without explanation scores zero.\n\
         - For MC: the student selected a single letter — mark it correct or incorrect, then explain \
ALL four options (what misconception each wrong option targets and why the correct one is right).\n\
         \n\
         EXAMINERS' REPORT RULE: If VCAA examiners' report PDFs are attached, treat them as the \
PRIMARY marking authority. Use the official marking schemes, expected solutions, and common error \
patterns from the reports to: (1) determine exact criterion breakdowns, (2) identify which steps \
earn which marks, (3) recognise common student mistakes and address them in feedback. Where the \
report specifies partial credit rules, apply them consistently.\n\
         \n\
         CONCISENESS LIMITS (scale with mark value):\n\
         - Verdict: \"Correct\" or \"Incorrect\" — do NOT hedge or use non-committal language.\n\
         - Each criterion rationale: ≤{rationale_words} words — reference the student's specific wording.\n\
         - comparisonToSolution: ≤{comparison_words} words.\n\
         - feedbackMarkdown: ≤{feedback_words} words — be specific and actionable, not generic.\n\
         - workedSolutionMarkdown: ≤{worked_words} words — show every step explicitly.\n\
         \n\
        FEEDBACK STYLE — STANDARDISED FORMAT (MANDATORY):\n\
         - Format `feedbackMarkdown` using Markdown, following EXACTLY this Markdown structure (Notice the usage of headers):\n\
           ## Strengths\n\
           - (2–3 bullet points naming specific things the student did well, quoting their work)\n\
           ## Areas for Improvement\n\
           - (2–3 bullet points with specific, actionable advice — name the skill or step that needs work)\n\
           ## Common Pitfalls\n\
           - (1–2 bullet points on misconceptions this question typically targets)\n\
         - Do NOT include an exemplar response inside feedbackMarkdown — it has its own field.\n\
         - Do NOT add any other top-level headings to feedbackMarkdown.\n\
         - Use Markdown headings, bullet points, and short math/code fences where appropriate.\n\
         - Also use Markdown in `comparisonToSolutionMarkdown` and `workedSolutionMarkdown` (headings, lists, and clear step structure).\n\
         - `exemplarResponseMarkdown`: a concise ideal student answer (aligned to the marking scheme) that would earn full marks. Keep it focused on the key steps or reasoning required. This is a SEPARATE field — do NOT duplicate it in feedbackMarkdown.\n\
        \n\
        {latex_rules}{chem_note}\n\n\
        {phys_ed_note}\n\n\
         OUTPUT FORMAT — respond with a JSON object matching this schema exactly:\n\
         {{\n\
             \"verdict\": string,\n\
             \"achievedMarks\": integer ≥ 0,\n\
             \"maxMarks\": integer ≥ 1,\n\
             \"scoreOutOf10\": integer 0–10,\n\
             \"vcaaMarkingScheme\": [\n\
                 {{\n\
                     \"criterion\": string (name the specific skill/knowledge being tested),\n\
                     \"achievedMarks\": integer,\n\
                     \"maxMarks\": integer,\n\
                     \"rationale\": string (≤{rationale_words} words — quote or paraphrase \
the student's answer to justify the mark)\n\
                 }}\n\
             ],\n\
              \"comparisonToSolutionMarkdown\": string (≤{comparison_words} words),\n\
              \"feedbackMarkdown\": string (≤{feedback_words} words — MUST use the ## Strengths / ## Areas for Improvement / ## Common Pitfalls format specified above),\n\
              \"workedSolutionMarkdown\": string (≤{worked_words} words — full step-by-step solution),\n\
              \"exemplarResponseMarkdown\": string (concise ideal student answer for full marks — do NOT repeat this in feedbackMarkdown),\n\
             \"mcOptionExplanations\": [\n\
                 {{\n\
                     \"option\": \"A\" | \"B\" | \"C\" | \"D\",\n\
                     \"isCorrect\": boolean,\n\
                     \"explanation\": string (for wrong options: name the misconception it targets; \
for correct: why it is right)\n\
                 }}\n\
             ]  // empty array [] for written questions\n\
         }}\n\
         No markdown fences, no extra keys, no commentary outside JSON.",
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

fn tech_note(mode: &str) -> &'static str {
    match mode {
        "tech-free" => " All questions tech-free; set techAllowed:false.",
        "tech-active" => " All questions tech-active; set techAllowed:true.",
        _ => " Mix tech-free and tech-active; set techAllowed per question.",
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

        // Find this subtopic in the catalog to get its parent topic
        if let Some(topic_name) = catalog::subtopic_to_topic(&key) {
            let kk = catalog::subtopic_key_knowledge(topic_name, sub);
            if !kk.is_empty() {
                s.push_str(&format!("\n\n[{sub}]\n{kk}"));
            }
        }

        if let Some(exam) = exam_map.get(key.as_str()) {
            s.push_str(&format!("\n{exam}"));
        }
    }
    s
}

fn focus_lock_note(selected: Option<&Vec<String>>, custom_focus_area: Option<&str>) -> String {
    let mut constraints = Vec::<String>::new();
    if let Some(subs) = selected {
        if !subs.is_empty() {
            constraints.push(format!("Selected subtopics: {}.", subs.join(", ")));
        }
    }
    if let Some(area) = custom_focus_area {
        let trimmed = area.trim();
        if !trimmed.is_empty() {
            constraints.push(format!("Custom focus area: \"{trimmed}\"."));
        }
    }

    if constraints.is_empty() {
        return String::new();
    }

    format!(
        "\nFOCUS LOCK (HIGHEST PRIORITY):\n\
         - {} \n\
         - Every question part must map directly to the focus constraints above.\n\
         - Do NOT introduce outside concepts, even if they appear in attached exam PDFs.\n\
         - If there is any conflict, prioritize these focus constraints over PDF content.",
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
        "You have now seen the exam PDF(s). Return to the focus constraints specified earlier:"
            .to_string(),
    ];
    if let Some(subs) = selected {
        if !subs.is_empty() {
            lines.push(format!("• Selected subtopics: {}.", subs.join(", ")));
        }
    }
    if let Some(area) = custom_focus_area {
        let trimmed = area.trim();
        if !trimmed.is_empty() {
            lines.push(format!("• Custom focus area: \"{trimmed}\"."));
        }
    }
    lines.push(
        "IMPORTANT: The PDF was provided for formatting style ONLY.\n\
         - DO NOT copy, paraphrase, or reuse any scenario, context, numbers, or question ideas from the PDF.\n\
         - Every question you generate must use a new, original scenario and context, and must map exclusively to the Study Design key knowledge listed above.\n\
         - If you cannot invent a new scenario, skip that question and try a different concept.\n\
         - Do NOT use the same names, settings, or numbers as the PDF.\n\
         - The PDF is NOT a source of content, only a style reference."
            .to_string(),
    );
    lines.join("\n")
}

fn similarity_note(enabled: bool, prior: Option<&[String]>) -> String {
    if !enabled {
        return String::from("\nSIMILARITY GUARDRAIL: Each question must use a distinct scenario, context, and method. Do NOT repeat or closely paraphrase any previous question's scenario, numbers, or context. Use new names, settings, and details for every question.");
    }
    let examples: Vec<String> = prior
        .unwrap_or(&[])
        .iter()
        .map(|p| {
            let p = p.trim().replace(['\n', '\r'], " ");
            if p.len() > 1000 {
                format!("{}...", &p[..1000])
            } else {
                p
            }
        })
        .filter(|p| !p.is_empty())
        .take(6)
        .collect();
    if examples.is_empty() {
        return String::from("\nSIMILARITY GUARDRAIL: Each question must use a distinct scenario, context, and method. Do NOT repeat or closely paraphrase any previous question's scenario, numbers, or context. Use new names, settings, and details for every question.");
    }
    let list = examples
        .iter()
        .enumerate()
        .map(|(i, p)| format!("{}. {p}", i + 1))
        .collect::<Vec<_>>()
        .join("\n");
    format!("\nSIMILARITY GUARDRAIL: Each question must use a distinct scenario, context, and method. Do NOT repeat or closely paraphrase any of the following recent questions. Use new names, settings, and details for every question.\nRecent questions to avoid:\n{list}")
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

// ─── Shared parse pipeline ────────────────────────────────────────────────────

/// Extract + deserialise a `{"questions":[...]}` payload from a raw model string.
fn parse_questions_payload<T: serde::de::DeserializeOwned>(raw: &str) -> CommandResult<T> {
    // Protect LaTeX commands (\frac, \text, \beta, etc.) from being destroyed
    // by JSON escape-sequence interpretation before any parsing occurs.
    let protected = protect_latex_in_raw_json(raw);
    let json_str = extract_json_object(&protected)
        .ok_or_else(|| AppError::new("MODEL_PARSE_ERROR", "No JSON object in response."))?;
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
        "Generate exactly {count} VCE written-response questions. Topics: {topics}. Difficulty: {difficulty}.\n\n\
         Difficulty rules:\n{diff_rules}\n\n\
         CRITICAL MARK ALLOCATION RULE (you MUST follow this):\n\
          - Target average marks per question: {average_marks}\n\
          - Total marks across all {count} questions MUST equal {count} × {average_marks} = {total_marks}\n\
          - Vary individual maxMarks to suit command-term demand, but the arithmetic mean of all maxMarks values MUST equal {average_marks}\n\
          - Verify your output: sum all maxMarks and confirm it equals {total_marks}\n\
          - QUESTION LENGTH MUST MATCH maxMarks: A question worth {average_marks} marks on average must have proportional complexity. \
  A 3-mark question must NOT have 10 marks worth of sub-parts. A 1–2 mark question is a single short task. \
  A 3–4 mark question has at most 2 sub-parts. A 5–6 mark question has 2–3 sub-parts. \
  Count the marks of all parts before outputting — the total must equal maxMarks.\n\
         {subs_note}{custom_note}{tech}{topic_notes}{math_diff}\n\n\
         Quality: distinct concepts/contexts/methods per question — no two questions should \
 test the same skill in the same way. No worked solutions in prompts.\
         {sim_note}\n\n\
         Topic/subtopic fields must follow the system field contract above.\n\
         {focus_lock}{exam_context_preamble}\n\
         Output exactly {count} questions.",
        count                 = request.question_count,
        topics                = sanitize_for_api(&request.topics.join(", ")),
        difficulty            = adjusted_difficulty,
        diff_rules            = difficulty_guidance(&adjusted_difficulty),
        subs_note             = sanitize_for_api(&subtopics_note(selected_subs)),
        custom_note           = sanitize_for_api(&custom_note),
        tech                  = tech_note(tech_mode),
        topic_notes           = topic_notes(&request.topics, selected_subs),
        math_diff             = math_difficulty_note(&adjusted_difficulty, &request.topics),
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
    let written_fmt = written_format();
    let max_tokens = ((request.question_count as u32) * 4000 + 4000).min(64_000);

    // Determine model capabilities and plugins before building the request.
    let stats_result = get_model_stats(request.api_key.clone(), request.model.clone()).await;
    let supports_files = stats_result
        .as_ref()
        .ok()
        .map_or(false, |s| s.supports_files);
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

    let result = call_openrouter_streaming_with_plugins(
        &app,
        &request.api_key,
        &request.model,
        &written_sys,
        user_content,
        &written_fmt,
        max_tokens,
        temperature,
        top_p,
        seed,
        plugins,
    )
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

    // Enforce average marks constraint: adjust marks to hit the target average.
    if !payload.questions.is_empty() {
        let current_total: i64 = payload.questions.iter().map(|q| q.max_marks as i64).sum();
        let target_total = total_marks as i64;
        let diff = target_total - current_total;
        if diff != 0 {
            let q_count = payload.questions.len();
            let base_adj = diff / q_count as i64;
            let remainder = diff % q_count as i64;

            let mut indices: Vec<usize> = (0..q_count).collect();
            if diff > 0 {
                indices.sort_by_key(|&i| payload.questions[i].max_marks);
            } else {
                indices.sort_by_key(|&i| std::cmp::Reverse(payload.questions[i].max_marks));
            }

            for (pos, &i) in indices.iter().enumerate() {
                let adj = base_adj
                    + if (pos as i64) < remainder.abs() {
                        if diff > 0 {
                            1
                        } else {
                            -1
                        }
                    } else {
                        0
                    };
                let new_marks = (payload.questions[i].max_marks as i64 + adj)
                    .max(constants::MIN_MARKS_PER_QUESTION as i64)
                    .min(constants::MAX_MARKS_PER_QUESTION as i64);
                payload.questions[i].max_marks = new_marks as u8;
            }
        }
    }

    let texts: Vec<String> = payload
        .questions
        .iter()
        .map(|q| q.prompt_markdown.clone())
        .collect();
    let (scores, summary) = score_batch(&texts);
    for (q, (d, m)) in payload.questions.iter_mut().zip(scores) {
        q.distinctness_score = Some(d);
        q.multi_step_depth = Some(m);
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
        "Generate exactly {count} VCE multiple-choice questions. Topics: {topics}. Difficulty: {difficulty}.\n\n\
         Difficulty rules:\n{diff_rules}\n\n\
         Each question: 4 options (A–D), one correct answer, worth 1 mark each.\
         {subs_note}{custom_note}{tech}{topic_notes}{math_diff}\n\n\
         Quality: distinct concepts and contexts across the batch. Each wrong option must \
 target a specific, named student misconception (not just a random wrong value).\n\
         Explanation: ≤180 words — state the correct answer's reasoning and name the \
 misconception each wrong option targets. No chain-of-thought, no self-talk.\
         {sim_note}\n\n\
         Topic/subtopic fields must follow the system field contract above.\
         {focus_lock}{exam_context_preamble}\
         Output exactly {count} questions.",
        count                 = request.question_count,
        topics                = sanitize_for_api(&request.topics.join(", ")),
        difficulty            = adjusted_difficulty,
        diff_rules            = difficulty_guidance(&adjusted_difficulty),
        subs_note             = sanitize_for_api(&subtopics_note(selected_subs)),
        custom_note           = sanitize_for_api(&custom_note),
        tech                  = tech_note(tech_mode),
        topic_notes           = topic_notes(&request.topics, selected_subs),
        math_diff             = math_difficulty_note(&adjusted_difficulty, &request.topics),
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
    let mc_fmt = mc_format();
    let max_tokens = if request.question_count > 0 {
        6000 + ((request.question_count as u32 - 1) * 2000) + 4000
    } else {
        4000
    };

    // Determine model capabilities and plugins before building the request.
    let stats_result = get_model_stats(request.api_key.clone(), request.model.clone()).await;
    let supports_files = stats_result
        .as_ref()
        .ok()
        .map_or(false, |s| s.supports_files);
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

    let result = call_openrouter_streaming_with_plugins(
        &app,
        &request.api_key,
        &request.model,
        &mc_sys,
        user_content,
        &mc_fmt,
        max_tokens,
        temperature,
        top_p,
        seed,
        plugins,
    )
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
    let (scores, summary) = score_batch(&texts);
    for (q, (d, m)) in payload.questions.iter_mut().zip(scores) {
        q.distinctness_score = Some(d);
        q.multi_step_depth = Some(m);
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
        .map_or(false, |v| !v.trim().is_empty());
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
        &request
            .student_answer
            .replace("\r\n", "\n")
            .lines()
            .map(str::trim_end)
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string(),
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
    let report_parts = build_report_file_parts(&app, &[question_topic.clone()]);
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
        let supports_files = stats_result
            .as_ref()
            .ok()
            .map_or(false, |s| s.supports_files);
        plugins_for_model(supports_files)
    } else {
        serde_json::json!([{ "id": "response-healing" }])
    };

    let result = call_openrouter_with_plugins(
        &request.api_key,
        &request.model,
        &marking_system(max_marks, chem_note, pe_note),
        user_content,
        &marking_format(),
        max_tokens,
        temperature,
        top_p,
        seed,
        plugins,
    )
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

    let free_text_format = json_schema_format(
        "text_response",
        serde_json::json!({
            "type": "object",
            "additionalProperties": false,
            "required": ["text"],
            "properties": { "text": { "type": "string" } }
        }),
    );

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
    let value: Option<serde_json::Value> = serde_json::from_str(&protected).ok();

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

    // If we got a bare array directly from extract_json_object (the scanner found
    // the first {…} inside a bare array), arr_opt will be None but value will be
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

/// Extract the first JSON array (`[…]`) from a string, stripping fences.
fn extract_json_array(content: &str) -> Option<String> {
    let s = content.trim();

    // Already a clean array.
    if s.starts_with('[') {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(s) {
            if v.is_array() {
                return Some(s.to_string());
            }
        }
    }

    // Strip ```json ... ``` fences.
    let fence = s
        .strip_prefix("```json")
        .or_else(|| s.strip_prefix("```"))
        .map(|s| s.trim_start_matches('\n'))
        .and_then(|s| s.strip_suffix("```"))
        .map(str::trim);
    if let Some(inner) = fence {
        if inner.starts_with('[') {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(inner) {
                if v.is_array() {
                    return Some(inner.to_string());
                }
            }
        }
    }

    // Scan for the first parseable array.
    for (i, ch) in content.char_indices() {
        if ch != '[' {
            continue;
        }
        let slice = &content[i..];
        let mut iter = serde_json::Deserializer::from_str(slice).into_iter::<serde_json::Value>();
        if let Some(Ok(v)) = iter.next() {
            if v.is_array() {
                let end = i + iter.byte_offset();
                return content.get(i..end).map(str::to_string);
            }
        }
    }
    None
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

    let schema = json_schema_format(
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
    );

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
        .setup(|_app| {
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
        .invoke_handler(tauri::generate_handler![
            load_persisted_state,
            save_persisted_state,
            export_data_file,
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
        }];
        assert!(validate_mc(&questions, 1).is_err());
    }

    #[test]
    fn marking_system_scales_word_limits_with_marks() {
        // 1-mark question should hit the floors
        let sys_1 = marking_system(1, "", "");
        assert!(sys_1.contains("≤100 words"));

        // 10-mark question should have generous limits
        let sys_10 = marking_system(10, "", "");
        assert!(sys_10.contains("≤600 words"));
    }
}
