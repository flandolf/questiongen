use crate::models::{AppError, CommandResult, GeneratedQuestion, McQuestion, default_max_marks};

// --- JSON object extraction ---------------------------------------------------

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

// --- Envelope normalisation ---------------------------------------------------

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
    for key in ["question","items","mcQuestions","multipleChoiceQuestions","generatedQuestions"] {
        if let Some(arr) = map.remove(key).filter(|v| v.is_array()) {
            map.insert("questions".into(), arr);
            return Ok(serde_json::Value::Object(map));
        }
    }
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

// --- Text post-processing pipeline -------------------------------------------
//
// Every markdown field from the model goes through:
//   decode_escapes -> sanitise_latex
//
// decode_escapes handles JSON-level escape artefacts (\n, \r\n).
// sanitise_latex handles LaTeX-level issues (wrong delimiters, currency $).

/// Convert literal `\n` / `\r\n` sequences to real newlines.
/// Preserves LaTeX commands like `\nabla` by checking the character after `\n`.
pub fn decode_escapes(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '\\' && i + 1 < chars.len() {
            if i + 3 < chars.len()
                && chars[i+1] == 'r'
                && chars[i+2] == '\\'
                && chars[i+3] == 'n'
            {
                out.push('\n'); i += 4; continue;
            }
            if chars[i+1] == 'n' {
                if chars.get(i+2).map_or(false, |c| c.is_ascii_lowercase()) {
                    // LaTeX command like \nabla — keep the backslash
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

/// Normalise LaTeX delimiters and protect currency dollar signs.
///
/// Applied to every markdown field after `decode_escapes`. Steps in order:
///
/// 1. Un-double escaped delimiter chars that lenient JSON parsers leave as-is:
///    `\\(` -> `\(`  etc.
///
/// 2. Convert `\(...\)` -> `$...$`  and  `\[...\]` -> `$$...$$`.
///    MathJax is configured with only `$`/`$$` as delimiters so `\(\)` and
///    `\[\]` would be rendered as literal text.
///
/// 3. Protect currency: a bare `$` immediately before an ASCII digit that is
///    not part of a `$$` display pair is replaced with `\$`.  MathJax on the
///    frontend already handles `\$` as a literal dollar sign outside math mode.
///    The heuristic is safe because real inline math opening with a digit
///    (`$3x+1$`) always has a matching closing `$` on the same token — the
///    model is instructed never to use `$` for currency, but this catches the
///    cases where it does anyway.
pub fn sanitise_latex(text: &str) -> String {
    // Step 1: undo double-escaping of delimiter chars
    let s = text
        .replace("\\\\(", "\\(")
        .replace("\\\\)", "\\)")
        .replace("\\\\[", "\\[")
        .replace("\\\\]", "\\]");

    // Step 2: convert paren/bracket delimiters to $ delimiters
    let s = convert_paren_delimiters(&s);

    // Step 3: protect bare currency dollars
    protect_currency_dollars(&s)
}

/// Replace `\(...\)` with `$...$` and `\[...\]` with `$$...$$`.
///
/// Operates on `&str` slices (not raw bytes) so multi-byte UTF-8 characters
/// are always copied correctly.
fn convert_paren_delimiters(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while !rest.is_empty() {
        // Look for the next backslash.
        match rest.find('\\') {
            None => {
                out.push_str(rest);
                break;
            }
            Some(bs) => {
                // Copy everything before the backslash verbatim.
                out.push_str(&rest[..bs]);
                let after = &rest[bs + 1..];
                if after.starts_with('(') {
                    let inner_start = bs + 2;
                    if let Some(close) = rest[inner_start..].find("\\)") {
                        let inner = &rest[inner_start..inner_start + close];
                        out.push('$');
                        out.push_str(inner);
                        out.push('$');
                        rest = &rest[inner_start + close + 2..];
                        continue;
                    }
                } else if after.starts_with('[') {
                    let inner_start = bs + 2;
                    if let Some(close) = rest[inner_start..].find("\\]") {
                        let inner = &rest[inner_start..inner_start + close];
                        out.push_str("$$");
                        out.push_str(inner);
                        out.push_str("$$");
                        rest = &rest[inner_start + close + 2..];
                        continue;
                    }
                }
                // Not a recognised delimiter — emit the backslash and advance one char.
                out.push('\\');
                rest = after;
            }
        }
    }
    out
}


/// Replace bare `$` immediately before a digit (not part of `$$`) with `\$`.
fn protect_currency_dollars(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len() + 8);
    for (i, &ch) in chars.iter().enumerate() {
        if ch == '$' {
            let prev_dollar = i > 0 && chars[i - 1] == '$';
            let next_dollar = chars.get(i + 1) == Some(&'$');
            let next_digit  = chars.get(i + 1).map_or(false, |c| c.is_ascii_digit());
            if !prev_dollar && !next_dollar && next_digit {
                out.push_str("\\$");
                continue;
            }
        }
        out.push(ch);
    }
    out
}

// --- Full pipeline convenience -----------------------------------------------

/// Run the full decode -> sanitise pipeline on a single field.
///
/// Steps: decode JSON escape artefacts → normalise typography → sanitise LaTeX.
pub fn clean_field(s: &str) -> String {
    sanitise_latex(&normalise_typography(&decode_escapes(s)))
}

/// Replace Unicode typographic characters with their plain ASCII equivalents.
///
/// Models frequently emit "smart" quotes, em-dashes, and ellipses from their
/// training data. These render fine in most contexts but can appear as mojibake
/// (e.g. â\x80\x99 instead of \') when a downstream renderer misidentifies the
/// encoding, and they add no value in exam question text.
fn normalise_typography(s: &str) -> String {
    s
        // Curly single quotes  → straight apostrophe
        .replace('\u{2018}', "'")   // LEFT  SINGLE QUOTATION MARK  '
        .replace('\u{2019}', "'")   // RIGHT SINGLE QUOTATION MARK  '
        // Curly double quotes  → straight double quote
        .replace('\u{201C}', "\"")   // LEFT  DOUBLE QUOTATION MARK  "
        .replace('\u{201D}', "\"")   // RIGHT DOUBLE QUOTATION MARK  "
        // Dashes
        .replace('\u{2013}', "--")   // EN DASH  –
        .replace('\u{2014}', "--")   // EM DASH  —
        // Ellipsis
        .replace('\u{2026}', "...")  // HORIZONTAL ELLIPSIS  …
}

// --- Normalise + validate written questions ----------------------------------

pub fn normalise_written(
    questions: &mut [GeneratedQuestion],
    selected_subtopics: Option<&Vec<String>>,
) {
    let sole_subtopic = selected_subtopics
        .filter(|s| s.len() == 1)
        .and_then(|s| s.first());

    for (idx, q) in questions.iter_mut().enumerate() {
        q.id    = format!("q{}", idx + 1);
        q.topic = q.topic.trim().into();
        q.prompt_markdown = clean_field(q.prompt_markdown.trim());
        q.subtopic = q.subtopic.as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| sole_subtopic.cloned());

        let marks = if q.max_marks == 0 { default_max_marks() } else { q.max_marks };
        q.max_marks = marks.clamp(1, 30);
    }
}

pub fn validate_written(
    questions: &[GeneratedQuestion],
    expected: usize,
) -> CommandResult<()> {
    if questions.len() != expected {
        return Err(AppError::new("VALIDATION_ERROR", format!(
            "Expected {expected} questions, got {}.", questions.len())));
    }
    for q in questions {
        if q.topic.is_empty() {
            return Err(AppError::new("VALIDATION_ERROR", "Question missing topic."));
        }
        if q.prompt_markdown.is_empty() {
            return Err(AppError::new("VALIDATION_ERROR", format!("Q{} has empty prompt.", q.id)));
        }
        if q.max_marks == 0 || q.max_marks > 30 {
            return Err(AppError::new("VALIDATION_ERROR", format!("Q{} has invalid maxMarks.", q.id)));
        }
    }
    Ok(())
}

// --- Normalise + validate MC questions ----------------------------------------

const MC_MAX_EXPLANATION_WORDS: usize = 90;

const DISALLOWED_SELF_TALK: &[&str] = &[
    "let's","let us","i will","i'll","wait,","not in options","error in options",
    "to make it work","change the question","adjust the question","revised prompt","i'll update",
];

pub fn normalise_mc(questions: &mut [McQuestion], selected_subtopics: Option<&Vec<String>>) {
    let sole_subtopic = selected_subtopics
        .filter(|s| s.len() == 1)
        .and_then(|s| s.first());

    for (idx, q) in questions.iter_mut().enumerate() {
        q.id    = format!("mc{}", idx + 1);
        q.topic = q.topic.trim().into();
        q.prompt_markdown      = clean_field(q.prompt_markdown.trim());
        q.explanation_markdown = clean_field(q.explanation_markdown.trim());
        q.correct_answer       = q.correct_answer.trim().to_uppercase();
        q.subtopic = q.subtopic.as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| sole_subtopic.cloned());
        for opt in &mut q.options {
            opt.label = opt.label.trim().to_uppercase();
            opt.text  = clean_field(opt.text.trim());
        }
    }
}

pub fn validate_mc(questions: &[McQuestion], expected: usize) -> CommandResult<()> {
    if questions.len() != expected {
        return Err(AppError::new("VALIDATION_ERROR", format!(
            "Expected {expected} MC questions, got {}.", questions.len())));
    }
    for q in questions {
        if q.topic.is_empty() {
            return Err(AppError::new("VALIDATION_ERROR", format!("Q{} missing topic.", q.id)));
        }
        if q.prompt_markdown.is_empty() {
            return Err(AppError::new("VALIDATION_ERROR", format!("Q{} empty prompt.", q.id)));
        }
        if q.explanation_markdown.is_empty() {
            return Err(AppError::new("VALIDATION_ERROR", format!("Q{} empty explanation.", q.id)));
        }
        let words = q.explanation_markdown.split_whitespace().count();
        if words > MC_MAX_EXPLANATION_WORDS {
            return Err(AppError::new("VALIDATION_ERROR", format!(
                "Q{} explanation too long ({words} words; max {MC_MAX_EXPLANATION_WORDS}).", q.id)));
        }
        let low = q.explanation_markdown.to_lowercase();
        if DISALLOWED_SELF_TALK.iter().any(|m| low.contains(m)) {
            return Err(AppError::new("VALIDATION_ERROR",
                format!("Q{} explanation contains self-talk.", q.id)));
        }
        if q.options.len() != 4 {
            return Err(AppError::new("VALIDATION_ERROR",
                format!("Q{} must have exactly 4 options.", q.id)));
        }
        let mut labels: Vec<_> = q.options.iter().map(|o| o.label.clone()).collect();
        labels.sort();
        if labels != ["A","B","C","D"] {
            return Err(AppError::new("VALIDATION_ERROR",
                format!("Q{} options must be labeled A, B, C, D.", q.id)));
        }
        if !matches!(q.correct_answer.as_str(), "A"|"B"|"C"|"D") {
            return Err(AppError::new("VALIDATION_ERROR",
                format!("Q{} invalid correctAnswer.", q.id)));
        }
    }
    Ok(())
}

// --- Tests -------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_paren_inline() {
        assert_eq!(sanitise_latex("Value is \\(x^2\\)."), "Value is $x^2$.");
    }

    #[test]
    fn converts_bracket_display() {
        assert_eq!(sanitise_latex("\\[E = mc^2\\]"), "$$E = mc^2$$");
    }

    #[test]
    fn protects_currency_dollar() {
        assert_eq!(sanitise_latex("costs $50 today"), "costs \\$50 today");
    }

    #[test]
    fn does_not_mangle_math_dollar() {
        // $x^2$ is math — the $ before x is a letter, not a digit
        assert_eq!(sanitise_latex("solve $x^2 = 4$"), "solve $x^2 = 4$");
    }

    #[test]
    fn does_not_mangle_display_math() {
        assert_eq!(sanitise_latex("$$E = mc^2$$"), "$$E = mc^2$$");
    }

    #[test]
    fn double_escaped_paren_normalised() {
        // \\( as two chars (backslash backslash open-paren) -> \( -> $
        assert_eq!(sanitise_latex("\\\\(x\\\\)"), "$x$");
    }

    #[test]
    fn currency_followed_by_display_math_not_mangled() {
        // $$ is display math, not currency
        assert_eq!(sanitise_latex("$$x = 1$$"), "$$x = 1$$");
    }

    #[test]
    fn smart_quotes_normalised_to_ascii() {
        assert_eq!(clean_field("it’s Newton‘s law"), "it's Newton's law");
    }


    #[test]
    fn em_dash_normalised() {
        assert_eq!(clean_field("speed—velocity"), "speed--velocity");
    }

    #[test]
    fn ellipsis_normalised() {
        assert_eq!(clean_field("and so on…"), "and so on...");
    }

    #[test]
    fn non_ascii_passthrough_unaffected() {
        // Greek letters and accented chars outside the replacement set pass through
        assert_eq!(clean_field("café αβγ"), "café αβγ");
    }
}
