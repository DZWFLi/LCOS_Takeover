import { parseArtifactRef } from '@huabu/shared';

import { resolveArtifactUrl } from '@/api/artifact';

/** The existing Core import limit, applied before any source registration. */
const MAX_IMPORT_BYTES = 128 * 1024 * 1024;

export function validateNativeImageMaterial(file: File): void {
  if (!file.type.toLowerCase().startsWith('image/') || file.size === 0 || file.size > MAX_IMPORT_BYTES)
    throw new Error('原图片字节、类型或大小不支持导入，未用空文本替代。');
}

/** Read only the captured Native image source. No Core credentials, upload,
 * carrier creation, cross-canvas clone or external URL import is performed. */
export async function readNativeImageMaterial(input: { readonly src: string; readonly canvasId: string },
  signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<File> {
  if (!input.canvasId.trim() || !input.src.trim()) throw new Error('原图片地址未确认。');
  const stored = parseArtifactRef(input.src);
  if (stored?.canvasId && stored.canvasId !== input.canvasId)
    throw new Error('原图片存储地址不属于取用画布，未读取另一现场。');
  if (!stored && !input.src.startsWith('data:') && !input.src.startsWith('blob:'))
    throw new Error('这张图片尚无可读取的原生材料地址，未猜测外部来源。');
  const response = await fetcher(resolveArtifactUrl(input.src, input.canvasId), { signal });
  if (!response.ok) throw new Error('原图片字节未读回，未导入空材料。');
  const blob = await response.blob();
  const mime = blob.type.toLowerCase().split(';', 1)[0]?.trim() ?? '';
  const extension = ({ 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/png': 'png', 'image/webp': 'webp',
    'image/gif': 'gif', 'image/avif': 'avif', 'image/bmp': 'bmp', 'image/tiff': 'tiff' } as Readonly<Record<string, string>>)[mime] ?? 'image';
  const file = new File([blob], `native-image.${extension}`, { type: mime });
  validateNativeImageMaterial(file);
  return file;
}
