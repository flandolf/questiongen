pub fn latex_brace_issues(segment: &str) -> Option<String> {
    let mut stack: Vec<char> = Vec::new();
    let mut chars = segment.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            let _ = chars.next();
            continue;
        }
        match ch {
            '{' | '[' | '(' => stack.push(ch),
            '}' => {
                if stack.pop() != Some('{') {
                    return Some("mismatched braces".to_string());
                }
            }
            ']' => {
                if stack.pop() != Some('[') {
                    return Some("mismatched brackets".to_string());
                }
            }
            ')' => {
                if stack.pop() != Some('(') {
                    return Some("mismatched parentheses".to_string());
                }
            }
            _ => {}
        }
    }
    if stack.is_empty() {
        None
    } else {
        Some("unbalanced delimiters".to_string())
    }
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
    let mut issues = Vec::<String>::new();
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
    let mut issues = Vec::<String>::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0usize;
    let mut inline_open = false;
    let mut display_open = false;
    let mut segment_start = 0usize;
    let mut math_ranges = Vec::<(usize, usize)>::new();

    while i < chars.len() {
        let ch = chars[i];
        if ch == '\\' {
            if i + 1 < chars.len() {
                i += 2;
            } else {
                i += 1;
            }
            continue;
        }
        if ch == '$' {
            let is_display = i + 1 < chars.len() && chars[i + 1] == '$';
            if is_display {
                if display_open {
                    let segment: String = chars[segment_start..i].iter().collect();
                    if let Some(issue) = latex_brace_issues(&segment) {
                        issues.push(format!("display math {issue}"));
                    }
                    for semantic_issue in latex_semantic_issues(&segment) {
                        issues.push(format!("display math {semantic_issue}"));
                    }
                    math_ranges.push((segment_start, i));
                    display_open = false;
                } else {
                    display_open = true;
                    segment_start = i + 2;
                }
                i += 2;
                continue;
            }

            if inline_open {
                let segment: String = chars[segment_start..i].iter().collect();
                if let Some(issue) = latex_brace_issues(&segment) {
                    issues.push(format!("inline math {issue}"));
                }
                for semantic_issue in latex_semantic_issues(&segment) {
                    issues.push(format!("inline math {semantic_issue}"));
                }
                math_ranges.push((segment_start, i));
                inline_open = false;
            } else {
                inline_open = true;
                segment_start = i + 1;
            }
        }
        i += 1;
    }

    if inline_open {
        issues.push("unclosed inline math delimiter ($)".to_string());
    }
    if display_open {
        issues.push("unclosed display math delimiter ($$)".to_string());
    }

    if text.contains("\\$") && text.contains("$") {
        let mut unescaped_dollar_count = 0;
        let mut i = 0;
        let bytes = text.as_bytes();
        while i < bytes.len() {
            if bytes[i] == b'$' {
                let mut backslash_count = 0;
                let mut j = i;
                while j > 0 && bytes[j - 1] == b'\\' {
                    backslash_count += 1;
                    j -= 1;
                }
                if backslash_count % 2 == 0 {
                    unescaped_dollar_count += 1;
                }
            }
            i += 1;
        }
        if unescaped_dollar_count % 2 != 0 {
            issues.push("mixed currency/math dollar usage".to_string());
        }
    }

    let mut index = 0usize;
    while let Some(pos) = text[index..].find("\\frac") {
        let absolute_pos = index + pos;
        let char_idx = text[..absolute_pos].chars().count();
        let inside_math = math_ranges
            .iter()
            .any(|(start, end)| char_idx >= *start && char_idx < *end);
        if !inside_math {
            issues.push("\\frac found outside math delimiters".to_string());
            break;
        }
        index = absolute_pos + 5;
    }

    issues
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn latex_issue_detector_flags_unclosed_inline_math() {
        let issues = latex_issues_for_text("Solve $\\frac{x+1}{2 for x.");
        assert!(!issues.is_empty());
        assert!(issues.iter().any(|i| i.contains("unclosed inline math")));
    }

    #[test]
    fn latex_issue_detector_flags_empty_fraction_parts() {
        let issues = latex_issues_for_text("Compute $\\frac{}{x}$ and $\\frac{y}{}$.");
        assert!(issues.iter().any(|i| i.contains("empty numerator")));
        assert!(issues.iter().any(|i| i.contains("empty denominator")));
    }

    #[test]
    fn latex_issue_detector_flags_frac_outside_math_delimiters() {
        let issues = latex_issues_for_text("Compute \\frac{1}{2} as a decimal.");
        assert!(issues.iter().any(|i| i.contains("outside math delimiters")));
    }

    #[test]
    fn latex_issue_detector_handles_infty_commands() {
        let issues = latex_issues_for_text("State the domain $(-\\infty, 3]$.");
        assert!(issues.is_empty(), "unexpected issues: {issues:?}");
    }
}