use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

use crate::constants::APP_STATE_FILE_NAME;
use crate::models::{AppError, CommandResult};

/// Normalize paths from the file dialog or persisted settings (`file://` URLs).
fn normalize_fs_path_arg(raw: &str) -> String {
    let s = raw.trim();
    let Some(rest) = s.strip_prefix("file://") else {
        return s.to_string();
    };
    let path = if let Some(after_localhost) = rest.strip_prefix("localhost") {
        if after_localhost.starts_with('/') {
            after_localhost.to_string()
        } else {
            format!("/{after_localhost}")
        }
    } else if rest.starts_with('/') {
        rest.to_string()
    } else {
        format!("/{rest}")
    };
    path
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonBackupEntry {
    pub path: String,
    pub name: String,
    pub modified_at_ms: i64,
}

fn write_export_envelope_to_dir(
    export_dir: &Path,
    envelope: &serde_json::Value,
    suggested_filename: Option<&str>,
) -> CommandResult<PathBuf> {
    if !envelope.is_object() {
        return Err(AppError::new(
            "EXPORT_VALIDATION_ERROR",
            "Export payload must be a JSON object.",
        ));
    }

    let payload = serde_json::to_string_pretty(envelope).map_err(|e| {
        AppError::new(
            "EXPORT_SERIALIZE_ERROR",
            format!("Could not encode export data: {e}"),
        )
    })?;

    let filename =
        normalize_export_filename(suggested_filename.unwrap_or("questiongen-export.json"));
    fs::create_dir_all(export_dir)
        .map_err(|e| AppError::new("EXPORT_DIR_ERROR", format!("Cannot create dir: {e}")))?;

    let path = next_available_path(export_dir, &filename);
    fs::write(&path, payload)
        .map_err(|e| AppError::new("EXPORT_WRITE_ERROR", format!("Write error: {e}")))?;

    Ok(path)
}

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
    let export_dir = export_dir_path(&app)?;
    let path = write_export_envelope_to_dir(&export_dir, &envelope, suggested_filename.as_deref())?;
    Ok(path.to_string_lossy().to_string())
}

/// Write an export JSON file into a user-chosen directory (local backup folder).
#[tauri::command]
pub fn export_data_file_to_directory(
    dir_path: String,
    envelope: serde_json::Value,
    suggested_filename: Option<String>,
) -> CommandResult<String> {
    let trimmed = normalize_fs_path_arg(&dir_path);
    if trimmed.is_empty() {
        return Err(AppError::new(
            "EXPORT_PATH_ERROR",
            "Backup folder path is empty.",
        ));
    }
    let export_dir = PathBuf::from(trimmed);
    let path = write_export_envelope_to_dir(&export_dir, &envelope, suggested_filename.as_deref())?;
    Ok(path.to_string_lossy().to_string())
}

/// List `.json` files in a directory (non-recursive), newest first by modification time.
#[tauri::command]
pub fn list_json_files_in_directory(dir_path: String) -> CommandResult<Vec<JsonBackupEntry>> {
    let trimmed = normalize_fs_path_arg(&dir_path);
    if trimmed.is_empty() {
        return Err(AppError::new("BACKUP_LIST_ERROR", "Folder path is empty."));
    }
    let dir = Path::new(trimmed.as_str());
    if !dir.is_dir() {
        return Err(AppError::new(
            "BACKUP_LIST_ERROR",
            "Folder does not exist or is not a directory.",
        ));
    }

    let mut entries: Vec<JsonBackupEntry> = Vec::new();
    let read_dir = fs::read_dir(dir)
        .map_err(|e| AppError::new("BACKUP_LIST_ERROR", format!("Cannot read folder: {e}")))?;

    for item in read_dir {
        let item = item
            .map_err(|e| AppError::new("BACKUP_LIST_ERROR", format!("Cannot read entry: {e}")))?;
        let path = item.path();
        if !path.is_file() {
            continue;
        }
        let name = item.file_name().to_string_lossy().to_string();
        if !name.to_ascii_lowercase().ends_with(".json") {
            continue;
        }
        let modified_at_ms = fs::metadata(&path)
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| {
                t.duration_since(std::time::UNIX_EPOCH).ok().map(|d| {
                    (d.as_secs().saturating_mul(1000)).saturating_add(u64::from(d.subsec_millis()))
                        as i64
                })
            })
            .unwrap_or(0);

        entries.push(JsonBackupEntry {
            path: path.to_string_lossy().to_string(),
            name,
            modified_at_ms,
        });
    }

    entries.sort_by(|a, b| b.modified_at_ms.cmp(&a.modified_at_ms));
    Ok(entries)
}

/// Read a UTF-8 text file from disk (used to import a chosen backup JSON).
#[tauri::command]
pub fn read_text_file(path: String) -> CommandResult<String> {
    let trimmed = normalize_fs_path_arg(&path);
    if trimmed.is_empty() {
        return Err(AppError::new("READ_FILE_ERROR", "Path is empty."));
    }
    let p = Path::new(trimmed.as_str());
    if !p.is_file() {
        return Err(AppError::new(
            "READ_FILE_ERROR",
            "File does not exist or is not a regular file.",
        ));
    }
    let name = p
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !name.ends_with(".json") {
        return Err(AppError::new(
            "READ_FILE_ERROR",
            "Only .json files can be read for import.",
        ));
    }

    fs::read_to_string(p)
        .map_err(|e| AppError::new("READ_FILE_ERROR", format!("Could not read file: {e}")))
}

/// Write a UTF-8 text file to disk at a chosen path.
#[tauri::command]
pub fn write_text_file(path: String, content: String) -> CommandResult<()> {
    let trimmed = normalize_fs_path_arg(&path);
    if trimmed.is_empty() {
        return Err(AppError::new("WRITE_FILE_ERROR", "Path is empty."));
    }
    let p = Path::new(trimmed.as_str());
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| AppError::new("WRITE_FILE_ERROR", format!("Cannot create dir: {e}")))?;
    }
    fs::write(p, content)
        .map_err(|e| AppError::new("WRITE_FILE_ERROR", format!("Could not write file: {e}")))
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
        .map_err(|e| {
            AppError::new(
                "EXPORT_PATH_ERROR",
                format!("Cannot resolve export dir: {e}"),
            )
        })
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
    let ext = base_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("json");

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
