use crate::catalog;
use crate::constants;
use crate::difficulty::difficulty_guidance;
use crate::text_clean::sanitize_for_api;

pub fn generation_compliance_contract() -> &'static str {
    "CONTRACT: 1. Only assessable Study Design content. 2. Focus constraints override style PDFs. 3. PDFs are style-only; do NOT copy scenarios/content. 4. Valid JSON only."
}

pub fn topic_field_contract() -> &'static str {
    "FIELDS: 'topic' = subject name (e.g. Mathematical Methods); 'subtopic' = focus area label. No subtopics in 'topic' field."
}

pub fn strict_json_output_note() -> &'static str {
    "STRICT JSON OUTPUT:\n\
     - Output ONLY raw JSON. No markdown fences, no backticks, no explanation.\n\
     - Response must start with '{' and end with '}'.\n\
     - Use double quotes for all strings. No trailing commas.\n\
     - All required fields must be present.\n\n\
     EXAMPLE (written):\n\
     {\"questions\":[{\"id\":\"Q1\",\"topic\":\"Chemistry\",\"subtopic\":\"Stoichiometry\",\"promptMarkdown\":\"Calculate the mass...\",\"maxMarks\":5}]}\n\n\
     EXAMPLE (MC):\n\
     {\"questions\":[{\"id\":\"Q1\",\"topic\":\"Physics\",\"subtopic\":\"Vectors\",\"promptMarkdown\":\"A force of 10N...\",\"options\":[{\"label\":\"A\",\"text\":\"5N\"},{\"label\":\"B\",\"text\":\"10N\"},{\"label\":\"C\",\"text\":\"15N\"},{\"label\":\"D\",\"text\":\"20N\"}],\"correctAnswer\":\"B\",\"explanationMarkdown\":\"Using F=ma...\"}]}"
}

/// Extended schema guidance injected into the system prompt when the provider
/// only supports `json_object` (no structured output schema). Describes every
/// required field so the model can produce valid output without a schema.
pub fn written_schema_guidance_text() -> &'static str {
    "REQUIRED JSON FIELDS (written):\n\
     Top-level object with a \"questions\" array. Each element:\n\
     - \"id\" (string): unique identifier for the question (e.g. \"Q1\")\n\
     - \"topic\" (string): exact subject name (e.g. \"Chemistry\", \"Mathematical Methods\")\n\
     - \"subtopic\" (string or null): specific focus area label\n\
     - \"promptMarkdown\" (string): the full question stem, only the question (no solution)\n\
     - \"maxMarks\" (integer): marks for the question, between 1 and 30"
}

pub fn mc_schema_guidance_text() -> &'static str {
    "REQUIRED JSON FIELDS (MC):\n\
     Top-level object with a \"questions\" array. Each element:\n\
     - \"id\" (string): unique identifier (e.g. \"Q1\")\n\
     - \"topic\" (string): exact subject name\n\
     - \"subtopic\" (string or null): specific focus area label\n\
     - \"promptMarkdown\" (string): the question stem only (no options in stem)\n\
     - \"options\" (array of objects): exactly 4 items, each with \"label\" (\"A\"-\"D\") and \"text\" (string)\n\
     - \"correctAnswer\" (string): one of \"A\", \"B\", \"C\", \"D\"\n\
     - \"explanationMarkdown\" (string): explain why correct answer is right and why each distractor is wrong"
}

pub fn marking_schema_guidance_text() -> &'static str {
    "REQUIRED JSON FIELDS (marking):\n\
     - \"verdict\" (string): one of \"Correct\", \"Incorrect\", \"Partial\"\n\
     - \"achievedMarks\" (integer): marks awarded\n\
     - \"maxMarks\" (integer): maximum marks\n\
     - \"vcaaMarkingScheme\" (array): each item has \"criterion\" (string), \"achievedMarks\" (integer), \"maxMarks\" (integer), \"rationale\" (string)\n\
     - \"comparisonToSolutionMarkdown\" (string): how the answer compares to the solution\n\
     - \"feedbackMarkdown\" (string): use ## Strengths, ## Areas for Improvement, ## Common Pitfalls headers\n\
     - \"workedSolutionMarkdown\" (string): every step a student needs for full marks\n\
     - \"exemplarResponseMarkdown\" (string): an ideal student answer\n\
     - \"mcOptionExplanations\" (array): for MC, each with \"option\" (string), \"isCorrect\" (boolean), \"explanation\" (string)"
}

pub fn written_system() -> String {
    format!(
        "IDENTITY: Expert VCE written-response exam writer.\n\n\
         {contract}\n\
         {hygiene}\n\
         {latex_rules}\n\
         {style_rules}\n\
         {mermaid_rules}\n\n\
         CORE RULES:\n\
         - Use precise VCCTA command terms (e.g. 'state', 'describe', 'explain', 'justify', 'evaluate', 'compare', 'derive', 'show that').\n\
         - 'show that': every step must be explicit.\n\
         - 'justify': reasoning required.\n\
         - 'promptMarkdown' contains STEM ONLY. No solutions/answers.\n\n\
         {field_contract}\n\n\
         {json_output}",
        contract = generation_compliance_contract(),
        hygiene = constants::GLOBAL_HYGIENE_RULES,
        latex_rules = constants::LATEX_RULES,
        style_rules = constants::WRITTEN_STYLE_RULES,
        mermaid_rules = constants::MERMAID_RULES,
        field_contract = topic_field_contract(),
        json_output = strict_json_output_note(),
    )
}

pub fn mc_system() -> String {
    format!(
        "IDENTITY: Expert VCE multiple-choice exam writer.\n\n\
         {contract}\n\
         {hygiene}\n\
         {latex_rules}\n\
         {style_rules}\n\
         {mermaid_rules}\n\n\
         CORE RULES:\n\
         - Use VCE standard phrasing and plausible distractors.\n\
         - Provide ONLY final answers and concise rationale.\n\
         - NO chain-of-thought in output.\n\
         - 'promptMarkdown' contains STEM ONLY. No options (A-D) in stem.\n\n\
         {field_contract}\n\n\
         {json_output}",
        contract = generation_compliance_contract(),
        hygiene = constants::GLOBAL_HYGIENE_RULES,
        latex_rules = constants::LATEX_RULES,
        style_rules = constants::MC_STYLE_RULES,
        mermaid_rules = constants::MERMAID_RULES,
        field_contract = topic_field_contract(),
        json_output = strict_json_output_note(),
    )
}

pub fn marking_system(
    max_marks: u8,
    chem_note: &str,
    phys_ed_note: &str,
    marker_style: Option<&str>,
    custom_marker_style: Option<&str>,
) -> String {
    // Scale word limits by marks, with sensible floors.
    let worked_words = (max_marks as usize * 200).clamp(500, 2000);
    let comparison_words = (max_marks as usize * 60).clamp(200, 800);
    let feedback_words = (max_marks as usize * 50).clamp(200, 600);
    let rationale_words = (max_marks as usize * 30).clamp(100, 400);

    // Determine the marker identity/rules based on style
    let (identity, rules) = match marker_style {
        Some("relaxed") => (
            "Flexible VCE marker",
            "MARKING RULES:\n\
             1. Award marks generously for partial understanding.\n\
             2. Focus on key concepts, not exact wording.\n\
             3. Give credit for reasonable attempts.\n\
             4. Provide encouraging feedback.",
        ),
        Some("targeted") => (
            "Targeted VCE marker",
            "MARKING RULES:\n\
             1. Focus on specific syllabus outcomes.\n\
             2. Assess only what's explicitly taught.\n\
             3. Reward linkage to key knowledge.\n\
             4. Provide criterion-referenced feedback.",
        ),
        Some("custom") if custom_marker_style.is_some_and(|s| !s.is_empty()) => {
            ("Custom VCE marker", custom_marker_style.unwrap_or(""))
        }
        _ => (
            "Strict VCE marker",
            "MARKING RULES:\n\
             1. Criterion-based (steps, not just answers).\n\
             2. Award for method even if arithmetic slips.\n\
             3. 'show that' needs full algebraic steps.\n\
             5. MC: justify correct and explain all 3 distractors.",
        ),
    };

    format!(
        "IDENTITY: {identity}.\n\n\
         {rules}\n\n\
         {hygiene}\n\
         {latex_rules}\n\
         {mermaid_rules}\n\
         {chem_note}{phys_ed_note}\n\n\
         REPORTS: PDFs are PRIMARY authority for criteria.\n\n\
         LIMITS: Verdict ('Correct'/'Incorrect'), Rationale (≤{rationale_words} words), Comparison (≤{comparison_words}), Feedback (≤{feedback_words}), Worked Solution (≤{worked_words} words).\n\n\
         FEEDBACK STYLE: Use ONLY ## Strengths, ## Areas for Improvement, ## Common Pitfalls headers.",
        identity = identity,
        rules = rules,
        rationale_words = rationale_words,
        comparison_words = comparison_words,
        feedback_words = feedback_words,
        worked_words = worked_words,
        hygiene = constants::GLOBAL_HYGIENE_RULES,
        latex_rules = constants::LATEX_RULES,
        mermaid_rules = constants::MERMAID_RULES,
        chem_note = chem_note,
        phys_ed_note = phys_ed_note
    )
}

pub fn subject_specific_guidance(topics: &[String]) -> String {
    let mut s = String::new();
    let mut chemistry_flag = false;
    let mut physical_education_flag = false;
    let mut biology_flag = false;
    let mut specialist_math_flag = false;
    let mut general_math_flag = false;

    for topic in topics {
        let low = topic.to_lowercase();
        if low.contains("chemistry") {
            chemistry_flag = true;
        }
        if low.contains("physical education") {
            physical_education_flag = true;
        }
        if low.contains("biology") {
            biology_flag = true;
        }
        if low.contains("specialist") {
            specialist_math_flag = true;
        }
        if low.contains("general math") {
            general_math_flag = true;
        }
    }

    if chemistry_flag {
        s.push_str(
            "\nVCE CHEMISTRY RULES:\n\
            - Focus on VCAA key knowledge (e.g., green chemistry principles, stoichiometry, analytical techniques).\n\
            - Emphasize data-driven questions involving the interpretation of tables, graphs, and experimental data.\n\
            - Always provide states of matter in chemical equations where appropriate.\n\
            - Use correct IUPAC nomenclature.",
        );
    }
    if physical_education_flag {
        s.push_str(
            "\nVCE PHYSICAL EDUCATION RULES:\n\
            - Focus on biomechanical principles, energy system interplay, and training program design/evaluation.\n\
            - Use highly specific sporting contexts. Demand analysis of physiological data (e.g. lactate curves, VO2 max graphs).\n\
            - Avoid formula derivations; focus on verbal justification and application of principles.",
        );
    }
    if biology_flag {
        s.push_str(
            "\nVCE BIOLOGY RULES:\n\
            - Focus on molecular biology, genetics, and immunity. Apply knowledge to NOVEL scenarios.\n\
            - Include experimental design questions and data analysis (e.g. interpreting gel electrophoresis, PCR results).\n\
            - Use precise biological terminology as per VCAA study design.",
        );
    }
    if specialist_math_flag {
        s.push_str(
            "\nVCE SPECIALIST MATHEMATICS RULES:\n\
            - Focus on rigorous formal proof, complex numbers, vectors, kinematics, and advanced calculus.\n\
            - Demand high levels of formal mathematical notation and symbolic reasoning.\n\
            - Scenarios should be abstract or highly technical applications of mathematics.",
        );
    }
    if general_math_flag {
        s.push_str(
            "\nVCE GENERAL MATHEMATICS RULES:\n\
            - Focus on practical, real-world application of mathematics: finance, matrices, networks, and data analysis.\n\
            - Use realistic numbers and clear, straightforward scenarios. Avoid unnecessary abstraction.",
        );
    }

    s
}

pub fn topic_notes(topics: &[String], _selected_subs: Option<&Vec<String>>) -> String {
    let mut s = String::new();
    for topic_name in topics {
        let guidance = catalog::topic_exam_guidance(topic_name);
        if !guidance.is_empty() {
            s.push('\n');
            s.push_str(guidance);
        }

        let out_of_scope = catalog::topic_out_of_scope(topic_name);
        if !out_of_scope.is_empty() {
            s.push_str("\nTOPIC OUT OF SCOPE (DO NOT ASSESS):\n- ");
            s.push_str(&out_of_scope.join("\n- "));
        }
    }
    s.push_str(&subject_specific_guidance(topics));
    s
}

pub fn subtopics_note(
    topics: &[String],
    selected: Option<&Vec<String>>,
    shuffle: bool,
    difficulty: &str,
    tech_mode: &str,
) -> String {
    let Some(mut subs) = selected.filter(|s| !s.is_empty()).cloned() else {
        return String::new();
    };

    if shuffle {
        use rand::seq::SliceRandom;
        let mut rng = rand::rng();
        subs.shuffle(&mut rng);
    }

    let mut s = format!("\nFocus subtopics: {}.", subs.join(", "));

    for sub in subs {
        let key = sub.trim();
        // We find the subtopic entry across all relevant topics.
        for topic in topics {
            if let Some(entry) = catalog::find_subtopic(topic, key) {
                s.push_str(&format!("\n\n[{}]", entry.name));
                s.push_str(&format!(
                    "\nCORE CONCEPTS: {}",
                    entry.technique_notes.core_concepts
                ));
                if !entry.technique_notes.exam_style_guidelines.is_empty() {
                    s.push_str(&format!(
                        "\nSTYLE GUIDELINES: {}",
                        entry.technique_notes.exam_style_guidelines
                    ));
                }
                if !entry.technique_notes.anti_prompts.is_empty() {
                    s.push_str("\nSTRICT NEGATIVE CONSTRAINTS:\n- ");
                    s.push_str(&entry.technique_notes.anti_prompts.join("\n- "));
                }

                if tech_mode == "tech-free" && !entry.technique_notes.tech_free_rules.is_empty() {
                    s.push_str(&format!(
                        "\nTECH-FREE SPECIFIC: {}",
                        entry.technique_notes.tech_free_rules
                    ));
                } else if tech_mode == "tech-active"
                    && !entry.technique_notes.tech_active_rules.is_empty()
                {
                    s.push_str(&format!(
                        "\nTECH-ACTIVE SPECIFIC: {}",
                        entry.technique_notes.tech_active_rules
                    ));
                }

                if let Some(levers) = &entry.complexity_levers {
                    let lever = match difficulty.to_ascii_lowercase().as_str() {
                        "essential skills" | "easy" => &levers.easy,
                        "hard" | "extreme" => &levers.hard,
                        _ => "",
                    };
                    if !lever.is_empty() {
                        s.push_str(&format!("\nDIFFICULTY SCALING ({}): {}", difficulty, lever));
                    }
                    if difficulty.eq_ignore_ascii_case("extreme") && !levers.extreme.is_empty() {
                        s.push_str(&format!("\nEXTREME CHALLENGE: {}", levers.extreme));
                    }
                }

                if !entry.out_of_scope.is_empty() {
                    s.push_str("\nSUBTOPIC OUT OF SCOPE:\n- ");
                    s.push_str(&entry.out_of_scope.join("\n- "));
                }

                if let Some(rules) = &entry.synthesis_rules {
                    s.push_str(&format!("\nSYNTHESIS GUIDANCE: {}", rules));
                }
                break; // Found it in this topic, move to next subtopic.
            }
        }
    }
    s
}

pub fn tech_note(mode: &str, topics: &[String]) -> String {
    let is_math = topics.iter().any(|t| {
        let low = t.to_lowercase();
        low.contains("methods") || low.contains("specialist")
    });

    match mode {
        "tech-free" => {
            let mut s = " All questions must be tech-free.".to_string();
            if is_math {
                s.push_str(" For math, focus on direct application of skills.");
            }
            s
        }
        "tech-active" => {
            let mut s = " All questions must be tech-active.".to_string();
            if is_math {
                s.push_str(" For math, focus on application in realistic scenarios/contexts.");
            }
            s
        }
        _ => " All questions must be tech-free.".to_string(),
    }
}

pub fn subtopic_synthesis_note(selected: Option<&Vec<String>>, question_count: usize) -> String {
    let Some(_subs) = selected.filter(|s| s.len() > 1) else {
        return String::new();
    };

    if question_count <= 3 {
        return "\nINTEGRATED: Focus deeply on a single primary area. If integrating a second area from the selection, ensure the transition is logically authentic to VCE exams and doesn't dilute the focus.".to_string();
    }

    let blend_scope = "integrate multiple areas where valid";

    format!("\nINTEGRATED: {blend_scope}. Prefer exam-style synthesis. Use one primary subtopic label per question.")
}

pub fn focus_lock_note(
    selected: Option<&Vec<String>>,
    custom_focus_area: Option<&str>,
    shuffle: bool,
    question_count: usize,
) -> String {
    let mut constraints = Vec::<String>::new();
    if let Some(mut subs) = selected.filter(|s| !s.is_empty()).cloned() {
        if shuffle {
            use rand::seq::SliceRandom;
            let mut rng = rand::rng();
            subs.shuffle(&mut rng);
        }
        constraints.push(format!("Subtopics: {}.", subs.join(", ")));
    }
    if let Some(area) = custom_focus_area {
        let trimmed = area.trim();
        if !trimmed.is_empty() {
            constraints.push(format!("Custom focus: \"{trimmed}\"."));
        }
    }

    if constraints.is_empty() {
        return String::new();
    }

    let batch_note = if question_count <= 3 {
        " Since generating a small number of questions, ensure the scenario allows for deep exploration of the specified focus area. Avoid superficial contexts; anchor the data, scenario, and variables strictly to VCAA Study Design applications."
    } else {
        ""
    };

    format!(
        "\nFOCUS LOCK: {}. Use these focus constraints exclusively; prioritize over PDF content.{}",
        constraints.join(" "),
        batch_note
    )
}

pub fn pdf_reanchor_note(
    selected: Option<&Vec<String>>,
    custom_focus_area: Option<&str>,
    shuffle: bool,
    question_count: usize,
) -> String {
    let mut lines = vec![
        "── PDF STYLE REFERENCE ENDS HERE ──".to_string(),
        "Return to the focus constraints specified earlier:".to_string(),
    ];
    if let Some(mut subs) = selected.filter(|s| !s.is_empty()).cloned() {
        if shuffle {
            use rand::seq::SliceRandom;
            let mut rng = rand::rng();
            subs.shuffle(&mut rng);
        }
        lines.push(format!("• Subtopics: {}.", subs.join(", ")));
    }
    if let Some(area) = custom_focus_area {
        let trimmed = area.trim();
        if !trimmed.is_empty() {
            lines.push(format!("• Custom focus: \"{trimmed}\"."));
        }
    }

    if question_count <= 3 {
        lines.push(
            "Since this is a small batch, ensure deep exploration of the above subtopics."
                .to_string(),
        );
    }

    lines.push(
        "IMPORTANT: PDFs are for style ONLY. DO NOT reuse any content, scenarios, or numbers. \
         Generate original contexts mapping exclusively to focus constraints."
            .to_string(),
    );
    lines.join("\n")
}

pub fn truncate_for_prompt(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        return s.to_string();
    }
    let mut out = String::new();
    for ch in s.chars().take(max_chars) {
        out.push(ch);
    }
    out.push_str("...");
    out
}

pub fn prior_examples_note(prior: Option<&[String]>) -> String {
    let Some(prior) = prior else {
        return String::new();
    };
    let mut out = Vec::new();
    for item in prior.iter().take(3) {
        let trimmed = item.trim();
        if trimmed.is_empty() {
            continue;
        }
        out.push(format!(
            "- {}",
            sanitize_for_api(&truncate_for_prompt(trimmed, 140))
        ));
    }
    if out.is_empty() {
        return String::new();
    }
    format!(
        "\nRECENT QUESTIONS TO AVOID PARAPHRASING:\n{}\nTreat these as banned scenario/style anchors.",
        out.join("\n")
    )
}

pub fn similarity_note(enabled: bool, prior: Option<&[String]>) -> String {
    if !enabled {
        return String::from(
            "\nDIVERSITY: Each question must use distinct scenarios, contexts, and methods. \
             No repetition of previous questions' structure, numbers, or wording.",
        );
    }
    format!(
        "\nSTRICT DIVERSITY: Generate wholly distinct questions. Avoid reusing scenarios, \
         characters, names, settings, numbers, or reasoning patterns. If unable to invent \
         a unique question for a concept, choose a different concept instead. Prioritize \
         creative variation in context and approach over paraphrased similarity.{}",
        prior_examples_note(prior)
    )
}

pub fn adaptive_quality_note(metrics: &[crate::quality::QuestionQualityMetrics]) -> String {
    let (has_issues, issues_desc) = crate::quality::analyze_batch_quality_issues(metrics);
    if !has_issues {
        return String::new();
    }

    format!(
        "\n\nADAPTIVE QUALITY GUIDANCE:\n\
         Previous generation showed these patterns: {}\n\
         For this retry: ensure {}\n\
         Use varied command verbs (define, derive, analyze, evaluate, justify, compare, etc.).\n\
         Vary scaffolding: mix single-part questions with multi-part (a), (b), (c) structures.",
        issues_desc,
        if issues_desc.contains("single-part") {
            "at least 50% of questions include multi-part structure"
        } else {
            "strong variety in question structure"
        }
    )
}

pub fn math_difficulty_note(difficulty: &str, topics: &[String]) -> &'static str {
    if topics
        .iter()
        .any(|t| t.trim().eq_ignore_ascii_case("Mathematical Methods"))
    {
        match difficulty.to_ascii_lowercase().as_str() {
            "essential skills" => {
                " Math Essential Skills: single-skill items, direct substitution only."
            }
            "extreme" => {
                " Math Extreme: multi-part proofs, chain reasoning, first-principles derivation."
            }
            _ => "",
        }
    } else {
        match difficulty.to_ascii_lowercase().as_str() {
            "essential skills" => {
                " Essential Skills: straightforward questions, minimal inference."
            }
            "extreme" => " Extreme: multi-step reasoning, synthesis of multiple concepts.",
            _ => "",
        }
    }
}

pub fn difficulty_enforcement_note(difficulty: &str, is_mc: bool) -> &'static str {
    match difficulty.to_ascii_lowercase().as_str() {
        "hard" => {
            if is_mc {
                " HARD ENFORCEMENT: Avoid direct recall or single-step substitutions. Stems must require at least two reasoning moves, and distractors must come from realistic misconceptions or near-miss methods. INCREASE COGNITIVE DEMAND — DO NOT increase marks."
            } else {
                " HARD ENFORCEMENT: Avoid direct recall or one-step substitution questions. Require non-routine setup, method choice, and explicit justification. USE LINKED SUB-PARTS that escalate from setup to analysis/synthesis where syllabus-valid. DO NOT increase marks beyond the requested average — achieve difficulty through complexity, not allocation."
            }
        }
        "extreme" => {
            if is_mc {
                " EXTREME ENFORCEMENT: Every item must demand layered inference and concept synthesis, not procedural recall. Distractors should be highly plausible and discriminate between partially-correct and fully-correct reasoning. INCREASE COMPLEXITY — DO NOT increase marks."
            } else {
                " EXTREME ENFORCEMENT: Every item must require deep multi-step reasoning and synthesis across concepts where syllabus-valid. Prioritize proof-grade argumentation, symbolic reasoning, and non-routine structure. KEEP MARKS AT OR BELOW THE REQUESTED AVERAGE — achieve extreme difficulty through cognitive complexity, not mark bloat."
            }
        }
        _ => "",
    }
}

pub fn math_methods_exam1_tech_free_note(topics: &[String], tech_mode: &str) -> &'static str {
    let is_methods = topics
        .iter()
        .any(|t| t.trim().eq_ignore_ascii_case("Mathematical Methods"));
    if !is_methods || tech_mode != "tech-free" {
        return "";
    }

    "\nMATHEMATICAL METHODS EXAM 1 STYLE (TECH-FREE, MANDATORY):\n\
     - Follow a scaffolded structure where earlier parts produce results that are explicitly reused in later parts.\n\
     - Sequence cognitive demand as procedural setup -> analysis -> synthesis/justification.\n\
     - Balance the batch across algebra/functions, calculus, and probability/statistics.\n\
     - Include both discrete and continuous probability contexts where syllabus-valid; continuous tasks should require integral reasoning in a tech-free way.\n\
     - For any item worth more than 1 mark, design prompts that require clear intermediate working, not just a final answer.\n\
     - Include some later-question style tasks with literal constants/parameters (for example, w) that require symbolic reasoning rather than numeric-only substitution.\n\
     - Maintain strict non-CAS framing: exact values and method-focused working where appropriate."
}

pub fn probability_distribution_table_note(topics: &[String]) -> &'static str {
    let needs_table_note = topics.iter().any(|t| {
        let low = t.to_lowercase();
        low.contains("probability")
            || low.contains("random variables")
            || low.contains("statistics")
            || low.contains("data analysis")
            || low.contains("mathematical methods")
            || low.contains("specialist mathematics")
    });

    if !needs_table_note {
        return "";
    }

    r#"
PROBABILITY DISTRIBUTION TABLE FORMAT (MANDATORY, STRICT):
- USE LATEX ARRAY WITH DOUBLE BACKSLASH ROW TERMINATOR: \\ (TWO CONSECUTIVE BACKSLASHES)
- CORRECT EXAMPLES:
  * \begin{array}{c|cc} X & 0 & 1 \\ \hline P(X=x) & 0.5 & 0.5 \end{array}
  * \begin{array}{c|ccc} Y & 1 & 2 & 3 \\ \hline P(Y=y) & \frac{1}{6} & \frac{1}{3} & \frac{1}{2} \end{array}
- CRITICAL: Row breaks use \\ (double backslash), NOT \ (single backslash followed by space).
- CRITICAL: A missing row break before \hline causes the LaTeX error 'Misplaced \hline'. Always write \\ \hline, never \ \hline.
- FORBIDDEN FORMATS:
  * Using single backslash: x & 1 & 2 \ \hline (WRONG — generates LaTeX errors)
  * Markdown tables: | X | 0 | 1 | (WRONG — invalid)
  * Plain text columns: X: 0, 1 (WRONG — invalid)
- Mathematical Integrity: All probabilities must satisfy $\sum_y P(Y=y) = 1$. If the model's probabilities do not sum to 1, correct them or show the algebraic normalisation step.
- Parametric Calculation: If probabilities are expressed using a parameter (e.g., $k$), explicitly solve for the parameter and substitute the numeric values. Example: if $10k = 1$ then state $k = 0.1$ and show substituted probabilities.
- Numeric/Precision: Provide probabilities as decimals or exact fractions in LaTeX; avoid imprecise text like "about 0.2".
- Continuous Variables: For PDFs provide an explicit LaTeX expression for the PDF and state the domain and integration limits used to verify total probability equals 1."#
}

pub fn cleanup_system_prompt() -> &'static str {
    "You are a strict data-cleaning assistant. You MUST output ONLY valid JSON.\n\
     Respond with an object containing a \"mappings\" array. Each item must have\n\
     an \"unknown\" string and a \"canonical\" string.\n\
     Example response:\n\
     {\"mappings\":[{\"unknown\":\"Some Name\",\"canonical\":\"Exact Name\"}]}\n\
     Rules:\n\
     - The \"canonical\" value MUST be copied exactly from the canonical list provided.\n\
     - Only include mappings where you are confident.\n\
     - If an input does not match any canonical value, omit it from the array.\n\
     - Do NOT include markdown fences, explanations, or any text outside the JSON."
}

pub fn marking_prompt(
    topic: &str,
    subtopic: &str,
    question: &str,
    max_marks: u8,
    answer: &str,
    report_preamble: &str,
    pdf_pages_note: &str,
) -> String {
    format!(
        "Topic: {topic}\nSubtopic: {subtopic}\nQuestion ({max} marks):\n{question}\n\n\
         {pdf_pages_note}\
         Student answer:\n{answer}\n\n\
         MARKING INSTRUCTIONS:\n\
         - Apply VCAA criterion-based marking strictly.\n\
         - Do not award marks for correct answers without correct supporting working or reasoning (except for questions that are purely answer-only).\n\
         - Do not credit vague restatements of the question as explanation.\n\
         - For 'show that' sub-parts: every algebraic step must be shown; a bare final result is zero.\n\
         - For 'explain/justify': a numerical answer alone is insufficient — reasoning must be stated.\n\
         - Produce one criterion per mark (or group closely related marks where natural).\n\
         - The workedSolution must show every step a student would need to write to receive full marks.{report_preamble}",
        topic = topic,
        subtopic = subtopic,
        question = question,
        max = max_marks,
        answer = answer,
        report_preamble = report_preamble,
        pdf_pages_note = pdf_pages_note
    )
}

pub fn pdf_discovery_system() -> &'static str {
    "IDENTITY: Expert VCE Exam Analyst.\n\
     TASK: Analyze the attached PDF of a student's exam and identify all questions present.\n\
     RULES:\n\
     1. Extract the EXACT text of each question (the prompt/stem).\n\
     2. Identify the 'topic' (e.g. 'Question 1', 'Section A Question 4').\n\
     3. Identify the maximum marks available for that question (usually noted in square brackets like [4 marks]).\n\
     4. Identify which page(s) in the PDF contain the student's answer for that question.\n\
     5. Output valid JSON in the specified format.\n\
     6. Be exhaustive; find every question the student has attempted or is present in the exam paper."
}

pub fn pdf_discovery_prompt() -> &'static str {
    "Analyze the attached PDF. Identify each question, its full prompt text, its maximum marks, and the page numbers where the student's response is located."
}

pub struct UserPromptBuilder {
    pub count: usize,
    pub topics: Vec<String>,
    pub difficulty: String,
    pub average_marks: Option<u8>,
    pub subtopics: Option<Vec<String>>,
    pub custom_focus_area: Option<String>,
    pub tech_mode: String,
    pub include_exam_context: bool,
    pub avoid_similar_questions: bool,
    pub diversity_enabled: bool,
    pub shuffle_subtopics: bool,
    pub prior_question_prompts: Option<Vec<String>>,
}

impl UserPromptBuilder {
    pub fn build_written(&self) -> String {
        let average_marks = self.average_marks.unwrap_or(10);
        let total_marks = average_marks as usize * self.count;
        let custom_note = self
            .custom_focus_area
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map_or(String::new(), |v| {
                format!(" Custom focus: \"{v}\". Align all questions to this where syllabus-valid.")
            });

        let exam_context_preamble = if self.include_exam_context {
            "\n\nEXAM PDF CONTEXT:\n\
             - Use attached PDFs for wording/layout style only.\n\
             - Do not source topics, facts, numbers, or scenarios from PDFs.\n\
             - Apply focus constraints and Study Design limits before final output."
        } else {
            ""
        };

        let scaffolding_note = if self.count == 1 && average_marks >= 4 {
            "\nSTRUCTURE: Generate a comprehensive, multi-part extended response item (e.g., Part a, b, c). \
             Sequence the cognitive demand logically: begin with procedural/setup tasks, progress to analysis, \
             and conclude with synthesis/evaluation or justification."
        } else {
            ""
        };

        format!(
            "USER REQUEST:\n\
             Generate {count} VCE written questions.\n\
             Topics: {topics}\n\
             Difficulty: {difficulty} ({diff_rules})\n\
             Average marks: {average_marks} (Total marks: {total_marks})\n\n\
             CONSTRAINTS:\n\
             - CRITICAL: Do NOT exceed the average marks requested. Keep each question's marks AT OR NEAR {average_marks}. Difficulty should come from cognitive complexity, NOT from mark bloat.\n\
             - Complexity must match marks (e.g., 5-6 marks = 2-3 parts).\n\
             {scaffolding}{subs_note}{synth_note}{custom_note}{tech}{difficulty_enforcement}{topic_notes}{math_diff}{methods_exam1_note}{prob_table_note}{sim_note}{focus_lock}{exam_context_preamble}\n\n\
             GOAL: Output exactly {count} high-quality questions following VCAA standards.",
            count                 = self.count,
            topics                = sanitize_for_api(&self.topics.join(", ")),
            difficulty            = self.difficulty,
            diff_rules            = difficulty_guidance(&self.difficulty),
            scaffolding           = scaffolding_note,
            subs_note             = sanitize_for_api(&subtopics_note(
                &self.topics,
                self.subtopics.as_ref(),
                self.shuffle_subtopics,
                &self.difficulty,
                &self.tech_mode
            )),
            synth_note            = sanitize_for_api(&subtopic_synthesis_note(self.subtopics.as_ref(), self.count)),
            custom_note           = sanitize_for_api(&custom_note),
            tech                  = tech_note(&self.tech_mode, &self.topics),
            difficulty_enforcement = difficulty_enforcement_note(&self.difficulty, false),
            topic_notes           = topic_notes(&self.topics, self.subtopics.as_ref()),
            math_diff             = math_difficulty_note(&self.difficulty, &self.topics),
            methods_exam1_note    = math_methods_exam1_tech_free_note(&self.topics, &self.tech_mode),
            prob_table_note       = probability_distribution_table_note(&self.topics),
            focus_lock            = sanitize_for_api(&focus_lock_note(self.subtopics.as_ref(), self.custom_focus_area.as_deref(), self.shuffle_subtopics, self.count)),
            exam_context_preamble = exam_context_preamble,
            average_marks         = average_marks,
            total_marks           = total_marks,
            sim_note              = sanitize_for_api(&similarity_note(
                self.avoid_similar_questions || self.diversity_enabled,
                self.prior_question_prompts.as_deref(),
            )),
        )
    }

    pub fn build_mc(&self) -> String {
        let custom_note = self
            .custom_focus_area
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map_or(String::new(), |v| {
                format!(" Custom focus: \"{v}\". Align all questions to this where syllabus-valid.")
            });

        let exam_context_preamble = if self.include_exam_context {
            "\n\nEXAM PDF CONTEXT:\n\
             - Use attached PDFs for wording/layout style only.\n\
             - Do not source topics, facts, numbers, or scenarios from PDFs.\n\
             - Apply focus constraints and Study Design limits before final output."
        } else {
            ""
        };

        format!(
            "USER REQUEST:\n\
             Generate {count} VCE multiple-choice questions (1 mark each).\n\
             Topics: {topics}\n\
             Difficulty: {difficulty} ({diff_rules})\n\n\
             CONSTRAINTS:\n\
             {subs_note}{synth_note}{custom_note}{tech}{difficulty_enforcement}{topic_notes}{math_diff}{prob_table_note}{sim_note}{focus_lock}{exam_context_preamble}\n\n\
             GOAL: Output exactly {count} high-quality questions following VCAA standards.",
            count                 = self.count,
            topics                = sanitize_for_api(&self.topics.join(", ")),
            difficulty            = self.difficulty,
            diff_rules            = difficulty_guidance(&self.difficulty),
            subs_note             = sanitize_for_api(&subtopics_note(
                &self.topics,
                self.subtopics.as_ref(),
                self.shuffle_subtopics,
                &self.difficulty,
                &self.tech_mode
            )),
            synth_note            = sanitize_for_api(&subtopic_synthesis_note(self.subtopics.as_ref(), self.count)),
            custom_note           = sanitize_for_api(&custom_note),
            tech                  = tech_note(&self.tech_mode, &self.topics),
            difficulty_enforcement = difficulty_enforcement_note(&self.difficulty, true),
            topic_notes           = topic_notes(&self.topics, self.subtopics.as_ref()),
            math_diff             = math_difficulty_note(&self.difficulty, &self.topics),
            prob_table_note       = probability_distribution_table_note(&self.topics),
            focus_lock            = sanitize_for_api(&focus_lock_note(self.subtopics.as_ref(), self.custom_focus_area.as_deref(), self.shuffle_subtopics, self.count)),
            exam_context_preamble = exam_context_preamble,
            sim_note              = sanitize_for_api(&similarity_note(
                self.avoid_similar_questions,
                self.prior_question_prompts.as_deref(),
            )),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marking_system_scales_word_limits_with_marks() {
        let sys_1 = marking_system(1, "", "", None, None);
        assert!(sys_1.contains("≤100 words"));
        let sys_10 = marking_system(10, "", "", None, None);
        assert!(sys_10.contains("≤2000 words"));
    }

    #[test]
    fn marking_system_injects_marker_styles() {
        let strict = marking_system(5, "", "", Some("strict"), None);
        assert!(strict.contains("IDENTITY: Strict VCE marker"));
        let relaxed = marking_system(5, "", "", Some("relaxed"), None);
        assert!(relaxed.contains("IDENTITY: Flexible VCE marker"));
        let targeted = marking_system(5, "", "", Some("targeted"), None);
        assert!(targeted.contains("IDENTITY: Targeted VCE marker"));
        let custom = marking_system(
            5,
            "",
            "",
            Some("custom"),
            Some("Be lenient and encouraging."),
        );
        assert!(custom.contains("IDENTITY: Custom VCE marker"));
        assert!(custom.contains("Be lenient and encouraging."));
    }

    #[test]
    fn marking_system_defaults_to_strict() {
        let sys = marking_system(5, "", "", None, None);
        assert!(sys.contains("IDENTITY: Strict VCE marker"));
    }

    #[test]
    fn methods_exam1_note_applies_only_for_tech_free_methods() {
        let topics = vec!["Mathematical Methods".to_string()];
        let note = math_methods_exam1_tech_free_note(&topics, "tech-free");
        assert!(note.contains("EXAM 1 STYLE"));
        let non_free_note = math_methods_exam1_tech_free_note(&topics, "tech-active");
        assert!(non_free_note.is_empty());
        let other_topics = vec!["Chemistry".to_string()];
        let other_note = math_methods_exam1_tech_free_note(&other_topics, "tech-free");
        assert!(other_note.is_empty());
    }

    #[test]
    fn test_subject_specific_guidance_single_subject() {
        let topics = vec!["Chemistry".to_string()];
        let guidance = subject_specific_guidance(&topics);
        assert!(guidance.contains("VCE CHEMISTRY RULES:"));
        assert!(!guidance.contains("VCE BIOLOGY RULES:"));
    }

    #[test]
    fn test_subject_specific_guidance_multiple_subjects() {
        let topics = vec!["Chemistry".to_string(), "Biology".to_string()];
        let guidance = subject_specific_guidance(&topics);
        assert!(guidance.contains("VCE CHEMISTRY RULES:"));
        assert!(guidance.contains("VCE BIOLOGY RULES:"));
    }

    #[test]
    fn test_subject_specific_guidance_no_match() {
        let topics = vec!["Mathematical Methods".to_string()];
        let guidance = subject_specific_guidance(&topics);
        assert!(guidance.is_empty());
    }

    #[test]
    fn test_subject_specific_guidance_deduplication() {
        let topics = vec!["Chemistry".to_string(), "Advanced Chemistry".to_string()];
        let guidance = subject_specific_guidance(&topics);
        let chem_count = guidance.matches("VCE CHEMISTRY RULES:").count();
        assert_eq!(chem_count, 1);
    }

    #[test]
    fn test_subject_specific_guidance_physical_education() {
        let topics = vec!["Physical Education".to_string()];
        let guidance = subject_specific_guidance(&topics);
        assert!(guidance.contains("VCE PHYSICAL EDUCATION RULES:"));
    }

    #[test]
    fn test_subject_specific_guidance_multi_match_and_dedup() {
        let topics = vec![
            "Chemistry".to_string(),
            "Physical Education".to_string(),
            "Physical Education (Specialist)".to_string(),
        ];
        let guidance = subject_specific_guidance(&topics);
        assert!(guidance.contains("VCE CHEMISTRY RULES:"));
        assert!(guidance.contains("VCE PHYSICAL EDUCATION RULES:"));
        let pe_count = guidance.matches("VCE PHYSICAL EDUCATION RULES:").count();
        assert_eq!(pe_count, 1);
    }

    #[test]
    fn difficulty_enforcement_note_applies_to_hard_and_extreme() {
        let hard_written = difficulty_enforcement_note("Hard", false);
        let hard_mc = difficulty_enforcement_note("Hard", true);
        let extreme_written = difficulty_enforcement_note("Extreme", false);

        assert!(hard_written.contains("HARD ENFORCEMENT"));
        assert!(hard_mc.contains("HARD ENFORCEMENT"));
        assert!(extreme_written.contains("EXTREME ENFORCEMENT"));
        assert!(hard_written
            .to_lowercase()
            .contains("do not increase marks"));
        assert!(difficulty_enforcement_note("Medium", false).is_empty());
    }
}

// ─── Subtopic Generation Prompt ───────────────────────────────────────────────

pub fn subtopic_generation_system() -> &'static str {
    "IDENTITY: Expert VCE curriculum designer.\n\n\
MISSION: Generate subtopics that align with exam requirements while prioritizing any user-specified focus areas.\n\n\
CORE RULES:\n\
- Generate VCE {topic} subtopics based on the study design\n\
- If a focus area is specified, it MUST be the highest priority - include multiple related subtopics covering it\n\
- Each subtopic must be specific, assessable, and appropriate for exam questions\n\
- Use proper VCE terminology and command terms\n\
- Output ONLY valid JSON array\n\n\
OUTPUT FORMAT - Each subtopic MUST include all three techniqueNotes fields:\n\
[{\n\
  \"name\": \"Subtopic Name\",\n\
  \"group\": \"unit#-aos-slug\",\n\
  \"techniqueNotes\": {\n\
    \"coreConcepts\": \"Key concepts students must understand (2-4 sentences)\",\n\
    \"examStyleGuidelines\": \"How to approach exam questions on this subtopic, common mistakes to avoid\",\n\
    \"antiPrompts\": [\"What NOT to do\", \"Common student errors\", \"Misconceptions to correct\"]\n\
  }\n\
}]\n\n\
REQUIREMENTS:\n\
- coreConcepts: Essential knowledge students need for this subtopic\n\
- examStyleGuidelines: Strategic advice for exam success, what examiners look for\n\
- antiPrompts: At least 2-3 items students should avoid or common pitfalls\n\n\
STRICT JSON OUTPUT: Output only the JSON array, no markdown or explanation."
}

pub fn subtopic_generation_user_prompt(
    topic: &str,
    exam_guidance: &str,
    existing_subtopics: &[String],
    focus_area: &str,
) -> String {
    let existing_list = if existing_subtopics.is_empty() {
        "None".to_string()
    } else {
        existing_subtopics.join(", ")
    };

    let focus_priority = if focus_area.trim().is_empty() {
        String::new()
    } else {
        format!(
            "PRIORITY FOCUS AREA (must be prominently included):\n{}\n\n",
            focus_area.trim()
        )
    };

    format!(
        "Generate diverse VCE subtopics for {topic}.\n\n\
{focus_priority}\
EXAM GUIDANCE:\n{exam_guidance}\n\n\
Existing subtopics (avoid duplicates):\n{existing_list}\n\n\
Output as JSON with a 'subtopics' array. Each subtopic:\n\
- name: clear specific name\n\
- group: unit/AOS slug (e.g. \"unit1-how-organisms-regulate-functions\")\n\
- techniqueNotes: {{ coreConcepts, examStyleGuidelines, antiPrompts: [] }}\n\
Generate 5-10 subtopics, with focus_area getting priority coverage.",
        topic = topic,
        exam_guidance = exam_guidance,
        existing_list = existing_list,
        focus_priority = focus_priority
    )
}
