use crate::json_input::{extract_json_array, extract_json_object, repair_llm_json_trailing_commas};
use crate::models::{AppError, CommandResult};
use crate::llm::{call_openrouter, OpenRouterRequestConfig};
use crate::prompts;
use crate::schemas;
use crate::text_clean::sanitize_for_api;
use std::collections::{HashMap, HashSet};

pub(crate) const AUTO_MAP_CONFIDENCE_THRESHOLD: f64 = 0.85;

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

        let arr_opt = value
            .get("mappings")
            .and_then(|v| v.as_array())
            .or_else(|| value.as_array());
        let items: Vec<&serde_json::Value> = match arr_opt {
            Some(arr) => arr.iter().collect(),
            None => vec![&value],
        };

        let mut out = Vec::new();
        for item in items {
            let unknown = item
                .get("unknown")
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            let canonical = item
                .get("canonical")
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            if let (Some(u), Some(c)) = (unknown, canonical) {
                out.push((u, c));
            }
        }
        Ok(out)
    }

    pub fn auto_map_exact(
        unknowns: &[String],
        canonical: &[String],
    ) -> (HashMap<String, String>, Vec<String>) {
        let mut mapping = HashMap::new();
        let mut remaining = Vec::new();
        for u in unknowns {
            let u_trimmed = u.trim();
            if let Some(exact) = canonical
                .iter()
                .find(|&c| c.eq_ignore_ascii_case(u_trimmed))
            {
                mapping.insert(u_trimmed.to_string(), exact.clone());
            } else {
                remaining.push(u_trimmed.to_string());
            }
        }
        (mapping, remaining)
    }

    pub fn validate_and_filter_mappings(
        raw_mappings: Vec<(String, String)>,
        canonical: &[String],
        existing: &HashMap<String, String>,
    ) -> HashMap<String, String> {
        let canonical_set: HashSet<&str> = canonical.iter().map(|s| s.as_str()).collect();
        let mut result = existing.clone();
        for (unknown, canonical_val) in raw_mappings {
            let u = unknown.trim();
            let c = canonical_val.trim();
            if u.is_empty() || c.is_empty() || u.eq_ignore_ascii_case(c) {
                continue;
            }
            if !canonical_set.contains(c) {
                continue;
            }
            if !result.contains_key(u) {
                result.insert(u.to_string(), c.to_string());
            }
        }
        result
    }

    pub async fn batch_cleanup(
        unknowns: &[String],
        canonical: &[String],
        api_key: &str,
        model: &str,
        base_url: Option<&str>,
    ) -> CommandResult<HashMap<String, String>> {
        let (mut mapping, remaining) = Self::auto_map_exact(unknowns, canonical);
        if remaining.is_empty() {
            return Ok(mapping);
        }

        let schema = schemas::cleanup_mappings_format(model);
        let system_prompt = prompts::cleanup_system_prompt();

        const CLEANUP_BATCH_SIZE: usize = 10;

        for chunk in remaining.chunks(CLEANUP_BATCH_SIZE) {
            let user_prompt = format!("Map each 'Unknown' item to closest 'Canonical'.\n\nCanonical:\n- {}\n\nUnknown:\n- {}", canonical.join("\n- "), sanitize_for_api(&chunk.join("\n- ")));
            let mut config = OpenRouterRequestConfig::new(
                api_key,
                model,
                system_prompt,
                serde_json::Value::String(user_prompt),
                schema.clone(),
                2048,
            );
            if let Some(url) = base_url {
                config = config.with_base_url(url);
            }
            let result = call_openrouter(config).await?;
            let raw_mappings = Self::parse_cleanup_mappings(&result.content)?;
            mapping = Self::validate_and_filter_mappings(raw_mappings, canonical, &mapping);
        }
        Ok(mapping)
    }
}

#[cfg(test)]
mod tests {
    use super::{CleanupService, AUTO_MAP_CONFIDENCE_THRESHOLD};
    use std::collections::HashMap;

    #[test]
    fn high_confidence_threshold_is_strictly_above_eighty_five_percent() {
        assert!((AUTO_MAP_CONFIDENCE_THRESHOLD - 0.85).abs() < f64::EPSILON);
    }

    #[test]
    fn test_auto_map_exact() {
        let unknowns = vec!["Unknown1".to_string(), "Unknown2".to_string()];
        let canonical = vec!["unknown1".to_string(), "Canonical2".to_string()];
        let (mapping, remaining) = CleanupService::auto_map_exact(&unknowns, &canonical);

        assert_eq!(mapping.len(), 1);
        assert_eq!(mapping["Unknown1"], "unknown1");
        assert_eq!(remaining, vec!["Unknown2"]);
    }

    #[test]
    fn test_validate_and_filter_mappings() {
        let raw = vec![
            ("u1".to_string(), "c1".to_string()),
            ("u2".to_string(), "invalid".to_string()),
        ];
        let canonical = vec!["c1".to_string(), "c2".to_string()];
        let existing = HashMap::new();

        let result = CleanupService::validate_and_filter_mappings(raw, &canonical, &existing);
        assert_eq!(result.len(), 1);
        assert_eq!(result["u1"], "c1");
        assert!(!result.contains_key("u2"));
    }

    #[test]
    fn test_parse_cleanup_mappings() {
        let raw = r#"{"mappings": [{"unknown": "u1", "canonical": "c1"}]}"#;
        let result = CleanupService::parse_cleanup_mappings(raw).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].0, "u1");
        assert_eq!(result[0].1, "c1");
    }
}
