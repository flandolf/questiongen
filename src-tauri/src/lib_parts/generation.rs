#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateMcQuestionsRequest {
    topics: Vec<String>,
    difficulty: String,
    question_count: usize,
    model: String,
    api_key: String,
    tech_mode: Option<String>,
    subtopics: Option<Vec<String>>,
    subtopic_instructions: Option<std::collections::HashMap<String, String>>,
    #[serde(default)]
    custom_focus_area: Option<String>,
    #[serde(default)]
    prior_question_prompts: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct McOption {
    #[serde(alias = "l")]
    label: String,
    #[serde(alias = "txt")]
    text: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct McQuestion {
    #[serde(default)]
    id: String,
    #[serde(alias = "t")]
    topic: String,
    #[serde(alias = "s", default)]
    subtopic: Option<String>,
    #[serde(alias = "p")]
    prompt_markdown: String,
    #[serde(alias = "o")]
    options: Vec<McOption>,
    #[serde(alias = "a")]
    correct_answer: String,
    #[serde(alias = "e")]
    explanation_markdown: String,
    #[serde(alias = "ta", default)]
    tech_allowed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    distinctness_score: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    multi_step_depth: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateMcQuestionsResponse {
    questions: Vec<McQuestion>,
    #[serde(default)]
    raw_model_output: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    telemetry: Option<GenerationTelemetry>,
}

#[tauri::command]
async fn generate_mc_questions(
    app: tauri::AppHandle,
    request: GenerateMcQuestionsRequest,
) -> CommandResult<GenerateMcQuestionsResponse> {
    if request.topics.is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Select at least one topic.",
        ));
    }

    let started = Instant::now();
    emit_generation_status(
        &app,
        "multiple-choice",
        "generating",
        "Generating questions...",
        1,
    );

    let tech_note = tech_mode_note(request.tech_mode.as_deref(), false);
    let custom_focus_note = custom_focus_note(request.custom_focus_area.as_deref());
    let focus_areas_note = build_focus_areas_note(
        request.subtopics.as_ref(),
        request.subtopic_instructions.as_ref(),
    );
    let repetition_note = repetition_avoidance_note(&request.prior_question_prompts);

    let user_prompt = format!(
        "Generate exactly {count} VCE multiple-choice questions (4 options: A, B, C, D).\n\n\
        TOPICS: {topics}\n\n\
        DIFFICULTY: {difficulty}\n\n\
        {difficulty_rules}\n\n\
        {tech_note}\n\n\
        QUESTION DESIGN:\n\
        • Stem: clear, economical wording with no redundancy; embeds all essential context.\n\
        • Options: plausible distractors; common misconceptions and conceptual errors preferred.\n\
        • Explanations: 1–3 sentences; justify correct answer and briefly address key misconceptions.\n\
        • Variety: mix command terms, cognitive demand, and mark-equivalent difficulty across questions.\n\n\
        FORMATTING:\n\
        • Use markdown. {LATEX_NOTE}\n\n\
        {focus_areas_note}\
        {custom_focus_note}\
        {repetition_note}",
        count = request.question_count,
        topics = request.topics.join(", "),
        difficulty = request.difficulty,
        difficulty_rules = difficulty_guidance(&request.difficulty),
    );

    let (user_content, _) = build_generation_user_content(&request.topics, &user_prompt)?;

    let result = call_openrouter(
        &request.api_key,
        &request.model,
        "You are a VCE examination expert who writes rigorous, precisely-calibrated exam questions. You understand mark allocations, command term expectations, and learner cognitive load. Generate questions that authentically assess the curriculum.",
        user_content,
        Some(&mc_questions_response_format()),
    )
    .await?;

    let mut parsed: GenerateMcQuestionsResponse =
        parse_structured_response(&result.content, "multiple-choice generation")?;

    normalize_mc_questions(&mut parsed.questions, request.subtopics.as_ref());

    let duration_ms = started.elapsed().as_millis() as u64;
    emit_generation_status(
        &app,
        "multiple-choice",
        "completed",
        format!("Finished in {duration_ms}ms"),
        1,
    );

    Ok(GenerateMcQuestionsResponse {
        questions: parsed.questions,
        raw_model_output: result.content,
        telemetry: Some(GenerationTelemetry::simple(
            &request.difficulty,
            duration_ms,
        )),
    })
}

fn default_question_max_marks() -> u8 {
    10
}

fn difficulty_guidance(level: &str) -> &'static str {
    if level.eq_ignore_ascii_case("essential skills") {
        "Essential Skills level:\n- Assess direct recall, simple substitution, and basic procedural steps only.\n- Cognitive load: minimal. Single or very simple two-step tasks.\n- Use familiar language, standard contexts, and obvious method selection.\n- No calculation complexity; prioritize conceptual familiarity."
    } else if level.eq_ignore_ascii_case("easy") {
        "Easy level:\n- Test foundational understanding with straightforward application.\n- Multi-step tasks that require combining two familiar concepts in direct sequence.\n- Clear context cues; minimal reading difficulty; no hidden method-switching.\n- Support students with explicit structural hints about the solution approach."
    } else if level.eq_ignore_ascii_case("medium") {
        "Medium level:\n- Require integration of two or more distinct concepts in non-obvious ways.\n- Include realistic scenarios where method selection is not automatic; student must diagnose the approach.\n- Expect 3–5 logical steps executed in correct sequence with justified reasoning.\n- Information density: moderate; wording is economical and precise (no extraneous detail)."
    } else if level.eq_ignore_ascii_case("hard") {
        "Hard level:\n- Synthesize 3+ concepts simultaneously; scenario uncovers edge cases or constraint conflicts.\n- Method selection requires explicit comparison and justification; standard algorithms may require adaptation.\n- Dense narrative that requires careful interpretation; reward deep conceptual reasoning, not template recall.\n- Multi-step logical chains where early errors cascade; minimal scaffolding."
    } else {
        "Extreme level:\n- Require conceptual reasoning at near-university depth; problem framings are novel and abstract.\n- Few if any familiar templates apply; students must derive solutions from first principles using multiple interconnected ideas.\n- High information density and sophisticated mathematical language; expect sophisticated synthesis across domains.\n- Minimal explicit guidance; solutions demonstrate both procedural mastery and genuine conceptual depth."
    }
}

fn normalize_prioritized_command_terms(
    raw_terms: Option<&[String]>,
) -> Vec<&'static CommandTermProfile> {
    raw_terms
        .unwrap_or(&[])
        .iter()
        .filter_map(|term| find_command_term_profile(term.trim()))
        .fold(Vec::new(), |mut acc, profile| {
            if !acc.iter().any(|item| item.key == profile.key) {
                acc.push(profile);
            }
            acc
        })
}

fn find_command_term_profile(value: &str) -> Option<&'static CommandTermProfile> {
    let normalized = value.to_ascii_lowercase();
    COMMAND_TERM_PROFILES.iter().find(|p| p.key == normalized)
}

fn infer_prompt_command_term(prompt: &str) -> Option<&'static CommandTermProfile> {
    let leading_token = prompt
        .split_whitespace()
        .next()
        .map(|token| {
            token
                .trim_matches(|ch: char| !ch.is_ascii_alphabetic())
                .to_ascii_lowercase()
        })
        .unwrap_or_default();
    COMMAND_TERM_PROFILES
        .iter()
        .find(|p| p.key == leading_token)
}

/// Returns true if `topics` contains the given topic name (case-insensitive).
fn includes_topic(topics: &[String], topic: &str) -> bool {
    topics.iter().any(|t| t.trim().eq_ignore_ascii_case(topic))
}

fn normalize_written_questions(
    questions: &mut [GeneratedQuestion],
    selected_subtopics: Option<&Vec<String>>,
    prioritized_command_terms: &[&'static CommandTermProfile],
) {
    for (i, question) in questions.iter_mut().enumerate() {
        if question.id.trim().is_empty() {
            question.id = format!("q{}", i + 1);
        }
        let mut normalized_marks = if question.max_marks == 0 {
            default_question_max_marks()
        } else {
            question.max_marks
        };

        if let Some(profile) = infer_prompt_command_term(&question.prompt_markdown) {
            normalized_marks = normalized_marks.clamp(profile.min_marks, profile.max_marks);
        } else if let Some(profile) = prioritized_command_terms.first().copied() {
            normalized_marks = normalized_marks.clamp(profile.min_marks, profile.max_marks);
        }

        if question
            .subtopic
            .as_ref()
            .map(|s| s.trim().is_empty())
            .unwrap_or(true)
        {
            question.subtopic = selected_subtopics
                .filter(|subs| subs.len() == 1)
                .and_then(|subs| subs.first().cloned());
        }

        question.prompt_markdown = decode_literal_newlines(&question.prompt_markdown)
            .trim()
            .to_string();
        question.topic = question.topic.trim().to_string();
        question.id = question.id.trim().to_string();
        question.max_marks = normalized_marks.clamp(1, 30);
        question.subtopic = question
            .subtopic
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
    }
}

fn normalize_mc_questions(questions: &mut [McQuestion], selected_subtopics: Option<&Vec<String>>) {
    for (i, question) in questions.iter_mut().enumerate() {
        if question.id.trim().is_empty() {
            question.id = format!("mc{}", i + 1);
        }
        if question
            .subtopic
            .as_ref()
            .map(|s| s.trim().is_empty())
            .unwrap_or(true)
        {
            question.subtopic = selected_subtopics
                .filter(|subs| subs.len() == 1)
                .and_then(|subs| subs.first().cloned());
        }

        question.prompt_markdown = decode_literal_newlines(&question.prompt_markdown)
            .trim()
            .to_string();
        question.explanation_markdown = decode_literal_newlines(&question.explanation_markdown)
            .trim()
            .to_string();
        question.correct_answer = question.correct_answer.trim().to_uppercase();
        question.topic = question.topic.trim().to_string();
        question.id = question.id.trim().to_string();
        question.subtopic = question
            .subtopic
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        for opt in &mut question.options {
            opt.label = opt.label.trim().to_uppercase();
            opt.text = decode_literal_newlines(&opt.text).trim().to_string();
        }
    }
}

/// Decodes literal `\n` and `\r\n` escape sequences to real newlines, while
/// preserving LaTeX commands like `\neq`, `\nabla`, etc.
fn decode_literal_newlines(value: &str) -> String {
    let mut decoded = String::with_capacity(value.len());
    let mut chars = value.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch != '\\' {
            decoded.push(ch);
            continue;
        }

        match chars.peek() {
            Some('r') => {
                // Consume 'r'; check for \n after
                chars.next();
                if chars.peek() == Some(&'\\') {
                    let mut ahead = chars.clone();
                    ahead.next(); // consume '\'
                    if ahead.peek() == Some(&'n') {
                        chars.next(); // consume '\'
                        chars.next(); // consume 'n'
                        decoded.push('\n');
                        continue;
                    }
                }
                decoded.push('\\');
                decoded.push('r');
            }
            Some('n') => {
                chars.next(); // consume 'n'
                              // Preserve LaTeX commands starting with \n (e.g. \neq, \nabla)
                if chars
                    .peek()
                    .map(|c| c.is_ascii_lowercase())
                    .unwrap_or(false)
                {
                    decoded.push('\\');
                    decoded.push('n');
                } else {
                    decoded.push('\n');
                }
            }
            _ => {
                decoded.push('\\');
            }
        }
    }

    decoded
}

// ── Structured output schemas ─────────────────────────────────────────────────
//
// All models support structured output, so we always use json_schema mode.
// The schema keys use the short aliases the model must emit (t, s, p, m, …)
// because that is what the Rust structs deserialise from via #[serde(alias)].

fn mark_answer_response_format() -> serde_json::Value {
    serde_json::json!({
        "type": "json_schema",
        "json_schema": {
            "name": "mark_answer_response",
            "strict": true,
            "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                    "verdict", "achievedMarks", "maxMarks", "scoreOutOf10",
                    "vcaaMarkingScheme", "comparisonToSolutionMarkdown",
                    "feedbackMarkdown", "workedSolutionMarkdown"
                ],
                "properties": {
                    "verdict":                      { "type": "string" },
                    "achievedMarks":                { "type": "integer", "minimum": 0 },
                    "maxMarks":                     { "type": "integer", "minimum": 1 },
                    "scoreOutOf10":                 { "type": "integer", "minimum": 0, "maximum": 10 },
                    "vcaaMarkingScheme": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["criterion", "achievedMarks", "maxMarks", "rationale"],
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
                    "workedSolutionMarkdown":        { "type": "string" }
                }
            }
        }
    })
}

fn mc_questions_response_format() -> serde_json::Value {
    serde_json::json!({
        "type": "json_schema",
        "json_schema": {
            "name": "mc_questions_response",
            "strict": true,
            "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": ["questions"],
                "properties": {
                    "questions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["id", "t", "s", "p", "o", "a", "e", "ta"],
                            "properties": {
                                "id": { "type": "string", "description": "Unique question ID, e.g q1, q2, q3" },
                                "t":  { "type": "string", "description": "Topic name" },
                                "s":  { "type": ["string", "null"], "description": "Subtopic, or null if none" },
                                "p":  { "type": "string", "description": "Question prompt (markdown)" },
                                "o":  {
                                    "type": "array",
                                    "minItems": 4,
                                    "maxItems": 4,
                                    "items": {
                                        "type": "object",
                                        "additionalProperties": false,
                                        "required": ["l", "txt"],
                                        "properties": {
                                            "l":   { "type": "string", "description": "Option label: A, B, C, or D" },
                                            "txt": { "type": "string", "description": "Option text" }
                                        }
                                    }
                                },
                                "a":  { "type": "string", "description": "Correct answer: A, B, C, or D" },
                                "e":  { "type": "string", "description": "Explanation (markdown, 1–3 sentences)" },
                                "ta": { "type": "boolean", "description": "Technology allowed" }
                            }
                        }
                    }
                }
            }
        }
    })
}

fn written_questions_response_format(max_marks_cap: u8) -> serde_json::Value {
    serde_json::json!({
        "type": "json_schema",
        "json_schema": {
            "name": "written_questions_response",
            "strict": true,
            "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": ["questions"],
                "properties": {
                    "questions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["id", "t", "s", "p", "m", "ta"],
                            "properties": {
                                "id": { "type": "string", "description": "Unique question ID, e.g q1, q2, q3" },
                                "t":  { "type": "string", "description": "Topic name" },
                                "s":  { "type": ["string", "null"], "description": "Subtopic, or null if none" },
                                "p":  { "type": "string", "description": "Question prompt (markdown)" },
                                "m":  { "type": "integer", "minimum": 1, "maximum": max_marks_cap, "description": "Max marks" },
                                "ta": { "type": "boolean", "description": "Technology allowed" }
                            }
                        }
                    }
                }
            }
        }
    })
}

fn parse_structured_response<T: serde::de::DeserializeOwned>(
    content: &str,
    context: &str,
) -> CommandResult<T> {
    let trimmed = content.trim();
    println!("Parsing structured response for {context}: {trimmed}");
    serde_json::from_str(trimmed).map_err(|err| {
        AppError::new(
            "MODEL_PARSE_ERROR",
            format!("Failed to parse structured output for {context}: {err}"),
        )
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_persisted_state,
            save_persisted_state,
            generate_questions,
            mark_answer,
            analyze_image,
            generate_mc_questions,
            get_tps,
            test_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn get_tps(model: &str, api_key: &str) -> Result<f64, String> {
    let url = format!("https://openrouter.ai/api/v1/models/{model}/endpoints");
    let response = reqwest::Client::new()
        .get(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Request failed with status: {}", response.status()));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse JSON response: {e}"))?;

    json["data"]["endpoints"]
        .as_array()
        .and_then(|endpoints| {
            endpoints
                .iter()
                .find_map(|ep| ep["throughput_last_30m"]["p50"].as_f64())
        })
        .ok_or_else(|| "Failed to extract TPS from response".to_string())
}

#[tauri::command]
async fn test_model(model: &str, api_key: &str) -> Result<String, String> {
    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": "Who is Socrates?"}],
    });

    let response = reqwest::Client::new()
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("API request failed with status {status}: {text}"));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    Ok(json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string())
}
