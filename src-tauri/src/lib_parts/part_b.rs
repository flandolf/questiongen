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
    let generation_started = Instant::now();
    emit_generation_status(
        &app,
        "written",
        "preparing",
        "Preparing generation request.",
        1,
    );

    let system_prompt_owned = format!("You are an expert VCE exam writer. Produce diverse, exam-style questions and include LaTeX in markdown when mathematics is involved.{LATEX_FORMATTING_RULES}");
    let system_prompt: &str = &system_prompt_owned;
    let topics_csv = request.topics.join(", ");
    let selected_subtopics = request.subtopics.as_ref().filter(|s| !s.is_empty());
    let selected_english_task_types = normalize_english_task_types(request.english_task_types.as_deref());
    let prioritized_command_terms =
        normalize_prioritized_command_terms(request.prioritized_command_terms.as_deref());
    let custom_focus_area = request
        .custom_focus_area
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let difficulty_rules = difficulty_guidance(&request.difficulty);
    let math_methods_reference_note = if includes_mathematical_methods(&request.topics) {
        MATHEMATICAL_METHODS_REFERENCE_GUIDANCE
    } else {
        ""
    };
    let physical_education_reference_note = if includes_physical_education(&request.topics) {
        PHYSICAL_EDUCATION_REFERENCE_GUIDANCE
    } else {
        ""
    };
    let chemistry_formula_note = if includes_chemistry(&request.topics) {
        CHEMICAL_FORMULA_LATEX_GUIDANCE
    } else {
        ""
    };
    let english_language_reference_note = if includes_english_language(&request.topics) {
        ENGLISH_LANGUAGE_REFERENCE_GUIDANCE
    } else {
        ""
    };
    let english_language_task_type_note = if includes_english_language(&request.topics) {
        build_english_language_task_type_note(&selected_english_task_types)
    } else {
        String::new()
    };
    let tech_mode = request.tech_mode.as_deref().unwrap_or("mix");
    let tech_note = match tech_mode {
        "tech-free" => " All questions must be tech-free (no CAS calculator). Set \"techAllowed\": false for every question.",
        "tech-active" => " All questions must be tech-active (CAS calculator allowed). Set \"techAllowed\": true for every question.",
        _ => " Create a realistic mix of tech-free and tech-active questions. Set \"techAllowed\": true or false per question as appropriate.",
    };
    let subtopics_note = match selected_subtopics {
        Some(subs) => format!(" Focus on the following subtopics: {}.", subs.join(", ")),
        None => String::new(),
    };
    let subtopic_instruction_note =
        build_subtopic_instructions_note(selected_subtopics, request.subtopic_instructions.as_ref());
    let custom_focus_note = match custom_focus_area {
        Some(value) => format!(
            " Custom focus area: \"{value}\". Prioritize this focus strongly across the set and align each question context to it where syllabus-valid."
        ),
        None => String::new(),
    };
    let similarity_guardrail_note = build_similarity_guardrail_note(
        request.avoid_similar_questions.unwrap_or(false),
        request.prior_question_prompts.as_deref(),
    );
    let command_term_guidance_note =
        build_command_term_guidance_note(&prioritized_command_terms, &request.topics);
    let is_extreme = request.difficulty.eq_ignore_ascii_case("extreme");
    let is_essential_skills = request
        .difficulty
        .eq_ignore_ascii_case("essential skills");
    let has_math_topic = request.topics.iter().any(|t| {
        let t = t.trim();
        t.eq_ignore_ascii_case("Mathematical Methods") || t.eq_ignore_ascii_case("Specialist Mathematics")
    });
    let essential_skills_math_note = if is_essential_skills && has_math_topic {
        " For mathematics questions at Essential Skills level: prioritise straightforward, single-skill items with minimal analysis, direct substitution, or direct equation solving (for example, solving a basic trigonometric equation on a stated interval). Avoid multi-part proofs, deep modelling, or chained synthesis tasks."
    } else {
        ""
    };
    let extreme_math_note = if is_extreme && has_math_topic {
        " For mathematics questions at Extreme level: heavily favour multi-part analytical and proof-style questions requiring rigorous algebraic manipulation, chain reasoning across two or more concepts, and derivation or justification of results from first principles. Avoid purely computational or template-substitution tasks."
    } else {
        ""
    };
    let max_marks_cap = request.max_marks_per_question.unwrap_or(30);
    let user_prompt = format!(
        "Create exactly {count} original VCE written-response questions for topics: {topics}. Difficulty level: {difficulty}.\n\nDifficulty calibration rules:\n{difficulty_rules}\n\nMark allocation rules:\n- Assign maxMarks based on command-term cognitive demand (do not force equal marks across all questions).\n- Keep maxMarks between 1 and {max_marks_cap}.{command_term_guidance_note}{subtopics_note}{subtopic_instruction_note}{custom_focus_note}{tech_note}{math_methods_reference_note}{physical_education_reference_note}{chemistry_formula_note}{english_language_reference_note}{essential_skills_math_note}{extreme_math_note}{english_language_task_type_note}\n\nQuality constraints:\n- Ensure all questions are materially distinct in concept, context, and required method.\n- Prefer concise prompts with high cognitive load for harder items.\n- Never include worked solutions in promptMarkdown.\n- Use markdown. Use LaTeX only with $...$ and $$...$$ delimiters.\n- For Chemistry content, every chemical formula and ionic species must be in LaTeX math delimiters.{similarity_guardrail_note}\n\nSubtopic constraints:\n- If subtopics are provided, choose \"subtopic\" only from that provided list.\n- If no specific subtopic clearly applies, omit \"subtopic\".\n\nOutput constraints:\n- Return JSON only. No markdown fences. No prose before or after JSON.\n- Return EXACTLY {count} questions.\n- Use this exact JSON shape: {json_contract}",
        count = request.question_count,
        topics = topics_csv,
        difficulty = request.difficulty,
        command_term_guidance_note = command_term_guidance_note,
        difficulty_rules = difficulty_rules,
        subtopics_note = subtopics_note,
        subtopic_instruction_note = subtopic_instruction_note,
        custom_focus_note = custom_focus_note,
        tech_note = tech_note,
        math_methods_reference_note = math_methods_reference_note,
        physical_education_reference_note = physical_education_reference_note,
        chemistry_formula_note = chemistry_formula_note,
        english_language_reference_note = english_language_reference_note,
        essential_skills_math_note = essential_skills_math_note,
        extreme_math_note = extreme_math_note,
        english_language_task_type_note = english_language_task_type_note,
        similarity_guardrail_note = similarity_guardrail_note,
        max_marks_cap = max_marks_cap,
        json_contract = WRITTEN_QUESTION_JSON_CONTRACT,
    );
    let (base_user_content, plugins) =
        build_generation_user_content(&app, &request.topics, &user_prompt)?;
    let response_format = if request.use_structured_output.unwrap_or(false) {
        Some(written_questions_response_format())
    } else {
        None
    };

    emit_generation_status(
        &app,
        "written",
        "generating",
        "Requesting a new written question set.",
        1,
    );
    let first_call = call_openrouter_with_plugins(
        &request.api_key,
        &request.model,
        &system_prompt,
        base_user_content.clone(),
        plugins.clone(),
        response_format.clone(),
    )
    .await?;
    let mut structured_output_unsupported = first_call.structured_output_unsupported_fallback;
    let mut content = first_call.content;

    let mut parse_issue = String::new();
    let mut parsed: Option<GenerateQuestionsResponse> = None;
    let mut repair_attempts = 0usize;
    let mut repair_path: Vec<String> = Vec::new();
    let mut constrained_regeneration_used = false;
    let mut total_attempts = 1usize;

    for attempt in 0..=GENERATION_REPAIR_RETRIES {
        emit_generation_status(
            &app,
            "written",
            "validating",
            "Validating the model response.",
            total_attempts,
        );
        match parse_written_response_candidate(
            &content,
            &request,
            selected_subtopics,
            &selected_english_task_types,
            &prioritized_command_terms,
        ) {
            Ok(candidate) => {
                parsed = Some(candidate);
                break;
            }
            Err(issue) => {
                parse_issue = issue;
                if attempt == GENERATION_REPAIR_RETRIES {
                    break;
                }
                repair_attempts += 1;
                repair_path.push("json-repair".to_string());
                total_attempts += 1;
                emit_generation_status(
                    &app,
                    "written",
                    "repairing",
                    format!("Repairing invalid model output (pass {}).", repair_attempts),
                    total_attempts,
                );
                let repaired = request_json_repair(
                    &request.api_key,
                    &request.model,
                    WRITTEN_QUESTION_JSON_CONTRACT,
                    &content,
                    &parse_issue,
                    response_format.as_ref(),
                )
                .await?;
                structured_output_unsupported =
                    structured_output_unsupported || repaired.structured_output_unsupported_fallback;
                content = repaired.content;
            }
        }
    }

    if parsed.is_none() {
        constrained_regeneration_used = true;
        total_attempts += 1;
        repair_path.push("schema-constrained-regeneration".to_string());
        emit_generation_status(
            &app,
            "written",
            "regenerating",
            "Retrying with a stricter regeneration prompt.",
            total_attempts,
        );
        let regenerated = request_schema_constrained_regeneration(
            &request.api_key,
            &request.model,
            &user_prompt,
            WRITTEN_QUESTION_JSON_CONTRACT,
            &parse_issue,
            &base_user_content,
            plugins.as_ref(),
            response_format.as_ref(),
        )
        .await?;
        structured_output_unsupported =
            structured_output_unsupported || regenerated.structured_output_unsupported_fallback;
        content = regenerated.content;

        match parse_written_response_candidate(
            &content,
            &request,
            selected_subtopics,
            &selected_english_task_types,
            &prioritized_command_terms,
        ) {
            Ok(candidate) => parsed = Some(candidate),
            Err(issue) => parse_issue = issue,
        }
    }

    let mut parsed = parsed.ok_or_else(|| {
        emit_generation_status(
            &app,
            "written",
            "failed",
            format!("Generation failed after {} attempt(s).", total_attempts),
            total_attempts,
        );
        AppError::new(
            "MODEL_PARSE_ERROR",
            format!(
                "Could not parse generated questions after repair attempts. {} Try again or switch model.",
                parse_issue
            ),
        )
    })?;

    // Override techAllowed for non-mix modes
    match tech_mode {
        "tech-free" => {
            for question in &mut parsed.questions {
                question.tech_allowed = false;
            }
        }
        "tech-active" => {
            for question in &mut parsed.questions {
                question.tech_allowed = true;
            }
        }
        _ => {}
    }

    let quality_summary = score_written_question_quality(&mut parsed.questions);
    let telemetry = GenerationTelemetry {
        difficulty: request.difficulty.clone(),
        total_attempts,
        repair_attempts,
        constrained_regeneration_used,
        repair_path,
        duration_ms: generation_started.elapsed().as_millis() as u64,
        structured_output_status: Some(
            if request.use_structured_output.unwrap_or(false) {
                if structured_output_unsupported {
                    "not-supported-fallback"
                } else {
                    "used"
                }
            } else {
                "not-requested"
            }
            .to_string(),
        ),
        distinctness_avg: quality_summary.distinctness_avg,
        multi_step_depth_avg: quality_summary.multi_step_depth_avg,
    };

    emit_generation_status(
        &app,
        "written",
        "completed",
        format!("Written set ready in {} ms.", telemetry.duration_ms),
        total_attempts,
    );

    Ok(GenerateQuestionsResponse {
        questions: parsed.questions,
        raw_model_output: content,
        telemetry: Some(telemetry),
    })
}

#[tauri::command]
async fn mark_answer(request: MarkAnswerRequest) -> CommandResult<MarkAnswerResponse> {
    validate_mark_request(&request)?;

    let system_prompt_owned = format!("You are a strict but constructive VCE marker. Assess student answers fairly and explain clearly.{LATEX_FORMATTING_RULES}");
    let system_prompt: &str = &system_prompt_owned;
    let normalized_student_answer = normalize_student_answer_for_marking(&request.student_answer);
    let chemistry_formula_note = if is_chemistry_topic(&request.question.topic) {
        " For Chemistry content, every chemical formula and ionic species in your response must be LaTeX-formatted (for example $H_2O$, $CO_2$, $Fe^{3+}$, $SO_4^{2-}$)."
    } else {
        ""
    };
    let english_rubric_note = if is_english_language_topic(&request.question.topic) {
        match request.question.task_type.as_deref() {
            Some("analytical-essay") => " For English Language analytical essays, ensure vcaaMarkingScheme contains at least four criteria that explicitly assess: argument quality, metalanguage precision, evidence/examples, and structure/coherence.",
            Some("short-answer") => " For English Language short-answer responses, prioritise concise criterion checks for metalanguage accuracy, textual evidence, and explanation clarity.",
            _ => " For English Language responses, use criterion descriptors that foreground metalanguage precision, textual evidence, and contextual reasoning.",
        }
    } else {
        ""
    };
    let user_prompt_text = format!(
        "Question topic: {topic}\nQuestion:\n{question}\n\nQuestion max marks: {max_marks}\n\nStudent answer:\n{answer}\n\nUse VCAA-style criterion marking. Mark only what is explicitly stated in the student's response and do not infer unstated working. Build a criterion-by-criterion marking scheme, award marks out of {max_marks}, and compare the student response against the worked solution.\n\nConciseness rules:\n- comparisonToSolutionMarkdown: maximum 120 words.\n- feedbackMarkdown: maximum 120 words.\n- workedSolutionMarkdown: maximum 180 words.\n- Each rationale in vcaaMarkingScheme: maximum 45 words.\n\nReturn ONLY valid JSON in this exact shape: {{\"verdict\":\"Correct|Partially Correct|Incorrect\",\"achievedMarks\":6,\"maxMarks\":{max_marks},\"scoreOutOf10\":8,\"vcaaMarkingScheme\":[{{\"criterion\":\"...\",\"achievedMarks\":2,\"maxMarks\":3,\"rationale\":\"...\"}}],\"comparisonToSolutionMarkdown\":\"...\",\"feedbackMarkdown\":\"...\",\"workedSolutionMarkdown\":\"...\"}}. Ensure the sum of vcaaMarkingScheme achievedMarks equals achievedMarks. Use markdown and LaTeX where relevant.{chemistry_formula_note}{english_rubric_note}",
        topic = request.question.topic,
        question = request.question.prompt_markdown,
        answer = normalized_student_answer,
        max_marks = request.question.max_marks,
        chemistry_formula_note = chemistry_formula_note,
        english_rubric_note = english_rubric_note,
    );

    let user_content = build_mark_answer_user_content(&user_prompt_text, request.student_answer_image_data_url.as_deref())?;

    // Marking is latency-sensitive and JSON parsing failures require expensive retry calls,
    // so always request schema-constrained output and let backend fallback handle unsupported models.
    let response_format = Some(mark_answer_response_format());

    let mut content = call_openrouter(
        &request.api_key,
        &request.model,
        system_prompt,
        user_content,
        response_format.as_ref(),
    )
    .await?
    .content;
    let mut payload = parse_json_object(&content);
    if payload.is_none() {
        let repaired = request_json_repair(
            &request.api_key,
            &request.model,
            MARK_ANSWER_JSON_CONTRACT,
            &content,
            "No valid JSON object found in marking response.",
            response_format.as_ref(),
        )
        .await?;
        content = repaired.content;
        payload = parse_json_object(&content);
    }

    let payload = payload.ok_or_else(|| {
        AppError::new(
            "MODEL_PARSE_ERROR",
            format_marking_parse_error(
                "Could not parse the marking response. Try submitting again.",
                &content,
            ),
        )
    })?;

    let mut parsed: MarkAnswerResponse = match serde_json::from_str(&payload) {
        Ok(parsed) => parsed,
        Err(parse_error) => {
            let repaired = request_json_repair(
                &request.api_key,
                &request.model,
                MARK_ANSWER_JSON_CONTRACT,
                &content,
                &format!("Marking JSON did not match schema: {parse_error}"),
                response_format.as_ref(),
            )
            .await?;
            content = repaired.content;
            let repaired_payload = parse_json_object(&content).ok_or_else(|| {
                AppError::new(
                    "MODEL_PARSE_ERROR",
                    format_marking_parse_error(
                        "Could not parse repaired marking response.",
                        &content,
                    ),
                )
            })?;

            serde_json::from_str(&repaired_payload).map_err(|_| {
                AppError::new(
                    "MODEL_PARSE_ERROR",
                    format_marking_parse_error(
                        "OpenRouter returned an unexpected marking format.",
                        &content,
                    ),
                )
            })?
        }
    };

    // Always use the authoritative question max marks; the model sometimes
    // returns maxMarks:10 (copied from the example in the prompt) regardless
    // of the actual question value.
    parsed.max_marks = if request.question.max_marks > 0 {
        request.question.max_marks
    } else {
        10
    };

    if parsed.achieved_marks > parsed.max_marks {
        parsed.achieved_marks = parsed.max_marks;
    }

    let scheme_total = parsed
        .vcaa_marking_scheme
        .iter()
        .fold(0u16, |acc, item| acc + item.achieved_marks as u16);

    parsed.achieved_marks = u8::min(parsed.achieved_marks, parsed.max_marks);
    if scheme_total as u8 != parsed.achieved_marks && !parsed.vcaa_marking_scheme.is_empty() {
        parsed.achieved_marks = u8::min(scheme_total as u8, parsed.max_marks);
    }

    if parsed.score_out_of_10 > 10 {
        parsed.score_out_of_10 = 10;
    }

    if parsed.score_out_of_10 == 0 && parsed.max_marks > 0 {
        let scaled = ((parsed.achieved_marks as f32 / parsed.max_marks as f32) * 10.0).round() as u8;
        parsed.score_out_of_10 = u8::min(scaled, 10);
    }

    parsed.feedback_markdown = decode_literal_newlines(&parsed.feedback_markdown);
    parsed.worked_solution_markdown = decode_literal_newlines(&parsed.worked_solution_markdown);
    parsed.comparison_to_solution_markdown = decode_literal_newlines(&parsed.comparison_to_solution_markdown);
    for criterion in &mut parsed.vcaa_marking_scheme {
        criterion.rationale = decode_literal_newlines(&criterion.rationale);
        criterion.criterion = decode_literal_newlines(&criterion.criterion);
    }

    Ok(parsed)
}

#[tauri::command]
async fn generate_passage_questions(
    app: tauri::AppHandle,
    request: GeneratePassageQuestionsRequest,
) -> CommandResult<GeneratePassageResponse> {
    validate_passage_generate_request(&request)?;
    let generation_started = Instant::now();
    emit_generation_status(
        &app,
        "passage",
        "preparing",
        "Preparing English Language passage request.",
        1,
    );

    let instruction_note = english_language_passage_instruction(&request.aos_subtopic);
    let selected_text_type = pick_passage_text_type();
    let system_prompt = "You are an expert VCE English Language SAC writer. Produce a realistic stimulus passage and precise short-answer metalanguage questions aligned to the requested Area of Study. Return JSON only.";
    let user_prompt = format!(
        "Create exactly one English Language stimulus passage aligned to this Area of Study: {aos_subtopic}.\n\nArea-of-study guidance:\n{instruction_note}\n\nRequired text type for this generation:\n- Write the passage as a {selected_text_type}.\n- Do not default to a generic narrative unless that is the required text type.\n\nRequirements for the passage:\n- Passage length must be approximately 200-300 words.\n- Write a cohesive, natural text rather than bullet points.\n- Include a mix of sentence structures and language features that allow close linguistic analysis.\n- Use clear newline-delimited lines for line numbering: target 10-28 non-empty lines, and keep each line concise (roughly 4-24 words).\n- Do NOT include manual line numbers in the passage text (for example, no prefixes like 1., 2), 3:, or 4 -).\n- Do NOT include bullet markers for lines. The frontend adds line numbers automatically.\n- Ensure each sentence or clause is broken cleanly across lines so line references are unambiguous.\n- Make the passage rich enough to support direct identification questions such as modal verbs, clauses, sentence types, discourse features, and register choices.\n\nRequirements for the questions:\n- Return exactly {question_count} questions.\n- Every question must be answerable using evidence from the passage.\n- Questions must explicitly reference line numbers or a line range (include numeric line references such as \"line 3\" or \"lines 4-6\").\n- Use VCE English Language metalanguage and stay aligned to the selected Area of Study.\n- Prioritise short-answer analytical prompts such as identifying, explaining, comparing, and commenting on linguistic choices.\n- Keep each question concise and assign realistic maxMarks between 1 and 5.\n\nOutput constraints:\n- Return JSON only. No markdown fences. No commentary.\n- Use this exact JSON shape: {json_contract}",
        aos_subtopic = request.aos_subtopic,
        instruction_note = instruction_note,
        selected_text_type = selected_text_type,
        question_count = request.question_count,
        json_contract = PASSAGE_JSON_CONTRACT,
    );
    let user_content = serde_json::Value::String(user_prompt.clone());
    let response_format = if request.use_structured_output.unwrap_or(false) {
        Some(passage_response_format())
    } else {
        None
    };

    emit_generation_status(
        &app,
        "passage",
        "generating",
        format!(
            "Requesting a new English Language passage ({selected_text_type})."
        ),
        1,
    );
    let first_call = call_openrouter(
        &request.api_key,
        &request.model,
        system_prompt,
        user_content.clone(),
        response_format.as_ref(),
    )
    .await?;
    let mut structured_output_unsupported = first_call.structured_output_unsupported_fallback;
    let mut content = first_call.content;

    let mut parse_issue = String::new();
    let mut parsed: Option<GeneratePassageResponse> = None;
    let mut repair_attempts = 0usize;
    let mut repair_path: Vec<String> = Vec::new();
    let mut constrained_regeneration_used = false;
    let mut total_attempts = 1usize;

    for attempt in 0..=GENERATION_REPAIR_RETRIES {
        emit_generation_status(
            &app,
            "passage",
            "validating",
            "Validating the passage response.",
            total_attempts,
        );
        match parse_passage_response_candidate(&content, &request) {
            Ok(candidate) => {
                parsed = Some(candidate);
                break;
            }
            Err(issue) => {
                parse_issue = issue;
                if attempt == GENERATION_REPAIR_RETRIES {
                    break;
                }
                repair_attempts += 1;
                repair_path.push("json-repair".to_string());
                total_attempts += 1;
                emit_generation_status(
                    &app,
                    "passage",
                    "repairing",
                    format!("Repairing invalid passage output (pass {}).", repair_attempts),
                    total_attempts,
                );
                let repaired = request_json_repair(
                    &request.api_key,
                    &request.model,
                    PASSAGE_JSON_CONTRACT,
                    &content,
                    &parse_issue,
                    response_format.as_ref(),
                )
                .await?;
                structured_output_unsupported =
                    structured_output_unsupported || repaired.structured_output_unsupported_fallback;
                content = repaired.content;
            }
        }
    }

    if parsed.is_none() {
        constrained_regeneration_used = true;
        total_attempts += 1;
        repair_path.push("schema-constrained-regeneration".to_string());
        emit_generation_status(
            &app,
            "passage",
            "regenerating",
            "Retrying with a stricter passage prompt.",
            total_attempts,
        );
        let regenerated = request_schema_constrained_regeneration(
            &request.api_key,
            &request.model,
            &user_prompt,
            PASSAGE_JSON_CONTRACT,
            &parse_issue,
            &user_content,
            None,
            response_format.as_ref(),
        )
        .await?;
        structured_output_unsupported =
            structured_output_unsupported || regenerated.structured_output_unsupported_fallback;
        content = regenerated.content;

        match parse_passage_response_candidate(&content, &request) {
            Ok(candidate) => parsed = Some(candidate),
            Err(issue) => parse_issue = issue,
        }
    }

    let parsed = parsed.ok_or_else(|| {
        emit_generation_status(
            &app,
            "passage",
            "failed",
            format!("Passage generation failed after {} attempt(s).", total_attempts),
            total_attempts,
        );
        AppError::new(
            "MODEL_PARSE_ERROR",
            format!(
                "Could not parse generated passage after repair attempts. {} Try again or switch model.",
                parse_issue
            ),
        )
    })?;

    let telemetry = GenerationTelemetry {
        difficulty: request.aos_subtopic.clone(),
        total_attempts,
        repair_attempts,
        constrained_regeneration_used,
        repair_path,
        duration_ms: generation_started.elapsed().as_millis() as u64,
        structured_output_status: Some(
            if request.use_structured_output.unwrap_or(false) {
                if structured_output_unsupported {
                    "not-supported-fallback"
                } else {
                    "used"
                }
            } else {
                "not-requested"
            }
            .to_string(),
        ),
        distinctness_avg: None,
        multi_step_depth_avg: None,
    };

    emit_generation_status(
        &app,
        "passage",
        "completed",
        format!("English Language passage ready in {} ms.", telemetry.duration_ms),
        total_attempts,
    );

    Ok(GeneratePassageResponse {
        passage: parsed.passage,
        raw_model_output: content,
        telemetry: Some(telemetry),
    })
}

#[tauri::command]
async fn mark_passage_answer(request: MarkPassageAnswerRequest) -> CommandResult<MarkAnswerResponse> {
    validate_passage_mark_request(&request)?;

    let system_prompt = "You are a strict but constructive VCE English Language marker. Mark short-answer responses against the passage evidence and the precision of the student's metalanguage. Return JSON only.";
    let normalized_student_answer = normalize_student_answer_for_marking(&request.student_answer);
    let user_prompt_text = format!(
        "Area of Study: {aos_subtopic}\n\nPassage:\n{passage_text}\n\nQuestion:\n{question_prompt}\n\nQuestion max marks: {max_marks}\n\nStudent answer:\n{answer}\n\nMark this as a VCE English Language response. Reward precise linguistic identification, accurate metalanguage, relevant passage evidence, and concise explanation. Do not reward vague feature spotting without explanation.\n\nReturn ONLY valid JSON in this exact shape: {{\"verdict\":\"Correct|Partially Correct|Incorrect\",\"achievedMarks\":1,\"maxMarks\":{max_marks},\"scoreOutOf10\":8,\"vcaaMarkingScheme\":[{{\"criterion\":\"...\",\"achievedMarks\":1,\"maxMarks\":1,\"rationale\":\"...\"}}],\"comparisonToSolutionMarkdown\":\"...\",\"feedbackMarkdown\":\"...\",\"workedSolutionMarkdown\":\"...\"}}. Ensure the sum of vcaaMarkingScheme achievedMarks equals achievedMarks.",
        aos_subtopic = request.aos_subtopic,
        passage_text = request.passage_text,
        question_prompt = request.question.prompt_markdown,
        max_marks = request.question.max_marks,
        answer = normalized_student_answer,
    );

    let mut content = call_openrouter(
        &request.api_key,
        &request.model,
        system_prompt,
        serde_json::Value::String(user_prompt_text),
        Some(&mark_answer_response_format()),
    )
    .await?
    .content;
    let mut payload = parse_json_object(&content);
    if payload.is_none() {
        let repaired = request_json_repair(
            &request.api_key,
            &request.model,
            MARK_ANSWER_JSON_CONTRACT,
            &content,
            "No valid JSON object found in passage marking response.",
            Some(&mark_answer_response_format()),
        )
        .await?;
        content = repaired.content;
        payload = parse_json_object(&content);
    }

    let payload = payload.ok_or_else(|| {
        AppError::new(
            "MODEL_PARSE_ERROR",
            format_marking_parse_error(
                "Could not parse the passage marking response. Try submitting again.",
                &content,
            ),
        )
    })?;

    let mut parsed: MarkAnswerResponse = match serde_json::from_str(&payload) {
        Ok(parsed) => parsed,
        Err(parse_error) => {
            let repaired = request_json_repair(
                &request.api_key,
                &request.model,
                MARK_ANSWER_JSON_CONTRACT,
                &content,
                &format!("Passage marking JSON did not match schema: {parse_error}"),
                Some(&mark_answer_response_format()),
            )
            .await?;
            content = repaired.content;
            let repaired_payload = parse_json_object(&content).ok_or_else(|| {
                AppError::new(
                    "MODEL_PARSE_ERROR",
                    format_marking_parse_error(
                        "Could not parse repaired passage marking response.",
                        &content,
                    ),
                )
            })?;

            serde_json::from_str(&repaired_payload).map_err(|_| {
                AppError::new(
                    "MODEL_PARSE_ERROR",
                    format_marking_parse_error(
                        "OpenRouter returned an unexpected passage marking format.",
                        &content,
                    ),
                )
            })?
        }
    };

    parsed.max_marks = request.question.max_marks;
    if parsed.achieved_marks > parsed.max_marks {
        parsed.achieved_marks = parsed.max_marks;
    }

    let scheme_total = parsed
        .vcaa_marking_scheme
        .iter()
        .fold(0u16, |acc, item| acc + item.achieved_marks as u16);

    parsed.achieved_marks = u8::min(parsed.achieved_marks, parsed.max_marks);
    if scheme_total as u8 != parsed.achieved_marks && !parsed.vcaa_marking_scheme.is_empty() {
        parsed.achieved_marks = u8::min(scheme_total as u8, parsed.max_marks);
    }
    if parsed.score_out_of_10 > 10 {
        parsed.score_out_of_10 = 10;
    }
    if parsed.score_out_of_10 == 0 && parsed.max_marks > 0 {
        let scaled = ((parsed.achieved_marks as f32 / parsed.max_marks as f32) * 10.0).round() as u8;
        parsed.score_out_of_10 = u8::min(scaled, 10);
    }

    parsed.feedback_markdown = decode_literal_newlines(&parsed.feedback_markdown);
    parsed.worked_solution_markdown = decode_literal_newlines(&parsed.worked_solution_markdown);
    parsed.comparison_to_solution_markdown = decode_literal_newlines(&parsed.comparison_to_solution_markdown);
    for criterion in &mut parsed.vcaa_marking_scheme {
        criterion.rationale = decode_literal_newlines(&criterion.rationale);
        criterion.criterion = decode_literal_newlines(&criterion.criterion);
    }

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

fn format_marking_parse_error(prefix: &str, content: &str) -> String {
    let sanitized = content.trim();
    if sanitized.is_empty() {
        return prefix.to_string();
    }

    const MAX_LEN: usize = 1200;
    let mut truncated = sanitized.to_string();
    if truncated.chars().count() > MAX_LEN {
        truncated = truncated.chars().take(MAX_LEN).collect::<String>();
        truncated.push_str("\n... [truncated]");
    }

    format!("{prefix}\n\nRaw model response:\n{truncated}")
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
                structured_output_unsupported_fallback: true,
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
        structured_output_unsupported_fallback: false,
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

fn includes_chemistry(topics: &[String]) -> bool {
    topics
        .iter()
        .any(|topic| topic.trim().eq_ignore_ascii_case(CHEMISTRY_TOPIC))
}

fn includes_english_language(topics: &[String]) -> bool {
    topics
        .iter()
        .any(|topic| topic.trim().eq_ignore_ascii_case(ENGLISH_LANGUAGE_TOPIC))
}

fn is_chemistry_topic(topic: &str) -> bool {
    topic.trim().eq_ignore_ascii_case(CHEMISTRY_TOPIC)
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

fn build_english_language_task_type_note(selected_types: &[&str]) -> String {
    let labels = selected_types
        .iter()
        .map(|task_type| {
            if *task_type == "short-answer" {
                "short-answer"
            } else {
                "analytical-essay"
            }
        })
        .collect::<Vec<_>>()
        .join(", ");

    let balancing_note = if selected_types.len() == 2 {
        "\n- When question count is at least 2, include at least one short-answer and one analytical-essay task."
    } else {
        ""
    };

    format!(
        "\n\nEnglish Language task constraints:\n- For English Language questions, set \"taskType\" to one of: {labels}.\n- Use \"recommendedResponseLength\" = \"short\" for short-answer and \"extended\" for analytical-essay.\n- For short-answer: target concise, evidence-based responses with clear metalanguage.\n- For analytical-essay: require sustained argument, integrated evidence, and coherent paragraphing.{balancing_note}"
    )
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
