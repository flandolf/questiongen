pub mod cleanup;
pub mod context;
pub mod generation;
pub mod image;
pub mod marking;
pub mod output;
pub mod pdf;
pub mod prompt;
pub mod provider;
pub mod subtopics;
pub mod tutor;

use crate::models::{AppError, CommandResult};
use context::EngineContext;

pub use cleanup::cleanup_topics;
/// Re-export high-level APIs matching Tauri command signatures.
pub use generation::{generate_mc_questions, generate_written_questions};
pub use image::analyze_image;
pub use marking::{batch_mark_answers, mark_answer, mark_pdf};
pub use pdf::discover_pdf_questions;
pub use subtopics::generate_subtopics;
pub use tutor::tutor_chat;

/// Shared helper: validate API key and model are non-empty.
pub fn validate_credentials(api_key: &str, model: &str) -> CommandResult<()> {
    if api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "API key required."));
    }
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

use tauri::Emitter;
