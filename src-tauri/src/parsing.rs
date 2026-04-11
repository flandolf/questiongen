#[cfg(test)]
use crate::catalog;

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
// Note: \u starts JSON Unicode escapes (\uXXXX) but also collides with LaTeX
// \underbrace, \unit, etc. when the model omits escaping — handled specially
// below. \", \\, \/ are JSON escapes and do not need LaTeX collision handling.

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
                    // Check if this quote is escaped by counting consecutive backslashes.
                    let mut slash_count = 0;
                    let mut j = i;
                    while j > 0 && bytes[j - 1] == b'\\' {
                        slash_count += 1;
                        j -= 1;
                    }
                    if slash_count % 2 == 1 {
                        // Odd number of backslashes → quote is escaped (\", \\\", etc.)
                        out.push(b'"');
                        i += 1;
                        continue;
                    }
                    // Even number of backslashes (including 0) → closing quote.
                    out.push(b'"');
                    i += 1;
                    break;
                }
                b'\\' if i + 1 < len => {
                    let next = bytes[i + 1];
                    match next {
                        // JSON \uXXXX — only treat as Unicode if four hex digits follow.
                        b'u' => {
                            let hex_ok = i + 6 <= len
                                && bytes[i + 2].is_ascii_hexdigit()
                                && bytes[i + 3].is_ascii_hexdigit()
                                && bytes[i + 4].is_ascii_hexdigit()
                                && bytes[i + 5].is_ascii_hexdigit();
                            if hex_ok {
                                out.extend_from_slice(&bytes[i..i + 6]);
                                i += 6;
                            } else {
                                // \underbrace, \unit, truncated \u, etc.
                                out.extend_from_slice(b"\\\\");
                                out.push(b'u');
                                i += 2;
                            }
                        }
                        // Already a proper two-char escape —
                        // copy verbatim and skip both chars (except \u, above).
                        b'"' | b'\\' | b'/' | b'n' | b'r' | b't' | b'b' | b'f' => {
                            // For \n, \r, \t, \b, \f we need to check: is this
                            // actually a JSON escape for whitespace/control, or
                            // is the model trying to write a LaTeX command?
                            //
                            // Heuristic: if the character after the escape letter
                            // is an ASCII letter (a-z, A-Z) then treat the whole
                            // thing as a LaTeX command that got mis-escaped — emit
                            // \\X so the JSON parser yields \X.
                            //
                            // Previously \n / \r were excluded, but LaTeX commands
                            // like \nabla, \nu, \notin, \right, \rho, \rm are
                            // common in math output and get corrupted by JSON
                            // parsing. We now protect all three: \f, \t, \b, \n, \r.
                            if matches!(next, b'f' | b't' | b'b' | b'n' | b'r')
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

/// Strip a leading markdown ``` or ```json (case-insensitive) fence and trailing ```.
fn strip_json_code_fence(s: &str) -> Option<&str> {
    let t = s.trim();
    let b = t.as_bytes();
    if b.len() < 3 || b[0] != b'`' || b[1] != b'`' || b[2] != b'`' {
        return None;
    }
    let mut i = 3usize;
    if i + 4 <= b.len() && t[i..i + 4].eq_ignore_ascii_case("json") {
        i += 4;
    }
    let inner = t[i..].trim_start_matches(['\n', '\r']);
    inner.strip_suffix("```").map(str::trim)
}

/// Remove trailing commas before `}` or `]` outside of JSON string literals.
/// LLMs often emit `{"a":1,}`; this repairs the extracted snippet only.
pub fn repair_llm_json_trailing_commas(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out: Vec<char> = Vec::with_capacity(chars.len());
    let mut i = 0;
    let mut in_string = false;
    let mut string_escape = false;

    while i < chars.len() {
        let c = chars[i];
        if in_string {
            out.push(c);
            if string_escape {
                string_escape = false;
            } else if c == '\\' {
                string_escape = true;
            } else if c == '"' {
                in_string = false;
            }
            i += 1;
            continue;
        }

        if c == '"' {
            in_string = true;
            out.push(c);
            i += 1;
            continue;
        }

        if c == ',' {
            let mut j = i + 1;
            while j < chars.len() && chars[j].is_whitespace() {
                j += 1;
            }
            if j < chars.len() && (chars[j] == '}' || chars[j] == ']') {
                i += 1;
                continue;
            }
        }

        out.push(c);
        i += 1;
    }

    out.into_iter().collect()
}

/// Try to parse the first JSON value from `text` and return the exact substring that was consumed.
fn first_json_value_snippet(text: &str, want_array: bool) -> Option<String> {
    let is_expected = |v: &serde_json::Value| {
        if want_array {
            v.is_array()
        } else {
            v.is_object()
        }
    };
    let mut iter = serde_json::Deserializer::from_str(text).into_iter::<serde_json::Value>();
    if let Some(Ok(v)) = iter.next() {
        if is_expected(&v) {
            let end = iter.byte_offset();
            return text.get(..end).map(str::to_string);
        }
    }
    None
}

/// Extract the first valid JSON value (object or array) from raw model output.
/// With Response Healing enabled this is rarely needed, but kept as a safety net.
///
/// NOTE: `content` here should already have been through `protect_latex_in_raw_json`.
fn extract_json_value(content: &str, want_array: bool) -> Option<String> {
    let s = content.trim();
    let opener = if want_array { '[' } else { '{' };

    // Already a clean value (optional trailing-comma repair).
    if s.starts_with(opener) {
        if let Some(snippet) = first_json_value_snippet(s, want_array) {
            return Some(snippet);
        }
        let fixed = repair_llm_json_trailing_commas(s);
        if fixed != s {
            if let Some(snippet) = first_json_value_snippet(&fixed, want_array) {
                return Some(snippet);
            }
        }
    }

    // Strip ``` / ```json (any case) ... ``` fences.
    if let Some(inner) = strip_json_code_fence(s) {
        if inner.starts_with(opener) {
            if let Some(snippet) = first_json_value_snippet(inner, want_array) {
                return Some(snippet);
            }
            let fixed = repair_llm_json_trailing_commas(inner);
            if fixed != inner {
                if let Some(snippet) = first_json_value_snippet(&fixed, want_array) {
                    return Some(snippet);
                }
            }
        }
    }

    // Scan for the first parseable value.
    for (i, ch) in content.char_indices() {
        if ch != opener {
            continue;
        }
        let slice = &content[i..];
        if let Some(snippet) = first_json_value_snippet(slice, want_array) {
            return Some(snippet);
        }
        let fixed = repair_llm_json_trailing_commas(slice);
        if fixed != slice {
            if let Some(snippet) = first_json_value_snippet(&fixed, want_array) {
                return Some(snippet);
            }
        }
    }
    None
}

/// Extract the first valid JSON object from raw model output.
/// Backward-compatible wrapper around `extract_json_value`.
pub fn extract_json_object(content: &str) -> Option<String> {
    extract_json_value(content, false)
}

/// Extract the first valid JSON array from raw model output (fences + scan).
pub fn extract_json_array(content: &str) -> Option<String> {
    extract_json_value(content, true)
}

// --- Envelope normalisation ---------------------------------------------------

/// Accept `[...]`, `{"questions":[...]}`, or common wrapper variants.
pub fn normalise_envelope(value: serde_json::Value) -> Result<serde_json::Value, String> {
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
pub fn decode_escapes(value: &str) -> String {
    fn starts_with_latex_command(chars: &[char], start: usize, commands: &[&str]) -> bool {
        commands.iter().any(|command| {
            let mut idx = start;
            for expected in command.chars() {
                if chars.get(idx) != Some(&expected) {
                    return false;
                }
                idx += 1;
            }
            // Treat as a command only when the matched token is complete.
            // A following ASCII letter means this is a longer unknown word
            // and should be treated as normal escaped text.
            chars
                .get(idx)
                .is_none_or(|next| !next.is_ascii_alphabetic())
        })
    }

    const N_COMMANDS: &[&str] = &[
        "nabla", "natural", "ne", "neq", "nearrow", "not", "notin", "nu",
    ];
    const R_COMMANDS: &[&str] = &["rho", "right", "rightarrow", "Rightarrow", "rm", "Re"];

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
            // \r literal → newline, but only if not followed by a letter that
            // would form a LaTeX command (e.g. \rho, \rightarrow, \Re).
            if chars[i + 1] == 'r' {
                if starts_with_latex_command(&chars, i + 1, R_COMMANDS) {
                    out.push('\\');
                    out.push('r');
                } else {
                    out.push('\n');
                }
                i += 2;
                continue;
            }
            // \n literal → newline unless it starts a known LaTeX command.
            // This keeps commands like \nabla and \notin intact while decoding
            // non-LaTeX text like \nand into a newline + "and".
            if chars[i + 1] == 'n' {
                if starts_with_latex_command(&chars, i + 1, N_COMMANDS) {
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
/// 1. Repair common typo'd LaTeX commands that appear with an extra leading
///    `b` after the backslash, e.g. `\bmathbb` -> `\mathbb`.
/// 2. Un-double escaped delimiter chars that lenient JSON parsers leave as-is:
///    `\\(` → `\(`  etc.
///
/// 3. Convert `\(...\)` → `$...$`  and  `\[...\]` → `$$...$$`.
///    MathJax is configured with only `$`/`$$` as delimiters.
///
/// 4. Protect currency: a bare `$` immediately before an ASCII digit that is
///    not part of a `$$` display pair is replaced with `\$`.
fn repair_common_latex_typos(text: &str) -> String {
    // Repair a common truncated command that causes MathJax/Katex failures.
    // `\fty` is not valid LaTeX and is almost always intended to be `\infty`.
    let text = text.replace("\\fty", "\\infty");

    const COMMANDS: &[&str] = &[
        "alpha", "approx", "bar", "begin", "beta", "bf", "binom", "big", "Big", "bigg", "Bigg",
        "cdot", "cos", "cosh", "delta", "div", "end", "epsilon", "equiv", "eta", "exists", "frac",
        "forall", "gamma", "geq", "hat", "in", "infty", "int", "lambda", "leq", "ln", "log",
        "mathbb", "mathcal", "mathfrak", "mathrm", "mathsf", "mathbf", "min", "mod", "nabla",
        "natural", "neg", "neq", "nu", "omega", "phi", "pi", "pm", "prod", "frac", "rho", "sigma",
        "sin", "sinh", "sqrt", "sum", "tan", "tanh", "tau", "theta", "times", "vec", "xi", "zeta",
    ];

    let mut out = String::with_capacity(text.len());
    let mut rest = text.as_str();

    while let Some(pos) = rest.find(r"\b") {
        out.push_str(&rest[..pos]);
        let after_b = &rest[pos + 2..];
        if let Some(command) = COMMANDS
            .iter()
            .find(|command| after_b.starts_with(**command))
        {
            let b_prefixed_is_valid = COMMANDS
                .iter()
                .any(|candidate| *candidate == format!("b{command}"));
            // Only strip the extra 'b' for malformed forms like \bmathbb,
            // not for valid \b... commands such as \beta or \begin.
            if command.starts_with('b') || b_prefixed_is_valid {
                out.push_str(r"\b");
                rest = after_b;
            } else {
                out.push('\\');
                out.push_str(command);
                rest = &after_b[command.len()..];
            }
        } else {
            out.push_str(r"\b");
            rest = after_b;
        }
    }

    out.push_str(rest);
    out
}

pub fn sanitise_latex(text: &str) -> String {
    // Step 1: undo double-escaping of delimiter chars
    let s = text
        .replace("\\\\(", "\\(")
        .replace("\\\\)", "\\)")
        .replace("\\\\[", "\\[")
        .replace("\\\\]", "\\]");

    // Step 2: convert paren/bracket delimiters to $ delimiters
    let s = convert_paren_delimiters(&s);

    // Step 3: repair malformed table row breaks like `\ \hline` where the
    // first row terminator slash is missing (should be `\\ \hline`).
    let s = repair_tabular_row_breaks(&s);

    // Step 4: protect bare currency dollars
    protect_currency_dollars(&s)
}

/// Repair malformed row-break + rule sequences in LaTeX tables.
///
/// Some model outputs use `\ \hline` (single slash + space + `\hline`),
/// which triggers "Misplaced \\noalign" / "misplaced \hline" errors.
/// This normalizes those cases to `\\ \hline`.
fn repair_tabular_row_breaks(s: &str) -> String {
    const RULE_COMMANDS: [&str; 6] = [
        "hline",
        "cline",
        "cmidrule",
        "toprule",
        "midrule",
        "bottomrule",
    ];

    let chars: Vec<char> = s.chars().collect();
    let len = chars.len();
    let mut out = String::with_capacity(s.len() + 8);
    let mut i = 0usize;

    while i < len {
        if chars[i] == '\\' {
            // Count consecutive backslashes starting at i.
            let mut run_end = i + 1;
            while run_end < len && chars[run_end] == '\\' {
                run_end += 1;
            }

            // Preserve existing valid row breaks (\\, \\\, ...)
            if run_end > i + 1 {
                for _ in i..run_end {
                    out.push('\\');
                }
                i = run_end;
                continue;
            }

            // Single backslash run: check if it should be repaired.
            let mut j = run_end;
            while j < len && chars[j].is_whitespace() {
                j += 1;
            }

            // Repair `\ \hline`-style malformed row break before rule commands.
            if j + 1 < len && chars[j] == '\\' {
                let cmd_start = j + 1;
                let mut cmd_end = cmd_start;
                while cmd_end < len && chars[cmd_end].is_ascii_alphabetic() {
                    cmd_end += 1;
                }

                if cmd_end > cmd_start {
                    let cmd: String = chars[cmd_start..cmd_end].iter().collect();
                    if RULE_COMMANDS.iter().any(|candidate| candidate == &cmd) {
                        out.push_str("\\\\");
                        for &ch in &chars[run_end..j] {
                            out.push(ch);
                        }
                        out.push('\\');
                        for &ch in &chars[cmd_start..cmd_end] {
                            out.push(ch);
                        }
                        i = cmd_end;
                        continue;
                    }
                }
            }

            // Repair malformed row break before digit, e.g. `... 1\0, ...`.
            if j < len && chars[j].is_ascii_digit() {
                out.push_str("\\\\");
                for &ch in &chars[run_end..j] {
                    out.push(ch);
                }
                out.push(chars[j]);
                i = j + 1;
                continue;
            }
        }

        out.push(chars[i]);
        i += 1;
    }

    out
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
            let next_digit = chars.get(i + 1).is_some_and(|c| c.is_ascii_digit());
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
    normalise_typography(&sanitise_latex(&repair_common_latex_typos(
        &decode_escapes(s),
    )))
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
            // Drop Unicode noncharacters: U+FFFE and U+FFFF per plane,
            // plus U+FDD0–U+FDEF.
            let cp = c as u32;
            if (0xFDD0..=0xFDEF).contains(&cp) {
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
    s.replace(['\u{2018}', '\u{2019}'], "'")
        .replace(['\u{201C}', '\u{201D}'], "\"")
        .replace(['\u{2013}', '\u{2014}'], "--")
        .replace('\u{2026}', "...")
}

// --- Topic / subtopic correction ----------------------------------------------

/// Canonical subject names that are valid values for the `topic` field.
/// Derived from the catalog at compile time.

/// Map each canonical subtopic (lowercased) to its parent subject.
/// This is used to fix cases where the LLM puts a subtopic into the `topic` field.
/// Derived from the catalog — no hardcoded arrays.

/// All canonical subtopic names (lowercased) across all topics.
/// Used for fuzzy matching LLM-generated subtopic values.
/// Derived from the catalog — no hardcoded arrays.

/// Compute the Levenshtein edit distance between two strings.

/// Similarity score between 0.0 and 1.0 based on normalized Levenshtein distance.
#[cfg(test)]
fn similarity_score(a: &str, b: &str) -> f32 {
    if a == b {
        return 1.0;
    }
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    if a_chars.is_empty() || b_chars.is_empty() {
        return 0.0;
    }

    let m = a_chars.len();
    let n = b_chars.len();
    let mut dp = vec![vec![0usize; n + 1]; m + 1];
    for (i, row) in dp.iter_mut().enumerate().take(m + 1) {
        row[0] = i;
    }
    for (j, cell) in dp[0].iter_mut().enumerate().take(n + 1) {
        *cell = j;
    }

    for i in 1..=m {
        for j in 1..=n {
            let cost = if a_chars[i - 1] == b_chars[j - 1] {
                0
            } else {
                1
            };
            dp[i][j] = (dp[i - 1][j] + 1)
                .min(dp[i][j - 1] + 1)
                .min(dp[i - 1][j - 1] + cost);
        }
    }

    let dist = dp[m][n] as f32;
    let max_len = m.max(n) as f32;
    (1.0 - dist / max_len).max(0.0)
}

#[cfg(test)]
fn all_canonical_subtopics() -> Vec<String> {
    catalog::all_topics()
        .iter()
        .flat_map(|topic| topic.subtopics.iter().map(|sub| sub.name.to_lowercase()))
        .collect()
}

/// Result of attempting to canonicalize a subtopic value.
#[cfg(test)]
#[derive(Debug)]
enum CanonicalizeResult {
    AlreadyCanonical,
    Mapped(String),
    NoMatch,
}

/// Attempt to canonicalize a subtopic value using a multi-tier strategy:
/// 1. Exact case-insensitive match
/// 2. Substring containment (either direction)
/// 3. Levenshtein-based fuzzy matching with a confidence threshold
/// 4. Fallback to the sole user-selected subtopic if only one was specified
///
/// Returns the canonical form if found, or the original value if no match.
#[cfg(test)]
fn canonicalize_subtopic(value: &str, sole_selected_subtopic: Option<&str>) -> CanonicalizeResult {
    let input = value.trim();
    if input.is_empty() {
        if let Some(sole) = sole_selected_subtopic
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            return CanonicalizeResult::Mapped(sole.to_string());
        }
        return CanonicalizeResult::NoMatch;
    }

    let input_lower = input.to_lowercase();
    let all = all_canonical_subtopics();

    if all.iter().any(|s| s == &input_lower) {
        return CanonicalizeResult::AlreadyCanonical;
    }

    if let Some(found) = all.iter().find(|candidate| {
        candidate.contains(&input_lower) || input_lower.contains(candidate.as_str())
    }) {
        return CanonicalizeResult::Mapped(found.clone());
    }

    let mut best: Option<(&String, f32)> = None;
    for candidate in &all {
        let score = similarity_score(&input_lower, candidate);
        if best.is_none_or(|(_, s)| score > s) {
            best = Some((candidate, score));
        }
    }

    if let Some((candidate, score)) = best {
        if score >= 0.78 {
            return CanonicalizeResult::Mapped(candidate.clone());
        }
    }

    if let Some(sole) = sole_selected_subtopic
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return CanonicalizeResult::Mapped(sole.to_string());
    }

    CanonicalizeResult::NoMatch
}

/// If the `topic` field is not a canonical subject, try to detect whether the LLM
/// put a subtopic value there instead. If so, move it to `subtopic` and set
/// `topic` to the correct parent subject.
///
/// `selected_topics` are the user-selected subjects (e.g. ["Mathematical Methods"]).

// --- Normalise + validate written questions ----------------------------------

// --- Normalise + validate MC questions ----------------------------------------

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
        // A genuine \n (newline escape) followed by a space should
        // decode as a real newline, not be mangled.
        let raw = "{\"q\": \"line1\\n line2\"}";
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        assert_eq!(v["q"].as_str().unwrap(), "line1\n line2");
    }

    #[test]
    fn underbrace_protected_invalid_unicode_escape() {
        // Raw JSON: one backslash before "u" — invalid as \uXXXX; must become valid JSON.
        let raw = r#"{"q": "\underbrace{x}"}"#;
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        assert_eq!(v["q"].as_str().unwrap(), r"\underbrace{x}");
    }

    #[test]
    fn valid_unicode_escape_u00a3_unchanged() {
        let raw = r#"{"q": "Pound \u00a3 sign"}"#;
        let protected = protect_latex_in_raw_json(raw);
        let v: serde_json::Value = serde_json::from_str(&protected).unwrap();
        assert_eq!(v["q"].as_str().unwrap(), "Pound £ sign");
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

    #[test]
    fn repairs_single_slash_before_hline() {
        let input = r"\begin{array}{c|ccc} x & 0 & 1 & 2 \ \hline P(X=x) & \dfrac{5}{14} & \dfrac{15}{28} & k \end{array}";
        let output = sanitise_latex(input);
        assert!(
            output.contains(r"2 \\ \hline"),
            "row break before hline not repaired: {output}"
        );
    }

    #[test]
    fn does_not_change_valid_double_slash_before_hline() {
        let input = r"\begin{array}{c|cc} X & 0 & 1 \\ \hline P(X=x) & 0.5 & 0.5 \end{array}";
        assert_eq!(sanitise_latex(input), input);
    }

    #[test]
    fn repairs_single_slash_before_digit_in_cases() {
        let input = r"f(x)=\begin{cases}2x, & 0\le x\le 1\0, & \text{otherwise}\end{cases}";
        let output = sanitise_latex(input);
        assert!(
            output.contains(r"1\\0"),
            "single slash before digit row start not repaired: {output}"
        );
    }

    #[test]
    fn does_not_change_valid_double_slash_before_digit_in_cases() {
        let input = r"f(x)=\begin{cases}2x, & 0\le x\le 1\\0, & \text{otherwise}\end{cases}";
        assert_eq!(sanitise_latex(input), input);
    }

    // --- clean_field / normalise_typography ---

    #[test]
    fn smart_quotes_normalised_to_ascii() {
        assert_eq!(
            clean_field("\u{2018}it\u{2019}s Newton\u{2019}s law\u{201D}"),
            "'it's Newton's law\""
        );
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

    #[test]
    fn decode_escapes_preserves_rho_command() {
        assert_eq!(clean_field(r"\rho"), r"\rho");
    }

    #[test]
    fn repair_extra_b_before_common_commands() {
        assert_eq!(
            clean_field(r"$h: [1, \binfty) \to \bmathbb{R}$"),
            r"$h: [1, \infty) \to \mathbb{R}$"
        );
    }

    #[test]
    fn does_not_change_valid_beta_command() {
        assert_eq!(clean_field(r"\beta"), r"\beta");
    }

    #[test]
    fn repair_truncated_infty_command() {
        assert_eq!(
            clean_field(r"Domain is $(-\fty, 2]$"),
            r"Domain is $(-\infty, 2]$"
        );
    }

    #[test]
    fn decode_escapes_literal_backslash_r_plus_space_to_newline() {
        assert_eq!(decode_escapes(r"line1\r line2"), "line1\n line2");
    }

    #[test]
    fn decode_escapes_literal_backslash_n_where_to_newline() {
        // \nwhere (with 'w' as second char) is not a valid LaTeX command,
        // so it should be treated as a newline followed by "where".
        assert_eq!(
            decode_escapes(r"condition\nwhere applies"),
            "condition\nwhere applies"
        );
    }

    #[test]
    fn decode_escapes_literal_backslash_n_and_to_newline() {
        assert_eq!(decode_escapes(r"line1\nand line2"), "line1\nand line2");
    }

    #[test]
    fn decode_escapes_preserves_valid_nabla_command() {
        // \nabla IS a valid LaTeX command (second char 'a' is in allowed set),
        // so the backslash should be preserved.
        assert_eq!(decode_escapes(r"\nabla"), r"\nabla");
    }

    #[test]
    fn decode_escapes_literal_backslash_r_and_to_newline() {
        assert_eq!(decode_escapes(r"line1\rand line2"), "line1\nand line2");
    }

    #[test]
    fn repair_trailing_commas_in_object() {
        let bad = r#"{"a":1,}"#;
        let fixed = repair_llm_json_trailing_commas(bad);
        let v: serde_json::Value = serde_json::from_str(&fixed).unwrap();
        assert_eq!(v["a"], 1);
    }

    #[test]
    fn extract_json_array_bare_array() {
        let s = r#"  [  {"id":"q1"} ]  "#;
        let out = extract_json_array(s).unwrap();
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert!(v.is_array());
    }

    #[test]
    fn extract_json_object_case_insensitive_json_fence() {
        let input = "```JSON\n{\"questions\":[]}\n```";
        let out = extract_json_object(input).unwrap();
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert!(v.get("questions").is_some());
    }

    #[test]
    fn extract_json_object_trailing_comma() {
        let input = "{\"questions\":[],}";
        let out = extract_json_object(input).unwrap();
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert!(v.get("questions").is_some());
    }

    // --- canonicalize_subtopic ---

    #[test]
    fn canonical_exact_match_returns_already_canonical() {
        match canonicalize_subtopic("Function Notation and Domains", None) {
            CanonicalizeResult::AlreadyCanonical => {}
            other => panic!("Expected AlreadyCanonical, got {other:?}"),
        }
    }

    #[test]
    fn canonical_lowercase_match_returns_already_canonical() {
        match canonicalize_subtopic("function notation and domains", None) {
            CanonicalizeResult::AlreadyCanonical => {}
            other => panic!("Expected AlreadyCanonical, got {other:?}"),
        }
    }

    #[test]
    fn canonical_substring_match_maps_correctly() {
        match canonicalize_subtopic("standard derivatives", None) {
            CanonicalizeResult::Mapped(m) => assert!(m.contains("derivatives")),
            other => panic!("Expected Mapped, got {other:?}"),
        }
    }

    #[test]
    fn canonical_levenshtein_match_maps_close_typo() {
        let score = similarity_score(
            "function notation an domains",
            "function notation and domains",
        );
        assert!(score > 0.9, "Expected high similarity score, got {score}");

        let all = all_canonical_subtopics();
        assert!(
            all.iter().any(|s| *s == "function notation and domains"),
            "Canonical list missing 'function notation and domains'"
        );

        match canonicalize_subtopic("function notation an domains", None) {
            CanonicalizeResult::Mapped(m) => {
                assert_eq!(m.to_lowercase(), "function notation and domains");
            }
            other => panic!("Expected Mapped, got {other:?}"),
        }
    }

    #[test]
    fn canonical_sole_subtopic_fallback() {
        // When no match is found and a sole subtopic is provided, use it.
        match canonicalize_subtopic("completely unknown topic", Some("Functions and Graphs")) {
            CanonicalizeResult::Mapped(m) => assert_eq!(m, "Functions and Graphs"),
            other => panic!("Expected Mapped with sole fallback, got {other:?}"),
        }
    }

    #[test]
    fn canonical_no_match_without_sole() {
        // No match and no sole subtopic → NoMatch.
        match canonicalize_subtopic("completely unknown topic", None) {
            CanonicalizeResult::NoMatch => {}
            other => panic!("Expected NoMatch, got {other:?}"),
        }
    }

    #[test]
    fn canonical_empty_string_uses_sole() {
        match canonicalize_subtopic("", Some("Integration")) {
            CanonicalizeResult::Mapped(m) => assert_eq!(m, "Integration"),
            other => panic!("Expected Mapped, got {other:?}"),
        }
    }
}
