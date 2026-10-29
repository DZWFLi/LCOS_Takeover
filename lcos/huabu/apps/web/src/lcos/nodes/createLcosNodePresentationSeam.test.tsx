// createLcosNodePresentationSeam 测试（happy-dom）：
// resolve 依赖 reference store（binding）；未绑定 → native fallback（undefined）；
// late binding 通知 → 组件重解析（reactive）。

import { describeProjectedEntity } from '@local-creative-os/web-gen2';
import { beforeEach, describe, expect, it } from 'vitest';

import { useLcosReferenceStore } from '../lcosReferenceState';
import { createLcosNodePresentationSeam } from './createLcosNodePresentationSeam';
import { lcosNodeCardRegistry } from './lcosNodeCardRegistry';

const SEAM = createLcosNodePresentationSeam();

beforeEach(() => {
  useLcosReferenceStore.getState().resetNodeEntities();
});

describe('createLcosNodePresentationSeam', () => {
  it('unbound node → undefined（native fallback，诚实）', () => {
    const body = SEAM.resolve({ nodeId: 'n-unknown', nodeType: 'note', data: {} });
    expect(body).toBeUndefined();
    expect(SEAM.resolve({ nodeId: 'n-image-native', nodeType: 'image', data: { src: 'native.png' } })).toBeUndefined();
    expect(SEAM.resolve({ nodeId: 'n-audio-native', nodeType: 'audio', data: { src: 'native.webm' } })).toBeUndefined();
    expect(SEAM.resolveHostPresentation?.({ nodeId: 'n-unknown', nodeType: 'note', data: {} })).toBeUndefined();
  });

  it('conversation binding → glyth body', () => {
    useLcosReferenceStore.getState().registerNodeEntity('n-glyth', {
      entityType: 'conversation',
      entityId: 'c-1',
    });
    const body = SEAM.resolve({ nodeId: 'n-glyth', nodeType: 'note', data: {} });
    expect(typeof body).toBe('function'); // opaque ComponentType
  });

  it('run binding → run body；artifact → source body', () => {
    useLcosReferenceStore.getState().registerNodeEntity('n-run', { entityType: 'run', entityId: 'r-1' });
    useLcosReferenceStore.getState().registerNodeEntity('n-art', { entityType: 'artifact', entityId: 'a-1' });
    expect(SEAM.resolve({ nodeId: 'n-run', nodeType: 'note', data: {} })).toBeDefined();
    expect(SEAM.resolve({ nodeId: 'n-art', nodeType: 'note', data: {} })).toBeDefined();
  });

  it('Core-bound image/audio native callers → same source body junction', () => {
    useLcosReferenceStore.getState().registerNodeEntity('n-image-bound', {
      entityType: 'artifact',
      entityId: 'a-image',
      descriptor: describeProjectedEntity({
        entityType: 'artifact',
        entityId: 'a-image',
        title: '山脊 · 主视觉',
        artifactKind: 'image',
        mimeType: 'image/png',
      }),
    });
    useLcosReferenceStore.getState().registerNodeEntity('n-audio-bound', {
      entityType: 'artifact',
      entityId: 'a-audio',
      descriptor: describeProjectedEntity({
        entityType: 'artifact',
        entityId: 'a-audio',
        title: '山野环境声',
        artifactKind: 'file',
        mimeType: 'audio/webm',
      }),
    });

    expect(
      SEAM.resolve({ nodeId: 'n-image-bound', nodeType: 'image', data: { src: 'art_image.png' } }),
    ).toBeDefined();
    expect(
      SEAM.resolve({ nodeId: 'n-audio-bound', nodeType: 'audio', data: {} }),
    ).toBeDefined();
  });

  it('Core binding resolves host chrome from the same seam', () => {
    useLcosReferenceStore.getState().registerNodeEntity('n-glyth-host', {
      entityType: 'conversation',
      entityId: 'c-host',
    });
    expect(SEAM.resolveHostPresentation?.({ nodeId: 'n-glyth-host', nodeType: 'note', data: {} })).toEqual({
      surface: 'transparent',
      showAiBadge: false,
      allowOverflow: true,
      selectionFeedback: 'body',
    });
  });

  it('bizarre entityType binding → native（不静默降级为其它物种）', () => {
    useLcosReferenceStore.getState().registerNodeEntity('n-x', { entityType: 'mystery', entityId: 'x' });
    expect(SEAM.resolve({ nodeId: 'n-x', nodeType: 'note', data: {} })).toBeUndefined();
  });

  it('subscribe 在 store 变更时通知（late binding 原位换 body）', () => {
    let notified = 0;
    const unsubscribe = SEAM.subscribe(() => {
      notified += 1;
    });
    useLcosReferenceStore.getState().registerNodeEntity('n-late', { entityType: 'conversation', entityId: 'c-late' });
    expect(notified).toBeGreaterThan(0);
    unsubscribe();
    const before = notified;
    useLcosReferenceStore.getState().registerNodeEntity('n-late-2', { entityType: 'run', entityId: 'r-late' });
    expect(notified).toBe(before);
  });
});

it('preserves the Run provenance at the same junction without changing media host chrome', () => {
  useLcosReferenceStore.getState().registerNodeEntity('generated-image', {
    entityType: 'artifact', entityId: 'image-result',
    descriptor: describeProjectedEntity({ entityType: 'artifact', entityId: 'image-result',
      title: '生成结果', artifactKind: 'image', mimeType: 'image/png', managed: true, sourceRunId: 'run-actual' }),
  });
  const input = { nodeId: 'generated-image', nodeType: 'image', data: { src: 'result.png' } };
  expect(SEAM.resolve(input)).toBe(lcosNodeCardRegistry.resolveNodeCard('draft'));
  expect(SEAM.resolveHostPresentation?.(input)).toMatchObject({ surface: 'media', allowOverflow: true });
});

it.each(['collection', 'workflow'] as const)('removes the native white carrier for a real %s descriptor', (kind) => {
  useLcosReferenceStore.getState().registerNodeEntity('collection-entry', {
    entityType: 'scope', entityId: 'scope-real', descriptor: describeProjectedEntity({
      entityType: 'scope', entityId: 'scope-real', title: '集合', artifactKind: kind,
    }),
  });
  const input = { nodeId: 'collection-entry', nodeType: 'note', data: {} };
  const host = SEAM.resolveHostPresentation?.(input);
  expect(host).toEqual({ surface: 'transparent', showAiBadge: false, allowOverflow: true });
  expect(SEAM.resolveHostPresentation?.(input)).toBe(host);
});
