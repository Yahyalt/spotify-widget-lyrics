import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './App.css';

interface TrackInfo {
  title: string;
  artist: string;
}

function App() {
  const [track, setTrack] = useState<TrackInfo | null>(null);
  const [lyrics, setLyrics] = useState<string[]>([]);
  const [status, setStatus] = useState('Waiting for Spotify...');

  useEffect(() => {
    // Listen for track changes from Rust backend
    const unlistenTrack = listen<TrackInfo>('track-changed', (event) => {
      const newTrack = event.payload;
      setTrack(newTrack);
      setStatus('Fetching lyrics...');
      
      // Fetch lyrics
      invoke<string>('fetch_lyrics', { title: newTrack.title, artist: newTrack.artist })
        .then((lyricsText) => {
          if (lyricsText) {
            setLyrics(lyricsText.split('\n').filter(line => line.trim() !== ''));
            setStatus('');
          } else {
            setLyrics([]);
            setStatus('Lyrics not found');
          }
        })
        .catch((err) => {
          console.error(err);
          setStatus('Error fetching lyrics');
        });
    });

    const unlistenNoTrack = listen('no-track', () => {
      setTrack(null);
      setLyrics([]);
      setStatus('Waiting for Spotify...');
    });

    return () => {
      unlistenTrack.then(f => f());
      unlistenNoTrack.then(f => f());
    };
  }, []);

  return (
    <div className="container" data-tauri-drag-region>
      {track && (
        <div className="track-info">
          <h3>{track.title}</h3>
          <p>{track.artist}</p>
        </div>
      )}
      
      {status && <div className="status">{status}</div>}
      
      <div className="lyrics-container">
        {lyrics.map((line, index) => (
          <p key={index} className="lyric-line">{line}</p>
        ))}
      </div>
    </div>
  );
}

export default App;