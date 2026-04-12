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

pub const GLOBAL_HYGIENE_RULES: &str = "
HYGIENE:
- Output VALID JSON ONLY.
- NO preamble, NO commentary, NO markdown fences (e.g. no ```json).
- ASCII ONLY: No unicode, smart-quotes, or fancy characters (™, ®, ℓ, Ω).
- PROFESSIONALISM: Standard punctuation only. No excessive exclamation marks (!).";

/// Injected into every system prompt.
pub const LATEX_RULES: &str = r#"
LATEX:
- Use inline $...$ or display $$...$$. NO \(...\) or \[...\].
- Use LaTeX for ALL math symbols, Greek letters, and Chemistry species ($\text{H}_2\text{O}$).
- Do not place LaTeX commands outside math delimiters.
- In arrays/tabulars/cases, end a row with \\ before any rule command. Never write \\ \hline or \\ \cline; use \\ \hline / \\ \cline instead.
- NO empty fractions (\frac{}{}) or incomplete commands.
- Use LaTeX only when mathematically necessary."#;

pub const WRITTEN_STYLE_RULES: &str = "
VCAA WRITTEN STYLE:
1. STRUCTURE: Match marks. 1-2 marks = single stem. 3+ marks = (a), (b) labels with [X marks].
2. SCAFFOLDING: For items ≥4 marks, earlier parts MUST produce results reused in later parts.
3. COGNITION: Demand must increase: recall -> method -> synthesis/justification.
4. ANTI-PATTERNS: No 'A particle moves...' openings. No decorative stimuli. No duplicate skills in one batch.";

/// Injected into MC question-generation prompts for distractor quality.
pub const MC_STYLE_RULES: &str = "
VCAA MC STYLE:
1. OPTIONS: 4 options (A-D), parallel style, standalone text. NO labels (A, B, C, D) inside the text field.
2. DISTRACTORS: Must target specific misconceptions. No 'all/none of the above'.
3. EXPLANATION: Justify correct option and name misconceptions for each wrong option. Keep measured and professional.";

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
            let note = subtopic.technique_notes.clone();

            if !note.trim().is_empty() {
                notes.insert(subtopic.name.trim().to_ascii_lowercase(), note);
            }
        }
    }
    notes
});

pub fn shared_subtopic_exam_technique_notes() -> &'static HashMap<String, String> {
    &SHARED_SUBTOPIC_EXAM_NOTES
}
