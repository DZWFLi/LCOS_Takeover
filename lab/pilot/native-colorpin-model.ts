import type { ColorPinDefinitionV0, ColorPinMembershipV0, ColorPinSnapshotV0, SpatialMarkerTargetRefV0 } from '../../lcos/packages/contracts/src/index';
import { colorPinTargetKey } from '../../lcos/apps/web-gen2/src/presentation/colorPinPresentation';

type Row = Record<string, any>;
export interface NativePinScene { projectId: string; canvasId: string; workspaceId: string; api: object; nodes: readonly Row[]; surfaceRef?: string }
export interface NativePinFacts { snapshot: ColorPinSnapshotV0; graph: Row; bindings: readonly Row[];
  connectedConversations?: readonly Row[]; runs?: readonly Row[]; resultSlots?: readonly Row[] }
export interface NativePinChoice { id: string; hex: string; nameKey?: string; label?: string; definitionId?: string }
export interface NativePinNode { managed: boolean; target?: SpatialMarkerTargetRefV0; entityIds: readonly string[];
  pins: readonly string[]; memberships: readonly ColorPinMembershipV0[]; primaryGroup?: NativePinChoice }
export interface NativePinGroup { groupId: string; color: string; definitionId: string; label?: string; updatedAt: string;
  group: NativePinChoice; nodeIds: readonly string[]; count: number; membershipIds: readonly string[]; sharedMembershipCount: number; surfaceMembershipCount: number }
export const nativePinDefaults: readonly NativePinChoice[] = [
  ['F0606B', 'red'], ['F4A14B', 'orange'], ['EDC63D', 'yellow'], ['4FC978', 'green'], ['4EA8FF', 'blue'], ['A55CF0', 'purple'],
].map(([id, name]) => ({ id: id!, hex: '#' + id, nameKey: 'canvas.pin.colors.' + name }));
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
export const nativePinColorKey = (color: string) => /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1).toUpperCase() : undefined;
export function nativePinChoice(key: string, fallback: readonly NativePinChoice[] = nativePinDefaults): NativePinChoice | undefined {
  return fallback.find(choice => choice.id === key) ?? (/^[0-9A-F]{6}$/.test(key) ? { id: key, hex: '#' + key } : undefined);
}
const primaryReferenceFields = ['lcos_ref','lcos_collection_ref','lcos_conversation_ref','lcos_execution_ref','lcos_run_ref','lcos_member_ref'] as const;
export const nativeManagedPinNode = (node: Row | undefined): boolean => !!node?.data
  && [...primaryReferenceFields,'lcos_result_ref','lcos_file_ref','lcosCollectionId','lcosCollectionNodeId','lcos_native_collection','lcos_method_member_ref'].some(key => node.data[key] !== undefined);
const liveEntity = (value: Row) => !value.archivedAt && !value.deletedAt;
const entityTables: Record<string,string> = { artifact:'artifacts',collection:'collections',conversation:'connectedConversations',run:'runs',
  note:'notes',scope:'scopes',workspace:'workspaces','result-slot':'resultSlots' };
function factRows(facts: NativePinFacts,key: string): readonly Row[] {
  const direct = (facts as unknown as Row)[key];
  return direct !== undefined ? Array.isArray(direct) ? direct : [] : Array.isArray(facts.graph?.[key]) ? facts.graph[key] : [];
}
function uniqueEntity(facts: NativePinFacts,projectId: string,type: string,id: string): Row | undefined {
  const field=entityTables[type];if(!field||!text(id))return;
  const matches=factRows(facts,field).filter(row=>row.id===id&&row.projectId===projectId);
  if(matches.length!==1||!liveEntity(matches[0]!))return;
  // Existing entity refs are untyped; a cross-table ID must never be resolved
  // by table order or by a carrier's appearance.
  const collisions=Object.values(entityTables).reduce((count,key)=>count+factRows(facts,key).filter(row=>row.id===id&&row.projectId===projectId).length,0);
  return collisions===1?matches[0]:undefined;
}
function typedWorkspace(scene: NativePinScene,facts: NativePinFacts): Row | undefined {
  const owners=factRows(facts,'workspaces').filter(row=>row.canvasId===scene.canvasId),workspace=owners[0];
  const scopes=workspace?factRows(facts,'scopes').filter(row=>row.id===workspace.scopeId):[];
  return owners.length===1&&workspace?.id===scene.workspaceId&&workspace.projectId===scene.projectId&&liveEntity(workspace)
    &&scopes.length===1&&scopes[0]?.projectId===scene.projectId&&liveEntity(scopes[0])?workspace:undefined;
}
export function validateNativePinSnapshot(value: ColorPinSnapshotV0, projectId: string): ColorPinSnapshotV0 {
  if (!value || !Array.isArray(value.definitions) || !Array.isArray(value.memberships)) throw new Error('Pin snapshot unavailable');
  const definitions = new Set<string>(), colors = new Set<string>(), memberships = new Set<string>(), targets = new Set<string>();
  for (const definition of value.definitions) {
    const key = nativePinColorKey(definition?.color);
    if (!definition || definition.projectId !== projectId || !text(definition.id) || !key || definitions.has(definition.id) || colors.has(key))
      throw new Error('Pin definition identity mismatch');
    definitions.add(definition.id); colors.add(key);
  }
  for (const membership of value.memberships) {
    const ref = membership?.targetRef;
    if (!membership || membership.projectId !== projectId || !text(membership.id) || memberships.has(membership.id)
      || !definitions.has(membership.colorPinId) || !ref || ref.projectId !== projectId || !['view', 'entity', 'surface'].includes(ref.kind) || !text(ref.id))
      throw new Error('Pin membership identity mismatch');
    const key = membership.colorPinId + '/' + colorPinTargetKey(ref);
    if (targets.has(key)) throw new Error('Duplicate Pin target membership');
    targets.add(key); memberships.add(membership.id);
  }
  return value;
}
export function nativePinChoices(snapshot: ColorPinSnapshotV0): readonly NativePinChoice[] {
  const choices = [...nativePinDefaults];
  for (const definition of snapshot.definitions) {
    const id = nativePinColorKey(definition.color)!;
    const old = choices.findIndex(choice => choice.id === id);
    const choice = { ...nativePinChoice(id), id, hex: '#' + id, definitionId: definition.id,
      ...(definition.label ? { label: definition.label } : {}) };
    if (old < 0) choices.push(choice); else choices[old] = choice;
  }
  return choices;
}

/** The original visible carrier is an occurrence. Materials author their exact
 * canonical View; typed carriers author their verified shared entity. */
export function nativePinNodeIdentity(node: Row, scene: NativePinScene, facts: NativePinFacts) {
  const entityIds: string[] = [], managed = nativeManagedPinNode(node);
  if (!managed || facts.graph?.project?.id !== scene.projectId || node.id !== node.data?.id
    || node.canvas_id !== undefined && node.canvas_id !== scene.canvasId
    || primaryReferenceFields.filter(key=>node.data[key]!==undefined).length!==1) return { managed, entityIds };
  const bindings = facts.bindings.filter(binding => binding.projectId === scene.projectId && binding.canvasId === scene.canvasId
    && binding.spatialKind === 'node' && binding.spatialId === node.id);
  if (bindings.length !== 1) return { managed, entityIds };
  const binding = bindings[0]!, ref = node.data?.lcos_ref;
  const rows = (key: string): readonly Row[] => factRows(facts,key);
  if (ref?.version === 1 && text(ref.artifactId) && text(ref.artifactViewId) && text(ref.revisionId)) {
    const views = rows('artifactViews').filter(view => view.id === ref.artifactViewId
      && (view.projectId === undefined || view.projectId === scene.projectId) && view.artifactId === ref.artifactId && view.revisionId === ref.revisionId
      && rows('scopes').filter(scope => scope.id === view.scopeId && scope.projectId === scene.projectId).length === 1);
    const artifacts = rows('artifacts').filter(artifact => artifact.id === ref.artifactId && artifact.projectId === scene.projectId);
    const revisions = rows('artifactRevisions').filter(revision => revision.id === ref.revisionId && revision.artifactId === ref.artifactId);
    if (views.length !== 1 || artifacts.length !== 1 || revisions.length !== 1
      || !(binding.entityType === 'artifact' && binding.entityId === ref.artifactId || binding.entityType === 'view' && binding.entityId === ref.artifactViewId)
      || ref.entityType !== binding.entityType || ref.entityId !== binding.entityId) return { managed, entityIds };
    entityIds.push(ref.artifactId);
    // A materialized ResultSlot keeps its original object color as a shared
    // echo only after the real slot→Artifact/View relation and this occurrence
    // agree. Its current authoring target is still this exact material View.
    const result=node.data.lcos_result_ref,workspace=result?typedWorkspace(scene,facts):undefined;
    if(result&&workspace&&result.projectId===scene.projectId&&result.canvasId===scene.canvasId&&result.workspaceId===scene.workspaceId
      &&result.artifactId===ref.artifactId&&result.artifactViewId===ref.artifactViewId&&result.revisionId===ref.revisionId&&text(result.slotId)) {
      const slot=uniqueEntity(facts,scene.projectId,'result-slot',result.slotId);
      if(slot&&slot.artifactId===ref.artifactId&&slot.artifactViewId===ref.artifactViewId&&slot.scopeId===workspace.scopeId
        &&(slot.workspaceId===undefined||slot.workspaceId===scene.workspaceId))entityIds.push(result.slotId);
    }
    return { managed, entityIds, target: { projectId: scene.projectId, kind: 'view' as const, id: ref.artifactViewId } };
  }
  // One exact original typed carrier, never a made-up ArtifactView. Canonical
  // entity colors are shared across occurrences of this same object.
  const data=node.data;
  if(data.lcos_execution_ref&&!['run','result-slot'].includes(data.lcos_execution_ref.entityType)
    ||data.lcos_member_ref&&!['note','scope','workspace'].includes(data.lcos_member_ref.entityType))return {managed,entityIds};
  const typed=data.lcos_collection_ref?{ref:data.lcos_collection_ref,type:'collection',id:data.lcos_collection_ref.collectionId}
    :data.lcos_conversation_ref?{ref:data.lcos_conversation_ref,type:'conversation',id:data.lcos_conversation_ref.connectedConversationId}
    :data.lcos_execution_ref?{ref:data.lcos_execution_ref,type:data.lcos_execution_ref.entityType,id:data.lcos_execution_ref.entityId}
    :data.lcos_run_ref?{ref:data.lcos_run_ref,type:'run',id:data.lcos_run_ref.runId}
    :data.lcos_member_ref?{ref:data.lcos_member_ref,type:data.lcos_member_ref.entityType,id:data.lcos_member_ref.entityId}:undefined;
  if(!typed||!['collection','conversation','run','result-slot','note','scope','workspace'].includes(typed.type)||!text(typed.id)
    ||!typedWorkspace(scene,facts)||typed.ref.projectId!==scene.projectId||typed.ref.canvasId!==scene.canvasId||typed.ref.workspaceId!==scene.workspaceId
    ||typed.ref.entityType!==undefined&&typed.ref.entityType!==typed.type||binding.entityType!==typed.type||binding.entityId!==typed.id
    ||!uniqueEntity(facts,scene.projectId,typed.type,typed.id))return {managed,entityIds};
  entityIds.push(typed.id);
  return {managed,entityIds,target:{projectId:scene.projectId,kind:'entity' as const,id:typed.id}};
}
export function projectNativePins(scene: NativePinScene, facts: NativePinFacts) {
  const snapshot = validateNativePinSnapshot(facts.snapshot, scene.projectId), choices = nativePinChoices(snapshot);
  const definitions = new Map(snapshot.definitions.map(definition => [definition.id, definition]));
  const byNode = new Map<string, NativePinNode>(), groups = new Map<string, { nodeIds: Set<string>; memberships: Map<string, ColorPinMembershipV0> }>();
  for (const node of scene.nodes) {
    const identity = nativePinNodeIdentity(node, scene, facts);
    const memberships = snapshot.memberships.filter(member => member.targetRef.kind === 'view'
      ? identity.target?.kind === 'view' && member.targetRef.id === identity.target.id
      : member.targetRef.kind === 'entity' && identity.entityIds.includes(member.targetRef.id));
    const pins = [...new Set(memberships.map(member => nativePinColorKey(definitions.get(member.colorPinId)!.color)!))];
    byNode.set(node.id, { ...identity, pins, memberships, primaryGroup: pins.length ? choices.find(choice => choice.id === pins.at(-1)) : undefined });
    for (const membership of memberships) {
      const group = groups.get(membership.colorPinId) ?? { nodeIds: new Set(), memberships: new Map() };
      group.nodeIds.add(node.id); group.memberships.set(membership.id, membership); groups.set(membership.colorPinId, group);
    }
  }
  for (const membership of snapshot.memberships.filter(member => member.targetRef.kind === 'surface' && member.targetRef.id === scene.surfaceRef)) {
    const group = groups.get(membership.colorPinId) ?? { nodeIds: new Set(), memberships: new Map() };
    group.memberships.set(membership.id, membership); groups.set(membership.colorPinId, group);
  }
  const projected: NativePinGroup[] = [];
  for (const choice of choices) {
    if (!choice.definitionId) continue;
    const member = groups.get(choice.definitionId), definition = definitions.get(choice.definitionId)!;
    if (!member) continue;
    projected.push({ groupId: choice.id, color: choice.hex, group: choice, definitionId: definition.id, updatedAt: definition.updatedAt,
      ...(definition.label ? { label: definition.label } : {}), nodeIds: [...member.nodeIds], count: member.nodeIds.size,
      membershipIds: [...member.memberships.keys()], sharedMembershipCount: [...member.memberships.values()].filter(row => row.targetRef.kind === 'entity').length,
      surfaceMembershipCount: [...member.memberships.values()].filter(row => row.targetRef.kind === 'surface').length });
  }
  return { choices, byNode, groups: projected };
}
