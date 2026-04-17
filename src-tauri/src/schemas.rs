use crate::openrouter::{is_anthropic_model, json_schema_format, json_schema_format_anthropic};

pub fn written_format(model: &str) -> serde_json::Value {
    let schema = serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["questions"],
        "properties": {
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["id","topic","subtopic","promptMarkdown","maxMarks"],
                    "properties": {
                        "id": { "type": "string" },
                        "topic": { "type": "string" },
                        "subtopic": { "type": ["string","null"] },
                        "promptMarkdown": { "type": "string" },
                        "maxMarks": { "type": "integer", "minimum": 1, "maximum": 30 }
                    }
                }
            }
        }
    });

    if is_anthropic_model(model) {
        json_schema_format_anthropic("written_questions", schema)
    } else {
        json_schema_format("written_questions", schema)
    }
}

pub fn mc_format(model: &str) -> serde_json::Value {
    let schema = serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["questions"],
        "properties": {
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["id","topic","subtopic","promptMarkdown","options","correctAnswer","explanationMarkdown"],
                    "properties": {
                        "id":                  { "type": "string" },
                        "topic":               { "type": "string" },
                        "subtopic":            { "type": ["string","null"] },
                        "promptMarkdown":      { "type": "string" },
                        "options": {
                            "type": "array", "minItems": 4, "maxItems": 4,
                            "items": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["label","text"],
                                "properties": {
                                    "label": { "type": "string" },
                                    "text":  { "type": "string" }
                                }
                            }
                        },
                        "correctAnswer":       { "type": "string", "enum": ["A","B","C","D"] },
                        "explanationMarkdown": { "type": "string" }
                    }
                }
            }
        }
    });

    if is_anthropic_model(model) {
        json_schema_format_anthropic("mc_questions", schema)
    } else {
        json_schema_format("mc_questions", schema)
    }
}

pub fn marking_format(model: &str) -> serde_json::Value {
    let schema = serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["verdict","achievedMarks","maxMarks",
                     "vcaaMarkingScheme","comparisonToSolutionMarkdown",
                     "feedbackMarkdown","workedSolutionMarkdown",
                     "exemplarResponseMarkdown","mcOptionExplanations"],
        "properties": {
            "verdict":       { "type": "string" },
            "achievedMarks": { "type": "integer", "minimum": 0 },
            "maxMarks":      { "type": "integer", "minimum": 1 },
            "vcaaMarkingScheme": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["criterion","achievedMarks","maxMarks","rationale"],
                    "properties": {
                        "criterion":     { "type": "string" },
                        "achievedMarks": { "type": "integer", "minimum": 0 },
                        "maxMarks":      { "type": "integer", "minimum": 0 },
                        "rationale":     { "type": "string" }
                    }
                }
            },
            "comparisonToSolutionMarkdown": { "type": "string" },
            "feedbackMarkdown":             { "type": "string" },
            "workedSolutionMarkdown":       { "type": "string" },
            "exemplarResponseMarkdown":     { "type": "string" },
            // Present for MC questions; empty array for written questions.
            "mcOptionExplanations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["option","isCorrect","explanation"],
                    "properties": {
                        "option":      { "type": "string" },
                        "isCorrect":   { "type": "boolean" },
                        "explanation": { "type": "string" }
                    }
                }
            }
        }
    });

    if is_anthropic_model(model) {
        json_schema_format_anthropic("mark_answer", schema)
    } else {
        json_schema_format("mark_answer", schema)
    }
}

pub fn text_response_format(model: &str) -> serde_json::Value {
    let schema = serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["text"],
        "properties": { "text": { "type": "string" } }
    });

    if is_anthropic_model(model) {
        json_schema_format_anthropic("text_response", schema)
    } else {
        json_schema_format("text_response", schema)
    }
}

pub fn cleanup_mappings_format(model: &str) -> serde_json::Value {
    let schema = serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["mappings"],
        "properties": {
            "mappings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["unknown", "canonical"],
                    "properties": {
                        "unknown": { "type": "string" },
                        "canonical": { "type": "string" }
                    }
                }
            }
        }
    });

    if is_anthropic_model(model) {
        json_schema_format_anthropic("cleanup_mappings", schema)
    } else {
        json_schema_format("cleanup_mappings", schema)
    }
}
