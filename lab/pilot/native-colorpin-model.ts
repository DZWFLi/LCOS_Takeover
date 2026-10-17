import type { ColorPinDefinitionV0, ColorPinMembershipV0, ColorPinSnapshotV0, SpatialMarkerTargetRefV0 } from '../../lcos/packages/contracts/src/index';
import { colorPinTargetKey } from '../../lcos/apps/web-gen2/src/presentation/colorPinPresentation';

type Row = Record<string, any>;
export interface NativePinScene { projectId: string; canvasId: string; workspaceId: string; api: object; nodes: readonly Row[]; surfaceRef?: string }
export interface NativePinFacts { snapshot: ColorPinSnapshotV0; graph: Row; bindings: readonly Row[] }
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
export const nativeManagedPinNode = (node: Row | undefined): boolean => !!node?.data && ['lcos_ref', 'lcos_collection_ref', 'lcos_conversation_ref', 'lcos_run_ref']
  .some(key => node.data[key] !== undefined);
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

/** The original visible carrier is an occurrence. Authoring targets its exact
 * canonical View even when its old binding uses artifact identity. */
export function nativePinNodeIdentity(node: Row, scene: NativePinScene, facts: NativePinFacts) {
  const entityIds: string[] = [], managed = nativeManagedPinNode(node);
  if (!managed || facts.graph?.project?.id !== scene.projectId || node.id !== node.data?.id) return { managed, entityIds };
  const bindings = facts.bindings.filter(binding => binding.projectId === scene.projectId && binding.canvasId === scene.canvasId
    && binding.spatialKind === 'node' && binding.spatialId === node.id);
  if (bindings.length !== 1) return { managed, entityIds };
  const binding = bindings[0]!, ref = node.data?.lcos_ref;
  const rows = (key: string): Row[] => Array.isArray(facts.graph[key]) ? facts.graph[key] : [];
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
    return { managed, entityIds, target: { projectId: scene.projectId, kind: 'view' as const, id: ref.artifactViewId } };
  }
  // Existing entity markers remain readable; this does not invent a View or
  // grant the media toolbar authoring rights on a Collection/Run carrier.
  const types: Record<string, string> = { collection: 'collections', conversation: 'connectedConversations', run: 'runs', note: 'notes', scope: 'scopes', workspace: 'workspaces' };
  const field = types[binding.entityType];
  if (field && rows(field).some(entity => entity.id === binding.entityId && entity.projectId === scene.projectId)) entityIds.push(binding.entityId);
  return { managed, entityIds };
}
export function projectNativePins(scene: NativePinScene, facts: NativePinFacts) {
  const snapshot = validateNativePinSnapshot(facts.snapshot, scene.projectId), choices = nativePinChoices(snapshot);
  const definitions = new Map(snapshot.definitions.map(definition => [definition.id, definition]));
  const byNode = new Map<string, NativePinNode>(), groups = new Map<string, { nodeIds: Set<string>; memberships: Map<string, ColorPinMembershipV0> }>();
  for (const node of scene.nodes) {
    const identity = nativePinNodeIdentity(node, scene, facts);
    const memberships = snapshot.memberships.filter(member => member.targetRef.kind === 'view'
      ? !!identity.target && member.targetRef.id === identity.target.id
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
