import { parseMaterialTransfer } from '../../lcos/huabu/apps/web/src/lcos/ui/professional/donor/Gen1TextTransfer';
import { normalizeNativeTextLocator, type NativeTextSingleLocator, type NativeTextSourceLocator } from './native-text-location';

const record = (value: unknown): value is Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null;
};
const address = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const keys = (value: Record<string, any>, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key));
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (!record(a) || !record(b)) return false;
  const left = Object.keys(a).filter(key => a[key] !== undefined), right = Object.keys(b).filter(key => b[key] !== undefined);
  return left.length === right.length && left.every(key => right.includes(key) && same(a[key], b[key]));
}
const textLocation = (value: NativeTextSingleLocator) => value.kind === 'lines' || value.kind === 'selection' && 'textRange' in value;
function excerptLocation(value: unknown, body: string): NativeTextSourceLocator | undefined {
  const locator = normalizeNativeTextLocator(value);
  // Normalization is a validator here, never an opportunity to strip unknown
  // execution fields and then expose them under a broadly allowed locator key.
  if (!locator || !same(locator, value)) return;
  const list = 'locations' in locator ? locator.locations : [locator];
  if (!list.every(textLocation)) return;
  const selected = 'locations' in locator ? locator.selected : locator;
  if (!selected || !textLocation(selected)) return;
  if ('textRange' in selected && selected.textRange.quote !== body) return;
  return locator;
}

/** Restore one validated GUI source position after the existing safeClone.
 * The original bridge/history still own current scene, API, queue and receipt
 * admission. No other token/agent/locator field is copied or exempted. */
export function restoreNativeMaterialExcerptReceiptLocator(receipt: unknown, sanitized: unknown): unknown {
  try {
    if (!record(receipt) || !record(sanitized) || receipt.receiptKind !== 'native-create-identity'
      || ![receipt.projectId, receipt.canvasId, receipt.clientNodeId, receipt.nodeId].every(address)
      || !record(receipt.operation) || receipt.operation.version !== 1 || receipt.operation.kind !== 'create'
      || receipt.operation.phase !== 'apply' || !address(receipt.operation.operationId)
      || !record(receipt.submitted) || receipt.submitted.type !== 'text' || receipt.submitted.id !== receipt.clientNodeId
      || !record(receipt.submitted.data) || !record(receipt.data) || receipt.data.id !== receipt.nodeId
      || !record(receipt.ref) || receipt.ref.version !== 1 || !['artifact', 'view'].includes(receipt.ref.entityType)
      || ![receipt.ref.artifactId, receipt.ref.artifactViewId, receipt.ref.revisionId].every(address)
      || receipt.ref.entityId !== (receipt.ref.entityType === 'artifact' ? receipt.ref.artifactId : receipt.ref.artifactViewId)) return sanitized;
    const raw = receipt.submitted.data.lcos_material_excerpt;
    if (!record(raw) || !keys(raw, ['schemaVersion', 'kind', 'capturedAt', 'source', 'content'])
      || !record(raw.source) || !keys(raw.source, ['projectId', 'viewId', 'title', 'artifactId', 'revisionId', 'fileRecordId', 'sourceKind', 'sourceUrl', 'provider', 'locator'])
      || ['sourceKind', 'sourceUrl', 'provider'].some(key => raw.source[key] !== undefined && typeof raw.source[key] !== 'string')
      || !record(raw.content) || !keys(raw.content, ['kind', 'text'])
      || !address(raw.capturedAt) || !Number.isFinite(Date.parse(raw.capturedAt))) return sanitized;
    const payload = parseMaterialTransfer(JSON.stringify(raw));
    if (!payload || payload.content.kind !== 'text' || payload.source.projectId !== receipt.projectId
      || ![payload.source.artifactId, payload.source.revisionId, payload.source.fileRecordId].every(address)
      || payload.source.viewId !== undefined && !address(payload.source.viewId)
      || payload.source.artifactId === receipt.ref.artifactId
      || receipt.submitted.data.text !== payload.content.text || receipt.data.text !== payload.content.text
      || receipt.data.content !== payload.content.text || receipt.data.lcos_material_excerpt !== undefined
      || receipt.submitted.data.content !== undefined && receipt.submitted.data.content !== payload.content.text
      || receipt.submitted.data.lcos_ref !== undefined) return sanitized;
    const locator = excerptLocation(payload.source.locator, payload.content.text);
    if (!locator) return sanitized;
    const clean = sanitized.submitted?.data?.lcos_material_excerpt;
    if (!record(clean) || !record(clean.source) || clean.source.locator !== undefined
      || !record(sanitized.submitted) || !record(sanitized.submitted.data)
      || !record(sanitized.data) || !record(sanitized.ref)
      || ['receiptKind', 'projectId', 'canvasId', 'clientNodeId', 'nodeId'].some(key => sanitized[key] !== receipt[key])
      || !same(sanitized.operation, receipt.operation) || !same(sanitized.ref, receipt.ref)
      || sanitized.submitted.id !== receipt.submitted.id || sanitized.submitted.type !== 'text'
      || sanitized.data.id !== receipt.data.id || sanitized.data.text !== payload.content.text || sanitized.data.content !== payload.content.text
      || sanitized.data.lcos_material_excerpt !== undefined || sanitized.submitted.data.text !== payload.content.text
      || sanitized.submitted.data.content !== receipt.submitted.data.content
      || sanitized.submitted.data.lcos_ref !== undefined
      || clean.schemaVersion !== payload.schemaVersion || clean.kind !== payload.kind || clean.capturedAt !== payload.capturedAt
      || !same(clean.content, payload.content)
      || Object.keys(raw.source).filter(key => key !== 'locator').some(key => !same(clean.source[key], raw.source[key]))) return sanitized;
    // Shallow copies only along this fixed path; every other field remains the
    // exact already-sanitized value, including partial receipt state.
    return { ...sanitized, submitted: { ...sanitized.submitted, data: { ...sanitized.submitted.data,
      lcos_material_excerpt: { ...clean, source: { ...clean.source, locator } } } } };
  } catch { return sanitized; }
}

