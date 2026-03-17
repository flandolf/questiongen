#[tauri::command]
fn load_persisted_state(app: tauri::AppHandle) -> CommandResult<serde_json::Value> {
    let path = persisted_state_path(&app)?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }

    let content = fs::read_to_string(&path).map_err(|err| {
        AppError::new(
            "PERSISTENCE_READ_ERROR",
            format!("Could not read persisted app state: {err}"),
        )
    })?;

    if content.trim().is_empty() {
        return Ok(serde_json::json!({}));
    }

    serde_json::from_str(&content).map_err(|err| {
        AppError::new(
            "PERSISTENCE_PARSE_ERROR",
            format!("Persisted app state is invalid JSON: {err}"),
        )
    })
}

#[tauri::command]
fn save_persisted_state(app: tauri::AppHandle, state: serde_json::Value) -> CommandResult<()> {
    if !state.is_object() {
        return Err(AppError::new(
            "PERSISTENCE_VALIDATION_ERROR",
            "Persisted app state must be a JSON object.",
        ));
    }

    let path = persisted_state_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| {
            AppError::new(
                "PERSISTENCE_DIR_ERROR",
                format!("Could not create app data directory: {err}"),
            )
        })?;
    }

    let payload = serde_json::to_string(&state).map_err(|err| {
        AppError::new(
            "PERSISTENCE_SERIALIZE_ERROR",
            format!("Could not serialize app state: {err}"),
        )
    })?;

    let temp_path = path.with_extension("tmp");
    fs::write(&temp_path, payload).map_err(|err| {
        AppError::new(
            "PERSISTENCE_WRITE_ERROR",
            format!("Could not write temporary app state file: {err}"),
        )
    })?;

    remove_existing_state_file(&path)?;

    fs::rename(&temp_path, &path).map_err(|err| {
        AppError::new(
            "PERSISTENCE_RENAME_ERROR",
            format!("Could not finalize app state file: {err}"),
        )
    })?;

    Ok(())
}

fn persisted_state_path(app: &tauri::AppHandle) -> CommandResult<PathBuf> {
    let app_dir = app.path().app_data_dir().map_err(|err| {
        AppError::new(
            "PERSISTENCE_PATH_ERROR",
            format!("Could not resolve app data directory: {err}"),
        )
    })?;

    Ok(app_dir.join(APP_STATE_FILE_NAME))
}

fn remove_existing_state_file(path: &Path) -> CommandResult<()> {
    fs::remove_file(path).or_else(|err| {
        if err.kind() == std::io::ErrorKind::NotFound {
            Ok(())
        } else {
            Err(AppError::new(
                "PERSISTENCE_REPLACE_ERROR",
                format!("Could not replace existing app state file: {err}"),
            ))
        }
    })
}

#[tauri::command]
async fn generate_questions(
    app: tauri::AppHandle,
    request: GenerateQuestionsRequest,
) -> CommandResult<GenerateQuestionsResponse> {
    validate_generate_request(&request)?;
    let started = Instant::now();
    emit_generation_status(&app, "written", "generating", "Generating questions...", 1);

    let difficulty_rules = difficulty_guidance(&request.difficulty);
    let tech_note = match request.tech_mode.as_deref().unwrap_or("mix") {
        "tech-free" => "All questions must be tech-free. Set \"techAllowed\": false.",
        "tech-active" => "All questions must be tech-active. Set \"techAllowed\": true.",
        _ => "Mix of tech-free and tech-active. Set \"techAllowed\" per question.",
    };

    let user_prompt = format!(
        "Create exactly {count} VCE written-response questions for: {topics}.\n\
        Difficulty: {difficulty}\n\
        Rules:\n{difficulty_rules}\n{tech_note}\n\
        Constraints:\n\
        - Return ONLY JSON matching: {contract}\n\
        - Assign maxMarks between 1 and {max_marks_cap}.\n\
        - Use LaTeX: $...$ for inline, $$...$$ for block.\n\
        - No prose or markdown fences.",
        count = request.question_count,
        topics = request.topics.join(", "),
        difficulty = request.difficulty,
        difficulty_rules = difficulty_rules,
        tech_note = tech_note,
        max_marks_cap = request.max_marks_per_question.unwrap_or(30),
        contract = WRITTEN_QUESTION_JSON_CONTRACT
    );

    let (user_content, _) = build_generation_user_content(&app, &request.topics, &user_prompt)?;
    let response_format = Some(written_questions_response_format());

    let result = call_openrouter(
        &request.api_key,
        &request.model,
        "You are an expert VCE exam writer. Provide JSON only.",
        user_content,
        response_format.as_ref(),
    ).await?;

    let payload = parse_json_object(&result.content)
        .ok_or_else(|| AppError::new("MODEL_PARSE_ERROR", "Failed to extract JSON from response."))?;

    let mut parsed: GenerateQuestionsResponse = serde_json::from_str(&payload)
        .or_else(|_| {
            let val: serde_json::Value = serde_json::from_str(&payload).map_err(|e| AppError::new("MODEL_PARSE_ERROR", e.to_string()))?;
            let normalized = normalize_questions_envelope(val).map_err(|e| AppError::new("MODEL_PARSE_ERROR", e))?;
            serde_json::from_value(normalized).map_err(|e| AppError::new("MODEL_PARSE_ERROR", e.to_string()))
        })?;

    // Perform necessary normalization
    let selected_english_task_types = normalize_english_task_types(request.english_task_types.as_deref());
    let prioritized_command_terms = normalize_prioritized_command_terms(request.prioritized_command_terms.as_deref());

    normalize_written_questions(
        &mut parsed.questions,
        &request.topics,
        request.subtopics.as_ref(),
        &selected_english_task_types,
        &prioritized_command_terms,
    );

    if parsed.questions.len() != request.question_count {
        return Err(AppError::new("MODEL_ERROR", format!("Expected {} questions, got {}.", request.question_count, parsed.questions.len())));
    }

    emit_generation_status(&app, "written", "completed", format!("Finished in {}ms", started.elapsed().as_millis()), 1);

    Ok(GenerateQuestionsResponse {
        questions: parsed.questions,
        raw_model_output: result.content,
        telemetry: Some(GenerationTelemetry {
            difficulty: request.difficulty,
            total_attempts: 1,
            repair_attempts: 0,
            constrained_regeneration_used: false,
            repair_path: vec![],
            duration_ms: started.elapsed().as_millis() as u64,
            structured_output_status: Some("used".to_string()),
            distinctness_avg: None,
            multi_step_depth_avg: None,
        }),
    })
}

#[tauri::command]
async fn mark_answer(request: MarkAnswerRequest) -> CommandResult<MarkAnswerResponse> {
    validate_mark_request(&request)?;
    let normalized_answer = normalize_student_answer_for_marking(&request.student_answer);
    
    let user_prompt = format!(
        "Mark this VCE {topic} question ({max_marks} marks).\n\
        Question:\n{question}\n\n\
        Student Answer:\n{answer}\n\n\
        Constraints:\n\
        - Return ONLY JSON matching: {contract}\n\
        - Use VCAA-style criterion marking.\n\
        - feedbackMarkdown: max 120 words.",
        topic = request.question.topic,
        max_marks = request.question.max_marks,
        question = request.question.prompt_markdown,
        answer = normalized_answer,
        contract = MARK_ANSWER_JSON_CONTRACT
    );

    let user_content = build_mark_answer_user_content(&user_prompt, request.student_answer_image_data_url.as_deref())?;
    let response_format = Some(mark_answer_response_format());

    let result = call_openrouter(
        &request.api_key,
        &request.model,
        "You are a strict VCE marker. Provide JSON only.",
        user_content,
        response_format.as_ref(),
    ).await?;

    let payload = parse_json_object(&result.content)
        .ok_or_else(|| AppError::new("MODEL_PARSE_ERROR", "Failed to extract JSON from response."))?;

    let mut parsed: MarkAnswerResponse = serde_json::from_str(&payload)
        .map_err(|e| AppError::new("MODEL_PARSE_ERROR", e.to_string()))?;
    
    // Quick normalization
    parsed.max_marks = request.question.max_marks;
    parsed.achieved_marks = u8::min(parsed.achieved_marks, parsed.max_marks);
    parsed.score_out_of_10 = u8::min(parsed.score_out_of_10, 10);

    Ok(parsed)
}

#[tauri::command]
async fn generate_passage_questions(
    app: tauri::AppHandle,
    request: GeneratePassageQuestionsRequest,
) -> CommandResult<GeneratePassageResponse> {
    validate_passage_generate_request(&request)?;
    let started = Instant::now();
    emit_generation_status(&app, "passage", "generating", "Generating English Language passage...", 1);

    let instruction_note = english_language_passage_instruction(&request.aos_subtopic);
    let selected_text_type = pick_passage_text_type();
    
    let user_prompt = format!(
        "Create one English Language stimulus passage for: {aos_subtopic}.\n\
        Text type: {text_type}\n\
        Rules:\n{instruction}\n\
        Constraints:\n\
        - Return exactly {question_count} questions based on the passage.\n\
        - Return ONLY JSON matching: {contract}\n\
        - Passage: 200-300 words, clearly delimited lines (no manual numbers).\n\
        - Questions: must include numeric line references.",
        aos_subtopic = request.aos_subtopic,
        text_type = selected_text_type,
        instruction = instruction_note,
        question_count = request.question_count,
        contract = PASSAGE_JSON_CONTRACT
    );

    let response_format = Some(passage_response_format());

    let result = call_openrouter(
        &request.api_key,
        &request.model,
        "You are an expert VCE English Language SAC writer. Provide JSON only.",
        serde_json::Value::String(user_prompt),
        response_format.as_ref(),
    ).await?;

    let payload = parse_json_object(&result.content)
        .ok_or_else(|| AppError::new("MODEL_PARSE_ERROR", "Failed to extract JSON from response."))?;

    let mut parsed: GeneratePassageResponse = serde_json::from_str(&payload)
        .map_err(|e| AppError::new("MODEL_PARSE_ERROR", e.to_string()))?;

    normalize_generated_passage(&mut parsed.passage, &request.aos_subtopic);

    emit_generation_status(&app, "passage", "completed", format!("Finished in {}ms", started.elapsed().as_millis()), 1);

    Ok(GeneratePassageResponse {
        passage: parsed.passage,
        raw_model_output: result.content,
        telemetry: Some(GenerationTelemetry {
            difficulty: request.aos_subtopic,
            total_attempts: 1,
            repair_attempts: 0,
            constrained_regeneration_used: false,
            repair_path: vec![],
            duration_ms: started.elapsed().as_millis() as u64,
            structured_output_status: Some("used".to_string()),
            distinctness_avg: None,
            multi_step_depth_avg: None,
        }),
    })
}

#[tauri::command]
async fn mark_passage_answer(request: MarkPassageAnswerRequest) -> CommandResult<MarkAnswerResponse> {
    validate_passage_mark_request(&request)?;
    let normalized_answer = normalize_student_answer_for_marking(&request.student_answer);

    let user_prompt = format!(
        "Mark this VCE English Language response ({max_marks} marks).\n\
        Passage:\n{passage}\n\n\
        Question:\n{question}\n\n\
        Student Answer:\n{answer}\n\n\
        Constraints:\n\
        - Return ONLY JSON matching: {contract}\n\
        - Reward precise metalanguage and passage evidence.",
        max_marks = request.question.max_marks,
        passage = request.passage_text,
        question = request.question.prompt_markdown,
        answer = normalized_answer,
        contract = MARK_ANSWER_JSON_CONTRACT
    );

    let result = call_openrouter(
        &request.api_key,
        &request.model,
        "You are a strict English Language marker. Provide JSON only.",
        serde_json::Value::String(user_prompt),
        Some(&mark_answer_response_format()),
    ).await?;

    let payload = parse_json_object(&result.content)
        .ok_or_else(|| AppError::new("MODEL_PARSE_ERROR", "Failed to extract JSON from response."))?;

    let mut parsed: MarkAnswerResponse = serde_json::from_str(&payload)
        .map_err(|e| AppError::new("MODEL_PARSE_ERROR", e.to_string()))?;
    
    parsed.max_marks = request.question.max_marks;
    parsed.achieved_marks = u8::min(parsed.achieved_marks, parsed.max_marks);
    parsed.score_out_of_10 = u8::min(parsed.score_out_of_10, 10);

    Ok(parsed)
}

fn normalize_student_answer_for_marking(answer: &str) -> String {
    const MAX_MARKING_ANSWER_CHARS: usize = 12_000;

    let normalized = answer
        .replace("\r\n", "\n")
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();

    if normalized.chars().count() <= MAX_MARKING_ANSWER_CHARS {
        return normalized;
    }

    let mut truncated = normalized
        .chars()
        .take(MAX_MARKING_ANSWER_CHARS)
        .collect::<String>();
    truncated.push_str("\n\n[Truncated by app for marking due to excessive length.]\n");
    truncated
}

#[tauri::command]
async fn analyze_image(request: AnalyzeImageRequest) -> CommandResult<AnalyzeImageResponse> {
    if request.api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "OpenRouter API key is required."));
    }

    if request.model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model is required."));
    }

    if request.image_path.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Image path is required."));
    }

    let data_url = encode_image_file_to_data_url(&request.image_path)?;
    let prompt = request
        .prompt
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("What's in this image?");

    let user_content = serde_json::json!([
        {
            "type": "text",
            "text": prompt
        },
        {
            "type": "image_url",
            "image_url": {
                "url": data_url
            }
        }
    ]);

    let output_text = call_openrouter(
        &request.api_key,
        &request.model,
        "You are a helpful visual reasoning assistant.",
        user_content,
        None,
    )
    .await?
    .content;

    Ok(AnalyzeImageResponse { output_text })
}

fn validate_generate_request(request: &GenerateQuestionsRequest) -> CommandResult<()> {
    if request.topics.is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Select at least one topic."));
    }

    if request.question_count == 0 || request.question_count > 20 {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Question count must be between 1 and 20.",
        ));
    }

    if request.api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "OpenRouter API key is required."));
    }

    if request.model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model is required."));
    }

    Ok(())
}

fn validate_mark_request(request: &MarkAnswerRequest) -> CommandResult<()> {
    let has_text = !request.student_answer.trim().is_empty();
    let has_image = request
        .student_answer_image_data_url
        .as_ref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);

    if !has_text && !has_image {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Enter an answer or upload an image before submitting.",
        ));
    }

    if request.api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "OpenRouter API key is required."));
    }

    if request.model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model is required."));
    }

    if request.question.max_marks == 0 {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Question max marks must be greater than zero.",
        ));
    }

    Ok(())
}

fn validate_passage_generate_request(request: &GeneratePassageQuestionsRequest) -> CommandResult<()> {
    if request.aos_subtopic.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Choose an Area of Study."));
    }

    if request.question_count < 3 || request.question_count > 10 {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Passage question count must be between 3 and 10.",
        ));
    }

    if request.api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "OpenRouter API key is required."));
    }

    if request.model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model is required."));
    }

    Ok(())
}

fn validate_passage_mark_request(request: &MarkPassageAnswerRequest) -> CommandResult<()> {
    if request.passage_text.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Passage text is required."));
    }

    if request.question.prompt_markdown.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Question prompt is required."));
    }

    if request.student_answer.trim().is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Enter an answer before submitting.",
        ));
    }

    if request.api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "OpenRouter API key is required."));
    }

    if request.model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model is required."));
    }

    if request.question.max_marks == 0 {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Question max marks must be greater than zero.",
        ));
    }

    Ok(())
}

fn written_questions_response_format() -> serde_json::Value {
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
                            "required": ["id", "topic", "promptMarkdown", "maxMarks"],
                            "properties": {
                                "id": { "type": "string" },
                                "topic": { "type": "string" },
                                "subtopic": { "type": "string" },
                                "taskType": { "type": "string", "enum": ["short-answer", "analytical-essay"] },
                                "recommendedResponseLength": { "type": "string", "enum": ["short", "extended"] },
                                "promptMarkdown": { "type": "string" },
                                "maxMarks": { "type": "integer", "minimum": 1, "maximum": 30 },
                                "techAllowed": { "type": "boolean" }
                            }
                        }
                    }
                }
            }
        }
    })
}

fn passage_response_format() -> serde_json::Value {
    serde_json::json!({
        "type": "json_schema",
        "json_schema": {
            "name": "english_language_passage_response",
            "strict": true,
            "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": ["passage"],
                "properties": {
                    "passage": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["id", "text", "aosSubtopic", "questions"],
                        "properties": {
                            "id": { "type": "string" },
                            "text": { "type": "string" },
                            "aosSubtopic": { "type": "string" },
                            "questions": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "additionalProperties": false,
                                    "required": ["id", "promptMarkdown", "maxMarks"],
                                    "properties": {
                                        "id": { "type": "string" },
                                        "promptMarkdown": { "type": "string" },
                                        "maxMarks": { "type": "integer", "minimum": 1, "maximum": 5 }
                                    }
                                }
                            }
                        }
                    }
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
                            "required": ["id", "topic", "promptMarkdown", "options", "correctAnswer", "explanationMarkdown"],
                            "properties": {
                                "id": { "type": "string" },
                                "topic": { "type": "string" },
                                "subtopic": { "type": "string" },
                                "promptMarkdown": { "type": "string" },
                                "options": {
                                    "type": "array",
                                    "minItems": 4,
                                    "maxItems": 4,
                                    "items": {
                                        "type": "object",
                                        "additionalProperties": false,
                                        "required": ["label", "text"],
                                        "properties": {
                                            "label": { "type": "string" },
                                            "text": { "type": "string" }
                                        }
                                    }
                                },
                                "correctAnswer": { "type": "string", "enum": ["A", "B", "C", "D"] },
                                "explanationMarkdown": { "type": "string" },
                                "techAllowed": { "type": "boolean" }
                            }
                        }
                    }
                }
            }
        }
    })
}

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
                    "verdict",
                    "achievedMarks",
                    "maxMarks",
                    "scoreOutOf10",
                    "vcaaMarkingScheme",
                    "comparisonToSolutionMarkdown",
                    "feedbackMarkdown",
                    "workedSolutionMarkdown"
                ],
                "properties": {
                    "verdict": { "type": "string" },
                    "achievedMarks": { "type": "integer", "minimum": 0 },
                    "maxMarks": { "type": "integer", "minimum": 1 },
                    "scoreOutOf10": { "type": "integer", "minimum": 0, "maximum": 10 },
                    "vcaaMarkingScheme": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["criterion", "achievedMarks", "maxMarks", "rationale"],
                            "properties": {
                                "criterion": { "type": "string" },
                                "achievedMarks": { "type": "integer", "minimum": 0 },
                                "maxMarks": { "type": "integer", "minimum": 0 },
                                "rationale": { "type": "string" }
                            }
                        }
                    },
                    "comparisonToSolutionMarkdown": { "type": "string" },
                    "feedbackMarkdown": { "type": "string" },
                    "workedSolutionMarkdown": { "type": "string" }
                }
            }
        }
    })
}

fn is_structured_output_unsupported_response(status: reqwest::StatusCode, body: &str) -> bool {
    if status != reqwest::StatusCode::BAD_REQUEST
        && status != reqwest::StatusCode::UNPROCESSABLE_ENTITY
    {
        return false;
    }

    let normalized = body.to_ascii_lowercase();
    (normalized.contains("response_format") || normalized.contains("json_schema") || normalized.contains("structured"))
        && (normalized.contains("not support")
            || normalized.contains("unsupported")
            || normalized.contains("not available")
            || normalized.contains("invalid"))
}


async fn call_openrouter(
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_content: serde_json::Value,
    response_format: Option<&serde_json::Value>,
) -> CommandResult<OpenRouterCallResult> {
    call_openrouter_with_plugins(
        api_key,
        model,
        system_prompt,
        user_content,
        None,
        response_format.cloned(),
    )
    .await
}

async fn call_openrouter_with_plugins(
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_content: serde_json::Value,
    plugins: Option<serde_json::Value>,
    response_format: Option<serde_json::Value>,
) -> CommandResult<OpenRouterCallResult> {
    let client = reqwest::Client::new();

    let mut request_body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_content }
        ],
        "temperature": 0.5,
        "max_tokens": OPENROUTER_MAX_TOKENS
    });

    if let Some(plugins) = plugins {
        request_body["plugins"] = plugins;
    }

    if let Some(response_format) = response_format.clone() {
        request_body["response_format"] = response_format;
    }

    let response = client
        .post(OPENROUTER_CHAT_URL)
        .header(AUTHORIZATION, format!("Bearer {api_key}"))
        .header(CONTENT_TYPE, "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|err| AppError::new("NETWORK_ERROR", format!("Request failed: {err}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());

        if response_format.is_some() && is_structured_output_unsupported_response(status, &body) {
            let mut fallback_request_body = request_body.clone();
            if let serde_json::Value::Object(ref mut map) = fallback_request_body {
                map.remove("response_format");
            }

            let fallback_response = client
                .post(OPENROUTER_CHAT_URL)
                .header(AUTHORIZATION, format!("Bearer {api_key}"))
                .header(CONTENT_TYPE, "application/json")
                .json(&fallback_request_body)
                .send()
                .await
                .map_err(|err| AppError::new("NETWORK_ERROR", format!("Request failed: {err}")))?;

            if !fallback_response.status().is_success() {
                let fallback_status = fallback_response.status();
                let fallback_body = fallback_response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Unknown error".to_string());
                return Err(AppError::new(
                    "OPENROUTER_ERROR",
                    format!("OpenRouter request failed ({fallback_status}): {fallback_body}"),
                ));
            }

            let parsed: OpenRouterResponse = fallback_response
                .json()
                .await
                .map_err(|err| AppError::new("NETWORK_ERROR", format!("Invalid API response: {err}")))?;

            let content = parsed
                .choices
                .first()
                .map(|c| c.message.content.clone())
                .ok_or_else(|| AppError::new("EMPTY_RESULT", "OpenRouter returned no content."))?;

            return Ok(OpenRouterCallResult {
                content,
            });
        }

        return Err(AppError::new(
            "OPENROUTER_ERROR",
            format!("OpenRouter request failed ({status}): {body}"),
        ));
    }

    let parsed: OpenRouterResponse = response
        .json()
        .await
        .map_err(|err| AppError::new("NETWORK_ERROR", format!("Invalid API response: {err}")))?;

    let content = parsed
        .choices
        .first()
        .map(|c| c.message.content.clone())
        .ok_or_else(|| AppError::new("EMPTY_RESULT", "OpenRouter returned no content."))?;

    Ok(OpenRouterCallResult {
        content,
    })
}

fn build_mark_answer_user_content(
    text: &str,
    image_data_url: Option<&str>,
) -> CommandResult<serde_json::Value> {
    let Some(image_data_url) = image_data_url.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(serde_json::Value::String(text.to_string()));
    };

    if !image_data_url.starts_with("data:image/") {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Uploaded image must be a valid image data URL.",
        ));
    }

    let content = serde_json::json!([
        {
            "type": "text",
            "text": text
        },
        {
            "type": "image_url",
            "image_url": {
                "url": image_data_url
            }
        }
    ]);

    Ok(content)
}

fn build_generation_user_content(
    _app: &tauri::AppHandle,
    topics: &[String],
    prompt: &str,
) -> CommandResult<(serde_json::Value, Option<serde_json::Value>)> {
    let mut compact_reference = String::new();
    if includes_mathematical_methods(topics) {
        compact_reference.push_str("\n\nReference guidance:\n-");
        compact_reference.push_str(MATHEMATICAL_METHODS_REFERENCE_GUIDANCE.trim());
    }
    if includes_physical_education(topics) {
        if compact_reference.is_empty() {
            compact_reference.push_str("\n\nReference guidance:\n-");
        } else {
            compact_reference.push_str("\n-");
        }
        compact_reference.push_str(PHYSICAL_EDUCATION_REFERENCE_GUIDANCE.trim());
    }

    Ok((
        serde_json::Value::String(format!("{prompt}{compact_reference}")),
        None,
    ))
}

fn encode_image_file_to_data_url(image_path: &str) -> CommandResult<String> {
    let path = Path::new(image_path);
    if !path.exists() {
        return Err(AppError::new("VALIDATION_ERROR", "Image file not found."));
    }

    let mime = infer_image_mime(path).ok_or_else(|| {
        AppError::new(
            "VALIDATION_ERROR",
            "Unsupported image format. Use png, jpg/jpeg, webp, gif, heic, or heif.",
        )
    })?;

    let bytes = std::fs::read(path)
        .map_err(|err| AppError::new("IO_ERROR", format!("Failed to read image: {err}")))?;
    let encoded = general_purpose::STANDARD.encode(bytes);

    Ok(format!("data:{mime};base64,{encoded}"))
}

fn includes_mathematical_methods(topics: &[String]) -> bool {
    topics
        .iter()
        .any(|topic| topic.trim().eq_ignore_ascii_case(MATHEMATICAL_METHODS_TOPIC))
}

fn includes_physical_education(topics: &[String]) -> bool {
    topics
        .iter()
        .any(|topic| topic.trim().eq_ignore_ascii_case(PHYSICAL_EDUCATION_TOPIC))
}




fn is_english_language_topic(topic: &str) -> bool {
    topic.trim().eq_ignore_ascii_case(ENGLISH_LANGUAGE_TOPIC)
}

fn normalize_english_task_types(raw_types: Option<&[String]>) -> Vec<&'static str> {
    let mut selected: Vec<&'static str> = Vec::new();

    for task_type in raw_types.unwrap_or(&[]) {
        let normalized = task_type.trim().to_ascii_lowercase();
        let canonical = match normalized.as_str() {
            "short-answer" => Some("short-answer"),
            "analytical-essay" => Some("analytical-essay"),
            _ => None,
        };

        if let Some(value) = canonical {
            if !selected.contains(&value) {
                selected.push(value);
            }
        }
    }

    if selected.is_empty() {
        vec!["short-answer", "analytical-essay"]
    } else {
        selected
    }
}




fn infer_image_mime(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    match extension.as_str() {
        "jpg" | "jpeg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "heic" => Some("image/heic"),
        "heif" => Some("image/heif"),
        _ => None,
    }
}
