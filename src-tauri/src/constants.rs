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
pub const LATEX_RULES: &str = " LaTeX: Use inline $...$ or display $$...$$. NO \\(...\\) or \\[...\\]. Put all math symbols, notation, and Chemistry species ($\\text{H}_2\\text{O}$) inside delimiters. Use LaTeX only when mathematically necessary; do NOT inject decorative/random commands. Every command must be valid and complete (for example, never output empty fractions like \\frac{}{}). Do not place LaTeX commands outside math delimiters. ASCII ONLY: Use LaTeX for all Greek letters and symbols. No unicode/smart-quotes. No fancy characters like ™, ®, ℓ, Ω. Use plain ASCII text, math mode, or standard LaTeX.";

pub const QUESTION_STYLE_RULES: &str = "
VCAA STYLE RULES:
1. STRUCTURE: Match marks/demand. 1-2 marks = single stem. 3+ marks = (a), (b) labels with [X marks].
2. SCAFFOLDING: Earlier parts must produce results reused in later parts for items ≥4 marks. Cognitive demand must increase: recall -> method -> synthesis.
3. MARKING: 1 mark = recall/direct sub. 2 marks = method + execution. 3+ marks = multi-step/justification.
4. DIFFICULTY: Easy (direct), Medium (method choice), Hard (non-routine/no signposting).
5. ANTI-PATTERNS: No 'A particle moves...' openings. No decorative stimuli. No two questions testing same skill in one batch.
6. HYGIENE: Valid JSON only. No fences/commentary. ASCII text only—no unicode, smart-quotes, or fancy punctuation. Avoid excessive exclamation marks (!). Use proper punctuation sparingly and professionally.";

/// Injected into MC question-generation prompts for distractor quality.
pub const MC_DISTRACTOR_RULES: &str = "
MC RULES:
1. OPTIONS: 4 options (A-D), parallel style, standalone text (no fragments). NO labels in promptMarkdown.
2. DISTRACTORS: Must target specific misconceptions. No 'all/none of the above'.
3. EXPLANATION: Justify correct option and name misconceptions for each wrong option. Keep explanation professional and measured.
4. HYGIENE: Valid JSON only. No fences/commentary. ASCII text only—no unicode or fancy characters. Avoid excessive exclamation marks (!). Punctuation must be standard and professional.";

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
            // Favor technique_notes as they usually contain more specific exam-style guidance.
            // Only use instruction if technique_notes is missing.
            let note = if !subtopic.technique_notes.trim().is_empty() {
                subtopic.technique_notes.clone()
            } else if let Some(ref instr) = subtopic.instruction {
                instr.clone()
            } else {
                String::new()
            };

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
