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

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StudentAnswerImage {
    pub id: String,
    pub data_url: String,
    #[serde(default)]
    pub storage_path: Option<String>,
    #[serde(default)]
    pub download_url: Option<String>,
    pub timestamp: String,
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

#[derive(Debug, Serialize, Deserialize, Clone)]
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

#[derive(Debug, Serialize, Deserialize, Clone)]
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

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct McOption {
    pub label: String,
    pub text: String,
}

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

// ─── Persistence / App State ──────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersistedSettings {
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default = "default_model")]
    pub marking_model: String,
    #[serde(default)]
    pub use_separate_marking_model: bool,
    #[serde(default = "default_model")]
    pub image_marking_model: String,
    #[serde(default)]
    pub use_separate_image_marking_model: bool,
    #[serde(default)]
    pub debug_mode: bool,
    #[serde(default = "default_text_size")]
    pub question_text_size: u32,
    #[serde(default = "default_text_size")]
    pub response_text_size: u32,
    #[serde(default = "default_true")]
    pub include_exam_context: bool,
    #[serde(default)]
    pub auto_sync_interval_minutes: u32,
    #[serde(default)]
    pub sync_api_key: bool,
    #[serde(default)]
    pub local_backup_folder_path: String,
    #[serde(default)]
    pub local_backup_interval_minutes: u32,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_theme_color")]
    pub custom_theme_seed_color: String,
    #[serde(default = "default_rounding")]
    pub global_rounding: String,
    #[serde(default = "default_font")]
    pub interface_font: String,
    #[serde(default = "default_font")]
    pub heading_font: String,
    #[serde(default)]
    pub tutor_persona: String,
    #[serde(default = "default_model")]
    pub tutor_model: String,
    #[serde(default)]
    pub shuffle_subtopics: bool,
    #[serde(default)]
    pub shuffle_questions: bool,
}

fn default_model() -> String {
    "openai/gpt-5.4-mini".to_string()
}
fn default_text_size() -> u32 {
    18
}
fn default_true() -> bool {
    true
}
fn default_theme() -> String {
    "claude".to_string()
}
fn default_theme_color() -> String {
    "#3b82f6".to_string()
}
fn default_rounding() -> String {
    "md".to_string()
}
fn default_font() -> String {
    "Manrope Variable".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersistedGeneratorPreferences {
    #[serde(default)]
    pub selected_topics: Vec<String>,
    #[serde(default = "default_difficulty")]
    pub difficulty: String,
    #[serde(default = "default_tech_mode")]
    pub tech_mode: String,
    #[serde(default)]
    pub avoid_similar_questions: bool,
    #[serde(default)]
    pub selected_subtopics: HashMap<String, Vec<String>>,
    #[serde(default = "default_one")]
    pub question_count: u32,
    #[serde(default = "default_three")]
    pub average_marks_per_question: u8,
    #[serde(default = "default_question_mode")]
    pub question_mode: String,
    #[serde(default = "default_true")]
    pub ai_difficulty_scaling_enabled: bool,
    #[serde(default = "default_thresholds")]
    pub difficulty_thresholds: DifficultyThresholds,
    #[serde(default = "default_diversity")]
    pub diversity_strictness: String,
    #[serde(default = "default_true")]
    pub strict_latex_validation: bool,
    #[serde(default = "default_strategy")]
    pub generation_strategy: String,
}

fn default_difficulty() -> String {
    "Medium".to_string()
}
fn default_tech_mode() -> String {
    "tech-active".to_string()
}
fn default_one() -> u32 {
    1
}
fn default_three() -> u8 {
    3
}
fn default_question_mode() -> String {
    "written".to_string()
}
fn default_diversity() -> String {
    "moderate".to_string()
}
fn default_strategy() -> String {
    "multi-pass".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct DifficultyThresholds {
    pub increase: u8,
    pub decrease: u8,
}

fn default_thresholds() -> DifficultyThresholds {
    DifficultyThresholds {
        increase: 85,
        decrease: 70,
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersistedWrittenSession {
    #[serde(default)]
    pub questions: Vec<GeneratedQuestion>,
    #[serde(default)]
    pub active_question_index: usize,
    #[serde(default)]
    pub presented_at_by_question_id: HashMap<String, u64>,
    #[serde(default)]
    pub answers_by_question_id: HashMap<String, String>,
    #[serde(default)]
    pub images_by_question_id: HashMap<String, Option<StudentAnswerImage>>,
    #[serde(default)]
    pub feedback_by_question_id: HashMap<String, MarkAnswerResponse>,
    #[serde(default)]
    pub raw_model_output: String,
    #[serde(default)]
    pub generation_telemetry: Option<GenerationTelemetry>,
    #[serde(default)]
    pub saved_set_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersistedMcSession {
    #[serde(default)]
    pub questions: Vec<McQuestion>,
    #[serde(default)]
    pub active_question_index: usize,
    #[serde(default)]
    pub presented_at_by_question_id: HashMap<String, u64>,
    #[serde(default)]
    pub answers_by_question_id: HashMap<String, String>,
    #[serde(default)]
    pub mc_mark_override_input_by_question_id: HashMap<String, String>,
    #[serde(default)]
    pub mc_awarded_marks_by_question_id: HashMap<String, f64>,
    #[serde(default)]
    pub raw_model_output: String,
    #[serde(default)]
    pub generation_telemetry: Option<GenerationTelemetry>,
    #[serde(default)]
    pub saved_set_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GenerationTelemetry {
    pub duration_ms: u64,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    pub estimated_cost_usd: Option<f64>,
    pub distinctness_avg: Option<f32>,
    pub multi_step_depth_avg: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SavedQuestionSet {
    pub id: String,
    pub title: String,
    pub question_mode: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub last_modified: u64,
    pub preferences: PersistedGeneratorPreferences,
    pub written_session: Option<PersistedWrittenSession>,
    pub mc_session: Option<PersistedMcSession>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Analytics {
    #[serde(default, rename = "submitWrittenAnswer")]
    pub submit_written_answer: Option<serde_json::Value>,
    #[serde(default, rename = "argueForWrittenMark")]
    pub argue_for_written_mark: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuestionHistoryEntry {
    pub id: String,
    pub created_at: String,
    #[serde(default)]
    pub last_modified: u64,
    pub question: GeneratedQuestion,
    pub uploaded_answer: String,
    pub uploaded_answer_image: Option<StudentAnswerImage>,
    pub worked_solution_markdown: String,
    pub mark_response: MarkAnswerResponse,
    pub generation_telemetry: Option<GenerationTelemetry>,
    #[serde(default)]
    pub is_uploaded: bool,
    #[serde(default)]
    pub difficulty: Option<String>,
    #[serde(default)]
    pub analytics: Option<Analytics>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct McHistoryEntry {
    pub id: String,
    pub created_at: String,
    #[serde(default)]
    pub last_modified: u64,
    pub question: McQuestion,
    pub selected_answer: String,
    pub correct: bool,
    pub generation_telemetry: Option<GenerationTelemetry>,
    #[serde(default)]
    pub is_uploaded: bool,
    #[serde(default, rename = "type")]
    pub r#type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct StudyGoals {
    #[serde(default = "default_daily_goal")]
    pub daily_question_goal: u32,
    #[serde(default = "default_written_goal")]
    pub daily_written_goal: u32,
    #[serde(default = "default_mc_goal")]
    pub daily_mc_goal: u32,
    #[serde(default = "default_streak_goal")]
    pub weekly_streak_goal: u8,
}

fn default_daily_goal() -> u32 {
    10
}
fn default_written_goal() -> u32 {
    5
}
fn default_mc_goal() -> u32 {
    5
}
fn default_streak_goal() -> u8 {
    5
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct StreakData {
    #[serde(default)]
    pub current_streak: u32,
    #[serde(default)]
    pub longest_streak: u32,
    #[serde(default)]
    pub last_active_date: String,
    #[serde(default)]
    pub daily_completions: HashMap<String, DailyCompletion>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DailyCompletion {
    pub total: u32,
    pub written: u32,
    pub mc: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub preferences: PersistedGeneratorPreferences,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub last_modified: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TimeAllocation {
    pub difficulty: String,
    pub minutes_per_mark: f32,
    pub question_mode: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TimerState {
    pub questions: HashMap<String, QuestionTiming>,
    pub active_question_id: Option<String>,
    pub is_paused: bool,
    pub session_started_at: Option<u64>,
    pub session_finished_at: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuestionTiming {
    pub marks: u8,
    pub elapsed_seconds: u32,
    pub running_since_ms: Option<u64>,
    pub answered_at: Option<u64>,
    pub last_updated_at: u64,
    pub is_warning: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GenerationRecord {
    pub id: String,
    pub timestamp: String,
    pub inputs: GenerationRecordInputs,
    pub outputs: GenerationRecordOutputs,
    #[serde(default)]
    pub is_uploaded: bool,
    pub last_modified: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GenerationRecordInputs {
    pub topic: String,
    pub difficulty: String,
    pub question_count: u32,
    pub question_mode: String,
    pub tech_mode: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GenerationRecordOutputs {
    pub duration_ms: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct PersistedAppState {
    #[serde(default = "default_version")]
    pub version: u32,
    pub settings: PersistedSettings,
    pub preferences: PersistedGeneratorPreferences,
    pub written_session: PersistedWrittenSession,
    pub mc_session: PersistedMcSession,
    pub question_history: Vec<QuestionHistoryEntry>,
    pub mc_history: Vec<McHistoryEntry>,
    pub saved_sets: Vec<SavedQuestionSet>,
    pub study_goals: StudyGoals,
    pub streak_data: StreakData,
    pub generation_history: Vec<GenerationRecord>,
    pub presets: Vec<Preset>,
    pub written_timer: Option<TimerState>,
    pub mc_timer: Option<TimerState>,
    pub time_allocations: Vec<TimeAllocation>,
}

fn default_version() -> u32 {
    2
}
