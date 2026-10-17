// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { expect, it } from 'vitest';

import { pdfPageText, pdfPageTransfer } from './readerPdfMaterial';

it('parses two real historical PDF pages and extracts actual text plus a real PNG using the existing PDF.js renderer', async () => {
  const bytes = await readFile(resolve('src/lcos/professional/__fixtures__/reader-pages.pdf'));
  const loading = getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: true, isEvalSupported: false });
  const document = await loading.promise;
  try {
    expect(document.numPages).toBe(2);
    const page = await document.getPage(2);
    expect(await pdfPageText(page)).toContain('Historical PDF page two');
    const viewport = page.getViewport({ scale: 1 });
    const factory = document.canvasFactory as { create(width: number, height: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D };
      destroy(value: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }): void };
    const rendered = factory.create(viewport.width, viewport.height);
    try {
      await page.render({ canvas: rendered.canvas, canvasContext: rendered.context, viewport }).promise;
      const snapshot = rendered.canvas.toDataURL('image/png');
      expect(snapshot).toMatch(/^data:image\/png;base64,/); expect(snapshot.length).toBeGreaterThan(100);
      const payload = pdfPageTransfer({ projectId: 'p', artifactId: 'a', revisionId: 'old', fileRecordId: 'old-file', title: 'original.pdf' }, 2, snapshot, await pdfPageText(page));
      expect(payload).toMatchObject({ source: { revisionId: 'old', locator: { kind: 'page', pageNumber: 2 } },
        content: { kind: 'document-page', text: 'Historical PDF page two', previewDataUrl: snapshot } });
    } finally { factory.destroy(rendered); }
  } finally { await loading.destroy(); }
});
