import { createContext, createElement, useContext, useState, type ComponentType, type ReactNode } from 'react';
import useCanvasStore from './native-canvas-port';
// The shipped viewer remains the single session/focus/return owner.
// @ts-expect-error served shared module, deliberately not a second bundled viewer.
import { nativeMaterialViewerAvailable, requestNativeMaterialView } from '/lcos/agent-ui.js';

type Data = Readonly<Record<string, unknown>>;
type SlotProps = { nodeId: string; data: Data; children?: ReactNode; originalBody?: ReactNode;
  [key: string]: unknown };
export interface NativeFileReference {
  artifactId: string; artifactViewId: string; revisionId: string; fileRecordId: string;
  mimeType: string; kind: string; size?: number;
}
const object = (value: unknown): value is Data => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const extraExtensions = ['txt', 'md', 'csv', 'json', 'yaml', 'yml', 'xml', 'html', 'pdf', 'docx', 'pptx', 'xlsx', 'zip', 'mp3', 'wav', 'm4a', 'mp4', 'mov', 'webm'];
const extraMimes = new Set(['text/plain', 'text/markdown', 'text/x-markdown', 'text/csv', 'application/json',
  'application/yaml', 'text/yaml', 'application/x-yaml', 'application/xml', 'text/xml', 'text/html', 'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/x-zip-compressed',
  'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'audio/mp4', 'audio/x-m4a',
  'video/mp4', 'video/quicktime', 'video/webm', 'application/octet-stream']);
const fileExtension = (file: { name?: unknown }) => typeof file?.name === 'string' ? /\.([^.]+)$/.exec(file.name.toLowerCase())?.[1] ?? '' : '';
const extraFile = (file: { name?: unknown }) => extraExtensions.includes(fileExtension(file));
function activeFileHost() {
  const host = typeof window !== 'undefined' ? window.__LCOS_NODE_LAB__ : undefined;
  const canvasId = host?.currentCanvasId ?? host?.canvasId;
  return host && text(host.projectId) && text(canvasId) && host.api ? { projectId: host.projectId, canvasId, api: host.api } : null;
}

/** Browser admission only; Core still checks the actual MIME, container,
 * byte bounds and UTF-8. Never import this Node/Buffer validation into UI. */
export function LCOSNativeFileUploadTypes(options: { allowedTypes?: readonly string[] } | undefined, original: readonly string[]) {
  return activeFileHost() && !options?.allowedTypes?.length ? [...original, 'text'] : original;
}
export function LCOSNativeFileUploadAccept(types: readonly string[], original: string) {
  return activeFileHost() && types.includes('text') ? [original, ...extraExtensions.map(value => '.' + value)].filter(Boolean).join(',') : original;
}
export function LCOSNativeFileUploadValidate(file: { name?: unknown; size?: unknown }, types: readonly string[], original: () => unknown): any {
  if (!activeFileHost() || !types.includes('text') || !extraFile(file)) return original();
  if (typeof file.size !== 'number' || !Number.isFinite(file.size) || file.size <= 0 || file.size > 128 * 1024 * 1024)
    return { valid: false, error: 'common.upload-failed' };
  return { valid: true, mediaType: 'text' };
}
export function LCOSNativeFileUploadCanRead(file: { name?: unknown }, original: () => boolean) {
  return !!activeFileHost() && extraFile(file) || original();
}
export function LCOSNativeFileUploadCanTransfer(data: DataTransfer, original: () => boolean) {
  if (!activeFileHost() || !Array.from(data.types).includes('Files')) return original();
  return Array.from(data.items ?? []).some(item => item.kind === 'file'
    && (extraFile(item.getAsFile?.() ?? {}) || extraMimes.has(item.type.toLowerCase()))) || original();
}
export function LCOSNativeFileUploadEventOwned(event: { target?: EventTarget | null }): boolean {
  if (!activeFileHost()) return false;
  const target = event.target as Element | null;
  const element = target?.nodeType === 3 ? target.parentElement : target;
  return !!element?.closest?.('[data-lcos-composer-target],[data-library-panel],input,textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
}
export const LCOSNativeFileUploadScene = activeFileHost;
export function LCOSNativeFileUploadCurrent(scene: ReturnType<typeof activeFileHost>) {
  if (!scene) return true;
  const live = activeFileHost();
  return !!live && live.projectId === scene.projectId && live.canvasId === scene.canvasId && live.api === scene.api;
}

/** The exact opaque URL proves the upload at the facade. Its target View may
 * differ from the imported primary View, so only that facade may emit lcos_ref. */
export function LCOSNativeFileUploadNode(file: { name?: unknown }, result: any, position: Data,
  originalTextFactory: (data: Data, options: { position: Data }) => any, original: () => any) {
  const info = result?.fileInfo;
  if (!activeFileHost()) return original();
  if (!text(info?.artifact_kind)) return extraFile(file) ? null : original();
  if (info.artifact_kind === 'image') return original();
  if (!text(info.url) || !text(info.file_id) || !text(info.fileRecordId) || !text(info.mime_type)
    || info.mime_type.startsWith('image/') || !text(info.file_name) || !object(info.lcos_ref)
    || !['artifactId', 'artifactViewId', 'revisionId'].every(key => text(info.lcos_ref[key]))
    || typeof info.file_size !== 'number' || !Number.isFinite(info.file_size) || info.file_size < 0
    || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  return originalTextFactory({ title: info.file_name, text: '', prompt: '', lcos_upload_url: info.url,
    lcos_file_ref: { artifactId: info.lcos_ref.artifactId, artifactViewId: info.lcos_ref.artifactViewId,
      revisionId: info.lcos_ref.revisionId, fileRecordId: info.fileRecordId, mimeType: info.mime_type,
      kind: info.artifact_kind, size: info.file_size } }, { position });
}

type InputRef = { current: HTMLInputElement | null };
type LibraryUploadChoice = { current: any };
type OriginalLibraryStore = { getState(): any };
/** The shipped Library upload button opens its shipped input directly for
 * project material import. Virtual folders are views, never import scopes. */
export function LCOSNativeFileLibraryChoose(choice: LibraryUploadChoice, input: InputRef,
  space: unknown, store: OriginalLibraryStore, notice: any, privateSpace: unknown): boolean {
  const scene = activeFileHost();
  if (!scene) return false;
  if (space !== privateSpace || store.getState().activeSpace !== space || !input.current) {
    notice.error('请先切到项目材料，再上传文件。'); return true;
  }
  choice.current = { nativeFileUpload: true, scene, space, folderId: 'lcos-project:' + scene.projectId,
    search: store.getState().searchKeyword ?? '', store };
  input.current.click(); return true;
}

export async function LCOSNativeFileLibraryInput(event: { target: { files: FileList | null } }, choice: LibraryUploadChoice,
  input: InputRef, ports: { uploadFiles(files: File[]): Promise<any>; libraryStore: OriginalLibraryStore;
    fetchFolderAssets(folder: string, options: { force: boolean }): unknown; notice: any }): Promise<boolean> {
  const selected = choice.current;
  if (!selected?.nativeFileUpload) return false;
  choice.current = null;
  const current = () => LCOSNativeFileUploadCurrent(selected.scene) && selected.store === ports.libraryStore
    && ports.libraryStore.getState().activeSpace === selected.space && !!input.current;
  try {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return true;
    if (!current()) { ports.notice.error('上传现场已变化，未导入文件；请回项目材料重新选择。'); return true; }
    const result = await ports.uploadFiles(files);
    // No cloud saveAssets or Canvas command follows an already durable import.
    const rows = Array.isArray(result?.results) ? result.results : [];
    const confirmed = rows.filter((row: any) => row?.result?.success === true && object(row.result.fileInfo)
      && text(row.result.fileInfo.fileRecordId) && object(row.result.fileInfo.lcos_ref)
      && ['artifactId', 'artifactViewId', 'revisionId'].every(key => text(row.result.fileInfo.lcos_ref[key])));
    if (!current()) return true; // keep the original manager's result; never refresh a different Library owner.
    if (confirmed.length) {
      await ports.fetchFolderAssets(selected.folderId, { force: true });
      if (!current()) return true;
      await ports.libraryStore.getState().fetchFolders(selected.space, true);
      if (!current()) return true;
      const live = ports.libraryStore.getState();
      if (live.searchKeyword === selected.search && text(selected.search)) await live.searchAssets(selected.search);
      if (!current()) return true;
    }
    if (confirmed.length === files.length && result?.success === true) ports.notice.success('已上传到项目材料。');
    else ports.notice.error(confirmed.length ? '部分文件已上传，其余结果请在传输列表核对。' : '上传结果尚未确认，请在传输列表核对。');
  } catch { if (current()) ports.notice.error('上传尚未完成，请在传输列表核对。');
  } finally { if (input.current) input.current.value = ''; }
  return true;
}

/** A DTO-only semantic marker. It is never an independent material identity,
 * body cache or persisted Canvas schema field. Malformed markers stay read-only. */
export function LCOSHasNativeFileMarker(data: unknown): boolean {
  return object(data) && Object.prototype.hasOwnProperty.call(data, 'lcos_file_ref');
}
export function readNativeFileReference(data: unknown): NativeFileReference | undefined {
  if (!object(data) || !object(data.lcos_file_ref) || !object(data.lcos_ref)) return;
  const file = data.lcos_file_ref, ref = data.lcos_ref;
  if (ref.version !== 1 || !['artifact', 'view'].includes(String(ref.entityType))
    || !['entityId', 'artifactId', 'artifactViewId', 'revisionId'].every(key => text(ref[key]))
    || ref.entityId !== (ref.entityType === 'artifact' ? ref.artifactId : ref.artifactViewId)
    || !['artifactId', 'artifactViewId', 'revisionId', 'fileRecordId', 'mimeType', 'kind'].every(key => text(file[key]))
    || ['artifactId', 'artifactViewId', 'revisionId'].some(key => file[key] !== ref[key])
    || file.kind === 'image' || String(file.mimeType).startsWith('image/')
    || file.size !== undefined && (typeof file.size !== 'number' || !Number.isFinite(file.size) || file.size < 0)) return;
  return { artifactId: String(file.artifactId), artifactViewId: String(file.artifactViewId), revisionId: String(file.revisionId),
    fileRecordId: String(file.fileRecordId), mimeType: String(file.mimeType), kind: String(file.kind),
    ...(typeof file.size === 'number' ? { size: file.size } : {}) };
}

/** Bypass only the text-body reader for a real file. Original r4/s4 children,
 * frame, title, Pin, toolbar, selection, handles and O8 history stay in place. */
const NativeFileNodeContext = createContext<{ nodeId: string; title: string } | null>(null);
export function LCOSNativeFileTextOwner({ OriginalOwner, ...props }: SlotProps & { OriginalOwner: ComponentType<any> }) {
  return LCOSHasNativeFileMarker(props.data) ? <NativeFileNodeContext.Provider
    value={{ nodeId: props.nodeId, title: text(props.data.title) ? props.data.title : '' }}>{props.children}</NativeFileNodeContext.Provider>
    : createElement(OriginalOwner, props);
}
/** Reuse the existing sO clipboard action in the existing iBe group. A file
 * has no editable body to copy; its canonical visible name is the real value. */
export function LCOSUseNativeFileCopy(nodeId: string, originalValue: string) {
  const file = useContext(NativeFileNodeContext);
  return file?.nodeId === nodeId ? { value: file.title, label: '复制名称' } : { value: originalValue, label: undefined };
}

function formatLabel(file: NativeFileReference): string {
  const formats: Record<string, string> = {
    'application/pdf': 'PDF', 'text/markdown': 'Markdown', 'text/plain': '文本', 'text/csv': 'CSV',
    'application/json': 'JSON', 'application/yaml': 'YAML', 'application/xml': 'XML', 'text/html': 'HTML',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel', 'application/zip': 'ZIP',
  };
  const label = formats[file.mimeType] ?? (file.mimeType.startsWith('audio/') ? '音频'
    : file.mimeType.startsWith('video/') ? '视频' : '文件');
  if (file.size === undefined) return label;
  const size = file.size < 1024 ? `${file.size} B` : file.size < 1024 ** 2
    ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / 1024 ** 2).toFixed(1)} MB`;
  return `${label} · ${size}`;
}

function NativeFileBody(props: SlotProps) {
  const canvas = useCanvasStore(value => value);
  const [notice, setNotice] = useState('');
  const file = readNativeFileReference(props.data);
  const projectId = window.__LCOS_NODE_LAB__?.projectId;
  const canvasId = canvas.canvasId, api = canvas.rfInstance;
  const open = () => {
    const live = useCanvasStore.getState(), host = window.__LCOS_NODE_LAB__;
    const current = readNativeFileReference(live.nodes.find(node => node.id === props.nodeId)?.data);
    if (!file || !text(projectId) || !canvasId || !api || host?.api !== api || host.projectId !== projectId
      || live.canvasId !== canvasId || live.rfInstance !== api || !current
      || ['artifactId', 'artifactViewId', 'revisionId', 'fileRecordId'].some(key => current[key as keyof NativeFileReference] !== file[key as keyof NativeFileReference])) {
      setNotice('这份文件的位置或版本已变化，请重新打开后查看。'); return;
    }
    if (!nativeMaterialViewerAvailable()) { setNotice('阅读器暂未就绪，请稍后再查看。'); return; }
    setNotice('');
    requestNativeMaterialView({ projectId, artifactId: file.artifactId, artifactViewId: file.artifactViewId,
      revisionId: file.revisionId, nodeId: props.nodeId, sourceCanvasId: canvasId,
      ...(text(props.data.title) ? { title: props.data.title } : {}) });
  };
  return <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 overflow-auto p-4 text-sm text-muted-foreground"
    data-native-file-body="true" onDoubleClick={event => { event.stopPropagation(); open(); }}>
    <span>{file ? formatLabel(file) : '文件信息尚未确认'}</span>
    <button type="button" className="nodrag nopan rounded-lg border border-border bg-background px-3 py-1.5 text-foreground hover:bg-muted"
      disabled={!file} onClick={event => { event.stopPropagation(); open(); }}
      onDoubleClick={event => event.stopPropagation()}>查看文件</button>
    {notice && <span role="status" className="max-w-full text-center text-xs">{notice}</span>}
  </div>;
}

export function LCOSNativeFileTextBodySlot({ OriginalBodySlot, ...props }: SlotProps & { OriginalBodySlot: ComponentType<any> }) {
  return LCOSHasNativeFileMarker(props.data) ? <NativeFileBody {...props} /> : createElement(OriginalBodySlot, props);
}
