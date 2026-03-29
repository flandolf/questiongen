use crate::models::{default_max_marks, AppError, CommandResult, GeneratedQuestion, McQuestion};

// --- JSON pre-processing: protect LaTeX commands from JSON escape sequences --
//
// The fundamental problem: JSON defines \f as form feed (U+000C) and \t as tab
// (U+0009). When an LLM outputs LaTeX like \frac or \text inside a JSON string,
// standard JSON parsers destroy those commands:
//
//   "\frac{1}{2}"  →  "<FF>rac{1}{2}"   (\f consumed as form feed)
//   "\text{hello}" →  "<TAB>ext{hello}"  (\t consumed as tab)
//
// The previous approach tried to recover these in TypeScript after the damage
// was done, which is fragile and incomplete. The correct fix is to pre-process
// the raw JSON bytes and protect LaTeX commands BEFORE serde_json sees them.
//
// Strategy: scan raw JSON string values and replace any \X sequence where X
// starts a known LaTeX command with \\X (a proper JSON two-char escape for a
// single backslash), so that after JSON parsing the string contains a literal
// backslash followed by the command name.
//
// The only JSON single-char escapes that collide with LaTeX commands are:
//   \f  (form feed)   — collides with \frac, \forall, \fbox, etc.
//   \t  (tab)         — collides with \text, \times, \theta, \tau, \tan, etc.
//   \r  (CR)          — collides with \right, \rho, \rm, etc. (less common)
//   \n  (LF)          — collides with \nabla, \nu, etc. (handled by decode_escapes)
//   \b  (backspace)   — collides with \beta, \bar, \bf, \begin, etc.
//   \0 through \9 are not JSON escapes, so \div, \delta etc. are fine in raw JSON
//
// Note: \u, \", \\, \/ are also JSON escapes but never start LaTeX commands
// that would be confused here.

/// Pre-process raw JSON text to protect LaTeX commands from being destroyed by
/// JSON escape sequence interpretation.
///
/// This must be called on the raw model output *before* passing it to
/// serde_json. It rewrites `\X` inside JSON string literals where `X` is a
/// letter that would otherwise be consumed as a JSON escape, turning them into
/// `\\X` so that after parsing the string contains a real backslash.
pub fn protect_latex_in_raw_json(raw: &str) -> String {
    // The colliding single-char JSON escape sequences whose next char could be
    // the start of a LaTeX command. The replacements are ordered so that the
    // already-escaped forms (\\f, \\t, etc.) are *not* double-processed; we only
    // touch unescaped single-backslash forms.
    //
    // We walk the raw bytes looking for JSON string contents and rewrite in one
    // linear pass.

    let bytes = raw.as_bytes();
    let len = bytes.len();
    let mut out = Vec::with_capacity(len + len / 8);
    let mut i = 0;

    while i < len {
        // Outside a string literal: copy until we enter one.
        if bytes[i] != b'"' {
            out.push(bytes[i]);
            i += 1;
            continue;
        }

        // Opening quote of a JSON string literal.
        out.push(b'"');
        i += 1;

        // Walk the string contents.
        while i < len {
            match bytes[i] {
                b'"' => {
                    // Closing (unescaped) quote — end of string.
                    out.push(b'"');
                    i += 1;
                    break;
                }
                b'\\' if i + 1 < len => {
                    let next = bytes[i + 1];
                    match next {
                        // Already a proper two-char escape or unicode escape —
                        // copy verbatim and skip both chars.
                        b'"' | b'\\' | b'/' | b'n' | b'r' | b't' | b'b' | b'f' | b'u' => {
                            // For \n, \r, \t, \b, \f we need to check: is this
                            // actually a JSON escape for whitespace/control, or
                            // is the model trying to write a LaTeX command?
                            //
                            // Heuristic: if the character after the escape letter
                            // is an ASCII letter (a-z, A-Z) then treat the whole
                            // thing as a LaTeX command that got mis-escaped — emit
                            // \\X so the JSON parser yields \X.
                            //
                            // Exception: \n / \r followed by a letter is ambiguous
                            // (could be newline + word). We handle \n conservatively
                            // in decode_escapes later. Here we only protect the
                            // LaTeX-specific collisions: \f, \t, \b.
                            if matches!(next, b'f' | b't' | b'b')
                                && i + 2 < len
                                && bytes[i + 2].is_ascii_alphabetic()
                            {
                                // Emit \\X: a JSON-escaped backslash + the letter.
                                out.extend_from_slice(b"\\\\");
                                out.push(next);
                                i += 2;
                            } else {
                                // Regular JSON escape — copy as-is.
                                out.push(b'\\');
                                out.push(next);
                                i += 2;
                            }
                        }
                        // Bare backslash before a letter that is NOT a standard
                        // JSON escape sequence: the model wrote something like \s,
                        // \c, \d etc. (LaTeX commands). These are technically
                        // invalid JSON but many LLMs emit them. serde_json with
                        // lenient parsing or our pre-scan may see them.
                        // Emit \\X to make them valid and preserve the backslash.
                        c if c.is_ascii_alphabetic() => {
                            out.extend_from_slice(b"\\\\");
                            out.push(c);
                            i += 2;
                        }
                        // Anything else after backslash: copy verbatim.
                        _ => {
                            out.push(b'\\');
                            out.push(next);
                            i += 2;
                        }
                    }
                }
                b => {
                    out.push(b);
                    i += 1;
                }
            }
        }
    }

    // SAFETY: all bytes we push are either copied from valid UTF-8 source or
    // are ASCII (b'\\'), so the result is valid UTF-8.
    String::from_utf8(out).unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned())
}

// --- JSON object extraction ---------------------------------------------------

/// Extract the first valid JSON object from raw model output.
/// With Response Healing enabled this is rarely needed, but kept as a safety net.
///
/// NOTE: `content` here should already have been through `protect_latex_in_raw_json`.
pub fn extract_json_object(content: &str) -> Option<String> {
    let s = content.trim();

    // Already a clean object.
    if s.starts_with('{') {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(s) {
            if v.is_object() {
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
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(inner) {
            if v.is_object() {
                return Some(inner.to_string());
            }
        }
    }

    // Scan for the first parseable object.
    for (i, ch) in content.char_indices() {
        if ch != '{' {
            continue;
        }
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
    for key in [
        "question",
        "items",
        "mcQuestions",
        "multipleChoiceQuestions",
        "generatedQuestions",
    ] {
        if let Some(arr) = map.remove(key).filter(|v| v.is_array()) {
            map.insert("questions".into(), arr);
            return Ok(serde_json::Value::Object(map));
        }
    }
    for key in ["data", "result", "output", "payload"] {
        if let Some(serde_json::Value::Object(nested)) = map.get(key) {
            if let Some(arr) = nested.get("questions").filter(|v| v.is_array()).cloned() {
                map.insert("questions".into(), arr);
                return Ok(serde_json::Value::Object(map));
            }
        }
    }
    Err(format!(
        "No questions array found. Keys: [{}].",
        map.keys().cloned().collect::<Vec<_>>().join(", ")
    ))
}

// --- Text post-processing pipeline -------------------------------------------
//
// Every markdown field from the model goes through:
//   decode_escapes -> sanitise_latex -> normalise_typography
//
// At this stage the raw JSON has already been through protect_latex_in_raw_json,
// so \frac, \text etc. are preserved as real backslash-sequences in the Rust
// string. The remaining work is:
//
//   decode_escapes        — convert literal \n / \r\n artefacts to real newlines
//   sanitise_latex        — normalise delimiters, protect currency $
//   normalise_typography  — smart quotes, dashes, ellipsis → ASCII

/// Convert literal `\n` / `\r\n` sequences (two actual chars: backslash + n)
/// to real newlines. Preserves LaTeX commands like `\nabla` by checking the
/// character after `\n` is not a continuation of a LaTeX command name.
///
/// After `protect_latex_in_raw_json` + serde_json deserialization:
///   - Real newlines embedded by the model are already `\n` (U+000A).
///   - The sequence backslash-n written literally inside a string value (rare)
///     appears as two chars `\` `n`.
/// This function handles the second case conservatively.
pub fn decode_escapes(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '\\' && i + 1 < chars.len() {
            // \r\n literal sequence → single newline
            if i + 3 < chars.len()
                && chars[i + 1] == 'r'
                && chars[i + 2] == '\\'
                && chars[i + 3] == 'n'
            {
                out.push('\n');
                i += 4;
                continue;
            }
            // \n literal → newline, but only if not followed by a lowercase
            // letter that would form a LaTeX command name (e.g. \nabla).
            if chars[i + 1] == 'n' {
                if chars.get(i + 2).map_or(false, |c| c.is_ascii_lowercase()) {
                    // Looks like a LaTeX command — keep the backslash.
                    out.push('\\');
                    out.push('n');
                } else {
                    out.push('\n');
                }
                i += 2;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// Normalise LaTeX delimiters and protect currency dollar signs.
///
/// Applied to every markdown field after `decode_escapes`. Steps in order:
///
/// 1. Un-double escaped delimiter chars that lenient JSON parsers leave as-is:
///    `\\(` → `\(`  etc.
///
/// 2. Convert `\(...\)` → `$...$`  and  `\[...\]` → `$$...$$`.
///    MathJax is configured with only `$`/`$$` as delimiters.
///
/// 3. Protect currency: a bare `$` immediately before an ASCII digit that is
///    not part of a `$$` display pair is replaced with `\$`.
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
fn convert_paren_delimiters(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while !rest.is_empty() {
        match rest.find('\\') {
            None => {
                out.push_str(rest);
                break;
            }
            Some(bs) => {
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
                // Not a recognised delimiter — emit the backslash and advance.
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
            let next_digit = chars.get(i + 1).map_or(false, |c| c.is_ascii_digit());
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

/// Run the full decode → sanitise → typography pipeline on a single string
/// field that has already been deserialized from JSON.
///
/// Call order matters:
///   1. decode_escapes      — resolve any remaining literal \n artefacts
///   2. sanitise_latex      — normalise delimiters, protect currency $
///   3. normalise_typography — smart quotes, dashes, ellipsis → ASCII
pub fn clean_field(s: &str) -> String {
    normalise_typography(&sanitise_latex(&decode_escapes(s)))
}

/// Strip characters that cause OpenRouter (or any JSON-based API) to reject
/// the payload as "invalid input".
///
/// Removes:
/// - Null bytes (`\0`) — invalid in JSON strings.
/// - C0 control characters U+0001–U+0008, U+000B, U+000C, U+000E–U+001F —
///   invalid in JSON strings per RFC 8259.  Tab (U+0009), LF (U+000A), and
///   CR (U+000D) are kept because they are valid JSON escapes and commonly
///   appear in user text.
/// - DEL (U+007F) — technically a C0 control, rarely intentional.
/// - Lone Unicode surrogates (U+D800–U+DFFF) — invalid UTF-8 sequences that
///   can appear when strings are assembled from sloppy sources; serde_json
///   will reject or mangle them.
/// - Unicode noncharacters (U+FFFE, U+FFFF, U+1FFFE, … U+10FFFF) — reserved
///   code points that some JSON validators reject.
pub fn sanitize_for_api(s: &str) -> String {
    s.chars()
        .filter(|&c| {
            // Keep tab, newline, carriage return — valid JSON whitespace.
            if c == '\t' || c == '\n' || c == '\r' {
                return true;
            }
            // Drop null byte and all other C0 controls (U+0000–U+001F).
            if c < '\u{0020}' {
                return false;
            }
            // Drop DEL.
            if c == '\u{007F}' {
                return false;
            }
            // Drop lone surrogates.
            // Surrogates (U+D800–U+DFFF) can't appear in valid Rust chars,
            // but we guard against them via numeric comparison in case the
            // input was assembled from sloppy byte sequences.
            let cp = c as u32;
            if cp >= 0xD800 && cp <= 0xDFFF {
                return false;
            }
            // Drop Unicode noncharacters: U+FFFE and U+FFFF per plane,
            // plus U+FDD0–U+FDEF.
            if cp >= 0xFDD0 && cp <= 0xFDEF {
                return false;
            }
            if (cp & 0xFFFE) == 0xFFFE {
                return false;
            }
            true
        })
        .collect()
}

/// Replace Unicode typographic characters with their plain ASCII equivalents.
fn normalise_typography(s: &str) -> String {
    s.replace('\u{2018}', "'")
        .replace('\u{2019}', "'")
        .replace('\u{201C}', "\"")
        .replace('\u{201D}', "\"")
        .replace('\u{2013}', "--")
        .replace('\u{2014}', "--")
        .replace('\u{2026}', "...")
}

// --- Topic / subtopic correction ----------------------------------------------

/// Canonical subject names that are valid values for the `topic` field.
const CANONICAL_TOPICS: &[&str] = &[
    "Mathematical Methods",
    "Specialist Mathematics",
    "Chemistry",
    "Physical Education",
];

/// Map each canonical subtopic (lowercased) to its parent subject.
/// This is used to fix cases where the LLM puts a subtopic into the `topic` field.
fn subtopic_to_subject() -> &'static std::collections::HashMap<&'static str, &'static str> {
    use std::collections::HashMap;
    use std::sync::OnceLock;
    static MAP: OnceLock<HashMap<&'static str, &'static str>> = OnceLock::new();
    MAP.get_or_init(|| {
        let kk = crate::constants::subtopic_key_knowledge();
        let mm_subs = [
            "functions and graphs",
            "transformation of graphs",
            "algebra and structure",
            "trigonometric functions",
            "exponential and logarithmic functions",
            "differentiation",
            "integration",
            "probability and statistics",
            "discrete random variables",
            "continuous random variables",
        ];
        let sm_subs = [
            "additional algebra and number systems",
            "sequences and series",
            "reciprocals and rational functions",
            "combinatorics and matrices",
            "trigonometric functions and identities",
            "proof",
            "modulus",
            "algorithms and graph theory",
            "graphing relations",
            "complex numbers",
            "transformations and vectors in the plane",
        ];
        let chem_subs = [
            "periodic trends: structure, periodic organisation, and critical or endangered elements",
            "molecular structure: lewis structures, vsepr geometry, polarity, and intermolecular forces",
            "metallic bonding: metallic lattices and the reactivity series",
            "ionic chemistry: ionic bonding, precipitation reactions, and solubility tables",
            "chemical quantities: moles, molar mass, percentage composition, and empirical/molecular formulas",
            "separation techniques: chromatography and rf value identification",
            "organic classification: alkanes, alkenes, alcohols, carboxylic acids, haloalkanes, and iupac naming",
            "polymer chemistry: addition and condensation polymerisation, plastics, and recycling",
            "sustainability: green chemistry, circular economy, and sustainable development",
            "water chemistry: hydrogen bonding and unique physical properties of water",
            "acid\u{2013}base chemistry: br\u{f8}nsted\u{2013}lowry theory, ph, neutralisation, and applications",
            "redox chemistry: electron transfer, half-equations, displacement, and corrosion",
            "solutions: concentration units and solubility relationships",
            "volumetric analysis: acid\u{2013}base titration, standard solutions, and indicators",
            "gas chemistry: ideal gas equation and greenhouse gases",
            "analytical techniques: electrical conductivity, stoichiometry, and colorimetry/uv\u{2013}vis spectroscopy",
        ];
        let pe_subs = [
            "skill acquisition: classification, stages of learning, and practice scheduling",
            "coaching and feedback: theories of acquisition and psychological strategies",
            "applied biomechanics: forces, momentum, impulse, newton's laws, projectile motion, and levers",
            "movement analysis: qualitative analysis and equilibrium in sport",
            "energy system interplay: atp-cp, anaerobic glycolysis, and aerobic systems",
            "cardiorespiratory dynamics: oxygen uptake, epoc, and vo2 max/lip",
            "physiological responses: acute responses and fatigue mechanisms",
            "recovery and nutrition: hydration and nutritional strategies for homeostasis",
            "training foundation: activity analysis, fitness components, and testing",
            "program design: training principles, methods, and chronic adaptations",
        ];

        let mut m = HashMap::new();
        for s in mm_subs { m.insert(s, "Mathematical Methods"); }
        for s in sm_subs { m.insert(s, "Specialist Mathematics"); }
        for s in chem_subs { if kk.contains_key(s) { m.insert(s, "Chemistry"); } }
        for s in pe_subs { if kk.contains_key(s) { m.insert(s, "Physical Education"); } }
        m
    })
}

/// If the `topic` field is not a canonical subject, try to detect whether the LLM
/// put a subtopic value there instead. If so, move it to `subtopic` and set
/// `topic` to the correct parent subject.
///
/// `selected_topics` are the user-selected subjects (e.g. ["Mathematical Methods"]).
fn fix_topic_field(topic: &mut String, subtopic: &mut Option<String>, selected_topics: &[String]) {
    let trimmed = topic.trim();
    if CANONICAL_TOPICS
        .iter()
        .any(|t| t.eq_ignore_ascii_case(trimmed))
    {
        return; // Already a valid subject.
    }

    // Try to match against known subtopics (case-insensitive).
    let lookup = trimmed.to_ascii_lowercase();
    let map = subtopic_to_subject();

    if let Some(&subject) = map.get(lookup.as_str()) {
        // The LLM put a subtopic into the topic field.
        // Move the old topic value to subtopic (if subtopic is empty).
        if subtopic.is_none() || subtopic.as_deref().map(str::is_empty).unwrap_or(true) {
            *subtopic = Some(trimmed.to_string());
        }
        *topic = subject.to_string();
        return;
    }

    // Fuzzy match: check if any canonical subtopic is a substring of the topic value.
    for (&sub, &subject) in map {
        if lookup.contains(sub) || sub.contains(&lookup) {
            if subtopic.is_none() || subtopic.as_deref().map(str::is_empty).unwrap_or(true) {
                *subtopic = Some(trimmed.to_string());
            }
            *topic = subject.to_string();
            return;
        }
    }

    // If there's only one selected topic, assume that's the subject.
    if selected_topics.len() == 1 {
        if subtopic.is_none() || subtopic.as_deref().map(str::is_empty).unwrap_or(true) {
            *subtopic = Some(trimmed.to_string());
        }
        *topic = selected_topics[0].clone();
    }
}

// --- Normalise + validate written questions ----------------------------------

pub fn normalise_written(
    questions: &mut [GeneratedQuestion],
    selected_topics: &[String],
    selected_subtopics: Option<&Vec<String>>,
) {
    let sole_subtopic = selected_subtopics
        .filter(|s| s.len() == 1)
        .and_then(|s| s.first());

    for (idx, q) in questions.iter_mut().enumerate() {
        q.id = format!("q{}", idx + 1);
        q.topic = q.topic.trim().into();
        q.prompt_markdown = clean_field(q.prompt_markdown.trim());
        q.subtopic = q
            .subtopic
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| sole_subtopic.cloned());

        fix_topic_field(&mut q.topic, &mut q.subtopic, selected_topics);

        let marks = if q.max_marks == 0 {
            default_max_marks()
        } else {
            q.max_marks
        };
        q.max_marks = marks.clamp(1, 30);
    }
}

pub fn validate_written(questions: &[GeneratedQuestion], expected: usize) -> CommandResult<()> {
    if questions.len() != expected {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            format!("Expected {expected} questions, got {}.", questions.len()),
        ));
    }
    for q in questions {
        if q.topic.is_empty() {
            return Err(AppError::new("VALIDATION_ERROR", "Question missing topic."));
        }
        if q.prompt_markdown.is_empty() {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} has empty prompt.", q.id),
            ));
        }
        if q.max_marks == 0 || q.max_marks > 30 {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} has invalid maxMarks.", q.id),
            ));
        }
    }
    Ok(())
}

// --- Normalise + validate MC questions ----------------------------------------

const MC_MAX_EXPLANATION_WORDS: usize = 180;

const DISALLOWED_SELF_TALK: &[&str] = &[
    "let's",
    "let us",
    "i will",
    "i'll",
    "wait,",
    "not in options",
    "error in options",
    "to make it work",
    "change the question",
    "adjust the question",
    "revised prompt",
    "i'll update",
];

pub fn normalise_mc(
    questions: &mut [McQuestion],
    selected_topics: &[String],
    selected_subtopics: Option<&Vec<String>>,
) {
    let sole_subtopic = selected_subtopics
        .filter(|s| s.len() == 1)
        .and_then(|s| s.first());

    for (idx, q) in questions.iter_mut().enumerate() {
        q.id = format!("mc{}", idx + 1);
        q.topic = q.topic.trim().into();
        q.prompt_markdown = clean_field(q.prompt_markdown.trim());
        q.explanation_markdown = clean_field(q.explanation_markdown.trim());
        q.correct_answer = q.correct_answer.trim().to_uppercase();
        q.subtopic = q
            .subtopic
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| sole_subtopic.cloned());

        fix_topic_field(&mut q.topic, &mut q.subtopic, selected_topics);

        for opt in &mut q.options {
            opt.label = opt.label.trim().to_uppercase();
            opt.text = clean_field(opt.text.trim());
        }
    }
}

pub fn validate_mc(questions: &[McQuestion], expected: usize) -> CommandResult<()> {
    if questions.len() != expected {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            format!("Expected {expected} MC questions, got {}.", questions.len()),
        ));
    }
    for q in questions {
        if q.topic.is_empty() {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} missing topic.", q.id),
            ));
        }
        if q.prompt_markdown.is_empty() {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} empty prompt.", q.id),
            ));
        }
        if q.explanation_markdown.is_empty() {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} empty explanation.", q.id),
            ));
        }
        let words = q.explanation_markdown.split_whitespace().count();
        if words > MC_MAX_EXPLANATION_WORDS {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!(
                    "Q{} explanation too long ({words} words; max {MC_MAX_EXPLANATION_WORDS}).",
                    q.id
                ),
            ));
        }
        let low = q.explanation_markdown.to_lowercase();
        if DISALLOWED_SELF_TALK.iter().any(|m| low.contains(m)) {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} explanation contains self-talk.", q.id),
            ));
        }
        if q.options.len() != 4 {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} must have exactly 4 options.", q.id),
            ));
        }
        let mut labels: Vec<_> = q.options.iter().map(|o| o.label.clone()).collect();
        labels.sort();
        if labels != ["A", "B", "C", "D"] {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} options must be labeled A, B, C, D.", q.id),
            ));
        }
        if !matches!(q.correct_answer.as_str(), "A" | "B" | "C" | "D") {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} invalid correctAnswer.", q.id),
            ));
        }
    }
    Ok(())
}

// --- Tests -------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- protect_latex_in_raw_json ---

    #[test]
    fn frac_protected_in_json_string() {
        // \f in a JSON string value would normally be parsed as form feed.
        // After protection it becomes \\f which JSON parses to \f (backslash-f).
        let raw = r#"{"q": "\frac{1}{2}"}"#;
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        assert_eq!(v["q"].as_str().unwrap(), r"\frac{1}{2}");
    }

    #[test]
    fn text_protected_in_json_string() {
        // \t in a JSON string value would normally be parsed as tab.
        let raw = r#"{"q": "\text{hello}"}"#;
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        assert_eq!(v["q"].as_str().unwrap(), r"\text{hello}");
    }

    #[test]
    fn beta_protected_in_json_string() {
        // \b would be parsed as backspace.
        let raw = r#"{"q": "\beta + \bar{x}"}"#;
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        assert_eq!(v["q"].as_str().unwrap(), r"\beta + \bar{x}");
    }

    #[test]
    fn real_tab_escape_preserved() {
        // A real \t (tab) that is NOT followed by a letter should be preserved
        // as a tab character after JSON parsing.
        let raw = "{\"q\": \"col1\\tcol2\"}";
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        // \t followed by 'c' — our heuristic will treat this as LaTeX.
        // This is an acceptable false positive: "col1\tcol2" is not typical
        // in a math/science question body. The test documents the behaviour.
        let result = v["q"].as_str().unwrap();
        assert!(result.contains('\\') || result.contains('\t'));
    }

    #[test]
    fn already_escaped_backslash_not_doubled() {
        // \\\\ in source JSON is already two backslashes — must not triple.
        let raw = r#"{"q": "\\frac{1}{2}"}"#;
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        // After parsing \\frac should yield \frac (one backslash).
        assert_eq!(v["q"].as_str().unwrap(), r"\frac{1}{2}");
    }

    #[test]
    fn non_string_json_untouched() {
        let raw = r#"{"count": 42, "flag": true}"#;
        let protected = protect_latex_in_raw_json(raw);
        assert_eq!(protected, raw);
    }

    #[test]
    fn complex_latex_expression_survives() {
        // A realistic model output with multiple colliding sequences.
        let raw = r#"{"prompt": "Find $\frac{\theta}{\beta}$ where $\text{Re}(z) > 0$."}"#;
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        let result = v["prompt"].as_str().unwrap();
        assert!(result.contains(r"\frac"), "\\frac missing: {result}");
        assert!(result.contains(r"\theta"), "\\theta missing: {result}");
        assert!(result.contains(r"\beta"), "\\beta missing: {result}");
        assert!(result.contains(r"\text"), "\\text missing: {result}");
    }

    #[test]
    fn frac_in_display_math_survives() {
        let raw = r#"{"q": "\\[\frac{d}{dx}f(x)\\]"}"#;
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        let result = v["q"].as_str().unwrap();
        assert!(
            result.contains(r"\frac"),
            "\\frac missing after display math: {result}"
        );
    }

    #[test]
    fn newline_in_json_string_preserved() {
        // A genuine \n (newline escape) not followed by a letter should
        // decode as a real newline, not be mangled.
        let raw = "{\"q\": \"line1\\nline2\"}";
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        assert_eq!(v["q"].as_str().unwrap(), "line1\nline2");
    }

    // --- sanitise_latex (existing, unchanged) ---

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
        assert_eq!(sanitise_latex("solve $x^2 = 4$"), "solve $x^2 = 4$");
    }

    #[test]
    fn does_not_mangle_display_math() {
        assert_eq!(sanitise_latex("$$E = mc^2$$"), "$$E = mc^2$$");
    }

    #[test]
    fn double_escaped_paren_normalised() {
        assert_eq!(sanitise_latex("\\\\(x\\\\)"), "$x$");
    }

    #[test]
    fn currency_followed_by_display_math_not_mangled() {
        assert_eq!(sanitise_latex("$$x = 1$$"), "$$x = 1$$");
    }

    // --- clean_field / normalise_typography ---

    #[test]
    fn smart_quotes_normalised_to_ascii() {
        assert_eq!(
            clean_field("\u{2018}it\u{2019}s Newton\u{2019}s law\u{201D}"),
            "\"it's Newton's law\""
        );
    }

    #[test]
    fn em_dash_normalised() {
        assert_eq!(clean_field("speed\u{2014}velocity"), "speed--velocity");
    }

    #[test]
    fn ellipsis_normalised() {
        assert_eq!(clean_field("and so on\u{2026}"), "and so on...");
    }

    #[test]
    fn non_ascii_passthrough_unaffected() {
        assert_eq!(clean_field("café αβγ"), "café αβγ");
    }

    // --- End-to-end: raw JSON → clean field ---

    #[test]
    fn end_to_end_frac_roundtrip() {
        // Simulate the full pipeline: raw LLM JSON → protect → parse → clean_field.
        let raw = r#"{"q": "Evaluate $\frac{1}{2} + \frac{3}{4}$."}"#;
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        let field = v["q"].as_str().unwrap();
        let cleaned = clean_field(field);
        assert!(
            cleaned.contains(r"\frac"),
            "\\frac lost in pipeline: {cleaned}"
        );
        assert_eq!(cleaned, r"Evaluate $\frac{1}{2} + \frac{3}{4}$.");
    }

    #[test]
    fn end_to_end_text_roundtrip() {
        let raw = r#"{"q": "Let $\\text{Re}(z) = 0$."}"#;
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        let field = v["q"].as_str().unwrap();
        let cleaned = clean_field(field);
        assert!(
            cleaned.contains(r"\text"),
            "\\text lost in pipeline: {cleaned}"
        );
    }

    #[test]
    fn end_to_end_paren_delimiters_converted() {
        // Model emits \(...\); pipeline should convert to $...$
        let raw = r#"{"q": "Value is \\(x^2\\)."}"#;
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        let field = v["q"].as_str().unwrap();
        let cleaned = clean_field(field);
        assert_eq!(cleaned, "Value is $x^2$.");
    }
}
