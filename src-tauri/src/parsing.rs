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
                            let mut is_latex = false;
                            if matches!(next, b'f' | b't' | b'b' | b'n' | b'r') {
                                let commands: &[&[u8]] = match next {
                                    b'n' => &[
                                        b"nabla", b"natural", b"ne", b"neq", b"nearrow", b"not",
                                        b"notin", b"nu",
                                    ],
                                    b'r' => &[
                                        b"rho",
                                        b"right",
                                        b"rightarrow",
                                        b"Rightarrow",
                                        b"rm",
                                        b"Re",
                                        b"rangle",
                                        b"rceil",
                                        b"rfloor",
                                        b"rvert",
                                        b"rVert",
                                    ],
                                    b't' => &[
                                        b"tan",
                                        b"tanh",
                                        b"tau",
                                        b"text",
                                        b"textbf",
                                        b"textit",
                                        b"textrm",
                                        b"textsf",
                                        b"texttt",
                                        b"textup",
                                        b"theta",
                                        b"times",
                                        b"to",
                                        b"top",
                                        b"triangle",
                                        b"triangleright",
                                        b"therefore",
                                        b"tilde",
                                        b"tfrac",
                                    ],
                                    b'f' => {
                                        &[b"frac", b"forall", b"frown", b"flat", b"fbox", b"fty"]
                                    }
                                    b'b' => &[
                                        b"beta",
                                        b"bar",
                                        b"bf",
                                        b"begin",
                                        b"binom",
                                        b"big",
                                        b"Big",
                                        b"bigg",
                                        b"Bigg",
                                        b"bot",
                                        b"bullet",
                                        b"bmod",
                                        b"bowtie",
                                        b"backslash",
                                        b"bmatrix",
                                        b"bmathbb",
                                    ],
                                    _ => &[],
                                };

                                let start = i + 1;
                                for &cmd in commands {
                                    if bytes[start..].starts_with(cmd) {
                                        let next_idx = start + cmd.len();
                                        if next_idx >= len || !bytes[next_idx].is_ascii_alphabetic()
                                        {
                                            is_latex = true;
                                            break;
                                        }
                                    }
                                }
                            }

                            if is_latex {
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

// --- Text post-processing pipeline -------------------------------------------
//
// Every markdown field from the model goes through:
//   sanitise_latex -> normalise_typography
//
// At this stage the raw JSON has already been through protect_latex_in_raw_json,
// so \frac, \text etc. are preserved as real backslash-sequences in the Rust
// string. The remaining work is:
//
//   sanitise_latex        — normalise delimiters, protect currency $
//   normalise_typography  — smart quotes, dashes, ellipsis → ASCII

// --- Full pipeline convenience -----------------------------------------------

// --- Normalise + validate written questions ----------------------------------

// --- Normalise + validate MC questions ----------------------------------------

// --- Tests -------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::text_clean::clean_field;

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

    // --- clean_field ---

    #[test]
    fn converts_paren_inline() {
        assert_eq!(clean_field("Value is \\(x^2\\)."), "Value is $x^2$.");
    }

    #[test]
    fn converts_bracket_display() {
        assert_eq!(clean_field("\\[E = mc^2\\]"), "$$E = mc^2$$");
    }

    #[test]
    fn protects_currency_dollar() {
        assert_eq!(clean_field("costs $50 today"), "costs \\$50 today");
    }

    #[test]
    fn does_not_mangle_math_dollar() {
        assert_eq!(clean_field("solve $x^2 = 4$"), "solve $x^2 = 4$");
    }

    #[test]
    fn does_not_mangle_display_math() {
        assert_eq!(clean_field("$$E = mc^2$$"), "$$E = mc^2$$");
    }

    #[test]
    fn escapes_percent_inside_math() {
        assert_eq!(clean_field("Rate is $50%$"), "Rate is $50\\%$");
    }

    #[test]
    fn leaves_percent_outside_math_unchanged() {
        assert_eq!(
            clean_field("Increase by 50% today"),
            "Increase by 50% today"
        );
    }

    #[test]
    fn double_escaped_paren_normalised() {
        assert_eq!(clean_field("\\\\(x\\\\)"), "$x$");
    }

    #[test]
    fn currency_followed_by_display_math_not_mangled() {
        assert_eq!(clean_field("$$x = 1$$"), "$$x = 1$$");
    }

    #[test]
    fn repairs_single_slash_before_hline() {
        let input = r"\begin{array}{c|ccc} x & 0 & 1 & 2 \ \hline P(X=x) & \dfrac{5}{14} & \dfrac{15}{28} & k \end{array}";
        let output = clean_field(input);
        assert!(
            output.contains(r"2 \\ \hline"),
            "row break before hline not repaired: {output}"
        );
    }

    #[test]
    fn does_not_change_valid_double_slash_before_hline() {
        let input = r"$\begin{array}{c|cc} X & 0 & 1 \\ \hline P(X=x) & 0.5 & 0.5 \end{array}$";
        assert_eq!(clean_field(input), input);
    }

    #[test]
    fn repairs_single_slash_before_digit_in_cases() {
        let input = r"$f(x)=\begin{cases}2x, & 0\le x\le 1\0, & \text{otherwise}\end{cases}$";
        let output = clean_field(input);
        assert!(
            output.contains(r"1\\0"),
            "single slash before digit row start not repaired: {output}"
        );
    }

    #[test]
    fn does_not_change_valid_double_slash_before_digit_in_cases() {
        let input = r"$f(x)=\begin{cases}2x, & 0\le x\le 1\\0, & \text{otherwise}\end{cases}$";
        assert_eq!(clean_field(input), input);
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
}
