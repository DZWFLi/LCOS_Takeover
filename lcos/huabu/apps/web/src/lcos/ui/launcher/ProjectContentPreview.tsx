import { Folder } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { resolveArtifactUrl } from '@/api/artifact';
import { useSpacePreviewScene } from '@/store/spacePreviewSceneCache';

import type { CoreProjectClient } from '@local-creative-os/web-gen2';

export function ProjectContentPreview({ client, projectId, name }: {
  readonly client: CoreProjectClient; readonly projectId: string; readonly name: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [canvasId, setCanvasId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { scene, error } = useSpacePreviewScene(canvasId ?? '', visible && canvasId !== null);
  const source = scene?.nodes.find((node) => node.imageSrc)?.imageSrc;
  useEffect(() => {
    if (!host.current) return;
    if (typeof IntersectionObserver !== 'function') { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '160px' });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    setCanvasId(null); setFailed(false);
    void client.getWorkspaces(projectId, controller.signal).then((workspaces) => {
      if (controller.signal.aborted) return;
      // Only a canonical Main workspace can supply this project preview.
      const main = workspaces.find((workspace) => workspace.preferredSurface === 'main' && workspace.canvasId);
      setCanvasId(main?.canvasId ?? null);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [visible, client, projectId]);
  return <div ref={host} className="lcos-project-cover">
    {source && canvasId && !failed ? <img src={resolveArtifactUrl(source, canvasId)}
      alt={name + ' · 项目内容预览'} loading="lazy" onError={() => setFailed(true)} />
      : <div className="lcos-project-cover-empty"><Folder size={42} strokeWidth={1.1} aria-hidden />
        <span>{failed || error ? '预览暂不可用' : '项目现场'}</span></div>}
  </div>;
}
