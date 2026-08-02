use crate::catalog;
use crate::constants;
use crate::difficulty::difficulty_guidance;
use crate::text_clean::sanitize_for_api;

// ─── Prompt Section Types ─────────────────────────────────────────────────────

/// A composable section of a prompt that knows how to render itself.
pub enum PromptSection {
    /// Static text baked into the binary.
    Static(&'static str),
    /// Identity preamble (e.g. "IDENTITY: Expert VCE exam writer").
    Identity(&'static str),
    /// Hygiene rules from constants.
    Hygiene,
    /// LaTeX formatting rules.
    LatexRules,
    /// Mermaid diagram rules.
    MermaidRules,
    /// Written-style VCAA rules.
    WrittenStyle,
    /// MC-style VCAA rules.
    McStyle,
    /// Generation compliance contract.
    ComplianceContract,
    /// Topic/subtopic field contract.
    FieldContract,
    /// Strict JSON output instructions.
    JsonOutputNote,
    /// Defence-in-depth rules for content inside JSON string values
    /// (no `\nThe`-style escapes, single line of prose, etc.).
    /// Delegates to `json_string_content_rules`.
    JsonStringContentRules,
    /// Marking-specific sections.
    MarkingIdentity {
        max_marks: u8,
        marker_style: Option<String>,
        custom_marker_style: Option<String>,
    },
    MarkingSchemeStyle {
        style: String,
    },
    MarkingGuidance {
        topic: String,
    },
    MarkingLimits {
        max_marks: u8,
    },
    MarkingFeedbackHeaders,
}

impl PromptSection {
    /// Render this section into a string.
    pub fn render(&self) -> String {
        match self {
            PromptSection::Static(s) => s.to_string(),
            PromptSection::Identity(id) => format!("IDENTITY: {id}.\n"),
            PromptSection::Hygiene => constants::GLOBAL_HYGIENE_RULES.to_string(),
            PromptSection::LatexRules => constants::LATEX_RULES.to_string(),
            PromptSection::MermaidRules => constants::MERMAID_RULES.to_string(),
            PromptSection::WrittenStyle => constants::WRITTEN_STYLE_RULES.to_string(),
            PromptSection::McStyle => constants::MC_STYLE_RULES.to_string(),
            PromptSection::ComplianceContract => generation_compliance_contract().to_string(),
            PromptSection::FieldContract => topic_field_contract().to_string(),
            PromptSection::JsonOutputNote => strict_json_output_note().to_string(),
            PromptSection::JsonStringContentRules => json_string_content_rules().to_string(),
            PromptSection::MarkingIdentity {
                max_marks,
                marker_style,
                custom_marker_style,
            } => marking_identity(
                *max_marks,
                marker_style.clone(),
                custom_marker_style.as_deref(),
            ),
            PromptSection::MarkingSchemeStyle { style } => marking_scheme_style_instruction(style),
            PromptSection::MarkingGuidance { topic } => {
                if topic.is_empty() {
                    String::new()
                } else {
                    format!("\n{topic}\n")
                }
            }
            PromptSection::MarkingLimits { max_marks } => marking_limits(*max_marks),
            PromptSection::MarkingFeedbackHeaders => marking_feedback_headers().to_string(),
        }
    }
}

// ─── Prompt Template Builder ──────────────────────────────────────────────────

/// A composable prompt assembled from ordered sections.
pub struct PromptTemplate {
    sections: Vec<String>,
}

impl PromptTemplate {
    pub fn new() -> Self {
        Self {
            sections: Vec::new(),
        }
    }

    pub fn with_section(mut self, section: PromptSection) -> Self {
        let rendered = section.render();
        if !rendered.is_empty() {
            self.sections.push(rendered);
        }
        self
    }

    pub fn build(&self) -> String {
        self.sections
            .iter()
            .filter(|s| !s.is_empty())
            .cloned()
            .collect::<Vec<_>>()
            .join("\n\n")
    }
}

impl Default for PromptTemplate {
    fn default() -> Self {
        Self::new()
    }
}

// ─── Static Prompt Fragments ──────────────────────────────────────────────────

fn generation_compliance_contract() -> &'static str {
    "CONTRACT: 1. Only assessable Study Design content. 2. Focus constraints override style PDFs. 3. PDFs are style-only; do NOT copy scenarios/content. 4. Valid JSON only."
}

fn topic_field_contract() -> &'static str {
    "FIELDS: 'topic' = subject name (e.g. Mathematical Methods); 'subtopic' = focus area label. No subtopics in 'topic' field."
}

fn strict_json_output_note() -> &'static str {
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

fn json_string_content_rules() -> &'static str {
    "JSON STRING CONTENT RULES:\n\
     - Keep each string value on a single logical line. Do not embed raw newlines.\n\
     - Never begin or interrupt a string with `\\n`, `\\t`, `\\r`, `\\f`, or `\\b`\n\
       immediately followed by an upper-case letter (e.g. `\\nThe result`). Reflow\n\
       the text or insert a single space after the escape (`\\n The result`).\n\
     - Escape special characters correctly: `\\\"` for inner quotes, `\\\\` for a\n\
       literal backslash."
}

// ─── Subject-Specific Guidance ────────────────────────────────────────────────

fn subject_specific_guidance(topics: &[String]) -> String {
    let mut s = String::new();
    let mut chemistry_flag = false;
    let mut physical_education_flag = false;
    let mut biology_flag = false;
    let mut specialist_math_flag = false;
    let mut general_math_flag = false;

    for topic in topics {
        let low = topic.to_lowercase();
        if low.contains("chemistry") && !chemistry_flag {
            chemistry_flag = true;
            s.push_str(
                "\nVCE CHEMISTRY RULES:\n\
                - Focus on VCAA key knowledge (e.g., green chemistry principles, stoichiometry, analytical techniques).\n\
                - Emphasize data-driven questions involving the interpretation of tables, graphs, and experimental data.\n\
                - Always provide states of matter in chemical equations where appropriate.\n\
                - Use correct IUPAC nomenclature.",
            );
        }
        if low.contains("physical education") && !physical_education_flag {
            physical_education_flag = true;
            s.push_str(
                "\nVCE PHYSICAL EDUCATION RULES:\n\
                - Focus on biomechanical principles, energy system interplay, and training program design/evaluation.\n\
                - Use highly specific sporting contexts. Demand analysis of physiological data (e.g. lactate curves, VO2 max graphs).\n\
                - DO NOT generate questions that require mathematical calculations, formula derivations, or numerical problem-solving.\n\
                - Simple named formulas are acceptable where the Study Design requires them (e.g. 'Fitt's principle', 'F = ma', 'VO₂max', '1RM') — but do NOT ask students to derive, rearrange, chain equations, or perform multi-step calculations.\n\
                - All questions must be answerable through verbal justification, qualitative analysis, and application of principles — NOT through mathematical working.\n\
                - Question parts and mark schemes must reflect qualitative depth (explain, analyze, evaluate, justify), not calculation steps.",
            );
        }
        if low.contains("biology") && !biology_flag {
            biology_flag = true;
            s.push_str(
                "\nVCE BIOLOGY RULES:\n\
                - Focus on molecular biology, genetics, and immunity. Apply knowledge to NOVEL scenarios.\n\
                - Include experimental design questions and data analysis (e.g. interpreting gel electrophoresis, PCR results).\n\
                - Use precise biological terminology as per VCAA study design.",
            );
        }
        if low.contains("specialist") && !specialist_math_flag {
            specialist_math_flag = true;
            s.push_str(
                "\nVCE SPECIALIST MATHEMATICS RULES:\n\
                - Focus on rigorous formal proof, complex numbers, vectors, kinematics, and advanced calculus.\n\
                - Demand high levels of formal mathematical notation and symbolic reasoning.\n\
                - Scenarios should be abstract or highly technical applications of mathematics.",
            );
        }
        if low.contains("general math") && !general_math_flag {
            general_math_flag = true;
            s.push_str(
                "\nVCE GENERAL MATHEMATICS RULES:\n\
                - Focus on practical, real-world application of mathematics: finance, matrices, networks, and data analysis.\n\
                - Use realistic numbers and clear, straightforward scenarios. Avoid unnecessary abstraction.",
            );
        }
    }
    s
}

fn topic_notes(topics: &[String]) -> String {
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

fn subtopics_note(
    topics: &[String],
    selected: &[String],
    shuffle: bool,
    difficulty: &str,
    tech_mode: &str,
) -> String {
    if selected.is_empty() {
        return String::new();
    }
    let mut subs = selected.to_vec();
    if shuffle {
        use rand::seq::SliceRandom;
        let mut rng = rand::rng();
        subs.shuffle(&mut rng);
    }

    let mut s = format!("\nFocus subtopics: {}.", subs.join(", "));
    for sub in subs {
        let key = sub.trim();
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
                break;
            }
        }
    }
    s
}

fn tech_note(mode: &str, topics: &[String]) -> String {
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

fn subtopic_synthesis_note(selected: Option<&Vec<String>>, question_count: usize) -> String {
    let Some(_subs) = selected.filter(|s| s.len() > 1) else {
        return String::new();
    };
    if question_count <= 3 {
        return "\nINTEGRATED: Focus deeply on a single primary area. If integrating a second area from the selection, ensure the transition is logically authentic to VCE exams and doesn't dilute the focus.".to_string();
    }
    "\nINTEGRATED: Integrate multiple areas where valid. Prefer exam-style synthesis. Use one primary subtopic label per question.".to_string()
}

fn focus_lock_note(
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
        "IMPORTANT: PDFs are for style ONLY. DO NOT reuse any content, scenarios, or numbers. Generate original contexts mapping exclusively to focus constraints.".to_string(),
    );
    lines.join("\n")
}

fn truncate_for_prompt(s: &str, max_chars: usize) -> String {
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

fn prior_examples_note(prior: Option<&[String]>) -> String {
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
    format!("\nRECENT QUESTIONS TO AVOID PARAPHRASING:\n{}\nTreat these as banned scenario/style anchors.", out.join("\n"))
}

fn similarity_note(enabled: bool, prior: Option<&[String]>) -> String {
    if !enabled {
        return String::from(
            "\nDIVERSITY: Each question must use distinct scenarios, contexts, and methods. No repetition of previous questions' structure, numbers, or wording.",
        );
    }
    format!(
        "\nSTRICT DIVERSITY: Generate wholly distinct questions. Avoid reusing scenarios, characters, names, settings, numbers, or reasoning patterns. If unable to invent a unique question for a concept, choose a different concept instead. Prioritize creative variation in context and approach over paraphrased similarity.{}",
        prior_examples_note(prior)
    )
}

fn regen_anti_verbs_note(verbs: &[String]) -> String {
    if verbs.is_empty() {
        return String::new();
    }
    format!(
        "\nR5 RETRY (ANTI-VERB HINT): A previous attempt over-used these command verbs: {}. Use DIFFERENT command verbs where syllabus-valid; do NOT reach for the same verb on consecutive items.",
        verbs.join(", ")
    )
}

fn math_difficulty_note(difficulty: &str, topics: &[String]) -> &'static str {
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

fn difficulty_enforcement_note(difficulty: &str, is_mc: bool) -> &'static str {
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

fn math_methods_exam1_tech_free_note(topics: &[String], tech_mode: &str) -> &'static str {
    let is_methods = topics
        .iter()
        .any(|t| t.trim().eq_ignore_ascii_case("Mathematical Methods"));
    if !is_methods || tech_mode != "tech-free" {
        return "";
    }
    "\nMATHEMATICAL METHODS EXAM 1 STYLE (TECH-FREE, MANDATORY):\n\
     - Follow a scaffolded structure where CONSECUTIVE parts reuse earlier results (use 'Hence, or otherwise' or explicit reference to a prior result).\n\
     - Sequence cognitive demand as procedural setup -> analysis -> synthesis/justification.\n\
     - Balance the batch across algebra/functions, calculus, and probability/statistics.\n\
     - Include both discrete and continuous probability contexts where syllabus-valid; continuous tasks should require integral reasoning in a tech-free way.\n\
     - For any item worth more than 1 mark, design prompts that require clear intermediate working, not just a final answer.\n\
     - Include some later-question style tasks with literal constants/parameters (for example, w) that require symbolic reasoning rather than numeric-only substitution.\n\
     - Maintain strict non-CAS framing: exact values and method-focused working where appropriate."
}

/// R4 - Gate probability-table reminder. Only emit when the topic signals
/// probability work OR the selected subtopic name suggests discrete/continuous
/// distributions. Prevents the long table-format note leaking into Methods
/// unit 1+2 algebra/calculus prompts.
fn probability_distribution_table_note(
    topics: &[String],
    selected_subtopics: Option<&Vec<String>>,
) -> &'static str {
    let topic_signals_prob = topics.iter().any(|t| {
        let low = t.to_lowercase();
        low.contains("mathematical methods")
            || low.contains("specialist mathematics")
            || low.contains("general mathematics")
    }) && topics.iter().any(|t| {
        let low = t.to_lowercase();
        low.contains("probability")
            || low.contains("random variables")
            || low.contains("statistics")
            || low.contains("data analysis")
    });
    let subtopic_signals_prob = selected_subtopics
        .map(|subs| {
            subs.iter().any(|s| {
                let low = s.to_lowercase();
                low.contains("probability")
                    || low.contains("random variable")
                    || low.contains("distribution")
                    || low.contains("bernoulli")
                    || low.contains("binomial")
                    || low.contains("normal")
                    || low.contains("poisson")
                    || low.contains("pdf")
                    || low.contains("pmf")
                    || low.contains("sample proportion")
                    || low.contains("confidence interval")
            })
        })
        .unwrap_or(false);
    if !(topic_signals_prob || subtopic_signals_prob) {
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

// ─── Marking Prompt Fragments ─────────────────────────────────────────────────

fn marking_identity(
    _max_marks: u8,
    marker_style: Option<String>,
    custom_marker_style: Option<&str>,
) -> String {
    let (identity, rules) = match marker_style.as_deref() {
        Some("relaxed") => (
            "Flexible VCE marker",
            "MARKING RULES:\n1. Award marks generously for partial understanding.\n2. Focus on key concepts, not exact wording.\n3. Give credit for reasonable attempts.\n4. Provide encouraging feedback.",
        ),
        Some("targeted") => (
            "Targeted VCE marker",
            "MARKING RULES:\n1. Focus on specific syllabus outcomes.\n2. Assess only what's explicitly taught.\n3. Reward linkage to key knowledge.\n4. Provide criterion-referenced feedback.",
        ),
        Some("custom") if custom_marker_style.is_some_and(|s| !s.is_empty()) => {
            ("Custom VCE marker", custom_marker_style.unwrap_or(""))
        }
        _ => (
            "Strict VCE marker",
            "MARKING RULES:\n1. Criterion-based (steps, not just answers).\n2. Award method marks (M) even if arithmetic slips.\n3. 'show that' needs full algebraic steps — no marks for bare final result.\n4. Consequential marking: an error in an earlier part does NOT penalise later parts if the method is otherwise correct.",
        ),
    };
    format!("IDENTITY: {identity}.\n\n{rules}")
}

fn marking_scheme_style_instruction(style: &str) -> String {
    if style == "rubric-bands" {
        "SCHEME STYLE (RUBRIC BANDS): Use performance level descriptors, not atomic per-mark criteria. For vcaaMarkingScheme, produce a single entry describing the band the response falls into: the criterion is the band name and description; achievedMarks/maxMarks reflect the band allocation. Rationale explains why the response matches this band.".to_string()
    } else {
        "SCHEME STYLE (CRITERION PER MARK): Produce one criterion per mark (or group closely related marks where natural). Each criterion must classify its markType: 'M' for method/approach, 'A' for answer/result, 'C' for communication/explanation/justification.".to_string()
    }
}

fn marking_limits(max_marks: u8) -> String {
    let worked_words = (max_marks as usize * 200).clamp(500, 2000);
    let comparison_words = (max_marks as usize * 60).clamp(200, 800);
    let feedback_words = (max_marks as usize * 50).clamp(200, 600);
    let indicative_words = (max_marks as usize * 80).clamp(200, 1000);
    let rationale_words = (max_marks as usize * 30).clamp(100, 400);
    format!(
        "LIMITS: Verdict ('Correct'/'Incorrect'/'Partial'), Rationale (≤{rationale_words} words), Comparison (≤{comparison_words}), IndicativeContent (≤{indicative_words}), Feedback (≤{feedback_words}), WorkedSolution (≤{worked_words} words)."
    )
}

pub fn marking_schema_guidance_text() -> &'static str {
    "REQUIRED JSON FIELDS (marking):\n\
     - \"verdict\" (string): one of \"Correct\", \"Incorrect\", \"Partial\"\n\
     - \"achievedMarks\" (integer): marks awarded\n\
     - \"maxMarks\" (integer): maximum marks\n\
     - \"partialReason\" (string): when verdict is \"Partial\", one of \"MostlyCorrect\", \"PartialUnderstanding\", \"MethodError\", \"Incomplete\"\n\
     - \"vcaaMarkingScheme\" (array): each item has \"criterion\" (string), \"achievedMarks\" (integer), \"maxMarks\" (integer), \"rationale\" (string), \"markType\" (string: \"M\"/\"A\"/\"C\")\n\
     - \"comparisonToSolutionMarkdown\" (string): how the answer compares to the solution\n\
     - \"feedbackMarkdown\" (string): use ## What a high-scoring response looks like, ## Common errors, ## How to improve headers\n\
     - \"workedSolutionMarkdown\" (string): every step a student needs for full marks\n\
     - \"exemplarResponseMarkdown\" (string): an ideal student answer\n\
     - \"indicativeContentMarkdown\" (string): key points a good answer should include, VCAA marking scheme style\n\
     - \"exemplarAnnotations\" (array): for each part, \"part\" (string), \"marksEarned\" (integer), \"marksAvailable\" (integer), \"note\" (string)\n\
     - \"mcOptionExplanations\" (array): for MC, each with \"option\" (string), \"isCorrect\" (boolean), \"explanation\" (string)"
}

fn marking_feedback_headers() -> &'static str {
    "FEEDBACK STYLE: Write feedback in VCAA examiners' report style. Use ONLY these headers:\n## What a high-scoring response looks like\n## Common errors\n## How to improve"
}

// ─── Exemplars ────────────────────────────────────────────────────────────────

// Per-subject and per-mode exemplar fragments. Each block is small and topical;
// the union is matched against the request's topics so we never dump Methods
// exemplars into a Biology prompt.
fn written_maths_exemplar() -> &'static str {
    "EXEMPLAR (Mathematical Methods, scaffolded — DO NOT reuse content):\n\
     (a) Let $f(x) = 2x^2 - 3x + 1$. Find $f'(-1)$. [1 mark]\n\
     (b) Hence, find the equation of the tangent to $y = f(x)$ at $x = -1$. [2 marks]\n\
     (c) Determine the values of $x$ for which $f(x)$ is decreasing. [2 marks]"
}

fn written_chem_exemplar() -> &'static str {
    "EXEMPLAR (Chemistry, data-driven — DO NOT reuse content):\n\
     A student titrates 25.00 mL of 0.100 mol/L NaOH(aq) with 0.120 mol/L HCl(aq).\n\
     (a) Write the balanced equation. [1 mark]\n\
     (b) Calculate volume of HCl(aq) at the equivalence point. [2 marks]\n\
     (c) Suggest an indicator and justify. [1 mark]"
}

fn written_bio_exemplar() -> &'static str {
    "EXEMPLAR (Biology, experimental design — DO NOT reuse content):\n\
     A geneticist crosses Tt x Tt pea plants.\n\
     (a) State the expected phenotypic ratio. [1 mark]\n\
     (b) In n=400, 230 tall / 170 short. Perform a chi-squared test at 5% significance. [4 marks]"
}

fn written_pe_exemplar() -> &'static str {
    "EXEMPLAR (Physical Education, qualitative — DO NOT reuse content):\n\
     Explain how the three energy systems contribute to a 400 m sprint. Identify the dominant system and justify why it is primarily relied upon in this event. [3 marks]"
}

fn mc_maths_exemplar() -> &'static str {
    "EXEMPLAR MC (Mathematical Methods — DO NOT reuse content):\n\
     If $f(x) = x^3 - 3x + 2$, then $f'(x) =$\n\
     A. $3x^2 - 3x$  B. $3x^2 - 3$  C. $x^3 - 3$  D. $3x^2 + 3$\n\
     Correct: B (power rule: derivative of +2 is 0)"
}

fn mc_chem_exemplar() -> &'static str {
    "EXEMPLAR MC (Chemistry — DO NOT reuse content):\n\
     Oxidation state of Mn in KMnO4 vs MnCl2:\n\
     A. +7 to +2  B. +7 to +4  C. +4 to +2  D. no change\n\
     Correct: A"
}

fn mc_bio_exemplar() -> &'static str {
    "EXEMPLAR MC (Biology — DO NOT reuse content):\n\
     Aa x Aa: expected homozygous proportion?\n\
     A. 1/4  B. 1/2  C. 3/4  D. 1\n\
     Correct: B (AA + aa = 2/4)"
}

fn mc_pe_exemplar() -> &'static str {
    "EXEMPLAR MC (Physical Education — DO NOT reuse content):\n\
     Which energy system dominates a 10 s sprint?\n\
     Correct: ATP-PC (phosphocreatine)"
}

fn exemplar_for_topic(topic: &str, is_mc: bool) -> Option<&'static str> {
    let low = topic.to_lowercase();
    let is_math =
        low.contains("methods") || low.contains("specialist") || low.contains("general math");
    let is_chem = low.contains("chemistry");
    let is_bio = low.contains("biology");
    let is_pe = low.contains("physical education") || low.contains("phys ed") || low.contains("pe");
    match (is_mc, is_math, is_chem, is_bio, is_pe) {
        (false, true, false, false, false) => Some(written_maths_exemplar()),
        (false, false, true, false, false) => Some(written_chem_exemplar()),
        (false, false, false, true, false) => Some(written_bio_exemplar()),
        (false, false, false, false, true) => Some(written_pe_exemplar()),
        (true, true, false, false, false) => Some(mc_maths_exemplar()),
        (true, false, true, false, false) => Some(mc_chem_exemplar()),
        (true, false, false, true, false) => Some(mc_bio_exemplar()),
        (true, false, false, false, true) => Some(mc_pe_exemplar()),
        _ => None,
    }
}

fn exemplars_note(topics: &[String], is_mc: bool) -> String {
    let mut s = String::new();
    let mut seen = std::collections::HashSet::<String>::new();
    s.push_str("\nEXEMPLAR QUESTIONS (style reference only — do NOT reuse content):");
    let mut emitted = 0usize;
    for topic in topics {
        // Dedup by canonical subject family so Methods+Specialist+GenMath don't triple up.
        let family_key = if topic.to_lowercase().contains("math") {
            "math".to_string()
        } else if topic.to_lowercase().contains("chem") {
            "chem".to_string()
        } else if topic.to_lowercase().contains("bio") {
            "bio".to_string()
        } else if topic.to_lowercase().contains("physical")
            || topic.to_lowercase().contains("phys ed")
        {
            "pe".to_string()
        } else {
            topic.to_lowercase()
        };
        if !seen.insert(family_key) {
            continue;
        }
        if let Some(text) = exemplar_for_topic(topic, is_mc) {
            s.push('\n');
            s.push_str(text);
            emitted += 1;
        }
        if emitted >= 2 {
            break;
        }
    }
    // R1: diagnostic when no per-subject exemplar matched (new VCE subject or
    // unknown topic name) so the gap is visible. We use eprintln! rather than
    // the typed `engine::rust_log` channel because this helper is called
    // outside of an EngineContext; plumbing ctx end-to-end for one warn is
    // more cost than the diagnostic is worth. Intentional — do NOT replace
    // with `crate::engine::rust_log` without threading ctx through
    // `GenerationPromptParams` / `build_written` / `build_mc`.
    if emitted == 0 && !topics.is_empty() {
        eprintln!(
            "[questiongen warn] R1 exemplar miss: no per-subject exemplar matched topics={:?} is_mc={}",
            topics, is_mc
        );
    }
    s
}

// ─── High-Level Prompt Builders ───────────────────────────────────────────────

/// Build a system prompt for written question generation.
pub fn written_system_prompt() -> String {
    PromptTemplate::new()
        .with_section(PromptSection::Identity("Expert VCE written-response exam writer"))
        .with_section(PromptSection::ComplianceContract)
        .with_section(PromptSection::Hygiene)
        .with_section(PromptSection::LatexRules)
        .with_section(PromptSection::WrittenStyle)
        .with_section(PromptSection::MermaidRules)
        .with_section(PromptSection::Static(
            "CORE RULES:\n- Use precise VCAA command terms (e.g. 'state', 'describe', 'explain', 'justify', 'evaluate', 'compare', 'derive', 'show that').\n- 'show that': every step must be explicit.\n- 'justify': reasoning required.\n- 'promptMarkdown' contains STEM ONLY. No solutions/answers."
        ))
        .with_section(PromptSection::FieldContract)
        .with_section(PromptSection::JsonOutputNote)
        .with_section(PromptSection::JsonStringContentRules)
        .build()
}

/// Build a system prompt for MC question generation.
pub fn mc_system_prompt() -> String {
    PromptTemplate::new()
        .with_section(PromptSection::Identity("Expert VCE multiple-choice exam writer"))
        .with_section(PromptSection::ComplianceContract)
        .with_section(PromptSection::Hygiene)
        .with_section(PromptSection::LatexRules)
        .with_section(PromptSection::McStyle)
        .with_section(PromptSection::MermaidRules)
        .with_section(PromptSection::Static(
            "CORE RULES:\n- Use VCE standard phrasing and plausible distractors.\n- Provide ONLY final answers and concise rationale.\n- NO chain-of-thought in output.\n- 'promptMarkdown' contains STEM ONLY. No options (A-D) in stem."
        ))
        .with_section(PromptSection::FieldContract)
        .with_section(PromptSection::JsonOutputNote)
        .with_section(PromptSection::JsonStringContentRules)
        .build()
}

/// Build a system prompt for marking.
pub fn marking_system_prompt(
    max_marks: u8,
    marking_guidance: &str,
    marking_scheme_style: &str,
    marker_style: Option<String>,
    custom_marker_style: Option<String>,
) -> String {
    let template = PromptTemplate::new()
        .with_section(PromptSection::MarkingIdentity {
            max_marks,
            marker_style,
            custom_marker_style,
        })
        .with_section(PromptSection::MarkingSchemeStyle {
            style: marking_scheme_style.to_string(),
        })
        .with_section(PromptSection::Hygiene)
        .with_section(PromptSection::LatexRules)
        .with_section(PromptSection::MermaidRules)
        .with_section(PromptSection::MarkingGuidance {
            topic: marking_guidance.to_string(),
        })
        .with_section(PromptSection::Static(
            "REPORTS: PDFs are PRIMARY authority for criteria.",
        ))
        .with_section(PromptSection::MarkingLimits { max_marks })
        .with_section(PromptSection::MarkingFeedbackHeaders)
        .with_section(PromptSection::Static(marking_schema_guidance_text()))
        .with_section(PromptSection::JsonStringContentRules);

    template.build()
}

/// Parameters for building a user generation prompt.
#[derive(Clone, Debug)]
pub struct GenerationPromptParams {
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
    /// R5 retry: command verbs that dominated the previous batch — injected as
    /// an explicit anti-hint for the model to vary its verb usage. Populated
    /// only on retry attempts.
    pub regen_anti_verbs: Vec<String>,
}

impl Default for GenerationPromptParams {
    fn default() -> Self {
        Self {
            count: 0,
            topics: Vec::new(),
            difficulty: String::new(),
            average_marks: None,
            subtopics: None,
            custom_focus_area: None,
            tech_mode: "tech-active".to_string(),
            include_exam_context: false,
            avoid_similar_questions: false,
            diversity_enabled: false,
            shuffle_subtopics: false,
            prior_question_prompts: None,
            regen_anti_verbs: Vec::new(),
        }
    }
}

impl GenerationPromptParams {
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
            "\n\nEXAM PDF CONTEXT:\n- Use attached PDFs for wording/layout style only.\n- Do not source topics, facts, numbers, or scenarios from PDFs.\n- Apply focus constraints and Study Design limits before final output."
        } else {
            ""
        };

        let scaffolding_note = if self.count == 1 && average_marks >= 4 {
            "\nSTRUCTURE: Generate a comprehensive, multi-part extended response item (e.g., Part a, b, c). Sequence the cognitive demand logically: begin with procedural/setup tasks, progress to analysis, and conclude with synthesis/evaluation or justification."
        } else {
            ""
        };

        let exemplars = sanitize_for_api(&exemplars_note(&self.topics, false));
        let regen_anti = sanitize_for_api(&regen_anti_verbs_note(&self.regen_anti_verbs));

        format!(
            "USER REQUEST:\nGenerate {count} VCE written questions.\nTopics: {topics}\nDifficulty: {difficulty} ({diff_rules})\nAverage marks: {average_marks} (Total marks: {total_marks})\n\nCONSTRAINTS:\n- CRITICAL: Do NOT exceed the average marks requested. Keep each question's marks AT OR NEAR {average_marks}. Difficulty should come from cognitive complexity, NOT from mark bloat.\n- Complexity must match marks (e.g., 5-6 marks = 2-3 parts).\n{scaffolding}{subs_note}{synth_note}{custom_note}{tech}{difficulty_enforcement}{topic_notes}{math_diff}{methods_exam1_note}{prob_table_note}{sim_note}{regen_anti}{focus_lock}{exam_context_preamble}\n\n{exemplars}\nGOAL: Output exactly {count} high-quality questions following VCAA standards.",
            count = self.count,
            topics = sanitize_for_api(&self.topics.join(", ")),
            difficulty = self.difficulty,
            diff_rules = difficulty_guidance(&self.difficulty),
            scaffolding = scaffolding_note,
            subs_note = sanitize_for_api(&subtopics_note(&self.topics, self.subtopics.as_deref().unwrap_or(&[]), self.shuffle_subtopics, &self.difficulty, &self.tech_mode)),
            synth_note = sanitize_for_api(&subtopic_synthesis_note(self.subtopics.as_ref(), self.count)),
            custom_note = sanitize_for_api(&custom_note),
            tech = tech_note(&self.tech_mode, &self.topics),
            difficulty_enforcement = difficulty_enforcement_note(&self.difficulty, false),
            topic_notes = topic_notes(&self.topics),
            math_diff = math_difficulty_note(&self.difficulty, &self.topics),
            methods_exam1_note = math_methods_exam1_tech_free_note(&self.topics, &self.tech_mode),
            prob_table_note = probability_distribution_table_note(&self.topics, self.subtopics.as_ref()),
            focus_lock = sanitize_for_api(&focus_lock_note(self.subtopics.as_ref(), self.custom_focus_area.as_deref(), self.shuffle_subtopics, self.count)),
            exam_context_preamble = exam_context_preamble,
            average_marks = average_marks,
            total_marks = total_marks,
            sim_note = sanitize_for_api(&similarity_note(
                self.avoid_similar_questions || self.diversity_enabled,
                self.prior_question_prompts.as_deref(),
            )),
            regen_anti = regen_anti,
            exemplars = exemplars,
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
            "\n\nEXAM PDF CONTEXT:\n- Use attached PDFs for wording/layout style only.\n- Do not source topics, facts, numbers, or scenarios from PDFs.\n- Apply focus constraints and Study Design limits before final output."
        } else {
            ""
        };

        let exemplars = sanitize_for_api(&exemplars_note(&self.topics, true));
        let regen_anti = sanitize_for_api(&regen_anti_verbs_note(&self.regen_anti_verbs));

        format!(
            "USER REQUEST:\nGenerate {count} VCE multiple-choice questions (1 mark each).\nTopics: {topics}\nDifficulty: {difficulty} ({diff_rules})\n\nCONSTRAINTS:\n{subs_note}{synth_note}{custom_note}{tech}{difficulty_enforcement}{topic_notes}{math_diff}{prob_table_note}{sim_note}{regen_anti}{focus_lock}{exam_context_preamble}\n\n{exemplars}\nGOAL: Output exactly {count} high-quality questions following VCAA standards.",
            count = self.count,
            topics = sanitize_for_api(&self.topics.join(", ")),
            difficulty = self.difficulty,
            diff_rules = difficulty_guidance(&self.difficulty),
            subs_note = sanitize_for_api(&subtopics_note(&self.topics, self.subtopics.as_deref().unwrap_or(&[]), self.shuffle_subtopics, &self.difficulty, &self.tech_mode)),
            synth_note = sanitize_for_api(&subtopic_synthesis_note(self.subtopics.as_ref(), self.count)),
            custom_note = sanitize_for_api(&custom_note),
            tech = tech_note(&self.tech_mode, &self.topics),
            difficulty_enforcement = difficulty_enforcement_note(&self.difficulty, true),
            topic_notes = topic_notes(&self.topics),
            math_diff = math_difficulty_note(&self.difficulty, &self.topics),
            prob_table_note = probability_distribution_table_note(&self.topics, self.subtopics.as_ref()),
            focus_lock = sanitize_for_api(&focus_lock_note(self.subtopics.as_ref(), self.custom_focus_area.as_deref(), self.shuffle_subtopics, self.count)),
            exam_context_preamble = exam_context_preamble,
            sim_note = sanitize_for_api(&similarity_note(
                self.avoid_similar_questions || self.diversity_enabled,
                self.prior_question_prompts.as_deref(),
            )),
            regen_anti = regen_anti,
            exemplars = exemplars,
        )
    }
}

/// Build a marking user prompt.
pub fn marking_user_prompt(
    topic: &str,
    subtopic: &str,
    question: &str,
    max_marks: u8,
    answer: &str,
    report_preamble: &str,
    pdf_pages_note: &str,
) -> String {
    format!(
        "Topic: {topic}\nSubtopic: {subtopic}\nQuestion ({max} marks):\n{question}\n\n{pdf_pages_note}Student answer:\n{answer}\n\nMARKING INSTRUCTIONS:\n- Apply Vcaa criterion-based marking strictly.\n- Do not award marks for correct answers without correct supporting working or reasoning (except for questions that are purely answer-only).\n- Do not credit vague restatements of the question as explanation.\n- For 'show that' sub-parts: every algebraic step must be shown; a bare final result is zero.\n- For 'explain/justify': a numerical answer alone is insufficient — reasoning must be stated.\n- CONSEQUENTIAL MARKING: if an error in an earlier part propagates to a later part but the later part's method is otherwise correct, award FULL marks for the later part. Penalise each error only once.\n- Classify each vcaaMarkingScheme criterion with markType: 'M' (method/approach), 'A' (answer/result), or 'C' (communication/explanation/justification).\n- When verdict is 'Partial', set partialReason to one of: 'MostlyCorrect', 'PartialUnderstanding', 'MethodError', 'Incomplete'.\n- Provide indicativeContentMarkdown: list the key points a good answer should include, in Vcaa marking scheme bullet-point style. Include multiple valid approaches where they exist.\n- Provide exemplarAnnotations: for each part (a)/(b)/(c), annotate why it earned its marks (part, marksEarned, marksAvailable, note).\n- The workedSolution must show every step a student would need to write to receive full marks.{report_preamble}",
        topic = topic,
        subtopic = subtopic,
        question = question,
        max = max_marks,
        answer = answer,
        report_preamble = report_preamble,
        pdf_pages_note = pdf_pages_note
    )
}

/// Build a subtopic generation system prompt.
pub fn subtopic_generation_system() -> String {
    format!(
        "IDENTITY: Expert VCE curriculum designer.\n\n\
MISSION: Generate subtopics that align with exam requirements while prioritizing any user-specified focus areas.\n\n\
CORE RULES:\n\
- Generate VCE subtopics based on the study design\n\
- If a focus area is specified, it MUST be the highest priority - include multiple related subtopics covering it\n\
- Each subtopic must be specific, assessable, and appropriate for exam questions\n\
- Use proper VCE terminology and command terms\n\
- Output ONLY valid JSON array\n\n\
OUTPUT FORMAT - Each subtopic MUST include all three techniqueNotes fields:\n\
[{{\n\
  \"name\": \"Subtopic Name\",\n\
  \"group\": \"unit#-aos-slug\",\n\
  \"techniqueNotes\": {{\n\
    \"coreConcepts\": \"Key concepts students must understand (2-4 sentences)\",\n\
    \"examStyleGuidelines\": \"How to approach exam questions on this subtopic, common mistakes to avoid\",\n\
    \"antiPrompts\": [\"What NOT to do\", \"Common student errors\", \"Misconceptions to correct\"]\n\
  }}\n\
}}]\n\n\
REQUIREMENTS:\n\
- coreConcepts: Essential knowledge students need for this subtopic\n\
- examStyleGuidelines: Strategic advice for exam success, what examiners look for\n\
- antiPrompts: At least 2-3 items students should avoid or common pitfalls\n\n\
STRICT JSON OUTPUT: Output only the JSON array, no markdown or explanation.\n\n\
{}",
        json_string_content_rules()
    )
}

/// Build a subtopic generation user prompt.
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
        "Generate diverse VCE subtopics for {topic}.\n\n{focus_priority}EXAM GUIDANCE:\n{exam_guidance}\n\nExisting subtopics (avoid duplicates):\n{existing_list}\n\nOutput as JSON with a 'subtopics' array. Each subtopic:\n- name: clear specific name\n- group: unit/AOS slug (e.g. \"unit1-how-organisms-regulate-functions\")\n- techniqueNotes: {{ coreConcepts, examStyleGuidelines, antiPrompts: [] }}\nGenerate 5-10 subtopics, with focus_area getting priority coverage.",
        topic = topic,
        exam_guidance = exam_guidance,
        existing_list = existing_list,
        focus_priority = focus_priority
    )
}
