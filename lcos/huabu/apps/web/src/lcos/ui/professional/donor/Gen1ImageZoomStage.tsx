// G1 artifactViewerRegistry.tsx ImageZoomStage, adapted to the existing Reader.
// Media-local zoom/pan, never Canvas camera. The mounted controller is also
// exercised by the pointer/resize/visibility browser regression fixture.
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Expand, Minimize, Maximize, Minus, Plus } from 'lucide-react';
import { ReaderVisibilityContext } from '../../../professional/ReaderVisibilityContext';
import { mountReaderImageInteraction, type ReaderImageSnapshot } from './readerImageInteraction';
import { LcosButton } from '../../primitives/LcosButton';
import './gen1-reader.css';
import { TapnowMediaBackdrop } from './TapnowPresentationParts';

export function Gen1ImageZoomStage({ src, alt, onRetry }: { src: string; alt: string; onRetry?: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const transformRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<ReturnType<typeof mountReaderImageInteraction> | undefined>(undefined);
  const lastView = useRef<ReaderImageSnapshot | undefined>(undefined);
  const visible = useContext(ReaderVisibilityContext);
  const [snapshot, setSnapshot] = useState<ReaderImageSnapshot>({ scale: 1, pan: { x: 0, y: 0 }, size: { x: 0, y: 0 }, mode: 'fit' });
  const [imageError, setImageError] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string>();
  useEffect(() => {
    const changed = () => { setFullscreen(document.fullscreenElement === stageRef.current); controllerRef.current?.reflow(); };
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  const toggleFullscreen = async () => {
    try {
      setFullscreenError(undefined);
      if (document.fullscreenElement === stageRef.current) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch { setFullscreenError('当前窗口不支持全屏，可使用缩放和拖拽查看。'); }
  };
  useLayoutEffect(() => {
    const stage = stageRef.current, image = imageRef.current, transform = transformRef.current;
    if (!stage || !image || !transform) return;
    setImageError(false);
    const controller = mountReaderImageInteraction({ stage, image, transform,
      ...(lastView.current === undefined ? {} : { initial: lastView.current }),
      onChange: (view) => { lastView.current = view; setSnapshot(view); }, onError: setImageError,
    });
    controllerRef.current = controller;
    return () => { controller.dispose(); controllerRef.current = undefined; };
  }, [src]);
  useLayoutEffect(() => { controllerRef.current?.setVisible(visible); }, [visible, src]);
  return <div ref={stageRef} className="lcos-image-zoom-stage" data-donor-image-zoom tabIndex={0}
    role="group" aria-label={`${alt}，图片预览；加减键缩放，0 原始大小`}
    >
    <div aria-hidden="true" style={{ position:'absolute', inset:0, pointerEvents:'none' }}><TapnowMediaBackdrop /></div>
    <div ref={transformRef} className="lcos-image-zoom-pan">
      <img ref={imageRef} src={src} alt={alt} draggable={false} onDragStart={(event) => event.preventDefault()} />
    </div>
    {imageError && <div role="status" className="lcos-image-zoom-error"><span>图像无法显示；材料身份仍保留。</span>
      {onRetry && <LcosButton type="button" onClick={onRetry}>重读同一版本</LcosButton>}</div>}
    {fullscreenError && <span role="status" className="lcos-image-fullscreen-error">{fullscreenError}</span>}
    <div className="lcos-image-zoom-toolbar" role="toolbar" aria-label="图片查看工具">
      <LcosButton disabled={imageError} type="button" aria-label="缩小图片" onClick={() => controllerRef.current?.zoomBy(1 / 1.25)}><Minus size={16} /></LcosButton>
      <span data-reader-image-zoom-value>{Math.round(snapshot.scale * 100)}%</span>
      <LcosButton disabled={imageError} type="button" aria-label="放大图片" onClick={() => controllerRef.current?.zoomBy(1.25)}><Plus size={16} /></LcosButton>
      <LcosButton disabled={imageError} type="button" aria-label="图片原始大小" onClick={() => controllerRef.current?.reset()}>100%</LcosButton>
      <LcosButton disabled={imageError} type="button" aria-label="图片适应窗口" aria-pressed={snapshot.mode === 'fit'} onClick={() => controllerRef.current?.fit()}><Maximize size={16} /></LcosButton>
      <LcosButton type="button" aria-label={fullscreen ? '退出图片全屏' : '全屏查看图片'} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize size={16} /> : <Expand size={16} />}</LcosButton>
    </div>
  </div>;
}
