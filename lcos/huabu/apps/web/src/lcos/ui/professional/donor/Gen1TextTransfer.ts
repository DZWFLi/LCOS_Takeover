// Adopted from LCOS-local-creativeOS@3e99769 apps/web/src/state/materialTransfer.ts.
// Retain GEN1's source/MIME/serialization for text selection transport. No Core writes.
export const LCOS_MATERIAL_TRANSFER_MIME = 'application/x-lcos-material-transfer'

export type MaterialLocatorV1 =
  | { readonly kind: 'lines'; readonly start: number; readonly end: number; readonly label?: string }
  | { readonly kind: 'page'; readonly pageNumber: number; readonly label?: string }
  | { readonly kind: 'slide'; readonly slideNumber: number; readonly label?: string }
  | { readonly kind: 'selection'; readonly label?: string }

export interface MaterialSourceV1 {
  readonly projectId?: string
  readonly viewId?: string
  readonly title: string
  readonly artifactId?: string
  readonly revisionId?: string
  readonly fileRecordId?: string
  readonly sourceKind?: string
  readonly sourceUrl?: string
  readonly provider?: string
  readonly locator?: MaterialLocatorV1
}

export type MaterialContentV1 =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'image'; readonly dataUrl: string; readonly mimeType: string; readonly fileName?: string }
  | { readonly kind: 'document-page'; readonly pageNumber: number; readonly previewDataUrl?: string; readonly text?: string }
  | { readonly kind: 'presentation-slide'; readonly slideNumber: number; readonly svg?: string; readonly text?: string }

export interface MaterialTransferPayloadV1 {
  readonly schemaVersion: 1
  readonly kind: 'material-transfer'
  readonly capturedAt: string
  readonly source: MaterialSourceV1
  readonly content: MaterialContentV1
}

export function serializeMaterialTransfer(payload: MaterialTransferPayloadV1): string {
  return JSON.stringify(payload)
}

/** GEN1 parser, shared by Canvas and Composer; reject absent page identity. */
export function parseMaterialTransfer(raw: string): MaterialTransferPayloadV1 | null {
  try {
    const value = JSON.parse(raw) as MaterialTransferPayloadV1;
    if (value.schemaVersion !== 1 || value.kind !== 'material-transfer' || typeof value.source?.title !== 'string') return null;
    const content = value.content;
    if (content?.kind === 'text' && typeof content.text === 'string' && content.text.trim()) return value;
    if (content?.kind === 'image' && typeof content.dataUrl === 'string' && content.dataUrl.startsWith('data:')) return value;
    if (content?.kind === 'document-page' && Number.isSafeInteger(content.pageNumber) && content.pageNumber > 0) return value;
    if (content?.kind === 'presentation-slide' && Number.isSafeInteger(content.slideNumber) && content.slideNumber > 0) return value;
    return null;
  } catch { return null; }
}

/** Text presentation accompanies the structured exact-version draft reference. */
export function materialCitationBlock(source: MaterialSourceV1, text: string, options:{readonly includeAddress?:boolean} = {}): string {
  const address = options.includeAddress && source.artifactId && source.revisionId ? `artifact:${source.artifactId}@${source.revisionId} · ` : '';
  const locator = source.locator?.label ? ` · ${source.locator.label}` : '';
  return `〔来源 ${address}${source.title}${locator}〕\n> ${text.trim().replace(/\n/g, '\n> ')}`;
}
