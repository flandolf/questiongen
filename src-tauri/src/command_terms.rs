use crate::models::CommandTermProfile;

pub const COMMAND_TERM_PROFILES: [CommandTermProfile; 8] = [
    CommandTermProfile { key: "identify", display: "Identify", min_marks: 1, max_marks: 2, below_evaluate: true },
    CommandTermProfile { key: "describe",  display: "Describe",  min_marks: 2, max_marks: 3, below_evaluate: true },
    CommandTermProfile { key: "explain",   display: "Explain",   min_marks: 3, max_marks: 5, below_evaluate: true },
    CommandTermProfile { key: "compare",   display: "Compare",   min_marks: 3, max_marks: 5, below_evaluate: true },
    CommandTermProfile { key: "analyse",   display: "Analyse",   min_marks: 4, max_marks: 6, below_evaluate: true },
    CommandTermProfile { key: "discuss",   display: "Discuss",   min_marks: 5, max_marks: 7, below_evaluate: true },
    CommandTermProfile { key: "evaluate",  display: "Evaluate",  min_marks: 6, max_marks: 8, below_evaluate: false },
    CommandTermProfile { key: "justify",   display: "Justify",   min_marks: 5, max_marks: 7, below_evaluate: false },
];

pub fn find_command_term(value: &str) -> Option<&'static CommandTermProfile> {
    let key = value.to_ascii_lowercase();
    COMMAND_TERM_PROFILES.iter().find(|p| p.key == key)
}

/// Infer the command term from the first word of a question prompt.
pub fn infer_prompt_term(prompt: &str) -> Option<&'static CommandTermProfile> {
    let first = prompt
        .split_whitespace()
        .next()
        .map(|t| t.trim_matches(|c: char| !c.is_ascii_alphabetic()).to_ascii_lowercase())
        .unwrap_or_default();
    COMMAND_TERM_PROFILES.iter().find(|p| p.key == first)
}

/// De-duplicate and resolve a raw list of term strings.
pub fn resolve_prioritized_terms(raw: Option<&[String]>) -> Vec<&'static CommandTermProfile> {
    raw.unwrap_or(&[])
        .iter()
        .filter_map(|t| find_command_term(t.trim()))
        .fold(Vec::new(), |mut acc, p| {
            if !acc.iter().any(|x| x.key == p.key) { acc.push(p); }
            acc
        })
}

pub fn is_math_topic(topic: &str) -> bool {
    topic == "Mathematical Methods" || topic == "Specialist Mathematics"
}

/// Builds the command-term guidance line injected into generation prompts.
pub fn command_term_note(terms: &[&'static CommandTermProfile], topics: &[String]) -> String {
    if topics.iter().all(|t| is_math_topic(t)) {
        return "\n- No command-term prioritisation for Mathematics topics.".into();
    }

    let below: Vec<&str> = COMMAND_TERM_PROFILES.iter()
        .filter(|p| p.below_evaluate)
        .map(|p| p.display)
        .collect();
    let below_list = below.join(", ");

    if terms.len() == 1 {
        let t = terms[0].display;
        return format!(
            "\n- Every non-Mathematics prompt MUST start with: {t}.\n\
             - Questions using {below_list} carry fewer marks than Evaluate."
        );
    }

    let selected: Vec<&str> = if terms.is_empty() {
        vec!["Evaluate"]
    } else {
        terms.iter().map(|p| p.display).collect()
    };
    format!(
        "\n- Start each non-Mathematics prompt with one of: {}.\n\
         - Questions using {below_list} carry fewer marks than Evaluate.",
        selected.join(", ")
    )
}
