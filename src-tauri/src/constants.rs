pub const OPENROUTER_CHAT_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
pub const OPENROUTER_MAX_TOKENS: u16 = 1400;

pub const MATHEMATICAL_METHODS_TOPIC: &str = "Mathematical Methods";
pub const PHYSICAL_EDUCATION_TOPIC: &str = "Physical Education";
pub const CHEMISTRY_TOPIC: &str = "Chemistry";

pub const APP_STATE_FILE_NAME: &str = "app-state.json";

pub const MATHEMATICAL_METHODS_GUIDANCE: &str =
    " Mathematical Methods exam style: concise VCAA command verbs, realistic mark allocations, reward method choice over template recall.";

pub const PHYSICAL_EDUCATION_GUIDANCE: &str =
    " Physical Education: short applied sport/training scenarios rewarding data interpretation and evidence-based reasoning. No pure physics calculations for biomechanics.";

pub const CHEMISTRY_LATEX_GUIDANCE: &str =
    " Render every chemical formula/ionic species in LaTeX: $H_2O$, $CO_2$, $Fe^{3+}$, $SO_4^{2-}$.";

/// Injected into every system prompt.
pub const LATEX_RULES: &str = " LaTeX (mandatory): \
(1) Wrap every math expression in delimiters — single vars ($x$), numbers ($3$), exponents ($n$). \
(2) Inline: $...$. Display: $$...$$. \
(3) Never use \\(...\\) or \\[...\\]. \
(4) All subscripts, superscripts, fractions, radicals, Greek letters, vectors, operators must be inside delimiters. \
(5) Multi-line/matrix: $$\\begin{pmatrix}...\\end{pmatrix}$$. \
(6) Chemistry formulas: $\\text{H}_2\\text{O}$, $\\text{Fe}^{3+}$.";
