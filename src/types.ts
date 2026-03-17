export type Difficulty = "Essential Skills" | "Easy" | "Medium" | "Hard" | "Extreme";

export type TechMode = "tech-free" | "tech-active" | "mix";

export const MATH_METHODS_SUBTOPICS = [
  "Functions and Graphs",
  "Transformation of Graphs",
  "Algebra and Structure",
  "Trigonometric Functions",
  "Exponential and Logarithmic Functions",
  "Differentiation",
  "Integration",
  "Probability and Statistics",
  "Discrete Random Variables",
  "Continuous Random Variables",
] as const;

export type MathMethodsSubtopic = typeof MATH_METHODS_SUBTOPICS[number];

export const SPECIALIST_MATH_SUBTOPICS = [
  "Additional Algebra and Number Systems",
  "Sequences and Series",
  "Reciprocals and Rational Functions",
  "Combinatorics and Matrices",
  "Trigonometric Functions and Identities",
  "Proof",
  "Modulus",
  "Algorithms and Graph Theory",
  "Graphing relations",
  "Complex numbers",
  "Transformations and Vectors in the plane",
] as const;

export type SpecialistMathSubtopic = typeof SPECIALIST_MATH_SUBTOPICS[number];

export const PHYSICAL_EDUCATION_SUBTOPICS = [
  "Skill Acquisition: Classification, Stages of Learning, and Practice Scheduling",
  "Coaching and Feedback: Theories of Acquisition and Psychological Strategies",
  "Applied Biomechanics: Newton’s Laws, Projectile Motion, and Levers",
  "Movement Analysis: Qualitative Analysis and Equilibrium in Sport",
  "Energy System Interplay: ATP-CP, Anaerobic Glycolysis, and Aerobic Systems",
  "Cardiorespiratory Dynamics: Oxygen Uptake, EPOC, and VO2 Max/LIP",
  "Physiological Responses: Acute Responses and Fatigue Mechanisms",
  "Recovery and Nutrition: Hydration and Nutritional Strategies for Homeostasis",
  "Training Foundation: Activity Analysis, Fitness Components, and Testing",
  "Program Design: Training Principles, Methods, and Chronic Adaptations",
] as const;

export type PhysicalEducationSubtopic = typeof PHYSICAL_EDUCATION_SUBTOPICS[number];

export const VCE_COMMAND_TERMS = [
  "Identify",
  "Describe",
  "Explain",
  "Compare",
  "Analyse",
  "Discuss",
  "Evaluate",
  "Justify",
] as const;

export type VceCommandTerm = typeof VCE_COMMAND_TERMS[number];

export const CHEMISTRY_SUBTOPICS = [
  "Periodic Trends: Structure, Periodic Organisation, and Critical or Endangered Elements",
  "Molecular Structure: Lewis Structures, VSEPR Geometry, Polarity, and Intermolecular Forces",
  "Metallic Bonding: Metallic Lattices and the Reactivity Series",
  "Ionic Chemistry: Ionic Bonding, Precipitation Reactions, and Solubility Tables",
  "Chemical Quantities: Moles, Molar Mass, Percentage Composition, and Empirical/Molecular Formulas",
  "Separation Techniques: Chromatography and Rf Value Identification",
  "Organic Classification: Alkanes, Alkenes, Alcohols, Carboxylic Acids, Haloalkanes, and IUPAC Naming",
  "Polymer Chemistry: Addition and Condensation Polymerisation, Plastics, and Recycling",
  "Sustainability: Green Chemistry, Circular Economy, and Sustainable Development",
  "Water Chemistry: Hydrogen Bonding and Unique Physical Properties of Water",
  "Acid–Base Chemistry: Brønsted–Lowry Theory, pH, Neutralisation, and Applications",
  "Redox Chemistry: Electron Transfer, Half-Equations, Displacement, and Corrosion",
  "Solutions: Concentration Units and Solubility Relationships",
  "Volumetric Analysis: Acid–Base Titration, Standard Solutions, and Indicators",
  "Gas Chemistry: Ideal Gas Equation and Greenhouse Gases",
  "Analytical Techniques: Electrical Conductivity, Stoichiometry, and Colorimetry/UV–Vis Spectroscopy"
] as const;

export type ChemistrySubtopic = typeof CHEMISTRY_SUBTOPICS[number];

export const ENGLISH_LANGUAGE_SUBTOPICS = [
  "Unit 1 AOS 1: Nature and Functions of Language",
  "Unit 1 AOS 2: Language Acquisition",
  "Unit 2 AOS 1: English Across Time",
  "Unit 2 AOS 2: Englishes in Contact",
  "Unit 3 AOS 1: Informality",
  "Unit 3 AOS 2: Formality",
  "Unit 4 AOS 1: Language Variation in Australian Society",
  "Unit 4 AOS 2: Individual and Group Identities",
] as const;

export type EnglishLanguageSubtopic = typeof ENGLISH_LANGUAGE_SUBTOPICS[number];

export const ENGLISH_LANGUAGE_TASK_TYPES = ["short-answer", "text-analysis"] as const;

export type EnglishLanguageTaskType = typeof ENGLISH_LANGUAGE_TASK_TYPES[number];

export const SUBTOPIC_INSTRUCTIONS: Record<string, string> = {
  "Functions and Graphs": `Questions test knowledge of key features of graphs: axis intercepts, stationary points, points of inflection, domain and range (using interval notation or set notation), asymptotic behaviour, and symmetry. Function types include: polynomials, power functions, exponential (especially base e), logarithmic (log_e and log_10), and circular functions (sin, cos, tan). Domain notation: Use interval notation e.g. [0, 2π] or set notation e.g. x ∈ R, x > 0. For restricted domains write as f : [a, b] → R, f(x) = ... Functions are written in the form f : domain → R, f(x) = ... Always specify the domain and codomain when defining a function. Range should be given using interval notation e.g. [−1, 3] or (−∞, 2]. Sum, difference, product and composite functions (f ∘ g) are assessable. Reciprocal/quotient composites are NOT in scope. Piecewise (hybrid) functions are assessable — write using brace notation with each piece and its domain condition. For inverse functions: state conditions for existence (one-to-one/strictly monotone on domain), and find by swapping x and y then solving. The graph of y = f⁻¹(x) is the reflection of y = f(x) in the line y = x.`,
  "Transformation of Graphs": `No matrices. Describe all transformations in plain language as dilations, reflections, and translations only. Standard transformations applied to y = f(x):
- Dilation by factor a from the x-axis: y = a·f(x)
- Dilation by factor 1/b from the y-axis: y = f(bx)
- Reflection in the x-axis: y = −f(x)
- Reflection in the y-axis: y = f(−x)
- Translation h units in the positive x-direction: y = f(x − h)
- Translation k units in the positive y-direction: y = f(x) + k
Combined form: y = a·f(b(x − h)) + k
Order of transformations matters — dilations and reflections before translations UNLESS the question specifies a particular sequence.
Questions may ask: which sequence of transformations maps f to g, OR which sequence does NOT produce g from f. Carefully apply each transformation in order and track the resulting function rule.
When describing a sequence, each step should be written as a separate numbered transformation, e.g.:
1. Dilation by a factor of 2 from the x-axis
2. Translation of 3 units in the positive direction of the x-axis
Transformations apply to key points — track where specific coordinates map to under a given transformation.
`,
  "Algebra and Structure": `Topics include: solving polynomial equations (degree n, up to n real solutions), inverse functions, composition of functions, simultaneous linear equations (including parametric cases), and literal equations.
For systems of simultaneous equations with parameter k: find values of k for which the system has no solution (parallel lines / singular matrix determinant = 0 with inconsistent RHS), infinitely many solutions, or a unique solution.
Composition of functions: (f ∘ g)(x) = f(g(x)). State the domain of the composite — requires range of g to be a subset of domain of f.
For inverse functions: swap x and y, solve for y. Domain of f⁻¹ = range of f.
Equations involving e^x: substitute u = e^x to reduce to a polynomial/quadratic, reject any solutions where u ≤ 0 since e^x > 0 always.
For solving f(x) = g(x): state solutions algebraically where possible; use interval notation for solution sets.
Algorithms (pseudocode with while loops, assignments): trace through the algorithm step by step to determine printed output. This appears in multiple choice.
`,

  "Trigonometric Functions": `
Functions: sin(x), cos(x), tan(x) and transformations of these.
Standard form: y = a·sin(b(x − h)) + k or y = a·cos(b(x − h)) + k
- Amplitude = |a|
- Period = 2π/b for sin/cos, π/b for tan
- Range of a·sin + k or a·cos + k is [k − |a|, k + |a|]
For tan: asymptotes occur where cos(bx + c) = 0; solve b(x − h) = π/2 + nπ for integer n.
Exact values required: sin, cos, tan of 0, π/6, π/4, π/3, π/2, π, 3π/2, 2π and related angles.
Solving trigonometric equations over a given interval: identify the reference angle, then list all solutions in the domain using the symmetry/period of the function.
For f(x+k) = f(x): this means k is a period of f on that domain. Find the smallest positive k that is a period of f, then determine the largest interval [0, a] over which both x and x+k remain in the domain.
Newton's method applied to f: x_{n+1} = x_n − f(x_n)/f'(x_n). Apply iteratively from given x_0.
`,
  "Exponential and Logarithmic Functions": `Key functions: e^x, a^x, log_e(x), log_a(x).
log_e is written as log_e(x) or ln(x) — both are acceptable. The VCAA formula sheet uses log_e notation.
Laws of logarithms: log(ab) = log(a) + log(b), log(a/b) = log(a) − log(b), log(a^n) = n·log(a).
Exponential equations: if a^f(x) = a^g(x) then f(x) = g(x). Convert between forms: a^x = e^(x·log_e(a)).
Writing g(x) = Ae^(kx) in the form A × b^(cx): use b = e^k so kx = cx·log_e(b), giving c = k/log_e(b). Or equivalently b = e and c = k.
Anti-derivative of 1/x is log_e|x| + c (for x ≠ 0). On exam, if x > 0 on the domain, write log_e(x) + c.
For h(x) = a·log_e(bx): h'(x) = a/x (the b cancels). The range of h'(x) = a/x is (0, ∞) if a > 0 and x > 0 (or a < 0 and x < 0), giving condition ab > 0 for range (0, ∞).
Domain of log_e(f(x)) requires f(x) > 0.
`,

  "Differentiation": `
Derivatives to know:
- d/dx[x^n] = nx^(n−1)
- d/dx[e^(ax)] = ae^(ax)
- d/dx[log_e(x)] = 1/x
- d/dx[sin(ax)] = a·cos(ax)
- d/dx[cos(ax)] = −a·sin(ax)
- d/dx[tan(ax)] = a·sec²(ax) = a/cos²(ax)
- Product rule: (uv)' = u'v + uv'
- Chain rule: dy/dx = (dy/du)(du/dx)
- Quotient rule: (u/v)' = (u'v − uv')/v²

Stationary points: solve f'(x) = 0. Classify using sign of f'(x) on either side (gradient table) or second derivative test.
Stationary point of inflection: f'(x) = 0 AND f'(x) does not change sign (f'(x) ≥ 0 on both sides, or ≤ 0 on both sides). Show via a gradient table with values either side.
Gradient tables: write x values either side of the stationary point and the sign (+/−/0) of f'(x), plus arrow indicating increasing/decreasing.
Average rate of change over [a, b]: (f(b) − f(a))/(b − a) — this is the slope of the secant.
Greatest average rate of change = steepest secant = longest rise/run ratio between the two endpoints of the interval.
Tangent line at x = a: y − f(a) = f'(a)(x − a).
Newton's method: x_{n+1} = x_n − f(x_n)/f'(x_n). Apply exactly the number of iterations specified.
`,

  "Integration": `
Anti-derivatives (indefinite integrals):
- ∫x^n dx = x^(n+1)/(n+1) + c, n ≠ −1
- ∫e^(ax) dx = (1/a)e^(ax) + c
- ∫1/x dx = log_e(x) + c (x > 0)
- ∫sin(ax) dx = −(1/a)cos(ax) + c
- ∫cos(ax) dx = (1/a)sin(ax) + c
- ∫(ax + b)^n dx = (ax+b)^(n+1)/(a(n+1)) + c, n ≠ −1

Definite integral ∫_a^b f(x) dx gives signed area. For actual (unsigned) area between curves, split at intersection points and take absolute values.

Area between two curves: ∫_a^b |f(x) − g(x)| dx. Identify which function is greater on each subinterval.

Average value of f on [a, b]: (1/(b−a)) ∫_a^b f(x) dx.

Trapezium rule with n trapeziums over [a, b], width h = (b−a)/n:
Area ≈ (h/2)[f(x_0) + 2f(x_1) + 2f(x_2) + ... + 2f(x_{n-1}) + f(x_n)]
Overestimate when function is concave up on the interval; underestimate when concave down.

For anti-derivatives with a boundary condition: integrate to get F(x) = ... + c, then substitute the given point to find c.

∫_1^2 f(x) dx > ∫_1^3 f(x) dx means ∫_2^3 f(x) dx < 0, i.e. f is negative (net) on [2,3].
`,

  "Probability and Statistics": `
Conditional probability: Pr(A|B) = Pr(A ∩ B)/Pr(B).

For Bayes'-style problems with two groups (m walkers, n others): use the law of total probability. 
Pr(walked | late) = Pr(late | walked)·Pr(walked) / Pr(late) = (0.2m) / (0.2m + 0.4n) = m/(m + 2n).

Normal distribution X ~ N(μ, σ²): use CAS for Exam 2, use symmetry/standardisation for Exam 1.
Pr(X > a) and Pr(a < X < b) — look for symmetry: Pr(X > μ) = 0.5, Pr(X < μ) = 0.5.

95% confidence interval for population proportion p:
(p̂ − z√(p̂(1−p̂)/n), p̂ + z√(p̂(1−p̂)/n)) where z ≈ 1.96 for 95%.
Centre of interval = p̂, half-width = z√(p̂(1−p̂)/n).
Given interval (L, U): p̂ = (L+U)/2, margin of error = (U−L)/2. Solve for n.

Sample proportion P̂ = X/n: E(P̂) = p, sd(P̂) = √(p(1−p)/n).

For finding n from a confidence interval: set 2 × 1.96 × √(p̂(1−p̂)/n) = U − L and solve for n (round to integer).
`,

  "Discrete Random Variables": `
Discrete random variable X with probability mass function p(x) = Pr(X = x).

All probabilities must sum to 1: Σ p(x) = 1. Use this to find unknown parameters.

Mean (expected value): E(X) = μ = Σ x·p(x).
Variance: Var(X) = E(X²) − μ² = Σ x²·p(x) − μ².

Binomial distribution X ~ Bi(n, p):
Pr(X = x) = C(n,x) · p^x · (1−p)^(n−x)
E(X) = np, Var(X) = np(1−p).

For Pr(X ≥ k): compute as 1 − Pr(X ≤ k−1), or sum directly for small n.

Exact answers required in Exam 1 — leave as fractions. E.g. Pr(X ≥ 5) for X ~ Bi(6, 1/4): compute Pr(X=5) + Pr(X=6) exactly, express in form a/2^b.

Probability mass function graphs: mean is the weighted average of x-values. Compare distributions by computing Σ x·p(x) for each.

Algorithms producing discrete outputs: trace through pseudocode (while loops, assignments, print statements) line by line, tracking variable values.
`,

  "Continuous Random Variables": `
Probability density function (pdf) f(x) ≥ 0 and ∫_{−∞}^{∞} f(x) dx = 1.

For piecewise pdf: integrate each piece over its domain and sum to 1 to find unknown constants.
E.g. ∫_0^{π/4} k·sin(x) dx + ∫_{π/4}^{π/2} k·cos(x) dx = 1.

Pr(a < X < b) = ∫_a^b f(x) dx.

Mean: μ = ∫_{−∞}^{∞} x·f(x) dx.
Variance: σ² = ∫_{−∞}^{∞} x²·f(x) dx − μ².
Standard deviation: σ = √(Var(X)).

Finding k such that Pr(X > k) = c: set ∫_k^{upper} f(x) dx = c and solve for k.

For transformations h(x) = m·f(x) + n applied to a pdf f(x):
∫_a^b h(x) dx = m·∫_a^b f(x) dx + n·(b−a).

Normal distribution on Exam 2 uses CAS. On Exam 1, use given probability values and symmetry.
Pr(X > 200) = 0.325 means Pr(X ≤ 200) = 0.675. Use given constraints to set up simultaneous equations in μ and σ.

Traffic light / Bernoulli trials with non-identical probabilities: compute Pr(Y = y) by listing combinations (not binomial formula since p differs). E.g. for three lights A, B, C with different p-values, Pr(Y=2) = Pr(A∩B∩C') + Pr(A∩B'∩C) + Pr(A'∩B∩C).
`,
  "Unit 1 AoS 1: Nature and Functions of Language": `Use conventions focusing on Unit 1 Area of Study 1. Prioritize questions regarding language as an arbitrary yet rule-governed meaning-making system and the specific properties of human communication. Focus on the major functions of language, specifically referential, emotive, conative, phatic, metalinguistic, and poetic functions. Require precise metalanguage in responses, particularly regarding situational context (field, setting, and language mode) and tenor (the relationship between participants). Include short stimulus excerpts where students must identify and explain features from the following subsystems: Morphology (morpheme types and affixation), Lexicology (word classes, function vs. content words), and Syntax (phrases, clauses, and the four sentence structures and types). Students must explain how these linguistic choices are influenced by the text's register and authorial intent.`,
  "Unit 1 AOS 2: Language Acquisition": `Use Unit 1 Area of Study 2 conventions. Focus on first-language development stages, additional-language acquisition, and acquisition theories (for example usage-based and universalist accounts). Require students to apply evidence from child/adolescent language data and evaluate explanations. Include prompts on critical period debates, caretaker talk, overgeneralisation, and developmental milestones using explicit linguistic evidence.`,
  "Unit 2 AOS 1: English Across Time": `Use Unit 2 Area of Study 1 conventions. Frame questions around historical development of English and subsystem change across periods. Include etymology, standardisation influences, orthographic change, semantic shift, and phonological change (for example Great Vowel Shift) where relevant. Demand clear cause-and-effect analysis using social, technological, and contact-driven drivers of change.`,
  "Unit 2 AOS 2: Englishes in Contact": `Use Unit 2 Area of Study 2 conventions. Emphasise contact varieties, global spread, and sociocultural consequences of language contact. Include pidgins, creoles, Aboriginal Englishes, and world Englishes with context-sensitive analysis. Require students to discuss language maintenance, shift, prestige, attitudes, and identity impacts using accurate metalanguage and specific examples`,
  "Unit 3 AOS 1: Informality": `Use Unit 3 Area of Study 1 conventions. Build prompts around contemporary Australian informal language, solidarity building, and rapport. Require analysis of lexical choices, discourse particles, idiomatic expressions, contractions, overlaps, and interactional strategies in informal contexts. Students should evaluate how features shape social goals, relationships, and audience alignment.`,
  "Unit 3 AOS 2: Formality": `Use Unit 3 Area of Study 2 conventions. Prioritise formal register in institutional or public settings where authority, expertise, or distance is managed. Require close analysis of syntax, modality, nominalisation, hedging, politeness strategies, and discourse structure. Questions should ask students to compare formal and informal choices and justify contextual effectiveness.`,
  "Unit 4 AOS 1: Language Variation in Australian Society": `Use Unit 4 Area of Study 1 conventions. Focus on variation across social and regional dialects in Australian contexts, including standard and non-standard forms. Require students to analyse how phonological, lexical, and discourse features index social meaning and group membership. Prompts should include identity, power, and attitudes toward varieties in contemporary Australia.`,
  "Unit 4 AOS 2: Individual and Group Identities": `Use Unit 4 Area of Study 2 conventions. Emphasise idiolect, sociolect, ethnicity, gender, age, occupation, and community affiliations in identity construction. Require students to evaluate how language choices perform alignment, inclusion, exclusion, authority, and authenticity. Analytical tasks should reward argument quality, evidence integration, and nuanced discussion of language attitudes and ideology.`,
};

export type Topic =
  | "Mathematical Methods"
  | "Specialist Mathematics"
  | "Chemistry"
  | "Physical Education"
  | "English Language";

export type GeneratedQuestion = {
  id: string;
  topic: string;
  subtopic?: string;
  taskType?: EnglishLanguageTaskType;
  recommendedResponseLength?: "short" | "extended";
  promptMarkdown: string;
  maxMarks: number;
  techAllowed?: boolean;
  distinctnessScore?: number;
  multiStepDepth?: number;
};

export type PassageSubQuestion = {
  id: string;
  promptMarkdown: string;
  maxMarks: number;
};

export type GeneratedPassage = {
  id: string;
  text: string;
  aosSubtopic: EnglishLanguageSubtopic;
  questions: PassageSubQuestion[];
};

export type GenerationTelemetry = {
  difficulty: string;
  totalAttempts: number;
  repairAttempts: number;
  constrainedRegenerationUsed: boolean;
  repairPath: string[];
  durationMs: number;
  structuredOutputStatus?: "used" | "not-supported-fallback" | "not-requested";
  distinctnessAvg?: number;
  multiStepDepthAvg?: number;
};

export type GenerationStatusStage =
  | "preparing"
  | "generating"
  | "validating"
  | "repairing"
  | "regenerating"
  | "completed"
  | "failed";

export type GenerationStatusEvent = {
  mode: QuestionMode | "passage";
  stage: GenerationStatusStage;
  message: string;
  attempt: number;
};

export type GenerateQuestionsResponse = {
  questions: GeneratedQuestion[];
  rawModelOutput?: string;
  telemetry?: GenerationTelemetry;
};

export type GeneratePassageResponse = {
  passage: GeneratedPassage;
  rawModelOutput?: string;
  telemetry?: GenerationTelemetry;
};

export type MarkAnswerResponse = {
  verdict: string;
  achievedMarks: number;
  maxMarks: number;
  scoreOutOf10: number;
  vcaaMarkingScheme: MarkingCriterion[];
  comparisonToSolutionMarkdown: string;
  feedbackMarkdown: string;
  workedSolutionMarkdown: string;
};

export type MarkingCriterion = {
  criterion: string;
  achievedMarks: number;
  maxMarks: number;
  rationale: string;
};

export type StudentAnswerImage = {
  name: string;
  dataUrl: string;
};

export type WrittenAttemptKind = "initial" | "appeal" | "override";
export type McAttemptKind = "initial" | "appeal" | "override";

export type AnswerAnalytics = {
  attemptSequence: number;
  answerCharacterCount: number;
  answerWordCount: number;
  usedImageUpload: boolean;
  responseLatencyMs?: number;
};

export type WrittenAnswerAnalytics = AnswerAnalytics & {
  attemptKind: WrittenAttemptKind;
  markingLatencyMs?: number;
};

export type McAnswerAnalytics = AnswerAnalytics & {
  attemptKind?: McAttemptKind;
};

export type QuestionHistoryEntry = {
  id: string;
  createdAt: string;
  question: GeneratedQuestion;
  uploadedAnswer: string;
  uploadedAnswerImage?: StudentAnswerImage;
  workedSolutionMarkdown: string;
  markResponse: MarkAnswerResponse;
  generationTelemetry?: GenerationTelemetry;
  analytics?: WrittenAnswerAnalytics;
};

export type BackendError = {
  code?: string;
  message?: string;
};

export const TOPICS: Topic[] = [
  "Mathematical Methods",
  "Specialist Mathematics",
  "Chemistry",
  "Physical Education",
  "English Language",
];

export const API_KEY_STORAGE_KEY = "questiongen.openrouterApiKey";
export const QUESTION_HISTORY_STORAGE_KEY = "questiongen.history";
export const MC_HISTORY_STORAGE_KEY = "questiongen.mcHistory";
export const DEBUG_MODE_STORAGE_KEY = "questiongen.debugMode";
export const APP_STATE_STORAGE_KEY = "questiongen.appState";
export const HISTORY_ENTRY_LIMIT = 200;
export const SAVED_SET_LIMIT = 100;
export const PERSISTED_APP_STATE_VERSION = 2;

export type QuestionMode = "written" | "multiple-choice";

export type McOption = {
  label: string;
  text: string;
};

export type McQuestion = {
  id: string;
  topic: string;
  subtopic?: string;
  promptMarkdown: string;
  options: McOption[];
  correctAnswer: string;
  explanationMarkdown: string;
  techAllowed?: boolean;
  distinctnessScore?: number;
  multiStepDepth?: number;
};

export type GenerateMcQuestionsResponse = {
  questions: McQuestion[];
  rawModelOutput?: string;
  telemetry?: GenerationTelemetry;
};

export type McHistoryEntry = {
  type: "multiple-choice";
  id: string;
  createdAt: string;
  question: McQuestion;
  selectedAnswer: string;
  correct: boolean;
  awardedMarks?: number;
  maxMarks?: number;
  generationTelemetry?: GenerationTelemetry;
  analytics?: McAnswerAnalytics;
};

export type PersistedSettings = {
  apiKey: string;
  model: string;
  debugMode: boolean;
  useStructuredOutput: boolean;
};

export type PersistedGeneratorPreferences = {
  selectedTopics: Topic[];
  difficulty: Difficulty;
  techMode: TechMode;
  avoidSimilarQuestions: boolean;
  mathMethodsSubtopics: MathMethodsSubtopic[];
  specialistMathSubtopics: SpecialistMathSubtopic[];
  chemistrySubtopics: ChemistrySubtopic[];
  physicalEducationSubtopics: PhysicalEducationSubtopic[];
  englishLanguageSubtopics: EnglishLanguageSubtopic[];
  englishLanguageTaskTypes: EnglishLanguageTaskType[];
  questionCount: number;
  maxMarksPerQuestion: number;
  passageAosSubtopic: EnglishLanguageSubtopic;
  passageQuestionCount: number;
  prioritizedCommandTerms: VceCommandTerm[];
  questionMode: QuestionMode;
  subtopicInstructions: Record<string, string>;
  customFocusArea: string;
};

export type PersistedPassageSession = {
  passage: GeneratedPassage | null;
  activeQuestionIndex: number;
  presentedAtByQuestionId: Record<string, number>;
  answersByQuestionId: Record<string, string>;
  feedbackByQuestionId: Record<string, MarkAnswerResponse>;
  rawModelOutput: string;
  generationTelemetry?: GenerationTelemetry | null;
  savedSetId?: string | null;
};

export type PersistedWrittenSession = {
  questions: GeneratedQuestion[];
  activeQuestionIndex: number;
  presentedAtByQuestionId: Record<string, number>;
  answersByQuestionId: Record<string, string>;
  imagesByQuestionId: Record<string, StudentAnswerImage | undefined>;
  feedbackByQuestionId: Record<string, MarkAnswerResponse>;
  rawModelOutput: string;
  generationTelemetry?: GenerationTelemetry | null;
  savedSetId?: string | null;
};

export type PersistedMcSession = {
  questions: McQuestion[];
  activeQuestionIndex: number;
  presentedAtByQuestionId: Record<string, number>;
  answersByQuestionId: Record<string, string>;
  rawModelOutput: string;
  generationTelemetry?: GenerationTelemetry | null;
  savedSetId?: string | null;
};

export type SavedQuestionSet = {
  id: string;
  title: string;
  questionMode: QuestionMode;
  createdAt: string;
  updatedAt: string;
  preferences: PersistedGeneratorPreferences;
  writtenSession?: PersistedWrittenSession;
  passageSession?: PersistedPassageSession;
  mcSession?: PersistedMcSession;
};

export type PersistedAppState = {
  version: number;
  settings: PersistedSettings;
  preferences: PersistedGeneratorPreferences;
  passageSession: PersistedPassageSession;
  writtenSession: PersistedWrittenSession;
  mcSession: PersistedMcSession;
  questionHistory: QuestionHistoryEntry[];
  mcHistory: McHistoryEntry[];
  savedSets: SavedQuestionSet[];
};
