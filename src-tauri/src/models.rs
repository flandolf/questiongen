use std::collections::HashMap;
use serde::{Deserialize, Serialize};

// ─── Error ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: &'static str,
    pub message: String,
}

impl AppError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }
}

pub type CommandResult<T> = Result<T, AppError>;

// ─── Command terms ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy)]
pub struct CommandTermProfile {
    pub key: &'static str,
    pub display: &'static str,
    pub min_marks: u8,
    pub max_marks: u8,
    pub below_evaluate: bool,
}

// ─── OpenRouter wire types ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct OpenRouterResponse {
    pub choices: Vec<OpenRouterChoice>,
}

#[derive(Debug, Deserialize)]
pub struct OpenRouterChoice {
    pub message: OpenRouterMessage,
}

#[derive(Debug, Deserialize)]
pub struct OpenRouterMessage {
    pub content: String,
}

// ─── Shared question types ────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedQuestion {
    pub id: String,
    pub topic: String,
    #[serde(default)]
    pub subtopic: Option<String>,
    pub prompt_markdown: String,
    #[serde(default = "default_max_marks")]
    pub max_marks: u8,
    #[serde(default)]
    pub tech_allowed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub distinctness_score: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multi_step_depth: Option<f32>,
}

pub fn default_max_marks() -> u8 { 10 }

// ─── Written questions ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateQuestionsRequest {
    pub topics: Vec<String>,
    pub difficulty: String,
    pub question_count: usize,
    pub model: String,
    pub api_key: String,
    pub tech_mode: Option<String>,
    pub prioritized_command_terms: Option<Vec<String>>,
    pub subtopics: Option<Vec<String>>,
    pub subtopic_instructions: Option<HashMap<String, String>>,
    pub custom_focus_area: Option<String>,
    pub avoid_similar_questions: Option<bool>,
    pub prior_question_prompts: Option<Vec<String>>,
    pub max_marks_per_question: Option<u8>,
}

/// Deserialised directly from the model's JSON output.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrittenQuestionsPayload {
    pub questions: Vec<GeneratedQuestion>,
}

/// Returned to the frontend (includes fields we compute locally).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateQuestionsResponse {
    pub questions: Vec<GeneratedQuestion>,
    pub duration_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distinctness_avg: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub multi_step_depth_avg: Option<f32>,
}

// ─── Answer marking ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkAnswerRequest {
    pub question: GeneratedQuestion,
    pub student_answer: String,
    pub student_answer_image_data_url: Option<String>,
    pub model: String,
    pub api_key: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkAnswerResponse {
    pub verdict: String,
    #[serde(default)]
    pub achieved_marks: u8,
    #[serde(default)]
    pub max_marks: u8,
    #[serde(default)]
    pub score_out_of_10: u8,
    #[serde(default)]
    pub vcaa_marking_scheme: Vec<MarkingCriterion>,
    #[serde(default)]
    pub comparison_to_solution_markdown: String,
    pub feedback_markdown: String,
    pub worked_solution_markdown: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkingCriterion {
    pub criterion: String,
    #[serde(default)]
    pub achieved_marks: u8,
    #[serde(default)]
    pub max_marks: u8,
    pub rationale: String,
}

// ─── Image analysis ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeImageRequest {
    pub image_path: String,
    pub model: String,
    pub api_key: String,
    pub prompt: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeImageResponse {
    pub output_text: String,
}

// ─── Multiple-choice ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateMcQuestionsRequest {
    pub topics: Vec<String>,
    pub difficulty: String,
    pub question_count: usize,
    pub model: String,
    pub api_key: String,
    pub tech_mode: Option<String>,
    pub subtopics: Option<Vec<String>>,
    pub subtopic_instructions: Option<HashMap<String, String>>,
    pub custom_focus_area: Option<String>,
    pub avoid_similar_questions: Option<bool>,
    pub prior_question_prompts: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct McOption {
    pub label: String,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct McQuestion {
    pub id: String,
    pub topic: String,
    #[serde(default)]
    pub subtopic: Option<String>,
    pub prompt_markdown: String,
    pub options: Vec<McOption>,
    pub correct_answer: String,
    pub explanation_markdown: String,
    #[serde(default)]
    pub tech_allowed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub distinctness_score: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multi_step_depth: Option<f32>,
}

/// Deserialised directly from the model's JSON output.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McQuestionsPayload {
    pub questions: Vec<McQuestion>,
}

/// Returned to the frontend (includes fields we compute locally).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateMcQuestionsResponse {
    pub questions: Vec<McQuestion>,
    pub duration_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distinctness_avg: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub multi_step_depth_avg: Option<f32>,
}
