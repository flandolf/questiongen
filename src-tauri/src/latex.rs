#[derive(Debug, Clone, PartialEq)]
pub enum LatexNode {
    Text(String),
    InlineMath(String),
    DisplayMath(String),
}

/// Lexes a string into a sequence of Text, InlineMath, and DisplayMath nodes.
pub fn lex(text: &str) -> Vec<LatexNode> {
    let mut nodes = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();
    let mut i = 0;
    let mut text_buf = String::new();

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
                // Unclosed delimiter \( or \[.
                // We auto-close it at the end of the string.
                flush_text(&mut text_buf, &mut nodes);
                let inner: String = chars[i + 2..].iter().collect();
                if is_display {
                    nodes.push(LatexNode::DisplayMath(inner));
                } else {
                    nodes.push(LatexNode::InlineMath(inner));
                }
                break;
            } else if next == '\\' {
                // Escaped backslash
                text_buf.push('\\');
                text_buf.push('\\');
                i += 2;
                continue;
            } else if next == '$' {
                // Escaped dollar \$
                text_buf.push('\\');
                text_buf.push('$');
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
                    // Escaped dollar inside math.
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
                    // Check if it's $$
                    if j + 1 < len && chars[j + 1] == '$' {
                        // Usually doesn't happen.
                    }
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

            // If not closed, could be currency or unclosed math.
            // Heuristic: if it's `$`, and the next char is a digit, it's currency.
            // If it's a space, it's currency/text.
            // Else, treat as unclosed math and auto-close at EOF.
            if i + skip < len {
                let next_char = chars[i + skip];
                if next_char.is_ascii_digit() || next_char.is_whitespace() {
                    // Currency or random $
                    text_buf.push('$');
                    if is_display {
                        text_buf.push('$');
                    }
                    i += skip;
                    continue;
                } else {
                    // Unclosed math
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
                // $ at end of string
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

/// Applies self-healing to LaTeX nodes: brace balancing, typo fixing, etc.
pub fn heal_latex(nodes: Vec<LatexNode>) -> Vec<LatexNode> {
    nodes
        .into_iter()
        .map(|node| {
            match node {
                LatexNode::Text(mut text) => {
                    // Protect bare currency dollars in Text nodes
                    let mut out = String::with_capacity(text.len());
                    let chars: Vec<char> = text.chars().collect();
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
                    text = out;

                    // Apply typo fixes to Text because LLMs often omit math delimiters for tables/math commands
                    text = repair_math_typos(&text);
                    text = repair_tabular_row_breaks(&text);

                    LatexNode::Text(text)
                }
                LatexNode::InlineMath(inner) => LatexNode::InlineMath(heal_math_node(&inner)),
                LatexNode::DisplayMath(inner) => LatexNode::DisplayMath(heal_math_node(&inner)),
            }
        })
        .collect()
}

fn heal_math_node(inner: &str) -> String {
    let mut inner = inner.to_string();

    // Typo fixing
    inner = repair_math_typos(&inner);

    // Fraction repair (\frac12 -> \frac{1}{2})
    inner = repair_fractions(&inner);

    // Repair tabular row breaks
    inner = repair_tabular_row_breaks(&inner);

    // Auto-balancing braces {} only, as [] and () can be unbalanced in intervals
    let mut stack = Vec::new();
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
            stack.push('}');
        } else if ch == '}' && stack.last() == Some(&'}') {
            stack.pop();
        }
    }
    while let Some(ch) = stack.pop() {
        inner.push(ch);
    }

    inner
}

fn repair_math_typos(text: &str) -> String {
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

fn repair_fractions(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 10);
    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        if chars[i] == '\\' && i + 4 < len {
            let command: String = chars[i + 1..i + 5].iter().collect();
            if command == "frac" {
                out.push_str("\\frac");
                i += 5;

                // Helper to extract next part (either a brace group or a single char)
                let mut get_part = || -> Option<String> {
                    while i < len && chars[i].is_whitespace() {
                        i += 1;
                    }
                    if i >= len {
                        return None;
                    }
                    if chars[i] == '{' {
                        let mut part = String::new();
                        let mut depth = 1;
                        let mut escaped = false;
                        part.push('{');
                        i += 1;
                        while i < len {
                            let ch = chars[i];
                            part.push(ch);
                            if escaped {
                                escaped = false;
                            } else if ch == '\\' {
                                escaped = true;
                            } else if ch == '{' {
                                depth += 1;
                            } else if ch == '}' {
                                depth -= 1;
                                if depth == 0 {
                                    i += 1;
                                    break;
                                }
                            }
                            i += 1;
                        }
                        Some(part)
                    } else if chars[i] == '\\' {
                        // Could be a command like \pi
                        let mut part = String::new();
                        part.push('{');
                        part.push('\\');
                        i += 1;
                        while i < len && chars[i].is_ascii_alphabetic() {
                            part.push(chars[i]);
                            i += 1;
                        }
                        part.push('}');
                        Some(part)
                    } else {
                        // Single char
                        let part = format!("{{{}}}", chars[i]);
                        i += 1;
                        Some(part)
                    }
                };

                let numerator = get_part().unwrap_or_else(|| "{}".to_string());
                let denominator = get_part().unwrap_or_else(|| "{}".to_string());

                out.push_str(&numerator);
                out.push_str(&denominator);
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }

    out
}

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
            let mut run_end = i + 1;
            while run_end < len && chars[run_end] == '\\' {
                run_end += 1;
            }

            if run_end > i + 1 {
                for _ in i..run_end {
                    out.push('\\');
                }
                i = run_end;
                continue;
            }

            let mut j = run_end;
            while j < len && chars[j].is_whitespace() {
                j += 1;
            }

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

fn table_rule_row_break_issues(segment: &str) -> Vec<String> {
    const RULE_COMMANDS: [&str; 6] = [
        "hline",
        "cline",
        "cmidrule",
        "toprule",
        "midrule",
        "bottomrule",
    ];

    let chars: Vec<char> = segment.chars().collect();
    let len = chars.len();
    let mut issues = Vec::new();
    let mut i = 0usize;

    while i < len {
        if chars[i] == '\\' {
            let mut cmd_end = i + 1;
            while cmd_end < len && chars[cmd_end].is_ascii_alphabetic() {
                cmd_end += 1;
            }

            if cmd_end > i + 1 {
                let command: String = chars[i + 1..cmd_end].iter().collect();
                if RULE_COMMANDS.iter().any(|candidate| candidate == &command) {
                    let mut back = i;
                    while back > 0 && chars[back - 1].is_whitespace() {
                        back -= 1;
                    }

                    if back > 0 && chars[back - 1] == '\\' && (back < 2 || chars[back - 2] != '\\')
                    {
                        issues.push(format!(
                            "table rule \\{} needs a row break of \\\\ before it; single \\ causes Misplaced \\hline",
                            command
                        ));
                    }
                }
            }

            i = cmd_end;
            continue;
        }

        i += 1;
    }

    issues
}

pub fn render_latex(nodes: &[LatexNode]) -> String {
    let mut out = String::new();
    for node in nodes {
        match node {
            LatexNode::Text(t) => out.push_str(t),
            LatexNode::InlineMath(m) => {
                out.push('$');
                out.push_str(m);
                out.push('$');
            }
            LatexNode::DisplayMath(m) => {
                out.push_str("$$");
                out.push_str(m);
                out.push_str("$$");
            }
        }
    }
    out
}

pub fn first_brace_group(content: &str) -> Option<(String, usize)> {
    let mut chars = content.chars();
    if chars.next()? != '{' {
        return None;
    }

    let mut depth = 1usize;
    let mut consumed = 1usize;
    let mut out = String::new();
    let mut escaped = false;

    for ch in chars {
        consumed += ch.len_utf8();
        if escaped {
            out.push(ch);
            escaped = false;
            continue;
        }
        if ch == '\\' {
            out.push(ch);
            escaped = true;
            continue;
        }
        if ch == '{' {
            depth += 1;
            out.push(ch);
            continue;
        }
        if ch == '}' {
            depth -= 1;
            if depth == 0 {
                return Some((out, consumed));
            }
            out.push(ch);
            continue;
        }
        out.push(ch);
    }

    None
}

pub fn latex_semantic_issues(segment: &str) -> Vec<String> {
    let mut issues = Vec::new();

    issues.extend(table_rule_row_break_issues(segment));

    let mut i = 0usize;
    let bytes = segment.as_bytes();

    while i < bytes.len() {
        if bytes[i] != b'\\' {
            i += 1;
            continue;
        }

        let mut j = i + 1;
        while j < bytes.len() && bytes[j].is_ascii_alphabetic() {
            j += 1;
        }
        if j == i + 1 {
            i += 1;
            continue;
        }

        let command = &segment[i + 1..j];
        if matches!(command, "frac" | "dfrac" | "tfrac") {
            let after = &segment[j..];
            let Some((numerator, used_numerator)) = first_brace_group(after) else {
                issues.push(format!("\\{} missing numerator braces", command));
                i = j;
                continue;
            };
            let after_numerator = &after[used_numerator..];
            let Some((denominator, used_denominator)) = first_brace_group(after_numerator) else {
                issues.push(format!("\\{} missing denominator braces", command));
                i = j + used_numerator;
                continue;
            };

            if numerator.trim().is_empty() {
                issues.push(format!("\\{} has empty numerator", command));
            }
            if denominator.trim().is_empty() {
                issues.push(format!("\\{} has empty denominator", command));
            }

            i = j + used_numerator + used_denominator;
            continue;
        }

        i = j;
    }

    issues
}

pub fn latex_issues_for_text(text: &str) -> Vec<String> {
    let nodes = lex(text);
    let mut issues = Vec::new();

    for node in nodes {
        match node {
            LatexNode::InlineMath(inner) => {
                for issue in latex_semantic_issues(&inner) {
                    issues.push(format!("inline math {}", issue));
                }
            }
            LatexNode::DisplayMath(inner) => {
                for issue in latex_semantic_issues(&inner) {
                    issues.push(format!("display math {}", issue));
                }
            }
            LatexNode::Text(inner) => {
                if inner.contains("\\frac") || inner.contains("\\dfrac") {
                    issues.push("\\frac found outside math delimiters".to_string());
                }
            }
        }
    }

    // Because our Lexer/Healer automatically auto-closes math tags and braces,
    // we no longer emit "unclosed inline math delimiter" or "mismatched braces" errors here.
    // The rendered output will simply have them closed, which is what we want!
    // We only fail on deep semantic issues (like empty fractions).

    issues
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lexer_extracts_math_correctly() {
        let nodes = lex("Compute $x+1$ and $$y=2$$");
        assert_eq!(nodes.len(), 4); // "Compute ", InlineMath("x+1"), " and ", DisplayMath("y=2")
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
    fn latex_issue_detector_flags_misplaced_hline_row_breaks() {
        let issues = latex_issues_for_text(r"\begin{array}{c|c} x & 1 \ \hline y & 2 \end{array}");
        assert!(
            issues.iter().any(|i| i.contains("Misplaced \\hline")),
            "expected misplaced hline issue, got {issues:?}"
        );
    }

    #[test]
    fn latex_issue_detector_accepts_valid_hline_row_breaks() {
        let issues = latex_issues_for_text(r"\begin{array}{c|c} x & 1 \\ \hline y & 2 \end{array}");
        assert!(issues.is_empty(), "unexpected issues: {issues:?}");
    }
}
