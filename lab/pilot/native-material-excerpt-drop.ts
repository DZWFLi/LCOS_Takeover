import { useEffect, useMemo } from 'react';
import { LCOS_MATERIAL_TRANSFER_MIME, parseMaterialTransfer, type MaterialTransferPayloadV1 } from '../../lcos/huabu/apps/web/src/lcos/ui/professional/donor/Gen1TextTransfer';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { useLcosDropStore } from '../../lcos/huabu/apps/web/src/lcos/lcosDropState';
import nativeCanvasStore from './native-canvas-port';
import { nativeCarryReference } from './native-node-carry';
import { normalizeNativeTextLocator } from './native-text-location';
import { claimNativeReaderExcerptDrop, reportNativeReaderExcerptDrop, type NativeReaderExcerptDropResult } from './native-reader-excerpt-drag';

export const nativeMaterialExcerptField = 'lcos_material_excerpt';
type Point = { x: number; y: number };
type Event = Pick<DragEvent, 'target' | 'clientX' | 'clientY' | 'dataTransfer' | 'defaultPrevented' | 'preventDefault' | 'stopPropagation'>;
interface World { projectId: string; canvasId: string; workspaceId: string; api: any; wrapper: Element }
interface AcceptedCreateReceipt { nodeId: string; lcos_ref: unknown }
interface Notice { error(message: string): unknown; success?(message: string): unknown }
export interface NativeMaterialExcerptDropPorts {
  world(): World | null;
  semanticStatus(): string;
  hit(point: Point): Element | null;
  acceptedReceipt?(input: { projectId: string; canvasId: string; clientNodeId: string; api: any }): AcceptedCreateReceipt | undefined;
  claim?(payload: MaterialTransferPayloadV1): boolean;
  report?(payload: MaterialTransferPayloadV1, result: NativeReaderExcerptDropResult): unknown;
}
export interface NativeMaterialExcerptCreatePorts {
  factory(data: Record<string, unknown>, overrides: { position: Point }): any;
  addNodes(nodes: any[]): unknown;
  screenToFlowPosition(point: Point): Point;
  allowedCreateTypes?: readonly string[];
  notice: Notice;
}
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const ownMime = (event: Event) => Array.from(event.dataTransfer?.types ?? []).includes(LCOS_MATERIAL_TRANSFER_MIME);
const sameWorld = (a: World, b: World | null) => !!b && a.projectId === b.projectId && a.canvasId === b.canvasId
  && a.workspaceId === b.workspaceId && a.api === b.api && a.wrapper === b.wrapper;
const canCreateText = (types: readonly string[] | undefined) => types === undefined || Array.isArray(types) && types.includes('TEXT');
const consume = (event: Event) => { event.preventDefault(); event.stopPropagation(); };

/** The same exact-source MIME as Reader/Composer. This is creation input only,
 * never a saved lcos_ref, a parent-material placement or another producer. */
export function readNativeMaterialExcerpt(raw: string, projectId: string) {
  const payload = parseMaterialTransfer(raw);
  if (!payload || payload.content.kind !== 'text') throw Error('这份摘录不是可读取的文字，原文保留。');
  const source = payload.source;
  if (source.projectId !== projectId || ![source.artifactId, source.revisionId, source.fileRecordId].every(text)
    || source.viewId !== undefined && !text(source.viewId) || !text(payload.capturedAt))
    throw Error('摘录的项目或准确版本不完整，未创建替代材料。');
  const locator = normalizeNativeTextLocator(source.locator);
  if (source.locator !== undefined && !locator) throw Error('摘录位置无法识别，原文保留。');
  if (locator && 'locations' in locator && !locator.selected)
    throw Error('这份引用有多个位置，请先选定一处正文再拖动。');
  const selected = locator && 'locations' in locator ? locator.selected : locator;
  if (selected && 'textRange' in selected && selected.textRange.quote !== payload.content.text)
    throw Error('摘录正文与所选位置不一致，未创建材料。');
  return { payload: JSON.parse(JSON.stringify(payload)) as MaterialTransferPayloadV1,
    body: payload.content.text, title: `${source.title} · ${locator?.label ?? '摘录'}`.slice(0, 200) };
}

/** One mounted c7 owner, one native factory/addNodes call per accepted event.
 * Persistence, receipts, unknown outcomes and retry remain in original O8/r6. */
export function createNativeMaterialExcerptDropOwner(canvasId: string, port: NativeMaterialExcerptDropPorts) {
  let active = false, generation = 0, excerptHint = false;
  const waits = new Set<() => void>();
  const available = () => {
    const world = port.world(), interaction = world?.api.getPointerInteraction?.();
    return active && world?.canvasId === canvasId && world.wrapper.isConnected
      && interaction?.interactivityLocked === false && interaction.explicitToolActive === false ? world : null;
  };
  const blank = (event: Event, world: World) => {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return false;
    const target = event.target as Element | null, hit = port.hit({ x: event.clientX, y: event.clientY });
    return !!target && world.wrapper.contains(target) && !!hit && world.wrapper.contains(hit)
      && hit.closest('.react-flow__pane') !== null && target.closest?.('.react-flow__pane') === hit.closest('.react-flow__pane')
      && !hit.closest('.react-flow__node,.react-flow__edge,.react-flow__controls,.react-flow__minimap,[data-library-panel],[data-lcos-native-chat-frame],[data-media-viewer],button,input,textarea,[contenteditable]:not([contenteditable="false"]),[role="dialog"]');
  };
  const idle = () => ['idle', 'failed'].includes(port.semanticStatus());
  return {
    activate() { active = true; generation++; }, dispose() { active = false; generation++; excerptHint = false; for (const cancel of waits) cancel(); },
    has: ownMime,
    label: () => excerptHint ? '松开放置摘录' : undefined,
    over(event: Event, allowedCreateTypes?: readonly string[]): boolean | undefined {
      if (!ownMime(event)) { excerptHint = false; return undefined; }
      const world = available(), accepted = !!world && idle() && canCreateText(allowedCreateTypes) && blank(event, world);
      excerptHint = accepted;
      event.preventDefault(); // Do not allow its plain-text fallback on a blocked Canvas.
      if (idle()) event.stopPropagation(); // An existing semantic gesture keeps priority.
      if (event.dataTransfer) event.dataTransfer.dropEffect = accepted ? 'copy' : 'none';
      return accepted;
    },
    async drop(event: Event, create: NativeMaterialExcerptCreatePorts) {
      if (!ownMime(event)) return { claimed: false as const };
      if (event.defaultPrevented) return { claimed: true as const, status: 'owned' as const };
      if (!idle()) { event.preventDefault(); return { claimed: true as const, status: 'owned' as const }; }
      consume(event);
      const world = available();
      let readerPayload: MaterialTransferPayloadV1 | undefined;
      const finish = <T extends { claimed: true; status: NativeReaderExcerptDropResult }>(result: T): T => {
        if (readerPayload) port.report?.(readerPayload, result.status); return result;
      };
      const reject = (message: string) => { if (active) create.notice.error(message); return finish({ claimed: true as const, status: 'rejected' as const }); };
      if (!world || !canCreateText(create.allowedCreateTypes) || !blank(event, world)
        || typeof world.api.flushCanvas !== 'function')
        return reject('请把摘录放到当前可编辑画布的空白处，原文保留。');
      const capturedGeneration = generation;
      const current = () => active && generation === capturedGeneration && sameWorld(world, port.world());
      let excerpt: ReturnType<typeof readNativeMaterialExcerpt>, point: Point;
      try {
        excerpt = readNativeMaterialExcerpt(event.dataTransfer?.getData(LCOS_MATERIAL_TRANSFER_MIME) ?? '', world.projectId);
        point = create.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) throw Error('释放位置尚未确认，原文保留。');
      } catch (error) { return reject(error instanceof Error ? error.message : '这份摘录暂时无法读取，原文保留。'); }
      if (!current()) return { claimed: true as const, status: 'stale' as const };
      if (port.claim?.(excerpt.payload)) readerPayload = excerpt.payload;
      let node: any, clientNodeId: string;
      try {
        node = create.factory({ type: 'pure', title: excerpt.title, text: excerpt.body, prompt: '',
          [nativeMaterialExcerptField]: excerpt.payload }, { position: { x: point.x, y: point.y } });
        if (!node || node.type !== 'text' || !text(node.id) || node.data?.lcos_ref !== undefined
          || node.data?.text !== excerpt.body || node.data?.[nativeMaterialExcerptField] === undefined)
          throw Error('原文字节点未能接收这份摘录，未提交创建。');
        clientNodeId = node.id;
        if (!current()) return finish({ claimed: true as const, status: 'stale' as const });
        create.addNodes([node]); // The original $e addNodes, never the lab facade's unsupported writer.
      } catch (error) { return reject(error instanceof Error ? error.message : '摘录尚未放入画布，原文保留。'); }
      try {
        // ReactFlow's own batch/layout must publish its exact temporary node
        // before the existing r6 registry is flushed. Never guess success from
        // a delay or issue a second add while that original batch is pending.
        const published = await new Promise<boolean>(resolve => {
          let finished = false, release: (() => void) | undefined;
          const finish = (value: boolean) => { if (finished) return; finished = true; clearTimeout(timer); release?.(); waits.delete(cancel); resolve(value); };
          const cancel = () => finish(false), timer = setTimeout(cancel, 2000);
          const inspect = () => {
            if (!current()) { finish(false); return; }
            if (world.api.getNodes().some((candidate: any) => candidate.id === clientNodeId)
              || port.acceptedReceipt?.({ projectId: world.projectId, canvasId: world.canvasId, clientNodeId, api: world.api })) finish(true);
          };
          waits.add(cancel); release = world.api.subscribeNative?.(inspect); inspect(); if (finished) release?.();
        });
        if (!current()) return finish({ claimed: true as const, status: 'stale' as const, clientNodeId });
        if (!published) {
          create.notice.error('摘录已交给画布，显示与保存仍待核对；请勿重复拖入。');
          return finish({ claimed: true as const, status: 'unconfirmed' as const, clientNodeId });
        }
        const saved = await world.api.flushCanvas(world.canvasId);
        if (!current()) return finish({ claimed: true as const, status: 'stale' as const, clientNodeId });
        const proof = port.acceptedReceipt?.({ projectId: world.projectId, canvasId: world.canvasId, clientNodeId, api: world.api });
        const live = proof && world.api.getNodes().find((candidate: any) => candidate.id === proof.nodeId);
        const receipt = nativeCarryReference(live?.data?.lcos_ref), accepted = nativeCarryReference(proof?.lcos_ref);
        if (saved !== 'saved' || !receipt || !accepted || receipt.artifactId === excerpt.payload.source.artifactId
          || receipt.entityId !== accepted.entityId || receipt.artifactViewId !== accepted.artifactViewId || receipt.revisionId !== accepted.revisionId
          || live.data?.[nativeMaterialExcerptField] !== undefined) {
          create.notice.error('摘录已交给画布，保存或显示仍待核对；请勿重复拖入。');
          return finish({ claimed: true as const, status: 'unconfirmed' as const, clientNodeId });
        }
        create.notice.success?.('摘录已保存到画布，原文保留。');
        return finish({ claimed: true as const, status: 'saved' as const, clientNodeId });
      } catch {
        if (current()) create.notice.error('摘录已提交，保存结果尚未确认；请先核对画布，勿重复拖入。');
        return finish({ claimed: true as const, status: 'unconfirmed' as const, clientNodeId });
      }
    },
  };
}

function world(): World | null {
  const canvas = nativeCanvasStore.getState(), shell = useLcosShellStore.getState(), host = window.__LCOS_NODE_LAB__;
  if (canvas.status !== 'ready' || !canvas.canvasId || !shell.projectId || !shell.activeWorkspaceId || !canvas.rfInstance
    || !canvas.canvasWrapper || host?.api !== canvas.rfInstance || host.projectId !== shell.projectId
    || (host.currentCanvasId ?? host.canvasId) !== canvas.canvasId) return null;
  return { projectId: shell.projectId, canvasId: canvas.canvasId, workspaceId: shell.activeWorkspaceId,
    api: canvas.rfInstance, wrapper: canvas.canvasWrapper };
}
export function LCOSUseNativeMaterialExcerptDrop(canvasId: string) {
  const owner = useMemo(() => createNativeMaterialExcerptDropOwner(canvasId, { world,
    semanticStatus: () => useLcosDropStore.getState().state.status,
    acceptedReceipt: input => (window as any).__LCOS_NATIVE_INTENT__?.readAcceptedCreateReceipt?.(input),
    claim: claimNativeReaderExcerptDrop, report: reportNativeReaderExcerptDrop,
    hit: point => document.elementFromPoint(point.x, point.y) }), [canvasId]);
  useEffect(() => { owner.activate(); return () => owner.dispose(); }, [owner]);
  return owner;
}
