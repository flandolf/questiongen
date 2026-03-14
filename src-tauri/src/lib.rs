use base64::{Engine as _, engine::general_purpose};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
use std::time::Instant;
use tauri::Manager;

const OPENROUTER_CHAT_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MAX_TOKENS: u16 = 2400;
const GENERATION_REPAIR_RETRIES: usize = 2;
const MATHEMATICAL_METHODS_TOPIC: &str = "Mathematical Methods";
const MATH_METHODS_EXAM_FILES: [&str; 2] = ["2025-MathMethods1.pdf", "2025-MathMethods2.pdf"];
const PHYSICAL_EDUCATION_TOPIC: &str = "Physical Education";
const PHYSICAL_EDUCATION_EXAM_FILES: [&str; 1] = ["2025-PhysicalEducation.pdf"];
const WRITTEN_QUESTION_JSON_CONTRACT: &str = "{\"questions\":[{\"id\":\"q1\",\"topic\":\"...\",\"subtopic\":\"...\",\"promptMarkdown\":\"...\",\"maxMarks\":10,\"techAllowed\":false}]}";
const MC_QUESTION_JSON_CONTRACT: &str = "{\"questions\":[{\"id\":\"mc1\",\"topic\":\"...\",\"subtopic\":\"...\",\"promptMarkdown\":\"...\",\"options\":[{\"label\":\"A\",\"text\":\"...\"},{\"label\":\"B\",\"text\":\"...\"},{\"label\":\"C\",\"text\":\"...\"},{\"label\":\"D\",\"text\":\"...\"}],\"correctAnswer\":\"A\",\"explanationMarkdown\":\"...\",\"techAllowed\":false}]}";
const EMBEDDED_MATH_METHODS_1: &[u8] =
    include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/../exams/2025-MathMethods1.pdf"));
const EMBEDDED_MATH_METHODS_2: &[u8] =
    include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/../exams/2025-MathMethods2.pdf"));
const EMBEDDED_PHYSICAL_EDUCATION: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../exams/2025-PhysicalEducation.pdf"
));

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
    distinctness_avg: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    multi_step_depth_avg: Option<f32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkAnswerRequest {
    question: GeneratedQuestion,
    student_answer: String,
    student_answer_image_data_url: Option<String>,
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

#[tauri::command]
async fn generate_questions(
    app: tauri::AppHandle,
    request: GenerateQuestionsRequest,
) -> CommandResult<GenerateQuestionsResponse> {
    validate_generate_request(&request)?;
    let generation_started = Instant::now();

    let system_prompt = "You are an expert VCE exam writer. Produce diverse, exam-style questions and include LaTeX in markdown when mathematics is involved. Use ONLY $...$ for inline math and $$...$$ for display math. Never use plain ( ... ) or [ ... ] as math delimiters.";
    let topics_csv = request.topics.join(", ");
    let selected_subtopics = request.subtopics.as_ref().filter(|s| !s.is_empty());
    let difficulty_rules = difficulty_guidance(&request.difficulty);
    let math_methods_reference_note = if includes_mathematical_methods(&request.topics) {
        " Use the attached Mathematical Methods exam PDFs only as reference material for authentic wording, structure, and realistic mark allocations. Create original questions and do not reproduce or closely paraphrase the source exams."
    } else {
        ""
    };
    let physical_education_reference_note = if includes_physical_education(&request.topics) {
        " For Physical Education, restrict content to Unit 3/4 only. Use the attached 2025 Physical Education exam PDF only as reference material for authentic wording, structure, and realistic mark allocations. Create original questions and do not reproduce or closely paraphrase the source exam."
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
    let user_prompt = format!(
        "Create exactly {count} original VCE written-response questions for topics: {topics}. Difficulty level: {difficulty}.\n\nDifficulty calibration rules:\n{difficulty_rules}\n\nEach question must be worth exactly {max_marks} marks.{subtopics_note}{tech_note}{math_methods_reference_note}{physical_education_reference_note}\n\nQuality constraints:\n- Ensure all questions are materially distinct in concept, context, and required method.\n- Prefer concise prompts with high cognitive load for harder items.\n- Never include worked solutions in promptMarkdown.\n- Use markdown. Use LaTeX only with $...$ and $$...$$ delimiters.\n\nSubtopic constraints:\n- If subtopics are provided, choose \"subtopic\" only from that provided list.\n- If no specific subtopic clearly applies, omit \"subtopic\".\n\nOutput constraints:\n- Return JSON only. No markdown fences. No prose before or after JSON.\n- Return EXACTLY {count} questions.\n- Use this exact JSON shape: {json_contract}",
        count = request.question_count,
        topics = topics_csv,
        difficulty = request.difficulty,
        max_marks = request.max_marks_per_question,
        difficulty_rules = difficulty_rules,
        subtopics_note = subtopics_note,
        tech_note = tech_note,
        math_methods_reference_note = math_methods_reference_note,
        physical_education_reference_note = physical_education_reference_note,
        json_contract = WRITTEN_QUESTION_JSON_CONTRACT,
    );
    let (base_user_content, plugins) =
        build_generation_user_content(&app, &request.topics, &user_prompt)?;

    let mut content = call_openrouter_with_plugins(
        &request.api_key,
        &request.model,
        &system_prompt,
        base_user_content.clone(),
        plugins.clone(),
    )
    .await?;

    let mut parse_issue = String::new();
    let mut parsed: Option<GenerateQuestionsResponse> = None;
    let mut repair_attempts = 0usize;
    let mut repair_path: Vec<String> = Vec::new();
    let mut constrained_regeneration_used = false;
    let mut total_attempts = 1usize;

    for attempt in 0..=GENERATION_REPAIR_RETRIES {
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
                content = request_json_repair(
                    &request.api_key,
                    &request.model,
                    WRITTEN_QUESTION_JSON_CONTRACT,
                    &content,
                    &parse_issue,
                )
                .await?;
            }
        }
    }

    if parsed.is_none() {
        constrained_regeneration_used = true;
        total_attempts += 1;
        repair_path.push("schema-constrained-regeneration".to_string());
        content = request_schema_constrained_regeneration(
            &request.api_key,
            &request.model,
            &user_prompt,
            WRITTEN_QUESTION_JSON_CONTRACT,
            &parse_issue,
            &base_user_content,
            plugins.as_ref(),
        )
        .await?;

        match parse_written_response_candidate(&content, &request, selected_subtopics) {
            Ok(candidate) => parsed = Some(candidate),
            Err(issue) => parse_issue = issue,
        }
    }

    let mut parsed = parsed.ok_or_else(|| {
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
        distinctness_avg: quality_summary.distinctness_avg,
        multi_step_depth_avg: quality_summary.multi_step_depth_avg,
    };

    Ok(GenerateQuestionsResponse {
        questions: parsed.questions,
        raw_model_output: content,
        telemetry: Some(telemetry),
    })
}

#[tauri::command]
async fn mark_answer(request: MarkAnswerRequest) -> CommandResult<MarkAnswerResponse> {
    validate_mark_request(&request)?;

    let system_prompt = "You are a strict but constructive VCE marker. Assess student answers fairly and explain clearly. Always render mathematics using markdown LaTeX delimiters: $...$ inline and $$...$$ display. Never use plain ( ... ) or [ ... ] as math delimiters.";
    let user_prompt_text = format!(
        "Question topic: {topic}\nQuestion:\n{question}\n\nQuestion max marks: {max_marks}\n\nStudent answer:\n{answer}\n\nUse VCAA-style criterion marking. Build a criterion-by-criterion marking scheme, award marks out of {max_marks}, and compare the student response against the worked solution. Return ONLY valid JSON in this exact shape: {{\"verdict\":\"Correct|Partially Correct|Incorrect\",\"achievedMarks\":6,\"maxMarks\":{max_marks},\"scoreOutOf10\":8,\"vcaaMarkingScheme\":[{{\"criterion\":\"...\",\"achievedMarks\":2,\"maxMarks\":3,\"rationale\":\"...\"}}],\"comparisonToSolutionMarkdown\":\"...\",\"feedbackMarkdown\":\"...\",\"workedSolutionMarkdown\":\"...\"}}. Ensure the sum of vcaaMarkingScheme achievedMarks equals achievedMarks. Use markdown and LaTeX where relevant.",
        topic = request.question.topic,
        question = request.question.prompt_markdown,
        answer = request.student_answer,
        max_marks = request.question.max_marks
    );

    let user_content = build_mark_answer_user_content(&user_prompt_text, request.student_answer_image_data_url.as_deref())?;

    let content = call_openrouter(&request.api_key, &request.model, system_prompt, user_content).await?;
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
    )
    .await?;

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

async fn call_openrouter(
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_content: serde_json::Value,
) -> CommandResult<String> {
    call_openrouter_with_plugins(api_key, model, system_prompt, user_content, None).await
}

async fn call_openrouter_with_plugins(
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_content: serde_json::Value,
    plugins: Option<serde_json::Value>,
) -> CommandResult<String> {
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

    Ok(content)
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
    app: &tauri::AppHandle,
    topics: &[String],
    prompt: &str,
) -> CommandResult<(serde_json::Value, Option<serde_json::Value>)> {
    let exam_paths = resolve_reference_exam_paths(app, topics)?;

    if exam_paths.is_empty() {
        return Ok((serde_json::Value::String(prompt.to_string()), None));
    }

    let mut content_parts = vec![serde_json::json!({
        "type": "text",
        "text": prompt,
    })];

    for exam_path in exam_paths {
        let filename = exam_path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| AppError::new("IO_ERROR", "Encountered an invalid exam PDF filename."))?;

        content_parts.push(serde_json::json!({
            "type": "file",
            "file": {
                "filename": filename,
                "file_data": encode_pdf_file_to_data_url(&exam_path)?,
            }
        }));
    }

    let plugins = serde_json::json!([
        {
            "id": "file-parser",
            "pdf": {
                "engine": "pdf-text"
            }
        }
    ]);

    Ok((serde_json::Value::Array(content_parts), Some(plugins)))
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

fn encode_pdf_file_to_data_url(pdf_path: &Path) -> CommandResult<String> {
    let file_name = pdf_path.file_name().and_then(|name| name.to_str());

    let bytes = if pdf_path.exists() {
        std::fs::read(pdf_path)
            .map_err(|err| AppError::new("IO_ERROR", format!("Failed to read exam PDF: {err}")))?
    } else if let Some(name) = file_name {
        embedded_exam_pdf_bytes(name)
            .ok_or_else(|| AppError::new("IO_ERROR", format!("Exam PDF not found: {}", pdf_path.display())))?
            .to_vec()
    } else {
        return Err(AppError::new(
            "IO_ERROR",
            format!("Exam PDF not found: {}", pdf_path.display()),
        ));
    };

    let encoded = general_purpose::STANDARD.encode(bytes);

    Ok(format!("data:application/pdf;base64,{encoded}"))
}

fn embedded_exam_pdf_bytes(filename: &str) -> Option<&'static [u8]> {
    match filename {
        "2025-MathMethods1.pdf" => Some(EMBEDDED_MATH_METHODS_1),
        "2025-MathMethods2.pdf" => Some(EMBEDDED_MATH_METHODS_2),
        "2025-PhysicalEducation.pdf" => Some(EMBEDDED_PHYSICAL_EDUCATION),
        _ => None,
    }
}

fn resolve_reference_exam_paths(
    app: &tauri::AppHandle,
    topics: &[String],
) -> CommandResult<Vec<std::path::PathBuf>> {
    let mut required_files: Vec<&str> = Vec::new();
    if includes_mathematical_methods(topics) {
        required_files.extend(MATH_METHODS_EXAM_FILES);
    }
    if includes_physical_education(topics) {
        required_files.extend(PHYSICAL_EDUCATION_EXAM_FILES);
    }

    if required_files.is_empty() {
        return Ok(Vec::new());
    }

    let resource_dir = app.path().resource_dir().ok();
    let current_dir = std::env::current_dir().ok();
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let app_data_dir = app.path().app_data_dir().ok();
    let app_local_data_dir = app.path().app_local_data_dir().ok();

    let mut resolved_paths = Vec::with_capacity(required_files.len());

    for filename in required_files {
        let candidate_paths = [
            current_dir.as_ref().map(|dir| dir.join("exams").join(filename)),
            Some(manifest_dir.join("exams").join(filename)),
            resource_dir.as_ref().map(|dir| dir.join("exams").join(filename)),
            resource_dir.as_ref().map(|dir| dir.join(filename)),
            // Android bundles resources under assets/_up_/..., which are extracted under resource/data dirs.
            resource_dir
                .as_ref()
                .map(|dir| dir.join("_up_").join("exams").join(filename)),
            resource_dir
                .as_ref()
                .map(|dir| dir.join("_up_").join(filename)),
            app_data_dir
                .as_ref()
                .map(|dir| dir.join("_up_").join("exams").join(filename)),
            app_data_dir
                .as_ref()
                .map(|dir| dir.join("exams").join(filename)),
            app_local_data_dir
                .as_ref()
                .map(|dir| dir.join("_up_").join("exams").join(filename)),
            app_local_data_dir
                .as_ref()
                .map(|dir| dir.join("exams").join(filename)),
        ]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();

        let resolved = candidate_paths.iter().find(|path| path.is_file());

        let Some(resolved) = resolved else {
            if embedded_exam_pdf_bytes(filename).is_some() {
                // Use a synthetic path; encode_pdf_file_to_data_url will load embedded bytes by filename.
                resolved_paths.push(std::path::PathBuf::from(filename));
                continue;
            }

            let attempted = candidate_paths
                .iter()
                .map(|path| path.display().to_string())
                .collect::<Vec<_>>()
                .join("\n- ");

            return Err(AppError::new(
                "IO_ERROR",
                format!(
                    "Could not locate required reference exam PDF: {filename}. Attempted paths:\n- {attempted}"
                ),
            ));
        };

        resolved_paths.push(resolved.clone());
    }

    Ok(resolved_paths)
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

    let system_prompt = "You are an expert VCE exam writer. Create challenging, exam-style multiple choice questions. Use ONLY $...$ for inline math and $$...$$ for display math. Never use plain ( ... ) or [ ... ] as math delimiters.";
    let topics_csv = request.topics.join(", ");
    let selected_subtopics = request.subtopics.as_ref().filter(|s| !s.is_empty());
    let difficulty_rules = difficulty_guidance(&request.difficulty);
    let math_methods_reference_note = if includes_mathematical_methods(&request.topics) {
        " Use the attached Mathematical Methods exam PDFs only as reference material for authentic wording, structure, and difficulty calibration. Create original questions and do not reproduce or closely paraphrase the source exams."
    } else {
        ""
    };
    let physical_education_reference_note = if includes_physical_education(&request.topics) {
        " For Physical Education, restrict content to Unit 3/4 only. Use the attached 2025 Physical Education exam PDF only as reference material for authentic wording, structure, and difficulty calibration. Create original questions and do not reproduce or closely paraphrase the source exam."
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
    let user_prompt = format!(
        "Create exactly {count} original VCE multiple-choice questions for topics: {topics}. Difficulty level: {difficulty}.\n\nDifficulty calibration rules:\n{difficulty_rules}\n\nEach question must have exactly 4 options labeled A, B, C, D with only one correct answer.{subtopics_note}{tech_note}{math_methods_reference_note}{physical_education_reference_note}\n\nQuality constraints:\n- Make each question materially distinct in concept and reasoning style.\n- Use plausible distractors based on common misconceptions.\n- Avoid giveaway wording in stems and options.\n- Use markdown. Use LaTeX only with $...$ and $$...$$ delimiters.\n\nSubtopic constraints:\n- If subtopics are provided, choose \"subtopic\" only from that provided list.\n- If no specific subtopic clearly applies, omit \"subtopic\".\n\nOutput constraints:\n- Return JSON only. No markdown fences. No prose before or after JSON.\n- Return EXACTLY {count} questions.\n- Use this exact JSON shape: {json_contract}",
        count = request.question_count,
        topics = topics_csv,
        difficulty = request.difficulty,
        difficulty_rules = difficulty_rules,
        subtopics_note = subtopics_note_mc,
        tech_note = tech_note_mc,
        math_methods_reference_note = math_methods_reference_note,
        physical_education_reference_note = physical_education_reference_note,
        json_contract = MC_QUESTION_JSON_CONTRACT,
    );
    let (base_user_content, plugins) =
        build_generation_user_content(&app, &request.topics, &user_prompt)?;

    let mut content = call_openrouter_with_plugins(
        &request.api_key,
        &request.model,
        system_prompt,
        base_user_content.clone(),
        plugins.clone(),
    )
    .await?;

    let mut parse_issue = String::new();
    let mut parsed: Option<GenerateMcQuestionsResponse> = None;
    let mut repair_attempts = 0usize;
    let mut repair_path: Vec<String> = Vec::new();
    let mut constrained_regeneration_used = false;
    let mut total_attempts = 1usize;

    for attempt in 0..=GENERATION_REPAIR_RETRIES {
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
                content = request_json_repair(
                    &request.api_key,
                    &request.model,
                    MC_QUESTION_JSON_CONTRACT,
                    &content,
                    &parse_issue,
                )
                .await?;
            }
        }
    }

    if parsed.is_none() {
        constrained_regeneration_used = true;
        total_attempts += 1;
        repair_path.push("schema-constrained-regeneration".to_string());
        content = request_schema_constrained_regeneration(
            &request.api_key,
            &request.model,
            &user_prompt,
            MC_QUESTION_JSON_CONTRACT,
            &parse_issue,
            &base_user_content,
            plugins.as_ref(),
        )
        .await?;

        match parse_mc_response_candidate(&content, &request, selected_subtopics) {
            Ok(candidate) => parsed = Some(candidate),
            Err(issue) => parse_issue = issue,
        }
    }

    let mut parsed = parsed.ok_or_else(|| {
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
        distinctness_avg: quality_summary.distinctness_avg,
        multi_step_depth_avg: quality_summary.multi_step_depth_avg,
    };

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

    let mut candidate: GenerateQuestionsResponse = serde_json::from_str(&payload)
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

    let mut candidate: GenerateMcQuestionsResponse = serde_json::from_str(&payload)
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
) -> CommandResult<String> {
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
    selected_subtopics: Option<&Vec<String>>,
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
        if let Some(allowed_subtopics) = selected_subtopics {
            if let Some(subtopic) = question.subtopic.as_ref() {
                if !allowed_subtopics
                    .iter()
                    .any(|allowed| allowed.eq_ignore_ascii_case(subtopic))
                {
                    return Err(format!("Question {} has invalid subtopic.", question.id));
                }
            }
        }
    }

    Ok(())
}

fn validate_mc_questions(
    questions: &[McQuestion],
    expected_count: usize,
    selected_subtopics: Option<&Vec<String>>,
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

        if let Some(allowed_subtopics) = selected_subtopics {
            if let Some(subtopic) = question.subtopic.as_ref() {
                if !allowed_subtopics
                    .iter()
                    .any(|allowed| allowed.eq_ignore_ascii_case(subtopic))
                {
                    return Err(format!("Question {} has invalid subtopic.", question.id));
                }
            }
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
) -> CommandResult<String> {
    let prompt = format!(
        "Repair the model output into valid JSON that follows the required schema exactly.\n\nIssue detected: {parse_issue}\n\nRules:\n- Output JSON only\n- No markdown fences\n- No extra keys beyond schema\n- Preserve original educational intent\n\nRequired schema:\n{json_contract}\n\nModel output to repair:\n{raw_output}",
    );

    call_openrouter(
        api_key,
        model,
        "You are a strict JSON repair engine. Return only valid JSON that matches the required schema.",
        serde_json::Value::String(prompt),
    )
    .await
}

fn decode_literal_newlines(value: &str) -> String {
    value.replace("\\r\\n", "\n").replace("\\n", "\n")
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
}
