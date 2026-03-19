// ── Persistence ──────────────────────────────────────────────────────────────

#[tauri::command]
fn load_persisted_state(app: tauri::AppHandle) -> CommandResult<serde_json::Value> {
    let path = persisted_state_path(&app)?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }

    let content = fs::read_to_string(&path).map_err(|err| {
        AppError::new("PERSISTENCE_READ_ERROR", format!("Could not read persisted app state: {err}"))
    })?;

    if content.trim().is_empty() {
        return Ok(serde_json::json!({}));
    }

    serde_json::from_str(&content).map_err(|err| {
        AppError::new("PERSISTENCE_PARSE_ERROR", format!("Persisted app state is invalid JSON: {err}"))
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
            AppError::new("PERSISTENCE_DIR_ERROR", format!("Could not create app data directory: {err}"))
        })?;
    }

    let payload = serde_json::to_string(&state).map_err(|err| {
        AppError::new("PERSISTENCE_SERIALIZE_ERROR", format!("Could not serialize app state: {err}"))
    })?;

    let temp_path = path.with_extension("tmp");
    fs::write(&temp_path, payload).map_err(|err| {
        AppError::new("PERSISTENCE_WRITE_ERROR", format!("Could not write temporary app state file: {err}"))
    })?;

    remove_existing_state_file(&path)?;

    fs::rename(&temp_path, &path).map_err(|err| {
        AppError::new("PERSISTENCE_RENAME_ERROR", format!("Could not finalize app state file: {err}"))
    })
}

fn persisted_state_path(app: &tauri::AppHandle) -> CommandResult<PathBuf> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(APP_STATE_FILE_NAME))
        .map_err(|err| AppError::new("PERSISTENCE_PATH_ERROR", format!("Could not resolve app data directory: {err}")))
}

fn remove_existing_state_file(path: &Path) -> CommandResult<()> {
    fs::remove_file(path).or_else(|err| {
        if err.kind() == std::io::ErrorKind::NotFound {
            Ok(())
        } else {
            Err(AppError::new("PERSISTENCE_REPLACE_ERROR", format!("Could not replace existing app state file: {err}")))
        }
    })
}

// ── Validation helpers ────────────────────────────────────────────────────────

/// Validates that both api_key and model are non-empty.
fn validate_api_credentials(api_key: &str, model: &str) -> CommandResult<()> {
    if api_key.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "OpenRouter API key is required."));
    }
    if model.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Model is required."));
    }
    Ok(())
}

fn validate_generate_request(request: &GenerateQuestionsRequest) -> CommandResult<()> {
    if request.topics.is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Select at least one topic."));
    }
    if request.question_count == 0 || request.question_count > 20 {
        return Err(AppError::new("VALIDATION_ERROR", "Question count must be between 1 and 20."));
    }
    validate_api_credentials(&request.api_key, &request.model)
}

fn validate_mark_request(request: &MarkAnswerRequest) -> CommandResult<()> {
    let has_text = !request.student_answer.trim().is_empty();
    let has_image = request.student_answer_image_data_url.as_ref()
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false);
    if !has_text && !has_image {
        return Err(AppError::new("VALIDATION_ERROR", "Enter an answer or upload an image before submitting."));
    }
    if request.question.max_marks == 0 {
        return Err(AppError::new("VALIDATION_ERROR", "Question max marks must be greater than zero."));
    }
    validate_api_credentials(&request.api_key, &request.model)
}

// ── Prompt-building helpers ───────────────────────────────────────────────────

fn tech_mode_note(tech_mode: Option<&str>, force_false: bool) -> &'static str {
    if force_false {
        return "Set \"techAllowed\": false.";
    }
    match tech_mode.unwrap_or("mix") {
        "tech-free" => "All questions must be tech-free. Set \"techAllowed\": false.",
        "tech-active" => "All questions must be tech-active. Set \"techAllowed\": true.",
        _ => "Mix of tech-free and tech-active. Set \"techAllowed\" per question.",
    }
}

fn custom_focus_note(raw: Option<&str>) -> String {
    raw.map(str::trim)
        .filter(|v| !v.is_empty())
        .map(|v| format!("Custom focus area: {v}\n"))
        .unwrap_or_default()
}

fn repetition_avoidance_note(prior: &[String]) -> String {
    if prior.is_empty() {
        return String::new();
    }
    let list = prior.iter().map(|p| format!("  - {p}")).collect::<Vec<_>>().join("\n");
    format!("AVOID REPETITION:\nDo not recreate these recent questions from the same topic(s):\n{list}\n\n")
}

fn build_focus_areas_note(
    subtopics: Option<&Vec<String>>,
    subtopic_instructions: Option<&std::collections::HashMap<String, String>>,
) -> String {
    let mut note = String::new();

    if let Some(subs) = subtopics.filter(|s| !s.is_empty()) {
        note.push_str(&format!("Focus areas selected: {}\n", subs.join("; ")));
    }

    if let Some(instructions) = subtopic_instructions.filter(|i| !i.is_empty()) {
        note.push_str("Focus area guidance:\n");
        let mut entries: Vec<_> = instructions.iter().collect();
        entries.sort_by_key(|(k, _)| *k);
        for (subtopic, instruction) in entries {
            let trimmed = instruction.trim();
            if !trimmed.is_empty() {
                note.push_str(&format!("- {subtopic}: {trimmed}\n"));
            }
        }
    }

    note
}

fn build_generation_user_content(
    topics: &[String],
    prompt: &str,
) -> CommandResult<(serde_json::Value, Option<serde_json::Value>)> {
    let mut reference = String::new();
    for (topic, guidance) in [
        (MATHEMATICAL_METHODS_TOPIC, MATHEMATICAL_METHODS_REFERENCE_GUIDANCE),
        (PHYSICAL_EDUCATION_TOPIC,   PHYSICAL_EDUCATION_REFERENCE_GUIDANCE),
    ] {
        if includes_topic(topics, topic) {
            if reference.is_empty() {
                reference.push_str("\n\nReference guidance:\n-");
            } else {
                reference.push_str("\n-");
            }
            reference.push_str(guidance.trim());
        }
    }
    Ok((serde_json::Value::String(format!("{prompt}{reference}")), None))
}

// ── Generation commands ───────────────────────────────────────────────────────

#[tauri::command]
async fn generate_questions(
    app: tauri::AppHandle,
    request: GenerateQuestionsRequest,
) -> CommandResult<GenerateQuestionsResponse> {
    validate_generate_request(&request)?;
    let started = Instant::now();
    emit_generation_status(&app, "written", "generating", "Generating questions...", 1);

    let tech_note = tech_mode_note(request.tech_mode.as_deref(), false);
    let custom_focus_note = custom_focus_note(request.custom_focus_area.as_deref());
    let focus_areas_note = build_focus_areas_note(
        request.subtopics.as_ref(),
        request.subtopic_instructions.as_ref(),
    );
    let repetition_note = repetition_avoidance_note(&request.prior_question_prompts);

    let max_marks_cap = request.max_marks_per_question.unwrap_or(30);

    let user_prompt = format!(
        "Generate exactly {count} VCE written-response questions.\n\n\
        TOPICS: {topics}\n\n\
        DIFFICULTY: {difficulty}\n\n\
        {difficulty_rules}\n\n\
        {tech_note}\n\n\
        MARK ALLOCATIONS: Distribute marks 1–{max_marks_cap} per question; vary command terms and cognitive demand.\n\n\
        FORMATTING:\n\
        • Use markdown. {LATEX_NOTE}\n\
        • Prompts: precise, economical language; command terms must align with mark allocations.\n\n\
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
        Some(&written_questions_response_format(max_marks_cap)),
    )
    .await?;

    let mut parsed: GenerateQuestionsResponse =
        parse_structured_response(&result.content, "written question generation")?;

    let prioritized_command_terms =
        normalize_prioritized_command_terms(request.prioritized_command_terms.as_deref());
    normalize_written_questions(
        &mut parsed.questions,
        request.subtopics.as_ref(),
        &prioritized_command_terms,
    );

    let duration_ms = started.elapsed().as_millis() as u64;
    emit_generation_status(&app, "written", "completed", format!("Finished in {duration_ms}ms"), 1);

    Ok(GenerateQuestionsResponse {
        questions: parsed.questions,
        raw_model_output: result.content,
        telemetry: Some(GenerationTelemetry::simple(&request.difficulty, duration_ms)),
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
        {LATEX_NOTE}\n\
        Use VCAA-style criterion marking. feedbackMarkdown: max 120 words.",
        topic = request.question.topic,
        max_marks = request.question.max_marks,
        question = request.question.prompt_markdown,
        answer = normalized_answer,
    );

    let user_content = build_mark_answer_user_content(
        &user_prompt,
        request.student_answer_image_data_url.as_deref(),
    )?;

    let result = call_openrouter(
        &request.api_key,
        &request.model,
        "You are a strict VCE marker.",
        user_content,
        Some(&mark_answer_response_format()),
    )
    .await?;

    let mut parsed: MarkAnswerResponse =
        parse_structured_response(&result.content, "answer marking")?;

    parsed.max_marks = request.question.max_marks;
    parsed.achieved_marks = parsed.achieved_marks.min(parsed.max_marks);
    parsed.score_out_of_10 = parsed.score_out_of_10.min(10);

    Ok(parsed)
}

fn normalize_student_answer_for_marking(answer: &str) -> String {
    const MAX_CHARS: usize = 12_000;

    let normalized = answer
        .replace("\r\n", "\n")
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();

    if normalized.chars().count() <= MAX_CHARS {
        return normalized;
    }

    let mut truncated = normalized.chars().take(MAX_CHARS).collect::<String>();
    truncated.push_str("\n\n[Truncated by app for marking due to excessive length.]\n");
    truncated
}

#[tauri::command]
async fn analyze_image(request: AnalyzeImageRequest) -> CommandResult<AnalyzeImageResponse> {
    validate_api_credentials(&request.api_key, &request.model)?;
    if request.image_path.trim().is_empty() {
        return Err(AppError::new("VALIDATION_ERROR", "Image path is required."));
    }

    let data_url = encode_image_file_to_data_url(&request.image_path)?;
    let prompt = request.prompt.as_deref()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or("What's in this image?");

    let user_content = serde_json::json!([
        { "type": "text", "text": prompt },
        { "type": "image_url", "image_url": { "url": data_url } }
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

// ── OpenRouter client ─────────────────────────────────────────────────────────

async fn call_openrouter(
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_content: serde_json::Value,
    response_format: Option<&serde_json::Value>,
) -> CommandResult<OpenRouterCallResult> {
    let plugins = Some(serde_json::json!([{ "id": "response-healing" }]));
    let user_message = build_user_message(&user_content)?;
    let body = build_chat_completion_body(
        model,
        system_prompt,
        &user_message,
        plugins.as_ref(),
        response_format,
    );
    let response = post_to_openrouter(api_key, &body).await?;
    extract_openrouter_content(response)
}

async fn post_to_openrouter(api_key: &str, body: &serde_json::Value) -> CommandResult<serde_json::Value> {
    let response = reqwest::Client::new()
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {api_key}"))
        .json(body)
        .send()
        .await
        .map_err(|e| AppError::new("OPENROUTER_ERROR", format!("HTTP request failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::new("OPENROUTER_ERROR", format!("API request failed with status {status}: {text}")));
    }

    response.json::<serde_json::Value>().await
        .map_err(|e| AppError::new("OPENROUTER_ERROR", format!("Failed to parse response: {e}")))
}

fn build_chat_completion_body(
    model: &str,
    system_prompt: &str,
    user_message: &serde_json::Value,
    plugins: Option<&serde_json::Value>,
    response_format: Option<&serde_json::Value>,
) -> serde_json::Value {
    let mut body = serde_json::json!({
        "model": model,
        "messages": [{"role": "system", "content": system_prompt}, user_message],
        "temperature": 0.5,
        "max_tokens": OPENROUTER_MAX_TOKENS,
    });

    if let Some(fmt) = response_format {
        body["response_format"] = fmt.clone();
    }

    if let Some(plugins) = plugins {
        body["plugins"] = plugins.clone();
    }

    body
}

fn build_user_message(content: &serde_json::Value) -> CommandResult<serde_json::Value> {
    match content {
        serde_json::Value::String(text) => Ok(serde_json::json!({"role": "user", "content": text})),
        serde_json::Value::Array(parts) => {
            let parsed_parts = parts.iter().map(parse_content_part).collect::<Result<Vec<_>, _>>()?;
            Ok(serde_json::json!({"role": "user", "content": parsed_parts}))
        }
        other => Err(AppError::new("VALIDATION_ERROR", format!("Unsupported user content type: {other}"))),
    }
}

fn parse_content_part(value: &serde_json::Value) -> CommandResult<serde_json::Value> {
    let kind = value["type"].as_str().map(str::trim)
        .ok_or_else(|| AppError::new("VALIDATION_ERROR", "Content part must include a type."))?;

    match kind {
        "text" => {
            let text = value["text"].as_str()
                .ok_or_else(|| AppError::new("VALIDATION_ERROR", "Text content part is missing \"text\"."))?;
            Ok(serde_json::json!({"type": "text", "text": text}))
        }
        "image_url" => {
            let image_node = value["image_url"].as_object()
                .ok_or_else(|| AppError::new("VALIDATION_ERROR", "image_url content part is invalid."))?;
            let url = image_node["url"].as_str()
                .ok_or_else(|| AppError::new("VALIDATION_ERROR", "image_url part must include a url."))?;

            let mut obj = serde_json::json!({"url": url});
            if let Some(detail) = image_node.get("detail").and_then(serde_json::Value::as_str) {
                obj["detail"] = serde_json::Value::String(detail.to_string());
            }
            Ok(serde_json::json!({"type": "image_url", "image_url": obj}))
        }
        _ => Err(AppError::new("VALIDATION_ERROR", format!("Unsupported content part type: {kind}"))),
    }
}

fn extract_openrouter_content(response: serde_json::Value) -> CommandResult<OpenRouterCallResult> {
    let content = response["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();
    Ok(OpenRouterCallResult { content })
}

fn build_mark_answer_user_content(text: &str, image_data_url: Option<&str>) -> CommandResult<serde_json::Value> {
    let Some(url) = image_data_url.map(str::trim).filter(|v| !v.is_empty()) else {
        return Ok(serde_json::Value::String(text.to_string()));
    };

    if !url.starts_with("data:image/") {
        return Err(AppError::new("VALIDATION_ERROR", "Uploaded image must be a valid image data URL."));
    }

    Ok(serde_json::json!([
        { "type": "text", "text": text },
        { "type": "image_url", "image_url": { "url": url } }
    ]))
}

// ── Image utilities ───────────────────────────────────────────────────────────

fn encode_image_file_to_data_url(image_path: &str) -> CommandResult<String> {
    let path = Path::new(image_path);
    if !path.exists() {
        return Err(AppError::new("VALIDATION_ERROR", "Image file not found."));
    }

    let mime = infer_image_mime(path).ok_or_else(|| {
        AppError::new("VALIDATION_ERROR", "Unsupported image format. Use png, jpg/jpeg, webp, gif, heic, or heif.")
    })?;

    let bytes = std::fs::read(path)
        .map_err(|err| AppError::new("IO_ERROR", format!("Failed to read image: {err}")))?;
    let encoded = general_purpose::STANDARD.encode(bytes);

    Ok(format!("data:{mime};base64,{encoded}"))
}

fn infer_image_mime(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => Some("image/jpeg"),
        "png"          => Some("image/png"),
        "webp"         => Some("image/webp"),
        "gif"          => Some("image/gif"),
        "heic"         => Some("image/heic"),
        "heif"         => Some("image/heif"),
        _              => None,
    }
}


