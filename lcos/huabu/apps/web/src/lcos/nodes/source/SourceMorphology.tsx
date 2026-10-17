import { resolveVisualFamily } from '@local-creative-os/web-gen2';
import { FileOutput, FileQuestion, FileText, Film, Link2, MessageCircle, Play, Puzzle } from 'lucide-react';

import { AudioSourceMorphology } from './AudioSourceMorphology';
import { DocumentSourceMorphology } from './DocumentSourceMorphology';
import { ImageSourceMorphology } from './ImageSourceMorphology';
import { TextSourceMorphology } from './TextSourceMorphology';
import { WebSourceMorphology } from './WebSourceMorphology';
import { VideoSourceMorphology } from './VideoSourceMorphology';
import { lcosTokens } from '../../ui/lcosTokens';

import type { SourceMorphologyProps } from './sourceTypes';
import type { JSX } from 'react';

/** User-facing identity for families that do not have a dedicated media body yet.
 * Keep technical resolver keys in data attributes only; never surface them as copy. */
const GENERIC_FAMILY_IDENTITY = {
  conversation: { label: '对话', Icon: MessageCircle },
  skill: { label: '技能', Icon: Puzzle },
  run: { label: '运行', Icon: Play },
  output: { label: '运行结果', Icon: FileOutput },
  unknown: { label: '来源', Icon: FileQuestion },
} as const;

function GenericSourceMorphology(props: SourceMorphologyProps): JSX.Element {
  const identity = GENERIC_FAMILY_IDENTITY[props.family as keyof typeof GENERIC_FAMILY_IDENTITY];
  const Icon = identity?.Icon ?? (props.family === 'web' ? Link2 : props.family === 'video' ? Film : FileText);
  const label = identity?.label ?? (props.family === 'web' ? '网页' : props.family === 'video' ? '视频' : '文件');
  const markOnly = props.density === 'mark';
  const safeZoom = props.zoom !== undefined && Number.isFinite(props.zoom) && props.zoom > 0
    ? Math.max(0.1, props.zoom) : 1;
  const showPreview = props.density === 'working' || props.density === 'reading';
  return (
    <div
      data-lcos-source-visual={props.family}
      data-density={props.density}
      data-lcos-generic-source-family={props.family}
      role="group"
      aria-label={`${label}：${props.title}`}
      title={`${label} · ${props.title}`}
      className="lcos-generic-source flex h-full w-full flex-col gap-2 rounded-xl p-3"
      style={markOnly ? undefined : {
        background: lcosTokens.color.surface,
        border: `1px solid ${lcosTokens.color.borderSubtle}`,
      }}
    >
      {markOnly ? (
        <Icon className="lcos-generic-source-mark h-4 w-4"
          style={{ transform: `scale(${1 / safeZoom})`, transformOrigin: 'center' }} aria-hidden />
      ) : (
        <>
          <div className="flex items-center gap-2" style={{ color: lcosTokens.color.muted }}>
            <Icon className="h-4 w-4" aria-hidden />
            <span className="text-[10px] tracking-[0.04em]">{label}</span>
          </div>
          <span data-lcos-generic-source-title className="line-clamp-2 text-sm font-semibold"
            style={{ color: lcosTokens.color.text }}>
            {props.title}
          </span>
          {showPreview && props.preview && (
            <span data-lcos-node-preview className="line-clamp-3 text-[11px]"
              style={{ color: lcosTokens.color.muted }}>
              {props.preview}
            </span>
          )}
        </>
      )}
    </div>
  );
}

export function SourceMorphology(props: SourceMorphologyProps): JSX.Element {
  // `output` is a provenance/ownership family, not a media format. If its
  // authoritative artifact metadata identifies a real payload, reuse that
  // existing body; leave unknown outputs on the honest generic fallback.
  const payloadFamily = props.family === 'output'
    ? resolveVisualFamily({ entityType: 'artifact', artifactKind: props.artifactKind, mimeType: props.mimeType })
    : props.family;
  const family = payloadFamily === 'unknown' ? props.family : payloadFamily;
  const morphologyProps = family === props.family ? props : { ...props, family };

  switch (family) {
    case 'text':
      return <TextSourceMorphology {...morphologyProps} />;
    case 'document':
      return <DocumentSourceMorphology {...morphologyProps} />;
    case 'image':
      return <ImageSourceMorphology {...morphologyProps} />;
    case 'audio':
      return <AudioSourceMorphology {...morphologyProps} />;
    case 'web':
      return <WebSourceMorphology {...morphologyProps} />;
    case 'video':
      return <VideoSourceMorphology {...morphologyProps} />;
    default:
      return <GenericSourceMorphology {...morphologyProps} />;
  }
}
