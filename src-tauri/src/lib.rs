use base64::{Engine as _, engine::general_purpose};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::Manager;

const OPENROUTER_CHAT_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
const MATHEMATICAL_METHODS_TOPIC: &str = "Mathematical Methods";
const MATH_METHODS_EXAM_FILES: [&str; 2] = ["2025-MathMethods1.pdf", "2025-MathMethods2.pdf"];
const PHYSICAL_EDUCATION_TOPIC: &str = "Physical Education";
const PHYSICAL_EDUCATION_EXAM_FILES: [&str; 1] = ["2025-PhysicalEducation.pdf"];

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
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateQuestionsResponse {
    questions: Vec<GeneratedQuestion>,
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

    let system_prompt = "You are an expert VCE exam writer. Produce diverse, exam-style questions and include LaTeX in markdown when mathematics is involved. Use ONLY $...$ for inline math and $$...$$ for display math. Never use plain ( ... ) or [ ... ] as math delimiters.";
    let topics_csv = request.topics.join(", ");
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
    let subtopics_note = match request.subtopics.as_ref().filter(|s| !s.is_empty()) {
        Some(subs) => format!(" Focus on the following subtopics: {}.", subs.join(", ")),
        None => String::new(),
    };
    let user_prompt = format!(
        "Create exactly {count} VCE questions for topics: {topics}. Difficulty: {difficulty}. Each question must be worth exactly {max_marks} marks.{subtopics_note}{tech_note}{math_methods_reference_note}{physical_education_reference_note} If a question aligns to a specific subtopic, include it in \"subtopic\". Return ONLY valid JSON in this exact shape: {{\"questions\":[{{\"id\":\"q1\",\"topic\":\"...\",\"subtopic\":\"...\",\"promptMarkdown\":\"...\",\"maxMarks\":{max_marks},\"techAllowed\":false}}]}}. Do not include code fences or extra text.",
        count = request.question_count,
        topics = topics_csv,
        difficulty = request.difficulty,
        max_marks = request.max_marks_per_question,
        subtopics_note = subtopics_note,
        tech_note = tech_note,
        math_methods_reference_note = math_methods_reference_note,
        physical_education_reference_note = physical_education_reference_note,
    );
    let (user_content, plugins) = build_generation_user_content(&app, &request.topics, &user_prompt)?;

    let content = call_openrouter_with_plugins(
        &request.api_key,
        &request.model,
        &system_prompt,
        user_content,
        plugins,
    )
    .await?;
    let payload = parse_json_object(&content).ok_or_else(|| {
        AppError::new(
            "MODEL_PARSE_ERROR",
            "Could not parse generated questions. Try again or change model.",
        )
    })?;

    let mut parsed: GenerateQuestionsResponse = serde_json::from_str(payload).map_err(|_| {
        AppError::new(
            "MODEL_PARSE_ERROR",
            "OpenRouter returned an unexpected question format.",
        )
    })?;

    if parsed.questions.is_empty() {
        return Err(AppError::new(
            "EMPTY_RESULT",
            "The model returned no questions. Try regenerating.",
        ));
    }

    for question in &mut parsed.questions {
        if question.max_marks == 0 {
            question.max_marks = request.max_marks_per_question;
        }

        if question
            .subtopic
            .as_ref()
            .map(|s| s.trim().is_empty())
            .unwrap_or(true)
        {
            question.subtopic = request
                .subtopics
                .as_ref()
                .filter(|subs| subs.len() == 1)
                .and_then(|subs| subs.first().cloned());
        }

        question.prompt_markdown = decode_literal_newlines(&question.prompt_markdown);
    }

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

    Ok(parsed)
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

    let mut parsed: MarkAnswerResponse = serde_json::from_str(payload).map_err(|_| {
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
        "temperature": 0.5
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
    if !pdf_path.exists() {
        return Err(AppError::new(
            "IO_ERROR",
            format!("Exam PDF not found: {}", pdf_path.display()),
        ));
    }

    let bytes = std::fs::read(pdf_path)
        .map_err(|err| AppError::new("IO_ERROR", format!("Failed to read exam PDF: {err}")))?;
    let encoded = general_purpose::STANDARD.encode(bytes);

    Ok(format!("data:application/pdf;base64,{encoded}"))
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

    let mut resolved_paths = Vec::with_capacity(required_files.len());

    for filename in required_files {
        let candidate_paths = [
            current_dir.as_ref().map(|dir| dir.join("exams").join(filename)),
            Some(manifest_dir.join("exams").join(filename)),
            resource_dir.as_ref().map(|dir| dir.join("exams").join(filename)),
            resource_dir.as_ref().map(|dir| dir.join(filename)),
        ];

        let resolved = candidate_paths
            .into_iter()
            .flatten()
            .find(|path| path.is_file())
            .ok_or_else(|| {
                AppError::new(
                    "IO_ERROR",
                    format!("Could not locate required reference exam PDF: {filename}"),
                )
            })?;

        resolved_paths.push(resolved);
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
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateMcQuestionsResponse {
    questions: Vec<McQuestion>,
}

#[tauri::command]
async fn generate_mc_questions(
    app: tauri::AppHandle,
    request: GenerateMcQuestionsRequest,
) -> CommandResult<GenerateMcQuestionsResponse> {
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
    let subtopics_note_mc = match request.subtopics.as_ref().filter(|s| !s.is_empty()) {
        Some(subs) => format!(" Focus on the following subtopics: {}.", subs.join(", ")),
        None => String::new(),
    };
    let user_prompt = format!(
        "Create exactly {count} VCE multiple choice questions for topics: {topics}. Difficulty: {difficulty}. Each question must have exactly 4 options labeled A, B, C, D with only one correct answer.{subtopics_note}{tech_note}{math_methods_reference_note}{physical_education_reference_note} If a question aligns to a specific subtopic, include it in \"subtopic\". Return ONLY valid JSON in this exact shape: {{\"questions\":[{{\"id\":\"mc1\",\"topic\":\"...\",\"subtopic\":\"...\",\"promptMarkdown\":\"...\",\"options\":[{{\"label\":\"A\",\"text\":\"...\"}},{{\"label\":\"B\",\"text\":\"...\"}},{{\"label\":\"C\",\"text\":\"...\"}},{{\"label\":\"D\",\"text\":\"...\"}}],\"correctAnswer\":\"A\",\"explanationMarkdown\":\"...\",\"techAllowed\":false}}]}}. Do not include code fences or extra text.",
        count = request.question_count,
        topics = topics_csv,
        difficulty = request.difficulty,
        subtopics_note = subtopics_note_mc,
        tech_note = tech_note_mc,
        math_methods_reference_note = math_methods_reference_note,
        physical_education_reference_note = physical_education_reference_note,
    );
    let (user_content, plugins) = build_generation_user_content(&app, &request.topics, &user_prompt)?;

    let content = call_openrouter_with_plugins(
        &request.api_key,
        &request.model,
        system_prompt,
        user_content,
        plugins,
    )
    .await?;

    let payload = parse_json_object(&content).ok_or_else(|| {
        AppError::new("MODEL_PARSE_ERROR", "Could not parse generated questions. Try again or change model.")
    })?;

    let mut parsed: GenerateMcQuestionsResponse = serde_json::from_str(payload).map_err(|_| {
        AppError::new("MODEL_PARSE_ERROR", "OpenRouter returned an unexpected question format.")
    })?;

    if parsed.questions.is_empty() {
        return Err(AppError::new("EMPTY_RESULT", "The model returned no questions. Try regenerating."));
    }

    for question in &mut parsed.questions {
        if question
            .subtopic
            .as_ref()
            .map(|s| s.trim().is_empty())
            .unwrap_or(true)
        {
            question.subtopic = request
                .subtopics
                .as_ref()
                .filter(|subs| subs.len() == 1)
                .and_then(|subs| subs.first().cloned());
        }

        question.prompt_markdown = decode_literal_newlines(&question.prompt_markdown);
        question.explanation_markdown = decode_literal_newlines(&question.explanation_markdown);
        question.correct_answer = question.correct_answer.trim().to_uppercase();
        for opt in &mut question.options {
            opt.text = decode_literal_newlines(&opt.text);
        }
    }

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

    Ok(parsed)
}

fn default_question_max_marks() -> u8 {
    10
}

fn decode_literal_newlines(value: &str) -> String {
    value.replace("\\r\\n", "\n").replace("\\n", "\n")
}

fn parse_json_object(content: &str) -> Option<&str> {
    let start = content.find('{')?;
    let end = content.rfind('}')?;

    if start >= end {
        return None;
    }

    content.get(start..=end)
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
