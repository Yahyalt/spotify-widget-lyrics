import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './App.css';

interface PlaybackState {
  title: string;
  artist: string;
  position_ms: number;
  is_playing: boolean;
}

interface LyricLine {
  time: number; // ms, -1 for plain lyrics
  text: string;
}

function parseLRC(lrc: string): LyricLine[] {
  const regex = /\[(\d{1,2}):(\d{1,2})[.:](\d{1,3})\]\s*(.*)/;
  const lines: LyricLine[] = [];
  for (const raw of lrc.split('\n')) {
    const m = raw.match(regex);
    if (!m) continue;
    const time =
      parseInt(m[1]) * 60000 +
      parseInt(m[2]) * 1000 +
      parseInt(m[3].padEnd(3, '0'));
    const text = m[4].trim();
    if (text) lines.push({ time, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

function App() {
  const [track, setTrack] = useState<{ title: string; artist: string } | null>(null);
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [isSynced, setIsSynced] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [status, setStatus] = useState('Waiting for Spotify...');

  const posRef = useRef(0);
  const pollTimeRef = useRef(0);
  const playingRef = useRef(false);
  const trackIdRef = useRef('');
  const linesRef = useRef<LyricLine[]>([]);
  const syncedRef = useRef(false);
  const lineElsRef = useRef<(HTMLParagraphElement | null)[]>([]);

  useEffect(() => { linesRef.current = lines; }, [lines]);
  useEffect(() => { syncedRef.current = isSynced; }, [isSynced]);

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
      <div className={isSynced ? 'lyrics-container synced' : 'lyrics-container'}>
        {lines.map((line, i) => (
          <p
            key={i}
            ref={(el) => { lineElsRef.current[i] = el; }}
            className={
              'lyric-line' +
              (i === activeIndex ? ' active' : '') +
              (i < activeIndex ? ' past' : '')
            }
          >
            {line.text}
          </p>
        ))}
      </div>
    </div>
  );
}

export default App;