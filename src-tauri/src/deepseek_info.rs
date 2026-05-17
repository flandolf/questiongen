use crate::models::{AppError, CommandResult};
use crate::llm::http_client;
use reqwest::header::AUTHORIZATION;
use serde::{Deserialize, Serialize};

const DEEPSEEK_BASE: &str = "https://api.deepseek.com";

// ─── Response types ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepSeekBalance {
    pub is_available: bool,
    pub balance_infos: Vec<BalanceInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceInfo {
    pub currency: String,
    pub total_balance: String,
    pub granted_balance: String,
    pub topped_up_balance: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepSeekModelList {
    pub object: String,
    pub data: Vec<DeepSeekModelEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepSeekModelEntry {
    pub id: String,
    pub object: String,
    pub owned_by: String,
}

// ─── Wire types ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct BalanceResponse {
    is_available: bool,
    balance_infos: Vec<BalanceResponseInfo>,
}

#[derive(Debug, Deserialize)]
struct BalanceResponseInfo {
    currency: String,
    total_balance: String,
    granted_balance: String,
    topped_up_balance: String,
}

#[derive(Debug, Deserialize)]
struct ModelsListResponse {
    object: String,
    data: Vec<ModelsListEntry>,
}

#[derive(Debug, Deserialize)]
struct ModelsListEntry {
    id: String,
    object: String,
    owned_by: String,
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_deepseek_balance(api_key: String) -> CommandResult<DeepSeekBalance> {
    if api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "API key required."));
    }

    let response = http_client()
        .get(format!("{DEEPSEEK_BASE}/user/balance"))
        .header(AUTHORIZATION, format!("Bearer {}", api_key.trim()))
        .send()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Request failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::new(
            "DEEPSEEK_ERROR",
            format!("DeepSeek returned {status}: {body}"),
        ));
    }

    let parsed: BalanceResponse = response
        .json()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Invalid response: {e}")))?;

    Ok(DeepSeekBalance {
        is_available: parsed.is_available,
        balance_infos: parsed
            .balance_infos
            .into_iter()
            .map(|b| BalanceInfo {
                currency: b.currency,
                total_balance: b.total_balance,
                granted_balance: b.granted_balance,
                topped_up_balance: b.topped_up_balance,
            })
            .collect(),
    })
}

#[tauri::command]
pub async fn list_deepseek_models(api_key: String) -> CommandResult<DeepSeekModelList> {
    if api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "API key required."));
    }

    let response = http_client()
        .get(format!("{DEEPSEEK_BASE}/models"))
        .header(AUTHORIZATION, format!("Bearer {}", api_key.trim()))
        .send()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Request failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::new(
            "DEEPSEEK_ERROR",
            format!("DeepSeek returned {status}: {body}"),
        ));
    }

    let parsed: ModelsListResponse = response
        .json()
        .await
        .map_err(|e| AppError::new("NETWORK_ERROR", format!("Invalid response: {e}")))?;

    Ok(DeepSeekModelList {
        object: parsed.object,
        data: parsed
            .data
            .into_iter()
            .map(|m| DeepSeekModelEntry {
                id: m.id,
                object: m.object,
                owned_by: m.owned_by,
            })
            .collect(),
    })
}
