pub fn difficulty_guidance(level: &str) -> &'static str {
    match level.to_ascii_lowercase().as_str() {
        "essential skills" =>
            "- Direct recall of facts, definitions, and formulas; straightforward substitution into standard procedures.\n\
             - One or two-step calculations with explicit instructions; no ambiguity in required method.\n\
             - Minimal or no analysis; no requirement to interpret, generalise, or select between methods.\n\
             - No distractors or extraneous information; all data is directly relevant.",
        "easy" =>
            "- Demonstrates foundational understanding and direct application of core concepts in familiar, well-practiced contexts.\n\
             - Requires short, explicit reasoning steps; may involve simple justification or explanation.\n\
             - May require identification of relevant information from a short prompt, but method is still clear.\n\
             - Little to no integration of multiple concepts; focus remains on a single idea or skill.",
        "medium" =>
            "- Involves multi-step reasoning, linking two or more concepts or skills in sequence.\n\
             - Requires some interpretation of context, including non-routine or unfamiliar settings.\n\
             - Student must select the appropriate method from several plausible options.\n\
             - May include distractors or require filtering of relevant information.\n\
             - Justification of steps and intermediate reasoning is expected.",
        "hard" =>
            "- Discriminator-level: information-dense narratives, requiring synthesis of multiple Study Design areas and advanced reasoning.\n\
             - Problems are open-ended or require construction of a solution pathway, not just following a template.\n\
             - May require switching between methods, justifying choices, and explaining why alternatives do not work.\n\
             - Includes subtle constraints, implicit assumptions, or data that must be inferred.\n\
             - Demands rigorous, logically-sequenced argumentation and clear communication of reasoning.",
        _ =>
            // Default to Medium for unrecognized levels rather than Extreme
            "- Involves multi-step reasoning, linking two or more concepts or skills in sequence.\n\
             - Requires some interpretation of context, including non-routine or unfamiliar settings.\n\
             - Student must select the appropriate method from several plausible options.\n\
             - May include distractors or require filtering of relevant information.\n\
             - Justification of steps and intermediate reasoning is expected.",
    }
}
