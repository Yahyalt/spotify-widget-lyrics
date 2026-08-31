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
    pub read_at_ms: u64,
    pub is_playing: bool,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
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

    let lyrics = json
        .get("syncedLyrics")
        .and_then(|v| v.as_str())
        .or_else(|| json.get("plainLyrics").and_then(|v| v.as_str()));

    Ok(lyrics.map(|s| s.to_string()))
}

fn start_polling(app: tauri::AppHandle) {
    thread::spawn(move || {
        // Init COM ONCE for this thread
        unsafe {
            let hr = windows::Win32::System::Com::CoInitializeEx(
                None,
                windows::Win32::System::Com::COINIT_MULTITHREADED,
            );
            if hr.is_err() {
                return;
            }
        }

        // Request the manager ONCE and keep it alive
        let manager = match GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .and_then(|op| op.get())
        {
            Ok(m) => m,
            Err(_) => return,
        };

        let mut cached_source = String::new();
        let mut cached_title = String::new();
        let mut cached_artist = String::new();
        let mut had_session = false;
        let mut tick_count: u64 = 0;

        loop {
            tick_count += 1;

            let state: Option<PlaybackState> = (|| {
                let sessions = manager.GetSessions().ok()?;
                if sessions.Size().ok()? == 0 {
                    return None;
                }
                let session = sessions.GetAt(0).ok()?;

                // If the media source app changed, invalidate metadata cache
                let source = session.SourceAppUserModelId().ok()?.to_string();
                if source != cached_source {
                    cached_source = source;
                    cached_title.clear();
                    cached_artist.clear();
                }

                // FAST synchronous position read, every 100ms
                let timeline = session.GetTimelineProperties().ok()?;
                let position_ms = (timeline.Position().ok()?.Duration / 10_000).max(0) as u64;
                let read_at_ms = now_ms();

                let is_playing = session.GetPlaybackInfo().ok()?.PlaybackStatus().ok()?
                    == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;

                // Metadata read: only when source changed, or every 1s fallback (10 ticks * 100ms)
                if cached_title.is_empty() || tick_count % 10 == 0 {
                    if let Ok(props) = session
                        .TryGetMediaPropertiesAsync()
                        .and_then(|op| op.get())
                    {
                        cached_title = props.Title().map(|t| t.to_string()).unwrap_or_default();
                        cached_artist = props.Artist().map(|a| a.to_string()).unwrap_or_default();
                    }
                }

                Some(PlaybackState {
                    title: cached_title.clone(),
                    artist: cached_artist.clone(),
                    position_ms,
                    read_at_ms,
                    is_playing,
                })
            })();

            match state {
                Some(s) => {
                    had_session = true;
                    let _ = app.emit("playback-update", Some(s));
                }
                None => {
                    if had_session {
                        had_session = false;
                        let _ = app.emit("playback-update", None::<PlaybackState>);
                    }
                }
            }

            thread::sleep(Duration::from_millis(100)); // 10Hz
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