import { coreRequest } from '@local-creative-os/web-gen2';

import type { LcosCoreSession } from '../app/lcosCoreClient';
import type { ImportResourceResultV1, ProjectGraphSnapshot } from '@local-creative-os/contracts';

export interface ProjectUrlPlacement {
  readonly projectId: string;
  readonly canvasId: string;
  readonly workspaceId: string;
  readonly url: string;
  readonly title?: string;
  readonly note?: string;
  readonly position: { readonly x: number; readonly y: number };
}

/** Preserve the existing Core URL producer's normalized identity. Security
 * checks (private addresses, credentials, etc.) remain owned by Core. */
export function singleHttpUrl(text: string): string | undefined {
  const trimmed = text.trim();
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return undefined;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch { return undefined; }
}

/** External URL ingress only. Files and native clipboard/MOVE/material drops
 * keep their existing owners, even when they also carry a plain-text URL. */
export function canvasExternalUrl(transfer: Pick<DataTransfer, 'types' | 'files' | 'items' | 'getData'>): string | undefined {
  if (transfer.types.includes('application/x-huabu-dnd') || transfer.types.includes('application/x-huabu-clipboard')
    || transfer.types.includes('application/x-lcos-material-transfer') || transfer.files.length
    || [...transfer.items].some(item => item.kind === 'file')) return undefined;
  const uris = transfer.getData('text/uri-list').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  if (uris.length) return uris.length === 1 ? singleHttpUrl(uris[0] ?? '') : undefined;
  return singleHttpUrl(transfer.getData('text/plain'));
}

export interface ProjectUrlImportResult {
  readonly saved: ImportResourceResultV1;
  readonly workspaceMember: boolean;
  /** The URL material is already durable when membership fails. Never tell
   * the user that nothing was saved, and never re-import it as a retry. */
  readonly membershipError?: string;
}

/** Gen1 createLinkReference: canonical import-url, then import membership.
 * No native node is created first; the existing projector creates/reuses it.
 * The route supplies its stable URL importRequestId when one is omitted. */
export async function saveProjectUrl(
  session: Pick<LcosCoreSession, 'http'>,
  input: ProjectUrlPlacement,
  options: { readonly signal?: AbortSignal; readonly isCurrent?: () => boolean } = {},
): Promise<ProjectUrlImportResult> {
  const url = singleHttpUrl(input.url);
  if (!url) throw new Error('请使用一个完整的 HTTP 或 HTTPS 链接。');
  if (!Number.isFinite(input.position.x) || !Number.isFinite(input.position.y)) throw new Error('链接入场位置尚未确认。');
  const graph = await coreRequest<ProjectGraphSnapshot | undefined>(session.http, 'GET',
    `/projects/${encodeURIComponent(input.projectId)}/graph`, { signal: options.signal });
  const workspace = graph?.workspaces.find(item => String(item.id) === input.workspaceId && String(item.projectId) === input.projectId && item.canvasId === input.canvasId);
  if (!workspace || !graph?.scopes.some(scope => String(scope.id) === String(workspace.scopeId))) {
    throw new Error('当前现场身份尚未读回，没有把链接保存到其他现场。');
  }
  if (options.signal?.aborted) throw new DOMException('链接导入已取消。', 'AbortError');
  if (options.isCurrent?.() === false) throw new Error('链接入场现场已变化。');
  const saved = await coreRequest<ImportResourceResultV1>(session.http, 'POST',
    `/projects/${encodeURIComponent(input.projectId)}/resources/import-url`, { signal: options.signal, body: {
      url, scopeId: String(workspace.scopeId), x: input.position.x, y: input.position.y,
      ...(input.title === undefined ? {} : { title: input.title }), ...(input.note === undefined ? {} : { note: input.note }),
    } });
  if (saved.sourceKind !== 'link' || !saved.artifactId || !saved.revisionId || !saved.resourceId) {
    throw new Error('链接导入回执尚未确认，请刷新核对，避免重复保存。');
  }
  if (!saved.viewId) return { saved, workspaceMember: false, membershipError: '链接已保存，但尚未返回可加入现场的材料视图。' };
  try {
    // This finishes the originally addressed import even if the UI navigates
    // away after its producer commits. It must not move to the new workspace.
    await coreRequest(session.http, 'POST', `/workspaces/${encodeURIComponent(input.workspaceId)}/members`,
      { signal: options.signal, body: { viewIds: [saved.viewId], addedBy: 'import' } });
    return { saved, workspaceMember: true };
  } catch (error) {
    return { saved, workspaceMember: false, membershipError: error instanceof Error ? error.message : '现场成员确认失败。' };
  }
}
