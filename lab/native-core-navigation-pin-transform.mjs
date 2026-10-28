import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const nativeCoreNavigationPinRouteSource='lcos/apps/local-core/src/routes/navigation-markers.ts';
export const nativeCoreNavigationPinServiceSource='lcos/apps/local-core/src/navigation-marker-service.ts';
function adapt(source,sourcePath,owner,marker,edits){
 if(path.resolve(sourcePath??'')!==path.resolve(root,owner))throw Error('Navigation pin transform requires its exact original source owner.');
 const eol=source.includes('\r\n')?'\r\n':'\n';let next=source.replaceAll('\r\n','\n');
 if(next.includes(marker)){if(next.split(marker).length!==2)throw Error('Navigation pin transform duplicated.');return source;}
 for(const[before,after]of edits){if(next.split(before).length!==2)throw Error('Navigation pin original seam changed: '+before.slice(0,90));next=next.replace(before,after);}
 return next.replaceAll('\n',eol);
}
const originalCreate='    const { marker, changeSet } = mutationSafety.addSpatialMarker({';
const deduplicate=String.raw`    // lcos-native-navigation-pin-deduplicate: same synchronous Core owner,
    // after its existing validation/guard and before the original transaction.
    const existingMarkers = db.listSpatialMarkerIntents(projectId).filter(marker =>
      marker.targetRef.projectId === String(projectId)
      && marker.targetRef.kind === input.targetRef.kind && marker.targetRef.id === input.targetRef.id
      && marker.scope === input.scope && marker.sourceSurfaceRef === input.sourceSurfaceRef)
    if (existingMarkers.length > 1) {
      sendJson(response, 409, failure('CONFLICT', 'Several existing markers match this exact target and scope; no record was changed.'))
      return true
    }
    if (existingMarkers.length === 1) {
      sendJson(response, 200, { ok: true, value: existingMarkers[0] })
      return true
    }
`;
export function transformNativeCoreNavigationPinRoute(source,{sourcePath}={}){
 return adapt(source,sourcePath,nativeCoreNavigationPinRouteSource,'lcos-native-navigation-pin-deduplicate',[[originalCreate,deduplicate+originalCreate]]);
}
const originalCandidates='    const candidateCount = [projectNote, conversation, scope, workspace, artifact]';
const candidates=String.raw`    // lcos-native-navigation-pin-typed: canonical exact IDs still participate
    // in the same cross-table ambiguity check; no query-order fallback.
    const collectionValue = this.#metadata.getCollection(entityId)
    const collection = collectionValue !== undefined && String(collectionValue.projectId) === String(projectId) ? collectionValue : undefined
    const runValue = this.#metadata.getRun(entityId as Parameters<SqliteMetadataRepository['getRun']>[0])
    const run = runValue !== undefined && String(runValue.projectId) === String(projectId) ? runValue : undefined
    const slotValue = this.#metadata.getResultSlot(entityId)
    const slot = slotValue !== undefined && String(slotValue.projectId) === String(projectId) ? slotValue : undefined
    const candidateCount = [projectNote, conversation, scope, workspace, artifact, collection, run, slot]`;
const originalNote='    // Note：按 anchor 归属 surface；无 canonical 坐标（worldPosition 留空，诚实）。';
const typedResolve=String.raw`    if (collection !== undefined) return this.#resolveTypedPinEntity(projectId, collection)
    if (run !== undefined) return this.#resolveTypedPinEntity(projectId, run)
    if (slot !== undefined) return this.#resolveTypedPinEntity(projectId, slot)

`;
const typedHelper=String.raw`  #resolveTypedPinEntity(projectId: string, entity: { readonly id: unknown; readonly workspaceId?: unknown; readonly scopeId?: unknown; readonly archivedAt?: unknown }): NavigationResolutionV0 {
    if (entity.archivedAt) return { status: 'unresolved', reason: 'target-missing' }
    const anchorRef = String(entity.id)
    if (entity.workspaceId !== undefined) {
      if (typeof entity.workspaceId !== 'string' || !entity.workspaceId) return { status: 'unresolved', reason: 'target-missing' }
      const workspace = this.#metadata.getWorkspace(entity.workspaceId)
      if (!workspace || String(workspace.projectId) !== String(projectId) || ('archivedAt' in workspace && workspace.archivedAt))
        return { status: 'unresolved', reason: 'target-missing' }
      const scope = this.#findScope(projectId, String(workspace.scopeId))
      if (!scope || ('archivedAt' in scope && scope.archivedAt)) return { status: 'unresolved', reason: 'target-missing' }
      return { status: 'resolved', target: { projectId, surfaceRef: ('workspace:' + String(workspace.id)) as StableSurfaceRefV0, surfaceKind: 'scene', anchorRef } }
    }
    if (entity.scopeId !== undefined) {
      if (typeof entity.scopeId !== 'string' || !entity.scopeId) return { status: 'unresolved', reason: 'target-missing' }
      const scope = this.#findScope(projectId, entity.scopeId)
      if (!scope || ('archivedAt' in scope && scope.archivedAt)) return { status: 'unresolved', reason: 'target-missing' }
      const surface = this.#surfaceForScope(scope)
      return surface ? { status: 'resolved', target: { projectId, surfaceRef: surface.surfaceRef, surfaceKind: surface.surfaceKind, anchorRef } }
        : { status: 'unresolved', reason: 'unknown-surface' }
    }
    return { status: 'resolved', target: { projectId, surfaceRef: 'main', surfaceKind: 'main', anchorRef } }
  }

`;
export function transformNativeCoreNavigationPinService(source,{sourcePath}={}){
 return adapt(source,sourcePath,nativeCoreNavigationPinServiceSource,'lcos-native-navigation-pin-typed',[
  [originalCandidates,candidates],[originalNote,typedResolve+originalNote],['  #resolveNote(projectId: string, note: Note): NavigationResolutionV0 {',typedHelper+'  #resolveNote(projectId: string, note: Note): NavigationResolutionV0 {'],
 ]);
}
export function createNativeCoreNavigationPinTransforms(){return{
 [nativeCoreNavigationPinRouteSource]:transformNativeCoreNavigationPinRoute,
 [nativeCoreNavigationPinServiceSource]:transformNativeCoreNavigationPinService,
};}
