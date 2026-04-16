use std::collections::HashSet;

const COMMAND_VERBS: [&str; 34] = [
    "define",
    "state",
    "list",
    "identify",
    "calculate",
    "determine",
    "find",
    "solve",
    "derive",
    "prove",
    "show",
    "deduce",
    "evaluate",
    "estimate",
    "justify",
    "explain",
    "compare",
    "contrast",
    "discuss",
    "analyze",
    "synthesize",
    "apply",
    "sketch",
    "draw",
    "construct",
    "differentiate",
    "integrate",
    "verify",
    "comment",
    "interpret",
    "predict",
    "outline",
    "describe",
    "assess",
];

pub struct QualitySummary {
    pub distinctness_avg: Option<f32>,
    pub multi_step_depth_avg: Option<f32>,
    pub command_verb_diversity: Option<f32>,
    pub mark_allocation_variance: Option<f32>,
}

#[derive(Clone)]
pub struct QuestionQualityMetrics {
    pub distinctness: f32,
    pub depth: f32,
    pub verb_diversity: f32,
    pub scaffold_pattern: String,
}

/// Score a batch of prompt texts with multi-dimensional quality metrics.
/// Returns per-item metrics with comprehensive QualitySummary.
pub fn score_batch(prompt_texts: &[String]) -> (Vec<QuestionQualityMetrics>, QualitySummary) {
    if prompt_texts.is_empty() {
        return (
            vec![],
            QualitySummary {
                distinctness_avg: None,
                multi_step_depth_avg: None,
                command_verb_diversity: None,
                mark_allocation_variance: None,
            },
        );
    }

    let token_sets: Vec<HashSet<String>> = prompt_texts.iter().map(|t| tokenize(t)).collect();

    let mut verbs_per_item: Vec<Vec<String>> = Vec::with_capacity(prompt_texts.len());
    for text in prompt_texts {
        verbs_per_item.push(extract_command_verbs(text));
    }

    let metrics: Vec<QuestionQualityMetrics> = prompt_texts
        .iter()
        .enumerate()
        .map(|(i, text)| {
            let max_sim = token_sets
                .iter()
                .enumerate()
                .filter(|(j, _)| *j != i)
                .map(|(_, other)| jaccard(&token_sets[i], other))
                .fold(0.0f32, f32::max);

            let verb_count = verbs_per_item[i].len();
            let base_distinctness = (1.0 - max_sim).clamp(0.0, 1.0);
            let verb_boost = verb_count as f32 * 0.05;
            let weighted_distinctness = (base_distinctness + verb_boost).clamp(0.0, 1.0);
            let depth = round(multi_step_depth(text));
            let scaffold_pattern = detect_scaffold_pattern(text);

            QuestionQualityMetrics {
                distinctness: round(weighted_distinctness),
                depth,
                verb_diversity: verb_count as f32,
                scaffold_pattern,
            }
        })
        .collect();

    // Use primary-command diversity in summary so this metric reflects instructional variety.
    let verb_diversity = compute_command_verb_diversity(prompt_texts);

    let count = metrics.len() as f32;
    let avg_distinctness = round(metrics.iter().map(|m| m.distinctness).sum::<f32>() / count);
    let avg_depth = round(metrics.iter().map(|m| m.depth).sum::<f32>() / count);

    let summary = QualitySummary {
        distinctness_avg: Some(avg_distinctness),
        multi_step_depth_avg: Some(avg_depth),
        command_verb_diversity: Some(verb_diversity),
        mark_allocation_variance: None,
    };

    (metrics, summary)
}

/// Compute how diverse command verbs are across a batch (0.0 = all same, 1.0 = all unique).
pub fn compute_command_verb_diversity(texts: &[String]) -> f32 {
    if texts.is_empty() {
        return 1.0;
    }

    let verbs: Vec<String> = texts
        .iter()
        .map(|t| extract_primary_command_verb(t))
        .filter(|v| v != "other")
        .collect();

    if verbs.is_empty() {
        return 0.5;
    }

    let unique_count = verbs.iter().collect::<HashSet<_>>().len();
    let diversity = unique_count as f32 / verbs.len() as f32;
    round(diversity)
}

/// Calculate mark allocation variance (higher = more distributed, lower = concentrated).
pub fn compute_mark_allocation_variance(mark_values: &[u8]) -> f32 {
    let len = mark_values.len();
    if len == 0 {
        return 0.0;
    }

    let sum: f32 = mark_values.iter().map(|&m| m as f32).sum();
    let mean = sum / len as f32;
    let variance: f32 = mark_values
        .iter()
        .map(|&m| {
            let diff = m as f32 - mean;
            diff * diff
        })
        .sum::<f32>()
        / len as f32;

    variance.sqrt().min(10.0) / 10.0
}

fn tokenize(text: &str) -> HashSet<String> {
    text.to_ascii_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|t| t.len() >= 3)
        .map(str::to_string)
        .collect()
}

fn jaccard(a: &HashSet<String>, b: &HashSet<String>) -> f32 {
    if a.is_empty() && b.is_empty() {
        return 1.0;
    }
    let i = a.intersection(b).count() as f32;
    let u = a.union(b).count() as f32;
    if u == 0.0 {
        0.0
    } else {
        i / u
    }
}

fn multi_step_depth(text: &str) -> f32 {
    let low = text.to_ascii_lowercase();
    let steps = [
        " then ",
        " after ",
        " hence ",
        " therefore ",
        " finally",
        " first",
        " second",
        " next",
    ]
    .iter()
    .filter(|m| low.contains(*m))
    .count();

    // Comprehensive verb list with higher weight for synthesis verbs
    let synthesis_verbs = [
        "derive",
        "prove",
        "synthesize",
        "justify",
        "analyze",
        "evaluate",
    ];
    let procedural_verbs = [
        "differentiate",
        "integrate",
        "calculate",
        "solve",
        "determine",
        "show",
    ];
    let applied_verbs = ["compare", "contrast", "interpret", "predict", "explain"];

    let syn_count = synthesis_verbs.iter().filter(|v| low.contains(*v)).count();
    let proc_count = procedural_verbs.iter().filter(|v| low.contains(*v)).count();
    let app_count = applied_verbs.iter().filter(|v| low.contains(*v)).count();

    let ops = low
        .chars()
        .filter(|c| matches!(c, '=' | '+' | '-' | '*' | '/' | '^' | '√'))
        .count();

    // Higher weights for synthesis and step indicators
    (1.0 + steps as f32 * 0.4
        + syn_count as f32 * 0.35
        + proc_count as f32 * 0.2
        + app_count as f32 * 0.25
        + ops.min(15) as f32 * 0.06)
        .clamp(1.0, 5.0)
}

fn round(v: f32) -> f32 {
    (v * 100.0).round() / 100.0
}

/// Extract command verbs from text to assess cognitive demand variety.
fn extract_command_verbs(text: &str) -> Vec<String> {
    let low = text.to_ascii_lowercase();

    COMMAND_VERBS
        .iter()
        .filter(|verb| low.contains(*verb))
        .map(|s| s.to_string())
        .collect()
}

/// Get the primary (first occurring) command verb from text.
fn extract_primary_command_verb(text: &str) -> String {
    let low = text.to_ascii_lowercase();
    for token in low
        .split(|c: char| !c.is_ascii_alphabetic())
        .filter(|t| !t.is_empty())
    {
        if COMMAND_VERBS.contains(&token) {
            return token.to_string();
        }
    }
    "other".to_string()
}

/// Detect scaffold pattern in question text (single-part vs multi-part with labels).
pub fn detect_scaffold_pattern(text: &str) -> String {
    if text.contains("(") && text.contains(")") && text.matches("(").count() >= 2 {
        format!("multi-part-{}", text.matches("(").count())
    } else {
        "single-part".to_string()
    }
}

/// Analyze if scaffold patterns or verb diversity needs improvement.
pub fn analyze_batch_quality_issues(metrics: &[QuestionQualityMetrics]) -> (bool, String) {
    if metrics.is_empty() {
        return (false, String::new());
    }

    // Check if too many questions are single-part (need more multi-part variety)
    let single_part_count = metrics
        .iter()
        .filter(|m| m.scaffold_pattern == "single-part")
        .count();
    let single_part_ratio = single_part_count as f32 / metrics.len() as f32;

    // Check if verb diversity is low (need more varied command verbs)
    let avg_verb_diversity =
        metrics.iter().map(|m| m.verb_diversity).sum::<f32>() / metrics.len() as f32;

    let mut issues = Vec::new();

    if single_part_ratio > 0.6 {
        issues.push("Most questions are single-part (lacking multi-part structure for depth).");
    }
    if avg_verb_diversity < 2.0 {
        issues.push("Questions lack varied command verbs (low cognitive diversity).");
    }

    if issues.is_empty() {
        (false, String::new())
    } else {
        (true, issues.join(" "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jaccard_similarity() {
        let mut a = HashSet::new();
        a.insert("apple".to_string());
        a.insert("banana".to_string());

        let mut b = HashSet::new();
        b.insert("banana".to_string());
        b.insert("cherry".to_string());

        // Intersection: 1 (banana), Union: 3 (apple, banana, cherry)
        assert_eq!(jaccard(&a, &b), 1.0 / 3.0);
    }

    #[test]
    fn test_extract_primary_command_verb() {
        assert_eq!(extract_primary_command_verb("Calculate the value"), "calculate");
        assert_eq!(extract_primary_command_verb("Please find x"), "find");
        assert_eq!(extract_primary_command_verb("No verb here"), "other");
    }

    #[test]
    fn test_compute_mark_allocation_variance() {
        let marks = vec![2, 2, 2, 2];
        assert_eq!(compute_mark_allocation_variance(&marks), 0.0);

        let marks2 = vec![1, 5];
        // Mean = 3. Variance = ((1-3)^2 + (5-3)^2)/2 = (4+4)/2 = 4. StdDev = 2.
        // min(2/10, 1.0) = 0.2
        assert!((compute_mark_allocation_variance(&marks2) - 0.2).abs() < 0.001);
    }

    #[test]
    fn test_detect_scaffold_pattern() {
        assert_eq!(detect_scaffold_pattern("Solve this."), "single-part");
        assert_eq!(detect_scaffold_pattern("(a) part one (b) part two"), "multi-part-2");
    }

    #[test]
    fn test_score_batch() {
        let prompts = vec![
            "Calculate x.".to_string(),
            "Determine y.".to_string(),
        ];
        let (metrics, summary) = score_batch(&prompts);
        assert_eq!(metrics.len(), 2);
        assert!(summary.distinctness_avg.is_some());
        assert!(summary.command_verb_diversity.is_some());
    }
}
