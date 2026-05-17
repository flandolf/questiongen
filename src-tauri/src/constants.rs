pub const DEFAULT_OPENROUTER_CHAT_URL: &str = "https://openrouter.ai/api/v1/chat/completions";

/// Build the chat completions URL from a base URL.
pub fn chat_completions_url(base_url: &str) -> String {
    let base = base_url.trim_end_matches('/');
    format!("{base}/chat/completions")
}

// ─── Topic name constants (used in marking logic) ─────────────────────────────
pub const PHYSICAL_EDUCATION_TOPIC: &str = "Physical Education";
pub const CHEMISTRY_TOPIC: &str = "Chemistry";

// ─── Generation limits ────────────────────────────────────────────────────────

pub const MAX_QUESTION_COUNT: usize = 20;
pub const MAX_MARKS_PER_QUESTION: u8 = 30;
pub const MIN_MARKS_PER_QUESTION: u8 = 1;

// ─── MC validation constants ──────────────────────────────────────────────────

pub const MC_MAX_EXPLANATION_WORDS: usize = 300;

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
    "integration by parts",
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

pub const GLOBAL_HYGIENE_RULES: &str = "\
HYGIENE: Valid JSON only. No preamble, commentary, markdown fences, unicode, smart-quotes, or fancy characters. Standard punctuation.";

/// Injected into every system prompt.
pub const LATEX_RULES: &str = r#"
LATEX: Use inline $...$ or display $$...$$. No \(...\) or \[...\]. All math symbols/chemical species in LaTeX. Array rows end with \\ before \hline. No empty fractions or incomplete commands."#;

pub const MERMAID_RULES: &str = r#"
DIAGRAMS: Use Mermaid (```mermaid\n<diagram>\n```) for processes/flows/charts where they improve clarity. Prefer xychart-beta for bar/line charts. ASCII text only in diagrams."#;

pub const WRITTEN_STYLE_RULES: &str = "\
VCAA WRITTEN STYLE:
1. STRUCTURE: 1-2 marks = single stem. 3+ marks = (a), (b) labels with [X marks].
2. FORMAT: Each part label on its own line: (a) Question text. [X marks]  (b) Next part. [Y marks]
3. SCAFFOLDING: ≥4 marks: earlier parts produce results reused later.
4. COGNITION: Escalate recall → method → synthesis/justification.
5. ANTI: No 'A particle moves...' openings. No decorative stimuli. No duplicate skills.";

/// Injected into MC question-generation prompts for distractor quality.
pub const MC_STYLE_RULES: &str = "\
VCAA MC STYLE: 4 options (A-D), parallel style. NO labels inside text. Distractors target specific misconceptions. No 'all/none of the above'. Explain correct and each wrong option with misconception rationale.";

/// Chemistry-specific LaTeX guidance.
pub const CHEMISTRY_LATEX_GUIDANCE: &str =
    " Render every chemical formula/ionic species in LaTeX: $\\text{H}_2\\text{O}$, \
$\\text{CO}_2$, $\\text{Fe}^{3+}$, $\\text{SO}_4^{2-}$. ";
