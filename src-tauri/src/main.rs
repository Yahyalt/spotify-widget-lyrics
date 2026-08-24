#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::thread;
use std::time::Duration;
use tauri::Emitter;
use windows::Media::Control::*;

#[derive(Serialize, Deserialize, Clone)]
pub struct PlaybackState {
    pub title: String,
    pub artist: String,
    pub position_ms: u64,
    pub is_playing: bool,
}

#[tauri::command]
async fn get_playback_state() -> std::result::Result<Option<PlaybackState>, String> {
    unsafe {
        let hr = windows::Win32::System::Com::CoInitializeEx(
            None,
            windows::Win32::System::Com::COINIT_MULTITHREADED,
        );
        if hr.is_err() {
            return Err(format!("COM initialization failed: {}", hr));
        }
    }

    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;

    let sessions = manager.GetSessions().map_err(|e| e.to_string())?;
    let count = sessions.Size().map_err(|e| e.to_string())?;
    if count == 0 {
        return Ok(None);
    }
    let session = sessions.GetAt(0).map_err(|e| e.to_string())?;

    let props = session
        .TryGetMediaPropertiesAsync()
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;

    let title = props.Title().map_err(|e| e.to_string())?.to_string();
    let artist = props.Artist().map_err(|e| e.to_string())?.to_string();
    if title.is_empty() {
        return Ok(None);
    }

    // FIX: GetPlaybackInfo() returns an object, then we call PlaybackStatus() on it
    let playback_info = session.GetPlaybackInfo().map_err(|e| e.to_string())?;
    let status = playback_info.PlaybackStatus().map_err(|e| e.to_string())?;
    let is_playing = status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;

    // Current position in the track
    let timeline = session.GetTimelineProperties().map_err(|e| e.to_string())?;
    let timespan = timeline.Position().map_err(|e| e.to_string())?;
    let position_ms = (timespan.Duration / 10_000).max(0) as u64; // 100ns ticks -> ms

    Ok(Some(PlaybackState { title, artist, position_ms, is_playing }))
}

#[tauri::command]
async fn fetch_lyrics(title: String, artist: String) -> std::result::Result<Option<String>, String> {
    let client = reqwest::Client::new();

    let clean_title = title.split('(').next().unwrap_or(&title).trim();
    let clean_artist = artist.split(',').next().unwrap_or(&artist).trim();

    let url = format!(
        "https://lrclib.net/api/get?track_name={}&artist_name={}",
        urlencoding::encode(clean_title),
        urlencoding::encode(clean_artist)
    );

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if response.status() != 200 {
        return Ok(None);
    }

    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

    // Prefer synced lyrics, fall back to plain
    let lyrics = json
        .get("syncedLyrics")
        .and_then(|v| v.as_str())
        .or_else(|| json.get("plainLyrics").and_then(|v| v.as_str()));

    Ok(lyrics.map(|s| s.to_string()))
}

fn start_polling(app: tauri::AppHandle) {
    thread::spawn(move || {
        loop {
            if let Ok(state) = tauri::async_runtime::block_on(get_playback_state()) {
                let _ = app.emit("playback-update", state);
            }
            thread::sleep(Duration::from_secs(1));
        }
    });
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_lyrics])
        .setup(|app| {
            start_polling(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}