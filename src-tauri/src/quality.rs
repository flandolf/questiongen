use regex::Regex;
use std::collections::HashSet;
use std::sync::OnceLock;

fn part_label_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\([a-z]\)").unwrap())
}

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
pub fn score_batch(
    prompt_texts: &[String],
    mark_values: Option<&[u8]>,
) -> (Vec<QuestionQualityMetrics>, QualitySummary) {
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

    let mark_allocation_variance = mark_values.map(compute_mark_allocation_variance);

    let summary = QualitySummary {
        distinctness_avg: Some(avg_distinctness),
        multi_step_depth_avg: Some(avg_depth),
        command_verb_diversity: Some(verb_diversity),
        mark_allocation_variance,
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
    // R6: Strip $...$ and $$...$$ math regions before tokenizing so questions
    // using similar variables ("x", "f", "k") don't artefactually inflate the
    // Jaccard similarity. Outside math regions we still keep the standard
    // alphanumeric tokenization.
    let stripped = strip_math_regions(text);
    stripped
        .to_ascii_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|t| t.len() >= 3)
        .map(str::to_string)
        .collect()
}

fn strip_math_regions(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'$' {
            // Skip display math $$...$$
            if i + 1 < bytes.len() && bytes[i + 1] == b'$' {
                if let Some(end_rel) = find_from(&bytes[i + 2..], b"$$") {
                    i += 2 + end_rel + 2;
                    continue;
                } else {
                    // Unterminated display math - consume the rest.
                    break;
                }
            } else {
                // Skip inline math $...$
                if let Some(end_rel) = find_from(&bytes[i + 1..], b"$") {
                    i += 1 + end_rel + 1;
                    continue;
                } else {
                    break;
                }
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

fn find_from(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    for i in 0..=(haystack.len() - needle.len()) {
        if &haystack[i..i + needle.len()] == needle {
            return Some(i);
        }
    }
    None
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
#[allow(dead_code)]
pub(crate) fn extract_primary_command_verb(text: &str) -> String {
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
/// Matches parenthesized lowercase letter labels like `(a)`, `(b)` to avoid
/// false positives from math expressions like `f(x)`.
pub fn detect_scaffold_pattern(text: &str) -> String {
    let count = part_label_regex().find_iter(text).count();
    if count >= 2 {
        format!("multi-part-{}", count)
    } else {
        "single-part".to_string()
    }
}

/// R6: sweep parts `(a)`, `(b)`, `(c)` in order and verify the command verbs
/// embedded in each are monotonically non-decreasing in cognitive category.
/// Returns `None` if the question is not multi-part. If any part's command verb
/// cannot be classified, the escalation check is marked NOT-escalated (we
/// refuse to assert monotonic behaviour on partial information).
#[allow(dead_code)]
pub fn cognitive_escalation(text: &str) -> Option<CognitiveEscalation> {
    let parts = split_into_parts(text);
    if parts.len() < 2 {
        return None;
    }
    let verbs: Vec<String> = parts
        .iter()
        .map(|p| extract_primary_command_verb(p))
        .collect();
    let mut tiers: Vec<u8> = Vec::with_capacity(verbs.len());
    let mut escalated = true;
    for v in &verbs {
        match cog_tier(v) {
            Some(t) => tiers.push(t),
            None => {
                escalated = false;
                tiers.push(0);
            }
        }
    }
    if escalated {
        escalated = tiers
            .windows(2)
            .all(|w| w[1] >= w[0].saturating_sub(1));
    }
    Some(CognitiveEscalation {
        part_count: parts.len(),
        verbs,
        tiers,
        escalated,
    })
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct CognitiveEscalation {
    pub part_count: usize,
    pub verbs: Vec<String>,
    pub tiers: Vec<u8>,
    pub escalated: bool,
}

#[allow(dead_code)]
fn split_into_parts(text: &str) -> Vec<String> {
    // Split strictly on `(letter)` (closing paren required) surrounded by
    // word boundaries on BOTH sides so math expressions like `f(x)`,
    // `P(X)`, `(x+1)` are NOT misclassified as part boundaries. Without the
    // left boundary the walker falsely split `f(x)` into `f` + `(x)` because
    // `(x)` matches the `(letter)` shape. Iterate by char so multi-byte UTF-8
    // (em-dashes, accented names) is preserved verbatim.
    //
    // Convention: the inner letter must be ASCII *lowercase* — VCE-style part
    // labels are `(a)/(b)/(c)`. Uppercase markers `(A)/(I)/(II)` are NOT
    // recognised here by design, so a future migration to roman-numeral or
    // uppercase markers must update this check.
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '(' {
            let prev_is_alnum = current.chars().last().is_some_and(char::is_alphanumeric);
            let n1 = chars.clone().next();
            let n2 = chars.clone().nth(1);
            if !prev_is_alnum {
                if let (Some(n1), Some(n2)) = (n1, n2) {
                    if n1.is_ascii_lowercase() && n2 == ')' {
                        // Real (letter) boundary. Flush the preamble first.
                        if !current.trim().is_empty() {
                            parts.push(std::mem::take(&mut current));
                        }
                        current.push(c);
                        current.push(n1);
                        current.push(n2);
                        chars.next();
                        chars.next();
                        continue;
                    }
                }
            }
        }
        current.push(c);
    }
    if !current.trim().is_empty() {
        parts.push(current);
    }
    parts
}

#[allow(dead_code)]
fn cog_tier(verb_or_phrase: &str) -> Option<u8> {
    // Map VCE command verbs to cognitive-demand tiers (Bloom-ish).
    // Whole-word tokenisation against COMMAND_VERBS so phrases like
    // 'Show that X = 4' resolve to 'show' (tier 3) and 'Hence deduce that ...'
    // resolves to 'deduce' (tier 4). Non-command verbs (e.g. 'showcase your
    // work') return None so downstream checks do not false-flag bloat.
    let lowered = verb_or_phrase.to_ascii_lowercase();
    let token = lowered
        .split(|c: char| !c.is_ascii_alphabetic())
        .find(|t| !t.is_empty() && COMMAND_VERBS.contains(&t))?;
    // Every COMMAND_VERBS entry is armed below. If a future contributor adds
    // a verb to COMMAND_VERBS without updating this match, the catch-all
    // returns None — preferring "could not classify" over a silently wrong
    // tier. The downstream caller's behaviour stays correct (no flag).
    match token {
        "state" | "define" | "list" | "identify" | "name" => Some(1),
        "calculate" | "find" | "determine" | "solve" | "sketch" | "draw" | "compute" => {
            Some(2)
        }
        "show" | "describe" | "explain" | "compare" | "interpret" | "predict" | "outline" => {
            Some(3)
        }
        "justify"
        | "discuss"
        | "estimate"
        | "verify"
        | "comment"
        | "deduce"
        | "suggest"
        | "apply" => Some(4),
        "derive" | "prove" | "evaluate" | "analyze" | "synthesize" | "assess" => Some(5),
        _ => None,
    }
}

/// R6: detect routine "state this fact" tasks given an unreasonable max-mark
/// budget. Restricted to SINGLE-PART scaffolds: multi-part questions legitimately
/// start with a "state" sub-question (e.g. Methods "State the gradient. Hence ...")
/// whose tier doesn't reflect the total cognitive load. Also gated on
/// `max_marks >= 4` so we never false-positive on legitimate 1-3 mark items.
#[allow(dead_code)]
pub fn detect_max_marks_violation(
    primary_verb: &str,
    max_marks: u8,
    single_part: bool,
) -> Option<(u8, u8)> {
    if !single_part || max_marks < 4 {
        return None;
    }
    let tier = cog_tier(primary_verb)?;
    let expected = match tier {
        1 => 1,
        2 => 3,
        3 => 3,
        4 => 4,
        5 => 5,
        _ => return None,
    };
    if max_marks > expected + 1 {
        Some((max_marks, expected))
    } else {
        None
    }
}

/// R5 helper: derive a (offender_prompts, anti_verbs) pair from a scored batch
/// so the orchestrator can re-seed `prior_question_prompts` and inject an
/// anti-verb hint for the retry call. Offenders are items with
/// `distinctness < REGENERATION_OFFENDER_DISTINCTNESS_FLOOR`; anti-verbs are
/// primary command verbs present in strictly more than half the batch.
pub fn compute_regen_anti_examples(
    texts: &[String],
    metrics: &[QuestionQualityMetrics],
) -> (Vec<String>, Vec<String>) {
    let mut offender_prompts: Vec<String> = Vec::new();
    let mut verb_counts: std::collections::HashMap<String, u32> =
        std::collections::HashMap::new();
    for (text, m) in texts.iter().zip(metrics.iter()) {
        if m.distinctness < crate::constants::REGENERATION_OFFENDER_DISTINCTNESS_FLOOR {
            offender_prompts.push(text.clone());
        }
        let verb = extract_primary_command_verb(text);
        if verb == "other" {
            continue;
        }
        *verb_counts.entry(verb).or_insert(0) += 1;
    }
    let n = texts.len() as u32;
    let anti_verbs: Vec<String> = verb_counts
        .into_iter()
        .filter(|(_, c)| {
            *c * crate::constants::REGENERATION_VERB_MAJORITY_NUMERATOR
                > n * crate::constants::REGENERATION_VERB_MAJORITY_DENOMINATOR
        })
        .map(|(v, _)| v)
        .collect();
    (offender_prompts, anti_verbs)
}

/// R5 retry gate predicate. Pure function so the policy is unit-testable in
/// isolation from `engine/generation.rs`. Returns true when EITHER the batch's
/// distinctness_avg falls below `REGENERATION_DISTINCTNESS_THRESHOLD` OR its
/// command_verb_diversity falls below `REGENERATION_VERB_DIVERSITY_THRESHOLD`,
/// AND the batch has at least `QUALITY_MIN_BATCH_FOR_REVIEW` items, AND we
/// haven't already retried up to `REGENERATION_MAX_ATTEMPTS`.
pub fn should_retry(
    distinctness_avg: Option<f32>,
    command_verb_diversity: Option<f32>,
    batch_size: usize,
    attempts_used: u8,
) -> bool {
    let distinctness_low = distinctness_avg
        .map_or(false, |d| d < crate::constants::REGENERATION_DISTINCTNESS_THRESHOLD);
    let verb_diversity_low = command_verb_diversity.map_or(false, |v| {
        v < crate::constants::REGENERATION_VERB_DIVERSITY_THRESHOLD
    });
    let batch_sized =
        batch_size >= crate::constants::QUALITY_MIN_BATCH_FOR_REVIEW as usize;
    (distinctness_low || verb_diversity_low)
        && batch_sized
        && attempts_used < crate::constants::REGENERATION_MAX_ATTEMPTS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_math_regions() {
        let stripped = strip_math_regions("hello $x^2 + 1$ world $\\frac{1}{2}$ done");
        assert_eq!(stripped, "hello  world  done");
        let stripped2 = strip_math_regions("$$f(x)$$ continue and $g(a)$ more");
        assert!(!stripped2.contains("f("));
        assert!(stripped2.contains("continue"));
    }

    #[test]
    fn test_tokenize_strips_math() {
        let no_math = tokenize("Find the value of x when f(x) = 5");
        // "find" and "value" stay; math variables gone.
        assert!(no_math.contains("find"));
        assert!(no_math.contains("value"));
    }

    #[test]
    fn test_cognitive_escalation() {
        let good = "(a) State the domain.\n(b) Hence calculate the gradient.\n(c) Justify your answer.";
        let r = cognitive_escalation(good).unwrap();
        assert!(r.escalated, "good multi-part must show escalation");
        let bad = "(a) Justify.\n(b) State.";
        let r = cognitive_escalation(bad).unwrap();
        assert!(!r.escalated, "descending tier must fail");
    }

    #[test]
    fn test_detect_max_marks_violation() {
        // Single-part: routine 'state' over 5 marks is bloat.
        assert_eq!(detect_max_marks_violation("state", 5, true), Some((5, 1)));
        assert!(detect_max_marks_violation("derive", 5, true).is_none());
        // Multi-part: NEVER flag (the verb may be tier 1 but the question
        // legitimately escalates across (a)/(b)/(c)).
        assert!(detect_max_marks_violation("state", 5, false).is_none());
        // 1-3 marks: never flag regardless of tier (sub-bucket).
        assert!(detect_max_marks_violation("state", 1, true).is_none());
        assert!(detect_max_marks_violation("state", 3, true).is_none());
        // Deduce at 5 marks is fine.
        assert!(detect_max_marks_violation("deduce", 5, true).is_none());
        // 'Show that X = 4' -> tier 3, max 4 OK.
        assert!(detect_max_marks_violation("show that X = 4", 4, true).is_none());
        // 'Hence deduce that ...' -> tier 4 via fallback (not a COMMAND_VERBS entry).
        assert!(detect_max_marks_violation("hence deduce", 5, true).is_none());
        // 'showcase' is not the verb 'show' (whole-word match).
        assert!(detect_max_marks_violation("showcase your work", 5, true).is_none());
    }

    #[test]
    fn test_split_into_parts_skips_math() {
        // Math like `f(x)`, `P(X)`, `(x+1)` MUST NOT be treated as part labels,
        // even when interleaved with real (a)/(b) markers.
        let s = "Let f(x) = (x+1)^2 + 1. P(X>0) follows. (a) State f(2). (b) Hence find the gradient at x=2.";
        let parts = split_into_parts(s);
        // Math expressions preserved verbatim inside the preamble besides the
        // first (a)/(b) split.
        assert!(parts.iter().any(|p| p.contains("f(x)")), "parts = {:?}", parts);
        assert!(parts.iter().any(|p| p.contains("(x+1)")), "parts = {:?}", parts);
        assert!(parts.iter().any(|p| p.contains("P(X>0)")), "parts = {:?}", parts);
        // The marker labels themselves appear at the front of their own parts.
        assert!(parts.iter().any(|p| p.trim_start().starts_with("(b)")));
        // No spurious split on `f(` or `P(`.
        assert!(!parts.iter().any(|p| p.trim_start().starts_with("f(")));
        assert!(!parts.iter().any(|p| p.trim_start().starts_with("P(")));
    }

    #[test]
    fn test_split_into_parts_trailing_marker() {
        // A trailing (a)/(b)/(c) at end of text must STILL be recognised as
        // a boundary (regression for off-by-one boundary-length checks).
        let s = "preamble (a) one (b) another";
        let parts = split_into_parts(s);
        // Both `(a)` and `(b)` start their own parts despite another non-letter
        // word following them; verifies the boundary check iterates char-by-char
        // and does not consume past the closing paren.
        assert!(
            parts.iter().any(|p| p.trim_start().starts_with("(a)")),
            "(a) must start its own part, parts = {:?}",
            parts
        );
        assert!(
            parts.iter().any(|p| p.trim_start().starts_with("(b)")),
            "(b) must start its own part, parts = {:?}",
            parts
        );
        // Boundary at literal end-of-text (no trailing chars), the tightest
        // case for any off-by-one in `(bytes.len() - i >= 3)` style checks.
        let s2 = "head (a) tail (b)";
        let parts2 = split_into_parts(s2);
        assert!(
            parts2.iter().any(|p| p.trim_start().starts_with("(b)")),
            "trailing (b) with no chars after must still split, parts = {:?}",
            parts2
        );
    }

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
        assert_eq!(
            extract_primary_command_verb("Calculate the value"),
            "calculate"
        );
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
        assert_eq!(
            detect_scaffold_pattern("(a) part one (b) part two"),
            "multi-part-2"
        );
    }

    #[test]
    fn test_score_batch() {
        let prompts = vec!["Calculate x.".to_string(), "Determine y.".to_string()];
        let (metrics, summary) = score_batch(&prompts, None);
        assert_eq!(metrics.len(), 2);
        assert!(summary.distinctness_avg.is_some());
        assert!(summary.command_verb_diversity.is_some());
    }

    #[test]
    fn test_compute_regen_anti_examples() {
        // Three questions: two 'calculate' items with heavy token overlap so
        // their Jaccard similarity drives distinctness BELOW the offender floor
        // (REGENERATION_OFFENDER_DISTINCTNESS_FLOOR = 0.40). One 'explain'
        // item with similar vocabulary so the majority rule on 'calculate'
        // can be exercised. NB: tokens must share >=3-char words so the
        // Jaccard stays high in test data — see `tokenize` filter.
        let texts = vec![
            "Calculate the area of a circle using the formula.".to_string(),
            "Calculate the area of a square using the formula.".to_string(),
            "Explain why the area of a circle depends on radius.".to_string(),
        ];
        let (metrics, _) = score_batch(&texts, None);
        let anti = compute_regen_anti_examples(&texts, &metrics);
        assert!(
            anti.1.contains(&"calculate".to_string()),
            "anti_verbs = {:?}",
            anti.1
        );
        assert!(
            !anti.1.contains(&"explain".to_string()),
            "anti_verbs should not include minority verbs: {:?}",
            anti.1
        );
        assert!(
            !anti.0.is_empty(),
            "offender_prompts should be non-empty, got = {:?}",
            anti.0
        );
        // The two calculate items must both be flagged as offenders.
        assert!(
            anti.0.len() >= 2,
            "expected >= 2 offender prompts, got = {:?}",
            anti.0
        );
    }

    #[test]
    fn test_should_retry_predicate() {
        // Distinctness below threshold AND batch >= 2 AND attempts < MAX -> retry.
        assert!(should_retry(Some(0.20), Some(0.80), 3, 0));
        // Distinctness OK, verb diversity below threshold -> retry.
        assert!(should_retry(Some(0.80), Some(0.30), 3, 0));
        // Both above threshold -> no retry.
        assert!(!should_retry(Some(0.80), Some(0.80), 3, 0));
        // Distinctness below threshold BUT batch too small (1 item) -> no retry.
        assert!(!should_retry(Some(0.10), Some(0.10), 1, 0));
        // Distinctness below threshold AND already retried -> no retry.
        assert!(!should_retry(Some(0.10), Some(0.10), 4, 1));
        // All None (no metrics) -> no retry.
        assert!(!should_retry(None, None, 4, 0));
        // Just-distinctness meets threshold -> no retry (boundary).
        assert!(!should_retry(
            Some(crate::constants::REGENERATION_DISTINCTNESS_THRESHOLD),
            Some(0.80),
            3,
            0
        ));
    }
}
