use std::collections::{HashMap, HashSet};
use crate::models::{CommandResult, AppError};
use crate::openrouter::{call_openrouter, OpenRouterRequestConfig};
use crate::parsing::{extract_json_array, extract_json_object, repair_llm_json_trailing_commas, sanitize_for_api};
use crate::schemas;
use crate::prompts;

pub struct CleanupService;

impl CleanupService {
    pub fn parse_cleanup_mappings(raw: &str) -> CommandResult<Vec<(String, String)>> {
        let protected = crate::parsing::protect_latex_in_raw_json(raw);
        let value: Option<serde_json::Value> = serde_json::from_str(&protected)
            .ok()
            .or_else(|| serde_json::from_str(&repair_llm_json_trailing_commas(&protected)).ok());

        let value = match value {
            Some(v) => v,
            None => {
                if let Some(arr_str) = extract_json_array(&protected) {
                    serde_json::from_str(&arr_str).map_err(|e| {
                        AppError::new("MODEL_PARSE_ERROR", format!("Invalid JSON array: {e}"))
                    })?
                } else if let Some(obj_str) = extract_json_object(&protected) {
                    serde_json::from_str(&obj_str).map_err(|e| {
                        AppError::new("MODEL_PARSE_ERROR", format!("Invalid JSON object: {e}"))
                    })?
                } else {
                    return Err(AppError::new("MODEL_PARSE_ERROR", "No JSON in response."));
                }
            }
        };

        let arr_opt = value.get("mappings").and_then(|v| v.as_array()).or_else(|| value.as_array());
        let items: Vec<&serde_json::Value> = match arr_opt {
            Some(arr) => arr.iter().collect(),
            None => vec![&value],
        };

        let mut out = Vec::new();
        for item in items {
            let unknown = item.get("unknown").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
            let canonical = item.get("canonical").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
            if let (Some(u), Some(c)) = (unknown, canonical) {
                out.push((u, c));
            }
        }
        Ok(out)
    }

    pub fn auto_map_exact(unknowns: &[String], canonical: &[String]) -> (HashMap<String, String>, Vec<String>) {
        let mut mapping = HashMap::new();
        let mut remaining = Vec::new();
        for u in unknowns {
            let u_trimmed = u.trim();
            if let Some(exact) = canonical.iter().find(|&c| c.eq_ignore_ascii_case(u_trimmed)) {
                mapping.insert(u_trimmed.to_string(), exact.clone());
            } else {
                remaining.push(u_trimmed.to_string());
            }
        }
        (mapping, remaining)
    }

    pub fn validate_and_filter_mappings(raw_mappings: Vec<(String, String)>, canonical: &[String], existing: &HashMap<String, String>) -> HashMap<String, String> {
        let canonical_set: HashSet<&str> = canonical.iter().map(|s| s.as_str()).collect();
        let mut result = existing.clone();
        for (unknown, canonical_val) in raw_mappings {
            let u = unknown.trim();
            let c = canonical_val.trim();
            if u.is_empty() || c.is_empty() || u.eq_ignore_ascii_case(c) { continue; }
            if !canonical_set.contains(c) { continue; }
            if !result.contains_key(u) { result.insert(u.to_string(), c.to_string()); }
        }
        result
    }

    pub async fn batch_cleanup(unknowns: &[String], canonical: &[String], api_key: &str, model: &str) -> CommandResult<HashMap<String, String>> {
        let (mut mapping, remaining) = Self::auto_map_exact(unknowns, canonical);
        if remaining.is_empty() { return Ok(mapping); }

        let schema = schemas::cleanup_mappings_format(model);
        let system_prompt = prompts::cleanup_system_prompt();

        const CLEANUP_BATCH_SIZE: usize = 10;

        for chunk in remaining.chunks(CLEANUP_BATCH_SIZE) {
            let user_prompt = format!("Map each 'Unknown' item to closest 'Canonical'.\n\nCanonical:\n- {}\n\nUnknown:\n- {}", canonical.join("\n- "), sanitize_for_api(&chunk.join("\n- ")));
            let result = call_openrouter(OpenRouterRequestConfig::new(api_key, model, system_prompt, serde_json::Value::String(user_prompt), schema.clone(), 2048)).await?;
            let raw_mappings = Self::parse_cleanup_mappings(&result.content)?;
            mapping = Self::validate_and_filter_mappings(raw_mappings, canonical, &mapping);
        }
        Ok(mapping)
    }
}
