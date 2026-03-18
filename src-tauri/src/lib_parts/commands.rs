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

    let includes_english = includes_english_language(&request.topics);
    let difficulty_rules = if includes_english {
        "Target the specific linguistic concepts, discourse features, and analytical depth expected in VCE English Language at this difficulty level."
    } else {
        difficulty_guidance(&request.difficulty)
    };

    let tech_note = if includes_english {
        "Set \"techAllowed\": false."
    } else {
        match request.tech_mode.as_deref().unwrap_or("mix") {
            "tech-free" => "All questions must be tech-free. Set \"techAllowed\": false.",
            "tech-active" => "All questions must be tech-active. Set \"techAllowed\": true.",
            _ => "Mix of tech-free and tech-active. Set \"techAllowed\" per question.",
        }
    };
    let custom_focus_note = request
        .custom_focus_area
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("Custom focus area: {value}\n"))
        .unwrap_or_default();
    let focus_areas_note = build_focus_areas_note(
        request.subtopics.as_ref(),
        request.subtopic_instructions.as_ref(),
    );

    let english_task_types_note = if includes_english {
        let selected_types =
            normalize_english_task_types(request.english_task_types.as_deref()).join(" or ");
        format!("Task types: {} only.\nDO NOT generate mathematics, science, or quantitative content. DO NOT use LaTeX.", selected_types)
    } else {
        String::new()
    };

    let repetition_avoidance_note = if !request.prior_question_prompts.is_empty() {
        format!("AVOID REPETITION:\nDo not recreate these recent questions from the same topic(s):\n{}\n\n", request.prior_question_prompts.iter().map(|p| format!("  - {}", p)).collect::<Vec<_>>().join("\n"))
    } else {
        String::new()
    };

    let max_marks_cap = request.max_marks_per_question.unwrap_or(30);
    let json_schema_note = format!(
        "OUTPUT FORMAT (valid JSON only):\n\
        {{\n\
            \"questions\": [\n\
                {{\n\
                    \"id\": \"string (unique identifier)\",\n\
                    \"t\": \"string (topic name)\",\n\
                    \"s\": \"string (subtopic, optional)\",\n\
                    \"tt\": \"string (task type for English: short-answer or analytical-essay, optional)\",\n\
                    \"rl\": \"string (response length: short or extended, English only)\",\n\
                    \"p\": \"string (question prompt in markdown)\",\n\
                    \"m\": integer (max marks, 1–{max_marks_cap}),\n\
                    \"ta\": boolean (true=technology allowed, false=tech-free)\n\
                }}\n\
            ]\n\
        }}\n"
    );

    let user_prompt = format!(
        "Generate exactly {count} VCE written-response questions.\n\n\
        TOPICS: {topics}\n\n\
        DIFFICULTY: {difficulty}\n\n\
        {difficulty_rules}\n\n\
        {tech_note}\n\n\
        {english_task_types_note}\n\n\
        MARK ALLOCATIONS: Distribute marks 1–{max_marks_cap} per question; vary command terms and cognitive demand.\n\n\
        FORMATTING:\n\
        • Use markdown; apply LaTeX for mathematics: inline \\\\(...\\\\), block \\\\[...\\\\].\n\
        • Prompts: precise, economical language; command terms must align with mark allocations.\n\n\
        {focus_areas_note}\
        {custom_focus_note}\
        {repetition_avoidance_note}\n\n",
        count = request.question_count,
        topics = request.topics.join(", "),
        difficulty = request.difficulty,
        difficulty_rules = difficulty_rules,
        tech_note = tech_note,
        english_task_types_note = english_task_types_note,
        max_marks_cap = max_marks_cap,
        focus_areas_note = focus_areas_note,
        custom_focus_note = custom_focus_note,
        repetition_avoidance_note = repetition_avoidance_note,
    ) + &json_schema_note;

    let (user_content, _) = build_generation_user_content(&app, &request.topics, &user_prompt)?;
    let response_format = Some(written_questions_response_format());

    let result = call_openrouter(
        &request.api_key,
        &request.model,
        "You are a VCE examination expert who writes rigorous, precisely-calibrated exam questions. You understand mark allocations, command term expectations, and learner cognitive load. Generate questions that authentically assess the curriculum.",
        user_content,
        response_format.as_ref(),
    )
    .await?;

    let mut parsed: GenerateQuestionsResponse =
        parse_structured_response(&result.content, "written question generation")?;

    // Perform necessary normalization
    let selected_english_task_types =
        normalize_english_task_types(request.english_task_types.as_deref());
    let prioritized_command_terms =
        normalize_prioritized_command_terms(request.prioritized_command_terms.as_deref());

    normalize_written_questions(
        &mut parsed.questions,
        &request.topics,
        request.subtopics.as_ref(),
        &selected_english_task_types,
        &prioritized_command_terms,
    );

    if parsed.questions.len() != request.question_count {
        return Err(AppError::new(
            "MODEL_ERROR",
            format!(
                "Expected {} questions, got {}.",
                request.question_count,
                parsed.questions.len()
            ),
        ));
    }

    emit_generation_status(
        &app,
        "written",
        "completed",
        format!("Finished in {}ms", started.elapsed().as_millis()),
        1,
    );

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
        Instructions:\n\
        - LaTeX delimiters: inline \\\\(...\\\\), block \\\\[...\\\\].\n\
        Constraints:\n\
        - Use VCAA-style criterion marking.\n\
        - feedbackMarkdown: max 120 words.\n\
        Use this JSON schema:\n\
        {{\n\
            \"verdict\": \"string\",\n\
            \"achievedMarks\": integer,\n\
            \"maxMarks\": integer,\n\
            \"scoreOutOf10\": integer,\n\
            \"comparisonToSolutionMarkdown\": \"string\",\n\
            \"feedbackMarkdown\": \"string\",\n\
            \"workedSolutionMarkdown\": \"string\",\n\
            \"vcaaMarkingScheme\": [\n\
                {{\n\
                    \"criterion\": \"string\",\n\
                    \"achievedMarks\": integer,\n\
                    \"maxMarks\": integer,\n\
                    \"rationale\": \"string\"\n\
                }}\n\
            ]\n\
        }}\n",
        topic = request.question.topic,
        max_marks = request.question.max_marks,
        question = request.question.prompt_markdown,
        answer = normalized_answer
    );

    let user_content = build_mark_answer_user_content(
        &user_prompt,
        request.student_answer_image_data_url.as_deref(),
    )?;
    let response_format = Some(mark_answer_response_format());

    let result = call_openrouter(
        &request.api_key,
        &request.model,
        "You are a strict VCE marker.",
        user_content,
        response_format.as_ref(),
    )
    .await?;

    // Try to normalize simpler response formats to the expected schema
    let normalized_response =
        normalize_mark_answer_response(&result.content, request.question.max_marks)?;

    let mut parsed: MarkAnswerResponse =
        parse_structured_response(&normalized_response, "answer marking")?;

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
    emit_generation_status(
        &app,
        "passage",
        "generating",
        "Generating English Language passage...",
        1,
    );

    let instruction_note = english_language_passage_instruction(&request.aos_subtopic);
    let selected_text_type = pick_passage_text_type();

    let json_schema_note = "You must respond in JSON. Use this schema:\n\
        {\n\
            \"passage\": {\n\
                \"id\": \"string (unique)\",\n\
                \"txt\": \"string (passage text)\",\n\
                \"aos\": \"string (Area of Study)\",\n\
                \"q\": [\n\
                    {\n\
                        \"id\": \"string (unique)\",\n\
                        \"p\": \"string (question prompt in markdown)\",\n\
                        \"m\": integer (max marks, 1 to 5)\n\
                    }\n\
                ]\n\
            }\n\
        }\n";

    let user_prompt = format!(
        "Create one English Language stimulus passage for: {aos_subtopic}.\n\
        Text type: {text_type}\n\
        Rules:\n{instruction}\n\
        Constraints:\n\
        - Return exactly {question_count} questions based on the passage.\n\
        - Passage: 200-300 words, clearly delimited lines (no manual numbers).\n\
        - Questions: must include numeric line references.\n\
        {json_schema_note}",
        aos_subtopic = request.aos_subtopic,
        text_type = selected_text_type,
        instruction = instruction_note,
        question_count = request.question_count,
        json_schema_note = json_schema_note
    );

    let response_format = Some(passage_response_format());

    let result = call_openrouter(
        &request.api_key,
        &request.model,
        "You are an expert VCE English Language SAC writer.",
        serde_json::Value::String(user_prompt),
        response_format.as_ref(),
    )
    .await?;

    let mut parsed: GeneratePassageResponse =
        parse_structured_response(&result.content, "passage generation")?;

    normalize_generated_passage(&mut parsed.passage, &request.aos_subtopic);

    emit_generation_status(
        &app,
        "passage",
        "completed",
        format!("Finished in {}ms", started.elapsed().as_millis()),
        1,
    );

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
async fn mark_passage_answer(
    request: MarkPassageAnswerRequest,
) -> CommandResult<MarkAnswerResponse> {
    validate_passage_mark_request(&request)?;
    let normalized_answer = normalize_student_answer_for_marking(&request.student_answer);

    let user_prompt = format!(
        "Mark this VCE English Language response ({max_marks} marks).\n\
        Passage:\n{passage}\n\n\
        Question:\n{question}\n\n\
        Student Answer:\n{answer}\n\n\
        Constraints:\n\
        - Reward precise metalanguage and passage evidence.",
        max_marks = request.question.max_marks,
        passage = request.passage_text,
        question = request.question.prompt_markdown,
        answer = normalized_answer
    );

    let result = call_openrouter(
        &request.api_key,
        &request.model,
        "You are a strict English Language marker.",
        serde_json::Value::String(user_prompt),
        Some(&mark_answer_response_format()),
    )
    .await?;

    let mut parsed: MarkAnswerResponse =
        parse_structured_response(&result.content, "passage answer marking")?;

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
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "OpenRouter API key is required.",
        ));
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
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Select at least one topic.",
        ));
    }

    if request.question_count == 0 || request.question_count > 20 {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Question count must be between 1 and 20.",
        ));
    }

    if request.api_key.trim().is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "OpenRouter API key is required.",
        ));
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
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "OpenRouter API key is required.",
        ));
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

fn validate_passage_generate_request(
    request: &GeneratePassageQuestionsRequest,
) -> CommandResult<()> {
    if request.aos_subtopic.trim().is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Choose an Area of Study.",
        ));
    }

    if request.question_count < 3 || request.question_count > 10 {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Passage question count must be between 3 and 10.",
        ));
    }

    if request.api_key.trim().is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "OpenRouter API key is required.",
        ));
    }

    if request.model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model is required."));
    }

    Ok(())
}

fn validate_passage_mark_request(request: &MarkPassageAnswerRequest) -> CommandResult<()> {
    if request.passage_text.trim().is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Passage text is required.",
        ));
    }

    if request.question.prompt_markdown.trim().is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Question prompt is required.",
        ));
    }

    if request.student_answer.trim().is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Enter an answer before submitting.",
        ));
    }

    if request.api_key.trim().is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "OpenRouter API key is required.",
        ));
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
        "type": "json_object"
    })
}

fn passage_response_format() -> serde_json::Value {
    serde_json::json!({
        "type": "json_object"
    })
}

fn mc_questions_response_format() -> serde_json::Value {
    serde_json::json!({
        "type": "json_object"
    })
}

fn mark_answer_response_format() -> serde_json::Value {
    serde_json::json!({
        "type": "json_schema",
        "json_schema": {
            "name": "mark_answer_response",
            "strict": true,
            "required": [
                "achievedMarks",
                "comparisonToSolutionMarkdown",
                "feedbackMarkdown",
                "maxMarks",
                "scoreOutOf10",
                "vcaaMarkingScheme",
                "verdict",
                "workedSolutionMarkdown",
            ],
            "schema": {
                "type": "object",
                "properties": {
                    "verdict": { "type": "string", "description": "The verdict for the answer" },
                    "achievedMarks": { "type": "integer", "minimum": 0, "description": "Marks achieved by the student's answer" },
                    "maxMarks": { "type": "integer", "minimum": 1, "description": "Maximum marks for the question" },
                    "scoreOutOf10": { "type": "integer", "minimum": 0, "maximum": 10, "description": "Score out of 10" },
                    "vcaaMarkingScheme": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["criterion", "achievedMarks", "maxMarks", "rationale"],
                            "properties": {
                                "criterion": { "type": "string", "description": "The marking criterion" },
                                "achievedMarks": { "type": "integer", "minimum": 0, "description": "Marks achieved for this criterion" },
                                "maxMarks": { "type": "integer", "minimum": 0, "description": "Maximum marks for this criterion" },
                                "rationale": { "type": "string", "description": "The rationale for the marking" }
                            }
                        }
                    },
                    "comparisonToSolutionMarkdown": { "type": "string", "description": "Comparison to the solution in markdown" },
                    "feedbackMarkdown": { "type": "string", "description": "Feedback in markdown" },
                    "workedSolutionMarkdown": { "type": "string", "description": "Worked solution in markdown" }
                }
            }
        }
    })
}

async fn call_openrouter(
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_content: serde_json::Value,
    response_format: Option<&serde_json::Value>,
) -> CommandResult<OpenRouterCallResult> {
    let plugins = Some(serde_json::json!([
        {
            "id": "response-healing",
        }
    ]));

    call_openrouter_with_plugins(
        api_key,
        model,
        system_prompt,
        user_content,
        plugins,
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
    let user_message = build_user_message(&user_content)?;
    let make_body = |include_response_format: bool| {
        build_chat_completion_body(
            model,
            system_prompt,
            &user_message,
            plugins.as_ref(),
            response_format.as_ref(),
            include_response_format,
        )
    };

    let has_response_format = response_format.is_some();

    let initial_body = make_body(has_response_format);
    eprintln!(
        "[DEBUG] OpenRouter request - Model: {}, Has response_format: {}, Sending response_format: {}",
        model,
        has_response_format,
        has_response_format

    );

    match post_to_openrouter(api_key, &initial_body).await {
        Ok(response) => extract_openrouter_content(response),
        Err(err) => {
            if has_response_format {
                eprintln!(
                    "[WARN] Structured-output request failed for model {model}: {:?}",
                    err
                );
            } else {
                eprintln!("[ERROR] OpenRouter API error: {:?}", err);
            }

            if has_response_format {
                eprintln!(
                    "[DEBUG] Retrying without response_format after structured request failure; model cached as incompatible"
                );
                let fallback_body = make_body(false);
                let fallback_response = post_to_openrouter(api_key, &fallback_body)
                    .await
                    .map_err(|fallback_err| {
                        eprintln!("[ERROR] Fallback request also failed: {:?}", fallback_err);
                        AppError::new(
                            "OPENROUTER_ERROR",
                            format!(
                                "OpenRouter request failed (structured): {:?}; fallback without response_format failed: {:?}",
                                err, fallback_err
                            ),
                        )
                    })?;
                extract_openrouter_content(fallback_response)
            } else {
                Err(AppError::new(
                    "OPENROUTER_ERROR",
                    format!("OpenRouter request failed: {:?}", err),
                ))
            }
        }
    }
}

async fn post_to_openrouter(
    api_key: &str,
    body: &serde_json::Value,
) -> CommandResult<serde_json::Value> {
    let client = reqwest::Client::new();
    let response = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {api_key}"))
        .json(body)
        .send()
        .await
        .map_err(|e| AppError::new("OPENROUTER_ERROR", format!("HTTP request failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::new(
            "OPENROUTER_ERROR",
            format!("API request failed with status {status}: {text}"),
        ));
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| AppError::new("OPENROUTER_ERROR", format!("Failed to parse response: {e}")))
}

fn build_chat_completion_body(
    model: &str,
    system_prompt: &str,
    user_message: &serde_json::Value,
    plugins: Option<&serde_json::Value>,
    response_format: Option<&serde_json::Value>,
    include_response_format: bool,
) -> serde_json::Value {
    let messages = serde_json::json!([
        {"role": "system", "content": system_prompt},
        user_message,
    ]);

    let mut body = serde_json::json!({
        "model": model,
        "messages": messages,
        "temperature": 0.5,
        "max_tokens": OPENROUTER_MAX_TOKENS,
    });

    if include_response_format {
        if let Some(fmt) = response_format {
            let schema_name = fmt
                .get("json_schema")
                .and_then(|node| node.get("name"))
                .and_then(serde_json::Value::as_str)
                .unwrap_or("unknown");
            eprintln!("[DEBUG] Applying response_format json_schema: {schema_name}");
            body["response_format"] = fmt.clone();
        }
    }

    if let Some(plugins) = plugins {
        body["plugins"] = plugins.clone();
    }

    println!("[DEBUG] Final OpenRouter request body: {}", body);

    body
}

fn build_user_message(content: &serde_json::Value) -> CommandResult<serde_json::Value> {
    match content {
        serde_json::Value::String(text) => Ok(serde_json::json!({"role": "user", "content": text})),
        serde_json::Value::Array(parts) => {
            let parsed_parts = parts
                .iter()
                .map(parse_content_part)
                .collect::<Result<Vec<_>, _>>()?;
            Ok(serde_json::json!({"role": "user", "content": parsed_parts}))
        }
        other => Err(AppError::new(
            "VALIDATION_ERROR",
            format!("Unsupported user content type: {other}"),
        )),
    }
}

fn parse_content_part(value: &serde_json::Value) -> CommandResult<serde_json::Value> {
    let kind = value
        .get("type")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .ok_or_else(|| AppError::new("VALIDATION_ERROR", "Content part must include a type."))?;

    match kind {
        "text" => {
            let text = value
                .get("text")
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| {
                    AppError::new("VALIDATION_ERROR", "Text content part is missing \"text\".")
                })?;
            Ok(serde_json::json!({"type": "text", "text": text}))
        }
        "image_url" => {
            let image_node = value
                .get("image_url")
                .and_then(serde_json::Value::as_object)
                .ok_or_else(|| {
                    AppError::new("VALIDATION_ERROR", "image_url content part is invalid.")
                })?;
            let url = image_node
                .get("url")
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| {
                    AppError::new("VALIDATION_ERROR", "image_url part must include a url.")
                })?;
            let detail = image_node.get("detail").and_then(serde_json::Value::as_str);

            if let Some(detail) = detail {
                Ok(
                    serde_json::json!({"type": "image_url", "image_url": {"url": url, "detail": detail}}),
                )
            } else {
                Ok(serde_json::json!({"type": "image_url", "image_url": {"url": url}}))
            }
        }
        _ => Err(AppError::new(
            "VALIDATION_ERROR",
            format!("Unsupported content part type: {kind}"),
        )),
    }
}

fn extract_openrouter_content(response: serde_json::Value) -> CommandResult<OpenRouterCallResult> {
    let content = response
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|msg| msg.get("content"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");

    Ok(OpenRouterCallResult {
        content: content.to_string(),
    })
}

fn build_mark_answer_user_content(
    text: &str,
    image_data_url: Option<&str>,
) -> CommandResult<serde_json::Value> {
    let Some(image_data_url) = image_data_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
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

fn normalize_mark_answer_response(response_text: &str, max_marks: u8) -> CommandResult<String> {
    let json: serde_json::Value = serde_json::from_str(response_text).map_err(|e| {
        AppError::new(
            "JSON_PARSE_ERROR",
            format!("Failed to parse response JSON: {e}"),
        )
    })?;

    // Check if this is the simpler format (has "marks" or "breakdown" directly)
    if json.get("marks").is_some() || json.get("breakdown").is_some() {
        // Convert simpler format to expected schema
        let achieved_marks = json.get("marks").and_then(|v| v.as_u64()).unwrap_or(0) as u8;

        let feedback = json
            .get("feedback")
            .and_then(|v| v.as_str())
            .unwrap_or("No feedback provided");

        let breakdown = json.get("breakdown")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| {
                        let criterion = item.get("criterion").and_then(|v| v.as_str()).unwrap_or("Unknown");
                        let item_marks = item.get("awarded").or(item.get("marks"))
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0) as u8;
                        let max_item_marks = item.get("marks")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(1) as u8;
                        Some(serde_json::json!({
                            "criterion": criterion,
                            "achievedMarks": item_marks,
                            "maxMarks": max_item_marks,
                            "rationale": format!("Awarded {} out of {} marks", item_marks, max_item_marks)
                        }))
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let score_out_of_10 = ((achieved_marks as f32 / max_marks as f32) * 10.0).round() as u8;

        // Build the expected response format
        let normalized = serde_json::json!({
            "verdict": if achieved_marks == max_marks {
                "Excellent - Full marks awarded"
            } else if achieved_marks > (max_marks / 2) {
                "Good - Partial credit awarded"
            } else {
                "Fair - Limited credit awarded"
            },
            "achievedMarks": achieved_marks,
            "maxMarks": max_marks,
            "scoreOutOf10": score_out_of_10,
            "vcaaMarkingScheme": breakdown,
            "feedbackMarkdown": feedback,
            "comparisonToSolutionMarkdown": "Student response assessed against VCAA criteria.",
            "workedSolutionMarkdown": "See feedback above for guidance."
        });

        return Ok(normalized.to_string());
    }

    // Already in expected format, return as-is
    Ok(response_text.to_string())
}

fn includes_mathematical_methods(topics: &[String]) -> bool {
    topics.iter().any(|topic| {
        topic
            .trim()
            .eq_ignore_ascii_case(MATHEMATICAL_METHODS_TOPIC)
    })
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

fn build_focus_areas_note(
    subtopics: Option<&Vec<String>>,
    subtopic_instructions: Option<&std::collections::HashMap<String, String>>,
) -> String {
    let mut note = String::new();

    if let Some(subtopics) = subtopics.filter(|items| !items.is_empty()) {
        note.push_str(&format!("Focus areas selected: {}\n", subtopics.join("; ")));
    }

    if let Some(instructions) = subtopic_instructions.filter(|items| !items.is_empty()) {
        note.push_str("Focus area guidance:\n");
        let mut entries: Vec<(&String, &String)> = instructions.iter().collect();
        entries.sort_by(|a, b| a.0.cmp(b.0));
        for (subtopic, instruction) in entries {
            let trimmed = instruction.trim();
            if trimmed.is_empty() {
                continue;
            }
            note.push_str(&format!("- {subtopic}: {trimmed}\n"));
        }
    }

    note
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
