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
                text = replace_unicode_symbols(&text, false);
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
    inner = replace_unicode_symbols(&inner, true);
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

fn latex_unicode_command(ch: char, in_math_mode: bool) -> Option<&'static str> {
    match ch {
        '\u{00B1}' => Some("pm"),
        '\u{00D7}' => Some("times"),
        '\u{00F7}' => Some("div"),
        '\u{2212}' => Some("minus"),
        '\u{221E}' => Some("infty"),
        '\u{2202}' => Some("partial"),
        '\u{2211}' => Some("sum"),
        '\u{220F}' => Some("prod"),
        '\u{222B}' => Some("int"),
        '\u{2208}' => Some("in"),
        '\u{2209}' => Some("notin"),
        '\u{220A}' => Some("ni"),
        '\u{2283}' => Some("supset"),
        '\u{2282}' => Some("subset"),
        '\u{2286}' => Some("subseteq"),
        '\u{2287}' => Some("supseteq"),
        '\u{2260}' => Some("neq"),
        '\u{2264}' => Some("leq"),
        '\u{2265}' => Some("geq"),
        '\u{2248}' => Some("approx"),
        '\u{2261}' => Some("equiv"),
        '\u{2200}' => Some("forall"),
        '\u{2203}' => Some("exists"),
        '\u{2227}' => Some("wedge"),
        '\u{2228}' => Some("vee"),
        '\u{00AC}' => Some("neg"),
        '\u{2190}' => Some("leftarrow"),
        '\u{2192}' => Some("rightarrow"),
        '\u{2194}' => Some("leftrightarrow"),
        '\u{21D0}' => Some("Leftarrow"),
        '\u{21D2}' => Some("Rightarrow"),
        '\u{21D4}' => Some("Leftrightarrow"),
        '\u{03B1}' if in_math_mode => Some("alpha"),
        '\u{03B2}' if in_math_mode => Some("beta"),
        '\u{03B3}' if in_math_mode => Some("gamma"),
        '\u{03B4}' if in_math_mode => Some("delta"),
        '\u{03B5}' if in_math_mode => Some("epsilon"),
        '\u{03B8}' if in_math_mode => Some("theta"),
        '\u{03BB}' if in_math_mode => Some("lambda"),
        '\u{03BC}' if in_math_mode => Some("mu"),
        '\u{03C0}' if in_math_mode => Some("pi"),
        '\u{03C1}' if in_math_mode => Some("rho"),
        '\u{03C3}' if in_math_mode => Some("sigma"),
        '\u{03C4}' if in_math_mode => Some("tau"),
        '\u{03C6}' if in_math_mode => Some("phi"),
        '\u{03C9}' if in_math_mode => Some("omega"),
        '\u{0394}' if in_math_mode => Some("Delta"),
        '\u{0398}' if in_math_mode => Some("Theta"),
        '\u{039B}' if in_math_mode => Some("Lambda"),
        '\u{03A0}' if in_math_mode => Some("Pi"),
        '\u{03A3}' if in_math_mode => Some("Sigma"),
        '\u{03A6}' if in_math_mode => Some("Phi"),
        '\u{03A9}' if in_math_mode => Some("Omega"),
        '\u{2115}' if in_math_mode => Some("mathbb{N}"),
        '\u{2124}' if in_math_mode => Some("mathbb{Z}"),
        '\u{211A}' if in_math_mode => Some("mathbb{Q}"),
        '\u{211D}' if in_math_mode => Some("mathbb{R}"),
        '\u{2102}' if in_math_mode => Some("mathbb{C}"),
        _ => None,
    }
}

fn replace_unicode_symbols(text: &str, in_math_mode: bool) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len() + 8);

    for (idx, &ch) in chars.iter().enumerate() {
        if let Some(latex_cmd) = latex_unicode_command(ch, in_math_mode) {
            out.push('\\');
            out.push_str(latex_cmd);
            if idx + 1 < chars.len() && chars[idx + 1].is_ascii_alphabetic() {
                out.push(' ');
            }
            continue;
        }

        if !in_math_mode {
            match ch {
                '\u{00B0}' => {
                    out.push_str("$^\\circ$");
                    continue;
                }
                '\u{00B5}' => {
                    out.push_str("$\\mu$");
                    continue;
                }
                _ => {}
            }
        }

        out.push(ch);
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

    #[test]
    fn healer_replaces_unicode_math_symbols() {
        let healed = heal_latex(lex("Find $x≤2$, $π≈3.14$, and $n∈ℕ$"));
        let rendered = render_latex(&healed);
        assert_eq!(
            rendered,
            "Find $x\\leq2$, $\\pi\\approx3.14$, and $n\\in\\mathbb{N}$"
        );
    }

    #[test]
    fn healer_adds_command_boundary_space_after_unicode_replacement() {
        let healed = heal_latex(lex("Compute $∞x$ and $αbeta$"));
        let rendered = render_latex(&healed);
        assert_eq!(rendered, "Compute $\\infty x$ and $\\alpha beta$");
    }

    #[test]
    fn healer_replaces_basic_unicode_in_text_nodes() {
        let healed = heal_latex(lex("Use ± and × and ≤ in notes"));
        let rendered = render_latex(&healed);
        assert_eq!(rendered, "Use \\pm and \\times and \\leq in notes");
    }

    #[test]
    fn healer_keeps_greek_unicode_unchanged_in_text_nodes() {
        let healed = heal_latex(lex("café αβγ"));
        let rendered = render_latex(&healed);
        assert_eq!(rendered, "café αβγ");
    }
}
