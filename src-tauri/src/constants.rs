pub const DEFAULT_OPENROUTER_CHAT_URL: &str = "https://openrouter.ai/api/v1/chat/completions";

/// Base URL (no path) for OpenRouter. Used as the default base when callers
/// do not supply one explicitly. This MUST match `DEFAULT_OPENROUTER_CHAT_URL`
/// with `/chat/completions` stripped, otherwise provider inference silently regresses
/// `json_schema` structured-output handling for legacy flows.
pub const DEFAULT_OPENROUTER_BASE_URL: &str = "https://openrouter.ai/api/v1";

/// Default LLM model used across the application.
pub const DEFAULT_MODEL: &str = "openai/gpt-5.4-mini";

/// Build the chat completions URL from a base URL.
pub fn chat_completions_url(base_url: &str) -> String {
    let base = base_url.trim_end_matches('/');
    format!("{base}/chat/completions")
}

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

/// Minimum similarity score for automatic topic/subtopic mapping.
pub const AUTO_MAP_CONFIDENCE_THRESHOLD: f64 = 0.85;

// ─── Global style rules (truly constant, not curriculum-dependent) ────────────

pub const GLOBAL_HYGIENE_RULES: &str = "\
- JSON only. No preamble, fences, smart-quotes, or commentary. Standard ASCII punctuation.";

/// Injected into every system prompt. Compressed to bullets (R2).
pub const LATEX_RULES: &str = "\
- Inline $...$ or display $$...$$. Never use \\(...\\) or \\[...\\].\
- All math symbols / chemical species in LaTeX. Array rows end with \\\\ before \\hline.\
- No empty fractions or incomplete commands. Probability tables MUST use \\begin{array} ... \\end{array} with \\\\ as row terminator before \\hline.";

pub const MERMAID_RULES: &str = "\
- Use Mermaid (```mermaid\n...n```) for processes/flows/charts where it improves clarity.\
- Prefer xychart-beta for bar/line charts. ASCII text only inside diagrams.";

pub const WRITTEN_STYLE_RULES: &str = "\
- 1-2 marks = single stem. 3+ marks = (a)/(b) labels, each on its own line with [X marks].\
- 4+ marks: earlier parts MUST yield results reused by later parts (use 'Hence' or 'or otherwise').\
- Sequence: recall -> method -> synthesis/justification.\
- No 'A particle moves...' openings. No decorative stimuli. No duplicate skills.";

/// Injected into MC question-generation prompts for distractor quality.
pub const MC_STYLE_RULES: &str = "\
- 4 options (A-D), parallel form. No labels inside option text.\
- Distractors each target a specific misconception. No 'all/none of the above'.\
- ExplanationMarkdown covers correct answer and one reason per wrong distractor.";

// ─── Command-verb -> mark-budget (R7) ─────────────────────────────────────────
/// VCE command verbs with their typical mark allocations. Injected near the
/// requested `average_marks_per_question` line to constrain mark bloat.
#[allow(dead_code)]
pub const COMMAND_VERB_MARK_BUDGET: &str = "\
VERB -> MARKS GUIDE: state/define/list/identify = 1. calculate/find/determine/solve = 2-3. \
explain/describe/compare = 2-3. justify/discuss/suggest = 3-4. show that = 2-3 (full working required). \
derive/prove/evaluate/analyze/synthesize = 4-5. \
Match each command verb's mark cost against the requested average. Do NOT exceed.";

// ─── Quality-driven regeneration thresholds (R5) ──────────────────────────────
/// R5 retry: distinctness below this floor triggers a one-shot retry with
/// anti-examples (offender prompts + verb diversity hints).
pub const REGENERATION_DISTINCTNESS_THRESHOLD: f32 = 0.30;
/// R5 retry: command-verb diversity floor for the same retry trigger.
pub const REGENERATION_VERB_DIVERSITY_THRESHOLD: f32 = 0.40;
/// R5 retry: hard cap to prevent unbounded retry loops.
pub const REGENERATION_MAX_ATTEMPTS: u8 = 1;
/// R5 retry: minimum batch size (number of items) for the gate to fire —
/// distinctness is noisy on 1-2 items so the trigger needs at least 2.
pub const QUALITY_MIN_BATCH_FOR_REVIEW: u8 = 2;
/// R5 retry: per-item distinctness floor below which an item is treated as an
/// offender and re-seeded into `prior_question_prompts` for the retry.
pub const REGENERATION_OFFENDER_DISTINCTNESS_FLOOR: f32 = 0.40;
/// R5 retry: anti-verb majority fraction encoded as numerator/denominator so
/// the comparison stays in integer space and avoids f32 rounding artefacts.
/// A verb is treated as "dominating" when `count * NUM > total * DEN`, i.e.
/// strictly more than half the batch share it.
pub const REGENERATION_VERB_MAJORITY_NUMERATOR: u32 = 2;
pub const REGENERATION_VERB_MAJORITY_DENOMINATOR: u32 = 1;
// ─── Temperature defaults (R10) ───────────────────────────────────────────────
/// Default sampling temperature for written questions at standard difficulty.
pub const DEFAULT_TEMPERATURE_WRITTEN: f32 = 0.7;
/// Hard-difficulty written sampling temperature (slightly more variance).
pub const DEFAULT_TEMPERATURE_WRITTEN_HARD: f32 = 0.8;
/// Extreme-difficulty written sampling temperature (max variance for diversity).
pub const DEFAULT_TEMPERATURE_WRITTEN_EXTREME: f32 = 0.9;
/// MC sampling temperature (low variance to favour consistent correct answers).
pub const DEFAULT_TEMPERATURE_MC: f32 = 0.3;
