import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ColorPinMemberPreview, pinMemberImage } from './ColorPinMemberPreview';
const m = vi.hoisted(() => ({ nodes: [] as { id: string; type: string; data: Record<string, unknown> }[], refs: new Map<string, { entityType: string; entityId: string }>() }));
vi.mock('@/store/canvasStore', () => ({ default: (select: (s: unknown) => unknown) => select({ nodes: m.nodes, canvasId: 'canvas' }) }));
vi.mock('../lcosReferenceState', () => ({ useLcosReferenceStore: (select: (s: unknown) => unknown) => select({ nodeEntityRefs: m.refs }) }));
vi.mock('@/api/artifact', () => ({ resolveArtifactUrl: (src: string) => src }));
const entity = { projectId: 'p', kind: 'entity' as const, id: 'a' };
const identity = { entityType: 'artifact', entityId: 'a', label: '真实图片' };
it('uses only an exact non-hidden live image projection and never invents asset URLs', () => {
  const refs = new Map<string, { entityType: string; entityId: string }>([['wrong', { entityType: 'artifact', entityId: 'b' }], ['right', identity]]);
  const wrong = { id: 'wrong', type: 'image', data: { src: '/b.png' } };
  const right = { id: 'right', type: 'image', data: { src: '/a.png' } };
  expect(pinMemberImage(entity, identity, [wrong, right], refs)).toBe('/a.png');
  expect(pinMemberImage(entity, identity, [wrong, { ...right, hidden: true }], refs)).toBeUndefined();
  expect(pinMemberImage(entity, identity, [{ ...right, type: 'text' }], refs)).toBeUndefined();
});
it('an explicit view pin cannot borrow its artifact image; it needs its exact view projection', () => {
  const view = { projectId: 'p', kind: 'view' as const, id: 'v' };
  const node = { id: 'node', type: 'image', data: { src: '/actual.png' } };
  expect(pinMemberImage(view, identity, [node], new Map([['node', identity]]))).toBeUndefined();
  expect(pinMemberImage(view, identity, [node], new Map([['node', { entityType: 'view', entityId: 'v' }]]))).toBe('/actual.png');
});
it('a real failed thumbnail becomes a type glyph instead of keeping a broken image', async () => {
  m.nodes = [{ id: 'image', type: 'image', data: { src: '/actual.png' } }]; m.refs = new Map([['image', identity]]);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<ColorPinMemberPreview target={entity} identity={identity} />));
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/actual.png');
    await act(async () => host.querySelector('img')!.dispatchEvent(new Event('error')));
    expect(host.querySelector('img')).toBeNull(); expect(host.querySelector('svg')).not.toBeNull();
    expect(host.querySelector('[data-target-id="a"]')).not.toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
