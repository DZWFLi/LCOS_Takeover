import type { NodeContent } from '../../lcos/huabu/apps/server/src/modules/canvas/persistence-types';
import { nativeCanvasGuiReferenceFields } from './native-canvas-gui-markers';

type Row = Record<string, any>;
export type NativeOrdinaryNodeContentInput = {
  projectId: string;
  canvasId: string;
  node: Row;
  nodes: readonly Row[];
  workspaces: readonly Row[];
  bindings: readonly Row[];
  /** The caller reads this exact original Space's nodes.read(node.id).
   * The record itself deliberately has no invented Core/material identity. */
  content: { canvasId: string; record: NodeContent | null | undefined } | null | undefined;
};
export type NativeOrdinaryNodeContentProjection = {
  nodeId: string;
  canvasId: string;
  workspaceId: string;
  data: { id: string; title: string; text: string; content: string; type: 'pure'; lcos_ordinary_text_readonly: true };
};
export class NativeOrdinaryNodeContentError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message); this.name = 'NativeOrdinaryNodeContentError';
  }
}
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const fail = (status: number, code: string, message: string): never => { throw new NativeOrdinaryNodeContentError(status, code, message); };
export const nativeOrdinaryTextReadonlyNotice = '普通画布文字目前仅支持只读查看，编辑与导图尚未接入。';
/** Presentation-only recognition. Reserved references cannot masquerade as an
 * ordinary readonly note when their canonical identity is damaged. */
export function isNativeOrdinaryTextReadonly(data: unknown, nodeId: unknown): boolean {
  return !!data && typeof data === 'object' && !Array.isArray(data) && nonempty(nodeId)
    && (data as Row).id === nodeId && (data as Row).type === 'pure' && (data as Row).lcos_ordinary_text_readonly === true
    && typeof (data as Row).title === 'string' && typeof (data as Row).text === 'string' && (data as Row).content === (data as Row).text
    && !nativeCanvasGuiReferenceFields.some(key => Object.hasOwn(data, key));
}

/** Read-only presentation of an original unbound Huabu note. Geometry, parent,
 * GUI fields and body storage stay with their existing owners. A typed carrier
 * (even a broken/null reserved reference) never falls back to this path. */
export function projectNativeOrdinaryNodeContent(input: NativeOrdinaryNodeContentInput): NativeOrdinaryNodeContentProjection | undefined {
  const { projectId, canvasId, node, nodes, workspaces, bindings, content } = input;
  if (node?.type !== 'note') return undefined;
  if (!nonempty(projectId) || !nonempty(canvasId) || !nonempty(node.id)
    || nodes.filter(row => row.id === node.id).length !== 1
    || node.data !== undefined && (!node.data || typeof node.data !== 'object' || Array.isArray(node.data))
    || node.data?.id !== undefined && node.data.id !== node.id
    || node.canvas_id !== undefined && node.canvas_id !== canvasId
    || node.canvasId !== undefined && node.canvasId !== canvasId) {
    fail(409, 'ORDINARY_NODE_CONTENT_IDENTITY_MISMATCH', '普通文字的位置身份已变化，未读取其他节点的正文。');
  }
  if (nativeCanvasGuiReferenceFields.some(key => Object.hasOwn(node.data ?? {}, key))
    || bindings.some(row => row.canvasId === canvasId && row.spatialKind === 'node' && row.spatialId === node.id)) return undefined;
  const owners = workspaces.filter(row => row.canvasId === canvasId);
  if (owners.length !== 1 || owners[0]?.projectId !== projectId || !nonempty(owners[0]?.id))
    fail(409, 'ORDINARY_NODE_CONTENT_WORKSPACE_MISMATCH', '普通文字的当前现场尚未确认，未采用其他现场正文。');
  if (!content || content.canvasId !== canvasId || !content.record)
    fail(503, 'ORDINARY_NODE_CONTENT_UNAVAILABLE', '这份普通文字暂时无法读取，原节点和正文保留。');
  const record = content.record;
  if (record.nodeId !== node.id || record.type !== 'note')
    fail(409, 'ORDINARY_NODE_CONTENT_RECORD_MISMATCH', '原正文记录与当前文字节点不一致，未采用其他正文。');
  if (typeof record.content !== 'string' || record.label !== null && typeof record.label !== 'string'
    || Object.hasOwn(record, 'src'))
    fail(409, 'ORDINARY_NODE_CONTENT_RECORD_INVALID', '原文字记录尚未完整确认，未猜测或替换正文。');
  return { nodeId: node.id, canvasId, workspaceId: owners[0]!.id,
    data: { id: node.id, title: record.label ?? '', text: record.content, content: record.content,
      type: 'pure', lcos_ordinary_text_readonly: true } };
}
