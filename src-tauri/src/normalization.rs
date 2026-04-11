use crate::models::{default_max_marks, AppError, CommandResult, GeneratedQuestion, McQuestion};
use crate::constants::{DISALLOWED_METHOD_INSTRUCTIONS, DISALLOWED_SELF_TALK, MC_MAX_EXPLANATION_WORDS};
use crate::parsing::clean_field;

// --- Topic / subtopic correction ----------------------------------------------

fn canonical_topics() -> &'static [&'static str] {
    use std::sync::OnceLock;
    static TOPICS: OnceLock<Vec<&'static str>> = OnceLock::new();
    TOPICS.get_or_init(crate::catalog::topic_names)
}

fn subtopic_to_subject() -> &'static std::collections::HashMap<String, String> {
    use std::collections::HashMap;
    use std::sync::OnceLock;
    static MAP: OnceLock<HashMap<String, String>> = OnceLock::new();
    MAP.get_or_init(|| {
        let catalog = crate::catalog::all_topics();
        let mut m = HashMap::new();
        for topic in catalog {
            for sub in &topic.subtopics {
                m.insert(sub.name.to_lowercase(), topic.name.clone());
            }
        }
        m
    })
}

fn all_canonical_subtopics() -> &'static [&'static str] {
    use std::sync::OnceLock;
    static SUBS: OnceLock<Vec<&'static str>> = OnceLock::new();
    SUBS.get_or_init(crate::catalog::all_subtopic_names_lower)
}

fn levenshtein(a: &str, b: &str) -> usize {
    let a_bytes = a.as_bytes();
    let b_bytes = b.as_bytes();
    let len_a = a_bytes.len();
    let len_b = b_bytes.len();
    if len_a == 0 { return len_b; }
    if len_b == 0 { return len_a; }
    let mut prev: Vec<usize> = (0..=len_b).collect();
    let mut curr: Vec<usize> = vec![0; len_b + 1];
    for i in 1..=len_a {
        curr[0] = i;
        for j in 1..=len_b {
            let cost = if a_bytes[i - 1] == b_bytes[j - 1] { 0 } else { 1 };
            curr[j] = (prev[j] + 1).min(curr[j - 1] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[len_b]
}

fn similarity_score(a: &str, b: &str) -> f64 {
    if a == b { return 1.0; }
    let max_len = a.len().max(b.len());
    if max_len == 0 { return 1.0; }
    let dist = levenshtein(a, b);
    1.0 - (dist as f64 / max_len as f64)
}

#[derive(Debug)]
enum CanonicalizeResult {
    AlreadyCanonical,
    Mapped(String),
    NoMatch,
}

fn canonicalize_subtopic(value: &str, sole_subtopic: Option<&str>) -> CanonicalizeResult {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return sole_subtopic.map(|s| CanonicalizeResult::Mapped(s.to_string())).unwrap_or(CanonicalizeResult::NoMatch);
    }
    let lower = trimmed.to_ascii_lowercase();
    let all_subs = all_canonical_subtopics();
    for &canonical in all_subs { if canonical == lower { return CanonicalizeResult::AlreadyCanonical; } }
    let mut best_containment: Option<&str> = None;
    for &canonical in all_subs {
        if lower.contains(canonical) || canonical.contains(&lower) {
            if let Some(current) = best_containment { if canonical.len() > current.len() { best_containment = Some(canonical); } }
            else { best_containment = Some(canonical); }
        }
    }
    if let Some(matched) = best_containment { return CanonicalizeResult::Mapped(matched.to_string()); }
    const SIMILARITY_THRESHOLD: f64 = 0.6;
    let mut best_score = 0.0f64;
    let mut best_match: Option<&str> = None;
    let mut tie_count = 0usize;
    for &canonical in all_subs {
        let score = similarity_score(&lower, canonical);
        if score > best_score + 0.001 { best_score = score; best_match = Some(canonical); tie_count = 1; }
        else if (score - best_score).abs() <= 0.001 && score >= SIMILARITY_THRESHOLD { tie_count += 1; }
    }
    if let Some(matched) = best_match { if best_score >= SIMILARITY_THRESHOLD && tie_count == 1 { return CanonicalizeResult::Mapped(matched.to_string()); } }
    if let Some(sole) = sole_subtopic { return CanonicalizeResult::Mapped(sole.to_string()); }
    CanonicalizeResult::NoMatch
}

fn fix_topic_field(topic: &mut String, subtopic: &mut Option<String>, selected_topics: &[String]) {
    let trimmed = topic.trim();
    if canonical_topics().iter().any(|t| t.eq_ignore_ascii_case(trimmed)) { return; }
    let lookup = trimmed.to_ascii_lowercase();
    let map = subtopic_to_subject();
    if let Some(subject) = map.get(lookup.as_str()) {
        if subtopic.is_none() || subtopic.as_deref().map(str::is_empty).unwrap_or(true) { *subtopic = Some(trimmed.to_string()); }
        *topic = subject.to_string();
        return;
    }
    for (sub, subject) in map {
        if lookup.contains(sub.as_str()) || sub.contains(&lookup) {
            if subtopic.is_none() || subtopic.as_deref().map(str::is_empty).unwrap_or(true) { *subtopic = Some(trimmed.to_string()); }
            *topic = subject.to_string();
            return;
        }
    }
    if selected_topics.len() == 1 {
        if subtopic.is_none() || subtopic.as_deref().map(str::is_empty).unwrap_or(true) { *subtopic = Some(trimmed.to_string()); }
        *topic = selected_topics[0].clone();
    }
}

pub fn normalise_written(questions: &mut [GeneratedQuestion], selected_topics: &[String], selected_subtopics: Option<&Vec<String>>) {
    let sole_subtopic = selected_subtopics.filter(|s| s.len() == 1).and_then(|s| s.first()).map(|s| s.as_str());
    for (idx, q) in questions.iter_mut().enumerate() {
        q.id = format!("q{}", idx + 1);
        q.topic = q.topic.trim().into();
        q.prompt_markdown = clean_field(q.prompt_markdown.trim());
        q.subtopic = q.subtopic.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).or_else(|| sole_subtopic.map(|s| s.to_string()));
        fix_topic_field(&mut q.topic, &mut q.subtopic, selected_topics);
        if let Some(ref sub) = q.subtopic {
            match canonicalize_subtopic(sub, sole_subtopic) {
                CanonicalizeResult::AlreadyCanonical => {}
                CanonicalizeResult::Mapped(canonical) => { q.subtopic = Some(canonical); }
                CanonicalizeResult::NoMatch => {}
            }
        }
        let marks = if q.max_marks == 0 { default_max_marks() } else { q.max_marks };
        q.max_marks = marks.clamp(1, 30);
    }
}

pub fn validate_written(questions: &[GeneratedQuestion], expected: usize) -> CommandResult<()> {
    if questions.len() != expected { return Err(AppError::new("VALIDATION_ERROR", format!("Expected {expected} questions, got {}.", questions.len()))); }
    for q in questions {
        if q.topic.is_empty() { return Err(AppError::new("VALIDATION_ERROR", format!("Q{} missing topic.", q.id))); }
        if q.prompt_markdown.is_empty() { return Err(AppError::new("VALIDATION_ERROR", format!("Q{} has empty prompt.", q.id))); }
        let prompt_lower = q.prompt_markdown.to_lowercase();
        if DISALLOWED_METHOD_INSTRUCTIONS.iter().any(|m| prompt_lower.contains(m)) { return Err(AppError::new("VALIDATION_ERROR", format!("Q{} prompt contains method instructions.", q.id))); }
        if q.max_marks == 0 || q.max_marks > 30 { return Err(AppError::new("VALIDATION_ERROR", format!("Q{} has invalid maxMarks.", q.id))); }
    }
    Ok(())
}

pub fn normalise_mc(questions: &mut [McQuestion], selected_topics: &[String], selected_subtopics: Option<&Vec<String>>) {
    let sole_subtopic = selected_subtopics.filter(|s| s.len() == 1).and_then(|s| s.first()).map(|s| s.as_str());
    for (idx, q) in questions.iter_mut().enumerate() {
        q.id = format!("mc{}", idx + 1);
        q.topic = q.topic.trim().into();
        q.prompt_markdown = clean_field(q.prompt_markdown.trim());
        q.explanation_markdown = clean_field(q.explanation_markdown.trim());
        q.correct_answer = q.correct_answer.trim().to_uppercase();
        q.subtopic = q.subtopic.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).or_else(|| sole_subtopic.map(|s| s.to_string()));
        fix_topic_field(&mut q.topic, &mut q.subtopic, selected_topics);
        if let Some(ref sub) = q.subtopic {
            match canonicalize_subtopic(sub, sole_subtopic) {
                CanonicalizeResult::AlreadyCanonical => {}
                CanonicalizeResult::Mapped(canonical) => { q.subtopic = Some(canonical); }
                CanonicalizeResult::NoMatch => {}
            }
        }
        for opt in &mut q.options { opt.label = opt.label.trim().to_uppercase(); opt.text = clean_field(opt.text.trim()); }
        q.options.sort_by(|a, b| a.label.cmp(&b.label));
    }
}

pub fn validate_mc(questions: &[McQuestion], expected: usize) -> CommandResult<()> {
    if questions.len() != expected { return Err(AppError::new("VALIDATION_ERROR", format!("Expected {expected} MC questions, got {}.", questions.len()))); }
    for q in questions {
        if q.topic.is_empty() { return Err(AppError::new("VALIDATION_ERROR", format!("Q{} missing topic.", q.id))); }
        if q.prompt_markdown.is_empty() { return Err(AppError::new("VALIDATION_ERROR", format!("Q{} empty prompt.", q.id))); }
        let prompt_lower = q.prompt_markdown.to_lowercase();
        if DISALLOWED_METHOD_INSTRUCTIONS.iter().any(|m| prompt_lower.contains(m)) { return Err(AppError::new("VALIDATION_ERROR", format!("Q{} prompt contains method instructions.", q.id))); }
        if q.explanation_markdown.is_empty() { return Err(AppError::new("VALIDATION_ERROR", format!("Q{} empty explanation.", q.id))); }
        let words = q.explanation_markdown.split_whitespace().count();
        if words > MC_MAX_EXPLANATION_WORDS { return Err(AppError::new("VALIDATION_ERROR", format!("Q{} explanation too long ({words} words; max {MC_MAX_EXPLANATION_WORDS}).", q.id))); }
        let low = q.explanation_markdown.to_lowercase();
        if DISALLOWED_SELF_TALK.iter().any(|m| low.contains(m)) { return Err(AppError::new("VALIDATION_ERROR", format!("Q{} explanation contains self-talk.", q.id))); }
        if q.options.len() != 4 { return Err(AppError::new("VALIDATION_ERROR", format!("Q{} must have exactly 4 options.", q.id))); }
        let mut labels: Vec<_> = q.options.iter().map(|o| o.label.clone()).collect();
        labels.sort();
        if labels != ["A", "B", "C", "D"] { return Err(AppError::new("VALIDATION_ERROR", format!("Q{} options must be labeled A, B, C, D.", q.id))); }
        if !matches!(q.correct_answer.as_str(), "A" | "B" | "C" | "D") { return Err(AppError::new("VALIDATION_ERROR", format!("Q{} invalid correctAnswer.", q.id))); }
    }
    Ok(())
}