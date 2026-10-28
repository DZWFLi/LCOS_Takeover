import type { AssemblyApplyRequestV1, AssemblyApplyResultV1, AssemblySourceRefV1, PresentationViewV0, ProjectGraphSnapshot } from '../../lcos/packages/contracts/src/index';
import type { DropPayload } from '../../lcos/apps/web-gen2/src/interaction/semanticDropMachine';
import type { DropAssemblyApplyIntent, DropCommitReceipt, DropTargetRegistration } from '../../lcos/huabu/apps/web/src/lcos/drop/dropTypes';
import { CoreAssemblyClient } from '../../lcos/apps/web-gen2/src/backend/assembly';
import { CoreProjectClient } from '../../lcos/apps/web-gen2/src/backend/projects';
import { HttpClient } from '../../lcos/apps/web-gen2/src/backend/client';
import { assemblyDropReceipt } from '../../lcos/huabu/apps/web/src/lcos/drop/dropAssemblyReceipt';
import { resolveDropIntent } from '../../lcos/huabu/apps/web/src/lcos/drop/dropIntentResolver';
import { isDropPointExposed } from '../../lcos/huabu/apps/web/src/lcos/drop/dropOcclusion';
import { rectFromDomRect } from '../../lcos/huabu/apps/web/src/lcos/drop/dropTargetRegistry';
import type { NativeLibraryMaterialPorts, NativeLibraryRelease } from './native-library-material-dispatch';
import { withNativeLibraryDropRecovery } from './native-library-material-dispatch';
import { captureNativeDropFeedback, readNativeDropFeedbackCapture, readNativeLibraryDropCapture, markNativeLibraryPlacementReceipt } from './native-library-drop';

export type NativeLibraryScopeAddress = { readonly kind: 'context' | 'workflow'; readonly id: string };
export function nativeLibraryScopePreviewTargetId(projectId: string, target: NativeLibraryScopeAddress): string {
  return 'native-library-scope-preview:' + JSON.stringify([projectId, target.kind, target.id]);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const sameSourceRefs = (a: readonly AssemblySourceRefV1[], b: readonly AssemblySourceRefV1[]) => a.length === b.length
  && a.every((ref, index) => same(ref, b[index]));

/** The existing visible Popover body is the receiver. A disabled body rejects
 * the drop instead of opening a hole onto the underlying Canvas. */
export function nativeLibraryScopePreviewRegistration(element: HTMLElement, projectId: string, target: NativeLibraryScopeAddress,
  label: string, current: () => boolean): DropTargetRegistration {
  const readRect = () => {
    if (!element.isConnected || element.closest('[inert],[aria-hidden="true"]')) return undefined;
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    if (style?.display === 'none' || style?.visibility === 'hidden' || style?.opacity === '0') return undefined;
    const rect = rectFromDomRect(element.getBoundingClientRect());
    return rect.width > 0 && rect.height > 0 ? rect : undefined;
  };
  return { targetId: nativeLibraryScopePreviewTargetId(projectId, target), kind: 'spatial-membership',
    semantic: { kind: 'spatial-membership', targetRef: { ...target } }, label, priority: 75,
    rect: rectFromDomRect(element.getBoundingClientRect()), readRect,
    acceptsPoint: point => isDropPointExposed(element, point),
    get enabled() { return current(); },
    get ineligibleReason() { return current() ? undefined : '预览内容正在核对，原对象保留。'; },
  };
}

function materialReferences(payload: Extract<DropPayload, { kind: 'objects' | 'assembly' }>) {
  return payload.kind === 'objects' ? payload.objects : payload.reference ? [payload.reference] : [];
}
function verifyMaterialVersions(payload: Extract<DropPayload, { kind: 'objects' | 'assembly' }>, graph: ProjectGraphSnapshot,
  sourceRefs: readonly AssemblySourceRefV1[], projectId: string): void {
  const references = materialReferences(payload), captured = readNativeLibraryDropCapture(payload);
  for (const source of sourceRefs) {
    if (source.kind !== 'artifactView') continue;
    const material = references.find(ref => ref.artifactViewId === source.id
      || ['view', 'artifactView'].includes(ref.entityType) && ref.entityId === source.id);
    const artifactId = material?.artifactId ?? (material?.entityType === 'artifact' ? material.entityId : undefined);
    const revisionId = material?.revisionId;
    const view = graph.artifactViews.find(row => String(row.id) === source.id);
    const artifact = graph.artifacts.find(row => String(row.id) === String(view?.artifactId));
    const revision = graph.artifactRevisions.find(row => String(row.id) === revisionId && String(row.artifactId) === artifactId);
    const file = graph.fileRecords.find(row => String(row.id) === String(revision?.fileRecordId));
    // Assembly stores a View reference, not an immutable revision. Admit only
    // the exact revision currently represented by that View; no historical
    // fallback or new View/node is created by this receiver. This is a read
    // check, not a server-side compare-and-swap guarantee.
    if (!material || !text(artifactId) || !text(revisionId) || !view || !artifact || !revision || !file
      || String(artifact.id) !== artifactId || String(artifact.projectId) !== projectId || artifact.archivedAt !== undefined
      || String(view.revisionId ?? artifact.currentRevisionId) !== revisionId
      || !['current', 'superseded'].includes(revision.status) || String(file.projectId) !== projectId
      || file.availability !== 'current' || !revision.contentHash || file.observedHash !== revision.contentHash
      || captured && (captured.artifactId !== artifactId || captured.artifactViewId !== source.id
        || captured.revisionId !== revisionId || captured.fileRecordId !== String(file.id)))
      throw new Error('材料的原版本已变化，未换用最新版本；请重新拿起后再加入。');
  }
}
function memberPresent(presentation: PresentationViewV0 | undefined, source: AssemblySourceRefV1): boolean {
  if (!presentation) return false;
  if (source.kind === 'artifactView') return presentation.state.memberViewIds.includes(source.id);
  const type = source.kind === 'context' || source.kind === 'workflow' ? 'scope'
    : source.kind === 'scene' ? 'workspace' : source.kind === 'collection' ? 'collection' : source.kind === 'note' ? 'note' : undefined;
  return !!type && (presentation.state.memberEntityRefs ?? []).some(ref => ref.type === type && ref.id === source.id);
}
export interface NativeLibraryScopePreviewPorts extends NativeLibraryMaterialPorts {
  readonly http?: HttpClient;
}

/** Membership-only adapter inside the original Router transaction. Its exact
 * receiver must be considered before the Canvas material-placement adapter. */
export function createNativeLibraryScopePreviewDispatcher(release: NativeLibraryRelease, payload: DropPayload,
  transactionId: string, ports: NativeLibraryScopePreviewPorts) {
  const http = ports.http ?? new HttpClient({ baseUrl: '/api/lcos/core' });
  const projects = new CoreProjectClient(http), assembly = new CoreAssemblyClient(http);
  return { async handle(intent: DropAssemblyApplyIntent, tx: string, signal?: AbortSignal): Promise<DropCommitReceipt | undefined> {
    if (!intent.targetId.startsWith('native-library-scope-preview:')) return undefined;
    const projectId = release.projectId, failure = (message: string): DropCommitReceipt => ({ status: 'failed',
      transactionId: tx, targetId: intent.targetId, projectId, message });
    if ((intent.targetRef.kind !== 'context' && intent.targetRef.kind !== 'workflow') || !text(intent.targetRef.id)
      || !release.api || !release.canvasId || tx !== transactionId || intent.portalReceive || intent.railwayReceive || intent.railwayDestinationRef
      || (payload.kind !== 'objects' && payload.kind !== 'assembly')) return failure('预览接收身份尚未就绪，原对象保留。');
    const target = { kind: intent.targetRef.kind, id: intent.targetRef.id };
    if (intent.targetId !== nativeLibraryScopePreviewTargetId(projectId, target)) return failure('预览身份与接收位置不一致。');
    const capture = readNativeDropFeedbackCapture(payload);
    if (capture && (capture.projectId !== projectId || capture.canvasId !== release.canvasId || capture.api !== release.api)
      || payload.kind === 'assembly' && !capture) return failure('拿起来源已变化，没有加入其他预览。');
    const registered = ports.target(intent.targetId);
    const resolved = registered && resolveDropIntent(payload, registered);
    if (!resolved || resolved.status !== 'ready' || resolved.intent.kind !== 'assembly-apply'
      || !same(resolved.intent.targetRef, target) || !sameSourceRefs(resolved.intent.sourceRefs, intent.sourceRefs)
      || !intent.sourceRefs.length || intent.sourceRefs.some(ref => !['artifactView', 'note', 'collection', 'context', 'workflow', 'scene'].includes(ref.kind)))
      return failure('这组对象的已保存引用尚未完整接通，未拆开加入。');
    const request: AssemblyApplyRequestV1 = { schemaVersion: 1, projectId,
      targetRef: target, sourceRefs: intent.sourceRefs.map(ref => ({ ...ref })) };
    const current = (recovery: boolean, requestSignal?: AbortSignal) => {
      const now = ports.current(), receiver = ports.target(intent.targetId);
      return !requestSignal?.aborted && now.projectId === projectId && now.canvasId === release.canvasId && now.api === release.api
        && now.workspaceId === release.workspaceId && now.surface === release.surface
        && ports.gesture(payload, tx, intent.targetId, recovery) && receiver?.enabled === true
        && receiver.semantic.kind === 'spatial-membership' && same(receiver.semantic.targetRef, target);
    };
    const read = async (recovery: boolean, requestSignal?: AbortSignal) => {
      if (!current(recovery, requestSignal)) throw new Error('预览或现场已变化，未改投其他位置。');
      const [graph, presentations] = await Promise.all([projects.getProjectGraph(projectId), projects.listPresentations(projectId, requestSignal)]);
      if (!current(recovery, requestSignal) || !graph || String(graph.project.id) !== projectId
        || graph.scopes.filter(scope => String(scope.id) === target.id && String(scope.projectId) === projectId && scope.kind === target.kind).length !== 1)
        throw new Error('这份预览的准确 Scope 暂时无法核对。');
      const matches = presentations.filter(view => view.id === `presentation:${target.kind}:${target.id}`);
      if (matches.length > 1 || matches.some(view => view.projectId !== projectId || view.scopeId !== target.id || view.capability !== target.kind))
        throw new Error('预览成员记录身份不一致，原对象保留。');
      return { graph, presentation: matches[0] };
    };
    let originalReceipt: AssemblyApplyResultV1 | undefined;
    const mark = (status: DropCommitReceipt['status'], message: string, presentation?: PresentationViewV0): DropCommitReceipt => {
      const original = assemblyDropReceipt(intent, tx, originalReceipt, projectId);
      return markNativeLibraryPlacementReceipt({ ...original, status, message, retrySourceRefs: [],
        canonicalReceipt: { targetRef: target, ...(originalReceipt ? { assembly: originalReceipt } : {}), ...(presentation ? { presentation } : {}) } }, payload);
    };
    const check = async (requestSignal?: AbortSignal, recovery = true): Promise<DropCommitReceipt> => {
      try {
        const value = await read(recovery, requestSignal);
        const count = request.sourceRefs.filter(ref => memberPresent(value.presentation, ref)).length;
        const reviewed = assemblyDropReceipt(intent, tx, originalReceipt, projectId);
        const status = count === request.sourceRefs.length ? 'success'
          : count || reviewed.status !== 'failed' || reviewed.unknownSourceKeys?.length ? 'partial' : 'failed';
        const receipt = mark(status, status === 'success' ? (target.kind === 'context' ? '已加入这份上下文。' : '已加入这份工作流的引用。')
          : '成员结果尚未完整确认，已保存内容保留；核对不会重新提交。', value.presentation);
        return status === 'success' ? receipt : withNativeLibraryDropRecovery(receipt, next => check(next));
      } catch {
        return withNativeLibraryDropRecovery(mark('partial', '加入结果尚未确认，原对象保留；请核对原预览，不会重复加入。'), next => check(next));
      }
    };
    try {
      if (payload.kind === 'objects' && request.sourceRefs.some(ref => ref.kind === 'artifactView')) {
        if (!current(false, signal) || !release.api.flushCanvas
          || await release.api.flushCanvas(release.canvasId) !== 'saved')
          return failure('原材料的编辑尚未确认保存，未加入预览。');
      }
      const before = await read(false, signal);
      verifyMaterialVersions(payload, before.graph, request.sourceRefs, projectId);
      for (const source of request.sourceRefs) if (source.kind === 'context' || source.kind === 'workflow') {
        if (!before.graph.scopes.some(scope => String(scope.id) === source.id && String(scope.projectId) === projectId && scope.kind === source.kind))
          throw new Error('整体引用的原 Scope 身份已变化，未改成另一类内容。');
      }
      if (!capture) {
        const labels = materialReferences(payload).map(ref => ref.displayLabel).filter(text);
        captureNativeDropFeedback(payload, { projectId, canvasId: release.canvasId, api: release.api,
          title: labels.length === 1 ? labels[0]! : request.sourceRefs.length + ' 项引用' });
      }
      if (request.sourceRefs.every(ref => memberPresent(before.presentation, ref))) {
        return mark('success', '内容已在这份预览中。', before.presentation);
      }
      if (!current(false, signal)) return failure('预览或现场已变化，未提交。');
      // Never include placementBySource: the existing Assembly owner only
      // updates this Scope's Presentation membership and keeps method steps.
      try { originalReceipt = await assembly.apply(projectId, request, signal); }
      catch { /* The request may have committed. Only read the original target. */ }
      return check(signal, false);
    } catch (error) { return failure(error instanceof Error ? error.message : '原对象与预览暂时无法核对，未加入。'); }
  } };
}
