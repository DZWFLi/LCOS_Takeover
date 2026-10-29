import { transformNativeTextScript, restoreNativeTextScriptForComparison } from './native-text-transform.mjs';

const legacyImport = 'import{LCOSNativeTextBodySlot,LCOSRequestNativeTextEdit}from"/lcos/agent-ui.js";\n';
const nativeImport = 'import{LCOSNativeTextBodySlot,LCOSRequestNativeTextEdit}from"/lcos/native-text-first-ui.js";\n';
const originalRouter = 'const t=e.data.type||Ck.GENERATE;return d.useMemo';
const localRouter = 'const t=e.data.lcos_ref?.version===1&&["artifact","view"].includes(e.data.lcos_ref?.entityType)&&["artifactId","artifactViewId","revisionId","entityId"].every(k=>typeof e.data.lcos_ref[k]==="string"&&e.data.lcos_ref[k].trim().length>0)&&e.data.lcos_ref.entityId===(e.data.lcos_ref.entityType==="artifact"?e.data.lcos_ref.artifactId:e.data.lcos_ref.artifactViewId)?Ck.PURE:e.data.type||Ck.GENERATE;return d.useMemo';

/** Reuse the measured original Text child seam, but keep the native Markdown
 * and media editor. Only the original toolbar and the missing Gen1 map leaf
 * are supplied to this isolated mode. Legacy modes are unchanged. */
export function transformNativeFirstTextScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== 'course-api-base-url-CifxI1ia.js') return source;
  const normalized = source.replace(nativeImport, legacyImport).replace(localRouter, originalRouter);
  let result = transformNativeTextScript(filename, normalized);
  if (result.split(legacyImport).length !== 2) throw new Error('Native-first text import seam changed.');
  if (result.split(originalRouter).length !== 2) throw new Error('Native-first original Pure/Generate Text router seam changed.');
  result = result.replace(originalRouter, localRouter);
  if (result.split(',originalBody:').length !== 3 || result.includes(',NativeToolbar:JT,'))
    throw new Error('Native-first Text body seam changed.');
  return result.replace(legacyImport, nativeImport);
}

export function restoreNativeFirstTextScriptForComparison(filename, source) {
  return restoreNativeTextScriptForComparison(filename, source.replace(nativeImport, legacyImport)
    .replaceAll(',NativeToolbar:JT,originalBody:', ',originalBody:').replace(localRouter, originalRouter));
}
