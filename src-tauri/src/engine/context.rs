use crate::models::AbortSignal;

/// Execution context shared across all engine pipelines.
///
/// Holds the Tauri app handle for emitting events, the abort signal for
/// cancellation, and generation-wide configuration.
#[derive(Clone)]
pub struct EngineContext {
    pub app: tauri::AppHandle,
    pub abort_signal: AbortSignal,
}

impl EngineContext {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self {
            app,
            abort_signal: AbortSignal::new(),
        }
    }

    pub fn with_abort_signal(mut self, signal: AbortSignal) -> Self {
        self.abort_signal = signal;
        self
    }

    pub fn check_abort(&self) -> Result<(), crate::models::AppError> {
        if self.abort_signal.is_aborted() {
            return Err(crate::models::AppError::new(
                "ABORTED",
                "Generation aborted by user",
            ));
        }
        Ok(())
    }


}
