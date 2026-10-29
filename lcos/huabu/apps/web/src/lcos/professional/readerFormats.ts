/** Reader format adoption: exact immutable FileRecord bytes are supplied by the
 * existing Reader revision owner. This module never reads canvas Current data.
 * Office parser/flags match Huabu OfficeLoader (Microsoft, MIT); its browser
 * slim entry omits OCR/CDN workers. HTML uses WebPreview's local-artifact sandbox.
 */
import { readReaderPptx, type ReaderPptxContent } from './readerPptx';

export type ReaderOfficeFormat = 'docx' | 'pptx' | 'xlsx';
export type ReaderFormatContent =
  | { readonly kind: 'office'; readonly format: ReaderOfficeFormat; readonly value: string; readonly mimeType: string; readonly viewKey?: string }
  | { readonly kind: 'html'; readonly value: string; readonly mimeType: string; readonly viewKey?: string }
  | ReaderPptxContent;

const OFFICE_MIME_FORMATS: Readonly<Record<string, ReaderOfficeFormat>> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

export function resolveReaderFormat(mimeType: string, fileName: string): ReaderOfficeFormat | 'html' | undefined {
  const mime = mimeType.split(';')[0].trim().toLowerCase();
  const office = OFFICE_MIME_FORMATS[mime];
  if (office) return office;
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return 'html';
  // Generic uploads may omit MIME. A known contradictory MIME stays with its
  // original reader, rather than interpreting e.g. a PDF called "report.docx".
  if (mime && mime !== 'application/octet-stream' && mime !== 'text/plain') return undefined;
  const extension = fileName.split('.').at(-1)?.toLowerCase();
  if (extension === 'docx' || extension === 'pptx' || extension === 'xlsx') return extension;
  return extension === 'html' || extension === 'htm' || extension === 'xhtml' ? 'html' : undefined;
}

/** Lift of OfficeLoader's sidecar cleanup; no server filesystem module imported. */
export function stripReaderOfficePreamble(markdown: string): string {
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n+/, '').replace(/^(?:[-*_]{3,}[ \t]*\n+)+/, '');
}

/** Returns null only for another format. Read/parse failures propagate to the
 * existing Reader's same-revision retry; no fallback to a newer FileRecord.
 */
export async function readReaderFormat(
  bytes: Blob,
  input: { readonly fileName: string; readonly viewKey?: string; readonly signal?: AbortSignal },
): Promise<ReaderFormatContent | null> {
  const format = resolveReaderFormat(bytes.type, input.fileName);
  if (format === undefined) return null;
  input.signal?.throwIfAborted();
  const identity = { mimeType: bytes.type, ...(input.viewKey === undefined ? {} : { viewKey: input.viewKey }) };
  if (format === 'pptx') return readReaderPptx(bytes, input);
  if (format === 'html') {
    const value = await bytes.text();
    input.signal?.throwIfAborted();
    return { kind: 'html', value, ...identity };
  }
  const { OfficeParser } = await import('officeparser/slim');
  input.signal?.throwIfAborted();
  const buffer = await bytes.arrayBuffer();
  input.signal?.throwIfAborted();
  const document = await OfficeParser.parseOffice(buffer, {
    fileType: format, ignoreNotes: false, ignoreComments: true, extractAttachments: false,
    ...(input.signal === undefined ? {} : { abortSignal: input.signal }),
  });
  const parsed = await document.to('md');
  input.signal?.throwIfAborted();
  if (typeof parsed.value !== 'string') throw new Error('Office 正文转换未返回可读取内容，请重读同一版本。');
  return { kind: 'office', format, value: stripReaderOfficePreamble(parsed.value), ...identity };
}
