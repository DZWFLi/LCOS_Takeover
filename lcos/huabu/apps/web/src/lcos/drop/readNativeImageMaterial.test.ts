import { expect, it, vi } from 'vitest';

import { readNativeImageMaterial, validateNativeImageMaterial } from './readNativeImageMaterial';

it('reads the actual captured Native artifact bytes using the existing address resolver and no Core token', async () => {
  const bytes = Uint8Array.from([137, 80, 78, 71]);
  const fetcher = vi.fn<typeof fetch>(async () => new Response(bytes, { headers: { 'content-type': 'image/png' } }));
  const file = await readNativeImageMaterial({ canvasId: 'source', src: 'art-native.png' }, undefined, fetcher);
  expect(file.type).toBe('image/png');
  expect(file.name).toBe('native-image.png');
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/canvas/source/artifact/art-native.png', { signal: undefined });
});

it('supports existing legacy same-canvas addresses, data and session blob sources without inventing external imports', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response('actual-image', { headers: { 'content-type': 'image/webp' } }));
  for (const src of ['/api/canvas/source/artifact/key.webp', 'http://old-port/api/canvas/source/artifact/key.webp',
    'data:image/webp;base64,YQ==', 'blob:http://local/native-image']) {
    const file = await readNativeImageMaterial({ canvasId: 'source', src }, undefined, fetcher);
    expect(file.type).toBe('image/webp');
  }
  expect(fetcher.mock.calls[1]?.[0]).toBe('/api/canvas/source/artifact/key.webp');
});

it('rejects another canvas, unsupported external/path sources and missing source before reading bytes', async () => {
  const fetcher = vi.fn<typeof fetch>();
  for (const src of ['/api/canvas/foreign/artifact/key.png', 'https://external/image.png', 'file:///image.png', '/unknown/image.png', ''])
    await expect(readNativeImageMaterial({ canvasId: 'source', src }, undefined, fetcher)).rejects.toThrow();
  await expect(readNativeImageMaterial({ canvasId: '', src: 'key.png' }, undefined, fetcher)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

it('rejects failed reads, empty bytes, non-image MIME and the existing import size limit', async () => {
  for (const response of [new Response('missing', { status: 404 }), new Response('', { headers: { 'content-type': 'image/png' } }),
    new Response('plain text is not image bytes', { headers: { 'content-type': 'text/plain' } })]) {
    await expect(readNativeImageMaterial({ canvasId: 'source', src: 'key.png' }, undefined, async () => response)).rejects.toThrow();
  }
  const oversized = new File(['x'], 'huge.png', { type: 'image/png' });
  Object.defineProperty(oversized, 'size', { value: 128 * 1024 * 1024 + 1 });
  expect(() => validateNativeImageMaterial(oversized)).toThrow('大小');
});

it('passes cancellation to the existing byte fetch and never conceals a read failure', async () => {
  const controller = new AbortController();
  const fetcher = vi.fn<typeof fetch>(async () => { throw new Error('Native bytes unavailable'); });
  await expect(readNativeImageMaterial({ canvasId: 'source', src: 'key.png' }, controller.signal, fetcher)).rejects.toThrow('Native bytes unavailable');
  expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
});
