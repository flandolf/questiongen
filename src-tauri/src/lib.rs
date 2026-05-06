mod anki;
pub use anki::export_deck_to_file;
mod catalog;
mod cleanup;
mod constants;
mod difficulty;
mod envelope;
mod generation;
mod json_input;
mod latex;
mod models;
mod normalization;
mod openrouter;
mod openrouter_info;
mod parsing;
mod pdf;
mod persistence;
mod prompts;
mod quality;
mod schemas;
mod text_clean;
mod topic_normalize;

use once_cell::sync::OnceCell;
use std::collections::HashMap;
#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
use std::process::Command;

static APP_HANDLE: OnceCell<tauri::AppHandle> = OnceCell::new();

use models::*;
use openrouter_info::{get_credits, get_model_stats};
use persistence::{
    export_data_file, export_data_file_to_directory, list_json_files_in_directory,
    load_persisted_state, read_text_file, save_persisted_state, write_text_file,
};

#[tauri::command]
async fn generate_questions(
    app: tauri::AppHandle,
    state: tauri::State<'_, AbortSignal>,
    request: GenerateQuestionsRequest,
) -> CommandResult<GenerateQuestionsResponse> {
    state.reset();
    generation::GenerationService::new(app)
        .with_abort_signal(state.inner().clone())
        .generate_written(request)
        .await
}

#[tauri::command]
async fn generate_mc_questions(
    app: tauri::AppHandle,
    state: tauri::State<'_, AbortSignal>,
    request: GenerateMcQuestionsRequest,
) -> CommandResult<GenerateMcQuestionsResponse> {
    state.reset();
    generation::GenerationService::new(app)
        .with_abort_signal(state.inner().clone())
        .generate_mc(request)
        .await
}

#[tauri::command]
async fn mark_answer(
    app: tauri::AppHandle,
    state: tauri::State<'_, AbortSignal>,
    request: MarkAnswerRequest,
) -> CommandResult<MarkAnswerResponse> {
    state.reset();
    generation::GenerationService::new(app)
        .with_abort_signal(state.inner().clone())
        .mark_answer(request)
        .await
}

#[tauri::command]
async fn batch_mark_answers(
    app: tauri::AppHandle,
    state: tauri::State<'_, AbortSignal>,
    request: BatchMarkRequest,
) -> CommandResult<BatchMarkResponse> {
    use futures_util::stream::{self, StreamExt};
    state.reset();

    let results: Vec<BatchMarkItem> = stream::iter(request.items)
        .map(|item| {
            let app = app.clone();
            let state = state.inner().clone();
            async move {
                let question_id = item.question.id.clone();
                match generation::GenerationService::new(app)
                    .with_abort_signal(state)
                    .mark_answer(item)
                    .await
                {
                    Ok(response) => BatchMarkItem {
                        question_id,
                        response: Some(response),
                        error: None,
                    },
                    Err(e) => BatchMarkItem {
                        question_id,
                        response: None,
                        error: Some(e.message),
                    },
                }
            }
        })
        .buffer_unordered(4)
        .collect()
        .await;

    Ok(BatchMarkResponse { results })
}

#[tauri::command]
async fn tutor_chat(
    app: tauri::AppHandle,
    state: tauri::State<'_, AbortSignal>,
    request: TutorChatRequest,
) -> CommandResult<TutorChatResponse> {
    state.reset();
    generation::GenerationService::new(app)
        .tutor_chat(request)
        .await
}

#[tauri::command]
async fn mark_pdf(
    app: tauri::AppHandle,
    state: tauri::State<'_, AbortSignal>,
    request: MarkPdfRequest,
) -> CommandResult<MarkPdfResponse> {
    state.reset();
    generation::GenerationService::new(app)
        .with_abort_signal(state.inner().clone())
        .mark_pdf(request)
        .await
}

#[tauri::command]
async fn discover_pdf_questions(
    app: tauri::AppHandle,
    state: tauri::State<'_, AbortSignal>,
    request: DiscoverPdfQuestionsRequest,
) -> CommandResult<DiscoverPdfQuestionsResponse> {
    state.reset();
    generation::GenerationService::new(app)
        .with_abort_signal(state.inner().clone())
        .discover_pdf_questions(request)
        .await
}

#[tauri::command]
fn abort_generation(state: tauri::State<'_, AbortSignal>) {
    state.abort();
}

#[tauri::command]
async fn analyze_image(
    app: tauri::AppHandle,
    request: AnalyzeImageRequest,
) -> CommandResult<AnalyzeImageResponse> {
    generation::GenerationService::new(app)
        .analyze_image(request)
        .await
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
fn auto_open_exported_anki_deck(app: &tauri::AppHandle, file_path: &str) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    if app.opener().open_path(file_path, None::<&str>).is_ok() {
        return Ok(());
    }

    let status_result = {
        #[cfg(target_os = "macos")]
        {
            Command::new("open").arg(file_path).status()
        }
        #[cfg(target_os = "linux")]
        {
            Command::new("xdg-open").arg(file_path).status()
        }
        #[cfg(target_os = "windows")]
        {
            Command::new("cmd")
                .args(["/C", "start", ""])
                .arg(file_path)
                .status()
        }
    };

    match status_result {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => Err(format!("open command exited with status: {}", status)),
        Err(e) => Err(format!("failed to run open command: {}", e)),
    }
}

#[tauri::command]
async fn cleanup_topics(request: CleanupTopicsRequest) -> CommandResult<CleanupTopicsResponse> {
    if request.api_key.trim().is_empty() || request.model.trim().is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "API key and model required.",
        ));
    }
    if request.unknown_topics.is_empty() {
        return Ok(CleanupTopicsResponse {
            topic_mapping: HashMap::new(),
        });
    }
    let canonical_topics: Vec<String> = request
        .canonical_topics
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let topic_mapping = cleanup::CleanupService::batch_cleanup(
        &request.unknown_topics,
        &canonical_topics,
        &request.api_key,
        &request.model,
    )
    .await?;
    Ok(CleanupTopicsResponse { topic_mapping })
}

#[tauri::command]
async fn cleanup_subtopics(
    request: CleanupSubtopicsRequest,
) -> CommandResult<CleanupSubtopicsResponse> {
    if request.api_key.trim().is_empty() || request.model.trim().is_empty() {
        return Err(AppError::new(
            "VALIDATION_ERROR",
            "API key and model required.",
        ));
    }
    if request.unknown_subtopics.is_empty() {
        return Ok(CleanupSubtopicsResponse {
            subtopic_mapping: HashMap::new(),
        });
    }
    let canonical_subtopics: Vec<String> = request
        .canonical_subtopics
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let subtopic_mapping = cleanup::CleanupService::batch_cleanup(
        &request.unknown_subtopics,
        &canonical_subtopics,
        &request.api_key,
        &request.model,
    )
    .await?;
    Ok(CleanupSubtopicsResponse { subtopic_mapping })
}

#[tauri::command]
async fn export_question_to_anki(
    app: tauri::AppHandle,
    request: ExportQuestionToAnkiRequest,
) -> CommandResult<ExportQuestionToAnkiResponse> {
    #[cfg(not(target_os = "android"))]
    let file_path = {
        use tauri_plugin_dialog::DialogExt;
        let save_path = app
            .dialog()
            .file()
            .add_filter("Anki Deck", &["apkg"])
            .set_file_name(format!("question-{}.apkg", request.id))
            .blocking_save_file();

        match save_path {
            Some(path) => path.to_string(),
            None => {
                return Ok(ExportQuestionToAnkiResponse {
                    success: false,
                    file_path: None,
                    error_message: Some("User cancelled save dialog".to_string()),
                });
            }
        }
    };

    #[cfg(target_os = "android")]
    let file_path = {
        use tauri::Manager;
        let cache_dir = app
            .path()
            .cache_dir()
            .map_err(|e| AppError::new("IO_ERROR", format!("Failed to get cache dir: {}", e)))?;
        let full_path = cache_dir.join(format!("question-{}.apkg", request.id));
        full_path.to_string_lossy().to_string()
    };

    let model = anki::model();
    let mut question_text = request.question.clone();

    if let Some(options) = request.options {
        question_text.push_str("\n\n");
        for opt in options {
            question_text.push_str(&format!("**({})** {}\n", opt.label, opt.text));
        }
    }

    let note = anki::create_note(
        &model,
        &question_text,
        &request.answer,
        &request.topic,
        &request.subtopic,
    )?;

    let mut deck = genanki_rs::Deck::new(1607392319, "QuestionGen Deck", "");
    deck.add_note(note);

    export_deck_to_file(deck, &file_path)?;

    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        use tauri_plugin_sharekit::ShareExt;
        if let Some(window) = app.get_webview_window("main") {
            app.share()
                .share_file(
                    window,
                    format!("file://{}", file_path),
                    tauri_plugin_sharekit::ShareFileOptions {
                        title: Some("Anki Export".to_string()),
                        ..Default::default()
                    },
                )
                .map_err(|e| AppError::new("SHARE_ERROR", format!("Failed to share: {}", e)))?;
        }
    }

    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    {
        if let Err(e) = auto_open_exported_anki_deck(&app, &file_path) {
            return Ok(ExportQuestionToAnkiResponse {
                success: true,
                file_path: Some(file_path),
                error_message: Some(format!("Deck exported, but could not auto-open it: {}", e)),
            });
        }
    }

    Ok(ExportQuestionToAnkiResponse {
        success: true,
        file_path: Some(file_path),
        error_message: None,
    })
}

#[tauri::command]
async fn generate_subtopics(
    _app: tauri::AppHandle,
    request: GenerateSubtopicsRequest,
) -> CommandResult<GenerateSubtopicsResponse> {
    use crate::openrouter::{call_openrouter, OpenRouterRequestConfig};
    
    use crate::prompts::{subtopic_generation_system, subtopic_generation_user_prompt};

    if request.api_key.trim().is_empty() {
        return Err(AppError::new(
            "NO_API_KEY",
            "OpenRouter API key is required",
        ));
    }

    let exam_guidance = catalog::topic_exam_guidance(&request.topic);
    if exam_guidance.is_empty() {
        return Err(AppError::new("INVALID_TOPIC", "Topic not found in catalog"));
    }

    let user_prompt = subtopic_generation_user_prompt(
        &request.topic,
        exam_guidance,
        &request.existing_subtopics.unwrap_or_default(),
        request.focus_area.as_deref().unwrap_or(""),
    );

    let response_format = serde_json::json!({ "type": "json_object" });

    let mut content_parts = vec![serde_json::json!({ "type": "text", "text": user_prompt })];

    if let Some(ref pdf_content) = request.pdf_content {
        if !pdf_content.trim().is_empty() {
            let data_url = if pdf_content.starts_with("data:application/pdf;base64,") {
                pdf_content.clone()
            } else {
                format!("data:application/pdf;base64,{}", pdf_content)
            };
            content_parts.push(serde_json::json!({
                "type": "file",
                "file": {
                    "filename": "reference.pdf",
                    "file_data": data_url
                }
            }));
        }
    }

    let config = OpenRouterRequestConfig::new(
        &request.api_key,
        &request.model,
        subtopic_generation_system(),
        serde_json::json!(content_parts),
        response_format,
        4000,
    );

    let result = call_openrouter(config).await?;

    let content = result.content.trim();
    let json_start = content.find('{').or_else(|| content.find('['));
    let json_str = if let Some(start) = json_start {
        &content[start..]
    } else {
        content
    };

    let parsed: serde_json::Value = serde_json::from_str(json_str).map_err(|e| {
        AppError::new(
            "PARSE_ERROR",
            format!(
                "Failed to parse response: {}. Content: {}",
                e,
                &json_str[..json_str.len().min(200)]
            ),
        )
    })?;

    let subtopics: Vec<GeneratedSubtopic> = parsed
        .get("subtopics")
        .and_then(|s| s.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    Some(GeneratedSubtopic {
                        name: item.get("name")?.as_str()?.to_string(),
                        group: item.get("group").and_then(|g| g.as_str()).map(String::from),
                        technique_notes: item
                            .get("techniqueNotes")
                            .or_else(|| item.get("technique_notes"))
                            .map(|tn| crate::models::TechniqueNotes {
                                core_concepts: tn
                                    .get("coreConcepts")
                                    .or_else(|| tn.get("core_concepts"))
                                    .and_then(|c| c.as_str())
                                    .map(String::from),
                                exam_style_guidelines: tn
                                    .get("examStyleGuidelines")
                                    .or_else(|| tn.get("exam_style_guidelines"))
                                    .and_then(|e| e.as_str())
                                    .map(String::from),
                                anti_prompts: tn
                                    .get("antiPrompts")
                                    .or_else(|| tn.get("anti_prompts"))
                                    .and_then(|a| a.as_array())
                                    .map(|arr| {
                                        arr.iter()
                                            .filter_map(|p| p.as_str().map(String::from))
                                            .collect()
                                    })
                                    .unwrap_or_default(),
                            }),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    if subtopics.is_empty() {
        return Err(AppError::new(
            "NO_SUBTOPICS",
            "No valid subtopics found in response",
        ));
    }

    Ok(GenerateSubtopicsResponse { subtopics })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let _ = APP_HANDLE.set(app.handle().clone());
            #[cfg(target_os = "android")]
            {
                let ctx = ndk_context::android_context();
                let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }
                    .expect("failed to obtain JavaVM");
                let mut env = vm
                    .attach_current_thread()
                    .expect("failed to attach current thread");
                let context = unsafe { jni::objects::JObject::from_raw(ctx.context().cast()) };
                rustls_platform_verifier::android::init_with_env(&mut env, context)
                    .expect("failed to initialize rustls-platform-verifier");
            }
            Ok(())
        })
        .manage(AbortSignal::new())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_sharekit::init())
        .invoke_handler(tauri::generate_handler![
            load_persisted_state,
            save_persisted_state,
            export_data_file,
            export_data_file_to_directory,
            list_json_files_in_directory,
            read_text_file,
            write_text_file,
            generate_questions,
            mark_answer,
            batch_mark_answers,
            tutor_chat,
            analyze_image,
            generate_mc_questions,
            get_model_stats,
            get_credits,
            cleanup_topics,
            cleanup_subtopics,
            export_question_to_anki,
            abort_generation,
            mark_pdf,
            discover_pdf_questions,
            generate_subtopics,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
