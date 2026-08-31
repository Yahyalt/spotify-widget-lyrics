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
      parseInt(m[1], 10) * 60000 +
      parseInt(m[2], 10) * 1000 +
      parseInt(m[3].padEnd(3, '0'), 10);
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

  const [offsetMs, setOffsetMs] = useState<number>(() => {
    const v = localStorage.getItem('lyricOffsetMs');
    return v ? parseInt(v, 10) || 0 : 0;
  });
  const offsetRef = useRef(offsetMs);
  useEffect(() => {
    offsetRef.current = offsetMs;
    localStorage.setItem('lyricOffsetMs', String(offsetMs));
  }, [offsetMs]);

  const posRef = useRef(0);
  const readAtRef = useRef(0);
  const playingRef = useRef(false);
  const smoothPosRef = useRef<number | null>(null);
  const trackIdRef = useRef('');
  const linesRef = useRef<LyricLine[]>([]);
  const syncedRef = useRef(false);
  const lineElsRef = useRef<(HTMLParagraphElement | null)[]>([]);

  useEffect(() => { linesRef.current = lines; }, [lines]);
  useEffect(() => { syncedRef.current = isSynced; }, [isSynced]);

  const handleMouseDown = async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    try {
      await getCurrentWindow().startDragging();
    } catch (err) {
      console.error('Drag failed:', err);
    }
  };

  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (err) {
      console.error('Minimize failed:', err);
    }
  };

  const handleClose = async () => {
    try {
      await getCurrentWindow().close();
    } catch (err) {
      console.error('Close failed:', err);
    }
  };

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
        smoothPosRef.current = null;
        return;
      }

      posRef.current = state.position_ms;
      readAtRef.current = state.read_at_ms;
      playingRef.current = state.is_playing;

      const id = `${state.artist}::${state.title}`;
      if (id !== trackIdRef.current) {
        trackIdRef.current = id;
        smoothPosRef.current = null;
        setTrack({ title: state.title, artist: state.artist });
        setLines([]);
        setActiveIndex(-1);
        setStatus('Fetching lyrics...');

        invoke<string | null>('fetch_lyrics', { title: state.title, artist: state.artist })
          .then((raw) => {
            if (trackIdRef.current !== id) return;
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
              setLines(raw.split('\n').filter((t) => t.trim()).map((t) => ({ time: -1, text: t })));
              setIsSynced(false);
            }
            setStatus('');
          })
          .catch((err) => {
            console.error('fetch_lyrics error:', err);
            setStatus('Error fetching lyrics');
          });
      }
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const ls = linesRef.current;
      if (syncedRef.current && ls.length > 0) {
        const target =
          (playingRef.current
            ? posRef.current + (Date.now() - readAtRef.current)
            : posRef.current) + offsetRef.current;

        const prev = smoothPosRef.current;
        let cur = target;
        if (prev !== null && target < prev && prev - target <= 2500) {
          cur = prev;
        }
        smoothPosRef.current = cur;

        let idx = -1;
        for (let i = 0; i < ls.length; i++) {
          if (ls[i].time <= cur) idx = i;
          else break;
        }
        setActiveIndex(idx);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (activeIndex >= 0) {
      lineElsRef.current[activeIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex]);

  return (
    <div className="container">
      <div className="drag-region" onMouseDown={handleMouseDown}>
        {/* Window Controls */}
        <div className="window-controls">
          <button className="control-btn minimize" onClick={handleMinimize} title="Minimize">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M0 5h10" stroke="currentColor" strokeWidth="1"/>
            </svg>
          </button>
          <button className="control-btn close" onClick={handleClose} title="Close">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M0 0L10 10M10 0L0 10" stroke="currentColor" strokeWidth="1"/>
            </svg>
          </button>
        </div>

        {track && (
          <div className="track-info">
            <h3>{track.title}</h3>
            <p>{track.artist}</p>
            {isSynced && (
              <div className="offset-controls">
                <button onClick={() => setOffsetMs((o) => o - 500)}>−0.5s</button>
                <span>{(offsetMs / 1000).toFixed(1)}s</span>
                <button onClick={() => setOffsetMs((o) => o + 500)}>+0.5s</button>
              </div>
            )}
          </div>
        )}
        {status && <div className="status">{status}</div>}
      </div>

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