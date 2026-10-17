import type { LcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient';
import { resolveNativeMaterialVersion } from './native-material-viewer-read';

type Ref = { artifactId: string; artifactViewId: string; revisionId: string };
type Node = { id: string; type?: string; data?: Record<string, unknown> };
type Api = { getNodes(): readonly Node[] };
export type NativeColorPinDownloadResult = { success: boolean; downloadableNodeCount: number; task?: { file_count: number }; message: string };

export function nativeColorPinDownloadRef(node: Node | undefined): Ref | undefined {
  const value = node?.data?.lcos_ref;
  if (!value || typeof value !== 'object') return undefined;
  const ref = value as Record<string, unknown>;
  if (ref.version !== 1 || !['artifact', 'view'].includes(String(ref.entityType))
    || !['artifactId', 'artifactViewId', 'revisionId'].every(key => typeof ref[key] === 'string' && !!ref[key])) return undefined;
  if (ref.entityId !== (ref.entityType === 'view' ? ref.artifactViewId : ref.artifactId)) return undefined;
  return { artifactId: ref.artifactId as string, artifactViewId: ref.artifactViewId as string, revisionId: ref.revisionId as string };
}

const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/svg+xml': 'svg', 'text/plain': 'txt', 'text/markdown': 'md', 'text/html': 'html', 'application/pdf': 'pdf',
  'application/json': 'json', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'video/mp4': 'mp4', 'application/zip': 'zip',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx' };

/** Human names only. ZIP entry names never retain source paths or identity IDs. */
export function nativeColorPinDownloadName(title: string, mime: string, observedPath = ''): string {
  const clean = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 170) || '材料';
  const originalExtension = /\.([a-zA-Z0-9]{1,12})$/.exec(observedPath)?.[1]?.toLowerCase();
  const ext = extensions[mime.split(';')[0]!.trim().toLowerCase()] ?? originalExtension ?? 'bin';
  return /\.[a-zA-Z0-9]{1,12}$/.test(clean) ? clean : clean + '.' + ext;
}

export async function saveNativeColorPinBlob(blob: Blob, name: string): Promise<void> {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  try { link.href = url; link.download = name; link.style.display = 'none'; document.body.append(link); link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
}

/** Same exact FileRecord reader and browser download owner used by the Viewer.
 * Several files become one local ZIP, not several unconfirmed browser clicks. */
export async function downloadNativeColorPinGroup(input: { projectId: string; nodeIds: readonly string[]; api: Api;
  label: string; isCurrent(): boolean; signal?: AbortSignal }, ports: {
    session: LcosCoreSession; save?: (blob: Blob, name: string) => Promise<void>;
  }): Promise<NativeColorPinDownloadResult> {
  const { session } = ports, save = ports.save ?? saveNativeColorPinBlob;
  const captured = [...new Set(input.nodeIds)].map(id => ({ id, ref: nativeColorPinDownloadRef(input.api.getNodes().find(node => node.id === id)) }));
  const active = () => !input.signal?.aborted && input.isCurrent() && captured.every(row =>
    JSON.stringify(row.ref) === JSON.stringify(nativeColorPinDownloadRef(input.api.getNodes().find(node => node.id === row.id))));
  const assertCurrent = () => { if (!active()) throw new Error('下载期间标记或现场已变化，没有下载其他版本。'); };
  try {
    assertCurrent();
    const candidates = captured.filter((row): row is { id: string; ref: Ref } => !!row.ref);
    if (!candidates.length) return { success: false, downloadableNodeCount: 0, message: '本组暂没有可核对原文件的材料；没有把其他节点当文件。' };
    const [graph, details] = await Promise.all([session.projects.getProjectGraph(input.projectId),
      Promise.all([...new Set(candidates.map(row => row.ref.artifactId))].map(async id =>
        [id, await session.artifacts.getArtifactDetail(id, input.signal)] as const))]);
    assertCurrent();
    if (!graph) throw new Error('项目材料尚未读取，没有替换为最新版本。');
    const detailById = new Map(details);
    const files = await Promise.all(candidates.map(async row => {
      try {
        const version = resolveNativeMaterialVersion({ projectId: input.projectId, ...row.ref }, detailById.get(row.ref.artifactId)!,
          graph.artifactRevisions, graph);
        assertCurrent();
        const blob = await session.artifacts.getFileRecordContent(input.projectId, version.fileRecordId, input.signal);
        assertCurrent();
        const file = graph.fileRecords.find(record => String(record.id) === version.fileRecordId)!;
        return { nodeId: row.id, fileRecordId: version.fileRecordId, blob,
          name: nativeColorPinDownloadName(version.title, version.mimeType, file.observedPath) };
      } catch (error) { return { error: error instanceof Error ? error.message : '这份材料暂时不能读取。' }; }
    }));
    assertCurrent();
    const accepted = files.filter((file): file is Extract<typeof file, { blob: Blob }> => 'blob' in file);
    const unique = [...new Map(accepted.map(file => [file.fileRecordId, file])).values()];
    if (!unique.length) return { success: false, downloadableNodeCount: 0, message: '本组原版本暂时不能下载，未用 Current 或其他文件替代。' };
    if (unique.length === 1) { assertCurrent(); await save(unique[0]!.blob, unique[0]!.name); }
    else {
      const { zipSync } = await import('fflate/browser');
      assertCurrent();
      const entries: Record<string, Uint8Array> = {}, used = new Set<string>();
      for (const file of unique) {
        let name = file.name, suffix = 2;
        while (used.has(name.toLocaleLowerCase())) name = file.name.replace(/(\.[^.]+)$/, ` (${suffix++})$1`);
        used.add(name.toLocaleLowerCase()); entries[name] = new Uint8Array(await file.blob.arrayBuffer());
      }
      const bytes = zipSync(entries, { level: 0 });
      assertCurrent();
      await save(new Blob([bytes as BlobPart], { type: 'application/zip' }),
        nativeColorPinDownloadName((input.label || '颜色组').replace(/\.zip$/i, '') + '.zip', 'application/zip'));
    }
    const skipped = captured.length - accepted.length;
    return { success: skipped === 0, downloadableNodeCount: accepted.length, task: { file_count: unique.length },
      message: skipped ? `已下载 ${unique.length} 个准确文件；另 ${skipped} 项未确认，未用最新版本替代。` : `已下载 ${unique.length} 个准确文件。` };
  } catch (error) { return { success: false, downloadableNodeCount: 0,
    message: error instanceof Error ? error.message : '下载未完成，原标记和材料保留。' }; }
}
