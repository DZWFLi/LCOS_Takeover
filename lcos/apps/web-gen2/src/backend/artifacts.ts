// Core Artifact typed HTTP boundary — real artifact routes only.
// getArtifactDetail + listArtifactRevisions + searchArtifactTitles.
// Deliberately NOT createArtifact / listAll (the artifact route has no
// generic POST /artifacts, and search?q='' is 50-item title search, NOT a
// full project artifact list).

import type { Artifact, ArtifactRevision, ArtifactView } from '@local-creative-os/domain';
import { HttpClient } from './client.js';
import { coreRequest, unwrapCoreValue, toCoreApiError, type CoreEnvelope } from './coreTypes.js';
import type { ProjectionBinding } from '../spatial/projectionBinding.js';

export interface ArtifactRunRef {
  id: string;
  instruction: string | null;
  provider: string | null;
}

export interface ArtifactDetailRevision {
  id: string;
  status: string;
  source: string;
  createdAt: string;
  run?: ArtifactRunRef;
}

/** Route-specific projection of GET /artifacts/:artifactId. */
export interface ArtifactDetailProjection {
  artifact: Artifact;
  currentRevisionId?: string;
  revisions: ArtifactDetailRevision[];
}

/** R4：单行 diff（Core 只对可读文本给出 diff；不可读时整段缺席）。 */
export interface RevisionCompareLineV1 {
  readonly type: 'same' | 'add' | 'remove';
  readonly text: string;
}

/**
 * Route-specific projection of GET /projects/:projectId/revisions/compare。
 * `contentAvailable` 为 false 时只有元数据可比 —— 呈现层必须如实说明，不得伪造 diff。
 */
export interface RevisionCompareResultV1 {
  readonly base: { readonly revisionId: string; readonly contentHash: string; readonly size: number; readonly mimeType: string };
  readonly head: { readonly revisionId: string; readonly contentHash: string; readonly size: number; readonly mimeType: string };
  readonly changed: boolean;
  readonly contentAvailable: boolean;
  readonly diff?: readonly RevisionCompareLineV1[];
}

export interface CanvasTextAddress { readonly canvasId: string; readonly spatialId: string }
export interface CanvasTextSnapshot extends CanvasTextAddress {
  readonly projectId: string; readonly artifactId: string; readonly viewId: string;
  readonly revisionId: string; readonly fileRecordId: string; readonly body: string; readonly title: string;
}
export interface CanvasTextWrite extends CanvasTextAddress {
  readonly body: string; readonly expectedRevisionId: string | null; readonly artifactId?: string;
}

export class CoreArtifactClient {
  constructor(private readonly http: HttpClient) {}

  /** Existing GEN1 registered-source routes, independent from the selected reading revision. */
  artifactSourcePath(artifactId: string, signal?: AbortSignal): Promise<{ path: string; exists: boolean; isUrl: boolean }> {
    return coreRequest(this.http, 'GET', `/artifacts/${encodeURIComponent(artifactId)}/source-path`, { signal });
  }
  openArtifactSource(artifactId: string, signal?: AbortSignal): Promise<{ opened: boolean; path: string }> {
    return coreRequest(this.http, 'POST', `/artifacts/${encodeURIComponent(artifactId)}/open`, { signal });
  }
  revealArtifactSource(artifactId: string, signal?: AbortSignal): Promise<{ revealed: boolean; path: string }> {
    return coreRequest(this.http, 'POST', `/artifacts/${encodeURIComponent(artifactId)}/reveal`, { signal });
  }

  /** Existing GEN1 ingress, reused for extracted material without a native-only clone. */
  createTextArtifact(projectId: string, input: { title?: string; body: string; scopeId: string; workspaceId?: string; x?: number; y?: number }, signal?: AbortSignal): Promise<{
    artifactId: string; revisionId: string; viewId: string; fileRecordId: string; title: string;
  }> {
    return coreRequest(this.http, 'POST', `/projects/${encodeURIComponent(projectId)}/text-artifacts`, { body: input, signal });
  }

  async importCopiedFile(projectId: string, input: { file: File; importRequestId: string; scopeId: string; position: { x: number; y: number };
    nativeCarrier?: { canvasId: string; spatialId: string; size: ArtifactView['size'] } }, signal?: AbortSignal): Promise<{
    artifact: Artifact; revision: ArtifactRevision; view: ArtifactView; reused: boolean; binding?: ProjectionBinding;
  }> {
    const form = new FormData();
    form.set('file', input.file, input.file.name); form.set('importRequestId', input.importRequestId);
    form.set('scopeId', input.scopeId); form.set('position.x', String(input.position.x)); form.set('position.y', String(input.position.y));
    if(input.nativeCarrier){form.set('nativeCarrier.canvasId',input.nativeCarrier.canvasId);form.set('nativeCarrier.spatialId',input.nativeCarrier.spatialId);
      form.set('nativeCarrier.width',String(input.nativeCarrier.size.width));form.set('nativeCarrier.height',String(input.nativeCarrier.size.height));}
    try { return unwrapCoreValue(await this.http.postForm<CoreEnvelope<{ artifact: Artifact; revision: ArtifactRevision; view: ArtifactView; reused: boolean; binding?: ProjectionBinding }>>(
      `/projects/${encodeURIComponent(projectId)}/imports`, form, signal)); }
    catch (error) { throw toCoreApiError(error); }
  }

  getArtifactView(projectId:string,viewId:string,signal?:AbortSignal):Promise<ArtifactView>{
    return coreRequest(this.http,'GET',`/projects/${encodeURIComponent(projectId)}/artifact-views/${encodeURIComponent(viewId)}`,{signal});
  }
  putArtifactView(projectId:string,view:ArtifactView,signal?:AbortSignal):Promise<ArtifactView>{
    return coreRequest(this.http,'PUT',`/projects/${encodeURIComponent(projectId)}/artifact-views/${encodeURIComponent(String(view.id))}`,{body:view,signal});
  }

  renameEntity(entity: 'project' | 'workspace' | 'artifact' | 'scope', id: string, title: string, signal?: AbortSignal): Promise<{ id: string; entity: string; title: string; mode: string }> {
    return coreRequest(this.http, 'POST', `/entities/${entity}/${encodeURIComponent(id)}/title`, { body: { title, mode: 'manual', generatedBy: 'user' }, signal });
  }

  readCanvasText(projectId: string, address: CanvasTextAddress, signal?: AbortSignal): Promise<CanvasTextSnapshot | null> {
    const query = new URLSearchParams({ canvasId: address.canvasId, spatialId: address.spatialId });
    return coreRequest(this.http, 'GET', `/projects/${encodeURIComponent(projectId)}/curation/canvas-text?${query}`, signal ? { signal } : {});
  }

  saveCanvasText(projectId: string, input: CanvasTextWrite): Promise<CanvasTextSnapshot> {
    return coreRequest(this.http, 'PUT', `/projects/${encodeURIComponent(projectId)}/curation/canvas-text`, { body: input });
  }

  listArtifacts(projectId: string, lifecycle: 'active' | 'archived' | 'all' = 'active'): Promise<Artifact[]> {
    return coreRequest<Artifact[]>(this.http, 'GET',
      `/projects/${encodeURIComponent(projectId)}/artifacts?lifecycle=${encodeURIComponent(lifecycle)}`);
  }

  archiveArtifact(projectId: string, artifactId: string): Promise<Artifact> {
    return coreRequest<Artifact>(this.http, 'POST',
      `/projects/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(artifactId)}/archive`,
      { body: { operationId: crypto.randomUUID() } });
  }

  restoreArtifact(projectId: string, artifactId: string): Promise<Artifact> {
    return coreRequest<Artifact>(this.http, 'POST',
      `/projects/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(artifactId)}/restore`,
      { body: { operationId: crypto.randomUUID() } });
  }

  /** GET /artifacts/:artifactId. */
  getArtifactDetail(artifactId: string, signal?: AbortSignal): Promise<ArtifactDetailProjection> {
    return coreRequest<ArtifactDetailProjection>(
      this.http,
      'GET',
      `/artifacts/${encodeURIComponent(artifactId)}`,
      { signal },
    );
  }

  /** GET /artifacts/:artifactId/revisions -> real ArtifactRevision[]. */
  listArtifactRevisions(artifactId: string, signal?: AbortSignal): Promise<ArtifactRevision[]> {
    return coreRequest<ArtifactRevision[]>(
      this.http,
      'GET',
      `/artifacts/${encodeURIComponent(artifactId)}/revisions`,
      { signal },
    );
  }

  /**
   * 读取某个 FileRecord 的**真实字节内容**（Core 已实现的字节出口）。
   * `GET /projects/:projectId/file-records/:fileRecordId/content` → 原始字节 + FileRecord.mimeType。
   * 呈现层据此拿真实正文/图片；只读，不落库、不复制真值。
   */
  getFileRecordContent(projectId: string, fileRecordId: string, signal?: AbortSignal): Promise<Blob> {
    return this.http.getBlob(
      `/projects/${encodeURIComponent(projectId)}/file-records/${encodeURIComponent(fileRecordId)}/content`,
      signal,
    );
  }

  /** 同上，但按文本读出（仅供文本族预览；调用方自行限长）。 */
  getFileRecordText(projectId: string, fileRecordId: string, signal?: AbortSignal): Promise<string> {
    return this.http.getText(
      `/projects/${encodeURIComponent(projectId)}/file-records/${encodeURIComponent(fileRecordId)}/content`,
      signal,
    );
  }

  /**
   * GET /projects/:projectId/artifacts/search?q=... -> up to 50 artifact
   * title substring matches. Empty q returns the first 50 and MUST NOT be
   * treated as the full project artifact list (use ProjectGraphSnapshot).
   */
  searchArtifactTitles(projectId: string, q: string): Promise<Artifact[]> {
    const encoded = encodeURIComponent(q);
    return coreRequest<Artifact[]>(
      this.http,
      'GET',
      `/projects/${encodeURIComponent(projectId)}/artifacts/search?q=${encoded}`,
    );
  }

  /**
   * R4 Reader：真实 revision 对比（canonical owner = Core RuntimeRevisionCompareService）。
   * `GET /projects/:projectId/revisions/compare?base=&head=` → 元数据（hash/size/mime）+ changed
   * + 可选逐行 diff。`contentAvailable=false` 时只有元数据可比，呈现层必须如实说明，
   * 不得伪造行级差异。
   */
  compareRevisions(
    projectId: string,
    baseRevisionId: string,
    headRevisionId: string,
    signal?: AbortSignal,
  ): Promise<RevisionCompareResultV1> {
    const query = new URLSearchParams({ base: baseRevisionId, head: headRevisionId });
    return coreRequest<RevisionCompareResultV1>(
      this.http,
      'GET',
      `/projects/${encodeURIComponent(projectId)}/revisions/compare?${query.toString()}`,
      { signal },
    );
  }
}
