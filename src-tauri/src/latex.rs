use once_cell::sync::Lazy;
use regex::{Captures, Regex};

#[derive(Debug, Clone, PartialEq)]
pub enum LatexNode {
    Text(String),
    InlineMath(String),
    DisplayMath(String),
}

/// Lexes a string into a sequence of Text, InlineMath, and DisplayMath nodes.
pub fn lex(text: &str) -> Vec<LatexNode> {
    let mut nodes = Vec::new();
    let mut i = 0;
    let mut text_buf = String::new();
    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();

    let flush_text = |buf: &mut String, nodes: &mut Vec<LatexNode>| {
        if !buf.is_empty() {
            nodes.push(LatexNode::Text(buf.clone()));
            buf.clear();
        }
    };

    while i < len {
        if chars[i] == '\\' && i + 1 < len {
            let next = chars[i + 1];
            if next == '(' || next == '[' {
                let is_display = next == '[';
                let close_char = if is_display { ']' } else { ')' };

                // Find closing delimiter
                let mut j = i + 2;
                let mut found = false;
                while j + 1 < len {
                    if chars[j] == '\\' && chars[j + 1] == close_char {
                        flush_text(&mut text_buf, &mut nodes);
                        let inner: String = chars[i + 2..j].iter().collect();
                        if is_display {
                            nodes.push(LatexNode::DisplayMath(inner));
                        } else {
                            nodes.push(LatexNode::InlineMath(inner));
                        }
                        i = j + 2;
                        found = true;
                        break;
                    }
                    j += 1;
                }
                if found {
                    continue;
                }
                // Unclosed
                flush_text(&mut text_buf, &mut nodes);
                let inner: String = chars[i + 2..].iter().collect();
                if is_display {
                    nodes.push(LatexNode::DisplayMath(inner));
                } else {
                    nodes.push(LatexNode::InlineMath(inner));
                }
                break;
            } else if next == '\\' || next == '$' {
                text_buf.push('\\');
                text_buf.push(next);
                i += 2;
                continue;
            }
        } else if chars[i] == '$' {
            let is_display = i + 1 < len && chars[i + 1] == '$';
            let skip = if is_display { 2 } else { 1 };

            // Find closing delimiter
            let mut j = i + skip;
            let mut found = false;
            while j < len {
                if chars[j] == '\\' && j + 1 < len && chars[j + 1] == '$' {
                    j += 2;
                    continue;
                }
                if is_display && chars[j] == '$' && j + 1 < len && chars[j + 1] == '$' {
                    flush_text(&mut text_buf, &mut nodes);
                    let inner: String = chars[i + skip..j].iter().collect();
                    nodes.push(LatexNode::DisplayMath(inner));
                    i = j + 2;
                    found = true;
                    break;
                } else if !is_display && chars[j] == '$' {
                    flush_text(&mut text_buf, &mut nodes);
                    let inner: String = chars[i + skip..j].iter().collect();
                    nodes.push(LatexNode::InlineMath(inner));
                    i = j + 1;
                    found = true;
                    break;
                }
                j += 1;
            }
            if found {
                continue;
            }

            // Currency heuristic
            if i + skip < len {
                let next_char = chars[i + skip];
                if next_char.is_ascii_digit() || next_char.is_whitespace() {
                    text_buf.push('$');
                    if is_display {
                        text_buf.push('$');
                    }
                    i += skip;
                    continue;
                } else {
                    flush_text(&mut text_buf, &mut nodes);
                    let inner: String = chars[i + skip..].iter().collect();
                    if is_display {
                        nodes.push(LatexNode::DisplayMath(inner));
                    } else {
                        nodes.push(LatexNode::InlineMath(inner));
                    }
                    break;
                }
            } else {
                text_buf.push('$');
                if is_display {
                    text_buf.push('$');
                }
                break;
            }
        }

        text_buf.push(chars[i]);
        i += 1;
    }

    flush_text(&mut text_buf, &mut nodes);
    nodes
}

pub fn heal_latex(nodes: Vec<LatexNode>) -> Vec<LatexNode> {
    nodes
        .into_iter()
        .map(|node| match node {
            LatexNode::Text(text) => {
                let mut text = protect_currency(&text);
                text = repair_math_typos(&text);
                text = repair_tabular_row_breaks(&text);
                LatexNode::Text(text)
            }
            LatexNode::InlineMath(inner) => LatexNode::InlineMath(heal_math_node(&inner)),
            LatexNode::DisplayMath(inner) => LatexNode::DisplayMath(heal_math_node(&inner)),
        })
        .collect()
}

fn heal_math_node(inner: &str) -> String {
    let mut inner = inner.to_string();
    inner = repair_math_typos(&inner);
    inner = repair_fractions(&inner);
    inner = repair_tabular_row_breaks(&inner);
    inner = repair_common_math_spacing(&inner);
    inner = escape_unescaped_percent(&inner);
    balance_braces(&inner)
}

fn protect_currency(text: &str) -> String {
    static RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(^|[^\$])\$(\d)").unwrap());
    RE.replace_all(text, r"${1}\$$${2}").to_string()
}

fn balance_braces(s: &str) -> String {
    let mut inner = s.to_string();
    let mut stack = 0;
    let mut escaped = false;
    for ch in inner.chars() {
        if escaped {
            escaped = false;
            continue;
        }
        if ch == '\\' {
            escaped = true;
            continue;
        }
        if ch == '{' {
            stack += 1;
        } else if ch == '}' && stack > 0 {
            stack -= 1;
        }
    }
    for _ in 0..stack {
        inner.push('}');
    }
    inner
}

fn escape_unescaped_percent(content: &str) -> String {
    let mut result = String::with_capacity(content.len() + 4);
    let chars: Vec<char> = content.chars().collect();
    for (idx, &ch) in chars.iter().enumerate() {
        if ch == '%' {
            let mut slash_count = 0;
            let mut j = idx;
            while j > 0 && chars[j - 1] == '\\' {
                slash_count += 1;
                j -= 1;
            }
            if slash_count % 2 == 0 {
                result.push('\\');
            }
        }
        result.push(ch);
    }
    result
}

fn repair_math_typos(text: &str) -> String {
    let mut text = repair_backspace_latex_prefixes(text);
    text = text.replace("\\fty", "\\infty");

    static RE_B: Lazy<Regex> = Lazy::new(|| Regex::new(r"\\b([a-zA-Z]+)").unwrap());

    const COMMANDS: &[&str] = &[
        "alpha", "approx", "bar", "begin", "beta", "bf", "binom", "big", "Big", "bigg", "Bigg",
        "cdot", "cos", "cosh", "delta", "div", "end", "epsilon", "equiv", "eta", "exists", "frac",
        "forall", "gamma", "geq", "hat", "in", "infty", "int", "lambda", "leq", "ln", "log",
        "mathbb", "mathcal", "mathfrak", "mathrm", "mathsf", "mathbf", "min", "mod", "nabla",
        "natural", "neg", "neq", "nu", "omega", "phi", "pi", "pm", "prod", "rho", "sigma", "sin",
        "sinh", "sqrt", "sum", "tan", "tanh", "tau", "theta", "times", "vec", "xi", "zeta",
    ];

    RE_B.replace_all(&text, |caps: &Captures| {
        let cmd = &caps[1];
        if COMMANDS.contains(&cmd) {
            let b_prefixed_is_valid = COMMANDS.iter().any(|&c| c == format!("b{}", cmd));
            if cmd.starts_with('b') || b_prefixed_is_valid {
                format!("\\b{}", cmd)
            } else {
                format!("\\{}", cmd)
            }
        } else {
            format!("\\b{}", cmd)
        }
    })
    .to_string()
}

fn repair_backspace_latex_prefixes(text: &str) -> String {
    const COMMANDS: &[&str] = &[
        "beta",
        "bar",
        "bf",
        "begin",
        "binom",
        "big",
        "Big",
        "bigg",
        "Bigg",
        "bot",
        "bullet",
        "bmod",
        "bowtie",
        "backslash",
        "bmatrix",
        "bmathbb",
    ];

    let mut out = text.to_string();
    for cmd in COMMANDS {
        let suffix = &cmd[1..];
        let bad = format!("\u{0008}{}", suffix);
        let good = format!("\\{}", cmd);
        out = out.replace(&bad, &good);
    }
    out
}

fn repair_fractions(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '\\' && text[i..].starts_with("\\frac") {
            let rest = &text[i + 5..];
            if let Some((num, num_len, den, den_len)) = extract_frac_args(rest) {
                out.push_str(&format!("\\frac{{{}}}{{{}}}", num, den));
                i += 5 + num_len + den_len;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

fn extract_frac_args(s: &str) -> Option<(String, usize, String, usize)> {
    let (num, num_len) = extract_math_arg(s)?;
    let (den, den_len) = extract_math_arg(&s[num_len..]).unwrap_or(("".to_string(), 0));
    Some((num, num_len, den, den_len))
}

fn extract_math_arg(s: &str) -> Option<(String, usize)> {
    let trimmed = s.trim_start();
    let offset = s.len() - trimmed.len();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(rest) = trimmed.strip_prefix('{') {
        if let Some((content, consumed)) = first_brace_group(trimmed) {
            Some((content, consumed + offset))
        } else {
            let content = rest.to_string();
            let consumed = trimmed.len();
            Some((content, consumed + offset))
        }
    } else if let Some(rest) = trimmed.strip_prefix('\\') {
        let cmd_len = rest.chars().take_while(|c| c.is_ascii_alphabetic()).count() + 1;
        Some((trimmed[..cmd_len].to_string(), cmd_len + offset))
    } else {
        let first = trimmed.chars().next()?;
        Some((first.to_string(), first.len_utf8() + offset))
    }
}

fn repair_common_math_spacing(s: &str) -> String {
    static RE: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"\\(sin|cos|tan|log|ln|lim)([^a-zA-Z\s])").unwrap());
    RE.replace_all(s, r"\${1} ${2}").to_string()
}

fn repair_tabular_row_breaks(s: &str) -> String {
    static RE_RULE: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"(^|[^\\])\\\s*\\(hline|cline|cmidrule|[atbm]rule)").unwrap());
    let mut out = RE_RULE.replace_all(s, r"${1}\\ \${2}").to_string();

    static RE_DIGIT: Lazy<Regex> = Lazy::new(|| Regex::new(r"(^|[^\\])\\\s*(\d)").unwrap());
    out = RE_DIGIT.replace_all(&out, r"${1}\\${2}").to_string();
    out
}

pub fn render_latex(nodes: &[LatexNode]) -> String {
    nodes
        .iter()
        .map(|node| match node {
            LatexNode::Text(t) => t.clone(),
            LatexNode::InlineMath(m) => format!("${}$", m),
            LatexNode::DisplayMath(m) => format!("$${}$$", m),
        })
        .collect()
}

pub fn first_brace_group(content: &str) -> Option<(String, usize)> {
    if !content.starts_with('{') {
        return None;
    }
    let mut depth = 0;
    let mut escaped = false;
    for (i, ch) in content.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if ch == '\\' {
            escaped = true;
            continue;
        }
        if ch == '{' {
            depth += 1;
        } else if ch == '}' {
            depth -= 1;
            if depth == 0 {
                return Some((content[1..i].to_string(), i + 1));
            }
        }
    }
    None
}

pub fn latex_semantic_issues(segment: &str) -> Vec<String> {
    let mut issues = Vec::new();
    issues.extend(table_rule_row_break_issues(segment));

    static RE_FRAC: Lazy<Regex> = Lazy::new(|| Regex::new(r"\\(d|t)?frac").unwrap());
    for mat in RE_FRAC.find_iter(segment) {
        let rest = &segment[mat.end()..];
        if let Some((num, _, den, _)) = extract_frac_args(rest) {
            if num.trim().is_empty() {
                issues.push(format!("{} has empty numerator", mat.as_str()));
            }
            if den.trim().is_empty() {
                issues.push(format!("{} has empty denominator", mat.as_str()));
            }
        } else {
            issues.push(format!("{} missing braces", mat.as_str()));
        }
    }
    issues
}

fn table_rule_row_break_issues(segment: &str) -> Vec<String> {
    static RE: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"(^|[^\\])\\\s*\\(hline|cline|cmidrule|[atbm]rule)").unwrap());
    RE.captures_iter(segment)
        .map(|cap| {
            format!(
                "table rule \\{} needs a row break of \\\\ before it",
                &cap[2]
            )
        })
        .collect()
}

pub fn latex_issues_for_text(text: &str) -> Vec<String> {
    let nodes = lex(text);
    let mut issues = Vec::new();
    for node in nodes {
        match node {
            LatexNode::InlineMath(m) => issues.extend(
                latex_semantic_issues(&m)
                    .into_iter()
                    .map(|i| format!("inline math {}", i)),
            ),
            LatexNode::DisplayMath(m) => issues.extend(
                latex_semantic_issues(&m)
                    .into_iter()
                    .map(|i| format!("display math {}", i)),
            ),
            LatexNode::Text(t) => {
                issues.extend(
                    table_rule_row_break_issues(&t)
                        .into_iter()
                        .map(|i| format!("text {}", i)),
                );
                if t.contains("\\frac") || t.contains("\\dfrac") {
                    issues.push("\\frac found outside math delimiters".to_string());
                }
            }
        }
    }
    issues
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::text_clean::clean_field;

    #[test]
    fn lexer_extracts_math_correctly() {
        let nodes = lex("Compute $x+1$ and $$y=2$$");
        assert_eq!(nodes.len(), 4);
        assert!(matches!(nodes[1], LatexNode::InlineMath(_)));
    }

    #[test]
    fn healer_autocloses_delimiters() {
        let nodes = lex("Compute $x+1");
        assert_eq!(nodes.len(), 2);
        assert_eq!(nodes[1], LatexNode::InlineMath("x+1".to_string()));
    }

    #[test]
    fn healer_autocloses_braces() {
        let healed = heal_latex(lex("Compute $\\frac{1}{2"));
        let rendered = render_latex(&healed);
        assert_eq!(rendered, "Compute $\\frac{1}{2}$");
    }

    #[test]
    fn healer_protects_currency() {
        let healed = heal_latex(lex("It costs $50"));
        let rendered = render_latex(&healed);
        assert_eq!(rendered, "It costs \\$50");
    }

    #[test]
    fn latex_issue_detector_flags_empty_fraction_parts() {
        let issues = latex_issues_for_text("Compute $\\frac{}{x}$ and $\\frac{y}{}$.");
        assert!(issues.iter().any(|i| i.contains("empty numerator")));
        assert!(issues.iter().any(|i| i.contains("empty denominator")));
    }

    #[test]
    fn healer_pads_missing_fractions() {
        let healed = heal_latex(lex(
            "Compute $\\frac{1}$ and $\\frac12$ and $\\frac \\pi 2$",
        ));
        let rendered = render_latex(&healed);
        assert_eq!(
            rendered,
            "Compute $\\frac{1}{}$ and $\\frac{1}{2}$ and $\\frac{\\pi}{2}$"
        );
    }

    #[test]
    fn healer_escapes_unescaped_percent_in_math() {
        let healed = heal_latex(lex("Rate is $50%$"));
        let rendered = render_latex(&healed);
        assert_eq!(rendered, "Rate is $50\\%$");
    }

    #[test]
    fn healer_keeps_escaped_percent_in_math() {
        let healed = heal_latex(lex("Rate is $50\\%$"));
        let rendered = render_latex(&healed);
        assert_eq!(rendered, "Rate is $50\\%$");
    }

    #[test]
    fn latex_issue_detector_flags_misplaced_hline_row_breaks() {
        let issues = latex_issues_for_text(r"\begin{array}{c|c} x & 1 \ \hline y & 2 \end{array}");
        assert!(issues.iter().any(|i| i.contains("needs a row break")));
    }

    #[test]
    fn latex_issue_detector_accepts_valid_hline_row_breaks() {
        let issues = latex_issues_for_text(r"\begin{array}{c|c} x & 1 \\ \hline y & 2 \end{array}");
        assert!(issues.is_empty(), "unexpected issues: {issues:?}");
    }

    #[test]
    fn repair_backspace_control_character_before_binom() {
        assert_eq!(clean_field("P(X)=\u{0008}inom{4}{2}"), r"P(X)=\binom{4}{2}");
    }
}
