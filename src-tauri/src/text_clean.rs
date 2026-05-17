use once_cell::sync::Lazy;
use regex::Regex;

/// Run the full sanitise -> typography -> post-process pipeline on a single
/// string field that has already been deserialized from JSON.
pub fn clean_field(s: &str) -> String {
    // Undo double-escaping of delimiter chars that some lenient JSON parsers leave as-is.
    let s = s
        .replace("\\\\(", "\\(")
        .replace("\\\\)", "\\)")
        .replace("\\\\[", "\\[")
        .replace("\\\\]", "\\]");

    let nodes = crate::latex::lex(&s);
    let healed = crate::latex::heal_latex(nodes);
    let rendered = crate::latex::render_latex(&healed);
    let cleaned = normalise_typography(&rendered);
    post_process_text(&cleaned)
}

/// Idempotent whitespace and line-break normalization applied after all LaTeX
/// and typography processing. Every transformation here produces the same
/// result when run a second time.
fn post_process_text(s: &str) -> String {
    let s = s.replace("\r\n", "\n").replace('\r', "\n");
    let s = strip_trailing_whitespace(&s);
    collapse_blank_lines(&s)
}

fn strip_trailing_whitespace(s: &str) -> String {
    s.lines()
        .map(|line| line.trim_end())
        .collect::<Vec<_>>()
        .join("\n")
}

fn collapse_blank_lines(s: &str) -> String {
    static RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\n{3,}").unwrap());
    RE.replace_all(s, "\n\n").to_string()
}

/// Strip characters that commonly cause JSON API validation failures.
pub fn sanitize_for_api(s: &str) -> String {
    s.chars()
        .filter(|&c| {
            // Keep valid JSON whitespace.
            if c == '\t' || c == '\n' || c == '\r' {
                return true;
            }
            // Drop null byte and all other C0 controls.
            if c < '\u{0020}' {
                return false;
            }
            // Drop DEL.
            if c == '\u{007F}' {
                return false;
            }
            // Drop Unicode noncharacters: U+FFFE/U+FFFF per plane and U+FDD0..U+FDEF.
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

fn normalise_typography(s: &str) -> String {
    s.replace(['\u{2018}', '\u{2019}'], "'")
        .replace(['\u{201C}', '\u{201D}'], "\"")
        .replace(['\u{2013}', '\u{2014}'], "--")
        .replace('\u{2026}', "...")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trailing_whitespace_stripped_from_lines() {
        assert_eq!(strip_trailing_whitespace("hello   \nworld\t\n!  "), "hello\nworld\n!");
    }

    #[test]
    fn trailing_whitespace_on_single_line() {
        assert_eq!(strip_trailing_whitespace("no trailing"), "no trailing");
    }

    #[test]
    fn trailing_whitespace_empty_string() {
        assert_eq!(strip_trailing_whitespace(""), "");
    }

    #[test]
    fn collapse_triple_newlines_replaced() {
        assert_eq!(collapse_blank_lines("a\n\n\n\nb"), "a\n\nb");
    }

    #[test]
    fn collapse_quadruple_newlines_replaced() {
        assert_eq!(collapse_blank_lines("x\n\n\n\n\ny"), "x\n\ny");
    }

    #[test]
    fn collapse_blank_lines_keeps_double_newlines() {
        assert_eq!(collapse_blank_lines("a\n\nb"), "a\n\nb");
    }

    #[test]
    fn collapse_blank_lines_single_newline_unchanged() {
        assert_eq!(collapse_blank_lines("a\nb"), "a\nb");
    }

    #[test]
    fn collapse_blank_lines_no_newlines_unchanged() {
        assert_eq!(collapse_blank_lines("hello world"), "hello world");
    }

    #[test]
    fn collapse_blank_lines_empty_string() {
        assert_eq!(collapse_blank_lines(""), "");
    }

    #[test]
    fn post_process_normalizes_line_endings() {
        let result = post_process_text("hello\r\nworld\r");
        assert_eq!(result, "hello\nworld");
    }

    #[test]
    fn post_process_idempotent_no_trailing_whitespace() {
        let input = "line one\n\nline two\nline three";
        let first = post_process_text(input);
        let second = post_process_text(&first);
        assert_eq!(first, second);
    }

    #[test]
    fn post_process_idempotent_with_excessive_blank_lines() {
        let input = "a\n\n\n\nb";
        let first = post_process_text(input);
        let second = post_process_text(&first);
        assert_eq!(first, second);
    }

    #[test]
    fn post_process_idempotent_mixed_issues() {
        let input = "a  \n\n\r\n\nb \n\n\nc";
        let first = post_process_text(input);
        let second = post_process_text(&first);
        assert_eq!(first, second);
    }

    #[test]
    fn clean_field_pipeline_includes_post_process() {
        // Whitespace cleanup runs inside clean_field without breaking normal output.
        let result = clean_field("solve $x^2 = 4$");
        assert_eq!(result, "solve $x^2 = 4$");
    }
}
