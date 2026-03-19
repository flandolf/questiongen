use base64::{Engine as _, engine::general_purpose};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Instant};
use tauri::{Emitter, Manager};

const OPENROUTER_MAX_TOKENS: u16 = 1400;
const MATHEMATICAL_METHODS_TOPIC: &str = "Mathematical Methods";
const PHYSICAL_EDUCATION_TOPIC: &str = "Physical Education";
const APP_STATE_FILE_NAME: &str = "app-state.json";
const MATHEMATICAL_METHODS_REFERENCE_GUIDANCE: &str = "Mathematical Methods: Reward method selection over template recall. Use authentic exam style with concise, VCAA-aligned command verbs and realistic mark allocations. Prioritize algebraic reasoning, calculus interpretation, and evidence of considered problem-solving. Avoid rote substitution questions; instead, construct scenarios requiring method choice justification.";
const PHYSICAL_EDUCATION_REFERENCE_GUIDANCE: &str = "Physical Education: Restrict to Unit 3/4 content. Use short, applied sport/training scenarios that reward data interpretation, reasoned justification, and evidence-based analysis. For biomechanics, avoid pure physics calculations; instead, emphasize application of principles (Newton's Laws, levers, projectile motion) to novel contexts and authentic athlete/training situations.";

/// LaTeX delimiter instruction included in every generation and marking prompt.
/// The double-backslash form is intentional: inside a JSON string the model
const LATEX_NOTE: &str =
    "Math notation: wrap inline expressions in $...$ and display/block expressions in $$...$$. Use no other math delimiters.";

#[derive(Debug, Clone, Copy)]
struct CommandTermProfile {
    key: &'static str,
    min_marks: u8,
    max_marks: u8,
}

const COMMAND_TERM_PROFILES: [CommandTermProfile; 8] = [
    CommandTermProfile { key: "identify",  min_marks: 1, max_marks: 2 },
    CommandTermProfile { key: "describe",  min_marks: 1, max_marks: 3 },
    CommandTermProfile { key: "explain",   min_marks: 1, max_marks: 4 },
    CommandTermProfile { key: "compare",   min_marks: 2, max_marks: 4 },
    CommandTermProfile { key: "analyse",   min_marks: 3, max_marks: 6 },
    CommandTermProfile { key: "discuss",   min_marks: 4, max_marks: 7 },
    CommandTermProfile { key: "evaluate",  min_marks: 4, max_marks: 8 },
    CommandTermProfile { key: "justify",   min_marks: 5, max_marks: 7 },
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
    subtopic_instructions: Option<HashMap<String, String>>,
    max_marks_per_question: Option<u8>,
    #[serde(default)]
    custom_focus_area: Option<String>,
    #[serde(default)]
    prior_question_prompts: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GeneratedQuestion {
    #[serde(default)]
    id: String,
    #[serde(alias = "t")]
    topic: String,
    #[serde(alias = "s", default)]
    subtopic: Option<String>,
    #[serde(alias = "p")]
    prompt_markdown: String,
    #[serde(alias = "m", default = "default_question_max_marks")]
    max_marks: u8,
    #[serde(alias = "ta", default)]
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

impl GenerationTelemetry {
    fn simple(difficulty: impl Into<String>, duration_ms: u64) -> Self {
        Self {
            difficulty: difficulty.into(),
            total_attempts: 1,
            repair_attempts: 0,
            constrained_regeneration_used: false,
            repair_path: vec![],
            duration_ms,
            structured_output_status: Some("used".to_string()),
            distinctness_avg: None,
            multi_step_depth_avg: None,
        }
    }
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
        Self { code, message: message.into() }
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
        GenerationStatusEvent { mode, stage, message: message.into(), attempt },
    );
}
