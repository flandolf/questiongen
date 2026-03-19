pub fn difficulty_guidance(level: &str) -> &'static str {
    match level.to_ascii_lowercase().as_str() {
        "essential skills" =>
            "- Direct recall, substitution, one/two-step procedures only.\n\
             - Minimal analysis; no method-switching.",
        "easy" =>
            "- Foundational understanding, direct application, familiar contexts.\n\
             - Short explicit reasoning steps.",
        "medium" =>
            "- Multi-step reasoning linking ≥2 concepts.\n\
             - Non-routine context shifts requiring method choice.",
        "hard" =>
            "- Discriminator-level: information-dense narratives, synthesise multiple Study Design areas.\n\
             - Subvert rote templates; require rigorous method-selection justification.",
        _ => // extreme
            "- Olympiad/introductory-university depth.\n\
             - Abstract multi-layered prose with implicit constraints requiring original sub-results.\n\
             - Zero template recall; derive from first principles.",
    }
}
