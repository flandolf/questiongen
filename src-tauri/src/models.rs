use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── Error ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: &'static str,
    pub message: String,
    pub status: Option<u16>,
}

impl AppError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            status: None,
        }
    }

    pub fn with_status(mut self, status: u16) -> Self {
        self.status = Some(status);
        self
    }

    pub fn is_transient(&self) -> bool {
        if let Some(status) = self.status {
            if status == 429 || (500..600).contains(&status) {
                return true;
            }
        }

        // Fallback for non-HTTP errors or explicit codes
        matches!(self.code, "NETWORK_ERROR" | "TIMEOUT_ERROR")
            || self.message.to_lowercase().contains("timeout")
            || self.message.to_lowercase().contains("network")
    }
}

impl From<genanki_rs::Error> for AppError {
    fn from(e: genanki_rs::Error) -> Self {
        Self::new("ANKI_ERROR", format!("Anki error: {:?}", e))
    }
}

impl From<Box<dyn std::error::Error>> for AppError {
    fn from(e: Box<dyn std::error::Error>) -> Self {
        Self::new("ERROR", e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::new("IO_ERROR", format!("I/O error: {e}"))
    }
}

pub type CommandResult<T> = Result<T, AppError>;

// ─── OpenRouter wire types ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct OpenRouterResponse {
    pub choices: Vec<OpenRouterChoice>,
    pub usage: Option<OpenRouterUsage>,
}

#[derive(Debug, Deserialize)]
pub struct OpenRouterChoice {
    pub message: OpenRouterMessage,
}

#[derive(Debug, Deserialize)]
pub struct OpenRouterMessage {
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct OpenRouterUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

// ─── Shared question types ────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedQuestion {
    #[serde(default)]
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verb_diversity_count: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scaffold_pattern: Option<String>,
}

pub fn default_max_marks() -> u8 {
    10
}

// ─── Written questions ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateQuestionsRequest {
    pub topics: Vec<String>,
    pub difficulty: String,
    pub question_count: usize,
    pub model: String,
    pub api_key: String,
    pub include_exam_context: Option<bool>,
    pub tech_mode: Option<String>,
    pub subtopics: Option<Vec<String>>,
    pub custom_focus_area: Option<String>,
    pub avoid_similar_questions: Option<bool>,
    pub prior_question_prompts: Option<Vec<String>>,
    pub strict_latex_validation: Option<bool>,
    pub diversity_strictness: Option<String>,
    pub average_marks_per_question: Option<u8>,
    pub shuffle_subtopics: Option<bool>,
    pub ai_difficulty_scaling_enabled: Option<bool>,
    pub recent_average_score: Option<f64>,
    pub recent_difficulty: Option<String>,
}

/// Returned to the frontend (includes fields we compute locally).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateQuestionsResponse {
    pub questions: Vec<GeneratedQuestion>,
    pub duration_ms: u64,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_cost_usd: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distinctness_avg: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub multi_step_depth_avg: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command_verb_diversity: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mark_allocation_variance: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality_diagnostics: Option<GenerationQualityDiagnostics>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GenerationQualityDiagnostics {
    pub selected_subtopics: Vec<String>,
    pub covered_subtopics: Vec<String>,
    pub uncovered_subtopics: Vec<String>,
    pub out_of_scope_subtopics: Vec<String>,
    pub latex_issue_count: usize,
    pub latex_issue_examples: Vec<String>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchMarkRequest {
    pub items: Vec<MarkAnswerRequest>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchMarkResponse {
    pub results: Vec<BatchMarkItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchMarkItem {
    pub question_id: String,
    pub response: Option<MarkAnswerResponse>,
    pub error: Option<String>,
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
    pub vcaa_marking_scheme: Vec<MarkingCriterion>,
    #[serde(default)]
    pub comparison_to_solution_markdown: String,
    pub feedback_markdown: String,
    pub worked_solution_markdown: String,
    /// Separate exemplar response showing an ideal student answer.
    #[serde(default)]
    pub exemplar_response_markdown: String,
    /// Per-option explanations for MC questions; empty for written questions.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub mc_option_explanations: Vec<McOptionExplanation>,
    #[serde(default)]
    pub prompt_tokens: u32,
    #[serde(default)]
    pub completion_tokens: u32,
    #[serde(default)]
    pub total_tokens: u32,
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

/// Explanation for a single MC option (A–D).
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct McOptionExplanation {
    /// "A", "B", "C", or "D"
    pub option: String,
    pub is_correct: bool,
    /// Why this option is correct or what misconception it targets.
    pub explanation: String,
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

// ─── Tutor Chat ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TutorMessage {
    pub role: String, // "user" | "assistant" | "system"
    pub content: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TutorChatRequest {
    pub messages: Vec<TutorMessage>,
    pub model: String,
    pub api_key: String,
    /// If true, triggers diagnostic mode (lower temperature for precise analysis).
    pub diagnostic: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TutorChatResponse {
    pub content: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_cost_usd: Option<f64>,
}

// ─── Cleanup topics only ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupTopicsRequest {
    pub model: String,
    pub api_key: String,
    pub unknown_topics: Vec<String>,
    pub canonical_topics: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupTopicsResponse {
    pub topic_mapping: HashMap<String, String>,
}

// ─── Cleanup subtopics only ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupSubtopicsRequest {
    pub model: String,
    pub api_key: String,
    pub unknown_subtopics: Vec<String>,
    pub canonical_subtopics: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupSubtopicsResponse {
    pub subtopic_mapping: HashMap<String, String>,
}

// ─── Export to Anki ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportQuestionToAnkiRequest {
    pub id: String,
    pub question: String,
    pub answer: String,
    pub topic: String,
    pub subtopic: String,
    pub options: Option<Vec<McOption>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportQuestionToAnkiResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

// ─── Multiple-choice ──────────────────────────────────────────────────────────

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateMcQuestionsRequest {
    pub topics: Vec<String>,
    pub difficulty: String,
    pub question_count: usize,
    pub model: String,
    pub api_key: String,
    pub include_exam_context: Option<bool>,
    pub tech_mode: Option<String>,
    pub subtopics: Option<Vec<String>>,
    pub custom_focus_area: Option<String>,
    pub avoid_similar_questions: Option<bool>,
    pub prior_question_prompts: Option<Vec<String>>,
    pub strict_latex_validation: Option<bool>,
    pub diversity_strictness: Option<String>,
    pub ai_difficulty_scaling_enabled: Option<bool>,
    pub shuffle_subtopics: Option<bool>,
    pub recent_average_score: Option<f64>,
    pub recent_difficulty: Option<String>,
    pub average_marks_per_question: Option<u8>,
    // Model generation parameters
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub seed: Option<u64>,
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
    #[serde(default)]
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verb_diversity_count: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scaffold_pattern: Option<String>,
}

/// Returned to the frontend (includes fields we compute locally).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateMcQuestionsResponse {
    pub questions: Vec<McQuestion>,
    pub duration_ms: u64,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_cost_usd: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distinctness_avg: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub multi_step_depth_avg: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command_verb_diversity: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mark_allocation_variance: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality_diagnostics: Option<GenerationQualityDiagnostics>,
}
