pub fn difficulty_guidance(level: &str) -> &'static str {
    match level.to_ascii_lowercase().as_str() {
        "essential skills" => "Essential Skills: Direct recall, 1-2 step calculations, no ambiguity.",
        "easy" => "Easy: Foundational understanding, familiar contexts, short reasoning steps.",
        "medium" => "Medium: Multi-step reasoning, method selection required, some interpretation.",
        "hard" => "Hard: Information-dense, synthesis of areas, non-routine setup, rigorous argumentation.",
        _ => "Medium: Multi-step reasoning, method selection, some interpretation.",
    }
}
