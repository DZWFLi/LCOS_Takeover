// Explicit synthetic HTTP responses for the ORIGINAL Gen2 typed clients.
// Never delegates to global fetch, never simulates canonical write success.
export function createExplicitFixtureFetch({ baseUrl, imageBlob, draftImageBlob } = {}) {
  const base = new URL(baseUrl);
  const calls = [];
  const projectId = 'fixture-project-one';
  const artifacts = [
    { id: 'fixture-artifact-image', projectId, title: '合成图片 · 当前版本', kind: 'image',
      availability: 'available', currentRevisionId: 'fixture-revision-current' },
    { id: 'fixture-artifact-text', projectId, title: '只读文本 · Gen2 内容入口', kind: 'markdown',
      availability: 'available', currentRevisionId: 'fixture-revision-text' },
    { id: 'fixture-artifact-missing', projectId, title: '缺失内容 · 错误分支', kind: 'image',
      availability: 'missing', currentRevisionId: 'fixture-revision-missing' },
  ];
  const revisions = {
    'fixture-artifact-image': [
      { id: 'fixture-revision-newer', artifactId: 'fixture-artifact-image', fileRecordId: 'fixture-file-newer',
        status: 'draft', source: 'import', createdAt: '2026-10-13T03:00:00.000Z' },
      { id: 'fixture-revision-current', artifactId: 'fixture-artifact-image', fileRecordId: 'fixture-file-current',
        status: 'current', source: 'import', createdAt: '2026-10-13T02:00:00.000Z' },
    ],
    'fixture-artifact-text': [
      { id: 'fixture-revision-text', artifactId: 'fixture-artifact-text', fileRecordId: 'fixture-file-text', status: 'current' },
    ],
    'fixture-artifact-missing': [],
  };
  const json = (value, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { 'content-type': 'application/json', 'x-lcos-source': 'explicit-fixture' },
  });
  const ok = value => json({ ok: true, value: structuredClone(value), meta: { source: 'explicit-fixture', coreConnected: false } });
  const failure = (status, code, message) => json({ ok: false, error: { code, message }, meta: { source: 'explicit-fixture' } }, status);
  async function fetchFixture(input, options = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname + '/')) {
      throw new Error('Fixture fetch refuses every URL outside its explicit fixture prefix; no network fallback.');
    }
    const route = url.pathname.slice(base.pathname.length) + url.search;
    const method = options.method || 'GET';
    calls.push({ method, route, source: 'explicit-fixture' });
    if (calls.length > 300) calls.shift();
    if (options.signal?.aborted) throw new DOMException('Fixture read aborted', 'AbortError');
    if (method !== 'GET') return failure(501, 'ACTION_NOT_IMPLEMENTED', 'Fixture writes are not implemented.');
    if (route === '/projects') return ok([
      { id: projectId, name: 'Gen2 · 原组件试接（模拟）', rootPath: 'fixture://not-a-user-directory' },
      { id: 'fixture-project-two', name: '空项目（模拟）', rootPath: 'fixture://empty' },
    ]);
    if (route === '/projects/' + projectId + '/artifacts?lifecycle=active') return ok(artifacts);
    if (route === '/projects/fixture-project-two/artifacts?lifecycle=active') return ok([]);
    const revisionMatch = /^\/artifacts\/([^/]+)\/revisions$/.exec(route);
    if (revisionMatch && revisions[revisionMatch[1]]) return ok(revisions[revisionMatch[1]]);
    const contentMatch = /^\/projects\/([^/]+)\/file-records\/([^/]+)\/content$/.exec(route);
    if (contentMatch && contentMatch[1] === projectId) {
      const file = contentMatch[2];
      const blob = file === 'fixture-file-current' ? imageBlob : file === 'fixture-file-newer' ? draftImageBlob :
        file === 'fixture-file-text' ? new Blob(['# Gen2 只读文本\n\n这段内容通过原 CoreArtifactClient.getFileRecordContent 取得。\n响应为明确 Fixture，不是已连接的真实项目。\n\n<script>此字符串只作为文本展示</script>'], { type: 'text/markdown' }) : null;
      if (blob instanceof Blob) return new Response(blob, { headers: { 'content-type': blob.type, 'x-lcos-source': 'explicit-fixture' } });
      return failure(404, 'FILE_NOT_FOUND', 'Fixture has no bytes for that FileRecord.');
    }
    return failure(404, 'FIXTURE_READ_NOT_IMPLEMENTED', 'This fixture read is not implemented.');
  }
  return { fetch: fetchFixture, calls, source: 'explicit-fixture', coreConnected: false };
}
