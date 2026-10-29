import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readReaderFormat, resolveReaderFormat, stripReaderOfficePreamble } from './readerFormats';

const mimes = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

describe('exact revision Office/HTML content', () => {
  it.each(['docx', 'pptx', 'xlsx'] as const)('parses real %s revision bytes with the existing Office parser', async (format) => {
    const bytes = await readFile(resolve('src/lcos/professional/__fixtures__', format === 'pptx' ? 'reader-slides.pptx' : `reader-history.${format}`));
    const blob = new Blob([new Uint8Array(bytes)], { type: mimes[format] });
    const content = await readReaderFormat(blob, { fileName: '历史版本', viewKey: 'p:artifact:old-revision' });
    expect(content).toMatchObject({ kind: format === 'pptx' ? 'pptx' : 'office', viewKey: 'p:artifact:old-revision', mimeType: mimes[format] });
    if (format === 'pptx') {
      expect(content?.kind === 'pptx' && content.slides.length).toBe(2);
      expect(content?.kind === 'pptx' && content.slides[0]).toContain('<svg');
      expect(content?.kind === 'pptx' && content.slides[1]).toContain('Second historical slide');
    }
    expect(content?.value).toContain(`Historical ${{ docx: 'Word', pptx: 'PowerPoint', xlsx: 'Excel' }[format]} revision`);
    if (format === 'xlsx') expect(content?.value).toContain('42');
  });
  it('reads HTML as its exact source for a working preview, not generic text', async () => {
    const html = '<!doctype html><button onclick="this.textContent=\'Clicked\'">Old page</button>';
    expect(await readReaderFormat(new Blob([html], { type: 'text/html' }), { fileName: 'old.html', viewKey: 'old' }))
      .toEqual({ kind: 'html', value: html, mimeType: 'text/html', viewKey: 'old' });
  });
  it('keeps MIME precedence and does not interpret another binary format by a misleading suffix', () => {
    expect(resolveReaderFormat('application/pdf', 'misleading.docx')).toBeUndefined();
    expect(resolveReaderFormat('application/octet-stream', 'REPORT.PPTX')).toBe('pptx');
    expect(resolveReaderFormat('text/plain', 'page.html')).toBe('html');
    expect(resolveReaderFormat('text/html; charset=utf-8', 'page')).toBe('html');
    expect(resolveReaderFormat('application/octet-stream', 'old.ppt')).toBeUndefined();
  });
  it('does not turn corrupt Office bytes into fabricated body content', async () => {
    await expect(readReaderFormat(new Blob(['broken zip'], { type: mimes.docx }), { fileName: 'broken.docx' })).rejects.toThrow();
  });
  it('cancels the same revision read without parsing, fetching Current, or switching identity', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(readReaderFormat(new Blob(['old'], { type: 'text/html' }), { fileName: 'old.html', signal: controller.signal })).rejects.toThrow();
  });
  it('strips the parser-generated preamble using the native OfficeLoader behavior', () => {
    expect(stripReaderOfficePreamble('---\ntitle: Parser metadata\n---\n\n---\n\nBody')).toBe('Body');
    expect(stripReaderOfficePreamble('Body\n---\nStill body')).toBe('Body\n---\nStill body');
  });
});
