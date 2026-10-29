// THIN_ADAPT native VideoPreview: the same native controls and real source,
// without its second card shell. No playback clock or generated poster.
import { Film } from 'lucide-react';
import { useState } from 'react';
import type { SourceMorphologyProps } from './sourceTypes';
import '../../ui/source/source-presentation.css';

function VideoSource(props: SourceMorphologyProps): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mark = props.density === 'mark';
  return <div className="lcos-source-view lcos-source-video" data-lcos-source-visual="video" data-density={props.density}>
    <div className="lcos-video-media">
      {!props.mediaSrc ? <span role="status">暂无视频来源</span> : failed ? <div role="status" className="lcos-source-media-error">
        <span>视频读取失败</span><button type="button" className="nodrag nopan"
          onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); setFailed(false); setAttempt((value) => value + 1); }}>重试</button>
      </div> : mark ? <Film size={28} aria-label={`视频 · ${props.title}`} /> : <video key={attempt}
        data-lcos-video-player src={props.mediaSrc} controls preload="metadata" playsInline
        aria-label={props.title} className="nodrag nopan"
        onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()} onError={() => setFailed(true)}><track kind="captions" /></video>}
    </div>
    {!mark && <span className="lcos-source-caption">{props.title}</span>}
  </div>;
}
export function VideoSourceMorphology(props: SourceMorphologyProps): React.JSX.Element {
  return <VideoSource key={props.mediaSrc ?? 'unavailable'} {...props} />;
}
