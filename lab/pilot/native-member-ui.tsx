import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient';
import type { Workspace } from '../../lcos/packages/domain/src/index';
import useCanvasStore from './native-canvas-port';
import { requestNativeNoteView } from './native-note-viewer';
import { requestNativeLibraryMemberView, enterNativeWorkspaceWithReturn } from './native-library-contexts';
import { withNativeLibraryReadingReturn, cancelNativeLibraryReadingReturn, type NativeLibraryReadingReturn } from './native-library-reading-return';

export interface NativeMemberReference {
  readonly projectId: string; readonly canvasId: string; readonly workspaceId: string;
  readonly entityType: 'note' | 'scope' | 'workspace'; readonly entityId: string;
}
export interface NativeMemberFacts {
  readonly title: string; readonly body?: string; readonly updatedAt?: string;
  readonly scopeId?: string; readonly scopeKind?: string; readonly targetWorkspaceId?: string;
  readonly targetCanvasId?: string; readonly description?: string;
}
export interface NativeMemberNode {
  readonly nodeId: string; readonly reference: NativeMemberReference; readonly facts: NativeMemberFacts;
}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** Typed source content only; no Artifact, editor draft or second membership. */
export function readNativeMemberNode(nodeId: unknown, data: unknown): NativeMemberNode | undefined {
  if (!nonEmpty(nodeId) || !record(data) || data.id !== nodeId || !nonEmpty(data.title)
    || !record(data.lcos_member_ref) || !record(data.lcos_member_facts)) return;
  const ref = data.lcos_member_ref, facts = data.lcos_member_facts;
  if (![ref.projectId, ref.canvasId, ref.workspaceId, ref.entityId].every(nonEmpty)
    || !['note', 'scope', 'workspace'].includes(String(ref.entityType)) || facts.title !== data.title
    || facts.description !== undefined && typeof facts.description !== 'string') return;
  if (ref.entityType === 'note' && (typeof facts.body !== 'string' || !nonEmpty(facts.updatedAt))) return;
  if (ref.entityType === 'scope' && (facts.scopeId !== ref.entityId || !['context', 'workflow'].includes(String(facts.scopeKind)))) return;
  if (ref.entityType === 'workspace' && (facts.targetWorkspaceId !== ref.entityId || !nonEmpty(facts.scopeId) || !nonEmpty(facts.targetCanvasId))) return;
  return { nodeId, reference: { projectId: ref.projectId as string, canvasId: ref.canvasId as string,
    workspaceId: ref.workspaceId as string, entityType: ref.entityType as NativeMemberReference['entityType'], entityId: ref.entityId as string },
    facts: { title: facts.title as string,
      ...(ref.entityType === 'note' ? { body: facts.body as string, updatedAt: facts.updatedAt as string } : {}),
      ...(nonEmpty(facts.scopeId) ? { scopeId: facts.scopeId } : {}), ...(nonEmpty(facts.scopeKind) ? { scopeKind: facts.scopeKind } : {}),
      ...(ref.entityType === 'workspace' ? { targetWorkspaceId: facts.targetWorkspaceId as string, targetCanvasId: facts.targetCanvasId as string } : {}),
      ...(typeof facts.description === 'string' ? { description: facts.description } : {}) } };
}

export function nativeMemberSurfaceMatches(canvasId: string, activeSurface: 'main' | 'context' | 'workflow',
  surfaceCanvasId: Readonly<Partial<Record<'main' | 'context' | 'workflow', string>>>): boolean {
  const activeRoot = surfaceCanvasId[activeSurface];
  // The map contains root destinations. A child keeps those destinations and
  // is admitted by its exact current Workspace/Canvas/API/live DTO below.
  return nonEmpty(activeRoot) && (!Object.values(surfaceCanvasId).includes(canvasId) || activeRoot === canvasId);
}

export function nativeMemberOwnerCurrent(member: NativeMemberNode): boolean {
  const canvas = useCanvasStore.getState(), shell = useLcosShellStore.getState(), ref = member.reference;
  const host = typeof window !== 'undefined' ? window.__LCOS_NODE_LAB__ : undefined;
  if (canvas.status !== 'ready' || canvas.canvasId !== ref.canvasId || !canvas.rfInstance || host?.api !== canvas.rfInstance
    || host.projectId !== ref.projectId || shell.projectId !== ref.projectId || shell.activeWorkspaceId !== ref.workspaceId
    || !nativeMemberSurfaceMatches(ref.canvasId, shell.activeSurface, shell.surfaceCanvasId)) return false;
  const node = canvas.nodes.find(value => value.id === member.nodeId);
  const live = node?.type === 'lcos-member' && node.canvas_id === ref.canvasId ? readNativeMemberNode(node.id, node.data) : undefined;
  return !!live && JSON.stringify(live) === JSON.stringify(member);
}

export interface NativeMemberActionPorts {
  current(): boolean;
  sourceCurrent?(): boolean;
  note(request: { projectId: string; noteId: string; updatedAt: string; title: string }): void;
  library(projectId: string, member: { kind: 'scope'; key: string; title: string; item: any }, source: { title: string; current(): boolean; restore(): Promise<void>; release(preserve: boolean): void }, signal?: AbortSignal): Promise<void>;
  workspaces(projectId: string, signal?: AbortSignal): Promise<readonly Workspace[]>;
  enter(projectId: string, target: Workspace, root: { kind: string; id: string; title: string }, restore: () => Promise<void>): Promise<void>;
  restore(): Promise<void>;
  release(preserve: boolean): void;
}

export async function openNativeMemberSource(member: NativeMemberNode, ports: NativeMemberActionPorts, signal?: AbortSignal): Promise<void> {
  const { reference: ref, facts } = member;
  const current = () => !signal?.aborted && ports.current();
  if (!current()) throw new Error('原内容或现场已变化，请重新打开。');
  if (ref.entityType === 'note') {
    ports.note({ projectId: ref.projectId, noteId: ref.entityId, updatedAt: facts.updatedAt!, title: facts.title });
  } else if (ref.entityType === 'scope') {
    const kind = facts.scopeKind as 'context' | 'workflow';
    await ports.library(ref.projectId, { kind: 'scope', key: JSON.stringify(['scope', ref.entityId]), title: facts.title,
      item: { schemaVersion: 1, kind, entityRef: { type: kind, id: ref.entityId }, title: facts.title, usageCount: 0 } },
      { title: facts.title, current: ports.sourceCurrent ?? current, restore: ports.restore, release: ports.release }, signal);
  } else {
    const rows = await ports.workspaces(ref.projectId, signal);
    if (!current()) throw new Error('原现场已切换，未进入旧目标。');
    const targets = rows.filter(row => String(row.projectId) === ref.projectId && String(row.id) === ref.entityId
      && String(row.scopeId) === facts.scopeId && row.canvasId === facts.targetCanvasId);
    if (targets.length !== 1) throw new Error('这份现场地址已变化，请重新读取。');
    await ports.enter(ref.projectId, targets[0], { kind: 'workspace', id: ref.entityId, title: facts.title }, ports.restore);
  }
}

/** Reacquire the original node after a real scene return. Never restore a
 * draft, select another node or pull the user away from a different scene. */
export async function restoreNativeMemberNode(member: NativeMemberNode): Promise<void> {
  if (!nativeMemberOwnerCurrent(member)) throw new Error('原节点暂未就绪，返回位置保留；请重试。');
  await new Promise<void>((resolve, reject) => {
    let frames = 0, stable = 0;
    const focus = () => {
      if (!nativeMemberOwnerCurrent(member)) { reject(new Error('原现场已经切换，未返回其他内容。')); return; }
      if (++frames >= 180) { reject(new Error('原节点暂未显示，返回位置保留；请重试。')); return; }
      if (document.querySelector('[data-media-viewer]')) { requestAnimationFrame(focus); return; }
      const root = [...document.querySelectorAll<HTMLElement>('[data-native-member-body]')].find(value => value.dataset.nativeMemberBody === member.nodeId);
      const button = root?.querySelector<HTMLButtonElement>('[data-native-member-action]');
      if (button && root?.getClientRects().length) {
        button.focus({ preventScroll: true }); stable = document.activeElement === button ? stable + 1 : 0;
        if (stable >= 3) { resolve(); return; }
      } else stable = 0;
      requestAnimationFrame(focus);
    };
    requestAnimationFrame(focus);
  });
}

export function LCOSNativeMemberBody({ id, data, selected, dragging, TextBody, Button }: {
  id: string; data: unknown; selected?: boolean; dragging?: boolean;
  TextBody: ComponentType<{ markdown: string }>; Button: ComponentType<any>;
}) {
  const canvas = useCanvasStore(value => value), member = readNativeMemberNode(id, data);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const alive = useRef(true), pending = useRef<AbortController>(), reading = useRef<NativeLibraryReadingReturn>();
  const key = JSON.stringify(member), api = canvas.rfInstance;
  useEffect(() => { alive.current = true; return () => { alive.current = false; pending.current?.abort(); cancelNativeLibraryReadingReturn(reading.current, true); }; }, [key, api]);
  const ready = !!member && nativeMemberOwnerCurrent(member);
  const open = async () => {
    if (!member || busy || !nativeMemberOwnerCurrent(member)) return;
    const controller = new AbortController(); pending.current?.abort(); pending.current = controller;
    const current = () => alive.current && pending.current === controller && !controller.signal.aborted
      && useCanvasStore.getState().rfInstance === api && nativeMemberOwnerCurrent(member);
    setBusy(true); setMessage('');
    try {
      await openNativeMemberSource(member, { current, sourceCurrent: () => nativeMemberOwnerCurrent(member),
        note: request => {
          const lease: NativeLibraryReadingReturn = { projectId: member.reference.projectId, rootKind: 'note', rootId: member.reference.entityId,
            closed: false, current, onReturn: () => restoreNativeMemberNode(member) };
          cancelNativeLibraryReadingReturn(reading.current, true); reading.current = lease;
          requestNativeNoteView(withNativeLibraryReadingReturn(request, lease));
        },
        library: requestNativeLibraryMemberView, workspaces: (project, signal) => createLcosCoreSession().projects.getWorkspaces(project, signal),
        enter: enterNativeWorkspaceWithReturn, restore: () => restoreNativeMemberNode(member), release: () => {},
      }, controller.signal);
    } catch (error) { if (current()) setMessage(error instanceof Error ? error.message : '内容暂时打不开，请重试。'); }
    finally { if (alive.current && pending.current === controller) setBusy(false); }
  };
  const kind = member?.reference.entityType;
  const markdown = !member ? '' : kind === 'note' ? member.facts.body || '空白附注'
    : member.facts.description || (kind === 'workspace' ? '查看这个工作现场。'
      : member.facts.scopeKind === 'workflow' ? '查看这份方法的步骤和关联内容。' : '查看这份上下文的完整内容。');
  return <div className={`relative flex h-full w-full cursor-default flex-col overflow-y-auto px-4 py-3 ${selected ? 'nowheel' : ''}`}
    style={{ scrollbarWidth: 'thin' }} data-native-member-body={id} data-native-member-kind={kind} data-native-member-id={member?.reference.entityId}>
    {member ? <><div className="min-h-0 flex-1"><TextBody markdown={markdown} /></div>
      <div className="nodrag nopan mt-3 flex shrink-0 items-center gap-2" onPointerDown={event => event.stopPropagation()}>
        <Button type="button" variant="ghost" size="sm" disabled={!ready || busy || dragging} data-native-member-action={kind}
          onClick={(event: { stopPropagation(): void }) => { event.stopPropagation(); void open(); }}>
          {busy ? '正在打开…' : kind === 'note' ? '查看附注' : kind === 'workspace' ? '进入现场' : '查看内容'}
        </Button>
      </div></> : <p role="status">内容来源暂不可读取，请重新打开。</p>}
    {message && <p className="mt-2 text-sm text-muted-foreground" role="status">{message}</p>}
  </div>;
}
