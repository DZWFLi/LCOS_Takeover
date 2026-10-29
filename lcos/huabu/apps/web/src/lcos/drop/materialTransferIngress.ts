import { CoreRelationClient, coreRequest } from '@local-creative-os/web-gen2';
import type { WorkspaceMembership } from '@local-creative-os/domain';


import { toast } from '@/components/Common/Toast';
import useCanvasStore from '@/store/canvasStore';
import { canReadHuabuPayload, getHuabuPayload } from '@/utils/io/dragDrop';

import { receiveCanvasUrlDrop } from './canvasUrlIngress';
import { createLcosCoreSession } from '../app/lcosCoreClient';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { createProjectText } from '../nodes/creation/projectTextCreation';
import { useLcosShellStore } from '../shell/lcosShellStore';
import { LCOS_MATERIAL_TRANSFER_MIME, parseMaterialTransfer, type MaterialTransferPayloadV1 } from '../ui/professional/donor/Gen1TextTransfer';

/** GEN1 materialTransfer parser/locator, using the same canonical Core ingress. */
export { parseMaterialTransfer } from '../ui/professional/donor/Gen1TextTransfer';
export function materialSourceAnchor(value: MaterialTransferPayloadV1): string | undefined {
  const locator = value.source.locator;
  if (locator?.kind === 'page') return `pdf:p${locator.pageNumber}`;
  if (locator?.kind === 'slide') return `pptx:s${locator.slideNumber}`;
  if (locator?.kind === 'lines') return `text:l${locator.start + 1}-l${locator.end + 1}`;
  if (locator?.kind === 'selection' && locator.label) return `section:${locator.label}`;
  return undefined;
}
function dataUrlFile(url: string, name: string): File {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (!match) throw new Error('原页面快照不可读取，未创建空材料。');
  const encodedBody = match[3] ?? '';
  const body = match[2] ? atob(encodedBody) : decodeURIComponent(encodedBody);
  const bytes = Uint8Array.from(body, char => char.charCodeAt(0));
  return new File([bytes], name, { type: match[1] || 'application/octet-stream' });
}

/** Captures a material drop, not node movement/selection/reference delivery. */
export function receiveCanvasMaterialDrop(projectId: string, transfer: DataTransfer, position: { x: number; y: number }): boolean {
  if (receiveCanvasUrlDrop(projectId, transfer, position)) return true;
  if (canReadHuabuPayload(transfer)) {
    const payload = getHuabuPayload(transfer);
    const sourceId = payload?.kind === 'note' ? payload.data.sourceNodeId : undefined;
    const sourceRef = sourceId ? useLcosReferenceStore.getState().nodeEntityRefs.get(sourceId) : undefined;
    if (payload?.kind === 'note' && sourceRef?.entityType === 'artifact') {
      const canvasId = useCanvasStore.getState().canvasId;
      if (canvasId && useLcosShellStore.getState().projectId === projectId) {
        void createProjectText({ projectId, canvasId, nodeType: 'note', position, body: payload.data.content, focus: false })
          .then(() => toast('已摘取为项目文本，原材料正文保留。'))
          .catch(error => toast(error instanceof Error ? error.message : '摘取尚未保存，原文保留。', { tone: 'danger' }));
      }
      return true;
    }
    // Native MOVE/clipboard/file mechanics keep their own owner. A native
    // payload's accompanying file must not become a second external import.
    return false;
  }
  const raw = transfer.getData(LCOS_MATERIAL_TRANSFER_MIME);
  let material = raw ? parseMaterialTransfer(raw) : null;
  const files = [...transfer.files];
  // Clipboard screenshots can be File items without appearing in files.
  if (!files.length) {
    for (const item of [...transfer.items]) {
      const file = item.kind === 'file' ? item.getAsFile() : null;
      if (file) files.push(file);
    }
  }
  if (!raw && !files.length) {
    // GN1 external text/clipboard uses the same canonical material producer.
    // Native object transport was handled above; unreadable OS File items keep
    // their native file owner instead of becoming a filename-shaped text node.
    const text = transfer.getData('text/plain');
    if (!text.trim() || Array.from(transfer.types).includes('Files')) return false;
    material = { schemaVersion:1,kind:'material-transfer',capturedAt:new Date().toISOString(),
      source:{title:text.trim().split(/\r?\n/,1)[0]?.slice(0,48) || '拖入的文字'},content:{kind:'text',text} };
  }
  if (raw && !material) { toast('这块摘取材料无法识别，原件保留。', { tone: 'danger' }); return true; }
  const shell = useLcosShellStore.getState(); const canvasId = useCanvasStore.getState().canvasId;
  if (shell.projectId !== projectId || !canvasId) return true;
  const workspaceId = shell.activeWorkspaceId;
  const session = createLcosCoreSession();
  const relations = new CoreRelationClient(session.http);
  const current = () => useLcosShellStore.getState().projectId === projectId && useCanvasStore.getState().canvasId === canvasId
    && useLcosShellStore.getState().activeWorkspaceId === workspaceId;
  let savedCount = 0;
  void (async () => {
    const graph = await session.projects.getProjectGraph(projectId);
    const workspace = graph?.workspaces.find(item => String(item.id) === workspaceId && item.canvasId === canvasId);
    if (!current()) return;
    if (!graph || String(graph.project.id) !== projectId || !workspace || String(workspace.projectId) !== projectId
      || !graph.scopes.some(scope => String(scope.id) === String(workspace.scopeId)))
      throw new Error('当前现场身份尚未读回，未把材料放到别处。');
    const scopeId = String(workspace.scopeId);
    const createFile = async (file: File, point: { x: number; y: number }) => {
      if (!current()) throw new Error('当前现场已切换，尚未开始的文件保留在原处。');
      const saved = await session.artifacts.importCopiedFile(projectId, { file, importRequestId: `material-${crypto.randomUUID()}`, scopeId, position: point });
      if (!saved.artifact?.id || String(saved.artifact.projectId) !== projectId
        || !saved.revision?.id || String(saved.revision.artifactId) !== String(saved.artifact.id)
        || !saved.view?.id || String(saved.view.artifactId) !== String(saved.artifact.id))
        throw new Error('文件已提交，但材料回执尚未确认；请核对项目材料，避免重复拖入。');
      savedCount += 1;
      // Import Copy owns bytes and the View; the existing Workspace membership
      // owner makes that exact View visible in Context/Workflow as well as Main.
      // Finish the original destination after a confirmed import, never the new UI site.
      const membership = await coreRequest<readonly WorkspaceMembership[]>(session.http, 'POST', `/workspaces/${encodeURIComponent(String(workspace.id))}/members`,
        { body: { viewIds: [String(saved.view.id)], addedBy: 'import' } });
      if (!Array.isArray(membership) || !membership.some(member => String(member.workspaceId) === String(workspace.id)
        && String(member.artifactViewId) === String(saved.view.id)))
        throw new Error('文件已保存，当前现场的材料显示尚未确认。');
      return { artifactId: String(saved.artifact.id), revisionId: String(saved.revision.id), viewId: String(saved.view.id), reused: saved.reused };
    };
    if (!material) {
      let count = 0;
      let onlySaved: Awaited<ReturnType<typeof createFile>> | undefined;
      for (const file of files) { onlySaved = await createFile(file, { x: position.x + count * 28, y: position.y + count * 28 }); count += 1; }
      if (current()) {
        const references = useLcosReferenceStore.getState();
        references.requestNodeBindingRefresh();
        if (count === 1 && onlySaved?.reused) {
          const saved = onlySaved;
          const existing = [...references.nodeEntityRefs].find(([, ref]) => ref.entityType === 'artifact' && ref.entityId === saved.artifactId
            && (ref.artifactViewId ?? ref.descriptor?.artifactViewId) === saved.viewId);
          if (existing) {
            useLcosShellStore.getState().requestLocate({ reqId: `material-existing-${crypto.randomUUID()}`,
              surface: useLcosShellStore.getState().activeSurface, canvasId, nodeId: existing[0], status: 'projected' });
            toast('已定位已有材料，原文件保留。');
          } else toast('材料已存在，正在同步画布显示；原文件保留。');
        } else toast(`已加入 ${count} 份项目材料，原文件保留。`);
      }
      return;
    }
    const source = material.source;
    if (source.projectId === projectId && source.artifactId) {
      const artifact = graph.artifacts.find(item => String(item.id) === source.artifactId);
      const revision = source.revisionId ? graph.artifactRevisions?.find(item => String(item.id) === source.revisionId && String(item.artifactId) === source.artifactId) : undefined;
      if (!artifact || (source.revisionId && !revision)) throw new Error('原材料或所选版本已缺失，没有改用最新版。');
    }
    const label = source.locator?.label ?? (material.content.kind === 'presentation-slide' ? `第 ${material.content.slideNumber} 页`
      : material.content.kind === 'document-page' ? `第 ${material.content.pageNumber} 页` : '摘录');
    const title = `${source.title} · ${label}`;
    let created: { artifactId: string; revisionId: string; viewId: string };
    const content = material.content;
    if (content.kind === 'image') created = await createFile(dataUrlFile(content.dataUrl, content.fileName ?? `${title}.png`), position);
    else if (content.kind === 'presentation-slide' && content.svg) created = await createFile(new File([content.svg], `${title}.svg`, { type: 'image/svg+xml' }), position);
    else if (content.kind === 'document-page' && content.previewDataUrl) created = await createFile(dataUrlFile(content.previewDataUrl, `${title}.png`), position);
    else {
      const text = content.kind === 'text' ? content.text : 'text' in content ? content.text : undefined;
      if (!text?.trim()) throw new Error('这一页尚无可摘取的正文或快照，未创建空白代替。');
      created = await session.artifacts.createTextArtifact(projectId, { title, body: text, scopeId, ...(workspaceId ? { workspaceId } : {}), x: position.x, y: position.y });
      if (!created.artifactId || !created.revisionId || !created.viewId)
        throw new Error('摘录已提交，但材料回执尚未确认；请核对项目材料，避免重复拖入。');
      savedCount += 1;
    }
    let sourceLinked = !source.artifactId || source.projectId === projectId;
    if (source.projectId === projectId && source.artifactId && source.artifactId !== created.artifactId) {
      try {
        const existing = (await relations.listRelations(projectId)).find(relation => relation.sourceEntityType === 'artifact'
          && relation.sourceEntityId === created.artifactId && relation.targetEntityType === 'artifact'
          && relation.targetEntityId === source.artifactId && relation.kind === 'reference');
        const relation = existing ?? (await relations.createRelation(projectId, { sourceEntityType: 'artifact', sourceEntityId: created.artifactId,
          targetEntityType: 'artifact', targetEntityId: source.artifactId, kind: 'reference' })).relation;
        const anchor = materialSourceAnchor(material);
        const previous = relation.evidenceRefs ?? [];
        const alreadyLinked = previous.some(evidence => evidence.kind === 'artifact' && evidence.id === source.artifactId
          && evidence.revisionId === source.revisionId && evidence.sourceAnchor === anchor);
        if (!alreadyLinked) await relations.putRelation(projectId, { ...relation, evidenceRefs: [...previous,
          { kind: 'artifact', id: source.artifactId, label: source.title,
            ...(source.revisionId ? { revisionId: source.revisionId } : {}), ...(anchor ? { sourceAnchor: anchor } : {}) }] });
      } catch { sourceLinked = false; }
    }
    if (current()) {
      useLcosReferenceStore.getState().requestNodeBindingRefresh();
      toast(sourceLinked ? `已放入「${label}」，原件保留。` : `「${label}」已保存，但来源关系尚未确认；原件保留。`, sourceLinked ? undefined : { tone: 'danger' });
    }
  })().catch(error => {
    if (!current()) return;
    // A later file or membership can fail after earlier imports committed.
    // Read those saved materials back instead of reporting the whole drop as lost.
    if (savedCount > 0) useLcosReferenceStore.getState().requestNodeBindingRefresh();
    const detail = error instanceof Error ? error.message : '本次导入未完成。';
    toast(savedCount > 0 ? `已保存 ${savedCount} 份材料；本次拖入未全部完成：${detail} 原文件保留。` : detail,
      { tone: 'danger' });
  });
  return true;
}
