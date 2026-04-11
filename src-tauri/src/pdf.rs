use std::collections::HashSet;
use std::path::{Path, PathBuf};
use crate::catalog;
use base64::{engine::general_purpose, Engine as _};
use tauri::Manager;

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
        let Ok(bytes) = std::fs::read(&path) else {
            continue;
        };
        let data_url = format!(
            "data:application/pdf;base64,{}",
            general_purpose::STANDARD.encode(&bytes)
        );
        parts.push(serde_json::json!({
            "type": "file",
            "file": {
                "filename": filename,
                "file_data": data_url,
            }
        }));
    }
    parts
}

pub fn build_exam_file_parts(app: &tauri::AppHandle, topics: &[String]) -> Vec<serde_json::Value> {
    let filenames = exam_pdf_names_for_topics(topics);
    build_pdf_file_parts(app, "exams", &filenames)
}

pub fn build_report_file_parts(app: &tauri::AppHandle, topics: &[String]) -> Vec<serde_json::Value> {
    let filenames = report_pdf_names_for_topics(topics);
    build_pdf_file_parts(app, "reports", &filenames)
}

pub fn plugins_for_model(supports_files: bool) -> serde_json::Value {
    if supports_files {
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
