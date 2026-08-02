use std::sync::Mutex;

use tauri::Manager;
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

#[derive(Default)]
pub struct ChatGptSidecar {
    child: Mutex<Option<CommandChild>>,
}

const ALLOWED_ORIGINS: &str =
    "http://localhost:1420,http://tauri.localhost,https://tauri.localhost,tauri://localhost";

pub fn start(app: &tauri::AppHandle) -> Result<(), String> {
    let data_directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("could not resolve ChatGPT data directory: {error}"))?;
    std::fs::create_dir_all(&data_directory)
        .map_err(|error| format!("could not create ChatGPT data directory: {error}"))?;

    let state = app
        .try_state::<ChatGptSidecar>()
        .ok_or_else(|| "ChatGPT sidecar state is unavailable".to_owned())?;
    if state
        .child
        .lock()
        .map_err(|_| "ChatGPT sidecar state is unavailable")?
        .is_some()
    {
        return Ok(());
    }

    let (mut events, child) = app
        .shell()
        .sidecar("questiongen-chatgpt")
        .map_err(|error| format!("could not configure ChatGPT sidecar: {error}"))?
        .env("QUESTIONGEN_CHATGPT_DATA_DIR", data_directory)
        .env("LWC_ALLOWED_ORIGINS", ALLOWED_ORIGINS)
        .env("NODE_ENV", "production")
        .spawn()
        .map_err(|error| format!("could not start ChatGPT sidecar: {error}"))?;

    state
        .child
        .lock()
        .map_err(|_| "ChatGPT sidecar state is unavailable")?
        .replace(child);

    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => eprintln!(
                    "[questiongen-chatgpt] {}",
                    String::from_utf8_lossy(&line).trim()
                ),
                CommandEvent::Error(error) => eprintln!("[questiongen-chatgpt] {error}"),
                CommandEvent::Terminated(status) => {
                    eprintln!("[questiongen-chatgpt] terminated: {status:?}")
                }
                _ => {}
            }
        }
    });

    Ok(())
}

pub fn stop(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<ChatGptSidecar>() {
        if let Ok(mut child) = state.child.lock() {
            if let Some(child) = child.take() {
                let _ = child.kill();
            }
        }
    }
}

pub fn secret(app: &tauri::AppHandle) -> Result<String, crate::models::AppError> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| {
            crate::models::AppError::new(
                "CHATGPT_ERROR",
                format!("Could not resolve ChatGPT data directory: {error}"),
            )
        })?
        .join("chatgpt.secret");
    std::fs::read_to_string(path)
        .map(|value| value.trim().to_owned())
        .map_err(|error| {
            crate::models::AppError::new(
                "CHATGPT_ERROR",
                format!("ChatGPT sidecar is not ready: {error}"),
            )
        })
}
