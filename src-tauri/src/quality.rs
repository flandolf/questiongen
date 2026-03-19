use std::collections::HashSet;

pub struct QualitySummary {
    pub distinctness_avg: Option<f32>,
    pub multi_step_depth_avg: Option<f32>,
}

/// Score a batch of prompt texts and return per-item (distinctness, depth) pairs plus averages.
pub fn score_batch(prompt_texts: &[String]) -> (Vec<(f32, f32)>, QualitySummary) {
    if prompt_texts.is_empty() {
        return (vec![], QualitySummary { distinctness_avg: None, multi_step_depth_avg: None });
    }

    let token_sets: Vec<HashSet<String>> =
        prompt_texts.iter().map(|t| tokenize(t)).collect();

    let scores: Vec<(f32, f32)> = prompt_texts.iter().enumerate().map(|(i, text)| {
        let max_sim = token_sets.iter().enumerate()
            .filter(|(j, _)| *j != i)
            .map(|(_, other)| jaccard(&token_sets[i], other))
            .fold(0.0f32, f32::max);
        let distinctness = round((1.0 - max_sim).clamp(0.0, 1.0));
        let depth = round(multi_step_depth(text));
        (distinctness, depth)
    }).collect();

    let avg = |f: fn(&(f32, f32)) -> f32| -> Option<f32> {
        let vals: Vec<f32> = scores.iter().map(f).collect();
        Some(round(vals.iter().sum::<f32>() / vals.len() as f32))
    };

    let summary = QualitySummary {
        distinctness_avg: avg(|s| s.0),
        multi_step_depth_avg: avg(|s| s.1),
    };

    (scores, summary)
}

fn tokenize(text: &str) -> HashSet<String> {
    text.to_ascii_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|t| t.len() >= 3)
        .map(str::to_string)
        .collect()
}

fn jaccard(a: &HashSet<String>, b: &HashSet<String>) -> f32 {
    if a.is_empty() && b.is_empty() { return 1.0; }
    let i = a.intersection(b).count() as f32;
    let u = a.union(b).count() as f32;
    if u == 0.0 { 0.0 } else { i / u }
}

fn multi_step_depth(text: &str) -> f32 {
    let low = text.to_ascii_lowercase();
    let steps = [" then ", " after ", " hence ", " therefore ", "finally", "first", "second"]
        .iter().filter(|m| low.contains(*m)).count();
    let verbs = ["derive","differentiate","integrate","justify","prove","compare",
                 "evaluate","solve","estimate","show","determine","calculate"]
        .iter().filter(|v| low.contains(*v)).count();
    let ops = low.chars().filter(|c| matches!(c, '='|'+'|'-'|'*'|'/'|'^')).count();
    (1.0 + steps as f32 * 0.35 + verbs as f32 * 0.25 + ops.min(12) as f32 * 0.05).clamp(1.0, 5.0)
}

fn round(v: f32) -> f32 { (v * 100.0).round() / 100.0 }
