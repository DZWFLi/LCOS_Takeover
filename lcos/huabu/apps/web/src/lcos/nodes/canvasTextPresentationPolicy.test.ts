import { describeProjectedEntity, Gen2Host, HttpClient, HuabuRfsClient } from '@local-creative-os/web-gen2';
import { expect, it, vi } from 'vitest';

import { usesCanvasTextEditor } from './canvasTextPresentationPolicy';
import { navigationGraph } from '../navigation/navigationFixtures';

import type { LcosNodeEntityRef } from '../lcosReferenceState';
import type { CanvasNodeBodySlotInput } from '@/lcos-seam/types';
import type { ProjectedEntityFacts } from '@local-creative-os/web-gen2';

const input: CanvasNodeBodySlotInput = { nodeId: 'text-node', nodeType: 'note', data: {} };
function ref(extra: Partial<ProjectedEntityFacts> = {}): LcosNodeEntityRef {
  return { entityType: 'artifact', entityId: 'material', descriptor: describeProjectedEntity({
    entityType: 'artifact', entityId: 'material', title: 'An imported file', artifactKind: 'markdown', managed: true,
    currentRevisionId: 'current', presentedRevisionId: 'current', revisionStatus: 'current', canvasTextEditable: true, ...extra,
  }) };
}

it('keeps imported managed text in the same scope editable but reads the same material shared across scopes', () => {
  for (const artifactKind of ['markdown', 'text']) {
    expect(usesCanvasTextEditor(input, ref({ artifactKind, canvasTextEditable: true }))).toBe(true);
    expect(usesCanvasTextEditor(input, ref({ artifactKind, canvasTextEditable: false }))).toBe(false);
  }
  expect(usesCanvasTextEditor({ ...input, data: { origin: { type: 'user-created' }, lcosProjectTextCreating: false } },
    ref({ canvasTextEditable: false }))).toBe(false);
});

it('does not turn managed/current or a misleading title alone into canvas-text editing authority', () => {
  expect(usesCanvasTextEditor(input, ref({ canvasTextEditable: undefined, title: 'canvas-text Editable' }))).toBe(false);
  expect(usesCanvasTextEditor(input, ref({ entityId: 'other' }))).toBe(false);
});

it('preserves original native creation, adopted carriers and unbound native editor behavior', () => {
  for (const data of [{ lcosProjectTextCreating: true }, { lcosProjectTextCreateError: 'original creation failed' }])
    expect(usesCanvasTextEditor({ ...input, data }, undefined)).toBe(true);
  for (const data of [{ origin: { type: 'user-created' } }, { origin: { type: 'user-pasted' } }, { lcosProjectTextCreating: false }])
    expect(usesCanvasTextEditor({ ...input, nodeType: 'text', data }, ref({ canvasTextEditable: undefined }))).toBe(true);
  expect(usesCanvasTextEditor({ ...input, nodeType: 'text' }, undefined)).toBe(true);
  expect(usesCanvasTextEditor({ ...input, nodeType: 'text', data: { contentMissing: true } }, undefined)).toBe(false);
});

it('keeps historical, draft, additional, HTML, web and unmanaged sources out of the editor even when scope matches', () => {
  for (const extra of [{ presentedRevisionId: 'historical' }, { revisionStatus: 'draft' as const },
    { artifactViewReferenceKind: 'explicit_additional' as const }, { mimeType: 'text/html' },
    { sourceKind: 'url' }, { sourceKind: 'web' }, { managed: false }])
    expect(usesCanvasTextEditor(input, ref(extra))).toBe(false);
});

it('edits shared current text through a proven source address but never a different View or guarded source', () => {
  const source = { canvasId: 'main-canvas', spatialId: 'original-carrier', viewId: 'original-view' };
  const shared = { canvasTextEditable: false, artifactViewId: 'original-view', canvasTextSourceAddress: source };
  expect(usesCanvasTextEditor(input, ref(shared))).toBe(true);
  expect(usesCanvasTextEditor(input, ref({ ...shared, artifactViewId: 'other-view' }))).toBe(false);
  expect(usesCanvasTextEditor(input, ref({ ...shared, canvasTextSourceAddress: { ...source, spatialId: '' } }))).toBe(false);
  for (const extra of [{ presentedRevisionId: 'historical' }, { revisionStatus: 'draft' as const },
    { artifactViewReferenceKind: 'explicit_additional' as const }, { mimeType: 'text/html' },
    { sourceKind: 'url' }, { sourceKind: 'web' }, { managed: false }])
    expect(usesCanvasTextEditor(input, ref({ ...shared, ...extra }))).toBe(false);
});

async function actualHostFacts(worksiteScopeId: string, ambiguous = false, source?: {
  readonly carrierCount?: number; readonly conflictAtAddress?: boolean; readonly foreignProject?: boolean;
  readonly ambiguousWorkspace?: boolean; readonly extraView?: boolean; readonly revisionId?: string;
  readonly revisionStatus?: 'draft' | 'current'; readonly referenceKind?: 'primary' | 'explicit_additional';
}) {
  const graph = navigationGraph({ scopes: [{ id: 'root', kind: 'root' }, { id: 'child', kind: 'delivery' }],
    workspaces: [{ id: 'site', projectId: 'p', scopeId: worksiteScopeId, canvasId: 'scene', focusedViewIds: [] },
      ...(source ? [{ id: 'main', projectId: 'p', scopeId: 'root', preferredSurface: 'main', canvasId: 'main-canvas', focusedViewIds: [] },
        ...(source.ambiguousWorkspace ? [{ id: 'second-main', projectId: 'p', scopeId: 'root', preferredSurface: 'main', canvasId: 'other-canvas', focusedViewIds: [] }] : [])] : []),
      ...(ambiguous ? [{ id: 'another-site', projectId: 'p', scopeId: worksiteScopeId, canvasId: 'scene', focusedViewIds: [] }] : [])],
    artifacts: [{ id: 'material', projectId: 'p', kind: 'markdown', managed: true, title: 'Imported text', currentRevisionId: 'current' }],
    artifactViews: [{ id: 'original-view', artifactId: 'material', scopeId: 'root', revisionId: source?.revisionId ?? 'current',
      referenceKind: source?.referenceKind ?? 'primary', size: { width: 280, height: 180 } },
      ...(source?.extraView ? [{ id: 'extra', artifactId: 'material', scopeId: 'root', revisionId: 'current', referenceKind: 'explicit_additional' }] : [])],
    artifactRevisions: [{ id: 'current', artifactId: 'material', fileRecordId: 'exact-file', status: source?.revisionStatus ?? 'current' },
      { id: 'historical', artifactId: 'material', fileRecordId: 'exact-file', status: 'superseded' }],
    fileRecords: [{ id: 'exact-file', projectId: 'p', mimeType: 'text/markdown', size: 80 }],
    workspaceMemberships: [{ workspaceId: 'site', artifactViewId: 'original-view' }],
  });
  const fetcher = vi.fn<typeof fetch>(async url => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/content')) return new Response('# 原标题\n\n原材料的真实正文', { headers: { 'content-type': 'text/markdown' } });
    const value = path.endsWith('/graph') ? graph : path.endsWith('/spatial/bindings') ? [
      { projectId: 'p', canvasId: 'scene', spatialKind: 'node', spatialId: 'text-node', entityType: 'artifact', entityId: 'material' },
      ...(source ? Array.from({ length: source.carrierCount ?? 1 }, (_, index) => ({
        projectId: source.foreignProject ? 'other-project' : 'p', canvasId: 'main-canvas', spatialKind: 'node',
        spatialId: index === 0 ? 'original-carrier' : `duplicate-${index}`, entityType: 'artifact', entityId: 'material',
      })) : []),
      ...(source?.conflictAtAddress ? [{ projectId: 'p', canvasId: 'main-canvas', spatialKind: 'node', spatialId: 'original-carrier', entityType: 'note', entityId: 'other-material' }] : []),
    ] : path.endsWith('/execution-projection') ? { projectId: 'p', runs: [], resultSlots: [] } : [];
    return new Response(JSON.stringify({ ok: true, value }), { headers: { 'content-type': 'application/json' } });
  });
  const host = new Gen2Host({ projectId: 'p', http: new HttpClient({ baseUrl: 'http://core.test', fetch: fetcher }),
    rfs: new HuabuRfsClient({ canvasId: 'scene', baseUrl: 'http://rfs.test', bearerToken: 'test' }) });
  try {
    const bindings = await host.listNodeBindings();
    return { facts: bindings[0]?.descriptor, fetcher };
  } finally { host.reconciler.dispose(); }
}

it('produces the scope capability from the real Gen2Host graph read and retains exact FileRecord/preview for cross-scope reading', async () => {
  const main = await actualHostFacts('root');
  const shared = await actualHostFacts('child');
  expect(main.facts?.canvasTextEditable).toBe(true);
  expect(shared.facts).toMatchObject({ canvasTextEditable: false, artifactViewId: 'original-view',
    presentedRevisionId: 'current', fileRecordId: 'exact-file', preview: '原材料的真实正文' });
  expect(shared.fetcher.mock.calls.every(([url]) => !String(url).includes('canvas-text'))).toBe(true);
  expect((await actualHostFacts('root', true)).facts?.canvasTextEditable).toBe(false);
});

it('derives the existing Main source address from the same graph/bindings reads without claiming or guessing a title', async () => {
  const shared = await actualHostFacts('child', false, {});
  expect(shared.facts).toMatchObject({ canvasTextEditable: false, artifactViewId: 'original-view',
    canvasTextSourceAddress: { canvasId: 'main-canvas', spatialId: 'original-carrier', viewId: 'original-view' } });
  expect(usesCanvasTextEditor(input, { entityType: 'artifact', entityId: 'material', descriptor: shared.facts })).toBe(true);
  expect(shared.fetcher.mock.calls.filter(([url]) => String(url).includes('/spatial/bindings'))).toHaveLength(1);
  expect(shared.fetcher.mock.calls.every(([url]) => !String(url).includes('canvas-text'))).toBe(true);
});

it('does not offer write-through without unique workspace/carrier/View evidence or for historical/draft/additional material', async () => {
  for (const options of [{ carrierCount: 0 }, { carrierCount: 2 }, { conflictAtAddress: true }, { foreignProject: true },
    { ambiguousWorkspace: true }, { extraView: true }, { revisionId: 'historical' },
    { revisionStatus: 'draft' as const }, { referenceKind: 'explicit_additional' as const }]) {
    expect((await actualHostFacts('child', false, options)).facts?.canvasTextSourceAddress).toBeUndefined();
  }
  expect((await actualHostFacts('child', true, {})).facts?.canvasTextSourceAddress).toBeUndefined();
});
