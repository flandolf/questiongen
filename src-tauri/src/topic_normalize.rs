use std::collections::HashMap;
use std::sync::OnceLock;

fn canonical_topics() -> &'static [&'static str] {
    static TOPICS: OnceLock<Vec<&'static str>> = OnceLock::new();
    TOPICS.get_or_init(crate::catalog::topic_names)
}

fn subtopic_to_subject() -> &'static HashMap<String, String> {
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
    static SUBS: OnceLock<Vec<&'static str>> = OnceLock::new();
    SUBS.get_or_init(crate::catalog::all_subtopic_names_lower)
}

fn levenshtein(a: &str, b: &str) -> usize {
    let a_bytes = a.as_bytes();
    let b_bytes = b.as_bytes();
    let len_a = a_bytes.len();
    let len_b = b_bytes.len();
    if len_a == 0 {
        return len_b;
    }
    if len_b == 0 {
        return len_a;
    }

    let mut prev: Vec<usize> = (0..=len_b).collect();
    let mut curr: Vec<usize> = vec![0; len_b + 1];
    for i in 1..=len_a {
        curr[0] = i;
        for j in 1..=len_b {
            let cost = if a_bytes[i - 1] == b_bytes[j - 1] {
                0
            } else {
                1
            };
            curr[j] = (prev[j] + 1).min(curr[j - 1] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }

    prev[len_b]
}

fn similarity_score(a: &str, b: &str) -> f64 {
    if a == b {
        return 1.0;
    }
    let max_len = a.len().max(b.len());
    if max_len == 0 {
        return 1.0;
    }
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
        return sole_subtopic
            .map(|s| CanonicalizeResult::Mapped(s.to_string()))
            .unwrap_or(CanonicalizeResult::NoMatch);
    }

    let lower = trimmed.to_ascii_lowercase();
    let all_subs = all_canonical_subtopics();

    for &canonical in all_subs {
        if canonical == lower {
            return CanonicalizeResult::AlreadyCanonical;
        }
    }

    let mut best_containment: Option<&str> = None;
    for &canonical in all_subs {
        if lower.contains(canonical) || canonical.contains(&lower) {
            if let Some(current) = best_containment {
                if canonical.len() > current.len() {
                    best_containment = Some(canonical);
                }
            } else {
                best_containment = Some(canonical);
            }
        }
    }
    if let Some(matched) = best_containment {
        return CanonicalizeResult::Mapped(matched.to_string());
    }

    const SIMILARITY_THRESHOLD: f64 = 0.6;
    let mut best_score = 0.0f64;
    let mut best_match: Option<&str> = None;
    let mut tie_count = 0usize;

    for &canonical in all_subs {
        let score = similarity_score(&lower, canonical);
        if score > best_score + 0.001 {
            best_score = score;
            best_match = Some(canonical);
            tie_count = 1;
        } else if (score - best_score).abs() <= 0.001 && score >= SIMILARITY_THRESHOLD {
            tie_count += 1;
        }
    }

    if let Some(matched) = best_match {
        if best_score >= SIMILARITY_THRESHOLD && tie_count == 1 {
            return CanonicalizeResult::Mapped(matched.to_string());
        }
    }

    if let Some(sole) = sole_subtopic {
        return CanonicalizeResult::Mapped(sole.to_string());
    }

    CanonicalizeResult::NoMatch
}

fn fix_topic_field(topic: &mut String, subtopic: &mut Option<String>, selected_topics: &[String]) {
    let trimmed = topic.trim();
    if canonical_topics()
        .iter()
        .any(|t| t.eq_ignore_ascii_case(trimmed))
    {
        return;
    }

    let lookup = trimmed.to_ascii_lowercase();
    let map = subtopic_to_subject();

    if let Some(subject) = map.get(lookup.as_str()) {
        if subtopic.is_none() || subtopic.as_deref().map(str::is_empty).unwrap_or(true) {
            *subtopic = Some(trimmed.to_string());
        }
        *topic = subject.to_string();
        return;
    }

    for (sub, subject) in map {
        if lookup.contains(sub.as_str()) || sub.contains(&lookup) {
            if subtopic.is_none() || subtopic.as_deref().map(str::is_empty).unwrap_or(true) {
                *subtopic = Some(trimmed.to_string());
            }
            *topic = subject.to_string();
            return;
        }
    }

    if selected_topics.len() == 1 {
        if subtopic.is_none() || subtopic.as_deref().map(str::is_empty).unwrap_or(true) {
            *subtopic = Some(trimmed.to_string());
        }
        *topic = selected_topics[0].clone();
    }
}

pub fn normalise_topic_and_subtopic(
    topic: &mut String,
    subtopic: &mut Option<String>,
    selected_topics: &[String],
    sole_subtopic: Option<&str>,
) {
    fix_topic_field(topic, subtopic, selected_topics);

    if let Some(ref current) = subtopic.clone() {
        match canonicalize_subtopic(current, sole_subtopic) {
            CanonicalizeResult::AlreadyCanonical => {}
            CanonicalizeResult::Mapped(canonical) => {
                *subtopic = Some(canonical);
            }
            CanonicalizeResult::NoMatch => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::normalise_topic_and_subtopic;

    #[test]
    fn maps_subtopic_in_topic_field_to_parent_topic() {
        let mut topic = "Functions and Graphs".to_string();
        let mut subtopic = None;
        let selected_topics = vec!["Mathematical Methods".to_string()];

        normalise_topic_and_subtopic(
            &mut topic,
            &mut subtopic,
            &selected_topics,
            Some("functions and graphs"),
        );

        assert_eq!(topic, "Mathematical Methods");
        assert_eq!(subtopic.as_deref(), Some("functions and graphs"));
    }

    #[test]
    fn falls_back_to_sole_selected_subtopic_for_unknown_value() {
        let mut topic = "Mathematical Methods".to_string();
        let mut subtopic = Some("unknown focus".to_string());
        let selected_topics = vec!["Mathematical Methods".to_string()];

        normalise_topic_and_subtopic(
            &mut topic,
            &mut subtopic,
            &selected_topics,
            Some("Integration"),
        );

        assert_eq!(subtopic.as_deref(), Some("Integration"));
    }

    #[test]
    fn keeps_canonical_subtopic_when_already_canonical() {
        let mut topic = "Mathematical Methods".to_string();
        let mut subtopic = Some("functions and function notation".to_string());
        let selected_topics = vec!["Mathematical Methods".to_string()];

        normalise_topic_and_subtopic(&mut topic, &mut subtopic, &selected_topics, None);

        assert_eq!(topic, "Mathematical Methods");
        assert_eq!(subtopic.as_deref(), Some("functions and function notation"));
    }
}
