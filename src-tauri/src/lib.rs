use base64::{Engine as _, engine::general_purpose};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use std::fs;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

const OPENROUTER_CHAT_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MAX_TOKENS: u16 = 1400;
const GENERATION_REPAIR_RETRIES: usize = 1;
const MATHEMATICAL_METHODS_TOPIC: &str = "Mathematical Methods";
const PHYSICAL_EDUCATION_TOPIC: &str = "Physical Education";
const CHEMISTRY_TOPIC: &str = "Chemistry";
const ENGLISH_LANGUAGE_TOPIC: &str = "English Language";
const APP_STATE_FILE_NAME: &str = "app-state.json";
const MATHEMATICAL_METHODS_REFERENCE_GUIDANCE: &str = " Use a compact Mathematical Methods exam style: concise VCAA-style command verbs, realistic mark allocations, algebraic fluency, and prompts that reward method choice over template recall.";
const PHYSICAL_EDUCATION_REFERENCE_GUIDANCE: &str = " Restrict Physical Education to Unit 3/4 and use short applied sport/training scenarios that reward data interpretation, justification, and evidence-based reasoning. For biomechanics, avoid focus on pure physics calculations and instead emphasize application of concepts to novel contexts, as in VCE calculations are not examined.";
const CHEMICAL_FORMULA_LATEX_GUIDANCE: &str = " For Chemistry content, always render every chemical formula and ionic species in LaTeX math delimiters, e.g. $H_2O$, $CO_2$, $Fe^{3+}$, $SO_4^{2-}$.";
const ENGLISH_LANGUAGE_REFERENCE_GUIDANCE: &str = " For English Language, produce SAC-style written tasks using VCE English Language conventions: explicit metalanguage, evidence-based analysis, and context-sensitive argumentation aligned to the selected Unit and Area of Study.";
const WRITTEN_QUESTION_JSON_CONTRACT: &str = "{\"questions\":[{\"id\":\"q1\",\"topic\":\"...\",\"subtopic\":\"...\",\"taskType\":\"short-answer|analytical-essay\",\"recommendedResponseLength\":\"short|extended\",\"promptMarkdown\":\"...\",\"maxMarks\":10,\"techAllowed\":false}]}";
const PASSAGE_JSON_CONTRACT: &str = "{\"passage\":{\"id\":\"p1\",\"text\":\"...\",\"aosSubtopic\":\"Unit 1 AOS 1: Nature and Functions of Language\",\"questions\":[{\"id\":\"pq1\",\"promptMarkdown\":\"Identify two modal verbs from lines 3-5.\",\"maxMarks\":2}]}}";
const LATEX_FORMATTING_RULES: &str = " LaTeX rules (mandatory, no exceptions): \
(1) Every mathematical expression — including single variables ($x$), isolated numbers used in algebra ($3$), exponents ($n$), and inequalities — must be wrapped in delimiters. \
(2) Inline math: $...$ — use within a sentence, e.g. the gradient is $\\frac{dy}{dx}$. \
(3) Display/block math: $$...$$ — use for standalone equations on their own line, e.g. $$\\int_0^\\pi \\sin x\\,dx = 2$$. \
(4) NEVER use \\(...\\) or \\[...\\] as math delimiters. \
(5) Every subscript ($x_1$), superscript ($x^2$), fraction ($\\frac{a}{b}$), radical ($\\sqrt{x}$), Greek letter ($\\alpha$, $\\beta$, $\\theta$), vector ($\\vec{v}$), and operator ($\\times$, $\\pm$, $\\leq$) must be inside delimiters. \
(6) Multi-line or matrix expressions must use display math: $$\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}$$. \
(7) Chemistry: every chemical formula and ionic species must be in math delimiters: $\\text{H}_2\\text{O}$, $\\text{CO}_2$, $\\text{Fe}^{3+}$, $\\text{SO}_4^{2-}$.";
const MC_QUESTION_JSON_CONTRACT: &str = "{\"questions\":[{\"id\":\"mc1\",\"topic\":\"...\",\"subtopic\":\"...\",\"promptMarkdown\":\"...\",\"options\":[{\"label\":\"A\",\"text\":\"...\"},{\"label\":\"B\",\"text\":\"...\"},{\"label\":\"C\",\"text\":\"...\"},{\"label\":\"D\",\"text\":\"...\"}],\"correctAnswer\":\"A\",\"explanationMarkdown\":\"...\",\"techAllowed\":false}]}";
const MARK_ANSWER_JSON_CONTRACT: &str = "{\"verdict\":\"Correct|Partially Correct|Incorrect\",\"achievedMarks\":6,\"maxMarks\":10,\"scoreOutOf10\":8,\"vcaaMarkingScheme\":[{\"criterion\":\"...\",\"achievedMarks\":2,\"maxMarks\":3,\"rationale\":\"...\"}],\"comparisonToSolutionMarkdown\":\"...\",\"feedbackMarkdown\":\"...\",\"workedSolutionMarkdown\":\"...\"}";
const MC_EXPLANATION_MAX_WORDS: usize = 90;
const PASSAGE_MIN_LINES: usize = 10;
const PASSAGE_MAX_LINES: usize = 28;
const PASSAGE_MAX_WORDS_PER_LINE: usize = 24;
const PASSAGE_TEXT_TYPE_OPTIONS: [&str; 10] = [
    "public notice",
    "community newsletter excerpt",
    "editorial opinion piece",
    "letter to the editor",
    "advertisement copy",
    "formal email",
    "speech transcript excerpt",
    "brochure information text",
    "social media thread excerpt",
    "interview transcript excerpt",
];

#[derive(Debug, Clone, Copy)]
struct CommandTermProfile {
    key: &'static str,
    display: &'static str,
    min_marks: u8,
    max_marks: u8,
    below_evaluate: bool,
}

const COMMAND_TERM_PROFILES: [CommandTermProfile; 8] = [
    CommandTermProfile {
        key: "identify",
        display: "Identify",
        min_marks: 1,
        max_marks: 2,
        below_evaluate: true,
    },
    CommandTermProfile {
        key: "describe",
        display: "Describe",
        min_marks: 2,
        max_marks: 3,
        below_evaluate: true,
    },
    CommandTermProfile {
        key: "explain",
        display: "Explain",
        min_marks: 3,
        max_marks: 5,
        below_evaluate: true,
    },
    CommandTermProfile {
        key: "compare",
        display: "Compare",
        min_marks: 3,
        max_marks: 5,
        below_evaluate: true,
    },
    CommandTermProfile {
        key: "analyse",
        display: "Analyse",
        min_marks: 4,
        max_marks: 6,
        below_evaluate: true,
    },
    CommandTermProfile {
        key: "discuss",
        display: "Discuss",
        min_marks: 5,
        max_marks: 7,
        below_evaluate: true,
    },
    CommandTermProfile {
        key: "evaluate",
        display: "Evaluate",
        min_marks: 6,
        max_marks: 8,
        below_evaluate: false,
    },
    CommandTermProfile {
        key: "justify",
        display: "Justify",
        min_marks: 5,
        max_marks: 7,
        below_evaluate: false,
    },
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateQuestionsRequest {
    topics: Vec<String>,
    difficulty: String,
    question_count: usize,
    model: String,
    api_key: String,
    tech_mode: Option<String>,
    prioritized_command_terms: Option<Vec<String>>,
    subtopics: Option<Vec<String>>,
    english_task_types: Option<Vec<String>>,
    subtopic_instructions: Option<HashMap<String, String>>,
    custom_focus_area: Option<String>,
    avoid_similar_questions: Option<bool>,
    prior_question_prompts: Option<Vec<String>>,
    use_structured_output: Option<bool>,
    max_marks_per_question: Option<u8>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GeneratedQuestion {
    id: String,
    topic: String,
    #[serde(default)]
    subtopic: Option<String>,
    #[serde(default)]
    task_type: Option<String>,
    #[serde(default)]
    recommended_response_length: Option<String>,
    prompt_markdown: String,
    #[serde(default = "default_question_max_marks")]
    max_marks: u8,
    #[serde(default)]
    tech_allowed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    distinctness_score: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    multi_step_depth: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateQuestionsResponse {
    questions: Vec<GeneratedQuestion>,
    #[serde(default)]
    raw_model_output: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    telemetry: Option<GenerationTelemetry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GenerationTelemetry {
    difficulty: String,
    total_attempts: usize,
    repair_attempts: usize,
    constrained_regeneration_used: bool,
    repair_path: Vec<String>,
    duration_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    structured_output_status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    distinctness_avg: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    multi_step_depth_avg: Option<f32>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GenerationStatusEvent {
    mode: &'static str,
    stage: &'static str,
    message: String,
    attempt: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkAnswerRequest {
    question: GeneratedQuestion,
    student_answer: String,
    student_answer_image_data_url: Option<String>,
    model: String,
    api_key: String,
    #[serde(rename = "useStructuredOutput")]
    _use_structured_output: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeneratePassageQuestionsRequest {
    aos_subtopic: String,
    question_count: usize,
    model: String,
    api_key: String,
    use_structured_output: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PassageSubQuestion {
    id: String,
    prompt_markdown: String,
    max_marks: u8,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GeneratedPassage {
    id: String,
    text: String,
    aos_subtopic: String,
    questions: Vec<PassageSubQuestion>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeneratePassageResponse {
    passage: GeneratedPassage,
    #[serde(default)]
    raw_model_output: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    telemetry: Option<GenerationTelemetry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkPassageAnswerRequest {
    passage_text: String,
    aos_subtopic: String,
    question: PassageSubQuestion,
    student_answer: String,
    model: String,
    api_key: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkAnswerResponse {
    verdict: String,
    #[serde(default)]
    achieved_marks: u8,
    #[serde(default)]
    max_marks: u8,
    #[serde(default)]
    score_out_of_10: u8,
    #[serde(default)]
    vcaa_marking_scheme: Vec<MarkingCriterion>,
    #[serde(default)]
    comparison_to_solution_markdown: String,
    feedback_markdown: String,
    worked_solution_markdown: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkingCriterion {
    criterion: String,
    #[serde(default)]
    achieved_marks: u8,
    #[serde(default)]
    max_marks: u8,
    rationale: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnalyzeImageRequest {
    image_path: String,
    model: String,
    api_key: String,
    prompt: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AnalyzeImageResponse {
    output_text: String,
}

#[derive(Debug, Deserialize)]
struct OpenRouterResponse {
    choices: Vec<OpenRouterChoice>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterChoice {
    message: OpenRouterMessage,
}

#[derive(Debug, Deserialize)]
struct OpenRouterMessage {
    content: String,
}

#[derive(Debug)]
struct OpenRouterCallResult {
    content: String,
    structured_output_unsupported_fallback: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppError {
    code: &'static str,
    message: String,
}

impl AppError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

type CommandResult<T> = Result<T, AppError>;

fn emit_generation_status(
    app: &tauri::AppHandle,
    mode: &'static str,
    stage: &'static str,
    message: impl Into<String>,
    attempt: usize,
) {
    let _ = app.emit(
        "generation-status",
        GenerationStatusEvent {
            mode,
            stage,
            message: message.into(),
            attempt,
        },
    );
}

#[tauri::command]
fn load_persisted_state(app: tauri::AppHandle) -> CommandResult<serde_json::Value> {
    let path = persisted_state_path(&app)?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }

    let content = fs::read_to_string(&path).map_err(|err| {
        AppError::new(
            "PERSISTENCE_READ_ERROR",
            format!("Could not read persisted app state: {err}"),
        )
    })?;

    if content.trim().is_empty() {
        return Ok(serde_json::json!({}));
    }

    serde_json::from_str(&content).map_err(|err| {
        AppError::new(
            "PERSISTENCE_PARSE_ERROR",
            format!("Persisted app state is invalid JSON: {err}"),
        )
    })
}

#[tauri::command]
fn save_persisted_state(app: tauri::AppHandle, state: serde_json::Value) -> CommandResult<()> {
    if !state.is_object() {
        return Err(AppError::new(
            "PERSISTENCE_VALIDATION_ERROR",
            "Persisted app state must be a JSON object.",
        ));
    }

    let path = persisted_state_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| {
            AppError::new(
                "PERSISTENCE_DIR_ERROR",
                format!("Could not create app data directory: {err}"),
            )
        })?;
    }

    let payload = serde_json::to_string(&state).map_err(|err| {
        AppError::new(
            "PERSISTENCE_SERIALIZE_ERROR",
            format!("Could not serialize app state: {err}"),
        )
    })?;

    let temp_path = path.with_extension("tmp");
    fs::write(&temp_path, payload).map_err(|err| {
        AppError::new(
            "PERSISTENCE_WRITE_ERROR",
            format!("Could not write temporary app state file: {err}"),
        )
    })?;

    remove_existing_state_file(&path)?;

    fs::rename(&temp_path, &path).map_err(|err| {
        AppError::new(
            "PERSISTENCE_RENAME_ERROR",
            format!("Could not finalize app state file: {err}"),
        )
    })?;

    Ok(())
}

fn persisted_state_path(app: &tauri::AppHandle) -> CommandResult<PathBuf> {
    let app_dir = app.path().app_data_dir().map_err(|err| {
        AppError::new(
            "PERSISTENCE_PATH_ERROR",
            format!("Could not resolve app data directory: {err}"),
        )
    })?;

    Ok(app_dir.join(APP_STATE_FILE_NAME))
}

fn remove_existing_state_file(path: &Path) -> CommandResult<()> {
    fs::remove_file(path).or_else(|err| {
        if err.kind() == std::io::ErrorKind::NotFound {
            Ok(())
        } else {
            Err(AppError::new(
                "PERSISTENCE_REPLACE_ERROR",
                format!("Could not replace existing app state file: {err}"),
            ))
        }
    })
}

#[tauri::command]
async fn generate_questions(
    app: tauri::AppHandle,
    request: GenerateQuestionsRequest,
) -> CommandResult<GenerateQuestionsResponse> {
    validate_generate_request(&request)?;
    let generation_started = Instant::now();
    emit_generation_status(
        &app,
        "written",
        "preparing",
        "Preparing generation request.",
        1,
    );

    let system_prompt_owned = format!("You are an expert VCE exam writer. Produce diverse, exam-style questions and include LaTeX in markdown when mathematics is involved.{LATEX_FORMATTING_RULES}");
    let system_prompt: &str = &system_prompt_owned;
    let topics_csv = request.topics.join(", ");
    let selected_subtopics = request.subtopics.as_ref().filter(|s| !s.is_empty());
    let selected_english_task_types = normalize_english_task_types(request.english_task_types.as_deref());
    let prioritized_command_terms =
        normalize_prioritized_command_terms(request.prioritized_command_terms.as_deref());
    let custom_focus_area = request
        .custom_focus_area
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let difficulty_rules = difficulty_guidance(&request.difficulty);
    let math_methods_reference_note = if includes_mathematical_methods(&request.topics) {
        MATHEMATICAL_METHODS_REFERENCE_GUIDANCE
    } else {
        ""
    };
    let physical_education_reference_note = if includes_physical_education(&request.topics) {
        PHYSICAL_EDUCATION_REFERENCE_GUIDANCE
    } else {
        ""
    };
    let chemistry_formula_note = if includes_chemistry(&request.topics) {
        CHEMICAL_FORMULA_LATEX_GUIDANCE
    } else {
        ""
    };
    let english_language_reference_note = if includes_english_language(&request.topics) {
        ENGLISH_LANGUAGE_REFERENCE_GUIDANCE
    } else {
        ""
    };
    let english_language_task_type_note = if includes_english_language(&request.topics) {
        build_english_language_task_type_note(&selected_english_task_types)
    } else {
        String::new()
    };
    let tech_mode = request.tech_mode.as_deref().unwrap_or("mix");
    let tech_note = match tech_mode {
        "tech-free" => " All questions must be tech-free (no CAS calculator). Set \"techAllowed\": false for every question.",
        "tech-active" => " All questions must be tech-active (CAS calculator allowed). Set \"techAllowed\": true for every question.",
        _ => " Create a realistic mix of tech-free and tech-active questions. Set \"techAllowed\": true or false per question as appropriate.",
    };
    let subtopics_note = match selected_subtopics {
        Some(subs) => format!(" Focus on the following subtopics: {}.", subs.join(", ")),
        None => String::new(),
    };
    let subtopic_instruction_note =
        build_subtopic_instructions_note(selected_subtopics, request.subtopic_instructions.as_ref());
    let custom_focus_note = match custom_focus_area {
        Some(value) => format!(
            " Custom focus area: \"{value}\". Prioritize this focus strongly across the set and align each question context to it where syllabus-valid."
        ),
        None => String::new(),
    };
    let similarity_guardrail_note = build_similarity_guardrail_note(
        request.avoid_similar_questions.unwrap_or(false),
        request.prior_question_prompts.as_deref(),
    );
    let command_term_guidance_note =
        build_command_term_guidance_note(&prioritized_command_terms, &request.topics);
    let is_extreme = request.difficulty.eq_ignore_ascii_case("extreme");
    let is_essential_skills = request
        .difficulty
        .eq_ignore_ascii_case("essential skills");
    let has_math_topic = request.topics.iter().any(|t| {
        let t = t.trim();
        t.eq_ignore_ascii_case("Mathematical Methods") || t.eq_ignore_ascii_case("Specialist Mathematics")
    });
    let essential_skills_math_note = if is_essential_skills && has_math_topic {
        " For mathematics questions at Essential Skills level: prioritise straightforward, single-skill items with minimal analysis, direct substitution, or direct equation solving (for example, solving a basic trigonometric equation on a stated interval). Avoid multi-part proofs, deep modelling, or chained synthesis tasks."
    } else {
        ""
    };
    let extreme_math_note = if is_extreme && has_math_topic {
        " For mathematics questions at Extreme level: heavily favour multi-part analytical and proof-style questions requiring rigorous algebraic manipulation, chain reasoning across two or more concepts, and derivation or justification of results from first principles. Avoid purely computational or template-substitution tasks."
    } else {
        ""
    };
    let max_marks_cap = request.max_marks_per_question.unwrap_or(30);
    let user_prompt = format!(
        "Create exactly {count} original VCE written-response questions for topics: {topics}. Difficulty level: {difficulty}.\n\nDifficulty calibration rules:\n{difficulty_rules}\n\nMark allocation rules:\n- Assign maxMarks based on command-term cognitive demand (do not force equal marks across all questions).\n- Keep maxMarks between 1 and {max_marks_cap}.{command_term_guidance_note}{subtopics_note}{subtopic_instruction_note}{custom_focus_note}{tech_note}{math_methods_reference_note}{physical_education_reference_note}{chemistry_formula_note}{english_language_reference_note}{essential_skills_math_note}{extreme_math_note}{english_language_task_type_note}\n\nQuality constraints:\n- Ensure all questions are materially distinct in concept, context, and required method.\n- Prefer concise prompts with high cognitive load for harder items.\n- Never include worked solutions in promptMarkdown.\n- Use markdown. Use LaTeX only with $...$ and $$...$$ delimiters.\n- For Chemistry content, every chemical formula and ionic species must be in LaTeX math delimiters.{similarity_guardrail_note}\n\nSubtopic constraints:\n- If subtopics are provided, choose \"subtopic\" only from that provided list.\n- If no specific subtopic clearly applies, omit \"subtopic\".\n\nOutput constraints:\n- Return JSON only. No markdown fences. No prose before or after JSON.\n- Return EXACTLY {count} questions.\n- Use this exact JSON shape: {json_contract}",
        count = request.question_count,
        topics = topics_csv,
        difficulty = request.difficulty,
        command_term_guidance_note = command_term_guidance_note,
        difficulty_rules = difficulty_rules,
        subtopics_note = subtopics_note,
        subtopic_instruction_note = subtopic_instruction_note,
        custom_focus_note = custom_focus_note,
        tech_note = tech_note,
        math_methods_reference_note = math_methods_reference_note,
        physical_education_reference_note = physical_education_reference_note,
        chemistry_formula_note = chemistry_formula_note,
        english_language_reference_note = english_language_reference_note,
        essential_skills_math_note = essential_skills_math_note,
        extreme_math_note = extreme_math_note,
        english_language_task_type_note = english_language_task_type_note,
        similarity_guardrail_note = similarity_guardrail_note,
        max_marks_cap = max_marks_cap,
        json_contract = WRITTEN_QUESTION_JSON_CONTRACT,
    );
    let (base_user_content, plugins) =
        build_generation_user_content(&app, &request.topics, &user_prompt)?;
    let response_format = if request.use_structured_output.unwrap_or(false) {
        Some(written_questions_response_format())
    } else {
        None
    };

    emit_generation_status(
        &app,
        "written",
        "generating",
        "Requesting a new written question set.",
        1,
    );
    let first_call = call_openrouter_with_plugins(
        &request.api_key,
        &request.model,
        &system_prompt,
        base_user_content.clone(),
        plugins.clone(),
        response_format.clone(),
    )
    .await?;
    let mut structured_output_unsupported = first_call.structured_output_unsupported_fallback;
    let mut content = first_call.content;

    let mut parse_issue = String::new();
    let mut parsed: Option<GenerateQuestionsResponse> = None;
    let mut repair_attempts = 0usize;
    let mut repair_path: Vec<String> = Vec::new();
    let mut constrained_regeneration_used = false;
    let mut total_attempts = 1usize;

    for attempt in 0..=GENERATION_REPAIR_RETRIES {
        emit_generation_status(
            &app,
            "written",
            "validating",
            "Validating the model response.",
            total_attempts,
        );
        match parse_written_response_candidate(
            &content,
            &request,
            selected_subtopics,
            &selected_english_task_types,
            &prioritized_command_terms,
        ) {
            Ok(candidate) => {
                parsed = Some(candidate);
                break;
            }
            Err(issue) => {
                parse_issue = issue;
                if attempt == GENERATION_REPAIR_RETRIES {
                    break;
                }
                repair_attempts += 1;
                repair_path.push("json-repair".to_string());
                total_attempts += 1;
                emit_generation_status(
                    &app,
                    "written",
                    "repairing",
                    format!("Repairing invalid model output (pass {}).", repair_attempts),
                    total_attempts,
                );
                let repaired = request_json_repair(
                    &request.api_key,
                    &request.model,
                    WRITTEN_QUESTION_JSON_CONTRACT,
                    &content,
                    &parse_issue,
                    response_format.as_ref(),
                )
                .await?;
                structured_output_unsupported =
                    structured_output_unsupported || repaired.structured_output_unsupported_fallback;
                content = repaired.content;
            }
        }
    }

    if parsed.is_none() {
        constrained_regeneration_used = true;
        total_attempts += 1;
        repair_path.push("schema-constrained-regeneration".to_string());
        emit_generation_status(
            &app,
            "written",
            "regenerating",
            "Retrying with a stricter regeneration prompt.",
            total_attempts,
        );
        let regenerated = request_schema_constrained_regeneration(
            &request.api_key,
            &request.model,
            &user_prompt,
            WRITTEN_QUESTION_JSON_CONTRACT,
            &parse_issue,
            &base_user_content,
            plugins.as_ref(),
            response_format.as_ref(),
        )
        .await?;
        structured_output_unsupported =
            structured_output_unsupported || regenerated.structured_output_unsupported_fallback;
        content = regenerated.content;

        match parse_written_response_candidate(
            &content,
            &request,
            selected_subtopics,
            &selected_english_task_types,
            &prioritized_command_terms,
        ) {
            Ok(candidate) => parsed = Some(candidate),
            Err(issue) => parse_issue = issue,
        }
    }

    let mut parsed = parsed.ok_or_else(|| {
        emit_generation_status(
            &app,
            "written",
            "failed",
            format!("Generation failed after {} attempt(s).", total_attempts),
            total_attempts,
        );
        AppError::new(
            "MODEL_PARSE_ERROR",
            format!(
                "Could not parse generated questions after repair attempts. {} Try again or switch model.",
                parse_issue
            ),
        )
    })?;

    // Override techAllowed for non-mix modes
    match tech_mode {
        "tech-free" => {
            for question in &mut parsed.questions {
                question.tech_allowed = false;
            }
        }
        "tech-active" => {
            for question in &mut parsed.questions {
                question.tech_allowed = true;
            }
        }
        _ => {}
    }

    let quality_summary = score_written_question_quality(&mut parsed.questions);
    let telemetry = GenerationTelemetry {
        difficulty: request.difficulty.clone(),
        total_attempts,
        repair_attempts,
        constrained_regeneration_used,
        repair_path,
        duration_ms: generation_started.elapsed().as_millis() as u64,
        structured_output_status: Some(
            if request.use_structured_output.unwrap_or(false) {
                if structured_output_unsupported {
                    "not-supported-fallback"
                } else {
                    "used"
                }
            } else {
                "not-requested"
            }
            .to_string(),
        ),
        distinctness_avg: quality_summary.distinctness_avg,
        multi_step_depth_avg: quality_summary.multi_step_depth_avg,
    };

    emit_generation_status(
        &app,
        "written",
        "completed",
        format!("Written set ready in {} ms.", telemetry.duration_ms),
        total_attempts,
    );

    Ok(GenerateQuestionsResponse {
        questions: parsed.questions,
        raw_model_output: content,
        telemetry: Some(telemetry),
    })
}

#[tauri::command]
async fn mark_answer(request: MarkAnswerRequest) -> CommandResult<MarkAnswerResponse> {
    validate_mark_request(&request)?;

    let system_prompt_owned = format!("You are a strict but constructive VCE marker. Assess student answers fairly and explain clearly.{LATEX_FORMATTING_RULES}");
    let system_prompt: &str = &system_prompt_owned;
    let normalized_student_answer = normalize_student_answer_for_marking(&request.student_answer);
    let chemistry_formula_note = if is_chemistry_topic(&request.question.topic) {
        " For Chemistry content, every chemical formula and ionic species in your response must be LaTeX-formatted (for example $H_2O$, $CO_2$, $Fe^{3+}$, $SO_4^{2-}$)."
    } else {
        ""
    };
    let english_rubric_note = if is_english_language_topic(&request.question.topic) {
        match request.question.task_type.as_deref() {
            Some("analytical-essay") => " For English Language analytical essays, ensure vcaaMarkingScheme contains at least four criteria that explicitly assess: argument quality, metalanguage precision, evidence/examples, and structure/coherence.",
            Some("short-answer") => " For English Language short-answer responses, prioritise concise criterion checks for metalanguage accuracy, textual evidence, and explanation clarity.",
            _ => " For English Language responses, use criterion descriptors that foreground metalanguage precision, textual evidence, and contextual reasoning.",
        }
    } else {
        ""
    };
    let user_prompt_text = format!(
        "Question topic: {topic}\nQuestion:\n{question}\n\nQuestion max marks: {max_marks}\n\nStudent answer:\n{answer}\n\nUse VCAA-style criterion marking. Mark only what is explicitly stated in the student's response and do not infer unstated working. Build a criterion-by-criterion marking scheme, award marks out of {max_marks}, and compare the student response against the worked solution.\n\nConciseness rules:\n- comparisonToSolutionMarkdown: maximum 120 words.\n- feedbackMarkdown: maximum 120 words.\n- workedSolutionMarkdown: maximum 180 words.\n- Each rationale in vcaaMarkingScheme: maximum 45 words.\n\nReturn ONLY valid JSON in this exact shape: {{\"verdict\":\"Correct|Partially Correct|Incorrect\",\"achievedMarks\":6,\"maxMarks\":{max_marks},\"scoreOutOf10\":8,\"vcaaMarkingScheme\":[{{\"criterion\":\"...\",\"achievedMarks\":2,\"maxMarks\":3,\"rationale\":\"...\"}}],\"comparisonToSolutionMarkdown\":\"...\",\"feedbackMarkdown\":\"...\",\"workedSolutionMarkdown\":\"...\"}}. Ensure the sum of vcaaMarkingScheme achievedMarks equals achievedMarks. Use markdown and LaTeX where relevant.{chemistry_formula_note}{english_rubric_note}",
        topic = request.question.topic,
        question = request.question.prompt_markdown,
        answer = normalized_student_answer,
        max_marks = request.question.max_marks,
        chemistry_formula_note = chemistry_formula_note,
        english_rubric_note = english_rubric_note,
    );

    let user_content = build_mark_answer_user_content(&user_prompt_text, request.student_answer_image_data_url.as_deref())?;

    // Marking is latency-sensitive and JSON parsing failures require expensive retry calls,
    // so always request schema-constrained output and let backend fallback handle unsupported models.
    let response_format = Some(mark_answer_response_format());

    let mut content = call_openrouter(
        &request.api_key,
        &request.model,
        system_prompt,
        user_content,
        response_format.as_ref(),
    )
    .await?
    .content;
    let mut payload = parse_json_object(&content);
    if payload.is_none() {
        let repaired = request_json_repair(
            &request.api_key,
            &request.model,
            MARK_ANSWER_JSON_CONTRACT,
            &content,
            "No valid JSON object found in marking response.",
            response_format.as_ref(),
        )
        .await?;
        content = repaired.content;
        payload = parse_json_object(&content);
    }

    let payload = payload.ok_or_else(|| {
        AppError::new(
            "MODEL_PARSE_ERROR",
            format_marking_parse_error(
                "Could not parse the marking response. Try submitting again.",
                &content,
            ),
        )
    })?;

    let mut parsed: MarkAnswerResponse = match serde_json::from_str(&payload) {
        Ok(parsed) => parsed,
        Err(parse_error) => {
            let repaired = request_json_repair(
                &request.api_key,
                &request.model,
                MARK_ANSWER_JSON_CONTRACT,
                &content,
                &format!("Marking JSON did not match schema: {parse_error}"),
                response_format.as_ref(),
            )
            .await?;
            content = repaired.content;
            let repaired_payload = parse_json_object(&content).ok_or_else(|| {
                AppError::new(
                    "MODEL_PARSE_ERROR",
                    format_marking_parse_error(
                        "Could not parse repaired marking response.",
                        &content,
                    ),
                )
            })?;

            serde_json::from_str(&repaired_payload).map_err(|_| {
                AppError::new(
                    "MODEL_PARSE_ERROR",
                    format_marking_parse_error(
                        "OpenRouter returned an unexpected marking format.",
                        &content,
                    ),
                )
            })?
        }
    };

    // Always use the authoritative question max marks; the model sometimes
    // returns maxMarks:10 (copied from the example in the prompt) regardless
    // of the actual question value.
    parsed.max_marks = if request.question.max_marks > 0 {
        request.question.max_marks
    } else {
        10
    };

    if parsed.achieved_marks > parsed.max_marks {
        parsed.achieved_marks = parsed.max_marks;
    }

    let scheme_total = parsed
        .vcaa_marking_scheme
        .iter()
        .fold(0u16, |acc, item| acc + item.achieved_marks as u16);

    parsed.achieved_marks = u8::min(parsed.achieved_marks, parsed.max_marks);
    if scheme_total as u8 != parsed.achieved_marks && !parsed.vcaa_marking_scheme.is_empty() {
        parsed.achieved_marks = u8::min(scheme_total as u8, parsed.max_marks);
    }

    if parsed.score_out_of_10 > 10 {
        parsed.score_out_of_10 = 10;
    }

    if parsed.score_out_of_10 == 0 && parsed.max_marks > 0 {
        let scaled = ((parsed.achieved_marks as f32 / parsed.max_marks as f32) * 10.0).round() as u8;
        parsed.score_out_of_10 = u8::min(scaled, 10);
    }

    parsed.feedback_markdown = decode_literal_newlines(&parsed.feedback_markdown);
    parsed.worked_solution_markdown = decode_literal_newlines(&parsed.worked_solution_markdown);
    parsed.comparison_to_solution_markdown = decode_literal_newlines(&parsed.comparison_to_solution_markdown);
    for criterion in &mut parsed.vcaa_marking_scheme {
        criterion.rationale = decode_literal_newlines(&criterion.rationale);
        criterion.criterion = decode_literal_newlines(&criterion.criterion);
    }

    Ok(parsed)
}

#[tauri::command]
async fn generate_passage_questions(
    app: tauri::AppHandle,
    request: GeneratePassageQuestionsRequest,
) -> CommandResult<GeneratePassageResponse> {
    validate_passage_generate_request(&request)?;
    let generation_started = Instant::now();
    emit_generation_status(
        &app,
        "passage",
        "preparing",
        "Preparing English Language passage request.",
        1,
    );

    let instruction_note = english_language_passage_instruction(&request.aos_subtopic);
    let selected_text_type = pick_passage_text_type();
    let system_prompt = "You are an expert VCE English Language SAC writer. Produce a realistic stimulus passage and precise short-answer metalanguage questions aligned to the requested Area of Study. Return JSON only.";
    let user_prompt = format!(
        "Create exactly one English Language stimulus passage aligned to this Area of Study: {aos_subtopic}.\n\nArea-of-study guidance:\n{instruction_note}\n\nRequired text type for this generation:\n- Write the passage as a {selected_text_type}.\n- Do not default to a generic narrative unless that is the required text type.\n\nRequirements for the passage:\n- Passage length must be approximately 200-300 words.\n- Write a cohesive, natural text rather than bullet points.\n- Include a mix of sentence structures and language features that allow close linguistic analysis.\n- Use clear newline-delimited lines for line numbering: target 10-28 non-empty lines, and keep each line concise (roughly 4-24 words).\n- Do NOT include manual line numbers in the passage text (for example, no prefixes like 1., 2), 3:, or 4 -).\n- Do NOT include bullet markers for lines. The frontend adds line numbers automatically.\n- Ensure each sentence or clause is broken cleanly across lines so line references are unambiguous.\n- Make the passage rich enough to support direct identification questions such as modal verbs, clauses, sentence types, discourse features, and register choices.\n\nRequirements for the questions:\n- Return exactly {question_count} questions.\n- Every question must be answerable using evidence from the passage.\n- Questions must explicitly reference line numbers or a line range (include numeric line references such as \"line 3\" or \"lines 4-6\").\n- Use VCE English Language metalanguage and stay aligned to the selected Area of Study.\n- Prioritise short-answer analytical prompts such as identifying, explaining, comparing, and commenting on linguistic choices.\n- Keep each question concise and assign realistic maxMarks between 1 and 5.\n\nOutput constraints:\n- Return JSON only. No markdown fences. No commentary.\n- Use this exact JSON shape: {json_contract}",
        aos_subtopic = request.aos_subtopic,
        instruction_note = instruction_note,
        selected_text_type = selected_text_type,
        question_count = request.question_count,
        json_contract = PASSAGE_JSON_CONTRACT,
    );
    let user_content = serde_json::Value::String(user_prompt.clone());
    let response_format = if request.use_structured_output.unwrap_or(false) {
        Some(passage_response_format())
    } else {
        None
    };

    emit_generation_status(
        &app,
        "passage",
        "generating",
        format!(
            "Requesting a new English Language passage ({selected_text_type})."
        ),
        1,
    );
    let first_call = call_openrouter(
        &request.api_key,
        &request.model,
        system_prompt,
        user_content.clone(),
        response_format.as_ref(),
    )
    .await?;
    let mut structured_output_unsupported = first_call.structured_output_unsupported_fallback;
    let mut content = first_call.content;

    let mut parse_issue = String::new();
    let mut parsed: Option<GeneratePassageResponse> = None;
    let mut repair_attempts = 0usize;
    let mut repair_path: Vec<String> = Vec::new();
    let mut constrained_regeneration_used = false;
    let mut total_attempts = 1usize;

    for attempt in 0..=GENERATION_REPAIR_RETRIES {
        emit_generation_status(
            &app,
            "passage",
            "validating",
            "Validating the passage response.",
            total_attempts,
        );
        match parse_passage_response_candidate(&content, &request) {
            Ok(candidate) => {
                parsed = Some(candidate);
                break;
            }
            Err(issue) => {
                parse_issue = issue;
                if attempt == GENERATION_REPAIR_RETRIES {
                    break;
                }
                repair_attempts += 1;
                repair_path.push("json-repair".to_string());
                total_attempts += 1;
                emit_generation_status(
                    &app,
                    "passage",
                    "repairing",
                    format!("Repairing invalid passage output (pass {}).", repair_attempts),
                    total_attempts,
                );
                let repaired = request_json_repair(
                    &request.api_key,
                    &request.model,
                    PASSAGE_JSON_CONTRACT,
                    &content,
                    &parse_issue,
                    response_format.as_ref(),
                )
                .await?;
                structured_output_unsupported =
                    structured_output_unsupported || repaired.structured_output_unsupported_fallback;
                content = repaired.content;
            }
        }
    }

    if parsed.is_none() {
        constrained_regeneration_used = true;
        total_attempts += 1;
        repair_path.push("schema-constrained-regeneration".to_string());
        emit_generation_status(
            &app,
            "passage",
            "regenerating",
            "Retrying with a stricter passage prompt.",
            total_attempts,
        );
        let regenerated = request_schema_constrained_regeneration(
            &request.api_key,
            &request.model,
            &user_prompt,
            PASSAGE_JSON_CONTRACT,
            &parse_issue,
            &user_content,
            None,
            response_format.as_ref(),
        )
        .await?;
        structured_output_unsupported =
            structured_output_unsupported || regenerated.structured_output_unsupported_fallback;
        content = regenerated.content;

        match parse_passage_response_candidate(&content, &request) {
            Ok(candidate) => parsed = Some(candidate),
            Err(issue) => parse_issue = issue,
        }
    }

    let parsed = parsed.ok_or_else(|| {
        emit_generation_status(
            &app,
            "passage",
            "failed",
            format!("Passage generation failed after {} attempt(s).", total_attempts),
            total_attempts,
        );
        AppError::new(
            "MODEL_PARSE_ERROR",
            format!(
                "Could not parse generated passage after repair attempts. {} Try again or switch model.",
                parse_issue
            ),
        )
    })?;

    let telemetry = GenerationTelemetry {
        difficulty: request.aos_subtopic.clone(),
        total_attempts,
        repair_attempts,
        constrained_regeneration_used,
        repair_path,
        duration_ms: generation_started.elapsed().as_millis() as u64,
        structured_output_status: Some(
            if request.use_structured_output.unwrap_or(false) {
                if structured_output_unsupported {
                    "not-supported-fallback"
                } else {
                    "used"
                }
            } else {
                "not-requested"
            }
            .to_string(),
        ),
        distinctness_avg: None,
        multi_step_depth_avg: None,
    };

    emit_generation_status(
        &app,
        "passage",
        "completed",
        format!("English Language passage ready in {} ms.", telemetry.duration_ms),
        total_attempts,
    );

    Ok(GeneratePassageResponse {
        passage: parsed.passage,
        raw_model_output: content,
        telemetry: Some(telemetry),
    })
}

#[tauri::command]
async fn mark_passage_answer(request: MarkPassageAnswerRequest) -> CommandResult<MarkAnswerResponse> {
    validate_passage_mark_request(&request)?;

    let system_prompt = "You are a strict but constructive VCE English Language marker. Mark short-answer responses against the passage evidence and the precision of the student's metalanguage. Return JSON only.";
    let normalized_student_answer = normalize_student_answer_for_marking(&request.student_answer);
    let user_prompt_text = format!(
        "Area of Study: {aos_subtopic}\n\nPassage:\n{passage_text}\n\nQuestion:\n{question_prompt}\n\nQuestion max marks: {max_marks}\n\nStudent answer:\n{answer}\n\nMark this as a VCE English Language response. Reward precise linguistic identification, accurate metalanguage, relevant passage evidence, and concise explanation. Do not reward vague feature spotting without explanation.\n\nReturn ONLY valid JSON in this exact shape: {{\"verdict\":\"Correct|Partially Correct|Incorrect\",\"achievedMarks\":1,\"maxMarks\":{max_marks},\"scoreOutOf10\":8,\"vcaaMarkingScheme\":[{{\"criterion\":\"...\",\"achievedMarks\":1,\"maxMarks\":1,\"rationale\":\"...\"}}],\"comparisonToSolutionMarkdown\":\"...\",\"feedbackMarkdown\":\"...\",\"workedSolutionMarkdown\":\"...\"}}. Ensure the sum of vcaaMarkingScheme achievedMarks equals achievedMarks.",
        aos_subtopic = request.aos_subtopic,
        passage_text = request.passage_text,
        question_prompt = request.question.prompt_markdown,
        max_marks = request.question.max_marks,
        answer = normalized_student_answer,
    );

    let mut content = call_openrouter(
        &request.api_key,
        &request.model,
        system_prompt,
        serde_json::Value::String(user_prompt_text),
        Some(&mark_answer_response_format()),
    )
    .await?
    .content;
    let mut payload = parse_json_object(&content);
    if payload.is_none() {
        let repaired = request_json_repair(
            &request.api_key,
            &request.model,
            MARK_ANSWER_JSON_CONTRACT,
            &content,
            "No valid JSON object found in passage marking response.",
            Some(&mark_answer_response_format()),
        )
        .await?;
        content = repaired.content;
        payload = parse_json_object(&content);
    }

    let payload = payload.ok_or_else(|| {
        AppError::new(
            "MODEL_PARSE_ERROR",
            format_marking_parse_error(
                "Could not parse the passage marking response. Try submitting again.",
                &content,
            ),
        )
    })?;

    let mut parsed: MarkAnswerResponse = match serde_json::from_str(&payload) {
        Ok(parsed) => parsed,
        Err(parse_error) => {
            let repaired = request_json_repair(
                &request.api_key,
                &request.model,
                MARK_ANSWER_JSON_CONTRACT,
                &content,
                &format!("Passage marking JSON did not match schema: {parse_error}"),
                Some(&mark_answer_response_format()),
            )
            .await?;
            content = repaired.content;
            let repaired_payload = parse_json_object(&content).ok_or_else(|| {
                AppError::new(
                    "MODEL_PARSE_ERROR",
                    format_marking_parse_error(
                        "Could not parse repaired passage marking response.",
                        &content,
                    ),
                )
            })?;

            serde_json::from_str(&repaired_payload).map_err(|_| {
                AppError::new(
                    "MODEL_PARSE_ERROR",
                    format_marking_parse_error(
                        "OpenRouter returned an unexpected passage marking format.",
                        &content,
                    ),
                )
            })?
        }
    };

    parsed.max_marks = request.question.max_marks;
    if parsed.achieved_marks > parsed.max_marks {
        parsed.achieved_marks = parsed.max_marks;
    }

    let scheme_total = parsed
        .vcaa_marking_scheme
        .iter()
        .fold(0u16, |acc, item| acc + item.achieved_marks as u16);

    parsed.achieved_marks = u8::min(parsed.achieved_marks, parsed.max_marks);
    if scheme_total as u8 != parsed.achieved_marks && !parsed.vcaa_marking_scheme.is_empty() {
        parsed.achieved_marks = u8::min(scheme_total as u8, parsed.max_marks);
    }
    if parsed.score_out_of_10 > 10 {
        parsed.score_out_of_10 = 10;
    }
    if parsed.score_out_of_10 == 0 && parsed.max_marks > 0 {
        let scaled = ((parsed.achieved_marks as f32 / parsed.max_marks as f32) * 10.0).round() as u8;
        parsed.score_out_of_10 = u8::min(scaled, 10);
    }

    parsed.feedback_markdown = decode_literal_newlines(&parsed.feedback_markdown);
    parsed.worked_solution_markdown = decode_literal_newlines(&parsed.worked_solution_markdown);
    parsed.comparison_to_solution_markdown = decode_literal_newlines(&parsed.comparison_to_solution_markdown);
    for criterion in &mut parsed.vcaa_marking_scheme {
        criterion.rationale = decode_literal_newlines(&criterion.rationale);
        criterion.criterion = decode_literal_newlines(&criterion.criterion);
    }

    Ok(parsed)
}

fn normalize_student_answer_for_marking(answer: &str) -> String {
    const MAX_MARKING_ANSWER_CHARS: usize = 12_000;

    let normalized = answer
        .replace("\r\n", "\n")
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();

    if normalized.chars().count() <= MAX_MARKING_ANSWER_CHARS {
        return normalized;
    }

    let mut truncated = normalized
        .chars()
        .take(MAX_MARKING_ANSWER_CHARS)
        .collect::<String>();
    truncated.push_str("\n\n[Truncated by app for marking due to excessive length.]\n");
    truncated
}

#[tauri::command]
async fn analyze_image(request: AnalyzeImageRequest) -> CommandResult<AnalyzeImageResponse> {
    if request.api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "OpenRouter API key is required."));
    }

    if request.model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model is required."));
    }

    if request.image_path.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Image path is required."));
    }

    let data_url = encode_image_file_to_data_url(&request.image_path)?;
    let prompt = request
        .prompt
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("What's in this image?");

    let user_content = serde_json::json!([
        {
            "type": "text",
            "text": prompt
        },
        {
            "type": "image_url",
            "image_url": {
                "url": data_url
            }
        }
    ]);

    let output_text = call_openrouter(
        &request.api_key,
        &request.model,
        "You are a helpful visual reasoning assistant.",
        user_content,
        None,
    )
    .await?
    .content;

    Ok(AnalyzeImageResponse { output_text })
}

fn validate_generate_request(request: &GenerateQuestionsRequest) -> CommandResult<()> {
    if request.topics.is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Select at least one topic."));
    }

    if request.question_count == 0 || request.question_count > 20 {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Question count must be between 1 and 20.",
        ));
    }

    if request.api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "OpenRouter API key is required."));
    }

    if request.model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model is required."));
    }

    Ok(())
}

fn validate_mark_request(request: &MarkAnswerRequest) -> CommandResult<()> {
    let has_text = !request.student_answer.trim().is_empty();
    let has_image = request
        .student_answer_image_data_url
        .as_ref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);

    if !has_text && !has_image {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Enter an answer or upload an image before submitting.",
        ));
    }

    if request.api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "OpenRouter API key is required."));
    }

    if request.model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model is required."));
    }

    if request.question.max_marks == 0 {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Question max marks must be greater than zero.",
        ));
    }

    Ok(())
}

fn validate_passage_generate_request(request: &GeneratePassageQuestionsRequest) -> CommandResult<()> {
    if request.aos_subtopic.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Choose an Area of Study."));
    }

    if request.question_count < 3 || request.question_count > 10 {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Passage question count must be between 3 and 10.",
        ));
    }

    if request.api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "OpenRouter API key is required."));
    }

    if request.model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model is required."));
    }

    Ok(())
}

fn validate_passage_mark_request(request: &MarkPassageAnswerRequest) -> CommandResult<()> {
    if request.passage_text.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Passage text is required."));
    }

    if request.question.prompt_markdown.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Question prompt is required."));
    }

    if request.student_answer.trim().is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Enter an answer before submitting.",
        ));
    }

    if request.api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "OpenRouter API key is required."));
    }

    if request.model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model is required."));
    }

    if request.question.max_marks == 0 {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Question max marks must be greater than zero.",
        ));
    }

    Ok(())
}

fn written_questions_response_format() -> serde_json::Value {
    serde_json::json!({
        "type": "json_schema",
        "json_schema": {
            "name": "written_questions_response",
            "strict": true,
            "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": ["questions"],
                "properties": {
                    "questions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["id", "topic", "promptMarkdown", "maxMarks"],
                            "properties": {
                                "id": { "type": "string" },
                                "topic": { "type": "string" },
                                "subtopic": { "type": "string" },
                                "taskType": { "type": "string", "enum": ["short-answer", "analytical-essay"] },
                                "recommendedResponseLength": { "type": "string", "enum": ["short", "extended"] },
                                "promptMarkdown": { "type": "string" },
                                "maxMarks": { "type": "integer", "minimum": 1, "maximum": 30 },
                                "techAllowed": { "type": "boolean" }
                            }
                        }
                    }
                }
            }
        }
    })
}

fn passage_response_format() -> serde_json::Value {
    serde_json::json!({
        "type": "json_schema",
        "json_schema": {
            "name": "english_language_passage_response",
            "strict": true,
            "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": ["passage"],
                "properties": {
                    "passage": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["id", "text", "aosSubtopic", "questions"],
                        "properties": {
                            "id": { "type": "string" },
                            "text": { "type": "string" },
                            "aosSubtopic": { "type": "string" },
                            "questions": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "additionalProperties": false,
                                    "required": ["id", "promptMarkdown", "maxMarks"],
                                    "properties": {
                                        "id": { "type": "string" },
                                        "promptMarkdown": { "type": "string" },
                                        "maxMarks": { "type": "integer", "minimum": 1, "maximum": 5 }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    })
}

fn mc_questions_response_format() -> serde_json::Value {
    serde_json::json!({
        "type": "json_schema",
        "json_schema": {
            "name": "mc_questions_response",
            "strict": true,
            "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": ["questions"],
                "properties": {
                    "questions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["id", "topic", "promptMarkdown", "options", "correctAnswer", "explanationMarkdown"],
                            "properties": {
                                "id": { "type": "string" },
                                "topic": { "type": "string" },
                                "subtopic": { "type": "string" },
                                "promptMarkdown": { "type": "string" },
                                "options": {
                                    "type": "array",
                                    "minItems": 4,
                                    "maxItems": 4,
                                    "items": {
                                        "type": "object",
                                        "additionalProperties": false,
                                        "required": ["label", "text"],
                                        "properties": {
                                            "label": { "type": "string" },
                                            "text": { "type": "string" }
                                        }
                                    }
                                },
                                "correctAnswer": { "type": "string", "enum": ["A", "B", "C", "D"] },
                                "explanationMarkdown": { "type": "string" },
                                "techAllowed": { "type": "boolean" }
                            }
                        }
                    }
                }
            }
        }
    })
}

fn mark_answer_response_format() -> serde_json::Value {
    serde_json::json!({
        "type": "json_schema",
        "json_schema": {
            "name": "mark_answer_response",
            "strict": true,
            "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                    "verdict",
                    "achievedMarks",
                    "maxMarks",
                    "scoreOutOf10",
                    "vcaaMarkingScheme",
                    "comparisonToSolutionMarkdown",
                    "feedbackMarkdown",
                    "workedSolutionMarkdown"
                ],
                "properties": {
                    "verdict": { "type": "string" },
                    "achievedMarks": { "type": "integer", "minimum": 0 },
                    "maxMarks": { "type": "integer", "minimum": 1 },
                    "scoreOutOf10": { "type": "integer", "minimum": 0, "maximum": 10 },
                    "vcaaMarkingScheme": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["criterion", "achievedMarks", "maxMarks", "rationale"],
                            "properties": {
                                "criterion": { "type": "string" },
                                "achievedMarks": { "type": "integer", "minimum": 0 },
                                "maxMarks": { "type": "integer", "minimum": 0 },
                                "rationale": { "type": "string" }
                            }
                        }
                    },
                    "comparisonToSolutionMarkdown": { "type": "string" },
                    "feedbackMarkdown": { "type": "string" },
                    "workedSolutionMarkdown": { "type": "string" }
                }
            }
        }
    })
}

fn is_structured_output_unsupported_response(status: reqwest::StatusCode, body: &str) -> bool {
    if status != reqwest::StatusCode::BAD_REQUEST
        && status != reqwest::StatusCode::UNPROCESSABLE_ENTITY
    {
        return false;
    }

    let normalized = body.to_ascii_lowercase();
    (normalized.contains("response_format") || normalized.contains("json_schema") || normalized.contains("structured"))
        && (normalized.contains("not support")
            || normalized.contains("unsupported")
            || normalized.contains("not available")
            || normalized.contains("invalid"))
}

fn format_marking_parse_error(prefix: &str, content: &str) -> String {
    let sanitized = content.trim();
    if sanitized.is_empty() {
        return prefix.to_string();
    }

    const MAX_LEN: usize = 1200;
    let mut truncated = sanitized.to_string();
    if truncated.chars().count() > MAX_LEN {
        truncated = truncated.chars().take(MAX_LEN).collect::<String>();
        truncated.push_str("\n... [truncated]");
    }

    format!("{prefix}\n\nRaw model response:\n{truncated}")
}

async fn call_openrouter(
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_content: serde_json::Value,
    response_format: Option<&serde_json::Value>,
) -> CommandResult<OpenRouterCallResult> {
    call_openrouter_with_plugins(
        api_key,
        model,
        system_prompt,
        user_content,
        None,
        response_format.cloned(),
    )
    .await
}

async fn call_openrouter_with_plugins(
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_content: serde_json::Value,
    plugins: Option<serde_json::Value>,
    response_format: Option<serde_json::Value>,
) -> CommandResult<OpenRouterCallResult> {
    let client = reqwest::Client::new();

    let mut request_body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_content }
        ],
        "temperature": 0.5,
        "max_tokens": OPENROUTER_MAX_TOKENS
    });

    if let Some(plugins) = plugins {
        request_body["plugins"] = plugins;
    }

    if let Some(response_format) = response_format.clone() {
        request_body["response_format"] = response_format;
    }

    let response = client
        .post(OPENROUTER_CHAT_URL)
        .header(AUTHORIZATION, format!("Bearer {api_key}"))
        .header(CONTENT_TYPE, "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|err| AppError::new("NETWORK_ERROR", format!("Request failed: {err}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());

        if response_format.is_some() && is_structured_output_unsupported_response(status, &body) {
            let mut fallback_request_body = request_body.clone();
            if let serde_json::Value::Object(ref mut map) = fallback_request_body {
                map.remove("response_format");
            }

            let fallback_response = client
                .post(OPENROUTER_CHAT_URL)
                .header(AUTHORIZATION, format!("Bearer {api_key}"))
                .header(CONTENT_TYPE, "application/json")
                .json(&fallback_request_body)
                .send()
                .await
                .map_err(|err| AppError::new("NETWORK_ERROR", format!("Request failed: {err}")))?;

            if !fallback_response.status().is_success() {
                let fallback_status = fallback_response.status();
                let fallback_body = fallback_response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Unknown error".to_string());
                return Err(AppError::new(
                    "OPENROUTER_ERROR",
                    format!("OpenRouter request failed ({fallback_status}): {fallback_body}"),
                ));
            }

            let parsed: OpenRouterResponse = fallback_response
                .json()
                .await
                .map_err(|err| AppError::new("NETWORK_ERROR", format!("Invalid API response: {err}")))?;

            let content = parsed
                .choices
                .first()
                .map(|c| c.message.content.clone())
                .ok_or_else(|| AppError::new("EMPTY_RESULT", "OpenRouter returned no content."))?;

            return Ok(OpenRouterCallResult {
                content,
                structured_output_unsupported_fallback: true,
            });
        }

        return Err(AppError::new(
            "OPENROUTER_ERROR",
            format!("OpenRouter request failed ({status}): {body}"),
        ));
    }

    let parsed: OpenRouterResponse = response
        .json()
        .await
        .map_err(|err| AppError::new("NETWORK_ERROR", format!("Invalid API response: {err}")))?;

    let content = parsed
        .choices
        .first()
        .map(|c| c.message.content.clone())
        .ok_or_else(|| AppError::new("EMPTY_RESULT", "OpenRouter returned no content."))?;

    Ok(OpenRouterCallResult {
        content,
        structured_output_unsupported_fallback: false,
    })
}

fn build_mark_answer_user_content(
    text: &str,
    image_data_url: Option<&str>,
) -> CommandResult<serde_json::Value> {
    let Some(image_data_url) = image_data_url.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(serde_json::Value::String(text.to_string()));
    };

    if !image_data_url.starts_with("data:image/") {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Uploaded image must be a valid image data URL.",
        ));
    }

    let content = serde_json::json!([
        {
            "type": "text",
            "text": text
        },
        {
            "type": "image_url",
            "image_url": {
                "url": image_data_url
            }
        }
    ]);

    Ok(content)
}

fn build_generation_user_content(
    _app: &tauri::AppHandle,
    topics: &[String],
    prompt: &str,
) -> CommandResult<(serde_json::Value, Option<serde_json::Value>)> {
    let mut compact_reference = String::new();
    if includes_mathematical_methods(topics) {
        compact_reference.push_str("\n\nReference guidance:\n-");
        compact_reference.push_str(MATHEMATICAL_METHODS_REFERENCE_GUIDANCE.trim());
    }
    if includes_physical_education(topics) {
        if compact_reference.is_empty() {
            compact_reference.push_str("\n\nReference guidance:\n-");
        } else {
            compact_reference.push_str("\n-");
        }
        compact_reference.push_str(PHYSICAL_EDUCATION_REFERENCE_GUIDANCE.trim());
    }

    Ok((
        serde_json::Value::String(format!("{prompt}{compact_reference}")),
        None,
    ))
}

fn encode_image_file_to_data_url(image_path: &str) -> CommandResult<String> {
    let path = Path::new(image_path);
    if !path.exists() {
        return Err(AppError::new("VALIDATION_ERROR", "Image file not found."));
    }

    let mime = infer_image_mime(path).ok_or_else(|| {
        AppError::new(
            "VALIDATION_ERROR",
            "Unsupported image format. Use png, jpg/jpeg, webp, gif, heic, or heif.",
        )
    })?;

    let bytes = std::fs::read(path)
        .map_err(|err| AppError::new("IO_ERROR", format!("Failed to read image: {err}")))?;
    let encoded = general_purpose::STANDARD.encode(bytes);

    Ok(format!("data:{mime};base64,{encoded}"))
}

fn includes_mathematical_methods(topics: &[String]) -> bool {
    topics
        .iter()
        .any(|topic| topic.trim().eq_ignore_ascii_case(MATHEMATICAL_METHODS_TOPIC))
}

fn includes_physical_education(topics: &[String]) -> bool {
    topics
        .iter()
        .any(|topic| topic.trim().eq_ignore_ascii_case(PHYSICAL_EDUCATION_TOPIC))
}

fn includes_chemistry(topics: &[String]) -> bool {
    topics
        .iter()
        .any(|topic| topic.trim().eq_ignore_ascii_case(CHEMISTRY_TOPIC))
}

fn includes_english_language(topics: &[String]) -> bool {
    topics
        .iter()
        .any(|topic| topic.trim().eq_ignore_ascii_case(ENGLISH_LANGUAGE_TOPIC))
}

fn is_chemistry_topic(topic: &str) -> bool {
    topic.trim().eq_ignore_ascii_case(CHEMISTRY_TOPIC)
}

fn is_english_language_topic(topic: &str) -> bool {
    topic.trim().eq_ignore_ascii_case(ENGLISH_LANGUAGE_TOPIC)
}

fn normalize_english_task_types(raw_types: Option<&[String]>) -> Vec<&'static str> {
    let mut selected: Vec<&'static str> = Vec::new();

    for task_type in raw_types.unwrap_or(&[]) {
        let normalized = task_type.trim().to_ascii_lowercase();
        let canonical = match normalized.as_str() {
            "short-answer" => Some("short-answer"),
            "analytical-essay" => Some("analytical-essay"),
            _ => None,
        };

        if let Some(value) = canonical {
            if !selected.contains(&value) {
                selected.push(value);
            }
        }
    }

    if selected.is_empty() {
        vec!["short-answer", "analytical-essay"]
    } else {
        selected
    }
}

fn build_english_language_task_type_note(selected_types: &[&str]) -> String {
    let labels = selected_types
        .iter()
        .map(|task_type| {
            if *task_type == "short-answer" {
                "short-answer"
            } else {
                "analytical-essay"
            }
        })
        .collect::<Vec<_>>()
        .join(", ");

    let balancing_note = if selected_types.len() == 2 {
        "\n- When question count is at least 2, include at least one short-answer and one analytical-essay task."
    } else {
        ""
    };

    format!(
        "\n\nEnglish Language task constraints:\n- For English Language questions, set \"taskType\" to one of: {labels}.\n- Use \"recommendedResponseLength\" = \"short\" for short-answer and \"extended\" for analytical-essay.\n- For short-answer: target concise, evidence-based responses with clear metalanguage.\n- For analytical-essay: require sustained argument, integrated evidence, and coherent paragraphing.{balancing_note}"
    )
}

fn infer_image_mime(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    match extension.as_str() {
        "jpg" | "jpeg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "heic" => Some("image/heic"),
        "heif" => Some("image/heif"),
        _ => None,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateMcQuestionsRequest {
    topics: Vec<String>,
    difficulty: String,
    question_count: usize,
    model: String,
    api_key: String,
    tech_mode: Option<String>,
    subtopics: Option<Vec<String>>,
    subtopic_instructions: Option<HashMap<String, String>>,
    custom_focus_area: Option<String>,
    avoid_similar_questions: Option<bool>,
    prior_question_prompts: Option<Vec<String>>,
    use_structured_output: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct McOption {
    label: String,
    text: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct McQuestion {
    id: String,
    topic: String,
    #[serde(default)]
    subtopic: Option<String>,
    prompt_markdown: String,
    options: Vec<McOption>,
    correct_answer: String,
    explanation_markdown: String,
    #[serde(default)]
    tech_allowed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    distinctness_score: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    multi_step_depth: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateMcQuestionsResponse {
    questions: Vec<McQuestion>,
    #[serde(default)]
    raw_model_output: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    telemetry: Option<GenerationTelemetry>,
}

#[tauri::command]
async fn generate_mc_questions(
    app: tauri::AppHandle,
    request: GenerateMcQuestionsRequest,
) -> CommandResult<GenerateMcQuestionsResponse> {
    let generation_started = Instant::now();
    emit_generation_status(
        &app,
        "multiple-choice",
        "preparing",
        "Preparing generation request.",
        1,
    );
    if request.topics.is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Select at least one topic."));
    }
    if request.question_count == 0 || request.question_count > 20 {
        return Err(AppError::new("VALIDATION_ERROR", "Question count must be between 1 and 20."));
    }
    if request.api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "OpenRouter API key is required."));
    }
    if request.model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model is required."));
    }

    let system_prompt_owned = format!("You are an expert VCE exam writer. Create challenging, exam-style multiple choice questions. Never reveal chain-of-thought, internal deliberation, or self-corrections; provide only concise final explanations.{LATEX_FORMATTING_RULES}");
    let system_prompt: &str = &system_prompt_owned;
    let topics_csv = request.topics.join(", ");
    let selected_subtopics = request.subtopics.as_ref().filter(|s| !s.is_empty());
    let custom_focus_area = request
        .custom_focus_area
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let difficulty_rules = difficulty_guidance(&request.difficulty);
    let is_essential_skills_mc = request
        .difficulty
        .eq_ignore_ascii_case("essential skills");
    let is_extreme_mc = request.difficulty.eq_ignore_ascii_case("extreme");
    let has_math_topic_mc = request.topics.iter().any(|t| {
        let t = t.trim();
        t.eq_ignore_ascii_case("Mathematical Methods") || t.eq_ignore_ascii_case("Specialist Mathematics")
    });
    let essential_skills_math_note_mc = if is_essential_skills_mc && has_math_topic_mc {
        " For mathematics questions at Essential Skills level: use direct one-step or short two-step skills checks with minimal analysis, such as straightforward substitution or solving standard equations on a stated interval. Avoid proof-heavy, modelling-heavy, or highly non-routine tasks."
    } else {
        ""
    };
    let extreme_math_note_mc = if is_extreme_mc && has_math_topic_mc {
        " For mathematics questions at Extreme level: favour deep analytical reasoning, require students to interpret or construct non-trivial mathematical arguments, and use unfamiliar problem contexts that cannot be solved by template recall."
    } else {
        ""
    };
    let math_methods_reference_note = if includes_mathematical_methods(&request.topics) {
        MATHEMATICAL_METHODS_REFERENCE_GUIDANCE
    } else {
        ""
    };
    let physical_education_reference_note = if includes_physical_education(&request.topics) {
        PHYSICAL_EDUCATION_REFERENCE_GUIDANCE
    } else {
        ""
    };
    let chemistry_formula_note = if includes_chemistry(&request.topics) {
        CHEMICAL_FORMULA_LATEX_GUIDANCE
    } else {
        ""
    };
    let tech_mode_mc = request.tech_mode.as_deref().unwrap_or("mix");
    let tech_note_mc = match tech_mode_mc {
        "tech-free" => " All questions must be tech-free (no CAS calculator). Set \"techAllowed\": false for every question.",
        "tech-active" => " All questions must be tech-active (CAS calculator allowed). Set \"techAllowed\": true for every question.",
        _ => " Create a realistic mix of tech-free and tech-active questions. Set \"techAllowed\": true or false per question as appropriate.",
    };
    let subtopics_note_mc = match selected_subtopics {
        Some(subs) => format!(" Focus on the following subtopics: {}.", subs.join(", ")),
        None => String::new(),
    };
    let subtopic_instruction_note_mc =
        build_subtopic_instructions_note(selected_subtopics, request.subtopic_instructions.as_ref());
    let custom_focus_note_mc = match custom_focus_area {
        Some(value) => format!(
            " Custom focus area: \"{value}\". Prioritize this focus strongly across the set and align each question context to it where syllabus-valid."
        ),
        None => String::new(),
    };
    let similarity_guardrail_note = build_similarity_guardrail_note(
        request.avoid_similar_questions.unwrap_or(false),
        request.prior_question_prompts.as_deref(),
    );
    let user_prompt = format!(
        "Create exactly {count} original VCE multiple-choice questions for topics: {topics}. Difficulty level: {difficulty}.\n\nDifficulty calibration rules:\n{difficulty_rules}\n\nEach question must have exactly 4 options labeled A, B, C, D with only one correct answer.{subtopics_note}{subtopic_instruction_note}{custom_focus_note}{tech_note}{math_methods_reference_note}{physical_education_reference_note}{chemistry_formula_note}{essential_skills_math_note}{extreme_math_note}\n\nQuality constraints:\n- Make each question materially distinct in concept and reasoning style.\n- Use plausible distractors based on common misconceptions.\n- Avoid giveaway wording in stems and options.\n- Use markdown. Use LaTeX only with $...$ and $$...$$ delimiters.\n- For Chemistry content, every chemical formula and ionic species must be in LaTeX math delimiters.\n- explanationMarkdown must be concise: 1-3 short sentences, maximum 90 words.\n- explanationMarkdown must give only the final rationale: why the correct option is right and briefly why common distractors fail.\n- explanationMarkdown must not include chain-of-thought, self-talk, retries, uncertainty narration, or any rewriting/fixing of the question/options.{similarity_guardrail_note}\n\nSubtopic constraints:\n- If subtopics are provided, choose \"subtopic\" only from that provided list.\n- If no specific subtopic clearly applies, omit \"subtopic\".\n\nOutput constraints:\n- Return JSON only. No markdown fences. No prose before or after JSON.\n- Return EXACTLY {count} questions.\n- Use this exact JSON shape: {json_contract}",
        count = request.question_count,
        topics = topics_csv,
        difficulty = request.difficulty,
        difficulty_rules = difficulty_rules,
        subtopics_note = subtopics_note_mc,
        subtopic_instruction_note = subtopic_instruction_note_mc,
        custom_focus_note = custom_focus_note_mc,
        tech_note = tech_note_mc,
        math_methods_reference_note = math_methods_reference_note,
        physical_education_reference_note = physical_education_reference_note,
        chemistry_formula_note = chemistry_formula_note,
        essential_skills_math_note = essential_skills_math_note_mc,
        extreme_math_note = extreme_math_note_mc,
        similarity_guardrail_note = similarity_guardrail_note,
        json_contract = MC_QUESTION_JSON_CONTRACT,
    );
    let (base_user_content, plugins) =
        build_generation_user_content(&app, &request.topics, &user_prompt)?;
    let response_format = if request.use_structured_output.unwrap_or(false) {
        Some(mc_questions_response_format())
    } else {
        None
    };

    emit_generation_status(
        &app,
        "multiple-choice",
        "generating",
        "Requesting a new multiple-choice set.",
        1,
    );
    let first_call = call_openrouter_with_plugins(
        &request.api_key,
        &request.model,
        system_prompt,
        base_user_content.clone(),
        plugins.clone(),
        response_format.clone(),
    )
    .await?;
    let mut structured_output_unsupported = first_call.structured_output_unsupported_fallback;
    let mut content = first_call.content;

    let mut parse_issue = String::new();
    let mut parsed: Option<GenerateMcQuestionsResponse> = None;
    let mut repair_attempts = 0usize;
    let mut repair_path: Vec<String> = Vec::new();
    let mut constrained_regeneration_used = false;
    let mut total_attempts = 1usize;

    for attempt in 0..=GENERATION_REPAIR_RETRIES {
        emit_generation_status(
            &app,
            "multiple-choice",
            "validating",
            "Validating the model response.",
            total_attempts,
        );
        match parse_mc_response_candidate(&content, &request, selected_subtopics) {
            Ok(candidate) => {
                parsed = Some(candidate);
                break;
            }
            Err(issue) => {
                parse_issue = issue;
                if attempt == GENERATION_REPAIR_RETRIES {
                    break;
                }
                repair_attempts += 1;
                repair_path.push("json-repair".to_string());
                total_attempts += 1;
                emit_generation_status(
                    &app,
                    "multiple-choice",
                    "repairing",
                    format!("Repairing invalid model output (pass {}).", repair_attempts),
                    total_attempts,
                );
                let repaired = request_json_repair(
                    &request.api_key,
                    &request.model,
                    MC_QUESTION_JSON_CONTRACT,
                    &content,
                    &parse_issue,
                    response_format.as_ref(),
                )
                .await?;
                structured_output_unsupported =
                    structured_output_unsupported || repaired.structured_output_unsupported_fallback;
                content = repaired.content;
            }
        }
    }

    if parsed.is_none() {
        constrained_regeneration_used = true;
        total_attempts += 1;
        repair_path.push("schema-constrained-regeneration".to_string());
        emit_generation_status(
            &app,
            "multiple-choice",
            "regenerating",
            "Retrying with a stricter regeneration prompt.",
            total_attempts,
        );
        let regenerated = request_schema_constrained_regeneration(
            &request.api_key,
            &request.model,
            &user_prompt,
            MC_QUESTION_JSON_CONTRACT,
            &parse_issue,
            &base_user_content,
            plugins.as_ref(),
            response_format.as_ref(),
        )
        .await?;
        structured_output_unsupported =
            structured_output_unsupported || regenerated.structured_output_unsupported_fallback;
        content = regenerated.content;

        match parse_mc_response_candidate(&content, &request, selected_subtopics) {
            Ok(candidate) => parsed = Some(candidate),
            Err(issue) => parse_issue = issue,
        }
    }

    let mut parsed = parsed.ok_or_else(|| {
        emit_generation_status(
            &app,
            "multiple-choice",
            "failed",
            format!("Generation failed after {} attempt(s).", total_attempts),
            total_attempts,
        );
        AppError::new(
            "MODEL_PARSE_ERROR",
            format!(
                "Could not parse multiple-choice questions after repair attempts. {} Try again or switch model.",
                parse_issue
            ),
        )
    })?;

    // Override techAllowed for non-mix modes
    match tech_mode_mc {
        "tech-free" => {
            for question in &mut parsed.questions {
                question.tech_allowed = false;
            }
        }
        "tech-active" => {
            for question in &mut parsed.questions {
                question.tech_allowed = true;
            }
        }
        _ => {}
    }

    let quality_summary = score_mc_question_quality(&mut parsed.questions);
    let telemetry = GenerationTelemetry {
        difficulty: request.difficulty.clone(),
        total_attempts,
        repair_attempts,
        constrained_regeneration_used,
        repair_path,
        duration_ms: generation_started.elapsed().as_millis() as u64,
        structured_output_status: Some(
            if request.use_structured_output.unwrap_or(false) {
                if structured_output_unsupported {
                    "not-supported-fallback"
                } else {
                    "used"
                }
            } else {
                "not-requested"
            }
            .to_string(),
        ),
        distinctness_avg: quality_summary.distinctness_avg,
        multi_step_depth_avg: quality_summary.multi_step_depth_avg,
    };

    emit_generation_status(
        &app,
        "multiple-choice",
        "completed",
        format!("Multiple-choice set ready in {} ms.", telemetry.duration_ms),
        total_attempts,
    );

    Ok(GenerateMcQuestionsResponse {
        questions: parsed.questions,
        raw_model_output: content,
        telemetry: Some(telemetry),
    })
}

fn default_question_max_marks() -> u8 {
    10
}

fn difficulty_guidance(level: &str) -> &'static str {
    if level.eq_ignore_ascii_case("essential skills") {
        "- Target essential syllabus skills only: direct recall, direct substitution, and straightforward procedure execution.\n- Keep cognitive load low: minimal analysis, minimal context decoding, and no hidden method-switching.\n- Prefer one-step to short two-step tasks using familiar phrasing and standard forms."
    } else if level.eq_ignore_ascii_case("easy") {
        "- Target foundational understanding and direct application.\n- Use familiar contexts with minimal distractor complexity.\n- Keep reasoning steps short and explicit."
    } else if level.eq_ignore_ascii_case("medium") {
        "- Require multi-step reasoning with at least two linked concepts.\n- Include non-routine context shifts that require method choice.\n- Use realistic exam pressure through concise but information-dense prompts."
    } else if level.eq_ignore_ascii_case("hard") {
        "- Construct discriminator-level challenges that pivot on information-dense narratives, requiring students to synthesize multiple areas of the VCE Study Design simultaneously.\n- Use sophisticated wording to present edge-case scenarios or restricted domains that intentionally subvert rote-learned templates and punish routine algorithm application.\n- Require the student to articulate a rigorous, error-resistant reasoning chain that justifies their specific method selection amidst competing constraints."
    } else {
        "- Transcend standard VCE exam rigor by targeting an intellectual depth comparable to mathematical olympiads or introductory university analysis.\n- Employ abstract, multi-layered prose that embeds implicit constraints and requires the construction of original sub-results or cross-domain derivations (e.g., linking complex probability transformations with calculus optimization).\n- Maximize cognitive load through unfamiliar problem framings that offer zero reliance on template recall, forcing a deep conceptual derivation of the solution from first principles."
    }
}

fn normalize_prioritized_command_terms(
    raw_terms: Option<&[String]>,
) -> Vec<&'static CommandTermProfile> {
    raw_terms
        .unwrap_or(&[])
        .iter()
        .filter_map(|term| find_command_term_profile(term.trim()))
        .fold(Vec::new(), |mut acc, profile| {
            if !acc.iter().any(|item| item.key == profile.key) {
                acc.push(profile);
            }
            acc
        })
}

fn find_command_term_profile(value: &str) -> Option<&'static CommandTermProfile> {
    let normalized = value.to_ascii_lowercase();
    COMMAND_TERM_PROFILES
        .iter()
        .find(|profile| profile.key == normalized)
}

fn infer_prompt_command_term(prompt: &str) -> Option<&'static CommandTermProfile> {
    let leading_token = prompt
        .split_whitespace()
        .next()
        .map(|token| {
            token
                .trim_matches(|ch: char| !ch.is_ascii_alphabetic())
                .to_ascii_lowercase()
        })
        .unwrap_or_default();

    COMMAND_TERM_PROFILES
        .iter()
        .find(|profile| profile.key == leading_token)
}

fn build_command_term_guidance_note(
    prioritized_terms: &[&'static CommandTermProfile],
    topics: &[String],
) -> String {
    let has_non_math_topic = topics.iter().any(|topic| !is_math_topic(topic));
    if !has_non_math_topic {
        return "\n- Do not use command-term prioritisation for Mathematics topics.".to_string();
    }

    let selected_terms = if prioritized_terms.is_empty() {
        "Evaluate".to_string()
    } else {
        prioritized_terms
            .iter()
            .map(|term| term.display)
            .collect::<Vec<_>>()
            .join(", ")
    };

    let lower_than_evaluate_terms = COMMAND_TERM_PROFILES
        .iter()
        .filter(|term| term.below_evaluate)
        .map(|term| term.display)
        .collect::<Vec<_>>()
        .join(", ");

    if prioritized_terms.len() == 1 {
        let term = prioritized_terms[0].display;
        return format!(
            "\n- For non-Mathematics topics, every prompt MUST start with exactly this command term: {term}. Do not use any other command term.\n- The prompt context must match what {term} requires a student to do in order to answer successfully.\n- Questions using these command terms should usually carry fewer marks than Evaluate: {lower_than_evaluate_terms}."
        );
    }

    format!(
        "\n- For non-Mathematics topics, start each prompt with one of these command terms and prioritise them across the set: {selected_terms}.\n- The prompt context must match what the chosen command term requires a student to do in order to answer successfully.\n- Questions using these command terms should usually carry fewer marks than Evaluate: {lower_than_evaluate_terms}."
    )
}

fn build_subtopic_instructions_note(
    selected_subtopics: Option<&Vec<String>>,
    subtopic_instructions: Option<&HashMap<String, String>>,
) -> String {
    let Some(subs) = selected_subtopics else {
        return String::new();
    };
    let Some(instructions) = subtopic_instructions else {
        return String::new();
    };

    let mut lines = Vec::new();
    for subtopic in subs {
        let Some(instruction) = instructions.get(subtopic) else {
            continue;
        };
        let trimmed = instruction.trim();
        if trimmed.is_empty() {
            continue;
        }
        lines.push(format!("- {subtopic}: {trimmed}"));
    }

    if lines.is_empty() {
        return String::new();
    }

    format!(
        "\n\nSubtopic-specific constraints (mandatory when the subtopic is selected):\n{}",
        lines.join("\n")
    )
}

fn is_math_topic(topic: &str) -> bool {
    topic == "Mathematical Methods" || topic == "Specialist Mathematics"
}

#[derive(Default)]
struct BatchQualitySummary {
    distinctness_avg: Option<f32>,
    multi_step_depth_avg: Option<f32>,
}

fn parse_written_response_candidate(
    content: &str,
    request: &GenerateQuestionsRequest,
    selected_subtopics: Option<&Vec<String>>,
    selected_english_task_types: &[&str],
    prioritized_command_terms: &[&'static CommandTermProfile],
) -> Result<GenerateQuestionsResponse, String> {
    let payload = parse_json_object(content)
        .ok_or_else(|| "No valid JSON object found in model output.".to_string())?;

    let value: serde_json::Value = serde_json::from_str(&payload)
        .map_err(|err| format!("Response JSON was invalid: {err}"))?;
    let normalized = normalize_questions_envelope(value)
        .map_err(|issue| format!("Response JSON did not match schema: {issue}"))?;

    let mut candidate: GenerateQuestionsResponse = serde_json::from_value(normalized)
        .map_err(|err| format!("Response JSON did not match schema: {err}"))?;

    normalize_written_questions(
        &mut candidate.questions,
        &request.topics,
        selected_subtopics,
        selected_english_task_types,
        prioritized_command_terms,
    );

    validate_written_questions(
        &candidate.questions,
        &request.topics,
        request.question_count,
        selected_english_task_types,
        selected_subtopics,
        prioritized_command_terms,
    )?;

    Ok(candidate)
}

fn parse_passage_response_candidate(
    content: &str,
    request: &GeneratePassageQuestionsRequest,
) -> Result<GeneratePassageResponse, String> {
    let payload = parse_json_object(content)
        .ok_or_else(|| "No valid JSON object found in model output.".to_string())?;

    let mut candidate: GeneratePassageResponse = serde_json::from_str(&payload)
        .map_err(|err| format!("Response JSON did not match schema: {err}"))?;

    normalize_generated_passage(&mut candidate.passage, &request.aos_subtopic);
    validate_generated_passage(&candidate.passage, request.question_count, &request.aos_subtopic)?;

    Ok(candidate)
}

fn parse_mc_response_candidate(
    content: &str,
    request: &GenerateMcQuestionsRequest,
    selected_subtopics: Option<&Vec<String>>,
) -> Result<GenerateMcQuestionsResponse, String> {
    let payload = parse_json_object(content)
        .ok_or_else(|| "No valid JSON object found in model output.".to_string())?;

    let value: serde_json::Value = serde_json::from_str(&payload)
        .map_err(|err| format!("Response JSON was invalid: {err}"))?;
    let normalized = normalize_questions_envelope(value)
        .map_err(|issue| format!("Response JSON did not match schema: {issue}"))?;

    let mut candidate: GenerateMcQuestionsResponse = serde_json::from_value(normalized)
        .map_err(|err| format!("Response JSON did not match schema: {err}"))?;

    normalize_mc_questions(&mut candidate.questions, selected_subtopics);
    validate_mc_questions(&candidate.questions, request.question_count, selected_subtopics)?;

    Ok(candidate)
}

async fn request_schema_constrained_regeneration(
    api_key: &str,
    model: &str,
    original_prompt: &str,
    json_contract: &str,
    previous_issue: &str,
    base_user_content: &serde_json::Value,
    plugins: Option<&serde_json::Value>,
    response_format: Option<&serde_json::Value>,
) -> CommandResult<OpenRouterCallResult> {
    let strict_prefix = format!(
        "Schema-constrained regeneration requested because prior repair failed.\nPrevious issue: {previous_issue}\n\nOutput requirements:\n- Return valid JSON only\n- No markdown fences\n- No commentary\n- Must match schema exactly: {json_contract}\n\nOriginal generation prompt:\n{original_prompt}"
    );

    let user_content = match base_user_content {
        serde_json::Value::String(_) => serde_json::Value::String(strict_prefix),
        serde_json::Value::Array(parts) => {
            let mut updated = Vec::with_capacity(parts.len() + 1);
            updated.push(serde_json::json!({
                "type": "text",
                "text": strict_prefix,
            }));
            updated.extend(parts.iter().cloned());
            serde_json::Value::Array(updated)
        }
        _ => serde_json::Value::String(strict_prefix),
    };

    call_openrouter_with_plugins(
        api_key,
        model,
        "You are a strict schema-constrained generator. Return only valid JSON matching the required schema exactly.",
        user_content,
        plugins.cloned(),
        response_format.cloned(),
    )
    .await
}

fn score_written_question_quality(questions: &mut [GeneratedQuestion]) -> BatchQualitySummary {
    let prompt_texts = questions
        .iter()
        .map(|q| q.prompt_markdown.as_str())
        .collect::<Vec<_>>();
    let distinctness_scores = distinctness_scores_for_texts(&prompt_texts);
    let multi_step_scores = prompt_texts
        .iter()
        .map(|text| estimate_multi_step_depth(text))
        .collect::<Vec<_>>();

    for (idx, question) in questions.iter_mut().enumerate() {
        question.distinctness_score = distinctness_scores.get(idx).copied();
        question.multi_step_depth = multi_step_scores.get(idx).copied();
    }

    BatchQualitySummary {
        distinctness_avg: average_score(&distinctness_scores),
        multi_step_depth_avg: average_score(&multi_step_scores),
    }
}

fn score_mc_question_quality(questions: &mut [McQuestion]) -> BatchQualitySummary {
    let prompt_texts = questions
        .iter()
        .map(|q| {
            let options = q
                .options
                .iter()
                .map(|opt| format!("{}: {}", opt.label, opt.text))
                .collect::<Vec<_>>()
                .join(" ");
            format!("{} {}", q.prompt_markdown, options)
        })
        .collect::<Vec<_>>();

    let prompt_refs = prompt_texts.iter().map(String::as_str).collect::<Vec<_>>();
    let distinctness_scores = distinctness_scores_for_texts(&prompt_refs);
    let multi_step_scores = prompt_refs
        .iter()
        .map(|text| estimate_multi_step_depth(text))
        .collect::<Vec<_>>();

    for (idx, question) in questions.iter_mut().enumerate() {
        question.distinctness_score = distinctness_scores.get(idx).copied();
        question.multi_step_depth = multi_step_scores.get(idx).copied();
    }

    BatchQualitySummary {
        distinctness_avg: average_score(&distinctness_scores),
        multi_step_depth_avg: average_score(&multi_step_scores),
    }
}

fn distinctness_scores_for_texts(texts: &[&str]) -> Vec<f32> {
    if texts.is_empty() {
        return Vec::new();
    }

    let token_sets = texts
        .iter()
        .map(|text| tokenize_for_similarity(text))
        .collect::<Vec<_>>();

    token_sets
        .iter()
        .enumerate()
        .map(|(idx, current)| {
            let max_similarity = token_sets
                .iter()
                .enumerate()
                .filter(|(other_idx, _)| *other_idx != idx)
                .map(|(_, other)| jaccard_similarity(current, other))
                .fold(0.0f32, f32::max);
            round_score((1.0 - max_similarity).clamp(0.0, 1.0))
        })
        .collect()
}

fn tokenize_for_similarity(text: &str) -> HashSet<String> {
    text.to_ascii_lowercase()
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .filter(|token| token.len() >= 3)
        .map(str::to_string)
        .collect()
}

fn jaccard_similarity(left: &HashSet<String>, right: &HashSet<String>) -> f32 {
    if left.is_empty() && right.is_empty() {
        return 1.0;
    }

    let intersection = left.intersection(right).count() as f32;
    let union = left.union(right).count() as f32;
    if union == 0.0 {
        0.0
    } else {
        intersection / union
    }
}

fn estimate_multi_step_depth(text: &str) -> f32 {
    let lowered = text.to_ascii_lowercase();
    let step_markers = [" then ", " after ", " hence ", " therefore ", "finally", "first", "second"]
        .iter()
        .filter(|marker| lowered.contains(*marker))
        .count();
    let reasoning_verbs = [
        "derive", "differentiate", "integrate", "justify", "prove", "compare", "evaluate", "solve",
        "estimate", "show", "determine", "calculate",
    ]
    .iter()
    .filter(|verb| lowered.contains(*verb))
    .count();
    let operator_count = lowered
        .chars()
        .filter(|ch| matches!(ch, '=' | '+' | '-' | '*' | '/' | '^'))
        .count();

    let raw_depth = 1.0
        + (step_markers as f32 * 0.35)
        + (reasoning_verbs as f32 * 0.25)
        + ((operator_count.min(12) as f32) * 0.05);

    round_score(raw_depth.clamp(1.0, 5.0))
}

fn average_score(values: &[f32]) -> Option<f32> {
    if values.is_empty() {
        return None;
    }
    Some(round_score(values.iter().sum::<f32>() / values.len() as f32))
}

fn build_similarity_guardrail_note(enabled: bool, prior_prompts: Option<&[String]>) -> String {
    if !enabled {
        return String::new();
    }

    let mut sanitized = prior_prompts
        .unwrap_or(&[])
        .iter()
        .map(|prompt| prompt.trim())
        .filter(|prompt| !prompt.is_empty())
        .map(|prompt| prompt.replace('\n', " "))
        .map(|prompt| prompt.replace('\r', " "))
        .map(|prompt| {
            if prompt.len() > 260 {
                format!("{}...", &prompt[..260])
            } else {
                prompt
            }
        })
        .collect::<Vec<_>>();

    sanitized.truncate(6);

    if sanitized.is_empty() {
        return "\n\nSimilarity guardrail:\n- Avoid generating prompts that are too similar to the user's recently completed same-topic questions.\n- Vary both context and required solving method from recent attempts.".to_string();
    }

    let examples = sanitized
        .iter()
        .enumerate()
        .map(|(idx, prompt)| format!("{}. {}", idx + 1, prompt))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "\n\nSimilarity guardrail:\n- Avoid generating prompts that are too similar to these recently completed same-topic questions:\n{examples}\n- Do not reuse their core scenario, numeric framing, or primary solving path.\n- Keep level and syllabus alignment, but change context and reasoning structure."
    )
}

fn round_score(value: f32) -> f32 {
    (value * 100.0).round() / 100.0
}

fn normalize_written_questions(
    questions: &mut [GeneratedQuestion],
    selected_topics: &[String],
    selected_subtopics: Option<&Vec<String>>,
    selected_english_task_types: &[&str],
    prioritized_command_terms: &[&'static CommandTermProfile],
) {
    let includes_english = includes_english_language(selected_topics);

    for question in questions {
        let mut normalized_marks = if question.max_marks == 0 {
            default_question_max_marks()
        } else {
            question.max_marks
        };

        if let Some(profile) = infer_prompt_command_term(&question.prompt_markdown) {
            normalized_marks = normalized_marks.clamp(profile.min_marks, profile.max_marks);
        } else if let Some(profile) = prioritized_command_terms.first().copied() {
            normalized_marks = normalized_marks.clamp(profile.min_marks, profile.max_marks);
        }

        if question
            .subtopic
            .as_ref()
            .map(|s| s.trim().is_empty())
            .unwrap_or(true)
        {
            question.subtopic = selected_subtopics
                .filter(|subs| subs.len() == 1)
                .and_then(|subs| subs.first().cloned());
        }

        question.prompt_markdown = decode_literal_newlines(&question.prompt_markdown).trim().to_string();
        question.topic = question.topic.trim().to_string();
        question.id = question.id.trim().to_string();
        question.max_marks = normalized_marks.clamp(1, 30);
        question.subtopic = question
            .subtopic
            .as_ref()
            .map(|subtopic| subtopic.trim().to_string())
            .filter(|subtopic| !subtopic.is_empty());

        if includes_english && is_english_language_topic(&question.topic) {
            let normalized_task_type = question
                .task_type
                .as_ref()
                .map(|value| value.trim().to_ascii_lowercase())
                .and_then(|value| match value.as_str() {
                    "short-answer" => Some("short-answer".to_string()),
                    "analytical-essay" => Some("analytical-essay".to_string()),
                    _ => None,
                });

            let selected_task_type = if selected_english_task_types.len() == 1 {
                selected_english_task_types.first().map(|value| (*value).to_string())
            } else {
                None
            };

            question.task_type = normalized_task_type.or(selected_task_type);
            question.recommended_response_length = match question.task_type.as_deref() {
                Some("short-answer") => Some("short".to_string()),
                Some("analytical-essay") => Some("extended".to_string()),
                _ => question
                    .recommended_response_length
                    .as_ref()
                    .map(|value| value.trim().to_ascii_lowercase())
                    .and_then(|value| match value.as_str() {
                        "short" => Some("short".to_string()),
                        "extended" => Some("extended".to_string()),
                        _ => None,
                    }),
            };
        } else {
            question.task_type = None;
            question.recommended_response_length = None;
        }
    }
}

fn normalize_mc_questions(questions: &mut [McQuestion], selected_subtopics: Option<&Vec<String>>) {
    for question in questions {
        if question
            .subtopic
            .as_ref()
            .map(|s| s.trim().is_empty())
            .unwrap_or(true)
        {
            question.subtopic = selected_subtopics
                .filter(|subs| subs.len() == 1)
                .and_then(|subs| subs.first().cloned());
        }

        question.prompt_markdown = decode_literal_newlines(&question.prompt_markdown).trim().to_string();
        question.explanation_markdown = decode_literal_newlines(&question.explanation_markdown).trim().to_string();
        question.correct_answer = question.correct_answer.trim().to_uppercase();
        question.topic = question.topic.trim().to_string();
        question.id = question.id.trim().to_string();
        question.subtopic = question
            .subtopic
            .as_ref()
            .map(|subtopic| subtopic.trim().to_string())
            .filter(|subtopic| !subtopic.is_empty());
        for opt in &mut question.options {
            opt.label = opt.label.trim().to_uppercase();
            opt.text = decode_literal_newlines(&opt.text).trim().to_string();
        }
    }
}

fn normalize_generated_passage(passage: &mut GeneratedPassage, selected_aos_subtopic: &str) {
    passage.id = passage.id.trim().to_string();
    passage.text = decode_literal_newlines(&passage.text)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    passage.aos_subtopic = if passage.aos_subtopic.trim().is_empty() {
        selected_aos_subtopic.trim().to_string()
    } else {
        passage.aos_subtopic.trim().to_string()
    };

    for question in &mut passage.questions {
        question.id = question.id.trim().to_string();
        question.prompt_markdown = decode_literal_newlines(&question.prompt_markdown)
            .trim()
            .to_string();
        question.max_marks = question.max_marks.clamp(1, 5);
    }
}

fn pick_passage_text_type() -> &'static str {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.subsec_nanos() as usize)
        .unwrap_or(0);
    let index = nanos % PASSAGE_TEXT_TYPE_OPTIONS.len();
    PASSAGE_TEXT_TYPE_OPTIONS[index]
}

fn validate_written_questions(
    questions: &[GeneratedQuestion],
    selected_topics: &[String],
    expected_count: usize,
    selected_english_task_types: &[&str],
    _selected_subtopics: Option<&Vec<String>>,
    prioritized_command_terms: &[&'static CommandTermProfile],
) -> Result<(), String> {
    if questions.is_empty() {
        return Err("The model returned no questions.".to_string());
    }

    if questions.len() != expected_count {
        return Err(format!(
            "Expected exactly {expected_count} questions but received {}.",
            questions.len()
        ));
    }

    let requires_english_task_type = includes_english_language(selected_topics);
    let mut english_short_answer_count = 0usize;
    let mut english_analytical_essay_count = 0usize;

    for question in questions {
        if question.id.is_empty() {
            return Err("A question is missing id.".to_string());
        }
        if question.topic.is_empty() {
            return Err("A question is missing topic.".to_string());
        }
        if question.prompt_markdown.is_empty() {
            return Err(format!("Question {} has empty promptMarkdown.", question.id));
        }
        if question.max_marks == 0 || question.max_marks > 30 {
            return Err(format!("Question {} has invalid maxMarks.", question.id));
        }

        if prioritized_command_terms.len() == 1 && !is_math_topic(&question.topic) {
            let required_term = prioritized_command_terms[0];
            let used_term = infer_prompt_command_term(&question.prompt_markdown);
            if used_term.map(|term| term.key) != Some(required_term.key) {
                return Err(format!(
                    "Question {} must begin with command term '{}' for non-Mathematics topics.",
                    question.id, required_term.display
                ));
            }
        }

        if requires_english_task_type && is_english_language_topic(&question.topic) {
            let task_type = question.task_type.as_deref().ok_or_else(|| {
                format!(
                    "Question {} is an English Language question and must include taskType.",
                    question.id
                )
            })?;

            if !selected_english_task_types.contains(&task_type) {
                return Err(format!(
                    "Question {} has taskType '{}' outside selected English task types.",
                    question.id, task_type
                ));
            }

            match task_type {
                "short-answer" => english_short_answer_count += 1,
                "analytical-essay" => english_analytical_essay_count += 1,
                _ => {
                    return Err(format!(
                        "Question {} has invalid taskType '{}'.",
                        question.id, task_type
                    ));
                }
            }
        }
    }

    if requires_english_task_type
        && selected_english_task_types.contains(&"short-answer")
        && selected_english_task_types.contains(&"analytical-essay")
        && expected_count >= 2
    {
        if english_short_answer_count == 0 || english_analytical_essay_count == 0 {
            return Err("English Language generation must include at least one short-answer and one analytical-essay question when both task types are selected and question count is at least 2.".to_string());
        }
    }

    Ok(())
}

fn validate_generated_passage(
    passage: &GeneratedPassage,
    expected_count: usize,
    selected_aos_subtopic: &str,
) -> Result<(), String> {
    if passage.id.is_empty() {
        return Err("The passage is missing id.".to_string());
    }

    if passage.text.is_empty() {
        return Err("The passage text is empty.".to_string());
    }

    let lines = passage
        .text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();

    if lines.len() < PASSAGE_MIN_LINES || lines.len() > PASSAGE_MAX_LINES {
        return Err(format!(
            "The passage must contain between {} and {} non-empty lines, but it had {}.",
            PASSAGE_MIN_LINES,
            PASSAGE_MAX_LINES,
            lines.len()
        ));
    }

    for (index, line) in lines.iter().enumerate() {
        let words = line.split_whitespace().count();
        if words > PASSAGE_MAX_WORDS_PER_LINE {
            return Err(format!(
                "Passage line {} is too long ({} words). Keep each line at {} words or fewer.",
                index + 1,
                words,
                PASSAGE_MAX_WORDS_PER_LINE
            ));
        }

        if has_manual_line_number_prefix(line) {
            return Err(format!(
                "Passage line {} appears to include a manual line number prefix. Remove in-text numbering because the frontend renders line numbers.",
                index + 1
            ));
        }
    }

    if passage.aos_subtopic.trim() != selected_aos_subtopic.trim() {
        return Err("The generated passage did not match the selected Area of Study.".to_string());
    }

    if passage.questions.len() != expected_count {
        return Err(format!(
            "Expected exactly {expected_count} passage questions but received {}.",
            passage.questions.len()
        ));
    }

    for question in &passage.questions {
        if question.id.is_empty() {
            return Err("A passage question is missing id.".to_string());
        }
        if question.prompt_markdown.is_empty() {
            return Err(format!("Passage question {} has empty promptMarkdown.", question.id));
        }
        if question.max_marks == 0 || question.max_marks > 5 {
            return Err(format!("Passage question {} has invalid maxMarks.", question.id));
        }

        let prompt_lower = question.prompt_markdown.to_ascii_lowercase();
        let has_numeric_line_reference = prompt_lower.chars().any(|ch| ch.is_ascii_digit());
        if !prompt_lower.contains("line") || !has_numeric_line_reference {
            return Err(format!(
                "Passage question {} must include an explicit numeric line reference.",
                question.id
            ));
        }
    }

    Ok(())
}

fn has_manual_line_number_prefix(line: &str) -> bool {
    let trimmed = line.trim_start();
    let digit_count = trimmed
        .chars()
        .take_while(|ch| ch.is_ascii_digit())
        .count();

    if digit_count == 0 || digit_count > 3 {
        return false;
    }

    let remainder = trimmed[digit_count..].trim_start();
    remainder.starts_with('.')
        || remainder.starts_with(')')
        || remainder.starts_with(':')
        || remainder.starts_with('-')
}

fn validate_mc_questions(
    questions: &[McQuestion],
    expected_count: usize,
    _selected_subtopics: Option<&Vec<String>>,
) -> Result<(), String> {
    if questions.is_empty() {
        return Err("The model returned no questions.".to_string());
    }

    if questions.len() != expected_count {
        return Err(format!(
            "Expected exactly {expected_count} questions but received {}.",
            questions.len()
        ));
    }

    for question in questions {
        if question.id.is_empty() {
            return Err("A multiple-choice question is missing id.".to_string());
        }
        if question.topic.is_empty() {
            return Err(format!("Question {} is missing topic.", question.id));
        }
        if question.prompt_markdown.is_empty() {
            return Err(format!("Question {} has empty promptMarkdown.", question.id));
        }
        if question.explanation_markdown.is_empty() {
            return Err(format!("Question {} has empty explanationMarkdown.", question.id));
        }
        let explanation_word_count = question
            .explanation_markdown
            .split_whitespace()
            .count();
        if explanation_word_count > MC_EXPLANATION_MAX_WORDS {
            return Err(format!(
                "Question {} explanationMarkdown is too long ({} words; max {}).",
                question.id, explanation_word_count, MC_EXPLANATION_MAX_WORDS
            ));
        }

        let explanation_lower = question.explanation_markdown.to_lowercase();
        let disallowed_meta_reasoning_markers = [
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
        if disallowed_meta_reasoning_markers
            .iter()
            .any(|marker| explanation_lower.contains(marker))
        {
            return Err(format!(
                "Question {} explanationMarkdown contains disallowed self-talk or prompt-rewrite meta reasoning.",
                question.id
            ));
        }

        if question.options.len() != 4 {
            return Err(format!("Question {} must contain exactly 4 options.", question.id));
        }

        let mut labels = question
            .options
            .iter()
            .map(|option| option.label.clone())
            .collect::<Vec<_>>();
        labels.sort();
        if labels != vec!["A".to_string(), "B".to_string(), "C".to_string(), "D".to_string()] {
            return Err(format!("Question {} options must be labeled A, B, C, D.", question.id));
        }

        if !matches!(question.correct_answer.as_str(), "A" | "B" | "C" | "D") {
            return Err(format!("Question {} has invalid correctAnswer.", question.id));
        }

    }

    Ok(())
}

fn english_language_passage_instruction(aos_subtopic: &str) -> &'static str {
    match aos_subtopic.trim() {
        "Unit 1 AOS 1: Nature and Functions of Language" => "Focus on the nature and functions of language, especially situational context, register, lexical and syntactic choices, sentence structures, modal verbs, clauses, and the major functions of language.",
        "Unit 1 AOS 2: Language Acquisition" => "Focus on acquisition evidence such as developmental features, overgeneralisation, caretaker talk, and linguistic milestones.",
        "Unit 2 AOS 1: English Across Time" => "Focus on historical development of English, language change, lexical shift, and social or technological influences on change.",
        "Unit 2 AOS 2: Englishes in Contact" => "Focus on contact varieties, borrowing, world Englishes, Aboriginal Englishes, prestige, attitudes, and identity impacts.",
        "Unit 3 AOS 1: Informality" => "Focus on informal Australian English, rapport building, discourse particles, idioms, contractions, and interactional strategies.",
        "Unit 3 AOS 2: Formality" => "Focus on formal register, authority, nominalisation, modality, hedging, politeness, and discourse structure.",
        "Unit 4 AOS 1: Language Variation in Australian Society" => "Focus on variation across dialects, social meaning, identity, power, and attitudes toward language varieties in Australia.",
        "Unit 4 AOS 2: Individual and Group Identities" => "Focus on idiolect, sociolect, group affiliation, inclusion, exclusion, authority, authenticity, and language choices shaping identity.",
        _ => "Focus tightly on the selected VCE English Language Area of Study and reward precise metalanguage tied directly to textual evidence.",
    }
}

async fn request_json_repair(
    api_key: &str,
    model: &str,
    json_contract: &str,
    raw_output: &str,
    parse_issue: &str,
    response_format: Option<&serde_json::Value>,
) -> CommandResult<OpenRouterCallResult> {
    let prompt = format!(
        "Repair the model output into valid JSON that follows the required schema exactly.\n\nIssue detected: {parse_issue}\n\nRules:\n- Output JSON only\n- No markdown fences\n- No extra keys beyond schema\n- Preserve original educational intent\n\nRequired schema:\n{json_contract}\n\nModel output to repair:\n{raw_output}",
    );

    call_openrouter(
        api_key,
        model,
        "You are a strict JSON repair engine. Return only valid JSON that matches the required schema.",
        serde_json::Value::String(prompt),
        response_format,
    )
    .await
}

fn normalize_questions_envelope(value: serde_json::Value) -> Result<serde_json::Value, String> {
    if value.is_array() {
        return Ok(serde_json::json!({ "questions": value }));
    }

    let serde_json::Value::Object(mut map) = value else {
        return Err("Top-level JSON must be an object or array of questions.".to_string());
    };

    if map
        .get("questions")
        .map(serde_json::Value::is_array)
        .unwrap_or(false)
    {
        return Ok(serde_json::Value::Object(map));
    }

    for key in [
        "question",
        "items",
        "mcQuestions",
        "multipleChoiceQuestions",
        "generatedQuestions",
    ] {
        if let Some(array) = map.remove(key).filter(serde_json::Value::is_array) {
            map.insert("questions".to_string(), array);
            return Ok(serde_json::Value::Object(map));
        }
    }

    for key in ["data", "result", "output", "payload"] {
        if let Some(serde_json::Value::Object(nested)) = map.get(key) {
            if let Some(array) = nested.get("questions").filter(|value| value.is_array()) {
                map.insert("questions".to_string(), array.clone());
                return Ok(serde_json::Value::Object(map));
            }
        }
    }

    let keys = map.keys().cloned().collect::<Vec<_>>().join(", ");
    Err(format!(
        "Missing required top-level questions array. Found keys: [{}].",
        keys
    ))
}

fn decode_literal_newlines(value: &str) -> String {
    let mut decoded = String::with_capacity(value.len());
    let chars: Vec<char> = value.chars().collect();
    let mut index = 0;

    while index < chars.len() {
        if chars[index] == '\\' {
            if index + 3 < chars.len()
                && chars[index + 1] == 'r'
                && chars[index + 2] == '\\'
                && chars[index + 3] == 'n'
            {
                decoded.push('\n');
                index += 4;
                continue;
            }

            if index + 1 < chars.len() && chars[index + 1] == 'n' {
                let next_after_n = chars.get(index + 2).copied();
                // Preserve common LaTeX commands such as \neq, \nabla, etc.
                if next_after_n.is_some_and(|ch| ch.is_ascii_lowercase()) {
                    decoded.push('\\');
                    decoded.push('n');
                } else {
                    decoded.push('\n');
                }
                index += 2;
                continue;
            }
        }

        decoded.push(chars[index]);
        index += 1;
    }

    decoded
}

fn parse_json_object(content: &str) -> Option<String> {
    let trimmed = content.trim();
    if trimmed.starts_with('{')
        && serde_json::from_str::<serde_json::Value>(trimmed)
            .map(|value| value.is_object())
            .unwrap_or(false)
    {
        return Some(trimmed.to_string());
    }

    for (index, ch) in content.char_indices() {
        if ch != '{' {
            continue;
        }

        let slice = &content[index..];
        let mut stream = serde_json::Deserializer::from_str(slice).into_iter::<serde_json::Value>();
        if let Some(Ok(value)) = stream.next() {
            if value.is_object() {
                let end = index + stream.byte_offset();
                return content.get(index..end).map(str::to_string);
            }
        }
    }

    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_persisted_state,
            save_persisted_state,
            generate_questions,
            generate_passage_questions,
            mark_answer,
            mark_passage_answer,
            analyze_image,
            generate_mc_questions
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_json_object_extracts_fenced_payload() {
        let content = "Here is your output:\n```json\n{\"questions\":[{\"id\":\"q1\",\"topic\":\"Mathematical Methods\",\"promptMarkdown\":\"Find x\",\"maxMarks\":2,\"techAllowed\":false}]}\n```";
        let parsed = parse_json_object(content);
        assert!(parsed.is_some());
        let value: serde_json::Value = serde_json::from_str(&parsed.unwrap()).unwrap();
        assert!(value.get("questions").is_some());
    }

    #[test]
    fn parse_json_object_returns_none_for_invalid_payload() {
        let content = "No valid object here: {missing: quotes}";
        assert!(parse_json_object(content).is_none());
    }

    #[test]
    fn validate_written_questions_rejects_wrong_count() {
        let questions = vec![GeneratedQuestion {
            id: "q1".to_string(),
            topic: "Mathematical Methods".to_string(),
            subtopic: None,
            task_type: None,
            recommended_response_length: None,
            prompt_markdown: "Find the derivative.".to_string(),
            max_marks: 4,
            tech_allowed: false,
            distinctness_score: None,
            multi_step_depth: None,
        }];

        let selected_topics = vec!["Mathematical Methods".to_string()];
        let result = validate_written_questions(&questions, &selected_topics, 2, &[], None, &[]);
        assert!(result.is_err());
    }

    #[test]
    fn validate_mc_questions_rejects_invalid_option_labels() {
        let questions = vec![McQuestion {
            id: "mc1".to_string(),
            topic: "Chemistry".to_string(),
            subtopic: None,
            prompt_markdown: "Which option is correct?".to_string(),
            options: vec![
                McOption {
                    label: "A".to_string(),
                    text: "Option 1".to_string(),
                },
                McOption {
                    label: "B".to_string(),
                    text: "Option 2".to_string(),
                },
                McOption {
                    label: "C".to_string(),
                    text: "Option 3".to_string(),
                },
                McOption {
                    label: "E".to_string(),
                    text: "Option 4".to_string(),
                },
            ],
            correct_answer: "A".to_string(),
            explanation_markdown: "Because...".to_string(),
            tech_allowed: false,
            distinctness_score: None,
            multi_step_depth: None,
        }];

        let result = validate_mc_questions(&questions, 1, None);
        assert!(result.is_err());
    }

    #[test]
    fn validate_written_questions_allows_non_identical_subtopic() {
        let questions = vec![GeneratedQuestion {
            id: "q1".to_string(),
            topic: "Mathematical Methods".to_string(),
            subtopic: Some("Functions and Graphs".to_string()),
            task_type: None,
            recommended_response_length: None,
            prompt_markdown: "Find the derivative.".to_string(),
            max_marks: 4,
            tech_allowed: false,
            distinctness_score: None,
            multi_step_depth: None,
        }];

        let allowed = vec!["functions".to_string()];
        let selected_topics = vec!["Mathematical Methods".to_string()];
        let result = validate_written_questions(&questions, &selected_topics, 1, &[], Some(&allowed), &[]);
        assert!(result.is_ok());
    }

    #[test]
    fn validate_mc_questions_allows_non_identical_subtopic() {
        let questions = vec![McQuestion {
            id: "mc1".to_string(),
            topic: "Chemistry".to_string(),
            subtopic: Some("Redox Reactions".to_string()),
            prompt_markdown: "Which option is correct?".to_string(),
            options: vec![
                McOption {
                    label: "A".to_string(),
                    text: "Option 1".to_string(),
                },
                McOption {
                    label: "B".to_string(),
                    text: "Option 2".to_string(),
                },
                McOption {
                    label: "C".to_string(),
                    text: "Option 3".to_string(),
                },
                McOption {
                    label: "D".to_string(),
                    text: "Option 4".to_string(),
                },
            ],
            correct_answer: "A".to_string(),
            explanation_markdown: "Because...".to_string(),
            tech_allowed: false,
            distinctness_score: None,
            multi_step_depth: None,
        }];

        let allowed = vec!["redox".to_string()];
        let result = validate_mc_questions(&questions, 1, Some(&allowed));
        assert!(result.is_ok());
    }

    #[test]
    fn normalize_questions_envelope_accepts_top_level_array() {
        let value = serde_json::json!([
            {
                "id": "mc1",
                "topic": "Chemistry",
                "promptMarkdown": "Question",
                "options": [
                    { "label": "A", "text": "A1" },
                    { "label": "B", "text": "B1" },
                    { "label": "C", "text": "C1" },
                    { "label": "D", "text": "D1" }
                ],
                "correctAnswer": "A",
                "explanationMarkdown": "Because"
            }
        ]);

        let normalized = normalize_questions_envelope(value).unwrap();
        assert!(normalized.get("questions").is_some());
        assert_eq!(
            normalized
                .get("questions")
                .and_then(|v| v.as_array())
                .map(Vec::len),
            Some(1)
        );
    }

    #[test]
    fn normalize_questions_envelope_accepts_nested_data_questions() {
        let value = serde_json::json!({
            "data": {
                "questions": [
                    {
                        "id": "q1",
                        "topic": "Mathematical Methods",
                        "promptMarkdown": "Find x",
                        "maxMarks": 2
                    }
                ]
            }
        });

        let normalized = normalize_questions_envelope(value).unwrap();
        assert!(normalized.get("questions").is_some());
        assert_eq!(
            normalized
                .get("questions")
                .and_then(|v| v.as_array())
                .map(Vec::len),
            Some(1)
        );
    }
}
