import { beforeEach, describe, expect, it, vi } from 'vitest';

const deferred = <T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

const { getBlob, getNodeContent, uploadImage, uploadAudio, uploadPdf, uploadVideo, canvasStore } = vi.hoisted(() => {
  const state = {
    canvasId: 'canvas-a',
    nodes: [{ id: 'node-a', type: 'image', data: { src: '' } }],
    seedNodeContentRevisions: vi.fn(),
    updateNodeData: vi.fn(),
  };
  return {
    getBlob: vi.fn(),
    getNodeContent: vi.fn(),
    uploadImage: vi.fn(),
    uploadAudio: vi.fn(),
    uploadPdf: vi.fn(),
    uploadVideo: vi.fn(),
    canvasStore: {
      getState: () => state,
      subscribe: vi.fn(() => () => undefined),
      state,
    },
  };
});

vi.mock('@local-creative-os/web-gen2', () => ({
  HttpClient: class {
    getBlob = getBlob;
  },
}));
vi.mock('@/api/artifact', () => ({ uploadImage, uploadAudio, uploadPdf, uploadVideo }));
vi.mock('@/api/canvas', () => ({ getNodeContent }));
vi.mock('@/lcos/lcosHost', () => ({
  readLcosHostConfig: vi.fn(() => ({
    coreUrl: 'http://core',
    coreToken: 'token',
  })),
}));
vi.mock('@/store/canvasStore', () => ({ default: canvasStore }));

import { stageProjectedSources } from './stageProjectedSources';

const imageBinding = {
  spatialId: 'node-a',
  entityType: 'artifact',
  entityId: 'artifact-a',
  descriptor: {
    artifactKind: 'image',
    mimeType: 'image/png',
    fileRecordId: 'file-a',
  },
};

describe('stageProjectedSources ownership guard', () => {
  it('can restart on returning to a project without waiting for its obsolete fetch', async () => {
    const oldBlob = deferred<Blob>();
    getBlob.mockReturnValueOnce(oldBlob.promise).mockResolvedValueOnce(new Blob(['new'], { type: 'image/png' }));
    uploadImage.mockResolvedValueOnce('new-key.png');
    let oldActive = true;
    const oldRequest = stageProjectedSources('return-project', [imageBinding], () => oldActive);
    await vi.waitFor(() => expect(getBlob).toHaveBeenCalledTimes(1));
    oldActive = false;
    const freshRequest = stageProjectedSources('return-project', [imageBinding], () => true);
    await expect(freshRequest).resolves.toBe(1);
    oldBlob.resolve(new Blob(['old'], { type: 'image/png' }));
    await expect(oldRequest).resolves.toBe(0);
    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(canvasStore.state.updateNodeData).toHaveBeenCalledExactlyOnceWith('node-a', { src: 'new-key.png' });
  });
  beforeEach(() => {
    getBlob.mockReset();
    getNodeContent.mockReset();
    getNodeContent.mockResolvedValue({ rev: 'rev-current' });
    uploadImage.mockReset();
    uploadAudio.mockReset();
    uploadPdf.mockReset();
    uploadVideo.mockReset();
    canvasStore.state.canvasId = 'canvas-a';
    canvasStore.state.nodes = [
      { id: 'node-a', type: 'image', data: { src: '' } },
    ];
    canvasStore.state.updateNodeData.mockReset();
    canvasStore.state.seedNodeContentRevisions.mockReset();
  });

  it('does not update the new project after Core fetch resolves from the old project', async () => {
    const blob = deferred<Blob>();
    getBlob.mockReturnValueOnce(blob.promise);
    const current = vi.fn(() => currentProject);
    let currentProject = true;

    const pending = stageProjectedSources('project-a', [imageBinding], current);
    await vi.waitFor(() => expect(getBlob).toHaveBeenCalledOnce());

    currentProject = false;
    blob.resolve(new Blob(['image'], { type: 'image/png' }));

    await expect(pending).resolves.toBe(0);
    expect(uploadImage).not.toHaveBeenCalled();
    expect(canvasStore.state.updateNodeData).not.toHaveBeenCalled();
  });

  it('does not update the new project when upload resolves after ownership changes', async () => {
    const blob = deferred<Blob>();
    const upload = deferred<string>();
    getBlob.mockReturnValueOnce(blob.promise);
    uploadImage.mockReturnValueOnce(upload.promise);
    const current = vi.fn(() => currentProject);
    let currentProject = true;

    const pending = stageProjectedSources('project-a', [imageBinding], current);
    await vi.waitFor(() => expect(getBlob).toHaveBeenCalled());
    blob.resolve(new Blob(['image'], { type: 'image/png' }));
    await vi.waitFor(() => expect(uploadImage).toHaveBeenCalledOnce());

    currentProject = false;
    upload.resolve('artifact-key-a.png');

    await expect(pending).resolves.toBe(0);
    expect(canvasStore.state.updateNodeData).not.toHaveBeenCalled();
  });

  it('refreshes the authoritative content revision before staging src', async () => {
    getBlob.mockResolvedValueOnce(new Blob(['image'], { type: 'image/png' }));
    uploadImage.mockResolvedValueOnce('artifact-key.png');

    await expect(stageProjectedSources('project-a', [imageBinding])).resolves.toBe(1);

    expect(getNodeContent).toHaveBeenCalledExactlyOnceWith('canvas-a', 'node-a');
    expect(canvasStore.state.seedNodeContentRevisions).toHaveBeenCalledExactlyOnceWith([
      { nodeId: 'node-a', rev: 'rev-current' },
    ]);
    expect(canvasStore.state.updateNodeData).toHaveBeenCalledExactlyOnceWith('node-a', {
      src: 'artifact-key.png',
    });
  });
});

for (const kind of ['video', 'pdf'] as const) {
  it(`stages real ${kind} bytes with its own uploader and keeps the content CAS`, async () => {
    const mime = kind === 'pdf' ? 'application/pdf' : 'video/mp4';
    canvasStore.state.nodes = [{ id: 'node-a', type: kind, data: { src: '' } }];
    const upload = kind === 'pdf' ? uploadPdf : uploadVideo;
    upload.mockResolvedValue(`${kind}-key`);
    getBlob.mockResolvedValue(new Blob(['actual bytes'], { type: mime }));
    const binding = { ...imageBinding, descriptor: { artifactKind: kind, mimeType: mime, fileRecordId: `${kind}-file` } };
    await expect(stageProjectedSources(`project-${kind}`, [binding])).resolves.toBe(1);
    const file = upload.mock.calls[0]![0] as File;
    expect(file.type).toBe(mime);
    expect(file.name).toBe(`${kind}-file.${kind === 'pdf' ? 'pdf' : 'mp4'}`);
    expect(canvasStore.state.seedNodeContentRevisions).toHaveBeenCalled();
    expect(canvasStore.state.updateNodeData).toHaveBeenCalledWith('node-a', { src: `${kind}-key` });
  });
}
it('stages generated media in its neutral note host without changing the host type', async () => {
  canvasStore.state.nodes = [{ id: 'node-a', type: 'note', data: { src: '' } }];
  getBlob.mockResolvedValue(new Blob(['actual image'], { type: 'image/png' }));
  uploadImage.mockResolvedValue('generated-image.png');
  await expect(stageProjectedSources('project-generated', [imageBinding])).resolves.toBe(1);
  expect(canvasStore.state.updateNodeData).toHaveBeenCalledWith('node-a', { src: 'generated-image.png' });
});
it('does not overwrite user-provided source while staging real media', async () => {
  canvasStore.state.nodes = [{ id: 'node-a', type: 'image', data: { src: 'existing.png' } }];
  await expect(stageProjectedSources('project-existing', [imageBinding])).resolves.toBe(0);
  expect(getBlob).not.toHaveBeenCalled();
});

beforeEach(() => {
  getBlob.mockReset(); getNodeContent.mockReset(); getNodeContent.mockResolvedValue({ rev: 'rev-current' });
  uploadImage.mockReset(); uploadAudio.mockReset(); uploadPdf.mockReset(); uploadVideo.mockReset();
  canvasStore.state.canvasId = 'canvas-a';
  canvasStore.state.nodes = [{ id: 'node-a', type: 'image', data: { src: '' } }];
  canvasStore.state.updateNodeData.mockReset(); canvasStore.state.seedNodeContentRevisions.mockReset();
});
