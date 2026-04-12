/// Accept `[...]`, `{"questions":[...]}`, or common wrapper variants.
pub fn normalise_envelope(value: serde_json::Value) -> Result<serde_json::Value, String> {
    if value.is_array() {
        return Ok(serde_json::json!({ "questions": value }));
    }

    let serde_json::Value::Object(mut map) = value else {
        return Err("Top-level JSON must be an object or array.".into());
    };

    if map.get("questions").map(|v| v.is_array()).unwrap_or(false) {
        return Ok(serde_json::Value::Object(map));
    }

    for key in [
        "question",
        "items",
        "mcQuestions",
        "multipleChoiceQuestions",
        "generatedQuestions",
    ] {
        if let Some(arr) = map.remove(key).filter(|v| v.is_array()) {
            map.insert("questions".into(), arr);
            return Ok(serde_json::Value::Object(map));
        }
    }

    for key in ["data", "result", "output", "payload"] {
        if let Some(serde_json::Value::Object(nested)) = map.get(key) {
            if let Some(arr) = nested.get("questions").filter(|v| v.is_array()).cloned() {
                map.insert("questions".into(), arr);
                return Ok(serde_json::Value::Object(map));
            }
        }
    }

    Err(format!(
        "No questions array found. Keys: [{}].",
        map.keys().cloned().collect::<Vec<_>>().join(", ")
    ))
}

#[cfg(test)]
mod tests {
    use super::normalise_envelope;

    #[test]
    fn wraps_top_level_array_into_questions_object() {
        let input = serde_json::json!([
            {"id": "q1"}
        ]);

        let out = normalise_envelope(input).unwrap();
        assert!(out.get("questions").is_some());
        assert!(out["questions"].is_array());
    }

    #[test]
    fn accepts_nested_payload_questions_array() {
        let input = serde_json::json!({
            "payload": {
                "questions": [{"id": "q1"}]
            }
        });

        let out = normalise_envelope(input).unwrap();
        assert!(out.get("questions").is_some());
        assert!(out["questions"].is_array());
    }
}
