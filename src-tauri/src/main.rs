#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::thread;
use std::time::Duration;
use tauri::Emitter;
use windows::Media::Control::*;

#[derive(Serialize, Deserialize, Clone)]
pub struct TrackInfo {
    pub title: String,
    pub artist: String,
}

#[tauri::command]
async fn get_current_track() -> std::result::Result<Option<TrackInfo>, String> {
    // 1. Initialize COM for the current background thread
    unsafe {
        let hr = windows::Win32::System::Com::CoInitializeEx(
            None,
            windows::Win32::System::Com::COINIT_MULTITHREADED,
        );
        if hr.is_err() {
            return Err(format!("COM initialization failed: {}", hr));
        }
    }

    // 2. Request the SMTC manager and block until it completes
    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;

    // 3. GetSessions() returns a collection (never null).
    //    If no media app is active, the collection is simply empty.
    let sessions = manager.GetSessions().map_err(|e| e.to_string())?;
    let count = sessions.Size().map_err(|e| e.to_string())?;
    if count == 0 {
        return Ok(None);
    }
    let session = sessions.GetAt(0).map_err(|e| e.to_string())?;

    // 4. Get media properties and block until complete
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

    Ok(Some(TrackInfo { title, artist }))
}

#[tauri::command]
async fn fetch_lyrics(title: String, artist: String) -> Result<Option<String>, String> {
    let client = reqwest::Client::new();
    
    // Clean metadata for better matching
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

    if let Some(lyrics) = json.get("plainLyrics").and_then(|v| v.as_str()) {
        Ok(Some(lyrics.to_string()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn start_polling(app: tauri::AppHandle) {
    thread::spawn(move || {
        let mut last_title = String::new();
        
        loop {
            // Poll SMTC every 3 seconds
            match get_current_track() {
                Ok(Some(track)) => {
                    let current_id = format!("{} - {}", track.artist, track.title);
                    if current_id != last_title {
                        last_title = current_id.clone();
                        app.emit("track-changed", track).unwrap();
                    }
                }
                Ok(None) => {
                    if !last_title.is_empty() {
                        last_title.clear();
                        app.emit("no-track", ()).unwrap();
                    }
                }
                Err(_) => {} // Ignore SMTC errors
            }
            thread::sleep(Duration::from_secs(3));
        }
    });
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_current_track, fetch_lyrics, start_polling])
        .setup(|app| {
            start_polling(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}