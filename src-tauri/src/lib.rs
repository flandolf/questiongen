use base64::{Engine as _, engine::general_purpose};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use std::fs;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Instant;
use tauri::{Emitter, Manager};

const OPENROUTER_CHAT_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MAX_TOKENS: u16 = 1400;
const GENERATION_REPAIR_RETRIES: usize = 1;
const MATHEMATICAL_METHODS_TOPIC: &str = "Mathematical Methods";
const PHYSICAL_EDUCATION_TOPIC: &str = "Physical Education";
const CHEMISTRY_TOPIC: &str = "Chemistry";
const APP_STATE_FILE_NAME: &str = "app-state.json";
const MATHEMATICAL_METHODS_REFERENCE_GUIDANCE: &str = " Use a compact Mathematical Methods exam style: concise VCAA-style command verbs, realistic mark allocations, algebraic fluency, and prompts that reward method choice over template recall.";
const PHYSICAL_EDUCATION_REFERENCE_GUIDANCE: &str = " Restrict Physical Education to Unit 3/4 and use short applied sport/training scenarios that reward data interpretation, justification, and evidence-based reasoning.";
const CHEMICAL_FORMULA_LATEX_GUIDANCE: &str = " For Chemistry content, always render every chemical formula and ionic species in LaTeX math delimiters, e.g. $H_2O$, $CO_2$, $Fe^{3+}$, $SO_4^{2-}$.";
const WRITTEN_QUESTION_JSON_CONTRACT: &str = "{\"questions\":[{\"id\":\"q1\",\"topic\":\"...\",\"subtopic\":\"...\",\"promptMarkdown\":\"...\",\"maxMarks\":10,\"techAllowed\":false}]}";
const MC_QUESTION_JSON_CONTRACT: &str = "{\"questions\":[{\"id\":\"mc1\",\"topic\":\"...\",\"subtopic\":\"...\",\"promptMarkdown\":\"...\",\"options\":[{\"label\":\"A\",\"text\":\"...\"},{\"label\":\"B\",\"text\":\"...\"},{\"label\":\"C\",\"text\":\"...\"},{\"label\":\"D\",\"text\":\"...\"}],\"correctAnswer\":\"A\",\"explanationMarkdown\":\"...\",\"techAllowed\":false}]}";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateQuestionsRequest {
    topics: Vec<String>,
    difficulty: String,
    question_count: usize,
    max_marks_per_question: u8,
    model: String,
    api_key: String,
    tech_mode: Option<String>,
    subtopics: Option<Vec<String>>,
    custom_focus_area: Option<String>,
    avoid_similar_questions: Option<bool>,
    prior_question_prompts: Option<Vec<String>>,
    use_structured_output: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GeneratedQuestion {
    id: String,
    topic: String,
    #[serde(default)]
    subtopic: Option<String>,
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
    use_structured_output: Option<bool>,
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

    let payload = serde_json::to_string_pretty(&state).map_err(|err| {
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

    if path.exists() {
        let _ = fs::remove_file(&path);
    }

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

    let system_prompt = "You are an expert VCE exam writer. Produce diverse, exam-style questions and include LaTeX in markdown when mathematics is involved. Use ONLY $...$ for inline math and $$...$$ for display math. Never use plain ( ... ) or [ ... ] as math delimiters. Always write chemical formulas and ions in LaTeX math delimiters.";
    let topics_csv = request.topics.join(", ");
    let selected_subtopics = request.subtopics.as_ref().filter(|s| !s.is_empty());
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
    let user_prompt = format!(
        "Create exactly {count} original VCE written-response questions for topics: {topics}. Difficulty level: {difficulty}.\n\nDifficulty calibration rules:\n{difficulty_rules}\n\nEach question must be worth exactly {max_marks} marks.{subtopics_note}{custom_focus_note}{tech_note}{math_methods_reference_note}{physical_education_reference_note}{chemistry_formula_note}\n\nQuality constraints:\n- Ensure all questions are materially distinct in concept, context, and required method.\n- Prefer concise prompts with high cognitive load for harder items.\n- Never include worked solutions in promptMarkdown.\n- Use markdown. Use LaTeX only with $...$ and $$...$$ delimiters.\n- For Chemistry content, every chemical formula and ionic species must be in LaTeX math delimiters.{similarity_guardrail_note}\n\nSubtopic constraints:\n- If subtopics are provided, choose \"subtopic\" only from that provided list.\n- If no specific subtopic clearly applies, omit \"subtopic\".\n\nOutput constraints:\n- Return JSON only. No markdown fences. No prose before or after JSON.\n- Return EXACTLY {count} questions.\n- Use this exact JSON shape: {json_contract}",
        count = request.question_count,
        topics = topics_csv,
        difficulty = request.difficulty,
        max_marks = request.max_marks_per_question,
        difficulty_rules = difficulty_rules,
        subtopics_note = subtopics_note,
        custom_focus_note = custom_focus_note,
        tech_note = tech_note,
        math_methods_reference_note = math_methods_reference_note,
        physical_education_reference_note = physical_education_reference_note,
        chemistry_formula_note = chemistry_formula_note,
        similarity_guardrail_note = similarity_guardrail_note,
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
        match parse_written_response_candidate(&content, &request, selected_subtopics) {
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

        match parse_written_response_candidate(&content, &request, selected_subtopics) {
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

    let system_prompt = "You are a strict but constructive VCE marker. Assess student answers fairly and explain clearly. Always render mathematics using markdown LaTeX delimiters: $...$ inline and $$...$$ display. Never use plain ( ... ) or [ ... ] as math delimiters. Always write chemical formulas and ions in LaTeX math delimiters.";
    let chemistry_formula_note = if is_chemistry_topic(&request.question.topic) {
        " For Chemistry content, every chemical formula and ionic species in your response must be LaTeX-formatted (for example $H_2O$, $CO_2$, $Fe^{3+}$, $SO_4^{2-}$)."
    } else {
        ""
    };
    let user_prompt_text = format!(
        "Question topic: {topic}\nQuestion:\n{question}\n\nQuestion max marks: {max_marks}\n\nStudent answer:\n{answer}\n\nUse VCAA-style criterion marking. Build a criterion-by-criterion marking scheme, award marks out of {max_marks}, and compare the student response against the worked solution. Return ONLY valid JSON in this exact shape: {{\"verdict\":\"Correct|Partially Correct|Incorrect\",\"achievedMarks\":6,\"maxMarks\":{max_marks},\"scoreOutOf10\":8,\"vcaaMarkingScheme\":[{{\"criterion\":\"...\",\"achievedMarks\":2,\"maxMarks\":3,\"rationale\":\"...\"}}],\"comparisonToSolutionMarkdown\":\"...\",\"feedbackMarkdown\":\"...\",\"workedSolutionMarkdown\":\"...\"}}. Ensure the sum of vcaaMarkingScheme achievedMarks equals achievedMarks. Use markdown and LaTeX where relevant.{chemistry_formula_note}",
        topic = request.question.topic,
        question = request.question.prompt_markdown,
        answer = request.student_answer,
        max_marks = request.question.max_marks,
        chemistry_formula_note = chemistry_formula_note,
    );

    let user_content = build_mark_answer_user_content(&user_prompt_text, request.student_answer_image_data_url.as_deref())?;

    let response_format = if request.use_structured_output.unwrap_or(false) {
        Some(mark_answer_response_format())
    } else {
        None
    };

    let content = call_openrouter(
        &request.api_key,
        &request.model,
        system_prompt,
        user_content,
        response_format.as_ref(),
    )
    .await?
    .content;
    let payload = parse_json_object(&content).ok_or_else(|| {
        AppError::new(
            "MODEL_PARSE_ERROR",
            "Could not parse the marking response. Try submitting again.",
        )
    })?;

    let mut parsed: MarkAnswerResponse = serde_json::from_str(&payload).map_err(|_| {
        AppError::new(
            "MODEL_PARSE_ERROR",
            "OpenRouter returned an unexpected marking format.",
        )
    })?;

    if parsed.max_marks == 0 {
        parsed.max_marks = request.question.max_marks;
    }

    if parsed.max_marks == 0 {
        parsed.max_marks = 10;
    }

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

    if request.max_marks_per_question == 0 || request.max_marks_per_question > 30 {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Max marks per question must be between 1 and 30.",
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

fn is_chemistry_topic(topic: &str) -> bool {
    topic.trim().eq_ignore_ascii_case(CHEMISTRY_TOPIC)
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

    let system_prompt = "You are an expert VCE exam writer. Create challenging, exam-style multiple choice questions. Use ONLY $...$ for inline math and $$...$$ for display math. Never use plain ( ... ) or [ ... ] as math delimiters. Always write chemical formulas and ions in LaTeX math delimiters.";
    let topics_csv = request.topics.join(", ");
    let selected_subtopics = request.subtopics.as_ref().filter(|s| !s.is_empty());
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
        "Create exactly {count} original VCE multiple-choice questions for topics: {topics}. Difficulty level: {difficulty}.\n\nDifficulty calibration rules:\n{difficulty_rules}\n\nEach question must have exactly 4 options labeled A, B, C, D with only one correct answer.{subtopics_note}{custom_focus_note}{tech_note}{math_methods_reference_note}{physical_education_reference_note}{chemistry_formula_note}\n\nQuality constraints:\n- Make each question materially distinct in concept and reasoning style.\n- Use plausible distractors based on common misconceptions.\n- Avoid giveaway wording in stems and options.\n- Use markdown. Use LaTeX only with $...$ and $$...$$ delimiters.\n- For Chemistry content, every chemical formula and ionic species must be in LaTeX math delimiters.{similarity_guardrail_note}\n\nSubtopic constraints:\n- If subtopics are provided, choose \"subtopic\" only from that provided list.\n- If no specific subtopic clearly applies, omit \"subtopic\".\n\nOutput constraints:\n- Return JSON only. No markdown fences. No prose before or after JSON.\n- Return EXACTLY {count} questions.\n- Use this exact JSON shape: {json_contract}",
        count = request.question_count,
        topics = topics_csv,
        difficulty = request.difficulty,
        difficulty_rules = difficulty_rules,
        subtopics_note = subtopics_note_mc,
        custom_focus_note = custom_focus_note_mc,
        tech_note = tech_note_mc,
        math_methods_reference_note = math_methods_reference_note,
        physical_education_reference_note = physical_education_reference_note,
        chemistry_formula_note = chemistry_formula_note,
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
    if level.eq_ignore_ascii_case("easy") {
        "- Target foundational understanding and direct application.\n- Use familiar contexts with minimal distractor complexity.\n- Keep reasoning steps short and explicit."
    } else if level.eq_ignore_ascii_case("medium") {
        "- Require multi-step reasoning with at least two linked concepts.\n- Include non-routine context shifts that require method choice.\n- Use realistic exam pressure through concise but information-dense prompts."
    } else {
        "- Build discriminator-level questions requiring synthesis across multiple concepts.\n- Include unfamiliar or edge-case contexts that punish rote methods.\n- Require method selection, justification, and error-resistant reasoning chains."
    }
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
        request.max_marks_per_question,
        selected_subtopics,
    );

    validate_written_questions(
        &candidate.questions,
        request.question_count,
        request.max_marks_per_question,
        selected_subtopics,
    )?;

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
    fallback_max_marks: u8,
    selected_subtopics: Option<&Vec<String>>,
) {
    for question in questions {
        if question.max_marks == 0 {
            question.max_marks = fallback_max_marks;
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
        question.subtopic = question
            .subtopic
            .as_ref()
            .map(|subtopic| subtopic.trim().to_string())
            .filter(|subtopic| !subtopic.is_empty());
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

fn validate_written_questions(
    questions: &[GeneratedQuestion],
    expected_count: usize,
    expected_max_marks: u8,
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
        if question.max_marks != expected_max_marks {
            return Err(format!(
                "Question {} has maxMarks {}, expected {}.",
                question.id, question.max_marks, expected_max_marks
            ));
        }
    }

    Ok(())
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
            mark_answer,
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
            prompt_markdown: "Find the derivative.".to_string(),
            max_marks: 4,
            tech_allowed: false,
            distinctness_score: None,
            multi_step_depth: None,
        }];

        let result = validate_written_questions(&questions, 2, 4, None);
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
            prompt_markdown: "Find the derivative.".to_string(),
            max_marks: 4,
            tech_allowed: false,
            distinctness_score: None,
            multi_step_depth: None,
        }];

        let allowed = vec!["functions".to_string()];
        let result = validate_written_questions(&questions, 1, 4, Some(&allowed));
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
