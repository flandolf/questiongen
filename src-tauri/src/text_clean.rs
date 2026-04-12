/// Run the full sanitise -> typography pipeline on a single string
/// field that has already been deserialized from JSON.
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
    normalise_typography(&rendered)
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
