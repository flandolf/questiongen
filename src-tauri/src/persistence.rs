use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

use crate::constants::APP_STATE_FILE_NAME;
use crate::models::{AppError, CommandResult};

#[tauri::command]
pub fn load_persisted_state(app: tauri::AppHandle) -> CommandResult<serde_json::Value> {
    let path = state_path(&app)?;
    if !path.exists() { return Ok(serde_json::json!({})); }

    let content = fs::read_to_string(&path)
        .map_err(|e| AppError::new("PERSISTENCE_READ_ERROR", format!("Could not read state: {e}")))?;

    if content.trim().is_empty() { return Ok(serde_json::json!({})); }

    serde_json::from_str(&content)
        .map_err(|e| AppError::new("PERSISTENCE_PARSE_ERROR", format!("Invalid state JSON: {e}")))
}

#[tauri::command]
pub fn save_persisted_state(app: tauri::AppHandle, state: serde_json::Value) -> CommandResult<()> {
    if !state.is_object() {
        return Err(AppError::new("PERSISTENCE_VALIDATION_ERROR", "State must be a JSON object."));
    }
    let path = state_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| AppError::new("PERSISTENCE_DIR_ERROR", format!("Cannot create dir: {e}")))?;
    }

    let payload = serde_json::to_string(&state)
        .map_err(|e| AppError::new("PERSISTENCE_SERIALIZE_ERROR", format!("Serialize error: {e}")))?;

    // Atomic write via temp file + rename.
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, payload)
        .map_err(|e| AppError::new("PERSISTENCE_WRITE_ERROR", format!("Write error: {e}")))?;
    remove_if_exists(&path)?;
    fs::rename(&tmp, &path)
        .map_err(|e| AppError::new("PERSISTENCE_RENAME_ERROR", format!("Rename error: {e}")))?;
    Ok(())
}

fn state_path(app: &tauri::AppHandle) -> CommandResult<PathBuf> {
    app.path().app_data_dir()
        .map(|d| d.join(APP_STATE_FILE_NAME))
        .map_err(|e| AppError::new("PERSISTENCE_PATH_ERROR", format!("Cannot resolve data dir: {e}")))
}

fn remove_if_exists(path: &Path) -> CommandResult<()> {
    fs::remove_file(path).or_else(|e| {
        if e.kind() == std::io::ErrorKind::NotFound { Ok(()) }
        else { Err(AppError::new("PERSISTENCE_REPLACE_ERROR", format!("Cannot replace state file: {e}"))) }
    })
}
