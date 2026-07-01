use crate::envelope::normalise_envelope;
use crate::json_input::{extract_json_array, extract_json_object};
use crate::models::{AppError, CommandResult};
use crate::parsing::protect_latex_in_raw_json;
use serde::de::DeserializeOwned;

/// Result of a structured generation call, including the parsed data and metadata.
pub struct StructuredOutput<T> {
    pub data: T,
    #[allow(dead_code)]
    pub raw: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    pub reasoning_tokens: u32,
}

fn extract_value(raw: &str) -> CommandResult<serde_json::Value> {
    if raw.trim().is_empty() {
        return Err(AppError::new(
            "MODEL_PARSE_ERROR",
            "The model returned an empty response. This often means the model does not support the requested output format (e.g. JSON schema) on this provider.",
        ));
    }

    let protected = protect_latex_in_raw_json(raw);
    let trimmed = protected.trim_start();

    let json_str = if trimmed.starts_with('[') {
        extract_json_array(&protected).or_else(|| extract_json_object(&protected))
    } else {
        extract_json_object(&protected).or_else(|| extract_json_array(&protected))
    }
    .ok_or_else(|| {
        let preview = if raw.len() > 200 {
            format!("{}...", &raw[..200])
        } else {
            raw.to_string()
        };
        AppError::new(
            "MODEL_PARSE_ERROR",
            format!(
                "No JSON object or array found in the model response. \
                     The model may have returned plain text or an unsupported format. \
                     Response preview: {}",
                preview.replace('\n', " ")
            ),
        )
    })?;

    serde_json::from_str(&json_str)
        .map_err(|e| AppError::new("MODEL_PARSE_ERROR", format!("Invalid JSON: {e}")))
}

/// Parse raw LLM output into a typed structure.
///
/// Pipeline: protect LaTeX -> extract JSON object/array -> deserialize.
pub fn parse_structured<T: DeserializeOwned>(raw: &str) -> CommandResult<T> {
    let value = extract_value(raw)?;

    serde_json::from_value(value)
        .map_err(|e| AppError::new("MODEL_PARSE_ERROR", format!("Schema mismatch: {e}")))
}

fn parse_questions_payload<T: DeserializeOwned>(raw: &str) -> CommandResult<T> {
    let value = extract_value(raw)?;

    let normalised =
        normalise_envelope(value).map_err(|e| AppError::new("MODEL_PARSE_ERROR", e))?;

    serde_json::from_value(normalised)
        .map_err(|e| AppError::new("MODEL_PARSE_ERROR", format!("Schema mismatch: {e}")))
}

/// Parse raw LLM output and wrap it in a StructuredOutput with token metadata.
pub fn parse_structured_with_meta<T: DeserializeOwned>(
    raw: &str,
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
    reasoning_tokens: u32,
) -> CommandResult<StructuredOutput<T>> {
    let data = parse_questions_payload(raw)?;
    Ok(StructuredOutput {
        data,
        raw: raw.to_string(),
        prompt_tokens,
        completion_tokens,
        total_tokens,
        reasoning_tokens,
    })
}

#[cfg(test)]
mod tests {
    use super::{parse_structured, parse_structured_with_meta};

    #[derive(Debug, serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct MarkLike {
        verdict: String,
        achieved_marks: u8,
    }

    #[derive(Debug, serde::Deserialize)]
    struct QuestionsLike {
        questions: Vec<QuestionLike>,
    }

    #[derive(Debug, serde::Deserialize)]
    struct QuestionLike {
        id: String,
    }

    #[test]
    fn parses_non_question_top_level_object() {
        let parsed: MarkLike =
            parse_structured(r#"{"verdict":"Correct","achievedMarks":2}"#).unwrap();

        assert_eq!(parsed.verdict, "Correct");
        assert_eq!(parsed.achieved_marks, 2);
    }

    #[test]
    fn meta_parser_keeps_generation_envelope_normalization() {
        let parsed: super::StructuredOutput<QuestionsLike> =
            parse_structured_with_meta(r#"[{"id":"q1"}]"#, 1, 2, 3, 0).unwrap();

        assert_eq!(parsed.data.questions[0].id, "q1");
        assert_eq!(parsed.total_tokens, 3);
    }
}
