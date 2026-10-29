import type { Workspace } from '../../lcos/packages/domain/src/index.ts';

/** Read the existing canonical Workspace list; never infer one from a Scope name. */
export function readNativeSavedContextWorkspaces(projectId: string, canvasId: string, value: unknown): {
  readonly workspaces: readonly Workspace[];
  readonly current: Workspace;
} {
  if (!projectId || !canvasId || !Array.isArray(value)) throw new Error('Core 工作现场列表或当前画布身份不可读。');
  const ids = new Set<string>();
  const canvases = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || !row.id
      || row.projectId !== projectId || typeof row.scopeId !== 'string' || !row.scopeId
      || typeof row.name !== 'string' || ids.has(row.id)) throw new Error('Core 工作现场包含缺失、重复或跨项目身份。');
    ids.add(row.id);
    if (row.canvasId !== undefined && row.canvasId !== null) {
      if (typeof row.canvasId !== 'string' || !row.canvasId || canvases.has(row.canvasId)) {
        throw new Error('Core 工作现场包含不可读或重复的 Canvas 映射。');
      }
      canvases.add(row.canvasId);
    }
  }
  const workspaces = value as readonly Workspace[];
  const current = workspaces.filter(row => row.canvasId === canvasId);
  if (current.length !== 1) throw new Error('当前原画布没有唯一的 Core 工作现场；没有猜测 Saved Context。');
  return { workspaces, current: current[0]! };
}
