import { useEffect, useMemo, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import useCanvasStore from './native-canvas-port';
import { nativeLibraryReadingReturnCurrent, releaseNativeLibraryReadingReturn, sameNativeLibraryReadingReturn } from './native-library-reading-return';
import type { NativeMaterialViewerParts, NativeMaterialViewerRuntime } from './native-material-viewer-types';

export interface NativeNoteViewRequest { readonly projectId: string; readonly noteId: string; readonly updatedAt: string; readonly title: string }
const eventName = 'lcos-native-open-note';
export function requestNativeNoteView(request: NativeNoteViewRequest): void {
  if (!request || [request.projectId, request.noteId, request.updatedAt].some(value => typeof value !== 'string' || !value.trim()))
    throw new Error('原附注的阅读地址尚未确认。');
  window.dispatchEvent(new CustomEvent(eventName, { detail: request }));
}

/** A Note uses the shipped wa → c2 → vZ/CT text page, without pretending it has
 * an Artifact/Revision/FileRecord. This adapter owns only its current request. */
export function NativeNoteViewerHost({ runtime, parts }: { runtime: NativeMaterialViewerRuntime; parts: NativeMaterialViewerParts }) {
  const session = useMemo(() => createLcosCoreSession(), []), sequence = useRef(0), latestParts = useRef(parts); latestParts.current = parts;
  const projectId = useLcosShellStore(state => state.projectId), canvasId = useCanvasStore(state => state.canvasId), api = useCanvasStore(state => state.rfInstance);
  useEffect(() => {
    let owner: { request: NativeNoteViewRequest; key: number; id: string; controller: AbortController } | undefined;
    const current = (value: NonNullable<typeof owner>) => owner === value && !value.controller.signal.aborted
      && useLcosShellStore.getState().projectId === value.request.projectId && useCanvasStore.getState().canvasId === canvasId
      && useCanvasStore.getState().rfInstance === api && nativeLibraryReadingReturnCurrent(value.request);
    const open = async (request: NativeNoteViewRequest) => {
      if (request.projectId !== projectId || !canvasId || !api) return;
      if (owner) { owner.controller.abort(); if(!sameNativeLibraryReadingReturn(owner.request,request))releaseNativeLibraryReadingReturn(owner.request, false); }
      const value = { request, key: --sequence.current, id: `lcos-note:${request.noteId}`, controller: new AbortController() }; owner = value;
      const Button = latestParts.current.ActionButton, Bar = latestParts.current.ActionBar;
      const back = <Button label="返回库内预览" tooltipsEnabled onClick={() => { if (current(value)) runtime.close(value.id); }}><ArrowLeft size={20} /></Button>;
      const show = (markdown: string, failed = false, loading = false) => {
        if (!current(value)) return;
        runtime.open({ id: value.id, media: { type: 'text', title: request.title, markdown }, actions: {},
          lcosControlled: { requestKey: value.key, libraryPreviewReturn: true, hideCopy: failed||loading,
            ...(failed||loading ? { bodySlot: <div className="native-material-state" role={failed?'alert':'status'} data-native-note-error={failed||undefined} data-native-note-loading={loading||undefined}><p>{markdown}</p>
              {failed&&<button onClick={() => { if (current(value)) void open(request); }}>重新读取同一附注</button>}</div> } : {}),
            textActionsSlot: <Bar>{back}</Bar>, actionsSlot: <Bar>{back}</Bar>,
            factsSlot: <div className="native-material-viewer-facts"><strong>{request.title}</strong><p>附注</p></div> } });
        requestAnimationFrame(()=>{
          if(!current(value)||runtime.getState().session?.lcosControlled?.requestKey!==value.key)return;
          // Retry removes its focused error button inside the same original
          // c2. Return focus to that existing Viewer, never the background.
          const focused=document.activeElement;
          if(focused===document.body||!focused?.isConnected)document.querySelector<HTMLElement>('[data-media-viewer]')?.focus({preventScroll:true});
        });
      };
      show('正在读取附注…',false,true);
      try {
        const graph = await session.projects.getProjectGraph(request.projectId);
        if (!current(value)) return;
        const notes = graph?.project.id === request.projectId ? graph.notes.filter(note => String(note.id) === request.noteId && String(note.projectId) === request.projectId) : [];
        if (notes.length !== 1 || typeof notes[0].body !== 'string') throw new Error('原附注暂时无法读取，返回位置保留。');
        if (notes[0].updatedAt !== request.updatedAt) throw new Error('这份附注已更新，请返回后重新打开；未替换成其他内容。');
        show(notes[0].body);
      } catch (error) { if (current(value)) show(error instanceof Error ? error.message : '原附注暂时无法读取。', true); }
    };
    const listener = (event: Event) => { void open((event as CustomEvent<NativeNoteViewRequest>).detail); };
    window.addEventListener(eventName, listener);
    const release = runtime.subscribe(state => {
      const value = owner;
      if (!value || state.session?.lcosControlled?.requestKey === value.key) return;
      value.controller.abort(); owner = undefined; releaseNativeLibraryReadingReturn(value.request, !state.session);
    });
    return () => { window.removeEventListener(eventName, listener); release();
      if (owner) { owner.controller.abort(); releaseNativeLibraryReadingReturn(owner.request, false); runtime.close(owner.id); owner = undefined; } };
  // The original Canvas passes a fresh wrapper for the same shipped parts on
  // rerender. Presentation props changing must not cancel a live Note read;
  // the actual runtime/project/Canvas/API owner still tears it down normally.
  }, [runtime, session, projectId, canvasId, api]);
  return null;
}
