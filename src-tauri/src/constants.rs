use std::collections::HashMap;

pub const OPENROUTER_CHAT_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
pub const OPENROUTER_MAX_TOKENS: u16 = 5000;

pub const MATHEMATICAL_METHODS_TOPIC: &str = "Mathematical Methods";
pub const PHYSICAL_EDUCATION_TOPIC: &str = "Physical Education";
pub const CHEMISTRY_TOPIC: &str = "Chemistry";

pub const APP_STATE_FILE_NAME: &str = "app-state.json";

/// Injected into every system prompt.
pub const LATEX_RULES: &str = " LaTeX (mandatory): \
(1) Wrap every math expression in delimiters — single vars ($x$), numbers ($3$), exponents ($n$). \
(2) Inline: $...$. Display: $$...$$. \
(3) Never use \\(...\\) or \\[...\\]. \
(4) All subscripts, superscripts, fractions, radicals, Greek letters, vectors, operators must be inside delimiters. \
(5) Multi-line/matrix: $$\\begin{pmatrix}...\\end{pmatrix}$$. \
(6) Chemistry formulas: $\\text{H}_2\\text{O}$, $\\text{Fe}^{3+}$.";

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
Physical Education exam style: short applied sport/training scenarios rewarding data interpretation \
and evidence-based reasoning. No pure physics calculations for biomechanics — focus on qualitative \
analysis and application to sport contexts.\n\
Questions must be grounded STRICTLY in the VCE Units 3 & 4 Physical Education Study Design \
key knowledge listed below. Do NOT introduce content outside this list.\n\n\
UNIT 3 AREA OF STUDY 1 — How are movement skills improved?\n\
- Classification of movement skills: fundamental movement skills, sport-specific skills, \
open and closed skills, gross and fine skills, discrete/serial/continuous motor skills\n\
- Link between motor skill development, participation and performance\n\
- Sociocultural factors affecting skill development\n\
- Three stages of learning: cognitive, associative, autonomous\n\
- Theories of skill acquisition: linear vs non-linear; direct and constraint-based approaches\n\
- Psychological skills: confidence, motivation, optimal arousal, concentration; accompanying strategies\n\
- Practice scheduling: type (part/whole), distribution (massed/distributed), variability (blocked/random)\n\
- Feedback: intrinsic vs augmented (knowledge of results vs knowledge of performance)\n\
- Biomechanical principles: linear and angular concepts (force/torque, momentum, impulse, speed/velocity); \
Newton's 3 laws of linear motion (inertia, acceleration, action-reaction); \
projectile motion (height, angle, speed of release); anatomical third-class levers \
(axis, force, resistance, mechanical advantage); equilibrium/stability (centre of gravity, \
base of support, line of gravity)\n\
- Qualitative movement analysis stages: preparation, observation, evaluation, error correction\n\n\
UNIT 3 AREA OF STUDY 2 — How does the body produce energy?\n\
- Oxygen uptake at rest and during exercise/recovery: oxygen deficit, steady state, EPOC\n\
- Acute physiological responses to exercise in the cardiovascular, respiratory and muscular systems\n\
- Three energy systems (ATP-CP, anaerobic glycolysis, aerobic): fuels (chemical and food); \
rate and yield of each system; contribution at rest and varying intensities; \
recovery rates with active vs passive recovery\n\
- Interplay of energy systems in relation to intensity and duration of activity\n\
- Muscular fatigue mechanisms: fuel depletion, accumulation of metabolic by-products \
(e.g. H⁺ ions), thermoregulatory fatigue; linked to sport and exercise intensities/durations\n\
- Nutritional and hydration strategies: carbohydrate ingestion, protein, water — \
to enhance performance, delay fatigue, improve recovery\n\n\
UNIT 4 AREA OF STUDY 1 — What are the foundations of an effective training program?\n\
- Activity analysis data: skill frequencies, movement patterns, heart rates, work-to-rest ratios \
used to identify physiological requirements\n\
- Fitness components required in physical activity/sport: aerobic power, anaerobic capacity, \
muscular strength, power and endurance, flexibility, balance, coordination, speed, agility\n\
- Fitness assessment: purpose (physiological and psychological perspectives); \
pre-participation health screening and informed consent; \
standardised fitness tests matched to physiological requirements; \
test reliability, validity and accuracy\n\n\
UNIT 4 AREA OF STUDY 2 — How is training implemented effectively?\n\
- Strategies to monitor training: training diaries, digital tools, wearable technologies\n\
- Components of a training session: warm up, conditioning phase, cool down\n\
- Training program principles: frequency, intensity, time/duration (FITT), type, \
progression, specificity, individuality, diminishing returns, variety, maintenance, \
tapering, overtraining, detraining\n\
- Training methods: continuous, interval (short/intermediate/long/HIIT), fartlek, \
circuit, weight/resistance, flexibility, plyometrics\n\
- Chronic adaptations to aerobic, anaerobic and resistance training in the cardiovascular, \
respiratory and muscular systems, producing improvements in:\n\
  • VO₂ max\n\
  • Lactate inflection point (LIP)\n\
  • Speed and force of muscular contraction\n\
  • Lactate tolerance";

// ─── Chemistry ────────────────────────────────────────────────────────────────

pub const CHEMISTRY_LATEX_GUIDANCE: &str =
    " Render every chemical formula/ionic species in LaTeX: $\\text{H}_2\\text{O}$, \
$\\text{CO}_2$, $\\text{Fe}^{3+}$, $\\text{SO}_4^{2-}$.";

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

    // ── Physical Education ────────────────────────────────────────────────────

    m.insert("skill acquisition: classification, stages of learning, and practice scheduling",
        "Study Design key knowledge:\n\
        - Classification: fundamental movement skills, sport-specific skills, open/closed, \
gross/fine, discrete/serial/continuous motor skills\n\
        - Link between motor skill development, participation and performance\n\
        - Three stages of learning: cognitive, associative, autonomous\n\
        - Linear vs non-linear theories of skill acquisition; direct and constraint-based approaches\n\
        - Practice scheduling: type (part/whole), distribution (massed/distributed), \
variability (blocked/random)");

    m.insert("coaching and feedback: theories of acquisition and psychological strategies",
        "Study Design key knowledge:\n\
        - Sociocultural factors affecting skill development\n\
        - Psychological skills: confidence, motivation, optimal arousal, concentration; \
accompanying strategies\n\
        - Frequency and type of feedback: intrinsic vs augmented \
(knowledge of results vs knowledge of performance)\n\
        - Qualitative movement analysis stages: preparation, observation, evaluation, error correction\n\
        - Coaching considerations to enhance participation and performance");

    m.insert(
        "applied biomechanics: newton's laws, projectile motion, and levers",
        "Study Design key knowledge:\n\
        - Linear and angular concepts: force/torque, momentum, impulse, speed/velocity\n\
        - Newton's 3 laws of linear motion: inertia, acceleration, action-reaction\n\
        - Projectile motion: effect of height, angle and speed of release on trajectory\n\
        - Anatomical third-class levers: axis, force, resistance, mechanical advantage",
    );

    m.insert("movement analysis: qualitative analysis and equilibrium in sport",
        "Study Design key knowledge:\n\
        - Qualitative movement analysis stages: preparation, observation, evaluation, error correction\n\
        - Equilibrium and stability: centre of gravity, base of support, line of gravity\n\
        - Application of biomechanical principles to analyse and improve sport-specific movements\n\
        - Use of video and systematic observation to analyse movement skills");

    m.insert("energy system interplay: atp-cp, anaerobic glycolysis, and aerobic systems",
        "Study Design key knowledge:\n\
        - ATP-CP system: fuel (phosphocreatine), high rate, very low yield, ~30s recovery\n\
        - Anaerobic glycolysis: fuel (glycogen/glucose), high rate, low yield, ~60–90s recovery\n\
        - Aerobic system: fuels (glycogen, fats, protein), low rate, very high yield, slow recovery\n\
        - Contribution of each system at rest and varying intensities and durations\n\
        - Interplay of energy systems during physical activity, sport and exercise");

    m.insert(
        "cardiorespiratory dynamics: oxygen uptake, epoc, and vo2 max/lip",
        "Study Design key knowledge:\n\
        - Oxygen uptake at rest and during physical activity and recovery\n\
        - Oxygen deficit: gap between O₂ demand and O₂ supply at exercise onset\n\
        - Steady state: point where O₂ supply meets demand\n\
        - EPOC (excess post-exercise oxygen consumption): causes and duration\n\
        - Acute cardiovascular and respiratory responses to exercise\n\
        - VO₂ max as a measure of aerobic power; lactate inflection point (LIP)",
    );

    m.insert(
        "physiological responses: acute responses and fatigue mechanisms",
        "Study Design key knowledge:\n\
        - Acute responses in cardiovascular system: HR, stroke volume, cardiac output, \
blood pressure, blood redistribution\n\
        - Acute responses in respiratory system: breathing rate, tidal volume, \
minute ventilation, O₂ uptake\n\
        - Acute responses in muscular system: increased O₂ extraction, temperature, blood flow\n\
        - Muscular fatigue mechanisms: fuel depletion (ATP-CP, glycogen), \
accumulation of metabolic by-products (H⁺ ions), thermoregulatory fatigue\n\
        - Relationship between fatigue mechanisms and exercise intensity/duration",
    );

    m.insert(
        "recovery and nutrition: hydration and nutritional strategies for homeostasis",
        "Study Design key knowledge:\n\
        - Active vs passive recovery and effects on energy system recovery rates\n\
        - Nutritional strategies to enhance performance, delay fatigue, improve recovery:\n\
          carbohydrate ingestion (timing, type), protein (muscle repair), water/hydration\n\
        - EPOC and its role in recovery\n\
        - Return to pre-exercise conditions (homeostasis)",
    );

    m.insert("training foundation: activity analysis, fitness components, and testing",
        "Study Design key knowledge:\n\
        - Activity analysis data: skill frequencies, movement patterns, heart rates, \
work-to-rest ratios — used to identify physiological requirements\n\
        - Fitness components: aerobic power, anaerobic capacity, muscular strength, power and endurance, \
flexibility, balance, coordination, speed, agility\n\
        - Purpose of fitness testing (physiological and psychological perspectives)\n\
        - Pre-participation health screening and informed consent\n\
        - Standardised, recognised fitness tests matched to physiological requirements\n\
        - Test reliability, validity and accuracy");

    m.insert("program design: training principles, methods, and chronic adaptations",
        "Study Design key knowledge:\n\
        - Training principles: frequency, intensity, time/duration (FITT), type, progression, \
specificity, individuality, diminishing returns, variety, maintenance, tapering, overtraining, detraining\n\
        - Training methods: continuous, interval (short/intermediate/long/HIIT), fartlek, \
circuit, weight/resistance, flexibility, plyometrics\n\
        - Components of a session: warm up, conditioning phase, cool down\n\
        - Monitoring: training diaries, digital tools, wearable technologies\n\
        - Chronic adaptations of cardiovascular, respiratory and muscular systems to aerobic, \
anaerobic and resistance training — producing improvements in VO₂ max, LIP, \
lactate tolerance, speed and force of muscular contraction");

    m
}
