import type { MaterialSourceV1, MaterialTransferPayloadV1 } from './donor/Gen1TextTransfer';
import type { PDFPageProxy } from 'pdfjs-dist';

/** Gen1 exact-source page transfer; an unread page is never a fabricated material. */
export function pdfPageTransfer(source: MaterialSourceV1, page: number,
  snapshot?: string, text?: string): MaterialTransferPayloadV1 | undefined {
  const image = snapshot?.startsWith('data:image/png') ? snapshot : undefined;
  if (!source.projectId || !source.artifactId || !source.revisionId || !source.fileRecordId
    || !Number.isSafeInteger(page) || page < 1 || !image && !text?.trim()) return;
  return { schemaVersion: 1, kind: 'material-transfer', capturedAt: new Date().toISOString(),
    source: { ...source, locator: { kind: 'page', pageNumber: page, label: `第 ${page} 页` } },
    content: { kind: 'document-page', pageNumber: page, ...(image ? { previewDataUrl: image } : {}), ...(text?.trim() ? { text } : {}) } };
}
export async function pdfPageText(page: Pick<PDFPageProxy, 'getTextContent'>): Promise<string> {
  const content = await page.getTextContent();
  return content.items.map(item => 'str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '').join('').trim();
}
