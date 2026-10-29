import {
  CoreCollaborationClient,
  colorPinMembershipsByDefinition,
  colorPinMembershipsByTarget,
  usedColorPinDefinitions,
} from '@local-creative-os/web-gen2';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { createLcosCoreSession } from '../app/lcosCoreClient';

import type {
  ColorPinDefinitionV0,
  ColorPinMembershipV0,
  ColorPinSnapshotV0,
  NavigationResolutionV0,
  SpatialMarkerTargetRefV0,
} from '@local-creative-os/contracts';

export interface ColorPinAuthoringTargetV1 {
  readonly targetRef: SpatialMarkerTargetRefV0;
  readonly label: string;
}

export interface ColorPinTargetIdentityV1 {
  readonly entityType: string;
  readonly entityId: string;
  readonly label: string;
}

export interface ColorPinProjectTruthV1 {
  readonly scopes: readonly {
    readonly id: string;
    readonly projectId: string;
    readonly kind: string;
    readonly parentScopeId?: string | null;
    readonly name?: string;
  }[];
  readonly workspaces: readonly {
    readonly id: string;
    readonly projectId: string;
    readonly scopeId: string;
    readonly name?: string;
  }[];
}

interface ColorPinIdentityProjectionV1 {
  readonly entities: ReadonlyMap<string, ColorPinTargetIdentityV1 | null>;
  readonly views: ReadonlyMap<string, ColorPinTargetIdentityV1>;
}

export interface LcosColorPinProjectionV1 {
  readonly projectId: string;
  readonly snapshot: ColorPinSnapshotV0;
  readonly status: 'loading' | 'ready' | 'stale' | 'error';
  readonly message?: string;
  readonly busy: boolean;
  readonly usedDefinitions: readonly ColorPinDefinitionV0[];
  readonly membershipsByColorPinId: ReadonlyMap<string, readonly ColorPinMembershipV0[]>;
  readonly membershipsByTargetKey: ReadonlyMap<string, readonly ColorPinMembershipV0[]>;
  readonly projectTruth?: ColorPinProjectTruthV1;
  readonly authoringTarget?: ColorPinAuthoringTargetV1;
  /** Temporary HUD choice only; never persisted as Pin or Canvas truth. */
  readonly activeDefinitionId?: string;
  setActiveDefinition(id: string | undefined): void;
  openAuthoring(target: ColorPinAuthoringTargetV1): void;
  closeAuthoring(): void;
  assignMembership(targetRef: SpatialMarkerTargetRefV0, color: string, label?: string): Promise<void>;
  removeMembership(membershipId: string): Promise<void>;
  targetIdentity(targetRef: SpatialMarkerTargetRefV0): ColorPinTargetIdentityV1 | undefined;
  resolveNavigationTarget(targetRef: SpatialMarkerTargetRefV0): Promise<NavigationResolutionV0>;
  refresh(): Promise<void>;
  clearMessage(): void;
}

const EMPTY_SNAPSHOT: ColorPinSnapshotV0 = { definitions: [], memberships: [] };
const LcosColorPinContext = createContext<LcosColorPinProjectionV1 | null>(null);

function identityProjection(graph: unknown, conversations: readonly unknown[]): ColorPinIdentityProjectionV1 {
  const source = (graph ?? {}) as Record<string, unknown>;
  const candidates = new Map<string, ColorPinTargetIdentityV1[]>();
  const views = new Map<string, ColorPinTargetIdentityV1>();
  const add = (id: string, identity: ColorPinTargetIdentityV1): void => {
    if (id === '') return;
    candidates.set(id, [...(candidates.get(id) ?? []), identity]);
  };
  const rows = (key: string): readonly Record<string, unknown>[] =>
    Array.isArray(source[key]) ? source[key] as readonly Record<string, unknown>[] : [];

  for (const artifact of rows('artifacts')) {
    const id = String(artifact.id ?? '');
    add(id, { entityType: 'artifact', entityId: id, label: String(artifact.title ?? id) });
  }
  for (const scope of rows('scopes')) {
    const id = String(scope.id ?? '');
    add(id, { entityType: 'scope', entityId: id, label: String(scope.name ?? id) });
  }
  for (const workspace of rows('workspaces')) {
    const id = String(workspace.id ?? '');
    add(id, { entityType: 'workspace', entityId: id, label: String(workspace.name ?? id) });
  }
  for (const note of rows('notes')) {
    const id = String(note.id ?? '');
    add(id, { entityType: 'note', entityId: id, label: String(note.title ?? id) });
  }
  for (const value of conversations) {
    if (typeof value !== 'object' || value === null) continue;
    const conversation = value as Record<string, unknown>;
    const id = String(conversation.id ?? '');
    add(id, { entityType: 'conversation', entityId: id, label: String(conversation.label ?? id) });
  }

  const entities = new Map<string, ColorPinTargetIdentityV1 | null>();
  for (const [id, identities] of candidates) {
    entities.set(id, identities.length === 1 ? identities[0] ?? null : null);
  }
  for (const view of rows('artifactViews')) {
    const viewId = String(view.id ?? '');
    const artifactId = String(view.artifactId ?? '');
    const artifact = entities.get(artifactId);
    if (viewId !== '' && artifact !== null && artifact !== undefined && artifact.entityType === 'artifact') {
      views.set(viewId, artifact);
    }
  }
  return { entities, views };
}

function projectTruthOf(graph: unknown): ColorPinProjectTruthV1 {
  const source = (graph ?? {}) as Record<string, unknown>;
  const scopes = Array.isArray(source.scopes)
    ? source.scopes.map((value) => {
        const row = value as Record<string, unknown>;
        return {
          id: String(row.id ?? ''),
          projectId: String(row.projectId ?? ''),
          kind: String(row.kind ?? ''),
          ...(row.parentScopeId === null
            ? { parentScopeId: null }
            : row.parentScopeId === undefined
              ? {}
              : { parentScopeId: String(row.parentScopeId) }),
          ...(row.name === undefined ? {} : { name: String(row.name) }),
        };
      })
    : [];
  const workspaces = Array.isArray(source.workspaces)
    ? source.workspaces.flatMap((value) => {
        const row = value as Record<string, unknown>;
        if (row.scopeId === undefined || row.scopeId === null) return [];
        return [{
          id: String(row.id ?? ''),
          projectId: String(row.projectId ?? ''),
          scopeId: String(row.scopeId),
          ...(row.name === undefined ? {} : { name: String(row.name) }),
        }];
      })
    : [];
  return { scopes, workspaces };
}

export function LcosColorPinProvider({
  projectId,
  children,
}: {
  readonly projectId: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const session = useMemo(() => createLcosCoreSession(), []);
  const collaboration = useMemo(() => new CoreCollaborationClient(session.http), [session]);
  const generation = useRef(0);
  const projectGeneration = useRef(0);
  const [snapshot, setSnapshot] = useState<ColorPinSnapshotV0>(EMPTY_SNAPSHOT);
  const [identity, setIdentity] = useState<ColorPinIdentityProjectionV1>(() => ({ entities: new Map(), views: new Map() }));
  const [projectTruth, setProjectTruth] = useState<ColorPinProjectTruthV1 | undefined>(undefined);
  const [status, setStatus] = useState<LcosColorPinProjectionV1['status']>('loading');
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [authoringTarget, setAuthoringTarget] = useState<ColorPinAuthoringTargetV1 | undefined>(undefined);
  const [activeDefinitionId, setActiveDefinition] = useState<string>();
  // HUD effects must not mistake a context refresh for an explicit dismissal.
  const closeAuthoring = useCallback(() => setAuthoringTarget(undefined), []);
  useEffect(() => setActiveDefinition(undefined), [projectId]);

  const refresh = useCallback(async (): Promise<void> => {
    const requestGeneration = generation.current + 1;
    generation.current = requestGeneration;
    setStatus((current) => current === 'ready' || current === 'stale' ? 'stale' : 'loading');
    try {
      const [nextSnapshot, graph, conversations] = await Promise.all([
        session.colorPins.snapshot(projectId),
        session.projects.getProjectGraph(projectId),
        session.conversations.listConnectedConversations(projectId).catch(() => []),
      ]);
      if (generation.current !== requestGeneration) return;
      setSnapshot(nextSnapshot);
      setIdentity(identityProjection(graph, conversations));
      setProjectTruth(projectTruthOf(graph));
      setStatus('ready');
      setMessage(undefined);
    } catch (error) {
      if (generation.current !== requestGeneration) return;
      setStatus((current) => current === 'stale' ? 'stale' : 'error');
      setMessage(`颜色组读取失败${error instanceof Error ? `（${error.message}）` : ''}`);
    }
  }, [projectId, session]);

  useEffect(() => {
    projectGeneration.current += 1;
    generation.current += 1;
    setSnapshot(EMPTY_SNAPSHOT);
    setIdentity({ entities: new Map(), views: new Map() });
    setProjectTruth(undefined);
    setStatus('loading');
    setMessage(undefined);
    setBusy(false);
    setAuthoringTarget(undefined);
    void refresh();
  }, [projectId, refresh]);

  useEffect(() => collaboration.subscribe(projectId, '*', () => {
    void refresh();
  }), [collaboration, projectId, refresh]);

  const assignMembership = useCallback(async (
    targetRef: SpatialMarkerTargetRefV0,
    color: string,
    label?: string,
  ): Promise<void> => {
    const invocationGeneration = projectGeneration.current;
    const invocationProjectId = projectId;
    setBusy(true);
    setMessage(undefined);
    try {
      const receipt = await session.colorPins.assign(invocationProjectId, {
        targetRef,
        color,
        ...(label === undefined ? {} : { label }),
      });
      if (projectGeneration.current !== invocationGeneration) return;
      setSnapshot((current) => ({
        definitions: current.definitions.some((definition) => definition.id === receipt.definition.id)
          ? current.definitions.map((definition) => definition.id === receipt.definition.id ? receipt.definition : definition)
          : [...current.definitions, receipt.definition],
        memberships: current.memberships.some((membership) => membership.id === receipt.membership.id)
          ? current.memberships
          : [...current.memberships, receipt.membership],
      }));
      setMessage(receipt.changeSetId === undefined
        ? '已标为颜色组'
        : `已标为颜色组 · 变更 ${receipt.changeSetId.slice(0, 8)}`);
    } catch (error) {
      if (projectGeneration.current === invocationGeneration) {
        setMessage(`标记失败${error instanceof Error ? `（${error.message}）` : ''}`);
      }
      throw error;
    } finally {
      if (projectGeneration.current === invocationGeneration) setBusy(false);
    }
  }, [projectId, session]);

  const removeMembership = useCallback(async (membershipId: string): Promise<void> => {
    const invocationGeneration = projectGeneration.current;
    const invocationProjectId = projectId;
    setBusy(true);
    setMessage(undefined);
    try {
      const receipt = await session.colorPins.removeMembership(invocationProjectId, membershipId);
      if (projectGeneration.current !== invocationGeneration) return;
      setSnapshot((current) => ({
        definitions: current.definitions,
        memberships: current.memberships.filter((membership) => membership.id !== membershipId),
      }));
      setMessage(receipt.changeSetId === undefined
        ? '已移除颜色组'
        : `已移除颜色组 · 变更 ${receipt.changeSetId.slice(0, 8)}`);
    } catch (error) {
      if (projectGeneration.current === invocationGeneration) {
        setMessage(`移除失败${error instanceof Error ? `（${error.message}）` : ''}`);
      }
      throw error;
    } finally {
      if (projectGeneration.current === invocationGeneration) setBusy(false);
    }
  }, [projectId, session]);

  const value = useMemo<LcosColorPinProjectionV1>(() => ({
    projectId,
    snapshot,
    status,
    ...(message === undefined ? {} : { message }),
    busy,
    usedDefinitions: usedColorPinDefinitions(snapshot),
    membershipsByColorPinId: colorPinMembershipsByDefinition(snapshot),
    membershipsByTargetKey: colorPinMembershipsByTarget(snapshot),
    ...(projectTruth === undefined ? {} : { projectTruth }),
    ...(authoringTarget === undefined ? {} : { authoringTarget }),
    ...(activeDefinitionId === undefined ? {} : { activeDefinitionId }),
    setActiveDefinition,
    openAuthoring: setAuthoringTarget,
    closeAuthoring,
    assignMembership,
    removeMembership,
    targetIdentity: (targetRef) => targetRef.kind === 'view'
      ? identity.views.get(targetRef.id)
      : targetRef.kind === 'entity'
        ? identity.entities.get(targetRef.id) ?? undefined
        : undefined,
    resolveNavigationTarget: (targetRef) => session.navigation.resolveTarget(projectId, targetRef),
    refresh,
    clearMessage: () => setMessage(undefined),
  }), [
    activeDefinitionId,
    assignMembership,
    authoringTarget,
    closeAuthoring,
    busy,
    identity,
    message,
    projectId,
    projectTruth,
    refresh,
    removeMembership,
    session,
    snapshot,
    status,
  ]);

  return <LcosColorPinContext.Provider value={value}>{children}</LcosColorPinContext.Provider>;
}

export function useLcosColorPins(): LcosColorPinProjectionV1 {
  const value = useContext(LcosColorPinContext);
  if (value === null) throw new Error('useLcosColorPins must be used inside LcosColorPinProvider.');
  return value;
}

export function useOptionalLcosColorPins(): LcosColorPinProjectionV1 | null {
  return useContext(LcosColorPinContext);
}
