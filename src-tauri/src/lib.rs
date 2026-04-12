mod anki;
mod catalog;
mod cleanup;
mod constants;
mod difficulty;
mod generation;
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

use once_cell::sync::OnceCell;
use std::collections::HashMap;

static APP_HANDLE: OnceCell<tauri::AppHandle> = OnceCell::new();

use models::*;
use openrouter_info::{get_credits, get_model_stats};
use persistence::{
    export_data_file, export_data_file_to_directory, list_json_files_in_directory,
    load_persisted_state, read_text_file, save_persisted_state,
};

#[tauri::command]
async fn generate_questions(
    app: tauri::AppHandle,
    request: GenerateQuestionsRequest,
) -> CommandResult<GenerateQuestionsResponse> {
    generation::GenerationService::new(app)
        .generate_written(request)
        .await
}

#[tauri::command]
async fn generate_mc_questions(
    app: tauri::AppHandle,
    request: GenerateMcQuestionsRequest,
) -> CommandResult<GenerateMcQuestionsResponse> {
    generation::GenerationService::new(app)
        .generate_mc(request)
        .await
}

#[tauri::command]
async fn mark_answer(
    app: tauri::AppHandle,
    request: MarkAnswerRequest,
) -> CommandResult<MarkAnswerResponse> {
    generation::GenerationService::new(app)
        .mark_answer(request)
        .await
}

#[tauri::command]
async fn batch_mark_answers(
    app: tauri::AppHandle,
    request: BatchMarkRequest,
) -> CommandResult<BatchMarkResponse> {
    use futures_util::stream::{self, StreamExt};

    let results: Vec<BatchMarkItem> = stream::iter(request.items)
        .map(|item| {
            let app = app.clone();
            async move {
                let question_id = item.question.id.clone();
                match generation::GenerationService::new(app)
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
    request: TutorChatRequest,
) -> CommandResult<TutorChatResponse> {
    generation::GenerationService::new(app)
        .tutor_chat(request)
        .await
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
    let note = anki::create_note(
        &model,
        &request.question,
        &request.answer,
        &request.topic,
        &request.subtopic,
    )?;

    let mut deck = genanki_rs::Deck::new(1607392319, "QuestionGen Deck", "");
    deck.add_note(note);

    anki::export_deck_to_file(deck, &file_path)?;

    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    {
        use tauri_plugin_opener::OpenerExt;
        if let Err(e) = app.opener().open_path(&file_path, None::<&str>) {
            return Ok(ExportQuestionToAnkiResponse {
                success: true,
                file_path: Some(file_path),
                error_message: Some(format!(
                    "Deck exported, but could not auto-open it: {}",
                    e
                )),
            });
        }
    }

    Ok(ExportQuestionToAnkiResponse {
        success: true,
        file_path: Some(file_path),
        error_message: None,
    })
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_persisted_state,
            save_persisted_state,
            export_data_file,
            export_data_file_to_directory,
            list_json_files_in_directory,
            read_text_file,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
