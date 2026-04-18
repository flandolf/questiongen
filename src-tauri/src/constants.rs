pub const OPENROUTER_CHAT_URL: &str = "https://openrouter.ai/api/v1/chat/completions";

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

pub const MERMAID_RULES: &str = r#"
DIAGRAMS (MERMAID):
- Use Mermaid diagrams for processes, flows, cycles, or complex charts where they enhance clarity.
- Format: ```mermaid\n<diagram content>\n```
- For bar or line charts, prefer 'xychart-beta' syntax where appropriate.
- Ensure all text inside diagrams is ASCII and concise."#;

pub const WRITTEN_STYLE_RULES: &str = "
VCAA WRITTEN STYLE:
1. STRUCTURE: Match marks. 1-2 marks = single stem. 3+ marks = (a), (b) labels with [X marks].
2. FORMATTING: Each part label must be on its own line, immediately followed by its mark count at the end. Required format:
   (a) Question text here. [X marks]
   (b) Next part here. [Y marks]
   No part label may share a line with the preceding text or another part label.
3. SCAFFOLDING: For items ≥4 marks, earlier parts MUST produce results reused in later parts.
4. COGNITION: Demand must increase: recall -> method -> synthesis/justification.
5. ANTI-PATTERNS: No 'A particle moves...' openings. No decorative stimuli. No duplicate skills in one batch.";

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
