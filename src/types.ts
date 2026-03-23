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

export const SUBTOPIC_INSTRUCTIONS: Record<string, string> = {

  // ─────────────────────────────────────────────
  // MATHEMATICAL METHODS
  // ─────────────────────────────────────────────

  "Functions and Graphs": `
SCOPE
- Function types: polynomials, power functions, exponential (base e and base a), logarithmic
  (log_e and log_10), and circular functions (sin, cos, tan).
- Key graph features to test: x- and y-intercepts, stationary points, points of inflection,
  domain and range, asymptotic behaviour (horizontal, vertical, oblique), and symmetry.

NOTATION
- Functions must be written in the form  f : domain → R, f(x) = ...
- Always specify domain and codomain. Restricted domain example: f : [a, b] → R, f(x) = ...
- Domain: use interval notation [a, b], (a, b), (−∞, b] or set notation {x ∈ R : x > 0}.
- Range: use interval notation, e.g. [−1, 3] or (−∞, 2].

FUNCTION OPERATIONS
- Sum, difference, product, and composite functions (f ∘ g) are all assessable.
- Composite (f ∘ g)(x) = f(g(x)): state the domain — range of g must be a subset of domain of f.
- Reciprocal/quotient composites are NOT in scope.
- Piecewise (hybrid) functions: write using brace notation with each piece and its domain condition.

INVERSE FUNCTIONS
- Conditions for existence: function must be one-to-one (strictly monotone) on its domain.
- Method: swap x and y, solve for y. Domain of f⁻¹ = range of f; range of f⁻¹ = domain of f.
- Graphical relationship: y = f⁻¹(x) is the reflection of y = f(x) in the line y = x.

QUESTION DESIGN GUIDANCE
- Include a mix of: identifying key features from an equation, sketching graphs, determining
  domains/ranges, and finding rules for composite or inverse functions.
- Multi-part questions should progress from identification → manipulation → application.
- Avoid questions where the domain is unspecified — always make the domain explicit.
`,

  "Transformation of Graphs": `
SCOPE
- Transformations of y = f(x): dilations, reflections, and translations only. NO matrices.
- Describe all transformations in plain language.

STANDARD TRANSFORMATION FORMS
- Dilation by factor a from the x-axis:       y = a·f(x)
- Dilation by factor 1/b from the y-axis:     y = f(bx)
- Reflection in the x-axis:                   y = −f(x)
- Reflection in the y-axis:                   y = f(−x)
- Translation h units in positive x-direction: y = f(x − h)
- Translation k units in positive y-direction: y = f(x) + k
- Combined general form:                       y = a·f(b(x − h)) + k

ORDER OF TRANSFORMATIONS
- Default order: dilations and reflections BEFORE translations.
- If a question specifies a particular sequence, apply transformations in that stated order.
- Always track the resulting function rule after each step.

QUESTION TYPES
- Identify which sequence of transformations maps f to g.
- Identify which sequence does NOT produce g from f (negative identification).
- Given a combined form y = a·f(b(x − h)) + k, describe each transformation as a separate step.
- Track where specific key coordinates (e.g. turning points, intercepts) map to under a transformation.

WORKED EXAMPLE FORMAT
When describing a sequence, number each step clearly:
  1. Dilation by a factor of 2 from the x-axis
  2. Reflection in the y-axis
  3. Translation of 3 units in the positive direction of the x-axis

QUESTION DESIGN GUIDANCE
- Vary between: identifying parameters from a graph, writing the transformation sequence from
  equation comparison, and applying transformations to a set of key coordinates.
- Include at least one question involving a non-trivial combined transformation (all four parameters).
- Test common errors: confusing dilation from x-axis vs y-axis, and sign of translation direction.
`,

  "Algebra and Structure": `
SCOPE
- Polynomial equations (degree n, up to n real solutions).
- Simultaneous linear equations including parametric cases.
- Literal equations (rearranging for a specified variable).
- Composition of functions, inverse functions.
- Substitution to reduce non-polynomial equations to polynomial form.
- Algorithm tracing (pseudocode with while loops, assignments, print statements).

SIMULTANEOUS EQUATIONS WITH PARAMETER k
- Find values of k for: no solution (parallel lines / determinant = 0 with inconsistent RHS),
  infinitely many solutions, or a unique solution.
- Use elimination or matrix/determinant approach to classify the system.

FUNCTION ALGEBRA
- Composition: (f ∘ g)(x) = f(g(x)). The domain of f ∘ g requires range(g) ⊆ domain(f).
- Inverse: swap x and y, solve for y. Domain of f⁻¹ = range of f.
- For equations involving e^x: substitute u = e^x to form a polynomial/quadratic in u.
  Reject solutions u ≤ 0 since e^x > 0 always.

SOLVING EQUATIONS
- For f(x) = g(x): solve algebraically; express solution sets using interval or set notation.
- For polynomial equations: state the number of real solutions and verify using discriminant
  or sign analysis where appropriate.
- For literal equations: isolate the target variable clearly, showing each algebraic step.

ALGORITHM TRACING
- Trace pseudocode (while loops, assignment statements, print) line by line.
- Track all variable values in a table at each step.
- Determine the printed output exactly — this is a common multiple-choice question type.

QUESTION DESIGN GUIDANCE
- Vary difficulty: simple composition/inverse → parametric simultaneous → substitution reduction.
- Always specify the domain when asking about composite or inverse functions.
- Algorithm tracing questions should have a clearly defined termination condition.
`,

  "Trigonometric Functions": `
SCOPE
- Functions: sin(x), cos(x), tan(x) and their transformations.
- Standard form: y = a·sin(b(x − h)) + k  or  y = a·cos(b(x − h)) + k

KEY PARAMETERS
- Amplitude:   |a|
- Period:      2π/b for sin/cos;  π/b for tan
- Range:       [k − |a|, k + |a|]  for sin and cos
- Phase shift: h units in the positive x-direction
- Vertical shift: k units

ASYMPTOTES FOR TAN
- Asymptotes occur where cos(bx + c) = 0.
- Solve b(x − h) = π/2 + nπ for integer n to find asymptote locations.

EXACT VALUES
- Required for sin, cos, tan of: 0, π/6, π/4, π/3, π/2, π, 3π/2, 2π and related angles.
- Negative angles and angles beyond 2π: use symmetry and periodicity.

SOLVING TRIGONOMETRIC EQUATIONS
- Identify the reference angle from the exact value table.
- List ALL solutions in the given domain using periodicity and quadrant symmetry (CAST rule).
- Express answers exactly in terms of π where possible.

PERIODICITY QUESTIONS
- For f(x + k) = f(x): k is a period of f. Find the smallest positive period, then determine
  the largest interval [0, a] over which both x and x + k remain within the required domain.

NEWTON'S METHOD
- Formula: x_{n+1} = x_n − f(x_n) / f′(x_n)
- Apply exactly the number of iterations specified; show each step.

QUESTION DESIGN GUIDANCE
- Include: reading parameters from graphs, solving equations over specified intervals,
  sketching transformed trig functions, finding amplitude/period/phase from equations.
- Avoid ambiguous domains — always specify the interval explicitly.
- Mix Exam 1 style (exact answers, no CAS) with Exam 2 style (CAS-assisted numerical answers).
`,

  "Exponential and Logarithmic Functions": `
SCOPE
- Key functions: e^x, a^x, log_e(x) = ln(x), log_a(x).
- VCAA formula sheet uses log_e notation; both log_e(x) and ln(x) are acceptable.

LOGARITHM LAWS
- log(ab)  = log(a) + log(b)
- log(a/b) = log(a) − log(b)
- log(aⁿ)  = n·log(a)
- Change of base: log_a(x) = log_e(x) / log_e(a)

SOLVING EXPONENTIAL EQUATIONS
- If a^(f(x)) = a^(g(x)), then f(x) = g(x).
- Convert between bases: a^x = e^(x·log_e(a)).
- To write Ae^(kx) in the form A·b^(cx): set b = e, c = k; or choose b and solve c = k / log_e(b).

DERIVATIVES AND ANTI-DERIVATIVES
- d/dx[e^(ax)] = a·e^(ax)
- d/dx[log_e(x)] = 1/x
- d/dx[a·log_e(bx)] = a/x   (the b cancels — emphasise this to students)
- ∫(1/x) dx = log_e|x| + c;  write log_e(x) + c when x > 0 on the domain.
- Range of h′(x) = a/x is (0, ∞) iff ab > 0; (−∞, 0) iff ab < 0.

DOMAIN RESTRICTIONS
- Domain of log_e(f(x)) requires f(x) > 0 — always determine and state this.
- For equations like log_e(x) = k: solution is x = e^k; check it lies in the domain.

QUESTION DESIGN GUIDANCE
- Include: solving exponential/log equations, finding derivatives, finding anti-derivatives,
  determining domains, converting between exponential forms, and application problems
  (e.g. exponential growth/decay with a given model).
- Exam 1 questions should require exact answers using log/exponential laws without CAS.
- Multi-step questions: set up equation → apply log laws → solve → verify domain.
`,

  "Differentiation": `
SCOPE
- Standard derivatives, product/quotient/chain rules, tangent lines, stationary points,
  gradient tables, second derivative, Newton's method, average rate of change.

STANDARD DERIVATIVES
- d/dx[xⁿ]        = nxⁿ⁻¹
- d/dx[eᵃˣ]       = aeᵃˣ
- d/dx[log_e(x)]  = 1/x
- d/dx[sin(ax)]   = a·cos(ax)
- d/dx[cos(ax)]   = −a·sin(ax)
- d/dx[tan(ax)]   = a·sec²(ax) = a / cos²(ax)

DIFFERENTIATION RULES
- Product rule:  (uv)′ = u′v + uv′
- Chain rule:    dy/dx = (dy/du)(du/dx)
- Quotient rule: (u/v)′ = (u′v − uv′) / v²

STATIONARY POINTS
- Find: solve f′(x) = 0.
- Classify using a gradient table (sign of f′(x) on either side) OR second derivative test.
- Local minimum: f′ changes − to +. Local maximum: f′ changes + to −.
- Stationary point of inflection: f′(x) = 0 AND f′(x) does not change sign.
  Confirm with a gradient table showing values either side.

GRADIENT TABLES
- Columns: x values either side of and at the stationary point.
- Rows: sign of f′(x) (+/−/0) and arrow indicating increasing (↗) or decreasing (↘).

TANGENT AND NORMAL LINES
- Tangent at x = a:  y − f(a) = f′(a)(x − a)
- Normal at x = a:   y − f(a) = −(1/f′(a))(x − a)  [when f′(a) ≠ 0]

RATES OF CHANGE
- Average rate of change over [a, b]: (f(b) − f(a)) / (b − a)  (slope of the secant).
- Instantaneous rate of change at x = a: f′(a).
- Greatest average rate of change = steepest secant over the interval.

NEWTON'S METHOD
- Formula: x_{n+1} = x_n − f(x_n) / f′(x_n)
- Apply exactly the number of iterations specified; show each substitution clearly.

QUESTION DESIGN GUIDANCE
- Include: finding derivatives using rules, classifying stationary points with gradient tables,
  finding tangent/normal equations, applying Newton's method, interpreting rate-of-change
  in context (e.g. velocity, marginal cost).
- Exam 1: answers must be exact — no decimal approximations.
- Multi-part questions should progress: differentiate → find stationary points → classify →
  determine global max/min on a closed interval.
`,

  "Integration": `
SCOPE
- Indefinite integrals (anti-differentiation), definite integrals, area calculations,
  average value, the trapezium rule, and boundary-condition problems.

STANDARD ANTI-DERIVATIVES
- ∫xⁿ dx        = xⁿ⁺¹/(n+1) + c,          n ≠ −1
- ∫eᵃˣ dx       = (1/a)eᵃˣ + c
- ∫(1/x) dx     = log_e(x) + c              (x > 0)
- ∫sin(ax) dx   = −(1/a)cos(ax) + c
- ∫cos(ax) dx   = (1/a)sin(ax) + c
- ∫(ax+b)ⁿ dx   = (ax+b)ⁿ⁺¹ / (a(n+1)) + c,  n ≠ −1

DEFINITE INTEGRALS AND AREA
- ∫_a^b f(x) dx gives the signed area between f and the x-axis.
- Actual (unsigned) area: split at x-intercepts, take |∫| over each sub-interval.
- Area between two curves: ∫_a^b |f(x) − g(x)| dx.
  Identify which function is greater on each sub-interval; split at intersection points.

AVERAGE VALUE
- Average value of f on [a, b]:  (1/(b−a)) · ∫_a^b f(x) dx

TRAPEZIUM RULE
- With n trapeziums over [a, b], width h = (b−a)/n:
  Area ≈ (h/2) [f(x₀) + 2f(x₁) + 2f(x₂) + … + 2f(xₙ₋₁) + f(xₙ)]
- Overestimate when f is concave up on the interval; underestimate when concave down.
- Questions may ask students to determine whether the rule over- or under-estimates.

BOUNDARY CONDITIONS
- Integrate to obtain F(x) = … + c, then substitute the given point (x₀, y₀) to find c.

INEQUALITY REASONING
- If ∫_1^2 f(x) dx > ∫_1^3 f(x) dx, then ∫_2^3 f(x) dx < 0, meaning f is net-negative on [2, 3].
- Use additive property of integrals: ∫_a^c = ∫_a^b + ∫_b^c to reason about signed areas.

QUESTION DESIGN GUIDANCE
- Include: evaluating definite integrals, finding area under/between curves, applying the
  trapezium rule, finding anti-derivatives with boundary conditions, reasoning about
  integral inequalities.
- Exam 1: exact answers required — express in terms of log_e, π, etc. as appropriate.
- Multi-part questions: find intersection points → set up area integral → evaluate.
`,

  "Probability and Statistics": `
SCOPE
- Conditional probability, Bayes-style problems, normal distribution, confidence intervals,
  sample proportions.

CONDITIONAL PROBABILITY
- Pr(A|B) = Pr(A ∩ B) / Pr(B)
- Independence: Pr(A|B) = Pr(A)  ⟺  A and B are independent.
- Mutually exclusive: Pr(A ∩ B) = 0 → Pr(A ∪ B) = Pr(A) + Pr(B).

LAW OF TOTAL PROBABILITY (BAYES-STYLE)
- For two groups (e.g. m walkers, n non-walkers):
  Pr(event | group) × Pr(group) summed over all groups.
  Example: Pr(walked | late) = Pr(late | walked)·Pr(walked) / Pr(late)
                              = (0.2m) / (0.2m + 0.4n) = m / (m + 2n)
- Draw a probability tree to organise two-stage problems before computing.

NORMAL DISTRIBUTION  X ~ N(μ, σ²)
- Exam 2: use CAS (normCdf, invNorm).
- Exam 1: use given probability values, symmetry, and standardisation (Z = (X−μ)/σ).
- Key symmetry: Pr(X > μ) = Pr(X < μ) = 0.5.
- Given Pr(X > a) = p and Pr(X > b) = q, set up simultaneous equations in μ and σ using
  the relationship between a, b, and their z-scores.

CONFIDENCE INTERVALS FOR A PROPORTION
- 95% CI: ( p̂ − 1.96·√(p̂(1−p̂)/n),  p̂ + 1.96·√(p̂(1−p̂)/n) )
- Centre = p̂ = (L + U) / 2;  margin of error = (U − L) / 2.
- Given interval (L, U): recover p̂ and solve for n using 2·1.96·√(p̂(1−p̂)/n) = U − L.
- Round n up to the nearest integer (minimum sample size).

SAMPLE PROPORTION  P̂ = X/n
- E(P̂) = p;   sd(P̂) = √(p(1−p)/n).
- P̂ is approximately normal for large n; use this for probability calculations.

QUESTION DESIGN GUIDANCE
- Include: conditional probability with tables or trees, normal distribution calculations
  (symmetry-based for Exam 1, CAS for Exam 2), confidence interval construction and
  interpretation, and solving for n from a given margin of error.
- Vary context: medical testing, manufacturing defects, survey sampling.
- Exam 1 normal distribution questions must be solvable using symmetry/given values only.
`,

  "Discrete Random Variables": `
SCOPE
- Probability mass functions (pmf), expected value, variance, binomial distribution,
  algorithm tracing for discrete outputs.

PROBABILITY MASS FUNCTION
- p(x) = Pr(X = x) ≥ 0 for all x; Σ p(x) = 1.
- Use the sum-to-1 condition to find unknown parameters (e.g. solve for k in a table).

EXPECTED VALUE AND VARIANCE
- E(X) = μ = Σ x·p(x)
- Var(X) = E(X²) − μ²  =  Σ x²·p(x) − μ²
- sd(X) = √(Var(X))
- Linear transformation: E(aX + b) = aE(X) + b;  Var(aX + b) = a²·Var(X).

BINOMIAL DISTRIBUTION  X ~ Bi(n, p)
- Pr(X = x) = C(n, x) · pˣ · (1−p)ⁿ⁻ˣ
- E(X) = np;   Var(X) = np(1−p).
- For Pr(X ≥ k): compute as 1 − Pr(X ≤ k−1) or sum directly for small n.
- Exam 1: exact fractional answers required. E.g. for X ~ Bi(6, 1/4), express Pr(X=5)+Pr(X=6)
  in the form a/4^6 or a/2^b.

COMPARING DISTRIBUTIONS
- Given two pmf graphs or tables, compute E(X) = Σ x·p(x) for each to compare means.
- Higher variance indicates more spread — verify by computing Var(X) if needed.

ALGORITHM TRACING
- Trace pseudocode (while loops, assignment, print) line by line, tracking all variable values.
- Record a step-by-step table of variable states; identify the printed output exactly.
- Common patterns: counters, accumulators, conditional termination.

QUESTION DESIGN GUIDANCE
- Include: finding unknown parameters, computing E(X) and Var(X), binomial exact probability
  (Exam 1 style), cumulative probability, comparing two distributions, algorithm tracing.
- Exam 1 binomial questions: use small n (≤ 8) so exact arithmetic is feasible.
- Vary context: games of chance, manufacturing inspection, medical trials.
`,

  "Continuous Random Variables": `
SCOPE
- Probability density functions (pdf), expected value, variance, normal distribution,
  piecewise pdfs, transformations of pdfs, non-identical Bernoulli trials.

PROBABILITY DENSITY FUNCTION
- f(x) ≥ 0 for all x, and ∫_{−∞}^{∞} f(x) dx = 1.
- For piecewise pdf: integrate each piece over its domain; sum all pieces to 1 to find unknowns.
  Example: ∫_0^{π/4} k·sin(x) dx + ∫_{π/4}^{π/2} k·cos(x) dx = 1 → solve for k.
- Pr(a < X < b) = ∫_a^b f(x) dx  (note: for continuous RVs, Pr(X = a) = 0).

EXPECTED VALUE AND VARIANCE
- Mean:      μ = ∫_{−∞}^{∞} x·f(x) dx
- Variance:  σ² = ∫_{−∞}^{∞} x²·f(x) dx − μ²
- Standard deviation: σ = √(Var(X))
- Median m: solve ∫_{lower}^{m} f(x) dx = 0.5.

FINDING QUANTILES / PERCENTILES
- To find k such that Pr(X > k) = c: set ∫_k^{upper} f(x) dx = c and solve for k.
- For median and quartiles: set up the appropriate definite integral equal to 0.5 or 0.25.

PDF TRANSFORMATIONS
- For h(x) = m·f(x) + n applied to pdf f(x):
  ∫_a^b h(x) dx = m·∫_a^b f(x) dx + n·(b−a)
- This allows computation of probabilities under a transformed distribution using known integrals.

NORMAL DISTRIBUTION
- Exam 2: use CAS (normCdf, invNorm functions).
- Exam 1: use given probability values and symmetry (no CAS).
  If Pr(X > 200) = 0.325, then Pr(X ≤ 200) = 0.675 — use to set up simultaneous equations in μ and σ.

NON-IDENTICAL BERNOULLI TRIALS
- When p differs across trials, the binomial formula does NOT apply.
- Enumerate all combinations explicitly.
  Example for three lights A, B, C with different p-values:
  Pr(Y = 2) = Pr(A∩B∩C′) + Pr(A∩B′∩C) + Pr(A′∩B∩C)

QUESTION DESIGN GUIDANCE
- Include: finding k in a piecewise pdf, computing E(X) and Var(X) by integration, finding
  medians/quartiles, normal distribution problems (symmetry for Exam 1; CAS for Exam 2),
  pdf transformation integrals, non-identical Bernoulli trial enumeration.
- Exam 1: integrands should be manageable by hand (e.g. polynomials, sin/cos, simple
  exponentials). Avoid integrands requiring non-standard techniques.
- Always state the support of the pdf explicitly in the question.
`,

  // ─────────────────────────────────────────────
  // PHYSICAL EDUCATION
  // ─────────────────────────────────────────────

  "Skill Acquisition: Classification, Stages of Learning, and Practice Scheduling": `
SCOPE
- Skill classification systems, stages of learning, and the design of
  practice schedules to optimise skill acquisition.

SKILL CLASSIFICATION
- Continuity: discrete (defined start/end, e.g. penalty kick), serial (chain of discrete skills,
  e.g. gymnastics routine), continuous (no clear start/end, e.g. swimming).
- Environment: open (unpredictable, externally paced, e.g. basketball pass) vs closed
  (predictable, self-paced, e.g. free throw).
- Muscular involvement: gross (large muscle groups, e.g. sprinting) vs fine (small/precise,
  e.g. archery release).
- Difficulty: always justify classification using BOTH the category name AND its defining
  features — marks are lost for labelling without explanation.

STAGES OF LEARNING
- Cognitive stage: high cognitive demand, frequent errors, inconsistent performance,
  learner relies on verbal/visual guidance. Focus: understanding the task.
- Associative stage: fewer errors, more consistent, self-detection of errors begins,
  practice refines the motor programme. Focus: refinement.
- Autonomous stage: movement is automatic, low cognitive demand, attention freed for
  tactical/environmental cues, highly consistent. Focus: fine-tuning and game application.
- Questions often give a performance description and ask students to identify the stage
  with justification — always link the described behaviour to the defining characteristics.

PRACTICE SCHEDULING
- Massed practice: minimal rest between trials; suits simple/continuous skills and
  motivated learners; risk of fatigue and performance plateau.
- Distributed practice: rest intervals between trials; suits beginners, complex/discrete
  skills, fatiguing tasks, and younger learners.
- Whole practice: skill practised in its entirety; suits simple, low-organisation skills.
- Part practice: skill broken into components; suits serial/complex skills with dangerous
  or difficult sub-components.

QUESTION DESIGN GUIDANCE
- Always anchor classification questions to a specific, named sport skill with enough
  context to justify the classification on all relevant dimensions.
- Stage identification questions should present a short scenario (e.g. coach observation
  notes) and ask for the stage plus two pieces of supporting evidence from the scenario.
- Practice schedule questions should ask students to recommend AND justify a schedule
  for a described learner/skill, linking learner characteristics to schedule advantages.
- Vary difficulty: single-classification → multi-classification → compare two athletes
  at different stages → design a practice plan with rationale.
`,

  "Coaching and Feedback: Theories of Acquisition and Psychological Strategies": `
SCOPE
- Theories of skill acquisition, types and timing of feedback, observational learning,
  arousal/anxiety management, and psychological strategies for performance.

FEEDBACK TYPES
- Intrinsic: sensory feedback from the movement itself (proprioception,
  vision, audition). Always available; forms the basis for error detection at the
  autonomous stage.
- Extrinsic (augmented): provided externally by a coach, video, or timing device.
  - Knowledge of Results (KR): information about the outcome (e.g. "your shot landed
    2 m left of the target"). Withdrawn as learner becomes autonomous.
  - Knowledge of Performance (KP): information about the movement pattern/technique
    (e.g. "your elbow dropped on release"). More useful at cognitive/associative stages.
- Timing: concurrent (during movement), terminal (immediately after), delayed, summary
  (after a set of trials), bandwidth (only when error exceeds a threshold).
- Fading feedback: gradually reduce extrinsic feedback frequency to promote
  intrinsic error-detection and avoid feedback dependency.

AROUSAL, ANXIETY, AND PSYCHOLOGICAL STRATEGIES
- Inverted-U Hypothesis: optimal arousal at a moderate level; too low →
  under-arousal; too high → over-arousal and performance decrement. Optimal level
  varies by skill complexity and individual.
- Psychological strategies:
  - Relaxation: progressive muscular relaxation (PMR), deep breathing (reduces somatic anxiety).
  - Activation: energising self-talk, music, dynamic warm-up (raises arousal).
  - Imagery / mental rehearsal: cognitive rehearsal of skill execution; activates motor
    pathways without physical fatigue.
  - Self-talk: instructional (cue words for technique) or motivational (confidence building).
  - Goal setting: SMART goals; process → performance → outcome hierarchy.
  - Pre-performance routines: standardise arousal and attention before execution.
  - Music: can be used to regulate arousal, enhance mood, and improve focus during practice or pre-competition.

QUESTION DESIGN GUIDANCE
- Theory questions should require students to apply a named theory to a described
  scenario — not merely define the theory.
- Feedback questions should present a coaching scenario and ask students to identify
  the feedback type and justify its appropriateness for the learner's stage.
- Arousal questions should specify the skill complexity and athlete's current state,
  then ask for an appropriate strategy with justification linking theory to outcome.
- Multi-part questions: identify the theory → explain the mechanism → recommend an
  intervention → justify using theoretical language.
`,

  "Applied Biomechanics: Newton's Laws, Projectile Motion, and Levers": `
SCOPE
- Newton's three laws applied to sport, force summation, projectile motion variables, and lever systems
  in the human body and sport equipment.

NEWTON'S LAWS
- First Law (Inertia): a body remains at rest or in uniform motion unless acted on by
  a net external force. Apply to: starting blocks, stationary ball, follow-through.
- Second Law (Acceleration): F = ma. Net force produces acceleration in the direction
  of the force; greater mass requires greater force for the same acceleration.
  Apply to: sprint starts, tackling, throwing velocity.
- Third Law (Action–Reaction): for every action force there is an equal and opposite
  reaction force. Apply to: ground reaction force in running, swimming push-off,
  jumping. Note: forces act on DIFFERENT objects — clarify both objects involved.
- Questions require students to name the law AND explain it in the specific context
  provided; generic definitions without application receive no marks.

FORCE SUMMATION
- Sequential summation: forces generated in a sequence from larger to smaller body
  segments (e.g. legs → torso → arm → hand) to maximise velocity at the end.
- Simultaneous summation: all relevant body segments generate force at the same time
  (e.g. shot put, weightlifting).
- Optimal sequencing and timing of force application is crucial for performance.
- Questions may ask students to identify the type of force summation and explain its
  importance in a given sport skill.

PROJECTILE MOTION
- Factors affecting horizontal distance (range): angle of release, speed of release,
  height of release.
- Optimal angle for maximum range on flat ground: 45°. Modified by release height —
  if released above landing height, optimal angle < 45°.
- Horizontal velocity: constant throughout flight (no air resistance assumed in VCAA).
- Vertical velocity: affected by gravity (9.8 m/s² downward); zero at peak of flight.
- Increase range: increase release speed (most significant), optimise release angle,
  increase release height.
- Sport applications: shot put, long jump, basketball shot, javelin.

LEVER SYSTEMS
- Components: fulcrum (F/axis), effort (E/force), resistance/load (R/weight).
- First-class lever: F between E and R (e.g. head nodding, seesaw, tricep extension).
  Mechanical advantage can be > or < 1 depending on relative distances.
- Second-class lever: R between F and E (e.g. calf raise, wheelbarrow). Always
  mechanical advantage > 1 (force advantage); limited range of motion.
- Third-class lever: E between F and R (most common in human body, e.g. bicep curl,
  kicking). Mechanical advantage < 1 (speed/range of motion advantage).
- Mechanical advantage (MA) = effort arm / resistance arm.
  MA > 1: force advantage; MA < 1: speed/range advantage.
- Questions may provide a diagram and ask students to: identify lever class, label
  components, calculate MA, or explain trade-off between force and speed.

QUESTION DESIGN GUIDANCE
- Newton's Law questions must embed the law in a described sporting movement —
  never ask for isolated definitions. Require students to identify the law AND explain
  the relevant force(s) acting on a named object.
- Projectile questions should specify a sport context and ask students to explain
  the effect of changing one variable (e.g. "how does increasing release height affect
  range?") with reference to the underlying principle.
- Lever questions should include a labelled diagram or description; ask for class
  identification, component labelling, MA calculation, and advantage/disadvantage.
- Avoid purely definitional questions — all questions must require application to sport.
`,

  "Movement Analysis: Qualitative Analysis and Equilibrium in Sport": `
SCOPE
- Qualitative analysis framework (preparation, observation, evaluation, intervention),
  planes and axes of movement, and static/dynamic equilibrium in sport.

QUALITATIVE ANALYSIS FRAMEWORK
- Four phases (VCAA): Preparation → Observation → Evaluation → Intervention.
  - Preparation: identify critical features of the skill; establish observation position
    and viewing angle; determine evaluation criteria.
  - Observation: systematically watch the performance; use multiple angles/speeds if
    possible; focus on one component per viewing.
  - Evaluation: compare observed performance to the ideal/critical features; identify
    errors (root cause, not just symptom).
  - Intervention: provide specific, actionable feedback or practice task to correct
    the identified error. Link directly to the evaluation finding.
- Questions may give a coach scenario and ask which phase is being performed, or ask
  students to apply the full framework to a described movement.

PLANES AND AXES OF MOVEMENT
- Sagittal plane / frontal (mediolateral) axis: forward/backward movements
  (e.g. running, squat, bicep curl, somersault).
- Frontal (coronal) plane / sagittal (anteroposterior) axis: side-to-side movements
  (e.g. cartwheel, lateral raise, jumping jack).
- Transverse plane / vertical (longitudinal) axis: rotational movements
  (e.g. discus throw, pirouette, golf swing).
- Questions provide a movement and ask for the plane AND axis — both must be correct
  for full marks. Justify by describing the direction of the movement.

STATIC AND DYNAMIC EQUILIBRIUM
- Static equilibrium: body at rest; sum of all forces and torques = 0.
- Dynamic equilibrium: body in constant-velocity motion; net force = 0.
- Stability is determined by:
  - Base of support (BOS): larger BOS → greater stability.
  - Centre of gravity (COG) height: lower COG → greater stability.
  - Position of COG over BOS: COG must be within BOS for stability; the closer to the
    centre of BOS, the more stable.
  - Body mass: greater mass → greater stability (more force needed to displace).
- Sport applications: wrestling stance (wide BOS, low COG for stability), sprint start
  (narrow BOS, COG near edge of BOS for rapid initiation of movement/instability).
- Questions ask students to compare two positions or athletes using ≥ 2 stability factors.

QUESTION DESIGN GUIDANCE
- Qualitative analysis questions should provide a brief video description or written
  skill observation and ask students to complete one phase in detail (e.g. "write an
  intervention for the identified error").
- Planes/axes questions should name a specific joint action or whole-body movement and
  require both plane AND axis — never accept one without the other.
- Equilibrium questions should present two contrasting sporting positions and ask
  students to compare their stability, referencing at least two factors with justification.
- Multi-part: observe a movement error → identify the critical feature violated →
  name the plane/axis → recommend a corrective drill.
`,

  "Energy System Interplay: ATP-CP, Anaerobic Glycolysis, and Aerobic Systems": `
SCOPE
- Structure and function of the three energy systems, their interplay during exercise,
  and application to sport performance analysis.

ATP AND ENERGY CURRENCY
- ATP (adenosine triphosphate) is the only direct fuel for muscular contraction.
  ATP → ADP + Pᵢ + energy (for muscle contraction).
- ADP is recycled back to ATP via three energy pathways; the dominant pathway depends
  on exercise intensity and duration.

ATP–CP SYSTEM (PHOSPHOCREATINE / ALACTIC ANAEROBIC)
- Fuel: phosphocreatine (PC) stored in muscle.
- Reaction: PC + ADP → ATP + creatine (creatine kinase enzyme).
- Duration: ~0–10 seconds at maximal intensity.
- ATP yield: 1 ATP per PC molecule; very limited stores (~10 s).
- Oxygen required: NO (anaerobic).
- By-product: none (alactic — no lactic acid produced).
- Recovery: PC resynthesised within ~2–3 minutes of rest (50% in ~30 s).
- Sport examples: 100 m sprint start, shot put, maximal jump.

ANAEROBIC GLYCOLYSIS (LACTIC ACID SYSTEM)
- Fuel: muscle glycogen (glucose).
- Reaction: glucose → pyruvate → lactic acid (in absence of sufficient O₂).
- Duration: ~10 seconds to ~2–3 minutes at high intensity.
- ATP yield: 2 ATP per glucose (net); fast rate of production.
- Oxygen required: NO.
- By-product: lactic acid → dissociates to lactate + H⁺; H⁺ accumulation causes
  acidosis, inhibits enzyme activity and cross-bridge formation → fatigue.
- Recovery: lactate cleared via oxidation (aerobic), gluconeogenesis, and Cori cycle.
- Sport examples: 400 m sprint, repeated high-intensity bursts in team sports.

AEROBIC SYSTEM (OXIDATIVE PHOSPHORYLATION)
- Fuel: glycogen (glucose), fats (triglycerides/free fatty acids), protein (minor).
- Stages: Glycolysis → Pyruvate → Acetyl-CoA → Krebs cycle → Electron Transport Chain (ETC).
- ATP yield: ~36–38 ATP per glucose; high yield but slow rate.
- Oxygen required: YES — O₂ is final electron acceptor in ETC.
- By-products: CO₂ (exhaled), H₂O (sweat/breath).
- Fat oxidation (beta-oxidation): higher yield per molecule but requires more O₂ and
  is slower than carbohydrate oxidation; predominates at low–moderate intensity.
- Sport examples: marathon, long-distance cycling, prolonged team sport activity.

ENERGY SYSTEM INTERPLAY
- All three systems operate simultaneously; dominance shifts with intensity and duration.
- Intensity continuum: ATP-CP (maximal, brief) → Anaerobic Glycolysis (high intensity,
  1–3 min) → Aerobic (moderate–low intensity, >3 min).
- Crossover point: as duration increases, aerobic contribution rises; as intensity
  increases, anaerobic contribution rises.
- Work:rest ratio determines recovery and which system is stressed in training.
- Questions often present an activity/sport and ask which system(s) dominate and why.

QUESTION DESIGN GUIDANCE
- Always anchor energy system questions to a specific sporting context (e.g. a named
  sport or described activity bout) — require students to justify system dominance using
  intensity, duration, and oxygen availability.
- Include questions on: ATP resynthesis reactions, by-product identification, ATP yield
  comparison, fatigue mechanisms, and recovery time for each system.
- Interplay questions should describe a changing game situation (e.g. a soccer player
  over 90 minutes) and ask students to explain how system dominance shifts.
- Multi-part: identify dominant system → explain the resynthesis reaction → identify
  the fatigue mechanism → describe the recovery process.
`,

  "Cardiorespiratory Dynamics: Oxygen Uptake, EPOC, and VO2 Max/LIP": `
SCOPE
- Oxygen uptake kinetics, excess post-exercise oxygen consumption (EPOC), VO₂ max,
  and the lactate inflection point (LIP) and their role in performance.

OXYGEN UPTAKE DURING EXERCISE
- At exercise onset: O₂ uptake rises rapidly but cannot immediately meet demand →
  oxygen deficit is incurred (anaerobic systems fill the gap).
- Steady state: O₂ uptake plateaus to meet energy demands aerobically (submaximal exercise).
- Oxygen deficit = difference between O₂ required and O₂ consumed during early exercise.
- Fitter athletes reach steady state faster and with a smaller O₂ deficit.

EPOC (EXCESS POST-EXERCISE OXYGEN CONSUMPTION)
- Definition: elevated O₂ consumption above resting levels in recovery — the "oxygen debt."
- Fast component (alactic): O₂ used to resynthesize ATP and PC stores, restore O₂ bound
  to myoglobin/haemoglobin; occurs in first ~2–3 minutes of recovery.
- Slow component (lactic): O₂ used to clear lactate, restore body temperature, support
  elevated heart rate/ventilation, re-establish hormonal balance; lasts up to several hours.
- EPOC is greater after: high-intensity exercise, interval training, longer duration exercise.
- Practical use: EPOC explains elevated caloric expenditure post-exercise.

VO₂ MAX (MAXIMAL OXYGEN UPTAKE)
- Definition: the maximum rate at which the body can consume oxygen during exhaustive
  exercise; measured in mL/kg/min (relative) or L/min (absolute).
- Limiting factors: cardiac output (stroke volume × heart rate), haemoglobin concentration,
  muscle mitochondrial density, capillary density, oxygen extraction (a-vO₂ difference).
- Training adaptations that increase VO₂ max: increased stroke volume (cardiac hypertrophy),
  increased capillarisation, increased mitochondrial density, increased blood volume.
- Higher VO₂ max → greater aerobic capacity → better endurance performance.
- VO₂ max is largely genetically determined but trainable (especially in untrained individuals).

LACTATE INFLECTION POINT (LIP) / LACTATE THRESHOLD
- Definition: the exercise intensity at which blood lactate begins to accumulate
  exponentially — the point at which lactate production exceeds clearance.
- Below LIP: aerobic system meets demand; lactate is produced and cleared in balance.
- Above LIP: anaerobic glycolysis increasingly dominant; lactate accumulates → fatigue.
- LIP expressed as: % of VO₂ max, heart rate, or running/cycling speed.
- Training can shift LIP to a higher % of VO₂ max → athlete can sustain higher intensity
  before fatigue.
- LIP is a better predictor of endurance performance than VO₂ max alone.
- Test: incremental exercise test with blood lactate sampling at each stage; LIP identified
  as the inflection point on a lactate-vs-intensity graph.

RELATIONSHIP BETWEEN VO₂ MAX AND LIP
- Two athletes with the same VO₂ max may have different LIPs → the one with the higher
  LIP (as % VO₂ max) can sustain higher intensities aerobically.
- Elite endurance training raises both VO₂ max and LIP.

QUESTION DESIGN GUIDANCE
- Oxygen kinetics questions should ask students to sketch or interpret an O₂ uptake curve,
  labelling: oxygen deficit, steady state, and EPOC components.
- EPOC questions should require students to explain BOTH fast and slow components with
  specific physiological processes — not just "repaying the oxygen debt."
- VO₂ max questions should ask students to explain a limiting factor AND an adaptation
  that improves it, linking the physiological mechanism to performance outcome.
- LIP questions should use a graph interpretation format: identify the LIP, explain what
  happens above it, and justify why training shifts the LIP rightward.
- Comparison questions: given two athlete profiles (different VO₂ max and LIP), ask which
  athlete would perform better in a specific event and justify with both values.
`,

  "Physiological Responses: Acute Responses and Fatigue Mechanisms": `
SCOPE
- Acute physiological responses to exercise across cardiovascular, respiratory, and
  muscular systems, and the mechanisms of fatigue.

ACUTE CARDIOVASCULAR RESPONSES
- Heart rate (HR): increases proportionally with exercise intensity; anticipatory rise
  (adrenaline) before exercise begins.
- Stroke volume (SV): increases with intensity up to ~40–60% VO₂ max (due to increased
  venous return and Frank–Starling mechanism), then plateaus or slightly decreases at
  maximal effort.
- Cardiac output (Q): Q = HR × SV; increases linearly with intensity to meet demand.
- Blood pressure: systolic BP rises with intensity; diastolic remains relatively stable.
- Blood redistribution (vascular shunting): vasoconstriction in non-active organs;
  vasodilation in working muscles → up to 80–85% of cardiac output to muscles at max effort.
- Venous return mechanisms: muscle pump, respiratory pump, venoconstriction, gravity.

ACUTE RESPIRATORY RESPONSES
- Ventilation (V̇E): increases rapidly at exercise onset; driven by neural (central command)
  and chemical (CO₂, H⁺, O₂) stimuli.
- Tidal volume and respiratory rate both increase; tidal volume increases first.
- Ventilatory threshold: marked increase in V̇E coincides with LIP — excess CO₂ from
  bicarbonate buffering of lactic acid drives hyperventilation.
- O₂ extraction: arteriovenous O₂ difference (a-vO₂ diff) increases during exercise.

ACUTE MUSCULAR / METABOLIC RESPONSES
- Increased muscle temperature: improves enzyme activity, O₂ dissociation (Bohr effect),
  nerve conduction velocity.
- Increased myoglobin utilisation: releases stored O₂ to mitochondria.
- Metabolite accumulation: CO₂, H⁺, Pi, ADP increase — stimulate further increases in
  ventilation and blood flow.

FATIGUE MECHANISMS
- Peripheral fatigue (within the muscle):
  - H⁺ accumulation: inhibits phosphofructokinase (PFK), impairs cross-bridge cycling,
    reduces force production. Primary fatigue mechanism in high-intensity exercise.
  - Pi accumulation: inhibits myosin ATPase and reduces Ca²⁺ sensitivity of contractile proteins.
  - PC depletion: limits ATP resynthesis via the ATP-CP system.
  - Glycogen depletion: limits carbohydrate fuel for both anaerobic glycolysis and aerobic
    system; predominant in prolonged moderate–high intensity exercise.
- Central fatigue (CNS):
  - Reduced neural drive from motor cortex to working muscles.
  - Serotonin hypothesis: elevated serotonin during prolonged exercise may inhibit arousal
    and motor drive.
- Thermoregulatory fatigue: core temperature elevation (>39–40°C) impairs CNS function
  and cardiovascular efficiency; relevant in heat stress.

QUESTION DESIGN GUIDANCE
- Acute response questions should describe a specific exercise bout (intensity, duration,
  modality) and ask students to explain how one system (cardiovascular, respiratory, or
  muscular) responds, with reference to the underlying mechanism.
- Fatigue mechanism questions should specify whether the exercise is high-intensity and
  brief (H⁺/PC depletion focus) or prolonged moderate (glycogen depletion/central fatigue).
- Avoid asking students to list responses — require explanation of the mechanism and
  its functional significance.
- Multi-part: describe the acute cardiovascular response → explain the mechanism →
  link the response to performance outcome (e.g. O₂ delivery to muscles).
`,

  "Recovery and Nutrition: Hydration and Nutritional Strategies for Homeostasis": `
SCOPE
- Post-exercise recovery strategies, hydration for performance and recovery, and
  nutritional strategies to maintain homeostasis and support training adaptations.

RECOVERY STRATEGIES
- Active recovery (cool-down): low-intensity aerobic activity post-exercise; maintains
  elevated blood flow to assist lactate clearance, reduces muscle stiffness.
  Mechanism: continued muscle pump action maintains venous return; oxidative clearance
  of lactate continues while intensity is low enough to sustain aerobic metabolism.
- Passive recovery: rest; appropriate for lower-intensity exercise or when active
  recovery is not feasible.
- Ice baths (cold water immersion): vasoconstriction reduces inflammation and muscle
  damage; on rewarming, reactive vasodilation may flush metabolic waste.
- Compression garments: increase venous return, reduce oedema and delayed onset muscle
  soreness (DOMS).
- Massage: promotes blood/lymphatic flow, reduces muscle tension, psychological benefit.
- Sleep: primary period for GH secretion (anabolic), protein synthesis, and CNS recovery.

HYDRATION
- Water is essential for: thermoregulation (sweat), transport of nutrients/metabolites,
  joint lubrication, maintenance of blood volume/plasma volume.
- Dehydration effects on performance: reduced plasma volume → decreased cardiac output
  and stroke volume → elevated HR at same workload → impaired thermoregulation →
  performance decline as little as 2% body mass loss.
- Electrolytes (Na⁺, K⁺, Cl⁻): lost in sweat; Na⁺ loss most significant; important for
  fluid balance (osmolality), nerve conduction, and muscle contraction.
- Rehydration strategies: replace fluid + electrolytes post-exercise; sports drinks
  (carbohydrate + electrolyte solutions) superior to water alone for >60 min exercise.
- Hyperhydration risk: hyponatraemia (low serum Na⁺) from excessive plain water intake —
  relevant for ultra-endurance events.

NUTRITIONAL STRATEGIES
- Carbohydrate: primary fuel for moderate–high intensity exercise; stored as glycogen
  (muscle and liver). Carbohydrate loading (glycogen supercompensation): reduce training
  + increase CHO intake in days before an endurance event to maximise glycogen stores.
- Pre-exercise: high-CHO, low-fat/fibre meal 2–4 h before; small CHO snack 30–60 min
  before if tolerated.
- During exercise (>60–90 min): 30–60 g CHO/hour (gels, sports drinks, banana) to spare
  glycogen and maintain blood glucose.
- Post-exercise (recovery window ~30–60 min): CHO to replenish glycogen + protein for
  muscle repair (ratio ~3:1 or 4:1 CHO:protein).
- Protein: required for muscle protein synthesis (MPS) and repair of exercise-induced
  damage. Post-exercise protein (20–40 g) stimulates MPS; leucine-rich sources preferred.
- Fat: fuel at low intensity; not a limiting factor for performance in most sport contexts.
- Micronutrients: iron (O₂ transport via haemoglobin), calcium (bone health, muscle
  contraction), vitamin D (calcium absorption, immune function).

QUESTION DESIGN GUIDANCE
- Recovery questions should specify an exercise type (e.g. high-intensity team sport)
  and ask students to justify the most appropriate recovery strategy, linking the
  physiological mechanism to the recovery need.
- Hydration questions should describe a performance decrement and ask students to
  explain the physiological chain from dehydration to the observed effect.
- Nutrition questions should ask students to design a pre/during/post nutrition plan for
  a described athlete and event, justifying each component with reference to energy
  systems and physiology.
- Multi-part: identify the physiological challenge → recommend a strategy → explain the
  mechanism → predict the performance outcome if the strategy is neglected.
`,

  "Training Foundation: Activity Analysis, Fitness Components, and Testing": `
SCOPE
- Activity analysis of sports, health-related and skill-related fitness components,
  and fitness testing protocols and their validity.

ACTIVITY ANALYSIS
- Purpose: determine the physiological and biomechanical demands of a sport to design
  specific training programs.
- Components analysed: dominant energy systems (intensity/duration of efforts), movement
  patterns (planes, muscle groups), work:rest ratios, fitness components required,
  positional/role demands within the sport.
- Method: time-motion analysis, heart rate monitoring, GPS/accelerometry, video analysis.
- Output: an activity profile that informs training specificity (SAID principle —
  Specific Adaptations to Imposed Demands).
- Questions provide a sport description and ask students to analyse its demands across
  energy systems and fitness components.

FITNESS COMPONENTS
- Health-related:
  - Cardiovascular endurance (aerobic capacity): ability to sustain aerobic activity
    over time; measured by VO₂ max test, beep test, 12-minute Cooper run.
  - Muscular strength: maximum force produced in a single effort; 1RM test.
  - Muscular endurance: ability to sustain repeated submaximal contractions; push-up test.
  - Flexibility: range of motion at a joint; sit-and-reach test.
  - Body composition: ratio of fat to lean mass; skinfold calipers, BMI (limited validity).
- Skill-related:
  - Power: force × velocity; explosive force production; vertical jump, standing broad jump.
  - Speed: distance/time over a short maximal effort; 40 m sprint.
  - Agility: ability to change direction rapidly; Illinois agility test, 5-0-5 test.
  - Coordination: smooth integration of body segments; juggling test (limited in sport context).
  - Reaction time: time from stimulus to initiation of movement; ruler-drop test.
  - Balance: maintaining equilibrium (static or dynamic); stork stand test.

FITNESS TESTING
- Validity: does the test measure what it claims to measure? (e.g. beep test has high
  validity for team sport aerobic fitness; treadmill VO₂ max test is the gold standard.)
- Reliability: does the test produce consistent results under the same conditions?
  (standardisation of warm-up, equipment, environment, administrator).
- Specificity: does the test reflect the demands of the sport? (sport-specific tests
  have greater ecological validity).
- Normative data: compare athlete scores to age/sex-matched population norms.
- Test selection: match the test to the fitness component, the sport, and the athlete's
  training phase.
- Common tests and their limitations: beep test (requires motivation; assumes constant
  acceleration), sit-and-reach (only measures hamstring/lower back flexibility), BMI
  (does not distinguish fat from muscle mass).

QUESTION DESIGN GUIDANCE
- Activity analysis questions should present a specific sport/position and ask students
  to identify: dominant energy systems (with time-motion justification), top 3 fitness
  components, and appropriate fitness tests.
- Fitness component questions should require students to define the component AND justify
  its importance to a named sport using activity analysis reasoning.
- Testing questions should ask students to evaluate a test's validity and reliability for
  a specific athlete/sport, or select the most appropriate test from a choice with justification.
- Multi-part: analyse the sport → identify the key fitness component → select a test →
  explain why the test is valid and reliable for this context.
`,

  "Program Design: Training Principles, Methods, and Chronic Adaptations": `
SCOPE
- Principles of training, training methods and their energy system/fitness targets,
  and chronic physiological adaptations from systematic training.

PRINCIPLES OF TRAINING
- Specificity (SAID): adaptations are specific to the type, intensity, and muscles used
  in training. Training must replicate sport demands.
- Overload: training stimulus must exceed habitual levels to drive adaptation.
  Achieved by manipulating: Frequency, Intensity, Time/Duration, Type (FITT).
- Progression: overload must increase progressively as fitness improves — avoid plateau.
- Reversibility (detraining): adaptations are lost when training stimulus is removed;
  cardiovascular adaptations lost faster than strength adaptations.
- Variety: prevents staleness, overuse injury, and psychological burnout; addresses
  multiple fitness components.
- Recovery (rest): required for supercompensation — adaptations occur during recovery,
  not during training.
- Warm-up and cool-down: prepare the body for exercise; facilitate recovery and injury prevention.

TRAINING METHODS
- Continuous training: sustained aerobic exercise at constant moderate intensity (60–80% HR max).
  Develops: aerobic base, cardiovascular endurance. Suitable for beginners and endurance athletes.
- Fartlek training: unstructured variation of intensity within a continuous run; blends
  aerobic and anaerobic systems. Sport-specific due to random intensity changes.
- Interval training: alternating work and rest bouts; highly adaptable.
  - Aerobic intervals (long work, short rest): develop VO₂ max and LIP.
  - Anaerobic intervals (short work, long rest, high intensity): develop ATP-CP and
    anaerobic glycolysis; increase power and speed.
  - Work:rest ratio determines which energy system is stressed.
- Circuit training: series of exercises at stations targeting different muscle groups
  or fitness components; can combine strength and cardiovascular endurance.
- Resistance/strength training: uses progressive overload with external resistance;
  develops muscular strength, power, or endurance depending on load/rep scheme.
  - High load, low reps (1–6): maximal strength.
  - Moderate load, moderate reps (8–12): hypertrophy.
  - Low load, high reps (15+): muscular endurance.
- Plyometrics: rapid stretch-shortening cycle; develops power via elastic energy
  storage (e.g. depth jumps, bounding). High injury risk — requires strength base.
- Flexibility training: static stretching (hold 30–60 s), dynamic stretching
  (sport-specific movement), PNF (proprioceptive neuromuscular facilitation — most effective
  for increasing ROM but requires a partner).

CHRONIC ADAPTATIONS
- Cardiovascular: cardiac hypertrophy (increased left ventricular volume and wall thickness),
  increased stroke volume, decreased resting HR (bradycardia), increased blood volume,
  increased capillary density, increased a-vO₂ difference.
- Respiratory: increased tidal volume, increased lung diffusion capacity, delayed
  ventilatory threshold (LIP shifts right).
- Muscular (aerobic training): increased mitochondrial density, increased myoglobin
  concentration, increased oxidative enzyme activity, increased fat oxidation capacity.
- Muscular (resistance training): increased cross-sectional area (hypertrophy),
  increased motor unit recruitment, increased neural drive, increased connective tissue
  strength, increased bone density.
- Metabolic: increased glycogen storage capacity, increased PC stores, reduced resting
  HR and blood pressure.

QUESTION DESIGN GUIDANCE
- Principle questions should present a training scenario (e.g. an athlete who has not
  progressed for 6 weeks) and ask students to identify the violated principle with justification.
- Method selection questions should specify an athlete profile (sport, training phase,
  goal) and ask students to recommend and justify two training methods.
- Adaptation questions should ask students to explain a specific chronic adaptation
  (e.g. increased stroke volume), including the mechanism and its effect on performance.
- Program design questions: provide an athlete profile → analyse activity demands →
  select appropriate training methods → apply FITT principles → predict adaptations.
- Multi-part questions should integrate: principle identification → method selection →
  physiological justification → predicted performance outcome.
`,

};

export type Topic =
  | "Mathematical Methods"
  | "Specialist Mathematics"
  | "Chemistry"
  | "Physical Education";

export type GeneratedQuestion = {
  id: string;
  topic: string;
  subtopic?: string;
  promptMarkdown: string;
  maxMarks: number;
  techAllowed?: boolean;
  distinctnessScore?: number;
  multiStepDepth?: number;
};

export type GenerationTelemetry = {
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  distinctnessAvg?: number;
  multiStepDepthAvg?: number;
};

export type GenerationStatusStage =
  | "preparing"
  | "generating"
  | "parsing"
  | "completed"
  | "failed";

export type GenerationStatusEvent = {
  mode: QuestionMode;
  stage: GenerationStatusStage;
  message: string;
  attempt: number;
  // Fields present only in the "completed" event:
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCostUsd?: number;
  durationMs?: number;
};

/** Fired for every SSE token chunk during streaming generation. */
export type GenerationTokenEvent = {
  text: string;
};

export type GenerateQuestionsResponse = {
  questions: GeneratedQuestion[];
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  distinctnessAvg?: number;
  multiStepDepthAvg?: number;
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
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  distinctnessAvg?: number;
  multiStepDepthAvg?: number;
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
  markingModel: string;
  useSeparateMarkingModel: boolean;
  imageMarkingModel: string;
  useSeparateImageMarkingModel: boolean;
  debugMode: boolean;
  questionTextSize?: number;
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
  questionCount: number;
  maxMarksPerQuestion: number;
  questionMode: QuestionMode;
  subtopicInstructions: Record<string, string>;
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
  mcSession?: PersistedMcSession;
};

export type PersistedAppState = {
  version: number;
  settings: PersistedSettings;
  preferences: PersistedGeneratorPreferences;
  writtenSession: PersistedWrittenSession;
  mcSession: PersistedMcSession;
  questionHistory: QuestionHistoryEntry[];
  mcHistory: McHistoryEntry[];
  savedSets: SavedQuestionSet[];
};