import { AdapterError } from './core-read.mjs';

// Synthetic records only. No account, project folder, database or file read.
export const fixtureProjects = [
  { id: 'fixture-project-one', name: '夺舍计划 · 模拟材料', rootPath: 'fixture://one', lastOpenedAt: '2026-10-13T00:00:00.000Z' },
  { id: 'fixture-project-two', name: '空项目 · 模拟', rootPath: 'fixture://two' },
];
export const fixtureArtifacts = [
  { id: 'fixture-artifact-image', projectId: 'fixture-project-one', title: '合成图片条目', kind: 'image', availability: 'available',
    currentRevisionId: 'fixture-revision-current', createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T02:00:00.000Z' },
  { id: 'fixture-artifact-markdown', projectId: 'fixture-project-one', title: '合成文档条目', kind: 'markdown', availability: 'missing',
    createdAt: '2026-10-13T01:00:00.000Z', updatedAt: '2026-10-13T01:00:00.000Z' },
];
export const fixtureRevisions = [
  { id: 'fixture-revision-newer', artifactId: 'fixture-artifact-image', fileRecordId: 'fixture-file-newer',
    source: 'import', status: 'draft', createdAt: '2026-10-13T03:00:00.000Z' },
  { id: 'fixture-revision-current', artifactId: 'fixture-artifact-image', fileRecordId: 'fixture-file-current',
    source: 'import', status: 'current', createdAt: '2026-10-13T02:00:00.000Z' },
];
export function fixtureRead(route) {
  if (route === '/projects') return fixtureProjects;
  const list = /^\/projects\/([^/]+)\/artifacts\?lifecycle=active$/.exec(route);
  if (list) return fixtureArtifacts.filter(item => item.projectId === decodeURIComponent(list[1]));
  const revisions = /^\/artifacts\/([^/]+)\/revisions$/.exec(route);
  if (revisions) return fixtureRevisions.filter(item => item.artifactId === decodeURIComponent(revisions[1]));
  throw new AdapterError(501, 'FIXTURE_READ_NOT_IMPLEMENTED', 'This synthetic Core read is not implemented.');
}
