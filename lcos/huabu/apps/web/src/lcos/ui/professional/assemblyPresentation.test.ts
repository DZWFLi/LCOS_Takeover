import { describe, expect, it } from 'vitest';

import { assemblyDate, assemblyMaterialShape, captureMaterialShape, matchesAssemblyFilter,
  retainAssemblySelection, safeAssemblyLink, toggleAssemblySelection } from './assemblyPresentation';

describe('Assembly donor presentation helpers', () => {
  it.each([
    ['context', 'context'], ['collection', 'context'], ['workflow', 'workflow'],
    ['scene', 'context'], ['conversation', 'conversation'], ['note', 'text'],
  ] as const)('preserves the native body family for %s', (kind, expected) => {
    expect(assemblyMaterialShape({ kind })).toBe(expected);
  });
  it.each([
    ['image', 'image'], ['markdown', 'text'], ['pdf', 'document'], ['ppt', 'document'],
    ['audio', 'audio'], ['video', 'video'], ['link', 'link'], ['file', 'file'], ['archive', 'file'],
  ] as const)('maps the existing visual family %s', (visualFamily, expected) => {
    expect(assemblyMaterialShape({ kind: 'artifact', visualFamily })).toBe(expected);
  });
  it('keeps unknown capture kinds honest instead of fabricating a picture', () => {
    expect(captureMaterialShape('future-source')).toBe('file');
    expect(captureMaterialShape('web_image')).toBe('image');
    expect(captureMaterialShape('web_selection')).toBe('text');
    expect(captureMaterialShape('web_page')).toBe('link');
  });
  it('filters local loaded material families without a second source of truth', () => {
    expect(matchesAssemblyFilter('document', 'text')).toBe(true);
    expect(matchesAssemblyFilter('workflow', 'collection')).toBe(true);
    expect(matchesAssemblyFilter('audio', 'media')).toBe(true);
    expect(matchesAssemblyFilter('image', 'collection')).toBe(false);
    expect(matchesAssemblyFilter('skill', 'all')).toBe(true);
  });
  it('preserves identity and avoids unnecessary selection replacement', () => {
    const selected = ['artifact:a', 'capture:b'];
    expect(retainAssemblySelection(selected, new Set(selected))).toBe(selected);
    expect(retainAssemblySelection(selected, new Set(['capture:b']))).toEqual(['capture:b']);
    expect(toggleAssemblySelection(selected, 'artifact:a')).toEqual(['capture:b']);
    expect(toggleAssemblySelection(selected, 'resource:c')).toEqual([...selected, 'resource:c']);
    expect(selected).toEqual(['artifact:a', 'capture:b']);
  });
  it.each(['javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', '//example.org', 'not a URL'])('does not create an external link for %s', (value) => {
    expect(safeAssemblyLink(value)).toBeUndefined();
  });
  it('keeps an original HTTP source navigable', () => {
    expect(safeAssemblyLink('https://example.org/source?q=1')).toBe('https://example.org/source?q=1');
    expect(safeAssemblyLink('http://example.org')).toBe('http://example.org/');
    expect(safeAssemblyLink()).toBeUndefined();
  });
  it('does not fabricate a capture date when source metadata is absent or invalid', () => {
    expect(assemblyDate()).toBe('');
    expect(assemblyDate('not a date')).toBe('');
    expect(assemblyDate('2026-09-20T12:00:00Z')).not.toBe('');
  });
});
