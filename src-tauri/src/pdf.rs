use crate::catalog;
use base64::{engine::general_purpose, Engine as _};
use once_cell::sync::Lazy;
use std::collections::{HashMap, HashSet};
use std::fs::Metadata;
use std::io::Cursor;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

pub fn extract_pages_from_pdf(pdf_base64: &str, page_indices: &[usize]) -> Result<String, String> {
    let data = if let Some(stripped) = pdf_base64.strip_prefix("data:application/pdf;base64,") {
        general_purpose::STANDARD
            .decode(stripped)
            .map_err(|e| format!("Failed to decode base64: {}", e))?
    } else {
        general_purpose::STANDARD
            .decode(pdf_base64)
            .map_err(|e| format!("Failed to decode base64: {}", e))?
    };

    let mut doc =
        lopdf::Document::load_mem(&data).map_err(|e| format!("Failed to load PDF: {}", e))?;

    let page_count = doc.get_pages().len();
    if page_count == 0 {
        return Err("PDF has no pages".to_string());
    }

    let valid_indices: Vec<u32> = page_indices
        .iter()
        .filter(|&&i| i < page_count)
        .map(|&i| i as u32)
        .collect();

    if valid_indices.is_empty() {
        return Err("No valid page indices provided".to_string());
    }

    let pages: Vec<u32> = doc.get_pages().keys().cloned().collect();
    let pages_to_delete: Vec<u32> = pages
        .iter()
        .filter(|p| !valid_indices.contains(p))
        .cloned()
        .collect();

    for page_num in pages_to_delete {
        doc.delete_pages(&[page_num]);
    }

    let mut out_bytes = Vec::new();
    doc.save_to(&mut Cursor::new(&mut out_bytes))
        .map_err(|e| format!("Failed to save PDF: {}", e))?;

    Ok(format!(
        "data:application/pdf;base64,{}",
        general_purpose::STANDARD.encode(&out_bytes)
    ))
}

#[derive(Clone)]
struct CachedPdfPart {
    size: u64,
    modified_epoch_secs: u64,
    part: serde_json::Value,
}

static PDF_PART_CACHE: Lazy<Mutex<HashMap<String, CachedPdfPart>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn metadata_signature(metadata: &Metadata) -> (u64, u64) {
    let modified_epoch_secs = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    (metadata.len(), modified_epoch_secs)
}

pub fn exam_pdf_names_for_topics(topics: &[String]) -> Vec<&str> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for topic in topics {
        for name in catalog::topic_exam_pdfs(topic) {
            if seen.insert(name.as_str()) {
                out.push(name.as_str());
            }
        }
    }
    out
}

pub fn report_pdf_names_for_topics(topics: &[String]) -> Vec<&str> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for topic in topics {
        for name in catalog::topic_report_pdfs(topic) {
            if seen.insert(name.as_str()) {
                out.push(name.as_str());
            }
        }
    }
    out
}

pub fn resolve_pdf_path(app: &tauri::AppHandle, subdir: &str, filename: &str) -> Option<PathBuf> {
    let mut dirs = Vec::<PathBuf>::new();
    if let Ok(cwd) = std::env::current_dir() {
        dirs.push(cwd.join(subdir));
        dirs.push(cwd.join("../").join(subdir));
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        dirs.push(resource_dir.clone());
        dirs.push(resource_dir.join(subdir));
    }

    let mut seen = HashSet::<PathBuf>::new();
    for dir in dirs {
        if !seen.insert(dir.clone()) {
            continue;
        }
        let candidate = dir.join(filename);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

pub fn build_pdf_file_parts(
    app: &tauri::AppHandle,
    subdir: &str,
    filenames: &[&str],
) -> Vec<serde_json::Value> {
    let mut parts = Vec::new();
    for &filename in filenames {
        let Some(path) = resolve_pdf_path(app, subdir, filename) else {
            continue;
        };
        let Ok(metadata) = std::fs::metadata(&path) else {
            continue;
        };
        let (size, modified_epoch_secs) = metadata_signature(&metadata);
        let cache_key = path.to_string_lossy().to_string();

        if let Ok(cache) = PDF_PART_CACHE.lock() {
            if let Some(cached) = cache.get(&cache_key) {
                if cached.size == size && cached.modified_epoch_secs == modified_epoch_secs {
                    parts.push(cached.part.clone());
                    continue;
                }
            }
        }

        let Ok(bytes) = std::fs::read(&path) else {
            continue;
        };
        let data_url = format!(
            "data:application/pdf;base64,{}",
            general_purpose::STANDARD.encode(&bytes)
        );
        let part = serde_json::json!({
            "type": "file",
            "file": {
                "filename": filename,
                "file_data": data_url,
            }
        });
        if let Ok(mut cache) = PDF_PART_CACHE.lock() {
            cache.insert(
                cache_key,
                CachedPdfPart {
                    size,
                    modified_epoch_secs,
                    part: part.clone(),
                },
            );
        }
        parts.push(part);
    }
    parts
}

pub fn build_exam_file_parts(app: &tauri::AppHandle, topics: &[String]) -> Vec<serde_json::Value> {
    let filenames = exam_pdf_names_for_topics(topics);
    build_pdf_file_parts(app, "exams", &filenames)
}

pub fn build_report_file_parts(
    app: &tauri::AppHandle,
    topics: &[String],
) -> Vec<serde_json::Value> {
    let filenames = report_pdf_names_for_topics(topics);
    build_pdf_file_parts(app, "reports", &filenames)
}

pub fn plugins_for_model(supports_files: Option<bool>) -> serde_json::Value {
    if supports_files.is_none() || supports_files == Some(true) {
        serde_json::json!([{ "id": "response-healing" }])
    } else {
        serde_json::json!([
            { "id": "response-healing" },
            {
                "id": "file-parser",
                "pdf": { "engine": "cloudflare-ai" }
            }
        ])
    }
}
