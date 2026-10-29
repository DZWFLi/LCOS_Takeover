import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { currentGen2Root } from './current-gen2-resources.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = createRequire(path.join(currentGen2Root, 'package.json'))('typescript');
export const nativeTextLocationPersistenceSources = {
  window: 'lcos/huabu/apps/web/src/lcos/professional/professionalWindowPersistence.ts',
  ingress: 'lcos/huabu/apps/web/src/lcos/drop/materialTransferIngress.ts',
  lineage: 'lcos/huabu/apps/web/src/lcos/professional/readerLineage.ts',
};
const marker = '/* LCOS native text location persistence. */';
const helper = path.join(root, 'lab/pilot/native-text-location-persistence');
const owners = new Map(Object.entries(nativeTextLocationPersistenceSources).map(([kind, file]) => [path.resolve(root, file).toLowerCase(), kind]));

/** Only the original restore/transfer/lineage owners delegate their locator
 * boundary. The original stores, producer, relation transaction and return
 * paths remain intact. Source originals are never modified on disk. */
export function transformNativeTextLocationPersistenceSource(source, { sourcePath } = {}) {
  const kind = typeof sourcePath === 'string' ? owners.get(path.resolve(sourcePath).toLowerCase()) : undefined;
  if (!kind) throw new Error('Text location persistence requires its exact original owner sourcePath.');
  if (source.includes(marker)) return source;
  const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = { window: 'readSourceLocator', ingress: 'materialSourceAnchor', lineage: 'readerSourceLocator' };
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === names[kind]);
  if (functions.length !== 1 || !functions[0].body) throw new Error('Original text location persistence function seam changed.');
  const owner = functions[0], args = owner.parameters;
  if (args.length !== 1 || args[0].name.getText(ast) !== (kind === 'lineage' ? 'anchor' : 'value'))
    throw new Error('Original text location persistence parameter seam changed.');
  const imports = { window: 'normalizeNativePersistedSourceLocator', ingress: 'encodeNativeMaterialSourceAnchor', lineage: 'decodeNativeReaderSourceLocator' };
  const expression = kind === 'ingress' ? 'value.source.locator' : kind === 'lineage' ? 'anchor' : 'value';
  const edits = [{ start: owner.body.getStart(ast), end: owner.body.end, text: `{ return ${imports[kind]}(${expression}); }` }];
  if (kind === 'ingress') {
    // Validate before the original derived-material producer; a bad new
    // locator must not create a child and then degrade its provenance.
    const sourceSeam = '    const source = material.source;';
    const anchorSeam = '        const anchor = materialSourceAnchor(material);';
    if (source.split(sourceSeam).length !== 2 || source.split(anchorSeam).length !== 2)
      throw new Error('Original material transfer provenance producer seam changed.');
    const position = source.indexOf(sourceSeam) + sourceSeam.length;
    edits.push({ start: position, end: position, text: '\n    const nativeSourceAnchor = materialSourceAnchor(material);' });
    const anchor = source.indexOf(anchorSeam);
    edits.push({ start: anchor, end: anchor + anchorSeam.length, text: '        const anchor = nativeSourceAnchor;' });
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  let relative = path.relative(path.dirname(sourcePath), helper).replaceAll('\\', '/');
  if (!relative.startsWith('.')) relative = './' + relative;
  return `import { ${imports[kind]} } from ${JSON.stringify(relative)};\n${marker}\n` + source;
}

export function withNativeTextLocationPersistenceSourceTransforms(existing = {}) {
  const transforms = { ...existing };
  for (const file of Object.values(nativeTextLocationPersistenceSources)) {
    const before = transforms[file];
    transforms[file] = before ? (source, options) => transformNativeTextLocationPersistenceSource(before(source, options), options)
      : transformNativeTextLocationPersistenceSource;
  }
  return transforms;
}
