// Same preview endpoint and staggered hydration as Huabu WebNode. No live iframe.
import { ExternalLink, Globe2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getWebPreview, type WebPreviewResponse } from '@/api/web';
import { useDeferredHydration } from '@/components/Nodes/shared/nodeHydrationScheduler';
import useCanvasStore from '@/store/canvasStore';

import { PreviewMedia } from '../../ui/spatial/PreviewMedia';

import type { SourceMorphologyProps } from './sourceTypes';
import '../../ui/source/source-presentation.css';

function WebSource(props: SourceMorphologyProps): React.JSX.Element {
  const canvasId = useCanvasStore((state) => state.canvasId);
  const pending = useCanvasStore((state) => props.nodeId ? state.ingestionByNodeId[props.nodeId]?.status === 'pending' : false);
  const mark = props.density === 'mark';
  const hydrated = useDeferredHydration(mark);
  const [preview, setPreview] = useState<WebPreviewResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (props.webPreviewAvailable === false || !props.mediaSrc || !props.nodeId || !canvasId || mark || !hydrated || pending) return;
    let active = true;
    setStatus('loading');
    void getWebPreview({ canvasId, nodeId: props.nodeId }).then((result) => {
      if (active) { setPreview(result); setStatus('ready'); }
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [props.mediaSrc, props.nodeId, props.webPreviewAvailable, canvasId, mark, hydrated, pending, attempt]);
  const realUrl = preview?.url || props.mediaSrc || '';
  const external = /^https?:\/\//i.test(realUrl) ? realUrl : undefined;
  let domain = '';
  if (external) { try { domain = new URL(external).hostname; } catch { /* A bad URL is not an external navigation target. */ } }
  const title = preview?.label || props.title;
  return <div className="lcos-source-view lcos-source-web" data-lcos-source-visual="web" data-density={props.density} aria-busy={status === 'loading' || undefined}>
    {!mark && preview?.image && <div className="lcos-web-preview"><PreviewMedia src={preview.image} label={title} fit="contain" /></div>}
    <div className="lcos-web-identity"><Globe2 size={16} aria-hidden /><span>{title}</span>
      {external && <a href={external} target="_blank" rel="noopener noreferrer" className="nodrag nopan"
        aria-label={`打开原网页 · ${title}`} onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}><ExternalLink size={13} /></a>}
    </div>
    {!mark && <span className="lcos-web-domain">{preview?.siteName || domain || (props.mediaSrc ? '网页材料' : '暂无网页来源')}</span>}
    {!mark && props.webPreviewAvailable === false && <span className="lcos-web-domain">链接已保存，可打开原网页</span>}
    {(props.density === 'working' || props.density === 'reading') && (preview?.summary || props.preview) &&
      <p className="lcos-web-summary">{preview?.summary || props.preview}</p>}
    {!mark && status === 'error' && <div className="lcos-source-media-error" role="status">网页预览读取失败
      <button type="button" className="nodrag nopan" onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setAttempt((value) => value + 1); }}>重试</button></div>}
  </div>;
}
export function WebSourceMorphology(props: SourceMorphologyProps): React.JSX.Element {
  return <WebSource key={`${props.nodeId ?? ''}:${props.mediaSrc ?? ''}`} {...props} />;
}
