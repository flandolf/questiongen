use crate::catalog;
use crate::constants;
use crate::difficulty::difficulty_guidance;
use crate::parsing::sanitize_for_api;

pub fn generation_compliance_contract() -> &'static str {
    "CONTRACT: 1. Only assessable Study Design content. 2. Focus constraints override style PDFs. 3. PDFs are style-only; do NOT copy scenarios/content. 4. Valid JSON only."
}

pub fn topic_field_contract() -> &'static str {
    "FIELDS: 'topic' = subject name (e.g. Mathematical Methods); 'subtopic' = focus area label. No subtopics in 'topic' field."
}

pub fn written_system() -> String {
    format!(
        "IDENTITY: Expert VCE written-response exam writer.\n\n\
         {contract}\n\
         {hygiene}\n\
         {latex_rules}\n\
         {style_rules}\n\n\
         CORE RULES:\n\
         - 'show that': every step must be explicit.\n\
         - 'hence': must use previous result.\n\
         - 'justify': reasoning required.\n\
         - 'promptMarkdown' contains STEM ONLY. No solutions/answers.\n\n\
         {field_contract}",
        contract = generation_compliance_contract(),
        hygiene = constants::GLOBAL_HYGIENE_RULES,
        latex_rules = constants::LATEX_RULES,
        style_rules = constants::WRITTEN_STYLE_RULES,
        field_contract = topic_field_contract(),
    )
}

pub fn mc_system() -> String {
    format!(
        "IDENTITY: Expert VCE multiple-choice exam writer.\n\n\
         {contract}\n\
         {hygiene}\n\
         {latex_rules}\n\
         {style_rules}\n\n\
         CORE RULES:\n\
         - Provide ONLY final answers and concise rationale.\n\
         - NO chain-of-thought in output.\n\
         - 'promptMarkdown' contains STEM ONLY. No options (A-D) in stem.\n\n\
         {field_contract}",
        contract = generation_compliance_contract(),
        hygiene = constants::GLOBAL_HYGIENE_RULES,
        latex_rules = constants::LATEX_RULES,
        style_rules = constants::MC_STYLE_RULES,
        field_contract = topic_field_contract(),
    )
}

pub fn marking_system(max_marks: u8, chem_note: &str, phys_ed_note: &str) -> String {
    // Scale word limits by marks, with sensible floors.
    let worked_words = (max_marks as usize * 200).clamp(500, 2000);
    let comparison_words = (max_marks as usize * 60).clamp(200, 800);
    let feedback_words = (max_marks as usize * 50).clamp(200, 600);
    let rationale_words = (max_marks as usize * 30).clamp(100, 400);

    format!(
        "IDENTITY: Strict VCE marker.\n\n\
         MARKING RULES:\n\
         1. Criterion-based (steps, not just answers).\n\
         2. Award for method even if arithmetic slips.\n\
         3. 'show that' needs full algebraic steps.\n\
         4. 'hence' must use previous part results.\n\
         5. MC: justify correct and explain all 3 distractors.\n\n\
         {hygiene}\n\
         {latex_rules}\n\
         {chem_note}{phys_ed_note}\n\n\
         REPORTS: PDFs are PRIMARY authority for criteria.\n\n\
         LIMITS: Verdict ('Correct'/'Incorrect'), Rationale (≤{rationale_words} words), Comparison (≤{comparison_words}), Feedback (≤{feedback_words}), Worked Solution (≤{worked_words} words).\n\n\
         FEEDBACK STYLE: Use ONLY ## Strengths, ## Areas for Improvement, ## Common Pitfalls headers.",
         rationale_words = rationale_words,
         comparison_words = comparison_words,
         feedback_words = feedback_words,
         worked_words = worked_words,
         hygiene = constants::GLOBAL_HYGIENE_RULES,
         latex_rules = constants::LATEX_RULES,
         chem_note = chem_note,
         phys_ed_note = phys_ed_note
    )
}

pub fn topic_notes(topics: &[String], _selected_subs: Option<&Vec<String>>) -> String {
    let mut s = String::new();
    for topic_name in topics {
        let guidance = catalog::topic_exam_guidance(topic_name);
        if !guidance.is_empty() {
            s.push('\n');
            s.push_str(guidance);
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

pub fn subtopics_note(selected: Option<&Vec<String>>, shuffle: bool) -> String {
    let Some(mut subs) = selected.filter(|s| !s.is_empty()).cloned() else {
        return String::new();
    };

    if shuffle {
        use rand::seq::SliceRandom;
        let mut rng = rand::rng();
        subs.shuffle(&mut rng);
    }

    let mut s = format!("\nFocus subtopics: {}.", subs.join(", "));

    // Inject Study Design key knowledge and exam technique notes from the catalog.
    let exam_map = constants::shared_subtopic_exam_technique_notes();
    for sub in subs {
        let key = sub.trim().to_ascii_lowercase();

        if let Some(exam) = exam_map.get(key.as_str()) {
            s.push_str(&format!("\n\n[{sub}]\n{exam}"));
        }
    }
    s
}

pub fn subtopic_synthesis_note(selected: Option<&Vec<String>>, question_count: usize) -> String {
    let Some(_) = selected.filter(|s| s.len() > 1) else {
        return String::new();
    };

    let min_to_blend = if question_count <= 3 { 2 } else { 1 };
    let blend_scope = if min_to_blend >= 2 {
        "integrate at least two focus areas per question"
    } else {
        "integrate multiple areas where valid"
    };

    format!("\nINTEGRATED: {blend_scope}. Prefer exam-style synthesis. Use one primary subtopic label per question.")
}

pub fn focus_lock_note(
    selected: Option<&Vec<String>>,
    custom_focus_area: Option<&str>,
    shuffle: bool,
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

    format!(
        "\nFOCUS LOCK: {}. Use these focus constraints exclusively; prioritize over PDF content.",
        constraints.join(" ")
    )
}

pub fn pdf_reanchor_note(
    selected: Option<&Vec<String>>,
    custom_focus_area: Option<&str>,
    shuffle: bool,
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

        format!(
            "USER REQUEST:\n\
             Generate {count} VCE written questions.\n\
             Topics: {topics}\n\
             Difficulty: {difficulty} ({diff_rules})\n\
             Average marks: {average_marks} (Total marks: {total_marks})\n\n\
             CONSTRAINTS:\n\
             - Complexity must match marks (e.g., 5-6 marks = 2-3 parts).\n\
             {subs_note}{synth_note}{custom_note}{tech}{topic_notes}{math_diff}{methods_exam1_note}{prob_table_note}{sim_note}{focus_lock}{exam_context_preamble}\n\n\
             GOAL: Output exactly {count} high-quality questions following VCAA standards.",
            count                 = self.count,
            topics                = sanitize_for_api(&self.topics.join(", ")),
            difficulty            = self.difficulty,
            diff_rules            = difficulty_guidance(&self.difficulty),
            subs_note             = sanitize_for_api(&subtopics_note(self.subtopics.as_ref(), self.shuffle_subtopics)),
            synth_note            = sanitize_for_api(&subtopic_synthesis_note(self.subtopics.as_ref(), self.count)),
            custom_note           = sanitize_for_api(&custom_note),
            tech                  = tech_note(&self.tech_mode, &self.topics),
            topic_notes           = topic_notes(&self.topics, self.subtopics.as_ref()),
            math_diff             = math_difficulty_note(&self.difficulty, &self.topics),
            methods_exam1_note    = math_methods_exam1_tech_free_note(&self.topics, &self.tech_mode),
            prob_table_note       = probability_distribution_table_note(&self.topics),
            focus_lock            = sanitize_for_api(&focus_lock_note(self.subtopics.as_ref(), self.custom_focus_area.as_deref(), self.shuffle_subtopics)),
            exam_context_preamble = exam_context_preamble,
            average_marks         = average_marks,
            total_marks           = total_marks,
            sim_note              = sanitize_for_api(&similarity_note(
                self.avoid_similar_questions,
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
             {subs_note}{synth_note}{custom_note}{tech}{topic_notes}{math_diff}{prob_table_note}{sim_note}{focus_lock}{exam_context_preamble}\n\n\
             GOAL: Output exactly {count} high-quality questions following VCAA standards.",
            count                 = self.count,
            topics                = sanitize_for_api(&self.topics.join(", ")),
            difficulty            = self.difficulty,
            diff_rules            = difficulty_guidance(&self.difficulty),
            subs_note             = sanitize_for_api(&subtopics_note(self.subtopics.as_ref(), self.shuffle_subtopics)),
            synth_note            = sanitize_for_api(&subtopic_synthesis_note(self.subtopics.as_ref(), self.count)),
            custom_note           = sanitize_for_api(&custom_note),
            tech                  = tech_note(&self.tech_mode, &self.topics),
            topic_notes           = topic_notes(&self.topics, self.subtopics.as_ref()),
            math_diff             = math_difficulty_note(&self.difficulty, &self.topics),
            prob_table_note       = probability_distribution_table_note(&self.topics),
            focus_lock            = sanitize_for_api(&focus_lock_note(self.subtopics.as_ref(), self.custom_focus_area.as_deref(), self.shuffle_subtopics)),
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
        let sys_1 = marking_system(1, "", "");
        assert!(sys_1.contains("≤100 words"));
        let sys_10 = marking_system(10, "", "");
        assert!(sys_10.contains("≤2000 words"));
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
}
