use crate::llm::{
    is_anthropic_model, json_object_format, json_schema_format, json_schema_format_anthropic,
    supports_json_schema_format_for,
};

pub fn written_format(model: &str, base_url: &str) -> serde_json::Value {
    if !supports_json_schema_format_for(model, base_url) {
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

pub fn mc_format(model: &str, base_url: &str) -> serde_json::Value {
    if !supports_json_schema_format_for(model, base_url) {
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

pub fn marking_format(model: &str, base_url: &str) -> serde_json::Value {
    if !supports_json_schema_format_for(model, base_url) {
        return json_object_format();
    }
    let schema = serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["verdict", "achievedMarks", "maxMarks", "vcaaMarkingScheme", "comparisonToSolutionMarkdown", "feedbackMarkdown", "workedSolutionMarkdown", "exemplarResponseMarkdown", "indicativeContentMarkdown", "mcOptionExplanations"],
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
                    "required": ["criterion", "achievedMarks", "maxMarks", "rationale"],
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
