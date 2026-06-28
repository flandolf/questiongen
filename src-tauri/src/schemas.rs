use crate::llm::{
    is_anthropic_model, json_object_format, json_schema_format, json_schema_format_anthropic,
    supports_json_schema_format_for, supports_json_schema_format_for_base_url,
};

/// Helper: resolve whether a provider supports json_schema.
fn supports_schema(model: &str, provider_id: Option<&str>, base_url: &str) -> bool {
    match provider_id {
        Some(id) => supports_json_schema_format_for(model, id),
        None => supports_json_schema_format_for_base_url(model, base_url),
    }
}

pub fn written_format(model: &str, base_url: &str, provider_id: Option<&str>) -> serde_json::Value {
    if !supports_schema(model, provider_id, base_url) {
        return json_object_format();
    }
    let schema = serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["questions"],
        "properties": {
            "questions": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["id", "topic", "subtopic", "promptMarkdown", "maxMarks"],
                    "properties": {
                        "id": {
                            "type": "string",
                            "minLength": 1
                        },
                        "topic": {
                            "type": "string",
                            "minLength": 1
                        },
                        "subtopic": {
                            "type": ["string", "null"]
                        },
                        "promptMarkdown": {
                            "type": "string",
                            "minLength": 10
                        },
                        "maxMarks": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 30
                        }
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

pub fn mc_format(model: &str, base_url: &str, provider_id: Option<&str>) -> serde_json::Value {
    if !supports_schema(model, provider_id, base_url) {
        return json_object_format();
    }
    let schema = serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["questions"],
        "properties": {
            "questions": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["id", "topic", "subtopic", "promptMarkdown", "options", "correctAnswer", "explanationMarkdown"],
                    "properties": {
                        "id": {
                            "type": "string",
                            "minLength": 1
                        },
                        "topic": {
                            "type": "string",
                            "minLength": 1
                        },
                        "subtopic": {
                            "type": ["string", "null"]
                        },
                        "promptMarkdown": {
                            "type": "string",
                            "minLength": 10
                        },
                        "options": {
                            "type": "array",
                            "minItems": 4,
                            "maxItems": 4,
                            "items": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["label", "text"],
                                "properties": {
                                    "label": {
                                        "type": "string",
                                        "enum": ["A", "B", "C", "D"]
                                    },
                                    "text": {
                                        "type": "string",
                                        "minLength": 1
                                    }
                                }
                            }
                        },
                        "correctAnswer": {
                            "type": "string",
                            "enum": ["A", "B", "C", "D"]
                        },
                        "explanationMarkdown": {
                            "type": "string",
                            "minLength": 5
                        }
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

pub fn marking_format(model: &str, base_url: &str, provider_id: Option<&str>) -> serde_json::Value {
    if !supports_schema(model, provider_id, base_url) {
        return json_object_format();
    }
    let schema = serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["verdict", "achievedMarks", "maxMarks", "partialReason", "vcaaMarkingScheme", "comparisonToSolutionMarkdown", "feedbackMarkdown", "workedSolutionMarkdown", "exemplarResponseMarkdown", "indicativeContentMarkdown", "exemplarAnnotations", "mcOptionExplanations"],
        "properties": {
            "verdict": {
                "type": "string",
                "enum": ["Correct", "Incorrect", "Partial"]
            },
            "achievedMarks": {
                "type": "integer",
                "minimum": 0
            },
            "maxMarks": {
                "type": "integer",
                "minimum": 1
            },
            "partialReason": {
                "type": "string",
                "description": "Required when verdict is Partial. One of: MostlyCorrect, PartialUnderstanding, MethodError, Incomplete."
            },
            "vcaaMarkingScheme": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["criterion", "achievedMarks", "maxMarks", "rationale", "markType"],
                    "properties": {
                        "criterion": {
                            "type": "string",
                            "minLength": 1
                        },
                        "achievedMarks": {
                            "type": "integer",
                            "minimum": 0
                        },
                        "maxMarks": {
                            "type": "integer",
                            "minimum": 0
                        },
                        "rationale": {
                            "type": "string",
                            "minLength": 1
                        },
                        "markType": {
                            "type": "string",
                            "enum": ["M", "A", "C"],
                            "description": "M = method mark, A = answer mark, C = communication/explanation mark"
                        }
                    }
                }
            },
            "comparisonToSolutionMarkdown": {
                "type": "string"
            },
            "feedbackMarkdown": {
                "type": "string"
            },
            "workedSolutionMarkdown": {
                "type": "string"
            },
            "exemplarResponseMarkdown": {
                "type": "string"
            },
            "indicativeContentMarkdown": {
                "type": "string",
                "description": "VCAA-style indicative content: key points a good answer should include, in bullet-point style."
            },
            "exemplarAnnotations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["part", "marksEarned", "marksAvailable", "note"],
                    "properties": {
                        "part": { "type": "string" },
                        "marksEarned": { "type": "integer", "minimum": 0 },
                        "marksAvailable": { "type": "integer", "minimum": 0 },
                        "note": { "type": "string" }
                    }
                }
            },
            "mcOptionExplanations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["option", "isCorrect", "explanation"],
                    "properties": {
                        "option": {
                            "type": "string"
                        },
                        "isCorrect": {
                            "type": "boolean"
                        },
                        "explanation": {
                            "type": "string"
                        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marking_schema_requires_every_declared_property_for_strict_mode() {
        let format = marking_format(
            "openai/gpt-5.4-mini",
            crate::constants::DEFAULT_OPENROUTER_BASE_URL,
            None,
        );
        let schema = &format["json_schema"]["schema"];
        let properties = schema["properties"].as_object().unwrap();
        let required = schema["required"].as_array().unwrap();

        for key in properties.keys() {
            assert!(
                required.iter().any(|item| item.as_str() == Some(key)),
                "{key} must be required for strict json_schema"
            );
        }

        let criterion = &schema["properties"]["vcaaMarkingScheme"]["items"];
        let criterion_properties = criterion["properties"].as_object().unwrap();
        let criterion_required = criterion["required"].as_array().unwrap();
        for key in criterion_properties.keys() {
            assert!(
                criterion_required
                    .iter()
                    .any(|item| item.as_str() == Some(key)),
                "{key} must be required for strict criterion schema"
            );
        }
    }
}
