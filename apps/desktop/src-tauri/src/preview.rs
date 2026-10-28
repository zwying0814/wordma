use std::time::Duration;

use serde::Serialize;
use tauri::{
    AppHandle, Emitter, Manager, WebviewUrl,
    WebviewWindowBuilder, Window, WindowEvent,
};

use crate::engine;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewState {
    pub open: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

fn emit_state(app: &AppHandle, state: PreviewState) {
    let _ = app.emit("preview://state", state);
}

fn wait_for_url(
    app: &AppHandle,
    root: &str,
) -> Result<String, String> {
    for _ in 0..100 {
        if let Some(url) = engine::dev_url_for_root(app, root) {
            return Ok(url);
        }
        std::thread::sleep(Duration::from_millis(100));
    }

    Err("dev server 未在 10 秒内就绪".to_string())
}

#[tauri::command]
pub async fn preview_start(
    app: AppHandle,
    root: String,
) -> Result<PreviewState, String> {
    let root = engine::ensure_dev(&app, root)?;
    let wait_app = app.clone();
    let wait_root = root.clone();
    let url = tauri::async_runtime::spawn_blocking(move || {
        wait_for_url(&wait_app, &wait_root)
    })
    .await
    .map_err(|error| format!("等待预览服务失败：{error}"))??;

    let parsed = url
        .parse::<tauri::Url>()
        .map_err(|error| format!("预览 URL 无效：{error}"))?;

    if let Some(window) = app.get_webview_window("preview") {
        window
            .navigate(parsed)
            .map_err(|error| format!("导航预览窗口失败：{error}"))?;
        let _ = window.set_focus();
    } else {
        WebviewWindowBuilder::new(
            &app,
            "preview",
            WebviewUrl::External(parsed),
        )
        .title("Wordma Preview")
        .inner_size(1100.0, 820.0)
        .min_inner_size(640.0, 480.0)
        .build()
        .map_err(|error| format!("创建预览窗口失败：{error}"))?;
    }

    let state = PreviewState {
        open: true,
        url: Some(url),
    };
    emit_state(&app, state.clone());
    Ok(state)
}

#[tauri::command]
pub fn preview_stop(
    app: AppHandle,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("preview") {
        let _ = window.close();
    }
    engine::stop(&app);
    emit_state(
        &app,
        PreviewState {
            open: false,
            url: None,
        },
    );
    Ok(())
}

#[tauri::command]
pub fn preview_status(app: AppHandle) -> PreviewState {
    let open = app.get_webview_window("preview").is_some();
    PreviewState { open, url: None }
}

pub fn handle_window_event(
    window: &Window,
    event: &WindowEvent,
) {
    if window.label() != "preview" {
        return;
    }

    if matches!(event, WindowEvent::Destroyed) {
        emit_state(
            window.app_handle(),
            PreviewState {
                open: false,
                url: None,
            },
        );
    }
}
