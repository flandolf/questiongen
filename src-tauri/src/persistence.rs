use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

use crate::constants::APP_STATE_FILE_NAME;
use crate::models::{AppError, CommandResult};

#[tauri::command]
pub fn load_persisted_state(app: tauri::AppHandle) -> CommandResult<serde_json::Value> {
    let path = state_path(&app)?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }

    let content = fs::read_to_string(&path).map_err(|e| {
        AppError::new(
            "PERSISTENCE_READ_ERROR",
            format!("Could not read state: {e}"),
        )
    })?;

    if content.trim().is_empty() {
        return Ok(serde_json::json!({}));
    }

    serde_json::from_str(&content).map_err(|e| {
        AppError::new(
            "PERSISTENCE_PARSE_ERROR",
            format!("Invalid state JSON: {e}"),
        )
    })
}

#[tauri::command]
pub fn save_persisted_state(app: tauri::AppHandle, state: serde_json::Value) -> CommandResult<()> {
    if !state.is_object() {
        return Err(AppError::new(
            "PERSISTENCE_VALIDATION_ERROR",
            "State must be a JSON object.",
        ));
    }
    let path = state_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            AppError::new("PERSISTENCE_DIR_ERROR", format!("Cannot create dir: {e}"))
        })?;
    }

    let payload = serde_json::to_string(&state).map_err(|e| {
        AppError::new(
            "PERSISTENCE_SERIALIZE_ERROR",
            format!("Serialize error: {e}"),
        )
    })?;

    // Atomic write via temp file + rename.
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, payload)
        .map_err(|e| AppError::new("PERSISTENCE_WRITE_ERROR", format!("Write error: {e}")))?;
    // On Unix, fs::rename atomically replaces the target if it exists.
    // On Windows, rename fails if the target exists, so remove first.
    #[cfg(windows)]
    remove_if_exists(&path)?;
    fs::rename(&tmp, &path)
        .map_err(|e| AppError::new("PERSISTENCE_RENAME_ERROR", format!("Rename error: {e}")))?;
    Ok(())
}

#[tauri::command]
pub fn export_data_file(
    app: tauri::AppHandle,
    envelope: serde_json::Value,
    suggested_filename: Option<String>,
) -> CommandResult<String> {
    if !envelope.is_object() {
        return Err(AppError::new(
            "EXPORT_VALIDATION_ERROR",
            "Export payload must be a JSON object.",
        ));
    }

    let payload = serde_json::to_string_pretty(&envelope).map_err(|e| {
        AppError::new(
            "EXPORT_SERIALIZE_ERROR",
            format!("Could not encode export data: {e}"),
        )
    })?;

    let filename = normalize_export_filename(
        suggested_filename
            .as_deref()
            .unwrap_or("questiongen-export.json"),
    );
    let export_dir = export_dir_path(&app)?;
    fs::create_dir_all(&export_dir)
        .map_err(|e| AppError::new("EXPORT_DIR_ERROR", format!("Cannot create dir: {e}")))?;

    let path = next_available_path(&export_dir, &filename);
    fs::write(&path, payload)
        .map_err(|e| AppError::new("EXPORT_WRITE_ERROR", format!("Write error: {e}")))?;

    Ok(path.to_string_lossy().to_string())
}

fn state_path(app: &tauri::AppHandle) -> CommandResult<PathBuf> {
    app.path()
        .app_data_dir()
        .map(|d| d.join(APP_STATE_FILE_NAME))
        .map_err(|e| {
            AppError::new(
                "PERSISTENCE_PATH_ERROR",
                format!("Cannot resolve data dir: {e}"),
            )
        })
}

fn export_dir_path(app: &tauri::AppHandle) -> CommandResult<PathBuf> {
    if let Ok(downloads) = app.path().download_dir() {
        return Ok(downloads);
    }
    if let Ok(documents) = app.path().document_dir() {
        return Ok(documents);
    }
    app.path()
        .app_data_dir()
        .map(|d| d.join("exports"))
        .map_err(|e| AppError::new("EXPORT_PATH_ERROR", format!("Cannot resolve export dir: {e}")))
}

fn normalize_export_filename(raw: &str) -> String {
    let mut clean = String::with_capacity(raw.len());
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
            clean.push(ch);
        } else if ch.is_whitespace() {
            clean.push('-');
        }
    }

    if clean.is_empty() {
        clean.push_str("questiongen-export");
    }

    if !clean.ends_with(".json") {
        clean.push_str(".json");
    }

    clean
}

fn next_available_path(dir: &Path, filename: &str) -> PathBuf {
    let base_path = dir.join(filename);
    if !base_path.exists() {
        return base_path;
    }

    let stem = base_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("questiongen-export");
    let ext = base_path.extension().and_then(|s| s.to_str()).unwrap_or("json");

    for i in 1..1000 {
        let candidate = dir.join(format!("{stem}-{i}.{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }

    dir.join(format!("{stem}-{}.{}", chrono_like_timestamp(), ext))
}

fn chrono_like_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    secs.to_string()
}

#[cfg(windows)]
fn remove_if_exists(path: &Path) -> CommandResult<()> {
    fs::remove_file(path).or_else(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            Ok(())
        } else {
            Err(AppError::new(
                "PERSISTENCE_REPLACE_ERROR",
                format!("Cannot replace state file: {e}"),
            ))
        }
    })
}
