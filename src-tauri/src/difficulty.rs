pub fn difficulty_guidance(level: &str) -> &'static str {
    match level.to_ascii_lowercase().as_str() {
        "essential skills" => "Essential Skills: Direct recall, 1-2 step calculations, no ambiguity.",
        "easy" => "Easy: Foundational understanding, familiar contexts, short reasoning steps.",
        "medium" => "Medium: Multi-step reasoning, method selection required, some interpretation.",
        "hard" => "Hard: Information-dense, synthesis of areas, non-routine setup, rigorous argumentation.",
        _ => "Medium: Multi-step reasoning, method selection, some interpretation.",
    }
}

pub fn adjust_difficulty(
    base_difficulty: &str,
    scaling_enabled: bool,
    recent_average_score: Option<f64>,
    recent_difficulty: Option<&str>,
) -> String {
    if !scaling_enabled {
        return base_difficulty.to_string();
    }
    let Some(score) = recent_average_score else {
        return base_difficulty.to_string();
    };
    let levels = ["Essential Skills", "Easy", "Medium", "Hard", "Extreme"];
    let base_pos = levels.iter().position(|&r| r == base_difficulty);
    let mut current_index = base_pos.unwrap_or(2); // default Medium

    // If base_difficulty was not found/explicit, override with recent difficulty
    if base_pos.is_none() {
        if let Some(recent_diff) = recent_difficulty {
            if let Some(recent_idx) = levels.iter().position(|&r| r == recent_diff) {
                current_index = recent_idx;
            }
        }
    }

    let new_index = if score > 85.0 {
        (current_index + 1).min(4)
    } else if score < 70.0 {
        current_index.saturating_sub(1)
    } else {
        current_index
    };

    levels[new_index].to_string()
}