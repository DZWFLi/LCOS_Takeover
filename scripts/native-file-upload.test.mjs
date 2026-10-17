import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { transformNativeFirstTextScript as first } from '../lab/native-text-first-transform.mjs';
import { transformNativeTextActionsScript as actions } from '../lab/native-text-actions-transform.mjs';
import { transformNativeFileUploadScript as files, restoreNativeFileUploadScriptForComparison as restore } from '../lab/native-file-upload-transform.mjs';

const root = path.resolve(import.meta.dirname, '..'), name = 'course-api-base-url-CifxI1ia.js';
const dep = createRequire(path.join(installedRoot, 'huabu/apps/web/package.json'));
const esbuild = createRequire(path.join(installedRoot, 'package.json'))('esbuild');
const source = await fs.readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets', name), 'utf8');
const before = actions(name, first(name, source)), transformed = files(name, before);
assert.equal(restore(name, transformed), before, 'restore must preserve every prior transformed byte');
assert.equal(files(name, transformed), transformed, 'idempotent transformation');
assert.equal(files('unrelated.js', before), before, 'unrelated asset untouched');
assert.throws(() => files(name, source), /seam changed/, 'must not guess an uninstalled owner');

const ast = parse(transformed, name), bindings = new Map(ast.body.flatMap(node => node.type === 'FunctionDeclaration'
  ? [[node.id.name, node]] : (node.declarations ?? []).filter(value => value.id?.type === 'Identifier').map(value => [value.id.name, value])));
const originalAst = parse(before, name), originalBindings = new Map(originalAst.body.flatMap(node => node.type === 'FunctionDeclaration'
  ? [[node.id.name, node]] : (node.declarations ?? []).filter(value => value.id?.type === 'Identifier').map(value => [value.id.name, value])));
for (const symbol of ['rBe', 'n4', 't4', 'JT', 'xl', 'dBe', 'Xie']) {
  const left = bindings.get(symbol), right = originalBindings.get(symbol);
  assert.ok(left && right, symbol);
  assert.equal(transformed.slice(left.start, left.end), before.slice(right.start, right.end), symbol + ' original owner unchanged');
}
const temporary = path.join(root, '.runtime/native-file-upload-' + Date.now());
await fs.mkdir(temporary, { recursive: true });
const entry = path.join(temporary, 'fixture.tsx'), bundle = path.join(temporary, 'fixture.mjs');
const statements = ['r4', 's4', 'o4', 'iBe'].map(symbol => 'const ' + transformed.slice(bindings.get(symbol).start, bindings.get(symbol).end) + ';').join('\n');
await fs.writeFile(entry, `import React,{act} from 'react';import{createRoot}from'react-dom/client';import*as jsx from'react/jsx-runtime';
import{LCOSHasNativeFileMarker,readNativeFileReference,LCOSNativeFileTextOwner,LCOSNativeFileTextBodySlot,LCOSUseNativeFileCopy}from ${JSON.stringify(path.join(root, 'lab/pilot/native-file-upload.tsx'))};
const env=globalThis.__FILE_FIXTURE__,pass=({children})=>children;
function Toolbar(props){const groups=original.iBe(props);return jsx.jsx('div',{'data-original-toolbar':true,'data-can-edit':String(props.canEdit),children:groups.flat().map(item=>React.cloneElement(item.node,{key:item.key}))})}
const controls={d:React,a:jsx,LCOSHasNativeFileMarker,LCOSNativeFileTextOwner,LCOSNativeFileTextBodySlot,LCOSUseNativeFileCopy,
 LCOSNativeTextNodeOwner:({children})=>{env.textOwners++;return children},LCOSNativeTextBodySlot:()=>{env.textBodies++;return jsx.jsx('span',{'data-text-body':true,children:'ordinary text'})},
 Gr:React.Fragment,Mg:pass,wr:({children,...p})=>jsx.jsx('section',{'data-original-frame':true,'data-original-id':p.id,children}),
 Ni:()=>null,Qs:()=>false,_t:()=>env.api,t4:({disabled})=>()=>{if(!disabled)env.edits++},
 n4:props=>{env.toolbar=props;return jsx.jsx(Toolbar,props)},
 Me:()=>({t:key=>key}),vp:select=>select({openForNodes:()=>{}}),Dg:()=>null,_z:()=>jsx.jsx('svg',{}),oBe:()=>{},kg:()=>jsx.jsx('svg',{}),sp:()=>jsx.jsx('svg',{}),
 sO:props=>jsx.jsx('button',{'data-copy-value':props.value,children:props.defaultText}),
 bl:()=>true,Pr:()=>false,Zz:()=>({handleGenerate:()=>{env.generates++}}),
 $U:()=>null,e4:()=>null,cc:({children})=>children,JU:()=>jsx.jsx('input',{'data-generation-input':true}),
 Ck:{PURE:'pure',GENERATE:'generate'},AM:props=>props};
const original=new Function('controls','with(controls){'+${JSON.stringify(statements)}+'return {r4,s4,o4,iBe};}')(controls);
let view;const outlet=document.createElement('div');document.body.append(outlet);
export async function render(){view??=createRoot(outlet);await act(async()=>view.render(React.createElement(original.o4,{...env.node,id:env.node.id,data:env.node.data,selected:true})));}
export async function click(el){await act(async()=>el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})));}
export async function close(){await act(async()=>view.unmount());}
export{LCOSHasNativeFileMarker,readNativeFileReference};`);
await esbuild.build({ entryPoints: [entry], outfile: bundle, bundle: true, platform: 'node', format: 'esm', target: 'node22', jsx: 'automatic', logLevel: 'warning',
  plugins: [{ name: 'same-original-canvas-and-viewer-leaf', setup(build) {
    build.onResolve({ filter: /^\/lcos\/agent-ui\.js$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const nativeMaterialViewerAvailable=()=>globalThis.__FILE_FIXTURE__.viewerReady;export const requestNativeMaterialView=value=>globalThis.__FILE_FIXTURE__.views.push(value);', loader: 'js' }));
    build.onResolve({ filter: /^[^./][^:]*$/ }, args => { try { return { path: dep.resolve(args.path) }; } catch {} });
  } }] });
const { Window } = dep('happy-dom'), dom = new Window({ url: 'http://127.0.0.1:1/' });
const previous = Object.fromEntries(['window', 'document', 'navigator', 'HTMLElement', 'Event', 'MouseEvent', 'IS_REACT_ACT_ENVIRONMENT', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'MouseEvent']) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'window' ? dom : dom[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const report = { passed: false, scope: 'actual transformed original r4/s4/o4 + real file React owner/body with controlled original frame/toolbar/viewer ports; no app/browser/Core claim', cases: [], candidateWrites: 0, coreWrites: 0 };
let app;
try {
  const ref = { version: 1, entityType: 'view', entityId: 'view', artifactId: 'artifact', artifactViewId: 'view', revisionId: 'revision' };
  const file = { artifactId: 'artifact', artifactViewId: 'view', revisionId: 'revision', fileRecordId: 'file', mimeType: 'application/pdf', kind: 'pdf', size: 1024 };
  const env = { node: { id: 'node', type: 'text', position: { x: 10, y: 20 }, data: { title: 'manual.pdf', type: 'generate', text: 'not the binary', lcos_ref: ref, lcos_file_ref: file } },
    textOwners: 0, textBodies: 0, edits: 0, generates: 0, views: [], reads: 0, viewerReady: true, toolbar: null };
  env.api = { getNodes: () => [env.node], getNode: id => id === env.node.id ? env.node : undefined, getEdges: () => [], getSelection: () => ({ nodeIds: ['node'], edgeIds: [] }),
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }), subscribeNative: () => () => {} };
  globalThis.__FILE_FIXTURE__ = env;
  window.__LCOS_NODE_LAB__ = { projectId: 'project', canvasId: 'canvas', currentCanvasId: 'canvas', api: env.api };
  globalThis.fetch = async () => { env.reads++; throw new Error('file must not enter canvas-text GET'); };
  app = await import(pathToFileURL(bundle).href);
  await app.render();
  assert.equal(document.querySelectorAll('[data-original-frame]').length, 1);
  assert.equal(document.querySelectorAll('[data-original-toolbar]').length, 1);
  assert.equal(env.toolbar.canEdit, false);
  assert.equal(document.querySelectorAll('[data-generation-input]').length, 0);
  assert.equal(env.textOwners, 0); assert.equal(env.textBodies, 0); assert.equal(env.reads, 0);
  assert.match(document.body.textContent, /PDF · 1.0 KB/); assert.doesNotMatch(document.body.textContent, /not the binary/);
  assert.equal(document.querySelector('[data-copy-value]').getAttribute('data-copy-value'), 'manual.pdf');
  assert.equal(document.querySelector('[data-copy-value]').textContent, '复制名称');
  report.cases.push('exact additional View file uses one original Pure frame/action band, actual iBe/sO slot copies canonical name with matching label; no Text owner/GET/generation');
  const viewButton = () => [...document.querySelectorAll('button')].find(element => element.textContent === '查看文件');
  await app.click(viewButton());
  assert.deepEqual(env.views, [{ projectId: 'project', artifactId: 'artifact', artifactViewId: 'view', revisionId: 'revision', nodeId: 'node', sourceCanvasId: 'canvas', title: 'manual.pdf' }]);
  report.cases.push('original Viewer request preserves exact revision/View/node/Canvas');
  env.node = { ...env.node, data: { ...env.node.data, lcos_file_ref: { ...file, revisionId: 'another' } } };
  await app.click(viewButton());
  assert.equal(env.views.length, 1); assert.match(document.body.textContent, /位置或版本已变化/);
  report.cases.push('late click after exact reference changes rejects; no Current fallback');
  await app.render(); assert.equal(viewButton().disabled, true);
  assert.equal(env.toolbar.canEdit, false); assert.equal(env.reads, 0);
  report.cases.push('malformed marker stays read-only and never falls through text reader');
  assert.equal(app.readNativeFileReference({ lcos_ref: ref, lcos_file_ref: { ...file, kind: 'image', mimeType: 'image/png' } }), undefined);
  report.cases.push('image marker rejected; image retains original separate pipeline');
  env.node = { ...env.node, data: { title: 'ordinary', text: 'text', type: 'pure' } };
  await app.render(); assert.equal(env.textOwners, 1); assert.equal(env.textBodies, 1); assert.equal(env.toolbar.canEdit, true);
  report.cases.push('ordinary original text owner/body/edit policy preserved');
  report.passed = true;
} catch (error) { report.error = { message: error.message, stack: error.stack }; throw error;
} finally {
  if (app) await app.close(); dom.happyDOM.abort();
  for (const [key, descriptor] of Object.entries(previous)) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  const output = path.join(root, 'output/原生文件Drop整合_20261017i/文件载体原组件回归.json');
  await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ output, ...report }));
}
process.exit(report.passed ? 0 : 1);
