// THIN_ADAPT Huabu AudioNode: native audio play/pause/timeupdate + seek.
// Recording and its spatial owner stay in AudioNode. No seeded/pseudo waveform.
import { useEffect, useRef, useState } from 'react';

import { useDeferredHydration } from '@/components/Nodes/shared/nodeHydrationScheduler';

import { AudioSourceView } from '../../ui/source/AudioSourceView';

import type { SourceMorphologyProps } from './sourceTypes';
import type { JSX } from 'react';

export function sampleAudioPeaks(samples: Float32Array, count = 64): readonly number[] {
  if (samples.length === 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * samples.length / count);
    const end = Math.max(start + 1, Math.floor((index + 1) * samples.length / count));
    let peak = 0;
    for (let offset = start; offset < Math.min(end, samples.length); offset += 1) peak = Math.max(peak, Math.abs(samples[offset]!));
    return Math.min(1, peak);
  });
}
function formatDuration(seconds: number | undefined): string | undefined {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return undefined;
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60).toString().padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`;
}
function AudioPlayer(props: SourceMorphologyProps): JSX.Element {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [peaks, setPeaks] = useState<readonly number[] | undefined>();
  const showWaveform = props.density !== 'mark';
  const hydrated = useDeferredHydration(!showWaveform || !props.mediaSrc);
  useEffect(() => {
    if (!props.mediaSrc || !showWaveform || !hydrated || peaks !== undefined || typeof AudioContext === 'undefined') return;
    const controller = new AbortController();
    let active = true;
    let context: AudioContext | undefined;
    void (async () => {
      try {
        const response = await fetch(props.mediaSrc!, { signal: controller.signal });
        if (!response.ok) return;
        const bytes = await response.arrayBuffer();
        if (!active) return;
        context = new AudioContext();
        const decoded = await context.decodeAudioData(bytes);
        if (active) setPeaks(sampleAudioPeaks(decoded.getChannelData(0)));
      } catch {
        // A waveform is optional. Playback still uses the original native media element.
      } finally { if (context && context.state !== 'closed') void context.close(); }
    })();
    return () => { active = false; controller.abort(); };
  }, [props.mediaSrc, showWaveform, hydrated, peaks]);
  const readMetadata = (): void => {
    const value = audio.current?.duration;
    if (value !== undefined && Number.isFinite(value) && value > 0) setDuration(value);
  };
  const toggle = (): void => {
    const element = audio.current;
    if (!element || !props.mediaSrc) return;
    setError(undefined);
    if (element.paused) void element.play().catch(() => setError('音频暂时无法播放，请重试'));
    else element.pause();
  };
  return <AudioSourceView {...props}
    durationText={formatDuration(duration || props.durationSec)}
    waveform={peaks}
    playback={{ playing, currentTime, duration, error, onToggle: toggle,
      onSeek: (next) => { if (audio.current && duration > 0) { audio.current.currentTime = Math.min(duration, Math.max(0, next)); setCurrentTime(audio.current.currentTime); } },
      onRetry: () => { setError(undefined); audio.current?.load(); },
    }}
    mediaMetadata={props.mediaSrc && <audio key={props.mediaSrc} ref={audio} data-lcos-audio-player
      src={props.mediaSrc} preload={props.density === 'mark' ? 'none' : 'metadata'} className="hidden"
      onLoadedMetadata={readMetadata} onDurationChange={readMetadata}
      onTimeUpdate={() => { readMetadata(); setCurrentTime(audio.current?.currentTime ?? 0); }}
      onPlay={() => { readMetadata(); setPlaying(true); }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onError={() => { setPlaying(false); setError('音频读取失败'); }}><track kind="captions" /></audio>} />;
}
export function AudioSourceMorphology(props: SourceMorphologyProps): JSX.Element {
  return <AudioPlayer key={props.mediaSrc ?? 'unavailable'} {...props} />;
}
