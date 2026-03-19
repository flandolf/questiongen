use crate::command_terms::{infer_prompt_term, is_math_topic};
use crate::models::{AppError, CommandResult, GeneratedQuestion, McQuestion, default_max_marks};

// ─── JSON object extraction ───────────────────────────────────────────────────

/// Extract the first valid JSON object from raw model output.
/// With Response Healing enabled this is rarely needed, but kept as a safety net.
pub fn extract_json_object(content: &str) -> Option<String> {
    let s = content.trim();

    // Already a clean object.
    if s.starts_with('{') {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(s) {
            if v.is_object() { return Some(s.to_string()); }
        }
    }

    // Strip ```json ... ``` fences.
    let fence = s
        .strip_prefix("```json").or_else(|| s.strip_prefix("```"))
        .map(|s| s.trim_start_matches('\n'))
        .and_then(|s| s.strip_suffix("```"))
        .map(str::trim);
    if let Some(inner) = fence {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(inner) {
            if v.is_object() { return Some(inner.to_string()); }
        }
    }

    // Scan for the first parseable object.
    for (i, ch) in content.char_indices() {
        if ch != '{' { continue; }
        let slice = &content[i..];
        let mut iter = serde_json::Deserializer::from_str(slice).into_iter::<serde_json::Value>();
        if let Some(Ok(v)) = iter.next() {
            if v.is_object() {
                let end = i + iter.byte_offset();
                return content.get(i..end).map(str::to_string);
            }
        }
    }
    None
}

// ─── Envelope normalisation ───────────────────────────────────────────────────

/// Accept `[...]`, `{"questions":[...]}`, or common wrapper variants.
pub fn normalize_envelope(value: serde_json::Value) -> Result<serde_json::Value, String> {
    if value.is_array() {
        return Ok(serde_json::json!({ "questions": value }));
    }
    let serde_json::Value::Object(mut map) = value else {
        return Err("Top-level JSON must be an object or array.".into());
    };
    if map.get("questions").map(|v| v.is_array()).unwrap_or(false) {
        return Ok(serde_json::Value::Object(map));
    }
    // Alternate keys
    for key in ["question","items","mcQuestions","multipleChoiceQuestions","generatedQuestions"] {
        if let Some(arr) = map.remove(key).filter(|v| v.is_array()) {
            map.insert("questions".into(), arr);
            return Ok(serde_json::Value::Object(map));
        }
    }
    // Nested wrapper
    for key in ["data","result","output","payload"] {
        if let Some(serde_json::Value::Object(nested)) = map.get(key) {
            if let Some(arr) = nested.get("questions").filter(|v| v.is_array()).cloned() {
                map.insert("questions".into(), arr);
                return Ok(serde_json::Value::Object(map));
            }
        }
    }
    Err(format!("No questions array found. Keys: [{}].", map.keys().cloned().collect::<Vec<_>>().join(", ")))
}

// ─── Decode literal escape sequences ─────────────────────────────────────────

/// Convert literal `\n` / `\r\n` to real newlines while preserving LaTeX commands.
pub fn decode_escapes(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '\\' && i + 1 < chars.len() {
            // \r\n → newline
            if i + 3 < chars.len() && chars[i+1] == 'r' && chars[i+2] == '\\' && chars[i+3] == 'n' {
                out.push('\n'); i += 4; continue;
            }
            // \n → newline unless followed by a lowercase letter (LaTeX command like \nabla)
            if chars[i+1] == 'n' {
                if chars.get(i+2).map_or(false, |c| c.is_ascii_lowercase()) {
                    out.push('\\'); out.push('n');
                } else {
                    out.push('\n');
                }
                i += 2; continue;
            }
        }
        out.push(chars[i]); i += 1;
    }
    out
}

// ─── Normalise + validate written questions ───────────────────────────────────

pub fn normalise_written(
    questions: &mut [GeneratedQuestion],
    selected_subtopics: Option<&Vec<String>>,
    priority_terms: &[&'static crate::models::CommandTermProfile],
) {
    let sole_subtopic = selected_subtopics
        .filter(|s| s.len() == 1)
        .and_then(|s| s.first());

    for q in questions.iter_mut() {
        q.id = q.id.trim().into();
        q.topic = q.topic.trim().into();
        q.prompt_markdown = decode_escapes(q.prompt_markdown.trim());
        q.subtopic = q.subtopic.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
            .or_else(|| sole_subtopic.cloned());

        let marks = if q.max_marks == 0 { default_max_marks() } else { q.max_marks };
        q.max_marks = if let Some(p) = infer_prompt_term(&q.prompt_markdown) {
            marks.clamp(p.min_marks, p.max_marks)
        } else if let Some(p) = priority_terms.first() {
            marks.clamp(p.min_marks, p.max_marks)
        } else {
            marks
        }.clamp(1, 30);
    }
}

pub fn validate_written(
    questions: &[GeneratedQuestion],
    expected: usize,
    priority_terms: &[&'static crate::models::CommandTermProfile],
) -> CommandResult<()> {
    if questions.len() != expected {
        return Err(AppError::new("VALIDATION_ERROR", format!(
            "Expected {expected} questions, got {}.", questions.len())));
    }
    for q in questions {
        if q.id.is_empty() { return Err(AppError::new("VALIDATION_ERROR", "Question missing id.")); }
        if q.topic.is_empty() { return Err(AppError::new("VALIDATION_ERROR", "Question missing topic.")); }
        if q.prompt_markdown.is_empty() {
            return Err(AppError::new("VALIDATION_ERROR", format!("Q{} has empty prompt.", q.id)));
        }
        if q.max_marks == 0 || q.max_marks > 30 {
            return Err(AppError::new("VALIDATION_ERROR", format!("Q{} has invalid maxMarks.", q.id)));
        }
        if priority_terms.len() == 1 && !is_math_topic(&q.topic) {
            let required = priority_terms[0].key;
            if infer_prompt_term(&q.prompt_markdown).map(|p| p.key) != Some(required) {
                return Err(AppError::new("VALIDATION_ERROR", format!(
                    "Q{} must start with '{}'.", q.id, priority_terms[0].display)));
            }
        }
    }
    Ok(())
}

// ─── Normalise + validate MC questions ───────────────────────────────────────

const MC_MAX_EXPLANATION_WORDS: usize = 90;

const DISALLOWED_SELF_TALK: &[&str] = &[
    "let's","let us","i will","i'll","wait,","not in options","error in options",
    "to make it work","change the question","adjust the question","revised prompt","i'll update",
];

pub fn normalise_mc(questions: &mut [McQuestion], selected_subtopics: Option<&Vec<String>>) {
    let sole_subtopic = selected_subtopics
        .filter(|s| s.len() == 1)
        .and_then(|s| s.first());

    for q in questions.iter_mut() {
        q.id = q.id.trim().into();
        q.topic = q.topic.trim().into();
        q.prompt_markdown = decode_escapes(q.prompt_markdown.trim());
        q.explanation_markdown = decode_escapes(q.explanation_markdown.trim());
        q.correct_answer = q.correct_answer.trim().to_uppercase();
        q.subtopic = q.subtopic.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
            .or_else(|| sole_subtopic.cloned());
        for opt in &mut q.options {
            opt.label = opt.label.trim().to_uppercase();
            opt.text = decode_escapes(opt.text.trim());
        }
    }
}

pub fn validate_mc(questions: &[McQuestion], expected: usize) -> CommandResult<()> {
    if questions.len() != expected {
        return Err(AppError::new("VALIDATION_ERROR", format!(
            "Expected {expected} MC questions, got {}.", questions.len())));
    }
    for q in questions {
        if q.id.is_empty() { return Err(AppError::new("VALIDATION_ERROR", "MC question missing id.")); }
        if q.topic.is_empty() { return Err(AppError::new("VALIDATION_ERROR", format!("Q{} missing topic.", q.id))); }
        if q.prompt_markdown.is_empty() { return Err(AppError::new("VALIDATION_ERROR", format!("Q{} empty prompt.", q.id))); }
        if q.explanation_markdown.is_empty() { return Err(AppError::new("VALIDATION_ERROR", format!("Q{} empty explanation.", q.id))); }

        let words = q.explanation_markdown.split_whitespace().count();
        if words > MC_MAX_EXPLANATION_WORDS {
            return Err(AppError::new("VALIDATION_ERROR", format!(
                "Q{} explanation too long ({words} words; max {MC_MAX_EXPLANATION_WORDS}).", q.id)));
        }
        let low = q.explanation_markdown.to_lowercase();
        if DISALLOWED_SELF_TALK.iter().any(|m| low.contains(m)) {
            return Err(AppError::new("VALIDATION_ERROR", format!("Q{} explanation contains self-talk.", q.id)));
        }
        if q.options.len() != 4 {
            return Err(AppError::new("VALIDATION_ERROR", format!("Q{} must have exactly 4 options.", q.id)));
        }
        let mut labels: Vec<_> = q.options.iter().map(|o| o.label.clone()).collect();
        labels.sort();
        if labels != ["A","B","C","D"] {
            return Err(AppError::new("VALIDATION_ERROR", format!("Q{} options must be labeled A, B, C, D.", q.id)));
        }
        if !matches!(q.correct_answer.as_str(), "A"|"B"|"C"|"D") {
            return Err(AppError::new("VALIDATION_ERROR", format!("Q{} invalid correctAnswer.", q.id)));
        }
    }
    Ok(())
}
