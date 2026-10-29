// User-provided TapNow Y$/UCe/FCe presentation, wired to one native video element.
// No TapNow CDN/client/session or BCe's empty quality switch is imported.
import { useEffect, useRef, useState } from 'react';
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useCloseOnEscape } from '@/hooks/useCloseOnEscape';
import { useContext } from 'react';
import { ReaderVisibilityContext } from '../../professional/ReaderVisibilityContext';
import { tapnowFormatMediaTime } from './donor/TapnowPresentationParts';
import './tapnow-media-controls.css';

export function VideoReaderContentView({ src, title }: { readonly src: string; readonly title: string }): React.JSX.Element {
  const video = useRef<HTMLVideoElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const visible = useContext(ReaderVisibilityContext);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [fullscreenError, setFullscreenError] = useState<string>();
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === stage.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  useEffect(() => { if (!visible) video.current?.pause(); }, [visible]);
  useCloseOnEscape(fullscreen, () => { void document.exitFullscreen(); });
  const toggle = () => {
    const element = video.current;
    if (!element || !ready) return;
    if (!element.paused) element.pause();
    else void element.play().catch(() => setError('视频暂时无法播放，请重试。'));
  };
  const toggleFullscreen = async () => {
    try {
      setFullscreenError(undefined);
      if (document.fullscreenElement === stage.current) await document.exitFullscreen();
      else await stage.current?.requestFullscreen();
    } catch { setFullscreenError('当前窗口暂时无法进入全屏，可继续在窗口中播放。'); }
  };
  const readMetadata = () => {
    const value = video.current?.duration;
    if (value !== undefined && Number.isFinite(value) && value > 0) setDuration(value);
  };
  return <div ref={stage} className="lcos-reader-video-stage" data-lcos-video-reader tabIndex={0}
    role="group" aria-label={`${title} 视频查看`} onKeyDown={event => {
      if (event.target === event.currentTarget && event.key === ' ') { event.preventDefault(); toggle(); }
    }}>
    <video ref={video} key={src} src={src} preload="metadata" playsInline aria-label={title}
      onLoadedMetadata={readMetadata} onDurationChange={readMetadata} onCanPlay={() => { setReady(true); setError(undefined); }}
      onTimeUpdate={() => setCurrentTime(video.current?.currentTime ?? 0)}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onVolumeChange={() => { setVolume(video.current?.volume ?? 1); setMuted(video.current?.muted ?? false); }}
      onError={() => { setPlaying(false); setReady(false); setError('视频读取失败。'); }}>
      <track kind="captions" />
    </video>
    {!ready && !error && <span className="lcos-media-message" role="status">正在读取视频…</span>}
    {fullscreenError && <span className="lcos-video-fullscreen-error" role="status">{fullscreenError}</span>}
    {error && <div className="lcos-media-message" role="status"><span>{error}</span>
      <button type="button" onClick={() => { setError(undefined); setReady(false); video.current?.load(); }}>重试播放</button></div>}
    <div className="lcos-video-controls" role="toolbar" aria-label="视频查看工具">
      <button type="button" disabled={!ready} aria-label={playing ? '暂停视频' : '播放视频'} onClick={toggle} className="lcos-video-play"><span>{playing ? <Pause size={24} /> : <Play size={24} />}</span></button>
      <input type="range" min={0} max={duration || 0} step={.1} value={Math.min(currentTime, duration || 0)} disabled={duration <= 0}
        aria-label="视频播放进度" onChange={event => { if (video.current) video.current.currentTime = Number(event.target.value); }} />
      <output className="lcos-video-time">{tapnowFormatMediaTime(currentTime)} / {duration > 0 ? tapnowFormatMediaTime(duration) : '—'}</output>
      <div className="lcos-video-volume" onMouseEnter={() => setVolumeOpen(true)} onMouseLeave={() => setVolumeOpen(false)}
        onFocus={() => setVolumeOpen(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setVolumeOpen(false); }}>
        {volumeOpen && <div className="lcos-video-volume-popup"><output>{Math.round((muted ? 0 : volume) * 100)}</output>
          <input type="range" min={0} max={1} step={.01} aria-label="视频音量" value={muted ? 0 : volume} onChange={event => {
            if (video.current) { video.current.muted = false; video.current.volume = Number(event.target.value); }
          }} /></div>}
        <button type="button" aria-label={muted ? '取消视频静音' : '视频静音'} aria-pressed={muted} aria-expanded={volumeOpen}
          onClick={() => { if (video.current) video.current.muted = !video.current.muted; }}>
          {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
      </div>
      <button type="button" aria-label={fullscreen ? '退出视频全屏' : '全屏查看视频'} onClick={() => void toggleFullscreen()}>
        {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}</button>
    </div>
  </div>;
}
