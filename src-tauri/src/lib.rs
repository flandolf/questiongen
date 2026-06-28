mod anki;
pub use anki::export_deck_to_file;
mod catalog;
mod constants;
mod deepseek_info;
mod difficulty;
mod engine;
mod envelope;
mod http_client;
mod json_input;
mod latex;
mod llm;
mod models;
mod normalization;
mod nvidia_info;
mod openrouter_info;
mod parsing;
mod pdf;
mod persistence;
mod provider_models;
mod quality;
mod question_traits;
mod schemas;
mod text_clean;
mod topic_normalize;

use once_cell::sync::OnceCell;
#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
use std::process::Command;

static APP_HANDLE: OnceCell<tauri::AppHandle> = OnceCell::new();

use deepseek_info::{get_deepseek_balance, list_deepseek_models};
use models::*;
use nvidia_info::list_nvidia_models;
use openrouter_info::{get_credits, get_model_stats};
use persistence::{
    export_data_file, export_data_file_to_directory, list_json_files_in_directory,
    load_persisted_state, read_text_file, save_persisted_state, write_text_file,
};
use provider_models::{get_provider_model_stats, list_provider_models, validate_provider_key};

#[tauri::command]
async fn generate_questions(
    app: tauri::AppHandle,
    state: tauri::State<'_, AbortSignal>,
    request: GenerateQuestionsRequest,
) -> CommandResult<GenerateQuestionsResponse> {
    state.reset();
    let ctx = engine::context::EngineContext::new(app).with_abort_signal(state.inner().clone());
    engine::generate_written_questions(&ctx, request).await
}

#[tauri::command]
async fn generate_mc_questions(
    app: tauri::AppHandle,
    state: tauri::State<'_, AbortSignal>,
    request: GenerateMcQuestionsRequest,
) -> CommandResult<GenerateMcQuestionsResponse> {
    state.reset();
    let ctx = engine::context::EngineContext::new(app).with_abort_signal(state.inner().clone());
    engine::generate_mc_questions(&ctx, request).await
}

#[tauri::command]
async fn mark_answer(
    app: tauri::AppHandle,
    state: tauri::State<'_, AbortSignal>,
    request: MarkAnswerRequest,
) -> CommandResult<MarkAnswerResponse> {
    state.reset();
    let ctx = engine::context::EngineContext::new(app).with_abort_signal(state.inner().clone());
    engine::mark_answer(&ctx, request).await
}

#[tauri::command]
async fn batch_mark_answers(
    app: tauri::AppHandle,
    state: tauri::State<'_, AbortSignal>,
    request: BatchMarkRequest,
) -> CommandResult<BatchMarkResponse> {
    state.reset();
    let ctx = engine::context::EngineContext::new(app).with_abort_signal(state.inner().clone());
    engine::batch_mark_answers(&ctx, request).await
}

#[tauri::command]
async fn tutor_chat(
    app: tauri::AppHandle,
    state: tauri::State<'_, AbortSignal>,
    request: TutorChatRequest,
) -> CommandResult<TutorChatResponse> {
    state.reset();
    let ctx = engine::context::EngineContext::new(app).with_abort_signal(state.inner().clone());
    engine::tutor_chat(&ctx, request).await
}

#[tauri::command]
async fn mark_pdf(
    app: tauri::AppHandle,
    state: tauri::State<'_, AbortSignal>,
    request: MarkPdfRequest,
) -> CommandResult<MarkPdfResponse> {
    state.reset();
    let ctx = engine::context::EngineContext::new(app).with_abort_signal(state.inner().clone());
    engine::mark_pdf(&ctx, request).await
}

#[tauri::command]
async fn discover_pdf_questions(
    app: tauri::AppHandle,
    state: tauri::State<'_, AbortSignal>,
    request: DiscoverPdfQuestionsRequest,
) -> CommandResult<DiscoverPdfQuestionsResponse> {
    state.reset();
    let ctx = engine::context::EngineContext::new(app).with_abort_signal(state.inner().clone());
    engine::discover_pdf_questions(&ctx, request).await
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
    let ctx = engine::context::EngineContext::new(app);
    engine::analyze_image(&ctx, request).await
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
async fn cleanup_topics(
    app: tauri::AppHandle,
    request: CleanupTopicsRequest,
) -> CommandResult<CleanupTopicsResponse> {
    let ctx = engine::context::EngineContext::new(app);
    engine::cleanup_topics(&ctx, request).await
}

// cleanup_subtopics removed — subject normalization is now performed on frontend

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
                .await
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
    app: tauri::AppHandle,
    request: GenerateSubtopicsRequest,
) -> CommandResult<GenerateSubtopicsResponse> {
    let ctx = engine::context::EngineContext::new(app);
    engine::generate_subtopics(&ctx, request).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let _ = APP_HANDLE.set(app.handle().clone());
            Ok(())
        })
        .manage(AbortSignal::new())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            get_deepseek_balance,
            list_deepseek_models,
            list_nvidia_models,
            list_provider_models,
            get_provider_model_stats,
            validate_provider_key,
            cleanup_topics,
            export_question_to_anki,
            abort_generation,
            mark_pdf,
            discover_pdf_questions,
            generate_subtopics,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
