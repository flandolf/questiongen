mod constants;
mod difficulty;
mod models;
mod openrouter;
mod openrouter_info;
mod parsing;
mod persistence;
mod quality;

use std::collections::HashMap;
use std::path::Path;
use std::time::Instant;
use base64::{Engine as _, engine::general_purpose};
use tauri::Emitter;

use constants::*;
use difficulty::difficulty_guidance;
use models::*;
use openrouter::{call_openrouter, json_schema_format};
use parsing::{
    clean_field, extract_json_object, normalize_envelope,
    normalise_mc, normalise_written, validate_mc, validate_written,
};
use openrouter_info::{get_credits, get_model_stats};
use persistence::{load_persisted_state, save_persisted_state};
use quality::score_batch;

// ─── Response format schemas ──────────────────────────────────────────────────
// Defined inline — small, used once each, no need for a separate file.

fn written_format() -> serde_json::Value {
    // strict mode requires every property key to appear in `required`.
    // Optional fields use `["string","null"]` so the model can emit null when absent.
    json_schema_format("written_questions", serde_json::json!({
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
    }))
}

fn mc_format() -> serde_json::Value {
    json_schema_format("mc_questions", serde_json::json!({
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
    }))
}

fn marking_format() -> serde_json::Value {
    json_schema_format("mark_answer", serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["verdict","achievedMarks","maxMarks","scoreOutOf10",
                     "vcaaMarkingScheme","comparisonToSolutionMarkdown",
                     "feedbackMarkdown","workedSolutionMarkdown"],
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
            "workedSolutionMarkdown":       { "type": "string" }
        }
    }))
}

// ─── Shared prompt-note builders ──────────────────────────────────────────────

fn topic_notes(topics: &[String]) -> String {
    let mut s = String::new();
    if topics.iter().any(|t| t.trim().eq_ignore_ascii_case(MATHEMATICAL_METHODS_TOPIC)) {
        s.push_str(MATHEMATICAL_METHODS_GUIDANCE);
    }
    if topics.iter().any(|t| t.trim().eq_ignore_ascii_case(PHYSICAL_EDUCATION_TOPIC)) {
        s.push_str(PHYSICAL_EDUCATION_GUIDANCE);
    }
    if topics.iter().any(|t| t.trim().eq_ignore_ascii_case(CHEMISTRY_TOPIC)) {
        s.push_str(CHEMISTRY_LATEX_GUIDANCE);
    }
    s
}

fn tech_note(mode: &str) -> &'static str {
    match mode {
        "tech-free"   => " All questions tech-free; set techAllowed:false.",
        "tech-active" => " All questions tech-active; set techAllowed:true.",
        _             => " Mix tech-free and tech-active; set techAllowed per question.",
    }
}

fn subtopics_note(selected: Option<&Vec<String>>, instructions: Option<&HashMap<String,String>>) -> String {
    let mut s = String::new();
    if let Some(subs) = selected.filter(|s| !s.is_empty()) {
        s.push_str(&format!(" Focus subtopics: {}.", subs.join(", ")));
        if let Some(instr) = instructions {
            let lines: Vec<String> = subs.iter()
                .filter_map(|sub| instr.get(sub).map(|i| format!("- {sub}: {}", i.trim())))
                .filter(|l| !l.trim_end_matches(|c: char| !c.is_alphanumeric()).is_empty())
                .collect();
            if !lines.is_empty() {
                s.push_str("\nSubtopic constraints:\n");
                s.push_str(&lines.join("\n"));
            }
        }
    }
    s
}

fn similarity_note(enabled: bool, prior: Option<&[String]>) -> String {
    if !enabled { return String::new(); }
    let examples: Vec<String> = prior.unwrap_or(&[])
        .iter()
        .map(|p| {
            let p = p.trim().replace(['\n','\r'], " ");
            if p.len() > 260 { format!("{}...", &p[..260]) } else { p }
        })
        .filter(|p| !p.is_empty())
        .take(6)
        .collect();

    if examples.is_empty() {
        return "\nSimilarity guardrail: avoid repeating recent question contexts or solving methods.".into();
    }
    let list = examples.iter().enumerate().map(|(i,p)| format!("{}. {p}", i+1)).collect::<Vec<_>>().join("\n");
    format!("\nSimilarity guardrail — do not reuse scenario/method from:\n{list}")
}

fn math_difficulty_note(difficulty: &str, topics: &[String]) -> &'static str {
    if topics.iter().any(|t| t.trim().eq_ignore_ascii_case(MATHEMATICAL_METHODS_TOPIC)) {
        return match difficulty.to_ascii_lowercase().as_str() {
            "essential skills" => " Math Essential Skills: single-skill items, direct substitution only.",
            "extreme"          => " Math Extreme: multi-part proofs, chain reasoning, first-principles derivation.",
            _                  => "",
        }
    } else {
        return match difficulty.to_ascii_lowercase().as_str() {
            "essential skills" => " Essential Skills: straightforward questions, minimal inference.",
            "extreme"          => " Extreme: multi-step reasoning, synthesis of multiple concepts.",
            _                  => "",
        }
    }
}

// ─── Tauri command: generate written questions ────────────────────────────────

#[tauri::command]
async fn generate_questions(
    app: tauri::AppHandle,
    request: GenerateQuestionsRequest,
) -> CommandResult<GenerateQuestionsResponse> {
    // Validate
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
    let _ = app.emit("generation-status", serde_json::json!({
        "mode": "written", "stage": "generating", "message": "Requesting question set."
    }));

    let selected_subs  = request.subtopics.as_ref().filter(|s| !s.is_empty());
    let tech_mode      = request.tech_mode.as_deref().unwrap_or("mix");
    let max_marks_cap  = request.max_marks_per_question.unwrap_or(30);
    let custom_focus   = request.custom_focus_area.as_deref().map(str::trim).filter(|v| !v.is_empty());

    let custom_note = custom_focus.map_or(String::new(), |v| {
        format!(" Custom focus: \"{v}\". Align all questions to this where syllabus-valid.")
    });

    let prompt = format!(
        "Generate exactly {count} VCE written-response questions. Topics: {topics}. Difficulty: {difficulty}.\n\n\
         Difficulty rules:\n{diff_rules}\n\n\
         Mark rules: assign maxMarks by command-term demand; cap at {max_marks_cap}.\
         {subs_note}{custom_note}{tech}{topic_notes}{math_diff}\n\n\
         Quality: distinct concepts/contexts/methods. No worked solutions in prompts.\
         {sim_note}\n\n\
         Subtopic: choose only from provided list; omit if none fits.\n\
         Output: JSON only, no fences, exactly {count} questions.",
        count      = request.question_count,
        topics     = request.topics.join(", "),
        difficulty = request.difficulty,
        diff_rules = difficulty_guidance(&request.difficulty),
        subs_note  = subtopics_note(selected_subs, request.subtopic_instructions.as_ref()),
        custom_note = custom_note,
        tech       = tech_note(tech_mode),
        topic_notes = topic_notes(&request.topics),
        math_diff  = math_difficulty_note(&request.difficulty, &request.topics),
        sim_note   = similarity_note(
            request.avoid_similar_questions.unwrap_or(false),
            request.prior_question_prompts.as_deref(),
        ),
    );

    let system = format!(
        "You are an expert VCE exam writer. Produce exam-style questions with LaTeX where needed.{LATEX_RULES}"
    );

    let raw = call_openrouter(
        &request.api_key, &request.model, &system,
        serde_json::Value::String(prompt),
        &written_format(),
    ).await?;

    // Parse
    let json_str = extract_json_object(&raw)
        .ok_or_else(|| AppError::new("MODEL_PARSE_ERROR", "No JSON object in response."))?;
    let value: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| AppError::new("MODEL_PARSE_ERROR", format!("Invalid JSON: {e}")))?;
    let normalised = normalize_envelope(value)
        .map_err(|e| AppError::new("MODEL_PARSE_ERROR", e))?;
    let mut payload: WrittenQuestionsPayload = serde_json::from_value(normalised)
        .map_err(|e| AppError::new("MODEL_PARSE_ERROR", format!("Schema mismatch: {e}")))?;

    normalise_written(&mut payload.questions, selected_subs);
    validate_written(&payload.questions, request.question_count)?;

    // Apply tech override
    match tech_mode {
        "tech-free"   => payload.questions.iter_mut().for_each(|q| q.tech_allowed = false),
        "tech-active" => payload.questions.iter_mut().for_each(|q| q.tech_allowed = true),
        _ => {}
    }

    // Quality scores
    let texts: Vec<String> = payload.questions.iter().map(|q| q.prompt_markdown.clone()).collect();
    let (scores, summary) = score_batch(&texts);
    for (q, (d, m)) in payload.questions.iter_mut().zip(scores) {
        q.distinctness_score = Some(d);
        q.multi_step_depth   = Some(m);
    }

    let duration_ms = started.elapsed().as_millis() as u64;
    let _ = app.emit("generation-status", serde_json::json!({
        "mode": "written", "stage": "completed",
        "message": format!("Done in {duration_ms}ms.")
    }));

    Ok(GenerateQuestionsResponse {
        questions: payload.questions,
        duration_ms,
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

    let started    = Instant::now();
    let selected_subs = request.subtopics.as_ref().filter(|s| !s.is_empty());
    let tech_mode  = request.tech_mode.as_deref().unwrap_or("mix");
    let custom_focus = request.custom_focus_area.as_deref().map(str::trim).filter(|v| !v.is_empty());

    let custom_note = custom_focus.map_or(String::new(), |v| {
        format!(" Custom focus: \"{v}\". Align all questions to this where syllabus-valid.")
    });

    let _ = app.emit("generation-status", serde_json::json!({
        "mode": "multiple-choice", "stage": "generating", "message": "Requesting MC set."
    }));

    let prompt = format!(
        "Generate exactly {count} VCE multiple-choice questions. Topics: {topics}. Difficulty: {difficulty}.\n\n\
         Difficulty rules:\n{diff_rules}\n\n\
         Each question: 4 options (A–D), one correct answer.\
         {subs_note}{custom_note}{tech}{topic_notes}{math_diff}\n\n\
         Quality: distinct concepts, plausible distractors based on common misconceptions.\n\
         Explanation: ≤90 words, final rationale only — no chain-of-thought or self-talk.\
         {sim_note}\n\n\
         Subtopic: choose only from provided list; omit if none fits.\n\
         Output: JSON only, no fences, exactly {count} questions.",
        count      = request.question_count,
        topics     = request.topics.join(", "),
        difficulty = request.difficulty,
        diff_rules = difficulty_guidance(&request.difficulty),
        subs_note  = subtopics_note(selected_subs, request.subtopic_instructions.as_ref()),
        custom_note = custom_note,
        tech       = tech_note(tech_mode),
        topic_notes = topic_notes(&request.topics),
        math_diff  = math_difficulty_note(&request.difficulty, &request.topics),
        sim_note   = similarity_note(
            request.avoid_similar_questions.unwrap_or(false),
            request.prior_question_prompts.as_deref(),
        ),
    );

    let system = format!(
        "You are an expert VCE exam writer. Create challenging multiple-choice questions. \
         Provide only the final answer — no chain-of-thought.{LATEX_RULES}"
    );

    let raw = call_openrouter(
        &request.api_key, &request.model, &system,
        serde_json::Value::String(prompt),
        &mc_format(),
    ).await?;

    let json_str = extract_json_object(&raw)
        .ok_or_else(|| AppError::new("MODEL_PARSE_ERROR", "No JSON object in response."))?;
    let value: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| AppError::new("MODEL_PARSE_ERROR", format!("Invalid JSON: {e}")))?;
    let normalised = normalize_envelope(value)
        .map_err(|e| AppError::new("MODEL_PARSE_ERROR", e))?;
    let mut payload: McQuestionsPayload = serde_json::from_value(normalised)
        .map_err(|e| AppError::new("MODEL_PARSE_ERROR", format!("Schema mismatch: {e}")))?;

    normalise_mc(&mut payload.questions, selected_subs);
    validate_mc(&payload.questions, request.question_count)?;

    match tech_mode {
        "tech-free"   => payload.questions.iter_mut().for_each(|q| q.tech_allowed = false),
        "tech-active" => payload.questions.iter_mut().for_each(|q| q.tech_allowed = true),
        _ => {}
    }

    let texts: Vec<String> = payload.questions.iter().map(|q| {
        let opts = q.options.iter().map(|o| format!("{}: {}", o.label, o.text)).collect::<Vec<_>>().join(" ");
        format!("{} {opts}", q.prompt_markdown)
    }).collect();
    let (scores, summary) = score_batch(&texts);
    for (q, (d, m)) in payload.questions.iter_mut().zip(scores) {
        q.distinctness_score = Some(d);
        q.multi_step_depth   = Some(m);
    }

    let duration_ms = started.elapsed().as_millis() as u64;
    let _ = app.emit("generation-status", serde_json::json!({
        "mode": "multiple-choice", "stage": "completed",
        "message": format!("Done in {duration_ms}ms.")
    }));

    Ok(GenerateMcQuestionsResponse {
        questions: payload.questions,
        duration_ms,
        distinctness_avg: summary.distinctness_avg,
        multi_step_depth_avg: summary.multi_step_depth_avg,
    })
}

// ─── Tauri command: mark answer ───────────────────────────────────────────────

#[tauri::command]
async fn mark_answer(request: MarkAnswerRequest) -> CommandResult<MarkAnswerResponse> {
    let has_text  = !request.student_answer.trim().is_empty();
    let has_image = request.student_answer_image_data_url.as_ref()
        .map_or(false, |v| !v.trim().is_empty());
    if !has_text && !has_image {
        return Err(AppError::new("VALIDATION_ERROR", "Provide an answer or image."));
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

    // Normalise + truncate student answer
    const MAX_ANSWER_CHARS: usize = 12_000;
    let mut answer = request.student_answer
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

    let is_chem = request.question.topic.trim().eq_ignore_ascii_case(CHEMISTRY_TOPIC);
    let chem_note = if is_chem { CHEMISTRY_LATEX_GUIDANCE } else { "" };

    let prompt = format!(
        "Topic: {topic}\nQuestion: {question}\nMax marks: {max}\n\n\
         Student answer:\n{answer}\n\n\
         Mark using VCAA criterion marking. Only mark what is explicitly stated — do not infer unstated working.\n\
         Conciseness limits: comparisonToSolution ≤120 words, feedback ≤120 words, workedSolution ≤180 words, each rationale ≤45 words.\
         {chem_note}",
        topic    = request.question.topic,
        question = request.question.prompt_markdown,
        max      = request.question.max_marks,
        answer   = answer,
        chem_note = chem_note,
    );

    // Build user content (text-only or multimodal)
    let user_content = match request.student_answer_image_data_url.as_deref()
        .map(str::trim).filter(|v| !v.is_empty())
    {
        None => serde_json::Value::String(prompt.clone()),
        Some(url) => {
            if !url.starts_with("data:image/") {
                return Err(AppError::new("VALIDATION_ERROR", "Image must be a valid data URL."));
            }
            serde_json::json!([
                { "type": "text",      "text": prompt },
                { "type": "image_url", "image_url": { "url": url } }
            ])
        }
    };

    let system = format!(
        "You are a strict but constructive VCE marker. Assess student answers fairly.{LATEX_RULES}"
    );

    let raw = call_openrouter(
        &request.api_key, &request.model, &system, user_content, &marking_format(),
    ).await?;

    let json_str = extract_json_object(&raw)
        .ok_or_else(|| AppError::new("MODEL_PARSE_ERROR",
            format!("No JSON in marking response. Raw:\n{}", &raw.chars().take(800).collect::<String>())))?;

    let mut parsed: MarkAnswerResponse = serde_json::from_str(&json_str)
        .map_err(|e| AppError::new("MODEL_PARSE_ERROR", format!("Marking schema mismatch: {e}")))?;

    // Clamp / fix marks
    parsed.max_marks = if request.question.max_marks > 0 { request.question.max_marks } else { 10 };
    parsed.achieved_marks = parsed.achieved_marks.min(parsed.max_marks);

    if !parsed.vcaa_marking_scheme.is_empty() {
        let scheme_total: u8 = parsed.vcaa_marking_scheme.iter()
            .map(|c| c.achieved_marks)
            .fold(0u16, |a, b| a + b as u16)
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

    // Decode literal \n sequences in text fields
    parsed.feedback_markdown             = clean_field(&parsed.feedback_markdown);
    parsed.worked_solution_markdown      = clean_field(&parsed.worked_solution_markdown);
    parsed.comparison_to_solution_markdown = clean_field(&parsed.comparison_to_solution_markdown);
    for c in &mut parsed.vcaa_marking_scheme {
        c.criterion = clean_field(&c.criterion);
        c.rationale = clean_field(&c.rationale);
    }

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
    let mime = path.extension()
        .and_then(|e| e.to_str())
        .and_then(|e| match e.to_ascii_lowercase().as_str() {
            "jpg"|"jpeg" => Some("image/jpeg"),
            "png"        => Some("image/png"),
            "webp"       => Some("image/webp"),
            "gif"        => Some("image/gif"),
            "heic"       => Some("image/heic"),
            "heif"       => Some("image/heif"),
            _            => None,
        })
        .ok_or_else(|| AppError::new("VALIDATION_ERROR",
            "Unsupported format. Use png, jpg, webp, gif, heic, or heif."))?;

    let bytes = std::fs::read(path)
        .map_err(|e| AppError::new("IO_ERROR", format!("Failed to read image: {e}")))?;
    let data_url = format!("data:{mime};base64,{}", general_purpose::STANDARD.encode(bytes));

    let prompt = request.prompt.as_deref().filter(|v| !v.trim().is_empty())
        .unwrap_or("What's in this image?");

    // analyze_image has no structured output requirement — free-form text response.
    // We still pass a minimal response_format to satisfy the required parameter.
    let free_text_format = json_schema_format("text_response", serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["text"],
        "properties": { "text": { "type": "string" } }
    }));

    let raw = call_openrouter(
        &request.api_key, &request.model,
        "You are a helpful visual reasoning assistant.",
        serde_json::json!([
            { "type": "text",      "text": prompt },
            { "type": "image_url", "image_url": { "url": data_url } }
        ]),
        &free_text_format,
    ).await?;

    // Extract the text field if JSON, otherwise use raw.
    let output_text = serde_json::from_str::<serde_json::Value>(&raw)
        .ok()
        .and_then(|v| v.get("text").and_then(|t| t.as_str()).map(str::to_string))
        .unwrap_or(raw);

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
            id: "q1".into(), topic: "Mathematical Methods".into(), subtopic: None,
            prompt_markdown: "Find the derivative.".into(), max_marks: 4,
            tech_allowed: false, distinctness_score: None, multi_step_depth: None,
        }];
        assert!(validate_written(&questions, 2).is_err());
    }

    #[test]
    fn validate_mc_rejects_bad_labels() {
        let questions = vec![McQuestion {
            id: "mc1".into(), topic: "Chemistry".into(), subtopic: None,
            prompt_markdown: "Question?".into(),
            options: vec![
                McOption { label: "A".into(), text: "1".into() },
                McOption { label: "B".into(), text: "2".into() },
                McOption { label: "C".into(), text: "3".into() },
                McOption { label: "E".into(), text: "4".into() }, // invalid
            ],
            correct_answer: "A".into(), explanation_markdown: "Because.".into(),
            tech_allowed: false, distinctness_score: None, multi_step_depth: None,
        }];
        assert!(validate_mc(&questions, 1).is_err());
    }
}
