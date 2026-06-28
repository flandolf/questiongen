use crate::http_client::get_json;
use crate::models::{AppError, CommandResult};
use serde::{Deserialize, Serialize};

const NVIDIA_BASE: &str = "https://integrate.api.nvidia.com/v1";

// ─── Response types ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NvidiaModelList {
    pub object: String,
    pub data: Vec<NvidiaModelEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NvidiaModelEntry {
    pub id: String,
    pub name: Option<String>,
    /// Heuristic: id contains known VL/vision patterns. NVIDIA NIMs that
    /// support image input typically advertise it via `vl` / `vision` /
    /// `nemotron-vl` style ids.
    pub supports_images: bool,
}

// ─── Wire types ───────────────────────────────────────────────────────────────
//
// NVIDIA's `/v1/models` endpoint mirrors the OpenAI shape. Some models
// include `owned_by`, others don't — both are referenced as `String`
// so missing fields are tolerated.

#[derive(Debug, Deserialize)]
struct ModelsListResponse {
    object: Option<String>,
    data: Vec<ModelsListEntry>,
}

#[derive(Debug, Deserialize)]
struct ModelsListEntry {
    id: String,
    #[serde(default)]
    owned_by: Option<String>,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/// NVIDIA NIM id heuristics for vision-capable models. Coverage is
/// deliberately conservative — false positives are surfaced to the user
/// as a "no vision detected" warning rather than a hard failure.
fn id_signals_vision(id: &str) -> bool {
    let lower = id.to_ascii_lowercase();
    if lower.contains("-vl-") || lower.contains("-vl:") || lower.ends_with("-vl") {
        return true;
    }
    if lower.contains("nemotron-vl") || lower.contains("vila") {
        return true;
    }
    if lower.contains("cosmos") || lower.contains("nv-grounding") {
        return true;
    }
    false
}

/// Build a human-friendly display name from an NVIDIA model id when no
/// upstream `owned_by`/display name is provided. Falls back to a passthrough.
fn derive_display_name(id: &str) -> String {
    let mut out = String::with_capacity(id.len());
    for segment in id.split('-') {
        if out.is_empty() {
            out.push_str(segment);
        } else {
            let mut chars = segment.chars();
            if let Some(first) = chars.next() {
                out.push(' ');
                out.push(first.to_ascii_uppercase());
                out.extend(chars);
            }
        }
    }
    out
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_nvidia_models(api_key: String) -> CommandResult<NvidiaModelList> {
    if api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "API key required."));
    }

    let response = get_json(&format!("{NVIDIA_BASE}/models"), api_key.trim()).await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::new(
            "NVIDIA_ERROR",
            format!("NVIDIA returned {status}: {body}"),
        ));
    }

    let parsed: ModelsListResponse = response
        .json()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Invalid response: {e}")))?;

    let data: Vec<NvidiaModelEntry> = parsed
        .data
        .into_iter()
        .map(|m| {
            let id = m.id;
            let supports_images = id_signals_vision(&id);
            let name = m.owned_by.filter(|v| !v.is_empty()).map(|owned_by| {
                let mut joined = owned_by;
                joined.push(' ');
                joined.push_str(&derive_display_name(&id));
                joined
            });
            NvidiaModelEntry {
                id,
                name,
                supports_images,
            }
        })
        .collect();

    Ok(NvidiaModelList {
        object: parsed.object.unwrap_or_else(|| "list".to_string()),
        data,
    })
}
