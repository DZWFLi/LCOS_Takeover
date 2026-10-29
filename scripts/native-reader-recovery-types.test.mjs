import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(installedRoot, 'huabu/apps/web/package.json'));
const ts = createRequire(path.join(installedRoot, 'package.json'))('typescript');
const files = ['lab/pilot/native-reader-recovery-state.ts', 'lab/pilot/native-reader-recovery.tsx'].map(file => path.join(root, file));
const reactTypes = path.dirname(require.resolve('@types/react/package.json'));
const options = { strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, types: [], lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'] };
const host = ts.createCompilerHost(options);
host.resolveModuleNames = (names, containing) => names.map(name => {
  if (name === 'react' || name === 'react/jsx-runtime') return { resolvedFileName: path.join(reactTypes, name === 'react' ? 'index.d.ts' : 'jsx-runtime.d.ts'), extension: ts.Extension.Dts, isExternalLibraryImport: true };
  return ts.resolveModuleName(name, containing, options, host).resolvedModule;
});
const program = ts.createProgram(files, options, host);
const names = new Set(files.map(file => file.toLowerCase()));
const errors = ts.getPreEmitDiagnostics(program).filter(row => row.category === ts.DiagnosticCategory.Error
  && row.file && names.has(path.resolve(row.file.fileName).toLowerCase())).map(row => ({ file: row.file.fileName,
  line: row.file.getLineAndCharacterOfPosition(row.start ?? 0).line + 1, code: row.code, message: ts.flattenDiagnosticMessageText(row.messageText, '\n') }));
const output = path.join(root, 'output/原生文件Drop整合_20261017i/旧Reader目标类型检查.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ passed: errors.length === 0, scope: 'Strict diagnostics owned by the two actual new Reader recovery modules, real installed React types. Dependency diagnostics/whole workspace tsc are not claimed.', files, errors }, null, 2));
assert.deepEqual(errors, []);
console.log(JSON.stringify({ passed: true, errors: 0, report: output }));
