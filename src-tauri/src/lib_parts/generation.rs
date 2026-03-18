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
    let started = Instant::now();
    emit_generation_status(
        &app,
        "multiple-choice",
        "generating",
        "Generating questions...",
        1,
    );

    if request.topics.is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "Select at least one topic.",
        ));
    }

    let difficulty_rules = difficulty_guidance(&request.difficulty);
    let tech_note = match request.tech_mode.as_deref().unwrap_or("mix") {
        "tech-free" => "All questions must be tech-free. Set \"techAllowed\": false.",
        "tech-active" => "All questions must be tech-active. Set \"techAllowed\": true.",
        _ => "Mix of tech-free and tech-active. Set \"techAllowed\" per question.",
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

    let json_schema_note = "You must respond in JSON. Use this schema:\n\
        {\n\
            \"questions\": [\n\
                {\n\
                    \"id\": \"string (unique)\",\n\
                    \"t\": \"string (topic)\",\n\
                    \"s\": \"string (subtopic, optional)\",\n\
                    \"p\": \"string (question prompt in markdown)\",\n\
                    \"o\": [\n\
                        { \"l\": \"string (A, B, C, D)\", \"txt\": \"string (option text)\" }\n\
                    ],\n\
                    \"a\": \"string (correct answer: A, B, C, D)\",\n\
                    \"e\": \"string (explanation in markdown)\",\n\
                    \"ta\": boolean (tech allowed)\n\
                }\n\
            ]\n\
        }\n";

    let user_prompt = format!(
        "Create exactly {count} VCE multiple-choice questions (4 options: A, B, C, D) for: {topics}.\n\
        Difficulty: {difficulty}\n\
        {custom_focus_note}\
        {focus_areas_note}\
        Rules:\n{difficulty_rules}\n{tech_note}\n\
        Constraints:\n\
        - explanationMarkdown: 1-3 sentences max.\n\
        Use markdown when necessary for formatting, but keep it concise and focused on clarity.
        ",
        count = request.question_count,
        topics = request.topics.join(", "),
        difficulty = request.difficulty,
        custom_focus_note = custom_focus_note,
        focus_areas_note = focus_areas_note,
        difficulty_rules = difficulty_rules,
        tech_note = tech_note,
    )+ r#"- Use LaTeX: \\( ... \\) for inline, \\[ ... \\] for block.\n"# + json_schema_note;
    let (user_content, _) = build_generation_user_content(&app, &request.topics, &user_prompt)?;
    let response_format = Some(mc_questions_response_format());

    let result = call_openrouter(
        &request.api_key,
        &request.model,
        "You are an expert VCE exam writer.",
        user_content,
        response_format.as_ref(),
    )
    .await?;

    let mut parsed: GenerateMcQuestionsResponse =
        parse_structured_response(&result.content, "multiple-choice generation")?;

    normalize_mc_questions(&mut parsed.questions, request.subtopics.as_ref());

    // Minimal validation
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
        "multiple-choice",
        "completed",
        format!("Finished in {}ms", started.elapsed().as_millis()),
        1,
    );

    Ok(GenerateMcQuestionsResponse {
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

fn default_question_max_marks() -> u8 {
    10
}

fn difficulty_guidance(level: &str) -> &'static str {
    if level.eq_ignore_ascii_case("essential skills") {
        "- Target essential syllabus skills only: direct recall, direct substitution, and straightforward procedure execution.\n- Keep cognitive load low: minimal analysis, minimal context decoding, and no hidden method-switching.\n- Prefer one-step to short two-step tasks using familiar phrasing and standard forms."
    } else if level.eq_ignore_ascii_case("easy") {
        "- Target foundational understanding and direct application.\n- Use familiar contexts with minimal distractor complexity.\n- Keep reasoning steps short and explicit."
    } else if level.eq_ignore_ascii_case("medium") {
        "- Require multi-step reasoning with at least two linked concepts.\n- Include non-routine context shifts that require method choice.\n- Use realistic exam pressure through concise but information-dense prompts."
    } else if level.eq_ignore_ascii_case("hard") {
        "- Construct discriminator-level challenges that pivot on information-dense narratives, requiring students to synthesize multiple areas of the VCE Study Design simultaneously.\n- Use sophisticated wording to present edge-case scenarios or restricted domains that intentionally subvert rote-learned templates and punish routine algorithm application.\n- Require the student to articulate a rigorous, error-resistant reasoning chain that justifies their specific method selection amidst competing constraints."
    } else {
        "- Transcend standard VCE exam rigor by targeting an intellectual depth comparable to mathematical olympiads or introductory university analysis.\n- Employ abstract, multi-layered prose that embeds implicit constraints and requires the construction of original sub-results or cross-domain derivations (e.g., linking complex probability transformations with calculus optimization).\n- Maximize cognitive load through unfamiliar problem framings that offer zero reliance on template recall, forcing a deep conceptual derivation of the solution from first principles."
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
    COMMAND_TERM_PROFILES
        .iter()
        .find(|profile| profile.key == normalized)
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
        .find(|profile| profile.key == leading_token)
}

fn includes_english_language(topics: &[String]) -> bool {
    topics
        .iter()
        .any(|topic| topic.trim().eq_ignore_ascii_case(ENGLISH_LANGUAGE_TOPIC))
}

fn normalize_written_questions(
    questions: &mut [GeneratedQuestion],
    selected_topics: &[String],
    selected_subtopics: Option<&Vec<String>>,
    selected_english_task_types: &[&str],
    prioritized_command_terms: &[&'static CommandTermProfile],
) {
    let includes_english = includes_english_language(selected_topics);

    for question in questions {
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
            .map(|subtopic| subtopic.trim().to_string())
            .filter(|subtopic| !subtopic.is_empty());

        if includes_english && is_english_language_topic(&question.topic) {
            let normalized_task_type = question
                .task_type
                .as_ref()
                .map(|value| value.trim().to_ascii_lowercase())
                .and_then(|value| match value.as_str() {
                    "short-answer" => Some("short-answer".to_string()),
                    "analytical-essay" => Some("analytical-essay".to_string()),
                    _ => None,
                });

            let selected_task_type = if selected_english_task_types.len() == 1 {
                selected_english_task_types
                    .first()
                    .map(|value| (*value).to_string())
            } else {
                None
            };

            question.task_type = normalized_task_type.or(selected_task_type);
            question.recommended_response_length = match question.task_type.as_deref() {
                Some("short-answer") => Some("short".to_string()),
                Some("analytical-essay") => Some("extended".to_string()),
                _ => question
                    .recommended_response_length
                    .as_ref()
                    .map(|value| value.trim().to_ascii_lowercase())
                    .and_then(|value| match value.as_str() {
                        "short" => Some("short".to_string()),
                        "extended" => Some("extended".to_string()),
                        _ => None,
                    }),
            };
        } else {
            question.task_type = None;
            question.recommended_response_length = None;
        }
    }
}

fn normalize_mc_questions(questions: &mut [McQuestion], selected_subtopics: Option<&Vec<String>>) {
    for question in questions {
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
            .map(|subtopic| subtopic.trim().to_string())
            .filter(|subtopic| !subtopic.is_empty());
        for opt in &mut question.options {
            opt.label = opt.label.trim().to_uppercase();
            opt.text = decode_literal_newlines(&opt.text).trim().to_string();
        }
    }
}

fn normalize_generated_passage(passage: &mut GeneratedPassage, selected_aos_subtopic: &str) {
    passage.id = passage.id.trim().to_string();
    passage.text = decode_literal_newlines(&passage.text)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    passage.aos_subtopic = if passage.aos_subtopic.trim().is_empty() {
        selected_aos_subtopic.trim().to_string()
    } else {
        passage.aos_subtopic.trim().to_string()
    };

    for question in &mut passage.questions {
        question.id = question.id.trim().to_string();
        question.prompt_markdown = decode_literal_newlines(&question.prompt_markdown)
            .trim()
            .to_string();
        question.max_marks = question.max_marks.clamp(1, 5);
    }
}

fn pick_passage_text_type() -> &'static str {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.subsec_nanos() as usize)
        .unwrap_or(0);
    let index = nanos % PASSAGE_TEXT_TYPE_OPTIONS.len();
    PASSAGE_TEXT_TYPE_OPTIONS[index]
}

fn english_language_passage_instruction(aos_subtopic: &str) -> &'static str {
    match aos_subtopic.trim() {
        "Unit 1 AOS 1: Nature and Functions of Language" => "Focus on the nature and functions of language, especially situational context, register, lexical and syntactic choices, sentence structures, modal verbs, clauses, and the major functions of language.",
        "Unit 1 AOS 2: Language Acquisition" => "Focus on acquisition evidence such as developmental features, overgeneralisation, caretaker talk, and linguistic milestones.",
        "Unit 2 AOS 1: English Across Time" => "Focus on historical development of English, language change, lexical shift, and social or technological influences on change.",
        "Unit 2 AOS 2: Englishes in Contact" => "Focus on contact varieties, borrowing, world Englishes, Aboriginal Englishes, prestige, attitudes, and identity impacts.",
        "Unit 3 AOS 1: Informality" => "Focus on informal Australian English, rapport building, discourse particles, idioms, contractions, and interactional strategies.",
        "Unit 3 AOS 2: Formality" => "Focus on formal register, authority, nominalisation, modality, hedging, politeness, and discourse structure.",
        "Unit 4 AOS 1: Language Variation in Australian Society" => "Focus on variation across dialects, social meaning, identity, power, and attitudes toward language varieties in Australia.",
        "Unit 4 AOS 2: Individual and Group Identities" => "Focus on idiolect, sociolect, group affiliation, inclusion, exclusion, authority, authenticity, and language choices shaping identity.",
        _ => "Focus tightly on the selected VCE English Language Area of Study and reward precise metalanguage tied directly to textual evidence.",
    }
}

fn decode_literal_newlines(value: &str) -> String {
    let mut decoded = String::with_capacity(value.len());
    let chars: Vec<char> = value.chars().collect();
    let mut index = 0;

    while index < chars.len() {
        if chars[index] == '\\' {
            if index + 3 < chars.len()
                && chars[index + 1] == 'r'
                && chars[index + 2] == '\\'
                && chars[index + 3] == 'n'
            {
                decoded.push('\n');
                index += 4;
                continue;
            }

            if index + 1 < chars.len() && chars[index + 1] == 'n' {
                let next_after_n = chars.get(index + 2).copied();
                // Preserve common LaTeX commands such as \neq, \nabla, etc.
                if next_after_n.is_some_and(|ch| ch.is_ascii_lowercase()) {
                    decoded.push('\\');
                    decoded.push('n');
                } else {
                    decoded.push('\n');
                }
                index += 2;
                continue;
            }
        }

        decoded.push(chars[index]);
        index += 1;
    }

    decoded
}

fn parse_structured_response<T>(content: &str, context: &str) -> CommandResult<T>
where
    T: serde::de::DeserializeOwned,
{
    let trimmed = content.trim();
    println!("Parsing structured response for {}: {}", context, trimmed);
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
            generate_passage_questions,
            mark_answer,
            mark_passage_answer,
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
    let url = format!("https://openrouter.ai/api/v1/models/{}/endpoints", model);
    let client = reqwest::Client::new();

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Request failed with status: {}", response.status()));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse JSON response: {}", e))?;

    let tps = json["data"]["endpoints"]
        .as_array()
        .and_then(|endpoints| {
            endpoints.iter().find_map(|endpoint| {
                endpoint["throughput_last_30m"]
                    .get("p50")
                    .and_then(|value| value.as_f64())
            })
        })
        .ok_or_else(|| "Failed to extract TPS from response".to_string())?;

    Ok(tps)
}

#[tauri::command]
async fn test_model(model: &str, api_key: &str) -> Result<String, String> {
    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": "Who is Socrates?"}],
    });

    let client = reqwest::Client::new();
    let response = client
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

    let content = json
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|msg| msg.get("content"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or("")
        .to_string();

    Ok(content)
}
