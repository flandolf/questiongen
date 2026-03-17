use base64::{Engine as _, engine::general_purpose};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

const OPENROUTER_CHAT_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MAX_TOKENS: u16 = 1400;
const MATHEMATICAL_METHODS_TOPIC: &str = "Mathematical Methods";
const PHYSICAL_EDUCATION_TOPIC: &str = "Physical Education";
const ENGLISH_LANGUAGE_TOPIC: &str = "English Language";
const APP_STATE_FILE_NAME: &str = "app-state.json";
const MATHEMATICAL_METHODS_REFERENCE_GUIDANCE: &str = " Use a compact Mathematical Methods exam style: concise VCAA-style command verbs, realistic mark allocations, algebraic fluency, and prompts that reward method choice over template recall.";
const PHYSICAL_EDUCATION_REFERENCE_GUIDANCE: &str = " Restrict Physical Education to Unit 3/4 and use short applied sport/training scenarios that reward data interpretation, justification, and evidence-based reasoning. For biomechanics, avoid focus on pure physics calculations and instead emphasize application of concepts to novel contexts, as in VCE calculations are not examined.";
const WRITTEN_QUESTION_JSON_CONTRACT: &str = "{\"questions\":[{\"id\":\"q1\",\"topic\":\"...\",\"subtopic\":\"...\",\"taskType\":\"short-answer|analytical-essay\",\"recommendedResponseLength\":\"short|extended\",\"promptMarkdown\":\"...\",\"maxMarks\":10,\"techAllowed\":false}]}";
const PASSAGE_JSON_CONTRACT: &str = "{\"passage\":{\"id\":\"p1\",\"text\":\"...\",\"aosSubtopic\":\"Unit 1 AOS 1: Nature and Functions of Language\",\"questions\":[{\"id\":\"pq1\",\"promptMarkdown\":\"Identify two modal verbs from lines 3-5.\",\"maxMarks\":2}]}}";
const MC_QUESTION_JSON_CONTRACT: &str = "{\"questions\":[{\"id\":\"mc1\",\"topic\":\"...\",\"subtopic\":\"...\",\"promptMarkdown\":\"...\",\"options\":[{\"label\":\"A\",\"text\":\"...\"},{\"label\":\"B\",\"text\":\"...\"},{\"label\":\"C\",\"text\":\"...\"},{\"label\":\"D\",\"text\":\"...\"}],\"correctAnswer\":\"A\",\"explanationMarkdown\":\"...\",\"techAllowed\":false}]}";
const MARK_ANSWER_JSON_CONTRACT: &str = "{\"verdict\":\"Correct|Partially Correct|Incorrect\",\"achievedMarks\":6,\"maxMarks\":10,\"scoreOutOf10\":8,\"vcaaMarkingScheme\":[{\"criterion\":\"...\",\"achievedMarks\":2,\"maxMarks\":3,\"rationale\":\"...\"}],\"comparisonToSolutionMarkdown\":\"...\",\"feedbackMarkdown\":\"...\",\"workedSolutionMarkdown\":\"...\"}";
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
    min_marks: u8,
    max_marks: u8,
}

const COMMAND_TERM_PROFILES: [CommandTermProfile; 8] = [
    CommandTermProfile {
        key: "identify",
        min_marks: 1,
        max_marks: 2,
    },
    CommandTermProfile {
        key: "describe",
        min_marks: 1,
        max_marks: 3,
    },
    CommandTermProfile {
        key: "explain",
        min_marks: 1,
        max_marks: 4,
    },
    CommandTermProfile {
        key: "compare",
        min_marks: 2,
        max_marks: 4,
    },
    CommandTermProfile {
        key: "analyse",
        min_marks: 3,
        max_marks: 6,
    },
    CommandTermProfile {
        key: "discuss",
        min_marks: 4,
        max_marks: 7,
    },
    CommandTermProfile {
        key: "evaluate",
        min_marks: 4,
        max_marks: 8,
    },
    CommandTermProfile {
        key: "justify",
        min_marks: 5,
        max_marks: 7,
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
