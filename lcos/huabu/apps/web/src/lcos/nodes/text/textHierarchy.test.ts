import { describe, expect, it } from 'vitest';

import { layoutTextMindMap } from './Gen1TextMindMap';
import { mindmapNodeSize, textDisplayWidth } from './MatureMindMapLayout';
import { extractOutlineBranchText, parseOutline } from './outlineTree';
import { textHierarchy, visibleTextHierarchy } from './textHierarchy';

describe('same-body text hierarchy and Gen1 mindmap', () => {
  it('derives true Markdown headings, ignores fenced code, and preserves hierarchy across skipped levels', () => {
    const body = '# Main\n\n#### **Child**\n\n~~~~\n# Code is not a title\n~~~\n# Still code\n~~~~\n\nSecond\n------\n\n## Peer\n\n### Child';
    const rows = textHierarchy(body);
    const root = rows[0]; if (!root) throw new Error('Missing Markdown root');
    expect(rows.map((row) => row.title)).toEqual(['Main', 'Child', 'Second', '------', 'Peer', 'Child']);
    expect(rows[1]?.parentId).toBe(rows[0]?.id);
    expect(rows[1]?.depth).toBe(1);
    expect(rows[2]?.parentId).toBe(rows[1]?.id);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    expect(visibleTextHierarchy(rows, [root.id]).map((row) => row.title)).toEqual(['Main']);
    expect(textHierarchy('plain content without headings')[0]?.title).toBe('plain content without headings');
  });
  it('inherits mature indented/list/body rows, Chinese dimensions and non-destructive branch extraction', () => {
    const body = '- 计划\n  - 中文子分支 #标签\n    自然正文\n- 返回';
    const rows = textHierarchy(body);
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2, 0]);
    expect(rows[1]?.tags).toEqual(['标签']);
    expect(textDisplayWidth('中文', 13)).toBeGreaterThan(textDisplayWidth('ab', 13));
    expect(extractOutlineBranchText(parseOutline(body), rows[1]?.id ?? '')).toContain('自然正文');
    const size = mindmapNodeSize(body, '中文项目');
    expect(size.width).toBeGreaterThan(244); expect(size.width).toBeLessThanOrEqual(980);
    expect(body).toContain('自然正文');
  });
  it('keeps real Milkdown leading-space entities as indentation without rewriting the canonical Markdown',()=>{const body='一级条目\n&#x20; 子级条目\n另外一项';const rows=textHierarchy(body);expect(rows.map(row=>row.depth)).toEqual([0,1,0]);expect(rows[1]?.title).toBe('子级条目');expect(body).toContain('&#x20;');});
  it('lays out large branching content within scroll extents without shrinking leaves into overlaps', () => {
    const body = ['# Main', ...Array.from({ length: 5 }, (_, group) => [
      `## Group ${group}`, ...Array.from({ length: 12 }, (_, leaf) => `### Leaf ${group}/${leaf}`),
    ]).flat()].join('\n');
    const rows = textHierarchy(body), map = layoutTextMindMap(rows);
    const root = rows[0]; if (!root) throw new Error('Missing Markdown root');
    expect(map.placements).toHaveLength(rows.length);
    for (const [index, rect] of map.placements.entries()) {
      expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(map.width); expect(rect.y + rect.height).toBeLessThanOrEqual(map.height);
      for (const other of map.placements.slice(index + 1)) expect(rect.x < other.x + other.width && rect.x + rect.width > other.x
        && rect.y < other.y + other.height && rect.y + rect.height > other.y).toBe(false);
    }
    expect(map.height).toBeGreaterThan(800);
    expect(layoutTextMindMap(visibleTextHierarchy(rows, [root.id])).placements).toHaveLength(1);
  });
});
