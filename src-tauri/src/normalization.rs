use crate::constants::{
    DISALLOWED_METHOD_INSTRUCTIONS, DISALLOWED_SELF_TALK, MC_MAX_EXPLANATION_WORDS,
};
use crate::models::{default_max_marks, AppError, CommandResult, GeneratedQuestion, McQuestion};
use crate::text_clean::clean_field;
use crate::topic_normalize::normalise_topic_and_subtopic;
use once_cell::sync::Lazy;
use regex::Regex;

static RE_AFTER_MARK: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(\[\d+\s*marks?\])[^\S\r\n]*([^\r\n])").unwrap());
// Matches a non-newline, non-$, non-word character immediately before a part label.
// Excluding \w prevents false positives for non-math prose like "function g(a)".
// This regex is applied only outside $...$ math regions (see apply_re_before_part_outside_math).
static RE_BEFORE_PART: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"([^\r\n\$\w])[^\S\r\n]*(\([a-g]\))").unwrap());

/// Apply RE_BEFORE_PART only to text that lies outside $...$ or $$...$$ math regions.
/// This prevents false positives like inserting a newline inside $f'(a)$ or $g(a)$.
fn apply_re_before_part_outside_math(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let chars: Vec<char> = s.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        if chars[i] == '$' {
            // Determine whether this is display math ($$) or inline math ($).
            let is_display = i + 1 < len && chars[i + 1] == '$';
            let (open_len, close_pat): (usize, &[char]) = if is_display {
                (2, &['$', '$'])
            } else {
                (1, &['$'])
            };

            // Copy the opening delimiter.
            for c in &chars[i..i + open_len] {
                result.push(*c);
            }
            i += open_len;

            // Copy math content until the matching closing delimiter (or end of string).
            while i < len {
                if chars[i..].starts_with(close_pat) {
                    for c in close_pat {
                        result.push(*c);
                    }
                    i += close_pat.len();
                    break;
                }
                result.push(chars[i]);
                i += 1;
            }
            // If the delimiter was never closed, all content was already copied above.
        } else {
            // Collect the non-math segment up to the next $.
            let start = i;
            while i < len && chars[i] != '$' {
                i += 1;
            }
            let segment: String = chars[start..i].iter().collect();
            let processed = RE_BEFORE_PART.replace_all(&segment, |caps: &regex::Captures| {
                let prefix = &caps[1];
                let label = &caps[2];
                // When the captured prefix is pure horizontal whitespace, drop it so the
                // newline replaces the space entirely (e.g. "$$...$$ (a)" → "$$...$$\n(a)").
                if prefix.chars().all(|c| c != '\r' && c != '\n' && c.is_whitespace()) {
                    format!("\n{label}")
                } else {
                    format!("{prefix}\n{label}")
                }
            });
            result.push_str(&processed);
        }
    }

    result
}

fn fix_prompt_newlines(s: &str) -> String {
    // RE_AFTER_MARK is safe to apply globally: [X marks] never appears inside $...$.
    let s = RE_AFTER_MARK.replace_all(s, "$1\n$2");
    // RE_BEFORE_PART must only run on non-math text to avoid corrupting LaTeX like $f'(a)$.
    apply_re_before_part_outside_math(&s)
}

fn sole_selected_subtopic(selected_subtopics: Option<&Vec<String>>) -> Option<&str> {
    selected_subtopics
        .filter(|s| s.len() == 1)
        .and_then(|s| s.first())
        .map(|s| s.as_str())
}

fn normalise_common_fields(
    topic: &mut String,
    subtopic: &mut Option<String>,
    selected_topics: &[String],
    sole_subtopic: Option<&str>,
) {
    *topic = topic.trim().to_string();
    *subtopic = subtopic
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| sole_subtopic.map(|s| s.to_string()));

    normalise_topic_and_subtopic(topic, subtopic, selected_topics, sole_subtopic);
}

pub fn normalise_written(
    questions: &mut [GeneratedQuestion],
    selected_topics: &[String],
    selected_subtopics: Option<&Vec<String>>,
) {
    let sole_subtopic = sole_selected_subtopic(selected_subtopics);
    for (idx, q) in questions.iter_mut().enumerate() {
        q.id = format!("q{}", idx + 1);
        normalise_common_fields(
            &mut q.topic,
            &mut q.subtopic,
            selected_topics,
            sole_subtopic,
        );
        q.prompt_markdown = fix_prompt_newlines(&clean_field(q.prompt_markdown.trim()));
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
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} missing topic.", q.id),
            ));
        }
        if q.prompt_markdown.is_empty() {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} has empty prompt.", q.id),
            ));
        }
        let prompt_lower = q.prompt_markdown.to_lowercase();
        if DISALLOWED_METHOD_INSTRUCTIONS
            .iter()
            .any(|m| prompt_lower.contains(m))
        {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} prompt contains method instructions.", q.id),
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

pub fn normalise_mc(
    questions: &mut [McQuestion],
    selected_topics: &[String],
    selected_subtopics: Option<&Vec<String>>,
) {
    let sole_subtopic = sole_selected_subtopic(selected_subtopics);
    for (idx, q) in questions.iter_mut().enumerate() {
        q.id = format!("mc{}", idx + 1);
        normalise_common_fields(
            &mut q.topic,
            &mut q.subtopic,
            selected_topics,
            sole_subtopic,
        );
        q.prompt_markdown = fix_prompt_newlines(&clean_field(q.prompt_markdown.trim()));
        q.explanation_markdown = clean_field(q.explanation_markdown.trim());
        q.correct_answer = q.correct_answer.trim().to_uppercase();
        for opt in &mut q.options {
            opt.label = opt.label.trim().to_uppercase();
            opt.text = clean_field(opt.text.trim());
        }
        q.options.sort_by(|a, b| a.label.cmp(&b.label));
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
        let prompt_lower = q.prompt_markdown.to_lowercase();
        if DISALLOWED_METHOD_INSTRUCTIONS
            .iter()
            .any(|m| prompt_lower.contains(m))
        {
            return Err(AppError::new(
                "VALIDATION_ERROR",
                format!("Q{} prompt contains method instructions.", q.id),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fix_prompt_newlines() {
        let cases = vec![
            (
                "Find $x$. [2 marks](a) Find $y$.",
                "Find $x$. [2 marks]\n(a) Find $y$.",
            ),
            ("Some text. (a) More text.", "Some text.\n(a) More text."),
            ("Let $(a)$ be a constant.", "Let $(a)$ be a constant."),
            ("Compute [1 mark] (b)", "Compute [1 mark]\n(b)"),
            (
                "Multiple parts [1 mark](a) Part 1 [2 marks](b) Part 2",
                "Multiple parts [1 mark]\n(a) Part 1 [2 marks]\n(b) Part 2",
            ),
            // Math function notation must not trigger newline insertion inside $...$.
            (
                "Let $f(a)$ be defined. [2 marks]",
                "Let $f(a)$ be defined. [2 marks]",
            ),
            (
                "Given $f(a) = a^2$. (a) Find $f(3)$. [2 marks](b) Find $f'(a)$. [3 marks]",
                "Given $f(a) = a^2$.\n(a) Find $f(3)$. [2 marks]\n(b) Find $f'(a)$. [3 marks]",
            ),
            // Trailing mark with nothing after it — no extra newline.
            ("(a) Solve for $x$. [3 marks]", "(a) Solve for $x$. [3 marks]"),
            // Part label after colon.
            (
                "Consider: (a) Part one [1 mark](b) Part two [2 marks]",
                "Consider:\n(a) Part one [1 mark]\n(b) Part two [2 marks]",
            ),
            // Space between display math and part label is absorbed into the newline.
            (
                "$$f(a) = a^2$$ (a) Find the value. [2 marks]",
                "$$f(a) = a^2$$\n(a) Find the value. [2 marks]",
            ),
        ];

        for (input, expected) in cases {
            assert_eq!(fix_prompt_newlines(input), expected);
        }
    }

    #[test]
    fn test_normalise_written() {
        let mut questions = vec![GeneratedQuestion {
            id: "".to_string(),
            topic: " Math Methods ".to_string(),
            subtopic: Some(" Totally Unique Subtopic ".to_string()),
            prompt_markdown: "Solve this. [2 marks](a) Next part.".to_string(),
            max_marks: 2,
            tech_allowed: true,
            distinctness_score: None,
            multi_step_depth: None,
            verb_diversity_count: None,
            scaffold_pattern: None,
        }];
        let selected_topics = vec!["Mathematical Methods".to_string()];

        normalise_written(&mut questions, &selected_topics, None);

        assert_eq!(questions[0].id, "q1");
        assert_eq!(questions[0].topic, "Mathematical Methods");
        assert_eq!(
            questions[0].subtopic,
            Some("Totally Unique Subtopic".to_string())
        );
        assert_eq!(
            questions[0].prompt_markdown,
            "Solve this. [2 marks]\n(a) Next part."
        );
    }

    #[test]
    fn test_validate_written_success() {
        let questions = vec![GeneratedQuestion {
            id: "q1".to_string(),
            topic: "Topic".to_string(),
            subtopic: None,
            prompt_markdown: "Prompt [1 mark]".to_string(),
            max_marks: 1,
            tech_allowed: true,
            distinctness_score: None,
            multi_step_depth: None,
            verb_diversity_count: None,
            scaffold_pattern: None,
        }];
        assert!(validate_written(&questions, 1).is_ok());
    }

    #[test]
    fn test_validate_written_fails_on_disallowed_instructions() {
        let questions = vec![GeneratedQuestion {
            id: "q1".to_string(),
            topic: "Topic".to_string(),
            subtopic: None,
            prompt_markdown: "Prompt using integration by parts [1 mark]".to_string(),
            max_marks: 1,
            tech_allowed: true,
            distinctness_score: None,
            multi_step_depth: None,
            verb_diversity_count: None,
            scaffold_pattern: None,
        }];
        let result = validate_written(&questions, 1);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, "VALIDATION_ERROR");
    }

    #[test]
    fn test_normalise_mc() {
        let mut questions = vec![McQuestion {
            id: "".to_string(),
            topic: "Topic".to_string(),
            subtopic: None,
            prompt_markdown: "Prompt".to_string(),
            options: vec![
                crate::models::McOption {
                    label: "b".to_string(),
                    text: "opt b".to_string(),
                },
                crate::models::McOption {
                    label: "a".to_string(),
                    text: "opt a".to_string(),
                },
                crate::models::McOption {
                    label: "d".to_string(),
                    text: "opt d".to_string(),
                },
                crate::models::McOption {
                    label: "c".to_string(),
                    text: "opt c".to_string(),
                },
            ],
            correct_answer: " a ".to_string(),
            explanation_markdown: " Explanation ".to_string(),
            tech_allowed: true,
            distinctness_score: None,
            multi_step_depth: None,
            verb_diversity_count: None,
            scaffold_pattern: None,
        }];

        normalise_mc(&mut questions, &["Topic".to_string()], None);

        assert_eq!(questions[0].id, "mc1");
        assert_eq!(questions[0].options[0].label, "A");
        assert_eq!(questions[0].options[1].label, "B");
        assert_eq!(questions[0].correct_answer, "A");
        assert_eq!(questions[0].explanation_markdown, "Explanation");
    }
}
