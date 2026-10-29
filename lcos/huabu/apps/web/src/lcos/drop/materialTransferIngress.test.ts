import { expect, it } from 'vitest';

import { materialSourceAnchor, parseMaterialTransfer } from './materialTransferIngress';

const source = { projectId: 'p', artifactId: 'a', revisionId: 'old', fileRecordId: 'file-old', title: '原演示.pptx', locator: { kind: 'slide' as const, slideNumber: 2 } };
const payload = { schemaVersion: 1, kind: 'material-transfer', capturedAt: 'now', source,
  content: { kind: 'presentation-slide', slideNumber: 2, svg: '<svg><text>第二页</text></svg>' } };
it('keeps the exact source and page identity when a real slide crosses the material boundary', () => {
  const parsed = parseMaterialTransfer(JSON.stringify(payload));
  expect(parsed).toEqual(payload); expect(parsed && materialSourceAnchor(parsed)).toBe('pptx:s2');
});
it('does not turn broken, empty or negative pages into pretend material', () => {
  expect(parseMaterialTransfer('broken')).toBeNull();
  expect(parseMaterialTransfer(JSON.stringify({ ...payload, content: { kind: 'text', text: '' } }))).toBeNull();
  expect(parseMaterialTransfer(JSON.stringify({ ...payload, content: { kind: 'presentation-slide', slideNumber: -1 } }))).toBeNull();
});
