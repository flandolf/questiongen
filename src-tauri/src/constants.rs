use once_cell::sync::Lazy;
use serde::Deserialize;
use std::collections::HashMap;

pub const OPENROUTER_CHAT_URL: &str = "https://openrouter.ai/api/v1/chat/completions";

pub const MATHEMATICAL_METHODS_TOPIC: &str = "Mathematical Methods";
pub const PHYSICAL_EDUCATION_TOPIC: &str = "Physical Education";
pub const CHEMISTRY_TOPIC: &str = "Chemistry";

pub const APP_STATE_FILE_NAME: &str = "app-state.json";

#[derive(Debug, Deserialize)]
struct SharedSubtopicCatalog {
    topics: Vec<SharedTopicEntry>,
}

#[derive(Debug, Deserialize)]
struct SharedTopicEntry {
    #[serde(rename = "name")]
    _name: String,
    subtopics: Vec<SharedSubtopicEntry>,
}

#[derive(Debug, Deserialize)]
struct SharedSubtopicEntry {
    name: String,
    instruction: Option<String>,
}

static SHARED_SUBTOPIC_EXAM_NOTES: Lazy<HashMap<String, String>> = Lazy::new(|| {
    let raw = include_str!("../../src/shared/subtopic-catalog.json");
    let Ok(catalog) = serde_json::from_str::<SharedSubtopicCatalog>(raw) else {
        return HashMap::new();
    };

    let mut notes = HashMap::new();
    for topic in catalog.topics {
        for subtopic in topic.subtopics {
            if let Some(instruction) = subtopic.instruction {
                if !instruction.trim().is_empty() {
                    notes.insert(subtopic.name.trim().to_ascii_lowercase(), instruction);
                }
            }
        }
    }

    for (key, instruction) in subtopic_exam_technique_notes() {
        notes
            .entry(key.to_string())
            .or_insert_with(|| instruction.to_string());
    }

    notes
});

pub fn shared_subtopic_exam_technique_notes() -> &'static HashMap<String, String> {
    &SHARED_SUBTOPIC_EXAM_NOTES
}

/// Injected into every system prompt.
pub const LATEX_RULES: &str = " LaTeX (STRICT):
(1) Every mathematical expression MUST be wrapped in LaTeX delimiters. Use inline $...$ for in-sentence math and $$...$$ for display math.
(2) NEVER use \\(...\\) or \\[...\\].
(3) Keep plain English outside delimiters. Put symbols, equations, function notation, subscripts/superscripts, fractions, radicals, vectors and operators inside delimiters.
(4) For matrices or multi-line layouts, use display math blocks only (e.g. $$\\begin{pmatrix}...\\end{pmatrix}$$).
(5) Chemistry species must use LaTeX text mode, e.g. $\\text{H}_2\\text{O}$, $\\text{Fe}^{3+}$.
(6) Punctuation rule: punctuation belongs outside math delimiters unless mathematically required.";

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

// ─── Mathematical Methods ─────────────────────────────────────────────────────

pub const MATHEMATICAL_METHODS_GUIDANCE: &str = "\n\
Mathematical Methods exam style: VCAA command verbs (find, evaluate, show that, hence, sketch, \
determine), realistic mark allocations (1–4 marks per part), reward method choice over template recall.\n\
Questions must be grounded STRICTLY in the VCE Units 3 & 4 Mathematical Methods Study Design \
key knowledge listed below. Do NOT introduce content outside this list.\n\n\
AREA OF STUDY 1 — Functions, relations and graphs\n\
- Graphs of polynomial functions and their key features (intercepts, turning points, end behaviour)\n\
- Power functions $x^n$; exponential $a^x$, in particular $e^x$; logarithmic $\\log_e x$ and $\\log_a x$; \
circular $\\sin x$, $\\cos x$, $\\tan x$ and their key features\n\
- Transformations $y = Af(bx + c) + d$ (dilations, reflections, translations) and inverse transformations\n\
- Relation between graph of original function and graph of transformed function\n\
- Graphs of sum, difference, product and composite functions of the types above\n\
- Modelling with polynomial, power, circular, exponential and logarithmic functions; simple piecewise (hybrid) functions\n\n\
AREA OF STUDY 2 — Algebra, number and structure\n\
- Solutions of polynomial equations (degree $n$, up to $n$ real solutions; numerical methods where needed)\n\
- Inverse functions: conditions for existence, domain/range swap, solving equations using inverses \
(exponential, logarithmic, circular, power)\n\
- Composition of functions $(f \\circ g)(x) = f(g(x))$; domain and range of composite functions\n\
- Equations $f(x) = g(x)$ over a specified interval: graphical, numerical and algebraic methods\n\
- Literal equations and general solutions involving a single parameter\n\
- Systems of simultaneous linear equations: unique, no solution, infinite solutions (geometric interpretation \
for two equations in two unknowns)\n\n\
AREA OF STUDY 3 — Calculus\n\
- Deducing graphs of derivative and anti-derivative functions from the graph of a given function\n\
- Derivatives of $x^n$, $e^x$, $\\log_e x$, $\\sin x$, $\\cos x$, $\\tan x$\n\
- Product rule, chain rule, quotient rule for differentiation\n\
- Derivatives of transformed and combined functions (polynomial, exponential, circular, logarithmic, power)\n\
- Application of differentiation: graph sketching, stationary points, points of inflection, \
strictly increasing/decreasing intervals, local max/min, optimisation (including endpoint values)\n\
- Anti-derivatives of polynomial functions and functions of the form $f(ax + b)$ for $e^x$, $\\frac{1}{x}$, \
$\\sin x$, $\\cos x$, $x^n$; linear combinations of these\n\
- Definite integral as limiting sum; trapezium rule approximation\n\
- Fundamental theorem of calculus: $\\int_a^b f(x)\\,dx = F(b) - F(a)$\n\
- Properties of anti-derivatives and definite integrals\n\
- Applications of integration: area under a curve, area between curves, \
average value of a function, finding a function from a known rate of change with a boundary condition\n\n\
AREA OF STUDY 4 — Data analysis, probability and statistics\n\
- Random variables as real functions on a sample space; discrete vs continuous random variables\n\
- Discrete random variables: probability mass functions (graphs, tables, rules), \
mean $\\mu$, variance $\\sigma^2$, standard deviation $\\sigma$; Bernoulli trials; \
binomial distribution $\\text{Bi}(n, p)$; effect of parameters on PMF graph; \
conditional probability\n\
- Continuous random variables: probability density functions constructed from non-negative functions; \
mean, variance, standard deviation; standard normal $N(0,1)$ and transformed normal $N(\\mu, \\sigma^2)$; \
effect of parameters on PDF graph; calculation of probabilities over intervals; conditional probability\n\
- Statistical inference: sample proportion $\\hat{P} = X/n$ as a random variable; \
approximate normality of $\\hat{P}$ for large $n$ with mean $p$ and SD $\\sqrt{p(1-p)/n}$; \
approximate 95\\% confidence interval \
$\\left(\\hat{p} - z\\sqrt{\\frac{\\hat{p}(1-\\hat{p})}{n}},\\; \\hat{p} + z\\sqrt{\\frac{\\hat{p}(1-\\hat{p})}{n}}\\right)$ \
where $z \\approx 1.96$";

// ─── Physical Education ───────────────────────────────────────────────────────

pub const PHYSICAL_EDUCATION_GUIDANCE: &str = "\n\
VCAA PHYSICAL EDUCATION EXAM QUESTION GENERATION — COMPREHENSIVE INSTRUCTIONS\n\
═══════════════════════════════════════════════════════════════════════════════════\n\n\
WRITING STYLE FOR PHYSICAL EDUCATION:\n\
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\
• Do NOT use mathematical equations, derivations, or formula-heavy solutions.\n\
• Write all worked solutions and exemplar responses in prose — paragraphs and bullet points.\n\
• Simple named formulas are acceptable where the Study Design requires them \
(e.g. 'Fitt's principle', 'VO₂max', '1RM', 'F = ma') — mention by name and explain \
application in words. Do NOT rearrange, derive, or chain equations.\n\
• Focus on qualitative analysis, evaluation, and justification rather than calculation.\n\n\
PE EXAM QUESTION TYPES & COGNITIVE DEMANDS:\n\
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n\
SHORT-ANSWER QUESTIONS (1–2 marks) — RECALL/COMPREHENSION\n\
├─ Verbs: Define, identify, list, state, describe (basic), explain (simple)\n\
├─ Example: \"Define the term 'discrete motor skill'.\"\n\
└─ Expected response: 1–2 sentences with accurate definition\n\n\
EXTENDED-RESPONSE QUESTIONS (2–6 marks) — APPLICATION/ANALYSIS\n\
├─ Verbs: Explain (with evidence), apply, demonstrate, analyze, evaluate, justify\n\
├─ Example: \"Explain how the ATP-CP system is particularly suited to high-intensity, \
short-duration activities. Refer to its rate of ATP regeneration and the role of \
phosphocreatine in your response.\"\n\
└─ Expected response: 3–4 detailed sentences or structured paragraphs\n\n\
APPLICATION/SCENARIO QUESTIONS (3–8 marks) — SYNTHESIS/INTEGRATION\n\
├─ Verbs: Design, evaluate, critique, create, analyze (multi-component), justify (complex)\n\
├─ Example: \"A netball player is training to improve her vertical jump for shooting. \
Design a 4-week periodized training program that includes appropriate training methods \
and progression. Justify your choice of methods with reference to the physiological \
demands of jumping, energy systems used, and skill acquisition principles.\"\n\
└─ Expected response: Structured program with detailed scientific justification\n\n\
DATA INTERPRETATION QUESTIONS (2–5 marks) — OBSERVATION/INFERENCE/APPLICATION\n\
├─ Verbs: Interpret, analyze, identify (trends), explain (what data shows)\n\
├─ Example: \"The graph shows a swimmer's lactate levels during a 400 m freestyle race. \
(a) Identify the point(s) where the anaerobic threshold was exceeded. \
(b) Explain what this suggests about energy system contribution. \
(c) Recommend a training method to improve lactate tolerance.\"\n\
└─ Expected response: Observation → explanation → application progression\n\n\
COMPARISON QUESTIONS (2–6 marks) — DIFFERENTIATION/CONTRAST\n\
├─ Verbs: Compare (similarities AND differences), contrast, distinguish, evaluate (relative merit)\n\
├─ Example: \"Compare the relative contribution of the aerobic and anaerobic glycolysis \
systems during (a) a 100 m sprint and (b) a 1500 m run. In your answer, consider rate \
of ATP yield, duration, and total ATP production.\"\n\
└─ Expected response: Structured comparison with specific references to both similarities \
and differences\n\n\
AUTHENTICITY & CONTEXT REQUIREMENTS:\n\
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n\
VCAA questions must be grounded in REALISTIC sports and training contexts.\n\n\
COMMON AUSTRALIAN SPORTS:\n\
AFL, cricket, rugby league, rugby union, netball, basketball, tennis, swimming, \
athletics (track & field), cycling, badminton, gymnastics, soccer (football)\n\\n\
REALISTIC SCENARIOS:\n\
• Pre-season training and conditioning phases\n\
• Return-to-play after injury / rehabilitation\n\
• Peaking for competition (tapering strategies)\n\
• Performance plateau problems and solutions\n\
• Adapting training for different athlete levels (beginner, intermediate, elite)\n\
• Managing recovery and fatigue in multi-competition seasons\n\
• Technique refinement under fatigue\n\n\
ATHLETE PERSPECTIVES:\n\
• Scenarios should relate to experiences of VCE PE students (school athletes, club \
athletes, potential elite pathway athletes)\n\
• Acknowledge recreational participation, competitive club level, and elite development\n\
• Consider both individual sports (tennis, gymnastics, swimming) and team sports \
(netball, AFL, basketball, soccer)\n\n\
QUALITY CHECKS BEFORE FINALIZING ANY QUESTION:\n\
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n\
✓ Aligned with Unit 3 or 4 key knowledge/skills from Study Design?\n\
✓ Requires higher-order thinking (application, analysis, synthesis)?\n\
✓ Context is realistic and relevant to VCE PE students?\n\
✓ Mark allocation matches cognitive demand appropriately?\n\
✓ Question is unambiguous and free of jargon confusion?\n\
✓ A clear, defensible marking rubric exists?\n\
✓ Question integrates multiple concepts where appropriate?\n\
✓ All terms are defined or contextually clear?\n\
✓ Question avoids leading or telegraphing the expected answer?\n\
✓ Expected response length is reasonable for marks allocated?\n\
✓ Question reflects the style and rigor of actual VCAA examinations?\n";

// ─── Physical Education key knowledge (per-subtopic group) ─────────────────
// These are injected per selected subtopic via `subtopic_key_knowledge()` so the
// LLM only sees key knowledge for topics the user has actually selected.

pub const PE_SKILL_ACQUISITION_KK: &str = "Study Design key knowledge:\n\
- Classification of movement skills: fundamental movement skills (stability, locomotor, manipulative), \
sport-specific skills, open and closed skills, gross and fine skills, discrete/serial/continuous motor skills\n\
- Link between motor skill development, participation and performance: how skill level influences \
motivation, enjoyment and continued engagement\n\
- Sociocultural factors affecting skill development: family (transport, financial support, role models), \
peers (socialization vs sedentary behavior), community, gender, socioeconomic status, and cultural beliefs/traditions\n\
- Three stages of learning: cognitive (high errors, inconsistent, requires visual cues), \
associative (refining technique, internal feedback use), autonomous (automaticity, focus on tactics)\n\
- Theories of skill acquisition: linear vs non-linear; direct instruction (explicit, coach-led, \
predictable environments) and constraint-based approaches (implicit, learner-led, game sense, \
individual/environmental/task constraints)\n\
- Psychological skills: confidence (self-efficacy), motivation (intrinsic vs extrinsic), \
optimal arousal (regulation via PMR, breath control, or music), concentration; accompanying strategies \
such as imagery (vivid/controllable) and goal setting (SMARTER)\n\
- Practice scheduling: type (part/whole), distribution (massed/distributed), variability (blocked/random)\n\
- Feedback: intrinsic (visual, auditory, proprioception) vs augmented (knowledge of results \
vs knowledge of performance); timing (concurrent vs terminal) and frequency issues (dependency)";

pub const PE_BIOMECHANICS_KK: &str = "Study Design key knowledge:\n\
- Biomechanical principles: linear and angular concepts (force/torque, momentum, impulse, speed/velocity)\n\
- Newton's 3 laws of linear motion (inertia, acceleration, action-reaction)\n\
- Projectile motion (height, angle, speed of release)\n\
- Anatomical third-class levers (axis, force, resistance, mechanical advantage < 1 for speed/range of motion)\n\
- Equilibrium/stability (centre of gravity, base of support, line of gravity)\n\
- Force application: summation of forces (sequential vs simultaneous), conservation of momentum, \
impulse-momentum relationship\n\
- Qualitative movement analysis stages: preparation, observation, evaluation (diagnosis of errors), \
error correction (intervention)";

pub const PE_ENERGY_SYSTEMS_KK: &str = "Study Design key knowledge:\n\
- Oxygen uptake at rest and during exercise/recovery: oxygen deficit, steady state, EPOC\n\
- Acute physiological responses to exercise in the cardiovascular, respiratory and muscular systems\n\
- Three energy systems (ATP-CP, anaerobic glycolysis, aerobic): fuels (chemical and food); \
rate and yield of each system; contribution at rest and varying intensities; \
recovery rates with active vs passive recovery\n\
- Interplay of energy systems in relation to intensity and duration of activity\n\
- Muscular fatigue mechanisms: fuel depletion (PC, glycogen), accumulation of metabolic by-products \
(e.g. H⁺ ions), thermoregulatory fatigue; linked to sport and exercise intensities/durations\n\
- Nutritional and hydration strategies: carbohydrate ingestion, protein, water — \
to enhance performance, delay fatigue, improve recovery";

pub const PE_FOUNDATIONS_KK: &str = "Study Design key knowledge:\n\
- Activity analysis data: skill frequencies, movement patterns, heart rates, work-to-rest ratios \
used to identify physiological requirements\n\
- Fitness components required in physical activity/sport: aerobic power, anaerobic capacity, \
muscular strength, power and endurance, flexibility, balance, coordination, speed, agility\n\
- Fitness assessment: purpose (physiological and psychological perspectives); \
pre-participation health screening and informed consent; \
standardised fitness tests matched to physiological requirements; \
test reliability, validity and accuracy";

pub const PE_TRAINING_PRINCIPLES_KK: &str = "Study Design key knowledge:\n\
- Strategies to monitor training: training diaries, digital tools, wearable technologies\n\
- Components of a training session: warm up, conditioning phase, cool down\n\
- Training program principles: frequency, intensity, time/duration (FITT), type, \
progression, specificity, individuality, diminishing returns, variety, maintenance, \
tapering, overtraining, detraining\n\
- Training methods: continuous, interval (short/intermediate/long/HIIT), fartlek, \
circuit, weight/resistance, flexibility, plyometrics\n\
- Chronic adaptations to aerobic, anaerobic and resistance training in the cardiovascular, \
respiratory and muscular systems, producing improvements in VO₂ max, LIP, \
speed and force of muscular contraction, and lactate tolerance";

// ─── Chemistry ────────────────────────────────────────────────────────────────

pub const CHEMISTRY_LATEX_GUIDANCE: &str =
    " Render every chemical formula/ionic species in LaTeX: $\\text{H}_2\\text{O}$, \
$\\text{CO}_2$, $\\text{Fe}^{3+}$, $\\text{SO}_4^{2-}$. ";

// ─── Per-subtopic key knowledge ───────────────────────────────────────────────
//
// Keys should match the subtopic names the frontend sends exactly (case-insensitive
// matching is applied in lib.rs). Values are injected after the subtopic name in the
// prompt so the model knows what specific dot-points to draw from.

/// Keys are the exact subtopic strings from `types.ts` (lowercased for matching in `subtopics_note`).
/// Values are the Study Design key knowledge bullet-points for that subtopic.
/// `SUBTOPIC_INSTRUCTIONS` in `types.ts` remains in use alongside these — it carries exam technique
/// notes (out-of-scope exclusions, exact formula forms, worked patterns) that are complementary
/// to the Study Design content here.
pub fn subtopic_key_knowledge() -> HashMap<&'static str, &'static str> {
    let mut m = HashMap::new();

    // ── Mathematical Methods ──────────────────────────────────────────────────

    m.insert("functions and graphs",
        "Study Design key knowledge:\n\
        - Graphs of polynomials, power functions $x^n$; exponential $e^x$, $a^x$; \
logarithmic $\\log_e x$, $\\log_a x$; circular $\\sin x$, $\\cos x$, $\\tan x$ — and their key features\n\
        - Domain (maximal/implied/natural), co-domain, range, asymptotic behaviour, symmetry\n\
        - Sum, difference, product and composite functions (not reciprocal/quotient composites)\n\
        - Inverse functions: conditions for existence, domain/range relationship\n\
        - Modelling with polynomial, power, circular, exponential, logarithmic and piecewise (hybrid) functions");

    m.insert(
        "transformation of graphs",
        "Study Design key knowledge:\n\
        - Transformations $y = Af(b(x-h))+k$: dilations from axes, reflections, translations\n\
        - Relation between the graph of $f$ and the graph of a transformed function\n\
        - Families of transformed functions for a single transformation parameter\n\
        - Inverse transformation (reversing a given transformation)\n\
        - Tracking key points and features under a sequence of transformations",
    );

    m.insert("algebra and structure",
        "Study Design key knowledge:\n\
        - Solutions of polynomial equations of degree $n$ (up to $n$ real solutions; numerical methods where needed)\n\
        - Inverse functions: existence conditions, solving equations via inverses (exponential, log, circular, power)\n\
        - Composition $(f\\circ g)(x) = f(g(x))$: domain and range\n\
        - Solving $f(x)=g(x)$ over a specified interval by graphical, numerical and algebraic methods\n\
        - Literal equations and general solutions involving a single parameter\n\
        - Simultaneous linear equations: unique solution, no solution, infinite solutions \
(geometric interpretation for two equations in two unknowns)");

    m.insert("trigonometric functions",
        "Study Design key knowledge:\n\
        - $\\sin x$, $\\cos x$, $\\tan x$ and their transformations $y = a\\sin(b(x-h))+k$, $y = a\\cos(b(x-h))+k$\n\
        - Amplitude, period ($2\\pi/b$ for sin/cos, $\\pi/b$ for tan), range, asymptotes\n\
        - Exact values at standard angles; solving trigonometric equations over a given interval\n\
        - Graphs of circular functions including key features (intercepts, turning points, asymptotes)\n\
        - Application to modelling periodic phenomena");

    m.insert("exponential and logarithmic functions",
        "Study Design key knowledge:\n\
        - Exponential functions $e^x$, $a^x$; logarithmic functions $\\log_e x$, $\\log_a x$ and their graphs\n\
        - Logarithm laws: $\\log(ab)=\\log a+\\log b$, $\\log(a/b)=\\log a-\\log b$, $\\log(a^n)=n\\log a$\n\
        - Solving exponential and logarithmic equations using inverse operations and log laws\n\
        - Domain of $\\log_e(f(x))$ requires $f(x)>0$\n\
        - Transformations and key features of exponential and logarithmic graphs\n\
        - Modelling growth/decay and other practical contexts");

    m.insert("differentiation",
        "Study Design key knowledge:\n\
        - Derivatives of $x^n$, $e^x$, $\\log_e x$, $\\sin x$, $\\cos x$, $\\tan x$\n\
        - Product rule, chain rule, quotient rule\n\
        - Derivatives of transformed and combined functions (polynomial, exponential, circular, log, power)\n\
        - Deducing the graph of the derivative function from the graph of the original function\n\
        - Stationary points, points of inflection, strictly increasing/decreasing intervals\n\
        - Local max/min values; optimisation including endpoint analysis\n\
        - Tangent lines; average and instantaneous rates of change");

    m.insert("integration",
        "Study Design key knowledge:\n\
        - Anti-derivatives of polynomials and $f(ax+b)$ for $e^x$, $1/x$, $\\sin x$, $\\cos x$, $x^n$\n\
        - Definite integral as limiting sum; trapezium rule approximation \
(overestimate/underestimate linked to concavity)\n\
        - Fundamental theorem: $\\int_a^b f(x)\\,dx = F(b)-F(a)$\n\
        - Properties of anti-derivatives and definite integrals\n\
        - Area under a curve, area between curves (split at intersection points)\n\
        - Average value of a function: $\\frac{1}{b-a}\\int_a^b f(x)\\,dx$\n\
        - Finding a function from a known rate of change given a boundary condition");

    m.insert("probability and statistics",
        "Study Design key knowledge:\n\
        - Discrete random variables: PMF (graphs, tables, rules), mean $\\mu=E(X)$, \
variance $\\sigma^2$, standard deviation $\\sigma$\n\
        - Bernoulli trials; binomial distribution $\\text{Bi}(n,p)$; effect of parameters on PMF shape\n\
        - Conditional probability for discrete and continuous random variables\n\
        - Continuous random variables: constructing PDFs from non-negative functions; mean, variance, SD\n\
        - Normal distribution $N(\\mu,\\sigma^2)$; probabilities over intervals using symmetry\n\
        - Sample proportion $\\hat{P}=X/n$ as a random variable; approximate normality for large $n$ \
with mean $p$ and SD $\\sqrt{p(1-p)/n}$\n\
        - 95% confidence interval: $\\hat{p}\\pm 1.96\\sqrt{\\hat{p}(1-\\hat{p})/n}$; \
interpretation and solving for $n$");

    m.insert(
        "discrete random variables",
        "Study Design key knowledge:\n\
        - Probability mass function $p(x)=\\Pr(X=x)$; all probabilities sum to 1\n\
        - Mean: $E(X)=\\mu=\\sum x\\,p(x)$; Variance: $\\text{Var}(X)=E(X^2)-\\mu^2$\n\
        - Bernoulli trials; binomial distribution $X\\sim\\text{Bi}(n,p)$: \
$\\Pr(X=x)=\\binom{n}{x}p^x(1-p)^{n-x}$, $E(X)=np$, $\\text{Var}(X)=np(1-p)$\n\
        - Effect of variation in parameters on PMF graph shape\n\
        - Conditional probability for discrete random variables\n\
        - Calculation of probabilities for specific values and intervals",
    );

    m.insert(
        "continuous random variables",
        "Study Design key knowledge:\n\
        - PDF $f(x)\\geq 0$ with $\\int_{-\\infty}^{\\infty} f(x)\\,dx=1$; \
constructing PDFs from non-negative functions\n\
        - $\\Pr(a<X<b)=\\int_a^b f(x)\\,dx$\n\
        - Mean: $\\mu=\\int x\\,f(x)\\,dx$; Variance: $\\sigma^2=\\int x^2 f(x)\\,dx-\\mu^2$\n\
        - Standard normal $N(0,1)$ and transformed normal $N(\\mu,\\sigma^2)$\n\
        - Effect of variation in $\\mu$ and $\\sigma$ on PDF graph\n\
        - Conditional probability; finding $k$ such that $\\Pr(X>k)=c$",
    );

    // ── Physical Education ──────────────────────────────────────────────────

    // Unit 3 AoS 1 — Skill Acquisition (indices 0–8)
    for &sub in &[
        "Movement Skill Classification: Fundamental, Sport-Specific, Open/Closed, Gross/Fine",
        "Discrete, Serial, and Continuous Motor Skills: Temporal Characteristics",
        "Stages of Learning: Cognitive, Associative, and Autonomous Stages",
        "Skill Acquisition Theories: Linear vs. Non-Linear Learning Models",
        "Learning Approaches: Direct Instruction vs. Constraint-Based Methods",
        "Practice Scheduling: Type (Whole/Part), Distribution (Massed/Distributed), and Variability (Blocked/Random)",
        "Feedback in Skill Acquisition: Intrinsic, Augmented, and Timing Optimization",
        "Psychological Factors in Learning: Confidence, Motivation, Arousal, and Concentration",
        "Coaching Strategies: Tailoring Instruction to Learner Needs and Performance Requirements",
    ] {
        m.insert(sub, PE_SKILL_ACQUISITION_KK);
    }

    // Unit 3 AoS 1 — Biomechanics (indices 9–17)
    for &sub in &[
        "Linear Motion: Momentum, Displacement, Linear Velocity, Acceleration",
        "Angular Motion: Angular Momentum, Moment of Inertia, Angular Velocity",
        "Momentum and Impulse: Conservation and Application in Physical Activities",
        "Newton's Laws of Motion: Inertia, Acceleration, and Action-Reaction in Sport",
        "Projectile Motion: Release Angle, Height, Speed, and Optimal Performance Trajectories",
        "Center of Gravity, Base of Support, and Equilibrium: Balance and Stability Principles",
        "Third Class Lever Systems: Mechanical Advantage and Force Application",
        "Qualitative Movement Analysis: Systematic Observation, Evaluation, and Error Correction",
        "Video Analysis and Biomechanical Assessment: Tools for Movement Improvement",
    ] {
        m.insert(sub, PE_BIOMECHANICS_KK);
    }

    // Unit 3 AoS 2 — Energy Systems (indices 18–25)
    for &sub in &[
        "ATP-CP System: High-Intensity Energy Supply and Recovery Characteristics",
        "Anaerobic Glycolysis: Glucose Breakdown, Lactate Production, and Duration Capacity",
        "Aerobic System: Oxidative Phosphorylation and Sustained Energy Production",
        "Energy System Interplay: ATP-CP to Anaerobic to Aerobic Transition by Intensity and Duration",
        "Oxygen Uptake: Oxygen Deficit, Steady State, and EPOC Recovery",
        "VO2 Max and Lactate Inflection Point: Aerobic Capacity and Anaerobic Threshold",
        "Fatigue Mechanisms: Metabolic, Muscular, Thermoregulatory, and Central Fatigue",
        "Nutrition and Hydration Strategies: Fueling Performance and Enhancing Recovery",
    ] {
        m.insert(sub, PE_ENERGY_SYSTEMS_KK);
    }

    // Unit 4 AoS 1 — Foundations (indices 26–32)
    for &sub in &[
        "Activity Analysis: Identifying Skill Frequencies, Movement Patterns, and Physiological Demands",
        "Fitness Assessment: Testing Aerobic, Anaerobic, Strength, Endurance, Flexibility, Speed, and Agility",
        "Test Reliability, Validity, and Accuracy: Standardized Protocols and Error Minimization",
        "Pre-Participation Screening and Informed Consent",
    ] {
        m.insert(sub, PE_FOUNDATIONS_KK);
    }

    // Unit 4 AoS 2 — Training Principles and Methods (indices 33–38)
    for &sub in &[
        "Training Principles: Frequency, Intensity, Time/Duration, Type, and Progression",
        "Training Adaptation: Specificity, Individuality, Variety, and Diminishing Returns",
        "Periodization and Planning: Macrocycles, Mesocycles, Microcycles, Tapering, and Detraining",
        "Continuous and Interval Training: Steady-Intensity vs. High-Intensity Work-Rest Intervals",
        "Specialized Training Methods: Fartlek, Circuit, Weight/Resistance, Flexibility, and Plyometric Training",
        "Training Components: Warm-Up, Conditioning Phase, and Cool-Down Structure",
        "Overtraining Syndrome: Prevention, Recognition, and Management",
    ] {
        m.insert(sub, PE_TRAINING_PRINCIPLES_KK);
    }

    m
}

// ─── Per-subtopic exam technique notes ────────────────────────────────────────
//
// Merged from the former SUBTOPIC_INSTRUCTIONS in src/types.ts.
// These carry exam technique notes (notation conventions, common errors,
// worked-pattern guidance) that complement the Study Design key knowledge
// above.

/// Keys are lowercased subtopic names (matching `subtopic_key_knowledge`).
/// Values are exam technique / notation instructions injected into prompts.
pub fn subtopic_exam_technique_notes() -> HashMap<&'static str, &'static str> {
    let mut m = HashMap::new();

    // ── Mathematical Methods ──────────────────────────────────────────────────

    m.insert("functions and graphs",
        "NOTATION (mandatory):\n\
        - Write functions as f : domain → R, f(x) = ...\n\
        - Domain/range: interval notation [a, b] or set notation {x ∈ R : condition}\n\
        - Composite: (f ∘ g)(x) = f(g(x)) — state domain requires range(g) ⊆ domain(f)\n\
        EXAM STYLE:\n\
        - Vary: identify features from equation, sketch graphs, find domains/ranges, composite/inverse rules\n\
        - Multi-part: identification → manipulation → application\n\
        - NEVER omit domain specification");

    m.insert(
        "transformation of graphs",
        "NOTATION (mandatory):\n\
        - General form: y = a·f(b(x − h)) + k\n\
        - Describe each transformation as a numbered sequence in plain language\n\
        EXAM STYLE:\n\
        - Include non-trivial combined transformations (all four parameters a, b, h, k)\n\
        - Test: parameter identification from graphs, equation comparison, coordinate tracking\n\
        - Common errors to probe: x-axis vs y-axis dilation confusion, translation sign errors",
    );

    m.insert(
        "algebra and structure",
        "EXAM STYLE:\n\
        - Vary: composition/inverse → parametric simultaneous equations → substitution reduction\n\
        - Always specify domain for composite/inverse questions\n\
        - Algorithm tracing: define termination condition; track variable values in a table",
    );

    m.insert("trigonometric functions",
        "NOTATION (mandatory):\n\
        - Write as y = a·sin(b(x − h)) + k or y = a·cos(b(x − h)) + k\n\
        - Period: 2π/b (sin/cos), π/b (tan); Amplitude: |a|\n\
        EXAM STYLE:\n\
        - Solve equations: list ALL solutions using periodicity and CAST rule; express in terms of π\n\
        - Periodicity questions: find smallest positive period; determine largest valid interval");

    m.insert(
        "exponential and logarithmic functions",
        "NOTATION (mandatory):\n\
        - VCARD uses log_e; log_e and ln both acceptable\n\
        - For d/dx[a·log_e(bx)]: the b cancels → result is a/x\n\
        EXAM STYLE:\n\
        - Exam 1: exact answers using log/exponential laws only, no CAS\n\
        - Multi-step: set up → apply log laws → solve → verify domain (f(x) > 0)",
    );

    m.insert("differentiation",
        "NOTATION (mandatory):\n\
        - Gradient table format: columns = x values (either side + at point); rows = sign of f′(x) + arrows\n\
        - Tangent: y − f(a) = f′(a)(x − a); Normal: y − f(a) = −1/f′(a)(x − a)\n\
        EXAM STYLE:\n\
        - Multi-part chain: differentiate → stationary points → classify → global max/min on closed interval\n\
        - Exam 1: exact answers ONLY — no decimal approximations");

    m.insert("integration",
        "NOTATION (mandatory):\n\
        - Write ∫f(x) dx = F(x) + c (indefinite); ∫_a^b f(x) dx = [F(x)]_a^b = F(b) − F(a) (definite)\n\
        - Average value: (1/(b−a))∫_a^b f(x) dx\n\
        EXAM STYLE:\n\
        - Area between curves: identify which function is greater; split at intersection points\n\
        - Exam 1: exact answers — express in terms of log_e, π, etc.");

    m.insert(
        "probability and statistics",
        "NOTATION (mandatory):\n\
        - Pr(A|B) = Pr(A ∩ B) / Pr(B); Independence: Pr(A|B) = Pr(A)\n\
        - 95% CI: p̂ ± 1.96√(p̂(1−p̂)/n)\n\
        EXAM STYLE:\n\
        - Bayes questions: draw probability tree first; show all branch calculations\n\
        - Exam 1 normal dist: use symmetry and given values only, no CAS\n\
        - Confidence intervals: recover p̂ = (L+U)/2; solve for n = (2·1.96·SE/MOE)²",
    );

    m.insert(
        "discrete random variables",
        "NOTATION (mandatory):\n\
        - p(x) = Pr(X = x); E(X) = Σx·p(x); Var(X) = E(X²) − μ²\n\
        - Binomial: X ~ Bi(n, p), Pr(X=x) = C(n,x)pˣ(1−p)ⁿ⁻ˣ\n\
        EXAM STYLE:\n\
        - Exam 1: exact fractional answers required (e.g. a/4⁶ or a/2ᵇ)\n\
        - Use small n ≤ 8 for exact arithmetic feasibility",
    );

    m.insert(
        "continuous random variables",
        "NOTATION (mandatory):\n\
        - PDF: f(x) ≥ 0, ∫_{−∞}^{∞} f(x) dx = 1\n\
        - Pr(a < X < b) = ∫_a^b f(x) dx; for continuous: Pr(X = a) = 0\n\
        EXAM STYLE:\n\
        - Exam 1: hand-manageable integrands only (polynomials, sin/cos, simple exponentials)\n\
        - ALWAYS state the support of the pdf explicitly",
    );

    // ── Physical Education ────────────────────────────────────────────────────

    // UNIT 3: Skill Acquisition
    m.insert(
        "movement skill classification: fundamental, sport-specific, open/closed, gross/fine",
        "EXAM STYLE:\n\
        - Questions must require classification using MULTIPLE classification systems simultaneously\n\
        - Test application: give a sport-specific scenario and ask student to justify classifications\n\
        - Common errors to probe: confusing open/closed with predictable/unpredictable environments\n\
        - VCAA pattern: define → classify → justify with sport example → explain participation link",
    );

    m.insert(
        "discrete, serial, and continuous motor skills: temporal characteristics",
        "EXAM STYLE:\n\
        - Focus on temporal boundaries: clear beginning/end (discrete), arbitrary endpoints (continuous)\n\
        - Serial skills: sequence of discrete skills combined into a coordinated routine\n\
        - VCAA pattern: identify skill type → explain temporal characteristics → coaching implication\n\
        - Link to practice scheduling: discrete suits part practice; continuous suits whole practice",
    );

    m.insert(
        "stages of learning: cognitive, associative, and autonomous stages",
        "EXAM STYLE:\n\
        - Test characteristics of each stage: error rate, consistency, attentional focus, feedback dependency\n\
        - Scenario-based: describe a performer and ask student to identify stage with justification\n\
        - VCAA pattern: identify stage → justify with evidence → recommend appropriate coaching strategy\n\
        - Common errors: confusing associative with autonomous; not linking stage to feedback type",
    );

    m.insert(
        "skill acquisition theories: linear vs. non-linear learning models",
        "EXAM STYLE:\n\
        - Linear: stages of learning, direct instruction, predictable progression\n\
        - Non-linear: constraints-led approach, dynamical systems theory, individual variability\n\
        - VCAA pattern: compare theories → apply to scenario → justify which suits a given learner\n\
        - Must reference individual, task, and environmental constraints for non-linear approaches",
    );

    m.insert(
        "learning approaches: direct instruction vs. constraint-based methods",
        "EXAM STYLE:\n\
        - Direct instruction: explicit teaching, coach-led, suitable for cognitive stage, predictable environments\n\
        - Constraint-based: implicit learning, game sense, manipulation of constraints (task, individual, environment)\n\
        - VCAA pattern: define approaches → compare advantages/disadvantages → recommend for specific scenario\n\
        - Link to stages of learning: direct suits early stages; constraint-based suits associative/autonomous",
    );

    m.insert(
        "practice scheduling: type (whole/part), distribution (massed/distributed), and variability (blocked/random)",
        "EXAM STYLE:\n\
        - Whole vs part: linked to skill complexity and organization; continuous skills suit whole practice\n\
        - Massed vs distributed: fatigue considerations, motivation, skill complexity\n\
        - Blocked vs random: blocked for cognitive stage; random for associative/autonomous (contextual interference)\n\
        - VCAA pattern: analyze skill → recommend practice type → justify with learning stage and skill characteristics\n\
        - Must link to stages of learning and skill classification",
    );

    m.insert(
        "feedback in skill acquisition: intrinsic, augmented, and timing optimization",
        "EXAM STYLE:\n\
        - Intrinsic: proprioception, vision, hearing — internal sensory information\n\
        - Augmented: knowledge of results (outcome) vs knowledge of performance (technique)\n\
        - Timing: concurrent (during) vs terminal (after); frequency effects on dependency\n\
        - VCAA pattern: define feedback types → analyze scenario → recommend feedback strategy with justification\n\
        - Link to stages of learning: cognitive needs frequent KR; autonomous benefits from reduced frequency",
    );

    m.insert(
        "psychological factors in learning: confidence, motivation, arousal, and concentration",
        "EXAM STYLE:\n\
        - Confidence (self-efficacy): built through success experiences, vicarious experiences, verbal persuasion\n\
        - Motivation: intrinsic (internal satisfaction) vs extrinsic (external rewards); link to continued participation\n\
        - Optimal arousal: inverted-U hypothesis, individual sport vs team sport differences\n\
        - Concentration: attentional focus, cue utilization, coping with pressure\n\
        - VCAA pattern: identify psychological factor → explain impact on performance → recommend strategy (imagery, goal setting, PMR)\n\
        - Strategies must be specific: SMARTER goals, vivid/controllable imagery, breath control",
    );

    m.insert(
        "coaching strategies: tailoring instruction to learner needs and performance requirements",
        "EXAM STYLE:\n\
        - Must integrate: skill classification, stages of learning, practice scheduling, feedback\n\
        - VCAA pattern: analyze performer → identify learning stage → design coaching approach → justify all choices\n\
        - Consider: learner age, experience, motivation, physical capabilities, sport demands\n\
        - Common errors: recommending strategies without linking to learner characteristics or stage of learning",
    );

    // UNIT 3: Biomechanics
    m.insert(
        "linear motion: momentum, displacement, linear velocity, acceleration",
        "EXAM STYLE:\n\
        - Linear: distance, displacement, speed, velocity, acceleration in straight-line movement\n\
        - VCAA pattern: define concepts → apply to sport scenario → explain how manipulation improves performance\n\
        - Link to Newton's laws and summation of forces for comprehensive answers",
    );

    m.insert(
        "angular motion: angular momentum, moment of inertia, angular velocity",
        "EXAM STYLE:\n\
        - Angular: rotation around an axis; angular displacement, velocity, acceleration\n\
        - Moment of inertia: resistance to angular acceleration; depends on mass distribution\n\
        - VCAA pattern: define concepts → apply to sport scenario (e.g. diving, gymnastics) → explain how manipulation improves performance\n\
        - Link to conservation of angular momentum and performance outcomes",
    );

    m.insert(
        "momentum and impulse: conservation and application in physical activities",
        "EXAM STYLE:\n\
        - Momentum = mass × velocity; conservation in collisions and transfers\n\
        - Impulse = force × time; impulse-momentum relationship (change in momentum)\n\
        - VCAA pattern: define → apply formula conceptually → explain how increasing impulse improves performance\n\
        - Sport applications: landing technique (increase time to reduce force), jumping, striking\n\
        - Link to Newton's second law and injury prevention strategies",
    );

    m.insert(
        "newton's laws of motion: inertia, acceleration, and action-reaction in sport",
        "EXAM STYLE:\n\
        - First law (inertia): objects resist change in motion; application to starting/stopping\n\
        - Second law (acceleration): F = ma; force application and mass relationship\n\
        - Third law (action-reaction): equal and opposite forces; ground reaction forces\n\
        - VCAA pattern: state law → identify in sport movement → explain how athlete manipulates law for advantage\n\
        - Must use specific sport examples, not generic descriptions",
    );

    m.insert(
        "projectile motion: release angle, height, speed, and optimal performance trajectories",
        "EXAM STYLE:\n\
        - Three factors: release angle (45° optimal in vacuum), release height, release speed\n\
        - Release speed is most influential factor; angle adjusted based on height and distance goals\n\
        - VCAA pattern: identify factors → explain effect on trajectory → recommend optimal release conditions\n\
        - Sport applications: shot put, javelin, basketball shooting, soccer goal kicks\n\
        - Common errors: stating 45° is always optimal without considering release height and air resistance",
    );

    m.insert(
        "center of gravity, base of support, and equilibrium: balance and stability principles",
        "EXAM STYLE:\n\
        - Center of gravity: point where body weight is evenly distributed; moves with body position\n\
        - Base of support: area beneath and between contact points; wider = more stable\n\
        - Line of gravity: vertical line from COG; must fall within base of support for equilibrium\n\
        - VCAA pattern: define principles → analyze stance/position → recommend adjustments for stability/mobility trade-off\n\
        - Applications: defensive stances, starting blocks, gymnastics balance, tackling technique",
    );

    m.insert(
        "third class lever systems: mechanical advantage and force application",
        "EXAM STYLE:\n\
        - Third class lever: axis — force — resistance (F between A and R); mechanical advantage < 1\n\
        - Advantage: speed and range of motion at the expense of force\n\
        - VCAA pattern: identify lever components in movement → explain mechanical advantage → link to performance outcome\n\
        - Sport applications: bicep curl, kicking, throwing, swimming strokes\n\
        - Must distinguish from first and second class levers where relevant",
    );

    m.insert(
        "qualitative movement analysis: systematic observation, evaluation, and error correction",
        "EXAM STYLE:\n\
        - Four stages: preparation (know the skill), observation (systematic viewing), evaluation (identify errors), error correction (intervention)\n\
        - VCAA pattern: design QMA protocol → identify observation points → diagnose errors → recommend specific corrections\n\
        - Must use biomechanical principles to justify error identification and correction\n\
        - Applications: swimming stroke analysis, running technique, throwing mechanics\n\
        - Common errors: vague coaching cues; not linking error to biomechanical cause",
    );

    m.insert(
        "video analysis and biomechanical assessment: tools for movement improvement",
        "EXAM STYLE:\n\
        - Video analysis: frame-by-frame playback, angle measurement, comparison to model technique\n\
        - Other tools: force plates, motion capture, wearable sensors\n\
        - VCAA pattern: explain how technology aids analysis → identify advantages over naked-eye observation → limitations\n\
        - Link to QMA: technology enhances observation and evaluation stages\n\
        - Must address practical considerations: cost, accessibility, coach expertise",
    );

    // UNIT 3: Energy Systems
    m.insert(
        "atp-cp system: high-intensity energy supply and recovery characteristics",
        "EXAM STYLE:\n\
        - Fuel: phosphocreatine (PC); no oxygen required; no by-products\n\
        - Duration: 10-12 seconds maximum; fastest ATP regeneration rate\n\
        - Recovery: 50% in 30 seconds, 100% in 2-3 minutes (active recovery enhances)\n\
        - VCAA pattern: identify system → explain characteristics → apply to sport scenario → recommend work:rest ratio\n\
        - Applications: 100m sprint, shot put, weightlifting, repeated sprint efforts with adequate recovery",
    );

    m.insert(
        "anaerobic glycolysis: glucose breakdown, lactate production, and duration capacity",
        "EXAM STYLE:\n\
        - Fuel: glycogen/glucose; no oxygen required; by-product: H⁺ ions (not lactic acid)\n\
        - Duration: 30 seconds to 2-3 minutes; moderate ATP regeneration rate\n\
        - Lactate inflection point (LIP): intensity at which lactate production exceeds clearance\n\
        - VCAA pattern: explain process → identify sport intensity → discuss fatigue mechanism → recommend training adaptation\n\
        - Common errors: saying 'lactic acid' instead of H⁺ ions; confusing lactate with fatigue cause\n\
        - Link to energy system interplay and lactate tolerance training",
    );

    m.insert(
        "aerobic system: oxidative phosphorylation and sustained energy production",
        "EXAM STYLE:\n\
        - Fuels: carbohydrates (glycogen/glucose), fats (fatty acids), minimal protein\n\
        - Requires oxygen; occurs in mitochondria; slowest ATP rate but highest yield\n\
        - Duration: beyond 2-3 minutes; unlimited if intensity sustainable\n\
        - VCAA pattern: explain process → identify sport demands → discuss fuel utilization at different intensities\n\
        - Link to VO₂ max, LIP, chronic adaptations, and nutritional strategies",
    );

    m.insert(
        "energy system interplay: atp-cp to anaerobic to aerobic transition by intensity and duration",
        "EXAM STYLE:\n\
        - All three systems contribute at ALL times; relative contribution shifts with intensity and duration\n\
        - ATP-CP dominates first 10 seconds; anaerobic glycolysis peaks at 30s-2min; aerobic dominates beyond 2-3min\n\
        - VCAA pattern: analyze sport/activity → describe interplay at different phases → justify with intensity/duration\n\
        - Applications: team sports (repeated sprints), middle-distance events, racket sports\n\
        - Must reference specific timeframes and relative contributions, not absolute switches",
    );

    m.insert(
        "oxygen uptake: oxygen deficit, steady state, and epoc recovery",
        "EXAM STYLE:\n\
        - Oxygen deficit: lag in oxygen uptake at exercise onset; anaerobic systems compensate\n\
        - Steady state: oxygen supply meets demand; sustained aerobic ATP production\n\
        - EPOC (excess post-exercise oxygen consumption): elevated oxygen post-exercise for PC replenishment, lactate removal, temperature regulation\n\
        - VCAA pattern: define concepts → explain physiological processes → link to training/recovery strategies\n\
        - Fast component of EPOC: PC replenishment (2-3 min); slow component: lactate removal, temperature (up to 24 hours)",
    );

    m.insert(
        "vo2 max and lactate inflection point: aerobic capacity and anaerobic threshold",
        "EXAM STYLE:\n\
        - VO₂ max: maximum rate of oxygen uptake; influenced by genetics, training, age, sex\n\
        - LIP: highest intensity at which lactate production equals lactate clearance; better performance predictor than VO₂ max\n\
        - VCAA pattern: define → explain relationship to performance → discuss training adaptations that improve each\n\
        - Training: aerobic training improves both; LIP can increase as % of VO₂ max with specific training\n\
        - Must distinguish between absolute and relative VO₂ max where relevant",
    );

    m.insert(
        "fatigue mechanisms: metabolic, muscular, thermoregulatory, and central fatigue",
        "EXAM STYLE:\n\
        - Metabolic: PC depletion, glycogen depletion, H⁺ ion accumulation (decreased pH)\n\
        - Muscular: impaired calcium release, reduced cross-bridge cycling, microtrauma\n\
        - Thermoregulatory: elevated core temperature, dehydration, cardiovascular drift\n\
        - Central: reduced neural drive, neurotransmitter changes, protective mechanism\n\
        - VCAA pattern: identify fatigue type → explain mechanism → link to sport intensity/duration → recommend prevention strategy\n\
        - Must specify which energy system is dominant and corresponding fatigue mechanism",
    );

    m.insert(
        "nutrition and hydration strategies: fueling performance and enhancing recovery",
        "EXAM STYLE:\n\
        - Carbohydrate: pre-exercise glycogen loading, during-exercise supplementation (gels, drinks), post-exercise replenishment\n\
        - Protein: muscle repair and adaptation; timing important (within 30 min post-exercise)\n\
        - Hydration: pre, during, post; electrolyte replacement for endurance events\n\
        - VCAA pattern: analyze sport demands → recommend nutrition/hydration strategy → justify with physiological rationale\n\
        - Must link to energy system demands and fatigue mechanisms\n\
        - Consider practical constraints: event duration, accessibility, individual tolerance",
    );

    // UNIT 4: Foundations of Training
    m.insert(
        "activity analysis: identifying skill frequencies, movement patterns, and physiological demands",
        "EXAM STYLE:\n\
        - Components: skill frequencies (what skills are performed most), movement patterns (how body moves), heart rates, work:rest ratios\n\
        - Purpose: identify physiological demands to inform training program design\n\
        - VCAA pattern: conduct activity analysis for position/sport → identify fitness components → justify with specific examples\n\
        - Must use data collection methods: GPS, heart rate monitors, video analysis, notational analysis\n\
        - Applications: team sport positions, individual sports, specific game scenarios",
    );

    m.insert(
        "fitness assessment: testing aerobic, anaerobic, strength, endurance, flexibility, speed, and agility",
        "EXAM STYLE:\n\
        - Aerobic: beep test, 12-minute run, VO₂ max lab test\n\
        - Anaerobic: 300m sprint, repeated sprint ability tests\n\
        - Strength: 1RM tests, handgrip dynamometer\n\
        - Endurance: push-up test, plank hold, Yo-Yo intermittent recovery\n\
        - Flexibility: sit-and-reach, shoulder flexibility\n\
        - Speed: 10m, 20m, 40m sprints\n\
        - Agility: Illinois agility test, T-test, sport-specific agility tests\n\
        - VCAA pattern: recommend test → justify with reference to physiological demands → discuss reliability/validity\n\
        - Must match test to sport-specific demands identified in activity analysis",
    );

    m.insert(
        "test reliability, validity, and accuracy: standardized protocols and error minimization",
        "EXAM STYLE:\n\
        - Reliability: consistency of results (same conditions, same performer)\n\
        - Validity: test measures what it claims to measure\n\
        - Accuracy: how close result is to true value\n\
        - VCAA pattern: evaluate test selection → identify reliability/validity issues → recommend improvements\n\
        - Standardization: consistent conditions, calibrated equipment, practiced administrators, clear protocols\n\
        - Common errors: using non-sport-specific tests; not controlling environmental factors",
    );

    m.insert(
        "pre-participation screening and informed consent",
        "EXAM STYLE:\n\
        - Screening tools: PAR-Q+, adult pre-exercise screening tool, health history questionnaires\n\
        - Purpose: identify risk factors, contraindications, need for medical clearance\n\
        - Informed consent: disclosure of risks, benefits, procedures; voluntary participation; right to withdraw\n\
        - VCAA pattern: explain screening process → identify ethical/safety considerations → justify importance\n\
        - Must address: legal requirements, duty of care, confidentiality, ongoing monitoring",
    );

    // UNIT 4: Training Principles and Methods
    m.insert(
        "training principles: frequency, intensity, time/duration, type, and progression",
        "EXAM STYLE:\n\
        - FITT framework: Frequency (sessions/week), Intensity (%HRmax, RPE, load), Time (duration), Type (mode)\n\
        - Progression: gradual increase in training load to avoid overtraining and injury\n\
        - VCAA pattern: analyze current program → apply FITT principles → design progression plan → justify changes\n\
        - Must link to training goals and current fitness level\n\
        - Common errors: progressing too quickly; not specifying intensity measures; generic prescriptions",
    );

    m.insert(
        "training adaptation: specificity, individuality, variety, and diminishing returns",
        "EXAM STYLE:\n\
        - Specificity: training must match physiological demands and movement patterns of sport\n\
        - Individuality: responses vary based on genetics, training history, age, sex\n\
        - Variety: prevents boredom, plateaus, overuse injuries; maintains motivation\n\
        - Diminishing returns: smaller adaptations as fitness level increases; elite athletes need more specific stimulus\n\
        - VCAA pattern: apply principles to scenario → explain why principle matters → predict outcome if principle violated\n\
        - Must use specific examples, not just definitions",
    );

    m.insert(
        "periodization and planning: macrocycles, mesocycles, microcycles, tapering, and detraining",
        "EXAM STYLE:\n\
        - Macrocycle: annual/seasonal plan; mesocycle: 2-6 week block; microcycle: weekly plan\n\
        - Periods: preparation (general → specific), competition, transition (active rest)\n\
        - Tapering: reduced volume, maintained intensity before competition; 7-21 days\n\
        - Detraining: loss of adaptations when training stops/reduces; cardiovascular losses first\n\
        - VCAA pattern: design periodized program → explain phase purposes → justify tapering strategy → address detraining risk\n\
        - Must show progression through phases with specific training methods for each",
    );

    m.insert(
        "continuous and interval training: steady-intensity vs. high-intensity work-rest intervals",
        "EXAM STYLE:\n\
        - Continuous: steady-state, aerobic development; types: long slow distance, tempo, fartlek\n\
        - Interval: work:rest ratios manipulate energy system emphasis\n\
        - Short interval (<10s work): ATP-CP; Intermediate (10s-2min): anaerobic glycolysis; Long (>2min): aerobic\n\
        - VCAA pattern: recommend training method → justify with energy system analysis → specify work:rest ratio and intensity\n\
        - Must link to activity analysis and sport-specific demands\n\
        - Common errors: not specifying intensity; inappropriate work:rest ratios for target system",
    );

    m.insert(
        "specialized training methods: fartlek, circuit, weight/resistance, flexibility, and plyometric training",
        "EXAM STYLE:\n\
        - Fartlek: varied pace/duration; develops aerobic and anaerobic capacity; mentally engaging\n\
        - Circuit: stations targeting different components; efficient; can be sport-specific\n\
        - Resistance: strength, power, endurance; sets, reps, load, rest manipulation\n\
        - Flexibility: static, dynamic, PNF; injury prevention, range of motion\n\
        - Plyometric: stretch-shortening cycle; power development; requires base strength\n\
        - VCAA pattern: select method → explain physiological rationale → design session → link to sport demands\n\
        - Must address safety considerations and prerequisites (especially for plyometrics)",
    );

    m.insert(
        "training components: warm-up, conditioning phase, and cool-down structure",
        "EXAM STYLE:\n\
        - Warm-up: pulse raiser, dynamic stretching, skill rehearsal, mental preparation (RAMP protocol)\n\
        - Conditioning: main training stimulus aligned with goals\n\
        - Cool-down: low-intensity exercise, static stretching, recovery initiation\n\
        - VCAA pattern: design complete session → justify each component → explain physiological purpose\n\
        - Must link warm-up to injury prevention and performance enhancement\n\
        - Common errors: static stretching in warm-up; omitting skill rehearsal; inadequate cool-down justification",
    );

    m.insert(
        "overtraining syndrome: prevention, recognition, and management",
        "EXAM STYLE:\n\
        - Symptoms: performance decline, persistent fatigue, mood changes, sleep disturbance, increased illness, elevated resting HR\n\
        - Causes: excessive training load, inadequate recovery, poor nutrition, psychological stress\n\
        - Prevention: periodization, monitoring, recovery strategies, communication\n\
        - Management: rest, gradual return, address underlying causes, professional support\n\
        - VCAA pattern: identify symptoms → analyze causes → recommend prevention/management strategy\n\
        - Must distinguish from normal training fatigue and acute overreaching",
    );

    // UNIT 4: Adaptations and Monitoring
    m.insert(
        "cardiovascular adaptations: increased stroke volume, cardiac output, and vo2 max",
        "EXAM STYLE:\n\
        - Stroke volume: increased at rest and submaximal; cardiac hypertrophy (larger, stronger heart)\n\
        - Cardiac output: unchanged at submaximal; increased at maximal (due to SV increase)\n\
        - VO₂ max: improved oxygen delivery and extraction; 15-30% improvement possible\n\
        - Blood: increased plasma volume, red blood cells, hemoglobin\n\
        - VCAA pattern: explain adaptation → link to performance outcome → identify training method that produces adaptation\n\
        - Must distinguish between rest, submaximal, and maximal exercise responses",
    );

    m.insert(
        "respiratory adaptations: enhanced oxygen extraction and capillarization",
        "EXAM STYLE:\n\
        - Respiratory muscles: increased strength and endurance; delayed respiratory muscle fatigue\n\
        - Alveoli: increased surface area for gas exchange (minor adaptation)\n\
        - Capillarization: increased capillaries around alveoli and in muscle tissue\n\
        - Oxygen extraction: increased a-V O₂ difference due to muscular adaptations\n\
        - VCAA pattern: explain adaptation → link to performance → compare cardiovascular vs respiratory contributions\n\
        - Note: respiratory adaptations are less significant than cardiovascular; must acknowledge this",
    );

    m.insert(
        "muscular adaptations: strength gains, hypertrophy, power development, and fiber type changes",
        "EXAM STYLE:\n\
        - Strength: increased motor unit recruitment, improved synchronization, neural adaptations (early)\n\
        - Hypertrophy: increased muscle fiber size (not number); type II fibers show greatest hypertrophy\n\
        - Power: improved rate of force development, stretch-shortening cycle efficiency\n\
        - Fiber type: no conversion between type I and II; sub-type shifts possible (IIx → IIa)\n\
        - Other: increased mitochondria, glycogen stores, myoglobin, enzyme activity\n\
        - VCAA pattern: explain adaptation → link to training method → predict performance outcome\n\
        - Must distinguish between neural and structural adaptations and their timelines",
    );

    m.insert(
        "aerobic vs. anaerobic training adaptations: differential system responses",
        "EXAM STYLE:\n\
        - Aerobic training: cardiovascular, respiratory, mitochondrial, capillary, oxidative enzyme adaptations\n\
        - Anaerobic training: ATP-CP stores, glycolytic enzyme activity, lactate tolerance, buffering capacity\n\
        - VCAA pattern: compare adaptations → explain why each suits different sport demands → recommend training approach\n\
        - Must reference specific physiological markers: VO₂ max, LIP, PC stores, lactate threshold\n\
        - Applications: endurance athletes vs sprint/power athletes; team sport players need both",
    );

    m.insert(
        "lactate threshold and metabolic efficiency: improved lactate tolerance and fat oxidation",
        "EXAM STYLE:\n\
        - LIP: intensity at which lactate production = clearance; trained athletes sustain higher % of VO₂ max\n\
        - Lactate tolerance: ability to buffer and clear H⁺ ions; trained through high-intensity intervals\n\
        - Fat oxidation: increased ability to use fat as fuel at higher intensities; glycogen sparing\n\
        - VCAA pattern: explain concept → describe training method → predict performance improvement\n\
        - Must distinguish between lactate threshold, LIP, and lactate tolerance\n\
        - Applications: endurance performance, repeated sprint ability, 'hitting the wall' prevention",
    );

    m.insert(
        "training monitoring: physiological, psychological, and sociological data collection",
        "EXAM STYLE:\n\
        - Physiological: HR, HRV, resting HR, body composition, blood markers, fitness test results\n\
        - Psychological: mood states, motivation, perceived recovery, sleep quality, stress levels\n\
        - Sociological: team cohesion, social support, life stress, training environment\n\
        - VCAA pattern: design monitoring protocol → justify data types → explain how data informs program modification\n\
        - Must address frequency of monitoring and who interprets data\n\
        - Common errors: collecting data without clear purpose; not linking to program adjustments",
    );

    m.insert(
        "training diaries, digital tools, and wearable technology: tracking progress and adjustments",
        "EXAM STYLE:\n\
        - Training diaries: subjective data, RPE, mood, sleep, nutrition, session notes\n\
        - Digital tools: apps, GPS trackers, HR monitors, power meters, sleep trackers\n\
        - Wearables: smartwatches, HR straps, accelerometers, continuous glucose monitors\n\
        - VCAA pattern: evaluate monitoring tool → identify advantages and limitations → recommend for specific context\n\
        - Must address: data accuracy, cost, accessibility, coach/athlete usability, data overload risk\n\
        - Link to training monitoring and program evaluation principles",
    );

    m.insert(
        "program evaluation and modification: effectiveness assessment and data-driven adjustments",
        "EXAM STYLE:\n\
        - Evaluation: compare results to goals, analyze trends, identify plateaus or regressions\n\
        - Modification: adjust FITT principles, change training methods, address recovery, modify periodization\n\
        - VCAA pattern: analyze data → evaluate program effectiveness → recommend specific modifications → justify\n\
        - Must use evidence-based reasoning, not guesswork\n\
        - Consider: athlete feedback, injury status, competition schedule, life circumstances",
    );

    // UNIT 4: Integration and Application
    m.insert(
        "skill acquisition and training integration: combining practice scheduling with training methods",
        "EXAM STYLE:\n\
        - Integration: combine physical conditioning with skill practice; avoid training in isolation\n\
        - Examples: skill execution under fatigue, decision-making drills at high intensity, random practice in conditioning\n\
        - VCAA pattern: design integrated session → explain how skill and physical components interact → justify structure\n\
        - Must reference: stages of learning, practice scheduling, energy system demands\n\
        - Applications: team sports (small-sided games), individual sports (race-pace technique work)",
    );

    m.insert(
        "biomechanical optimization within training: movement efficiency and technique refinement",
        "EXAM STYLE:\n\
        - Technique refinement under fatigue: maintaining biomechanical efficiency as intensity increases\n\
        - QMA integration: systematic observation, error identification, correction during training\n\
        - VCAA pattern: analyze movement → identify biomechanical inefficiencies → design intervention → predict outcome\n\
        - Must reference: levers, force application, stability, projectile motion principles\n\
        - Applications: running economy, swimming stroke efficiency, throwing mechanics",
    );

    m.insert(
        "energy system alignment: matching training methods to physiological activity demands",
        "EXAM STYLE:\n\
        - Principle: training must target the energy systems used in the sport/activity\n\
        - Activity analysis → energy system identification → training method selection → work:rest specification\n\
        - VCAA pattern: analyze sport → identify energy system contributions → design aligned training → justify all choices\n\
        - Must use specific work:rest ratios and intensities for each energy system\n\
        - Common errors: aerobic training for anaerobic sports; inappropriate work:rest ratios",
    );

    m.insert(
        "sport-specific performance analysis: integrated assessment of skill, fitness, and technique",
        "EXAM STYLE:\n\
        - Holistic analysis: combine activity analysis, fitness testing, biomechanical assessment, skill evaluation\n\
        - VCAA pattern: conduct comprehensive analysis → identify strengths and weaknesses → prioritize areas for development\n\
        - Must integrate data from multiple sources and explain interactions\n\
        - Applications: athlete profiling, talent identification, return-to-play assessment",
    );

    m.insert(
        "holistic athlete development: physical, psychological, and social integration",
        "EXAM STYLE:\n\
        - Physical: fitness, skill, technique, injury prevention\n\
        - Psychological: confidence, motivation, arousal regulation, concentration, goal setting\n\
        - Social: team dynamics, coach-athlete relationship, family support, community\n\
        - VCAA pattern: analyze athlete situation → identify factors across domains → recommend integrated development plan\n\
        - Must explain how domains interact (e.g., poor fitness affects confidence; social support affects motivation)\n\
        - Applications: youth athlete development, return from injury, performance slumps",
    );

    m.insert(
        "recovery strategies: sleep, nutrition, active recovery, and regeneration techniques",
        "EXAM STYLE:\n\
        - Sleep: 8-10 hours for athletes; growth hormone release, cognitive recovery\n\
        - Nutrition: carbohydrate replenishment, protein for repair, hydration, timing\n\
        - Active recovery: low-intensity exercise; enhances lactate removal, blood flow\n\
        - Other: compression garments, cold water immersion, massage, stretching\n\
        - VCAA pattern: recommend recovery strategy → explain physiological mechanism → justify for specific context\n\
        - Must distinguish between evidence-based and anecdotal strategies\n\
        - Consider: timing, accessibility, cost, athlete preference, sport demands",
    );

    m.insert(
        "fatigue management: balancing training stimulus with recovery",
        "EXAM STYLE:\n\
        - Monitoring: RPE, wellness questionnaires, HRV, performance tests, mood state\n\
        - Management: periodization, recovery integration, load adjustment, communication\n\
        - VCAA pattern: analyze fatigue indicators → recommend management strategy → justify with physiological rationale\n\
        - Must distinguish between acute fatigue (normal) and chronic fatigue (overtraining risk)\n\
        - Applications: in-season training, multi-event competitions, return-to-play protocols",
    );

    m.insert(
        "interdisciplinary performance optimization: connecting biomechanics, physiology, and psychology",
        "EXAM STYLE:\n\
        - Integration: how biomechanical efficiency affects energy cost; how psychological state affects technique\n\
        - VCAA pattern: analyze performance holistically → identify interacting factors → design comprehensive intervention\n\
        - Must explain how improvements in one domain affect others\n\
        - Applications: performance plateau, technique breakdown under pressure, injury rehabilitation\n\
        - Common errors: treating domains in isolation; not explaining interactions",
    );

    m
}
