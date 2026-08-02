pub mod chatgpt;
pub mod cleanup;
pub mod context;
pub mod generation;
pub mod image;
pub mod marking;
pub mod output;
pub mod pdf;
pub mod prompt;
pub mod subtopics;
pub mod tutor;

use crate::models::{AppError, CommandResult, CostQuality, LlmStreamEvent, ModelRoute};
use context::EngineContext;

pub use cleanup::cleanup_topics;
/// Re-export high-level APIs matching Tauri command signatures.
pub use generation::{generate_mc_questions, generate_written_questions};
pub use image::analyze_image;
pub use marking::{batch_mark_answers, mark_answer, mark_pdf};
pub use pdf::discover_pdf_questions;
pub use subtopics::generate_subtopics;
pub use tutor::tutor_chat;

/// Shared helper: models must come from the connected ChatGPT account.
pub fn validate_model(model: &str) -> CommandResult<()> {
    if model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model required."));
    }
    Ok(())
}

/// Shared helper: emit a generation status event.
pub fn emit_status(ctx: &EngineContext, payload: serde_json::Value) {
    if let Err(e) = ctx.app.emit("generation-status", payload) {
        eprintln!("app.emit failed: {e}");
    }
}

/// Shared helper: emit a rust-log event.
pub fn rust_log(ctx: &EngineContext, level: &str, message: &str, data: Option<serde_json::Value>) {
    let _ = ctx.app.emit(
        "rust-log",
        serde_json::json!({
            "level": level,
            "message": message,
            "data": data,
        }),
    );
}

// ─── Unified LLM stream event helpers ────────────────────────────────────────

/// Derive the Tauri event name for a given `LlmStreamEvent` variant.
fn llm_stream_event_name(event: &LlmStreamEvent) -> &'static str {
    match event {
        LlmStreamEvent::Start { .. } => "llm-stream-start",
        LlmStreamEvent::Token { .. } => "llm-stream-token",
        LlmStreamEvent::Usage { .. } => "llm-stream-usage",
        LlmStreamEvent::End { .. } => "llm-stream-end",
        LlmStreamEvent::Error { .. } => "llm-stream-error",
    }
}

/// Emit a canonical `LlmStreamEvent` to the frontend.
/// Event name is derived from the variant: `llm-stream-start`, `llm-stream-token`, etc.
pub fn emit_llm_stream_event(app: &tauri::AppHandle, event: &LlmStreamEvent) {
    let event_name = llm_stream_event_name(event);
    if let Err(e) = app.emit(event_name, event) {
        eprintln!("app.emit({event_name}) failed: {e}");
    }
}

/// Convenience: emit `llm-stream-start`.
pub fn emit_stream_start(
    app: &tauri::AppHandle,
    request_id: &str,
    task: &str,
    model_id: &str,
    topic: Option<String>,
    question_id: Option<String>,
) {
    emit_llm_stream_event(
        app,
        &LlmStreamEvent::Start {
            request_id: request_id.to_string(),
            task: task.to_string(),
            route: ModelRoute::new(model_id),
            topic,
            question_id,
        },
    );
}

/// Convenience: emit `llm-stream-token`.
pub fn emit_stream_token(app: &tauri::AppHandle, request_id: &str, text: &str) {
    emit_llm_stream_event(
        app,
        &LlmStreamEvent::Token {
            request_id: request_id.to_string(),
            text: text.to_string(),
        },
    );
}

/// Convenience: emit `llm-stream-usage`.
pub fn emit_stream_usage(
    app: &tauri::AppHandle,
    request_id: &str,
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
    reasoning_tokens: u32,
    cost_usd: Option<f64>,
    cost_quality: CostQuality,
) {
    emit_llm_stream_event(
        app,
        &LlmStreamEvent::Usage {
            request_id: request_id.to_string(),
            prompt_tokens,
            completion_tokens,
            total_tokens,
            reasoning_tokens,
            cost_usd,
            cost_quality,
        },
    );
}

/// Convenience: emit `llm-stream-end`.
pub fn emit_stream_end(app: &tauri::AppHandle, request_id: &str) {
    emit_llm_stream_event(
        app,
        &LlmStreamEvent::End {
            request_id: request_id.to_string(),
        },
    );
}

/// Convenience: emit `llm-stream-error`.
pub fn emit_stream_error(app: &tauri::AppHandle, request_id: &str, code: &str, message: &str) {
    emit_llm_stream_event(
        app,
        &LlmStreamEvent::Error {
            request_id: request_id.to_string(),
            code: code.to_string(),
            message: message.to_string(),
        },
    );
}

use tauri::Emitter;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{CostQuality, LlmStreamEvent, ModelRoute};

    // ─── Event name mapping ─────────────────────────────────────────────────

    #[test]
    fn event_name_for_start() {
        let ev = LlmStreamEvent::Start {
            request_id: "r".into(),
            task: "t".into(),
            route: ModelRoute::new("m"),
            topic: None,
            question_id: None,
        };
        assert_eq!(llm_stream_event_name(&ev), "llm-stream-start");
    }

    #[test]
    fn event_name_for_token() {
        let ev = LlmStreamEvent::Token {
            request_id: "r".into(),
            text: "hello".into(),
        };
        assert_eq!(llm_stream_event_name(&ev), "llm-stream-token");
    }

    #[test]
    fn event_name_for_usage() {
        let ev = LlmStreamEvent::Usage {
            request_id: "r".into(),
            prompt_tokens: 1,
            completion_tokens: 2,
            total_tokens: 3,
            reasoning_tokens: 0,
            cost_usd: None,
            cost_quality: CostQuality::Unknown,
        };
        assert_eq!(llm_stream_event_name(&ev), "llm-stream-usage");
    }

    #[test]
    fn event_name_for_end() {
        let ev = LlmStreamEvent::End {
            request_id: "r".into(),
        };
        assert_eq!(llm_stream_event_name(&ev), "llm-stream-end");
    }

    #[test]
    fn event_name_for_error() {
        let ev = LlmStreamEvent::Error {
            request_id: "r".into(),
            code: "E".into(),
            message: "m".into(),
        };
        assert_eq!(llm_stream_event_name(&ev), "llm-stream-error");
    }

    // ─── JSON payload serialization ─────────────────────────────────────────

    #[test]
    fn start_event_payload_shape() {
        let ev = LlmStreamEvent::Start {
            request_id: "req-abc".into(),
            task: "generate_questions".into(),
            route: ModelRoute::new("gpt-5.6-terra"),
            topic: Some("Chemistry".into()),
            question_id: Some("q-1".into()),
        };
        let json = serde_json::to_value(&ev).unwrap();

        assert_eq!(json["event"], "start");
        assert_eq!(json["requestId"], "req-abc");
        assert_eq!(json["task"], "generate_questions");
        assert_eq!(json["route"]["modelId"], "gpt-5.6-terra");
        assert_eq!(json["topic"], "Chemistry");
        assert_eq!(json["questionId"], "q-1");
    }

    #[test]
    fn start_event_payload_omits_null_optionals() {
        let ev = LlmStreamEvent::Start {
            request_id: "req-xyz".into(),
            task: "tutor_chat".into(),
            route: ModelRoute::new("gpt-5.6-terra"),
            topic: None,
            question_id: None,
        };
        let json = serde_json::to_value(&ev).unwrap();

        assert_eq!(json["event"], "start");
        assert_eq!(json["requestId"], "req-xyz");
        assert_eq!(json["task"], "tutor_chat");
        assert_eq!(json["route"]["modelId"], "gpt-5.6-terra");
        assert!(json.get("topic").is_none() || json["topic"].is_null());
        assert!(json.get("questionId").is_none() || json["questionId"].is_null());
    }

    #[test]
    fn token_event_payload_shape() {
        let ev = LlmStreamEvent::Token {
            request_id: "req-tok".into(),
            text: "The probability of failure is".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();

        assert_eq!(json["event"], "token");
        assert_eq!(json["requestId"], "req-tok");
        assert_eq!(json["text"], "The probability of failure is");
    }

    #[test]
    fn usage_event_payload_shape() {
        let ev = LlmStreamEvent::Usage {
            request_id: "req-use".into(),
            prompt_tokens: 1024,
            completion_tokens: 512,
            total_tokens: 1536,
            reasoning_tokens: 128,
            cost_usd: Some(0.00345),
            cost_quality: CostQuality::Priced,
        };
        let json = serde_json::to_value(&ev).unwrap();

        assert_eq!(json["event"], "usage");
        assert_eq!(json["requestId"], "req-use");
        assert_eq!(json["promptTokens"], 1024);
        assert_eq!(json["completionTokens"], 512);
        assert_eq!(json["totalTokens"], 1536);
        assert_eq!(json["reasoningTokens"], 128);
        assert_eq!(json["costUsd"], 0.00345);
        assert_eq!(json["costQuality"], "priced");
    }

    #[test]
    fn usage_event_payload_without_cost() {
        let ev = LlmStreamEvent::Usage {
            request_id: "req-use2".into(),
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
            reasoning_tokens: 0,
            cost_usd: None,
            cost_quality: CostQuality::Unknown,
        };
        let json = serde_json::to_value(&ev).unwrap();

        assert_eq!(json["event"], "usage");
        assert_eq!(json["requestId"], "req-use2");
        assert_eq!(json["promptTokens"], 100);
        assert_eq!(json["completionTokens"], 50);
        assert_eq!(json["totalTokens"], 150);
        assert_eq!(json["reasoningTokens"], 0);
        assert!(json.get("costUsd").is_none() || json["costUsd"].is_null());
        assert_eq!(json["costQuality"], "unknown");
    }

    #[test]
    fn end_event_payload_shape() {
        let ev = LlmStreamEvent::End {
            request_id: "req-end".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();

        assert_eq!(json["event"], "end");
        assert_eq!(json["requestId"], "req-end");
    }

    #[test]
    fn error_event_payload_shape() {
        let ev = LlmStreamEvent::Error {
            request_id: "req-err".into(),
            code: "API_ERROR".into(),
            message: "Rate limit exceeded".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();

        assert_eq!(json["event"], "error");
        assert_eq!(json["requestId"], "req-err");
        assert_eq!(json["code"], "API_ERROR");
        assert_eq!(json["message"], "Rate limit exceeded");
    }

    #[test]
    fn cost_quality_variants_serialize_to_expected_strings() {
        let cases: &[(CostQuality, &str)] = &[
            (CostQuality::Actual, "actual"),
            (CostQuality::Priced, "priced"),
            (CostQuality::Manual, "manual"),
            (CostQuality::Estimated, "estimated"),
            (CostQuality::Unknown, "unknown"),
        ];
        for (quality, expected) in cases {
            let json = serde_json::to_value(quality).unwrap();
            assert_eq!(json, *expected, "CostQuality variant mismatch");
        }
    }
}
