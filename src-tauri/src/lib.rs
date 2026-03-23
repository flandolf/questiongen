mod constants;
mod difficulty;
mod models;
mod openrouter;
mod openrouter_info;
mod parsing;
mod persistence;
mod quality;

use base64::{engine::general_purpose, Engine as _};
use std::collections::HashMap;
use std::path::Path;
use std::time::Instant;
use tauri::Emitter;

use constants::*;
use difficulty::difficulty_guidance;
use models::*;
use openrouter::{call_openrouter, call_openrouter_streaming, json_schema_format};
use openrouter_info::{compute_generation_cost, get_credits, get_model_stats};
use parsing::{
    clean_field, extract_json_object, normalise_mc, normalise_written, normalize_envelope,
    validate_mc, validate_written,
};
use persistence::{load_persisted_state, save_persisted_state};
use quality::score_batch;

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
                         "feedbackMarkdown","workedSolutionMarkdown","mcOptionExplanations"],
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

fn written_system() -> String {
    format!(
        "You are an expert VCE exam writer. Produce exam-style written-response questions with \
         LaTeX where needed.\n\
         CRITICAL: Every question must be grounded strictly in the VCE Study Design key knowledge \
         provided in the user prompt. Only test concepts that are explicitly listed in that key \
         knowledge. Do not introduce content that is not in the Study Design.\n\
         {LATEX_RULES}\n\
         {QUESTION_STYLE_RULES}\n\n\
         OUTPUT FORMAT — respond with a JSON object matching this schema exactly:\n\
         {{\n\
           \"questions\": [\n\
             {{\n\
               \"topic\": string,\n\
               \"subtopic\": string | null,\n\
               \"promptMarkdown\": string,\n\
               \"maxMarks\": integer (1–30),\n\
               \"techAllowed\": boolean\n\
             }}\n\
           ]\n\
         }}\n\
         No markdown fences, no extra keys, no commentary outside JSON."
    )
}

fn mc_system() -> String {
    format!(
        "You are an expert VCE exam writer. Create challenging multiple-choice questions. \
         Provide only final answers — no chain-of-thought in explanations.\n\
         CRITICAL: Every question must be grounded strictly in the VCE Study Design key knowledge \
         provided in the user prompt. Only test concepts that are explicitly listed in that key \
         knowledge. Do not introduce content that is not in the Study Design.\n\
         {LATEX_RULES}\n\
         {MC_DISTRACTOR_RULES}\n\n\
         OUTPUT FORMAT — respond with a JSON object matching this schema exactly:\n\
         {{\n\
           \"questions\": [\n\
             {{\n\
               \"topic\": string,\n\
               \"subtopic\": string | null,\n\
               \"promptMarkdown\": string,\n\
               \"options\": [\n\
                 {{ \"label\": \"A\" | \"B\" | \"C\" | \"D\", \"text\": string }}\n\
               ],\n\
               \"correctAnswer\": \"A\" | \"B\" | \"C\" | \"D\",\n\
                                     \"explanationMarkdown\": string (≤300 words — name the misconception each wrong option targets),\n\
               \"techAllowed\": boolean\n\
             }}\n\
           ]\n\
         }}\n\
         No markdown fences, no extra keys, no commentary outside JSON."
    )
}

/// Build the marking system prompt with word limits scaled to question size.
///
/// Limits scale with `max_marks` so a 10-mark question gets generous space for a
/// worked solution while a 1-mark question stays concise. The minimum ensures the
/// model always has enough room for a useful response.
fn marking_system(max_marks: u8, chem_note: &str) -> String {
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
         CONCISENESS LIMITS (scale with mark value):\n\
         - Each criterion rationale: ≤{rationale_words} words — reference the student's specific wording.\n\
         - comparisonToSolution: ≤{comparison_words} words.\n\
         - feedbackMarkdown: ≤{feedback_words} words — be specific and actionable, not generic.\n\
         - workedSolutionMarkdown: ≤{worked_words} words — show every step explicitly.\n\
         \n\
        FEEDBACK STYLE:\n\
         - Format `feedbackMarkdown` using Markdown (headings, bullet points, and short math/code fences where appropriate) so feedback is clear and scannable.\n\
         - At the end of `feedbackMarkdown` include an \"Exemplar response\" subsection showing an ideal student answer (concise, directly aligned to the marking scheme) that would earn full marks.\n\
         - Keep exemplar focused on the key steps or reasoning required for full credit.\n\
        \n\
        {LATEX_RULES}{chem_note}\n\n\
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
             \"feedbackMarkdown\": string (≤{feedback_words} words — 2–3 specific, actionable improvements),\n\
             \"workedSolutionMarkdown\": string (≤{worked_words} words — full step-by-step solution),\n\
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
    )
}

// ─── Shared prompt-note builders ──────────────────────────────────────────────

fn topic_notes(topics: &[String]) -> String {
    let mut s = String::new();
    if topics
        .iter()
        .any(|t| t.trim().eq_ignore_ascii_case(MATHEMATICAL_METHODS_TOPIC))
    {
        s.push('\n');
        s.push_str(MATHEMATICAL_METHODS_GUIDANCE);
    }
    if topics
        .iter()
        .any(|t| t.trim().eq_ignore_ascii_case(PHYSICAL_EDUCATION_TOPIC))
    {
        s.push('\n');
        s.push_str(PHYSICAL_EDUCATION_GUIDANCE);
    }
    if topics
        .iter()
        .any(|t| t.trim().eq_ignore_ascii_case(CHEMISTRY_TOPIC))
    {
        s.push('\n');
        s.push_str(CHEMISTRY_LATEX_GUIDANCE);
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

fn subtopics_note(
    selected: Option<&Vec<String>>,
    instructions: Option<&HashMap<String, String>>,
) -> String {
    let Some(subs) = selected.filter(|s| !s.is_empty()) else {
        return String::new();
    };
    let mut s = format!("\nFocus subtopics: {}.", subs.join(", "));

    // Inject Study Design key knowledge for each selected subtopic.
    let kk_map = crate::constants::subtopic_key_knowledge();
    for sub in subs {
        let key = sub.trim().to_ascii_lowercase();
        if let Some(kk) = kk_map.get(key.as_str()) {
            s.push_str(&format!("\n\n[{sub}]\n{kk}"));
        }
    }

    // User-supplied per-subtopic instructions override or supplement the above.
    if let Some(instr) = instructions {
        let lines: Vec<String> = subs
            .iter()
            .filter_map(|sub| instr.get(sub).map(|i| format!("- {sub}: {}", i.trim())))
            .filter(|l| l.chars().any(|c| c.is_alphanumeric()))
            .collect();
        if !lines.is_empty() {
            s.push_str("\nSubtopic constraints (user-specified):\n");
            s.push_str(&lines.join("\n"));
        }
    }
    s
}

fn similarity_note(enabled: bool, prior: Option<&[String]>) -> String {
    if !enabled {
        return String::new();
    }
    let examples: Vec<String> = prior
        .unwrap_or(&[])
        .iter()
        .map(|p| {
            let p = p.trim().replace(['\n', '\r'], " ");
            if p.len() > 260 {
                format!("{}...", &p[..260])
            } else {
                p
            }
        })
        .filter(|p| !p.is_empty())
        .take(6)
        .collect();
    if examples.is_empty() {
        return "\nSimilarity guardrail: avoid repeating recent question contexts or solving methods.".into();
    }
    let list = examples
        .iter()
        .enumerate()
        .map(|(i, p)| format!("{}. {p}", i + 1))
        .collect::<Vec<_>>()
        .join("\n");
    format!("\nSimilarity guardrail — do not reuse scenario/method from:\n{list}")
}

fn math_difficulty_note(difficulty: &str, topics: &[String]) -> &'static str {
    if topics
        .iter()
        .any(|t| t.trim().eq_ignore_ascii_case(MATHEMATICAL_METHODS_TOPIC))
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
    let json_str = extract_json_object(raw)
        .ok_or_else(|| AppError::new("MODEL_PARSE_ERROR", "No JSON object in response."))?;
    let value: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| AppError::new("MODEL_PARSE_ERROR", format!("Invalid JSON: {e}")))?;
    let normalised =
        normalize_envelope(value).map_err(|e| AppError::new("MODEL_PARSE_ERROR", e))?;
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
        return Err(AppError::new("VALIDATION_ERROR", "Select at least one topic."));
    }
    if request.question_count == 0 || request.question_count > 20 {
        return Err(AppError::new("VALIDATION_ERROR", "Question count must be 1–20."));
    }
    if request.api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "API key required."));
    }
    if request.model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model required."));
    }

    let started = Instant::now();
    let selected_subs = request.subtopics.as_ref().filter(|s| !s.is_empty());
    let tech_mode = request.tech_mode.as_deref().unwrap_or("mix");
    let max_marks_cap = request.max_marks_per_question.unwrap_or(30);
    let custom_note = request
        .custom_focus_area
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map_or(String::new(), |v| {
            format!(" Custom focus: \"{v}\". Align all questions to this where syllabus-valid.")
        });

    let _ = app.emit(
        "generation-status",
        serde_json::json!({
            "mode": "written", "stage": "preparing",
            "message": "Building prompt.", "attempt": 1
        }),
    );

    let prompt = format!(
        "Generate exactly {count} VCE written-response questions. Topics: {topics}. Difficulty: {difficulty}.\n\n\
         Difficulty rules:\n{diff_rules}\n\n\
         Mark rules: assign maxMarks by command-term demand; cap at {max_marks_cap}.\
         {subs_note}{custom_note}{tech}{topic_notes}{math_diff}\n\n\
         Quality: distinct concepts/contexts/methods per question — no two questions should \
test the same skill in the same way. No worked solutions in prompts.\
         {sim_note}\n\n\
         STUDY DESIGN COMPLIANCE: Every question must test only concepts explicitly listed in the \
key knowledge above. Do not introduce content outside the Study Design.\n\
         Subtopic: choose only from provided list; omit if none fits.\n\
         Output exactly {count} questions.",
        count       = request.question_count,
        topics      = request.topics.join(", "),
        difficulty  = request.difficulty,
        diff_rules  = difficulty_guidance(&request.difficulty),
        subs_note   = subtopics_note(selected_subs, request.subtopic_instructions.as_ref()),
        custom_note = custom_note,
        tech        = tech_note(tech_mode),
        topic_notes = topic_notes(&request.topics),
        math_diff   = math_difficulty_note(&request.difficulty, &request.topics),
        sim_note    = similarity_note(
            request.avoid_similar_questions.unwrap_or(false),
            request.prior_question_prompts.as_deref(),
        ),
    );

    let _ = app.emit(
        "generation-status",
        serde_json::json!({
            "mode": "written", "stage": "generating",
            "message": format!("Generating {} questions…", request.question_count),
            "attempt": 1
        }),
    );

    let written_sys = written_system();
    let written_fmt = written_format();
    let max_tokens = (request.question_count as u32) * 4000 + 4000;

    let (result, stats_result) = tokio::join!(
        call_openrouter_streaming(
            &app,
            &request.api_key,
            &request.model,
            &written_sys,
            serde_json::Value::String(prompt),
            &written_fmt,
            max_tokens,
        ),
        get_model_stats(request.api_key.clone(), request.model.clone()),
    );
    let result = result?;

    let _ = app.emit(
        "generation-status",
        serde_json::json!({
            "mode": "written", "stage": "parsing",
            "message": "Parsing and validating questions.",
            "attempt": 1
        }),
    );

    let mut payload: WrittenQuestionsPayload = parse_questions_payload(&result.content)?;
    normalise_written(&mut payload.questions, selected_subs);
    validate_written(&payload.questions, request.question_count)?;
    apply_tech_override(&mut payload.questions, tech_mode);

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

    let _ = app.emit(
        "generation-status",
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
        return Err(AppError::new("VALIDATION_ERROR", "Select at least one topic."));
    }
    if request.question_count == 0 || request.question_count > 20 {
        return Err(AppError::new("VALIDATION_ERROR", "Question count must be 1–20."));
    }
    if request.api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "API key required."));
    }
    if request.model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model required."));
    }

    let started = Instant::now();
    let selected_subs = request.subtopics.as_ref().filter(|s| !s.is_empty());
    let tech_mode = request.tech_mode.as_deref().unwrap_or("mix");
    let custom_note = request
        .custom_focus_area
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map_or(String::new(), |v| {
            format!(" Custom focus: \"{v}\". Align all questions to this where syllabus-valid.")
        });

    let _ = app.emit(
        "generation-status",
        serde_json::json!({
            "mode": "multiple-choice", "stage": "preparing",
            "message": "Building prompt.", "attempt": 1
        }),
    );

    let prompt = format!(
        "Generate exactly {count} VCE multiple-choice questions. Topics: {topics}. Difficulty: {difficulty}.\n\n\
         Difficulty rules:\n{diff_rules}\n\n\
         Each question: 4 options (A–D), one correct answer.\
         {subs_note}{custom_note}{tech}{topic_notes}{math_diff}\n\n\
         Quality: distinct concepts and contexts across the batch. Each wrong option must \
target a specific, named student misconception (not just a random wrong value).\n\
         Explanation: ≤90 words — state the correct answer's reasoning and name the \
misconception each wrong option targets. No chain-of-thought, no self-talk.\
         {sim_note}\n\n\
         STUDY DESIGN COMPLIANCE: Every question must test only concepts explicitly listed in the \
key knowledge above. Do not introduce content outside the Study Design.\n\
         Subtopic: choose only from provided list; omit if none fits.\n\
         Output exactly {count} questions.",
        count       = request.question_count,
        topics      = request.topics.join(", "),
        difficulty  = request.difficulty,
        diff_rules  = difficulty_guidance(&request.difficulty),
        subs_note   = subtopics_note(selected_subs, request.subtopic_instructions.as_ref()),
        custom_note = custom_note,
        tech        = tech_note(tech_mode),
        topic_notes = topic_notes(&request.topics),
        math_diff   = math_difficulty_note(&request.difficulty, &request.topics),
        sim_note    = similarity_note(
            request.avoid_similar_questions.unwrap_or(false),
            request.prior_question_prompts.as_deref(),
        ),
    );

    let _ = app.emit(
        "generation-status",
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

    let (result, stats_result) = tokio::join!(
        call_openrouter_streaming(
            &app,
            &request.api_key,
            &request.model,
            &mc_sys,
            serde_json::Value::String(prompt),
            &mc_fmt,
            max_tokens,
        ),
        get_model_stats(request.api_key.clone(), request.model.clone()),
    );
    let result = result?;

    let _ = app.emit(
        "generation-status",
        serde_json::json!({
            "mode": "multiple-choice", "stage": "parsing",
            "message": "Parsing and validating questions.",
            "attempt": 1
        }),
    );

    let mut payload: McQuestionsPayload = parse_questions_payload(&result.content)?;
    normalise_mc(&mut payload.questions, selected_subs);
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

    let _ = app.emit(
        "generation-status",
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
async fn mark_answer(request: MarkAnswerRequest) -> CommandResult<MarkAnswerResponse> {
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
    if request.api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "API key required."));
    }
    if request.model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model required."));
    }
    if request.question.max_marks == 0 {
        return Err(AppError::new("VALIDATION_ERROR", "maxMarks must be > 0."));
    }

    const MAX_ANSWER_CHARS: usize = 12_000;
    let mut answer = request
        .student_answer
        .replace("\r\n", "\n")
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();
    if answer.chars().count() > MAX_ANSWER_CHARS {
        answer = answer.chars().take(MAX_ANSWER_CHARS).collect();
        answer.push_str("\n\n[Truncated: answer exceeded length limit.]");
    }

    let is_chem = request
        .question
        .topic
        .trim()
        .eq_ignore_ascii_case(CHEMISTRY_TOPIC);
    let chem_note = if is_chem {
        CHEMISTRY_LATEX_GUIDANCE
    } else {
        ""
    };

    let max_marks = request.question.max_marks;

    // Build a richer marking prompt that includes the full question context.
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
         - The workedSolution must show every step a student would need to write to receive full marks.",
        topic    = request.question.topic,
        subtopic = request.question.subtopic.as_deref().unwrap_or("—"),
        question = request.question.prompt_markdown,
        max      = max_marks,
        answer   = answer,
    );

    let user_content = match request
        .student_answer_image_data_url
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        None => serde_json::Value::String(prompt.clone()),
        Some(url) => {
            if !url.starts_with("data:image/") {
                return Err(AppError::new(
                    "VALIDATION_ERROR",
                    "Image must be a valid data URL.",
                ));
            }
            serde_json::json!([
                { "type": "text",      "text": prompt },
                { "type": "image_url", "image_url": { "url": url } }
            ])
        }
    };

    // Scale token budget with mark count. MC option explanations (4 options × ~60 words each)
    // add ~400 tokens on top of the written-question budget.
    let max_tokens = (max_marks as u32) * 2000 + 4000;

    let result = call_openrouter(
        &request.api_key,
        &request.model,
        &marking_system(max_marks, chem_note),
        user_content,
        &marking_format(),
        max_tokens,
    )
    .await?;

    let json_str = extract_json_object(&result.content).ok_or_else(|| {
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

    parsed.score_out_of_10 = parsed.score_out_of_10.min(10);
    if parsed.score_out_of_10 == 0 && parsed.max_marks > 0 {
        parsed.score_out_of_10 =
            ((parsed.achieved_marks as f32 / parsed.max_marks as f32) * 10.0).round() as u8;
        parsed.score_out_of_10 = parsed.score_out_of_10.min(10);
    }

    parsed.feedback_markdown = clean_field(&parsed.feedback_markdown);
    parsed.worked_solution_markdown = clean_field(&parsed.worked_solution_markdown);
    parsed.comparison_to_solution_markdown = clean_field(&parsed.comparison_to_solution_markdown);
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
    if !path.exists() {
        return Err(AppError::new("VALIDATION_ERROR", "Image file not found."));
    }
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

    let bytes = std::fs::read(path)
        .map_err(|e| AppError::new("IO_ERROR", format!("Failed to read image: {e}")))?;
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
    )
    .await?;

    let output_text = serde_json::from_str::<serde_json::Value>(&result.content)
        .ok()
        .and_then(|v| v.get("text").and_then(|t| t.as_str()).map(str::to_string))
        .unwrap_or(result.content);

    Ok(AnalyzeImageResponse { output_text })
}

// ─── App entry-point ──────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_persisted_state,
            save_persisted_state,
            generate_questions,
            mark_answer,
            analyze_image,
            generate_mc_questions,
            get_model_stats,
            get_credits,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use parsing::{extract_json_object, normalize_envelope, validate_mc, validate_written};

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
    fn normalize_envelope_wraps_array() {
        let v = serde_json::json!([{"id":"q1"}]);
        let out = normalize_envelope(v).unwrap();
        assert!(out.get("questions").unwrap().is_array());
    }

    #[test]
    fn normalize_envelope_handles_nested_data() {
        let v = serde_json::json!({"data":{"questions":[{"id":"q1"}]}});
        let out = normalize_envelope(v).unwrap();
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
        let sys_1 = marking_system(1, "");
        assert!(sys_1.contains("≤150 words"));

        // 10-mark question should have generous limits
        let sys_10 = marking_system(10, "");
        assert!(sys_10.contains("≤600 words"));
    }
}
