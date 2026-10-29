import { Pause, Play } from 'lucide-react';

import { SourceFeedbackSlot } from './SourceFeedbackSlot';
import { FIGMA_AUDIO_USED_WIDTH, FIGMA_SOURCE_NODE_IDS } from '../../nodes/source/sourceFigmaGeometry';

import './source-presentation.css';
import '../professional/tapnow-media-controls.css';
import { tapnowFormatMediaTime } from '../professional/donor/TapnowPresentationParts';
import type { SourceVisualProps } from './sourceViewTypes';
import type { JSX, ReactNode } from 'react';

export function AudioSourceView(props: SourceVisualProps & {
  readonly durationText?: string | undefined;
  readonly mediaMetadata?: ReactNode;
  readonly waveform?: readonly number[] | undefined;
  readonly playback?: {
    readonly playing: boolean; readonly currentTime: number; readonly duration: number;
    readonly error?: string | undefined; readonly onToggle: () => void;
    readonly onSeek: (seconds: number) => void; readonly onRetry: () => void;
  };
}): JSX.Element {
  const playback = props.playback;
  // Keep waveform + real controls + caption inside the unchanged host geometry.
  const zoom = props.zoom && Number.isFinite(props.zoom) && props.zoom > 0 ? props.zoom : 1;
  const hostHeight = props.worldHeight && Number.isFinite(props.worldHeight) && props.worldHeight > 0 ? props.worldHeight : 96;
  const waveHeight = props.density === 'reading' ? 80 : Math.max(0, Math.min(50, hostHeight - 28 - 3 - Math.max(19, 16 / Math.max(.1, zoom))));
  const progress = playback && playback.duration > 0 ? playback.currentTime / playback.duration : 0;
  return <div className="lcos-source-view lcos-source-audio" data-lcos-source-visual="audio"
    data-figma-node-id={FIGMA_SOURCE_NODE_IDS.audio} data-density={props.density} data-ui-interaction={props.interaction}>
    {props.density !== 'mark' && <div data-lcos-waveform={props.waveform ? 'decoded' : undefined}
      data-waveform-source={props.waveform ? 'audio-bytes' : undefined}
      aria-hidden="true" className="lcos-audio-wave" style={{ width: FIGMA_AUDIO_USED_WIDTH, height: waveHeight, overflow: 'hidden', columnGap: .671875 }}>
      {props.waveform?.map((peak, index) => <span key={index} data-lcos-wave-bar
        data-wave-tone={index / props.waveform!.length < progress ? 'leading' : 'trailing'}
        style={{ height: `${Math.max(1, peak * waveHeight)}px` }} />)}
    </div>}
    {props.mediaMetadata}
    {props.density === 'reading' && !props.waveform && <span role="status" className="lcos-audio-wave-status">波形未就绪</span>}
    <div className="lcos-audio-controls nodrag nopan" role="group" aria-label={`${props.title} 音频控制`} onPointerDown={(event) => event.stopPropagation()}
      >
      <button type="button" onDoubleClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} aria-label={`${playback?.playing ? '暂停' : '播放'} ${props.title}`}
        disabled={!props.mediaSrc} onClick={(event) => { event.stopPropagation(); playback?.onToggle(); }}>
        {playback?.playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
      </button>
      {props.density !== 'mark' && <input type="range" onDoubleClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} aria-label={`${props.title} 播放进度`}
        min={0} max={playback?.duration || 0} step={.1} value={playback?.currentTime || 0}
        disabled={!playback || playback.duration <= 0}
        onChange={(event) => playback?.onSeek(Number(event.target.value))} />}
      {props.density === 'reading' && <output className="lcos-audio-reading-time">{tapnowFormatMediaTime(playback?.currentTime ?? 0)} / {playback && playback.duration > 0 ? tapnowFormatMediaTime(playback.duration) : '—'}</output>}
    </div>
    {props.density !== 'mark' && <span className="lcos-source-caption">{props.title}{props.durationText ? ` · ${props.durationText}` : ''}</span>}
    {playback?.error && <div className="lcos-audio-error" role="status">{playback.error}
      <button type="button" className="nodrag nopan" onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); playback.onRetry(); }}>重试</button></div>}
    <SourceFeedbackSlot feedback={props.feedback} />
  </div>;
}
