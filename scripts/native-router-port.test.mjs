import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');
const vendorPath = 'reference/tapnow-installed/resources/web/assets/index-BAQXnPag.js';
const vendorUrl = '/assets/index-BAQXnPag.js';

function parseFinalExportMap(source) {
  const exportStart = source.lastIndexOf('export{');
  assert.notEqual(exportStart, -1, 'Current vendor module must end with its minified ESM export table.');
  const open = exportStart + 'export'.length;
  assert.equal(source[open], '{', 'Expected the final module export list.');
  const close = source.indexOf('}', open + 1);
  assert.notEqual(close, -1, 'Final export list must be closed.');

  const exported = new Map();
  for (const rawSpecifier of source.slice(open + 1, close).split(',')) {
    const specifier = rawSpecifier.trim();
    const match = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(specifier);
    assert.ok(match, `Unrecognized minified export specifier: ${specifier}`);
    const [, localName, exportName = localName] = match;
    exported.set(exportName, localName);
  }
  return exported;
}

function skipQuoted(source, index) {
  const quote = source[index];
  for (let cursor = index + 1; cursor < source.length; cursor += 1) {
    if (source[cursor] === '\\') { cursor += 1; continue; }
    if (source[cursor] === quote) return cursor + 1;
  }
  throw new Error(`Unclosed ${quote} string in vendor bundle.`);
}

function skipCommentOrString(source, index) {
  const current = source[index];
  if (current === '"' || current === "'" || current === '`') return skipQuoted(source, index);
  if (current === '/' && source[index + 1] === '/') {
    const newline = source.indexOf('\n', index + 2);
    return newline === -1 ? source.length : newline + 1;
  }
  if (current === '/' && source[index + 1] === '*') {
    const close = source.indexOf('*/', index + 2);
    if (close === -1) throw new Error('Unclosed block comment in vendor bundle.');
    return close + 2;
  }
  return index;
}

function findMatching(source, openIndex, open, close) {
  assert.equal(source[openIndex], open, `Expected ${open} at ${openIndex}.`);
  let depth = 0;
  for (let cursor = openIndex; cursor < source.length; cursor += 1) {
    const skipped = skipCommentOrString(source, cursor);
    if (skipped !== cursor) { cursor = skipped - 1; continue; }
    if (source[cursor] === open) depth += 1;
    else if (source[cursor] === close && --depth === 0) return cursor;
  }
  throw new Error(`Unclosed ${open} delimiter in vendor bundle.`);
}

function findParameterEnd(source, openParen) {
  return findMatching(source, openParen, '(', ')');
}

function vendorFunctionBody(source, localName) {
  const declaration = new RegExp(`\\bfunction\\s+${localName.replace(/[$]/g, '\\$')}\\s*\\(`, 'g');
  const matches = [...source.matchAll(declaration)];
  assert.equal(matches.length, 1, `Expected one function declaration for exported binding ${localName}.`);
  const openParen = source.indexOf('(', matches[0].index + matches[0][0].indexOf('function'));
  const closeParen = findParameterEnd(source, openParen);
  let openBrace = closeParen + 1;
  while (/\s/.test(source[openBrace] ?? '')) openBrace += 1;
  assert.equal(source[openBrace], '{', `Expected a function body for ${localName}.`);
  const closeBrace = findMatching(source, openBrace, '{', '}');
  return source.slice(openBrace + 1, closeBrace);
}

function vendorVariableInitializer(source, localName) {
  const assignment = new RegExp(`\\b${localName.replace(/[$]/g, '\\$')}\\s*=(?!=)`, 'g');
  const matches = [...source.matchAll(assignment)];
  assert.equal(matches.length, 1, `Expected one initializer for exported binding ${localName}.`);
  const expressionStart = matches[0].index + matches[0][0].length;
  let paren = 0, brace = 0, bracket = 0;
  for (let cursor = expressionStart; cursor < source.length; cursor += 1) {
    const skipped = skipCommentOrString(source, cursor);
    if (skipped !== cursor) { cursor = skipped - 1; continue; }
    const char = source[cursor];
    if (char === '(') paren += 1;
    else if (char === ')') paren -= 1;
    else if (char === '{') brace += 1;
    else if (char === '}') brace -= 1;
    else if (char === '[') bracket += 1;
    else if (char === ']') bracket -= 1;
    else if ((char === ',' || char === ';') && paren === 0 && brace === 0 && bracket === 0) {
      return source.slice(expressionStart, cursor).trim();
    }
  }
  throw new Error(`Could not find initializer boundary for ${localName}.`);
}

function removeComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

test('native router shim is only a named-export port into the live vendor Router module', async () => {
  const [shim, reactShim, vendor] = await Promise.all([
    read('lab/native-router.js'),
    read('lab/native-react.js'),
    read(vendorPath),
  ]);
  const code = removeComments(shim);
  const statements = code.split(';').map((part) => part.trim()).filter(Boolean);
  assert.equal(statements.length, 1, 'The shim must not create local Router state or mount a provider.');
  const declaration = /^export\s*\{([\s\S]*)\}\s*from\s*(['"])([^'"]+)\2$/.exec(statements[0]);
  assert.ok(declaration, 'Expected one re-export declaration.');
  assert.equal(declaration[3], vendorUrl);

  const forwarded = new Map();
  for (const specifier of declaration[1].split(',')) {
    if (!specifier.trim()) continue; // A trailing comma is valid in the shim export list.
    const match = /^\s*([\w$]+)\s+as\s+([\w$]+)\s*$/.exec(specifier);
    assert.ok(match, `Expected an explicit named export: ${specifier}`);
    forwarded.set(match[2], match[1]);
  }
  assert.deepEqual([...forwarded.entries()], [
    ['useNavigate', 'cb'],
    ['useLocation', 'cH'],
    ['useParams', 'ca'],
    ['useSearchParams', 'cs'],
    ['Link', 'em'],
    ['Navigate', 'cn'],
  ]);
  assert.doesNotMatch(code, /\b(?:RouterProvider|BrowserRouter|MemoryRouter|createRoot|createContext)\b/,
    'No second Router provider, React root, or context may be created by the port.');

  const exports = parseFinalExportMap(vendor);
  const expectedVendorBindings = {
    cb: 'El', cH: 'Rc', ca: 'Cls', cs: 'yYe', em: 'EMa', cn: 'CBe',
  };
  for (const [exportName, localName] of Object.entries(expectedVendorBindings)) {
    assert.equal(exports.get(exportName), localName, `Vendor export ${exportName} must still refer to ${localName}.`);
  }

  // The vendor uses `w` for its React object. The existing React port imports
  // that exact binding, so Router's createContext/useContext calls stay in the
  // same runtime rather than constructing another context universe.
  assert.equal(exports.get('cd'), 'w');
  assert.match(reactShim, /import\s*\{\s*cd\s+as\s+React\s*\}\s*from\s*['"]\/assets\/index-BAQXnPag\.js['"]/);
});

test('vendor aliases are tied to original Router contexts and route-aware helpers', async () => {
  const vendor = await read(vendorPath);
  const exports = parseFinalExportMap(vendor);
  const binding = (externalName) => {
    const value = exports.get(externalName);
    assert.ok(value, `Missing vendor ESM export ${externalName}.`);
    return value;
  };

  for (const contextName of ['T9', 'vYe', 's5']) {
    const initializer = vendorVariableInitializer(vendor, contextName);
    assert.match(initializer, /^w\.createContext\(/, `${contextName} must be a context created by the vendor React binding.`);
  }
  assert.match(vendorVariableInitializer(vendor, 's5'), /outlet:null,matches:\[\],isDataRoute:!1/,
    'RouteContext carries the original route matches/outlet state.');

  const useLocation = vendorFunctionBody(vendor, binding('cH'));
  assert.match(useLocation, /w\.useContext\(vYe\)\.location/);
  const useNavigate = vendorFunctionBody(vendor, binding('cb'));
  assert.match(useNavigate, /w\.useContext\(s5\)/);
  assert.match(useNavigate, /isDataRoute/);
  assert.match(useNavigate, /Fls\(\).*Als\(\)/);
  const genericNavigate = vendorFunctionBody(vendor, 'Als');
  assert.match(genericNavigate, /w\.useContext\(T9\)/);
  assert.match(genericNavigate, /w\.useContext\(s5\)/);
  assert.match(genericNavigate, /Rc\(\)/);
  assert.match(genericNavigate, /\.go\(d\)/);
  assert.match(genericNavigate, /a\.replace:a\.push/);

  const useParams = vendorFunctionBody(vendor, binding('ca'));
  assert.match(useParams, /w\.useContext\(s5\)/);
  assert.match(useParams, /matches/);
  assert.match(useParams, /\.params/);
  const useSearchParams = vendorFunctionBody(vendor, binding('cs'));
  assert.match(useSearchParams, /Rc\(\)/);
  assert.match(useSearchParams, /\.search/);
  assert.match(useSearchParams, /El\(\)/);

  const link = vendorVariableInitializer(vendor, binding('em'));
  assert.match(link, /w\.forwardRef\(/);
  assert.match(link, /w\.useContext\(T9\)/);
  assert.match(link, /Mls\(/);
  assert.match(link, /scs\(/);
  const createHref = vendorFunctionBody(vendor, 'Mls');
  assert.match(createHref, /w\.useContext\(T9\)/);
  const linkClick = vendorFunctionBody(vendor, 'scs');
  assert.match(linkClick, /El\(\)/);
  assert.match(linkClick, /Rc\(\)/);

  const navigateElement = vendorFunctionBody(vendor, binding('cn'));
  assert.match(navigateElement, /w\.useContext\(T9\)/);
  assert.match(navigateElement, /w\.useContext\(s5\)/);
  assert.match(navigateElement, /Rc\(\)/);
  assert.match(navigateElement, /El\(\)/);
  assert.match(navigateElement, /w\.useEffect\(/);
  assert.match(navigateElement, /,null$/);

  // Existing Router wrappers/route renderers provide these same context
  // objects; the shim itself only forwards the consumers above.
  assert.match(vendorFunctionBody(vendor, 'zls'), /w\.createElement\(T9\.Provider/);
  assert.match(vendorFunctionBody(vendor, 'zls'), /w\.createElement\(vYe\.Provider/);
  assert.match(vendorFunctionBody(vendor, 'Nls'), /w\.createElement\(s5\.Provider/);
});

test('nativeReact build externalizes Router to a served shim path (static source check)', async () => {
  const [build, server, launcher] = await Promise.all([
    read('lab/pilot/build-pilot.mjs'),
    read('lab/server.mjs'),
    read('scripts/start-full-integration.mjs'),
  ]);

  assert.ok(build.includes('filter:/^react-router(?:-dom)?$/'));
  assert.ok(build.includes("path:'/lcos/native-router.js',external:true"));
  assert.ok(build.includes('filter:/^\\/lcos\\/native-router\\.js$/'));
  assert.ok(build.includes('import * as NativeRouter from "/lcos/native-router.js"; module.exports=NativeRouter;'),
    'CommonJS callers must receive the same shim namespace, not a bundled Router runtime.');
  assert.ok(launcher.includes('nativeReact: true'), 'The production native UI entry must activate the external resolver.');
  assert.ok(server.includes("'/lcos/native-router.js'"));
  assert.ok(server.includes("serveStatic(request, response, labRoot, pathname.slice('/lcos'.length))"),
    'The full-integration server must serve the shim from lab/native-router.js.');
  assert.ok(server.includes('await serveStatic(request, response, vendorRoot, pathname)'));
});
