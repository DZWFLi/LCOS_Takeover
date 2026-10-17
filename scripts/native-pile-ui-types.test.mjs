import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'output/原生ColorPin整合_20261017h');
const require = createRequire(path.join(installedRoot, 'huabu/apps/web/package.json'));
const ts = createRequire(path.join(installedRoot, 'package.json'))('typescript');
const file = path.join(root, 'lab/pilot/native-pile-ui.tsx'), stub = path.join(root, '.runtime/native-pile-folder-type-boundary.d.ts');
const cssStub = path.join(root, '.runtime/native-pile-css-type-boundary.d.ts');
const reactTypes = path.dirname(require.resolve('@types/react/package.json'));
const options = { strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, types: [], lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'] };
const host = ts.createCompilerHost(options), exists = host.fileExists.bind(host), read = host.readFile.bind(host);
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
host.fileExists = name => same(name, stub) || same(name, cssStub) || exists(name);
host.readFile = name => same(name, stub) ? 'export declare const NativePileFolderFace: (props: any) => import("react").JSX.Element;'
  : same(name, cssStub) ? 'declare module "*.css";' : read(name);
const getSource = host.getSourceFile.bind(host);
host.getSourceFile = (name, version, error, fresh) => same(name, stub) || same(name, cssStub)
  ? ts.createSourceFile(name, host.readFile(name), version) : getSource(name, version, error, fresh);
host.resolveModuleNames = (names, containing) => names.map(name => {
  if (name === './native-pile-folder') return { resolvedFileName: stub, extension: ts.Extension.Dts };
  if (name === 'react' || name === 'react/jsx-runtime') return { resolvedFileName: path.join(reactTypes, name === 'react' ? 'index.d.ts' : 'jsx-runtime.d.ts'), extension: ts.Extension.Dts, isExternalLibraryImport: true };
  return ts.resolveModuleName(name, containing, options, host).resolvedModule;
});
const program = ts.createProgram([file, cssStub], options, host);
const errors = ts.getPreEmitDiagnostics(program).filter(row => row.category === ts.DiagnosticCategory.Error).map(row => ({
  file: row.file?.fileName, line: row.file && row.start !== undefined ? row.file.getLineAndCharacterOfPosition(row.start).line + 1 : undefined,
  code: row.code, message: ts.flattenDiagnosticMessageText(row.messageText, '\n') }));
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'PileUI目标类型检查.json'), JSON.stringify({ passed: errors.length === 0,
  scope: 'strict TypeScript for actual native-pile-ui.tsx with real installed React types and a typed-any pre-existing Folder component boundary; not whole workspace tsc or Folder implementation checking',
  file, errors }, null, 2));
assert.deepEqual(errors, []);
console.log(JSON.stringify({ passed: true, errors: 0, output: path.join(output, 'PileUI目标类型检查.json') }));
