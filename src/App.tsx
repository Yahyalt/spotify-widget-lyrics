import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './App.css';

interface PlaybackState {
  title: string;
  artist: string;
  position_ms: number;
  read_at_ms: number;
  is_playing: boolean;
}

interface LyricLine {
  time: number;
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

  // Listen for playback updates from Rust (every 1s)
  useEffect(() => {
    const unlisten = listen<PlaybackState | null>('playback-update', (event) => {
      const state = event.payload;
      if (!state) {
        setTrack(null);
        setLines([]);
        setActiveIndex(-1);
        setIsSynced(false);
        setStatus('Waiting for Spotify...');
        trackIdRef.current = '';
        return;
      }

      posRef.current = state.position_ms;
      pollTimeRef.current = Date.now();
      playingRef.current = state.is_playing;

      const id = `${state.artist}::${state.title}`;
      if (id !== trackIdRef.current) {
        trackIdRef.current = id;
        setTrack({ title: state.title, artist: state.artist });
        setLines([]);
        setActiveIndex(-1);
        setStatus('Fetching lyrics...');

        invoke<string | null>('fetch_lyrics', { title: state.title, artist: state.artist })
          .then((raw) => {
            if (trackIdRef.current !== id) return; // track changed mid-fetch
            if (!raw) {
              setStatus('Lyrics not found');
              setIsSynced(false);
              return;
            }
            const parsed = parseLRC(raw);
            if (parsed.length > 0) {
              setLines(parsed);
              setIsSynced(true);
            } else {
              // Plain lyrics fallback -> static display
              setLines(
                raw.split('\n').filter((t) => t.trim()).map((t) => ({ time: -1, text: t }))
              );
              setIsSynced(false);
            }
            setStatus('');
          })
          .catch(() => setStatus('Error fetching lyrics'));
      }
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  // 60fps interpolation loop: smooth position between 1s polls
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const ls = linesRef.current;
      if (syncedRef.current && ls.length > 0) {
        const current = playingRef.current
          ? posRef.current + (Date.now() - pollTimeRef.current)
          : posRef.current;

        let idx = -1;
        for (let i = 0; i < ls.length; i++) {
          if (ls[i].time <= current) idx = i;
          else break;
        }
        setActiveIndex(idx); // React skips re-render if unchanged
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Auto-scroll active line to center
  useEffect(() => {
    if (activeIndex >= 0) {
      lineElsRef.current[activeIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex]);

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