use once_cell::sync::Lazy;
use serde::Deserialize;
use std::collections::HashMap;

pub const OPENROUTER_CHAT_URL: &str = "https://openrouter.ai/api/v1/chat/completions";

// ─── Topic name constants (used in marking logic) ─────────────────────────────
pub const PHYSICAL_EDUCATION_TOPIC: &str = "Physical Education";
pub const CHEMISTRY_TOPIC: &str = "Chemistry";

// ─── Generation limits ────────────────────────────────────────────────────────

pub const MAX_QUESTION_COUNT: usize = 20;
pub const MAX_MARKS_PER_QUESTION: u8 = 30;
pub const MIN_MARKS_PER_QUESTION: u8 = 1;

// ─── MC validation constants ──────────────────────────────────────────────────

pub const MC_MAX_EXPLANATION_WORDS: usize = 180;

pub const DISALLOWED_SELF_TALK: &[&str] = &[
    "let's",
    "let us",
    "i will",
    "i'll",
    "wait,",
    "not in options",
    "error in options",
    "to make it work",
    "change the question",
    "adjust the question",
    "revised prompt",
    "i'll update",
];

pub const DISALLOWED_METHOD_INSTRUCTIONS: &[&str] = &[
    "you will first",
    "you will then",
    "you will need to",
    "first use",
    "then apply",
    "apply a",
    "use differentiation to",
    "use integration to",
    "use the graph",
    "transform the graph",
    "obtain new",
    "stationary-point information",
    "you may need to",
    "you should first",
    "start by",
    "begin by",
    "proceed by",
    "the student should first",
    "the student will",
    "must first",
    "should first",
    "need to first",
];

pub const APP_STATE_FILE_NAME: &str = "app-state.json";

// ─── Global style rules (truly constant, not curriculum-dependent) ────────────

/// Injected into every system prompt.
pub const LATEX_RULES: &str = " LaTeX (STRICT):
(1) Every mathematical expression MUST be wrapped in LaTeX delimiters. Use inline $...$ for in-sentence math and $$...$$ for display math.
(2) NEVER use \\(...\\) or \\[...\\].
(3) Keep plain English outside delimiters. Put symbols, equations, function notation, subscripts/superscripts, fractions, radicals, vectors and operators inside delimiters.
(4) For matrices or multi-line layouts, use display math blocks only (e.g. $$\\begin{pmatrix}...\\end{pmatrix}$$).
(5) Chemistry species must use LaTeX text mode, e.g. $\\text{H}_2\\text{O}$, $\\text{Fe}^{3+}$.
(6) Punctuation rule: punctuation belongs outside math delimiters unless mathematically required.
(7) NO UNICODE: Use ONLY ASCII characters. Replace all Unicode symbols with LaTeX equivalents: use \\alpha, \\beta, \\gamma, \\theta, \\phi, \\omega, \\cdot, \\times, \\div, \\pm, \\leq, \\geq, \\neq, \\infty, \\sqrt, \\rightarrow, \\Rightarrow instead of alpha, beta, theta, etc. Never use em dashes (---), en dashes (--), smart quotes (\"\" or ''), bullet points (\\u2022), or any non-ASCII characters.";

pub const QUESTION_STYLE_RULES: &str = "
QUESTION STYLE RULES (STRICT — violation produces zero marks):

(1) STRUCTURE — BREAK THESE RULES AND THE QUESTION IS INVALID
- Structure MUST match allocated marks and cognitive demand.
- Use a single-part stem-only question for low-mark direct items; use multi-part format only when marks justify scaffolding.
- If multi-part, labels MUST be lowercase alphabetical: (a), (b), (c), ... in order.
- Use blank lines between stem and parts, and between parts.
- For multi-part questions, include mark allocations inline as [X marks] at the end of each part.
- For single-part questions, DO NOT force artificial part labels.
- NO HTML tags anywhere.

(2) FOCUS AREA ENFORCEMENT (HIGHEST PRIORITY)
- When subtopics are specified, EVERY part of EVERY question MUST draw exclusively from those areas.
- DO NOT introduce supporting concepts from outside the specified subtopics, even as scaffolding.
- Command verbs MUST match the focus area: 'sketch' ONLY if graphing is specified; 'prove' ONLY if proof is specified.

(3) SCAFFOLDING (non-negotiable for ≥4 marks)
- Earlier parts MUST produce intermediate results used in later parts.
- Final part MUST require synthesis, justification, or non-routine application — NOT mere substitution.
- Parts MUST strictly increase in cognitive demand: recall → method → synthesis.
- ANY part that can be solved WITHOUT using the previous part's result invalidates the scaffolding.

(4) MARK ALLOCATION (enforced strictly)
- 1 mark: single recall or direct substitution only.
- 2 marks: method selection + execution.
- 3 marks: multi-step chain with all reasoning shown.
- 4+ marks: multi-part synthesis or justification chains ONLY.
- NEVER assign 3+ marks to any question solvable in a single algebraic step.
- If a question has labelled parts, total marks MUST equal the sum of part marks; stem receives no direct marks.

(5) DIFFICULTY (must match label, not topic)
- Easy: method directly implied; single concept; no ambiguity.
- Medium: student selects method; two+ concepts combined; intermediate results required.
- Hard: method NOT signposted; requires non-routine setup OR reversal of standard process OR constraint identification not named in question.
- HARD ROUTINE TOPICS MUST contain a deliberate non-routine twist — downgrade difficulty if no twist exists.

(6) ANTI-PATTERNS (instant rejection)
- ABSOLUTELY FORBIDDEN: 'A particle moves along a straight line…' openings.
- FORBIDDEN: any question where every part is direct substitution with no method choice.
- FORBIDDEN: two questions testing the same underlying skill in the same batch.
- FORBIDDEN: multi-mark questions with single algebraic step dressed across parts.
- FORBIDDEN: parts labelled (a), (b), (c) that could be answered in any order.
- FORBIDDEN: decorative stimuli — every stimulus element must be used by at least one part.

(7) BATCH DIVERSITY (strict)
- Across a generated batch, do NOT produce two questions that test the same underlying skill with superficial context changes.
- Vary command verbs and task types (e.g. interpret, derive, justify, compare, model) while remaining within selected focus areas.

(8) OUTPUT HYGIENE (strict)
- Output valid JSON only, matching the requested schema exactly.
- No markdown fences, no prefatory text, no trailing commentary.
- Do not invent keys not present in the required schema.
";

/// Injected into MC question-generation prompts for distractor quality.
pub const MC_DISTRACTOR_RULES: &str = "
MC RULES (STRICT):
(1) Each option MUST be a complete, standalone answer to the question — never sentence fragments or single words.
(2) Options MUST be parallel in structure and style.
(3) FORBIDDEN: Do NOT include labels (A., B., C., D.) or the option text inside the 'promptMarkdown' field. 
(4) The 'promptMarkdown' should contain ONLY the question stem. The options belong exclusively in the 'options' array.
(5) Provide EXACTLY 4 options with labels A, B, C, D (one of each, no duplicates, no omissions).
(6) Exactly ONE option must be correct. The 'correctAnswer' value MUST match the label of that option.
(7) Distractors must be plausible and map to distinct misconceptions or common procedural errors.
(8) Avoid giveaway patterns: no noticeably longer correct option, no grammatical mismatch, no 'all/none of the above'.
(9) If the stem contains numbers/data, ensure every option is internally consistent with the same givens.
(10) Keep option length reasonably balanced to reduce testwiseness.
(11) 'explanationMarkdown' must briefly justify the correct option and name the misconception targeted by each wrong option.
(12) Output valid JSON only; no markdown fences or extra commentary.
";

/// Chemistry-specific LaTeX guidance.
pub const CHEMISTRY_LATEX_GUIDANCE: &str =
    " Render every chemical formula/ionic species in LaTeX: $\\text{H}_2\\text{O}$, \
$\\text{CO}_2$, $\\text{Fe}^{3+}$, $\\text{SO}_4^{2-}$. ";

// ─── Shared exam technique notes from catalog ─────────────────────────────────
// These are loaded from subtopic-catalog.json at compile time.
// The catalog contains both `instruction` and `techniqueNotes` per subtopic;
// we merge them here so callers get the full technique guidance.

#[derive(Debug, Deserialize)]
struct SharedSubtopicCatalog {
    topics: Vec<SharedTopicEntry>,
}

#[derive(Debug, Deserialize)]
struct SharedTopicEntry {
    subtopics: Vec<SharedSubtopicEntry>,
}

#[derive(Debug, Deserialize)]
struct SharedSubtopicEntry {
    name: String,
    #[serde(default)]
    instruction: Option<String>,
    #[serde(default)]
    technique_notes: String,
}

static SHARED_SUBTOPIC_EXAM_NOTES: Lazy<HashMap<String, String>> = Lazy::new(|| {
    let raw = include_str!("../../src/shared/subtopic-catalog.json");
    let Ok(catalog) = serde_json::from_str::<SharedSubtopicCatalog>(raw) else {
        return HashMap::new();
    };

    let mut notes = HashMap::new();
    for topic in catalog.topics {
        for subtopic in topic.subtopics {
            let mut combined = String::new();
            if let Some(ref instr) = subtopic.instruction {
                if !instr.trim().is_empty() {
                    combined.push_str(instr);
                }
            }
            if !subtopic.technique_notes.trim().is_empty() {
                if !combined.is_empty() {
                    combined.push_str("\n\n");
                }
                combined.push_str(&subtopic.technique_notes);
            }
            if !combined.trim().is_empty() {
                notes.insert(subtopic.name.trim().to_ascii_lowercase(), combined);
            }
        }
    }
    notes
});

pub fn shared_subtopic_exam_technique_notes() -> &'static HashMap<String, String> {
    &SHARED_SUBTOPIC_EXAM_NOTES
}
