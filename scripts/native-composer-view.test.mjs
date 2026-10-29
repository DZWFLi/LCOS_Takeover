import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { extractNativeComposerContainers, transformNativeComposerFrame, nativeComposerSourceOverride } from '../lab/native-composer-source-transform.mjs';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const asset = 'agent-host-provider-uVo_bky5.js';
const source = fs.readFileSync(path.join(root, 'reference/tapnow-installed/resources/web/assets', asset), 'utf8');
const transformed = transformNativeComposerFrame(asset, source);
const marker = '\n/* LCOS controlled Composer slots: original Bl/Gy/FM/Dy containers. */\n';
assert.equal(transformed.slice(0, transformed.indexOf(marker)), source, 'all original Cloud and native functions remain untouched');
assert.equal(transformNativeComposerFrame(asset, transformed), transformed, 'transform is idempotent');
assert.equal(transformNativeComposerFrame('other.js', source), source);
parseOriginalDonorScript(transformed, asset);
assert.equal(nativeComposerSourceOverride['lcos/huabu/apps/web/src/lcos/ui/nearfield/LcosComposerView.tsx'], 'lab/pilot/native-composer-view.tsx');
const classes = extractNativeComposerContainers(source);
const jsx = (type, props) => ({ type, props });
const scope = { o: { jsx, jsxs: jsx }, a: { forwardRef: fn => fn }, M: (...values) => values.filter(Boolean).join(' ') };
vm.runInNewContext(transformed.slice(transformed.indexOf(marker)).replaceAll('export const ', 'const ')
  + '\nglobalThis.parts=LCOSNativeComposerParts;', scope);
const surface = { ref: { current: null }, onDrop() {}, 'data-lcos-composer-reference-surface': true };
const rendered = scope.parts.Frame({ references: 'refs', editor: 'editor', actions: 'actions', feedback: 'feedback', options: 'options', heading: 'heading', surfaceProps: surface });
assert.equal(rendered.props.className, classes.shell);
const bubble = rendered.props.children[1];
assert.equal(bubble.props.className, classes.bubble);
assert.equal(bubble.props.ref, surface.ref);
assert.equal(bubble.props.onDrop, surface.onDrop);
assert.deepEqual(Array.from(bubble.props.children.props.children), ['refs', 'editor', 'actions'], 'Drop surface excludes receiver identity, recovery and options');
assert.equal(rendered.props.children[2], 'options');
assert.equal(rendered.props.children[3], 'feedback');

const fixtureDir = path.join(root, '.runtime/native-composer-view-test');
fs.mkdirSync(fixtureDir, { recursive: true });
const relative = file => path.relative(fixtureDir, file).replaceAll('\\', '/');
const viewPath = relative(path.join(root, 'lab/pilot/native-composer-view.tsx'));
const oldButtonPath = relative(path.join(root, 'lcos/huabu/apps/web/src/lcos/ui/primitives/LcosIconButton.tsx'));
const framePath = path.join(fixtureDir, 'frames.tsx');
fs.writeFileSync(framePath, 'import * as a from "react";import * as o from "react/jsx-runtime";const M=(...v)=>v.filter(Boolean).join(" ");\n'
  + transformed.slice(transformed.indexOf(marker)));
const entry = `import React,{useRef,useState} from "react";
import{createRoot}from"react-dom/client";
import{LcosComposerView,NativeComposerProvider}from ${JSON.stringify(viewPath)};
import{LcosIconButton}from ${JSON.stringify(oldButtonPath)};
import{LCOSNativeComposerParts}from"./frames";
window.events=[];window.refs={};
function App(){const[text,setText]=useState("保留草稿");const[canSubmit,setCanSubmit]=useState(true);
 const[presentation,setPresentation]=useState("inline"),[feedback,setFeedback]=useState(null);
 const textareaRef=useRef(null),referenceSurfaceRef=useRef(null);window.refs={textareaRef,referenceSurfaceRef};
 const log=(name,value)=>window.events.push({name,value});
 return <NativeComposerProvider parts={LCOSNativeComposerParts}>
 <button onClick={()=>setCanSubmit(v=>!v)}>切换发送</button><button onClick={()=>setPresentation(v=>v==="inline"?"nearfield":"inline")}>切换呈现</button>
 <LcosComposerView presentation={presentation} state="editing" targetId="real-target" contextLabel="当前会话" title="真实会话"
 textareaRef={textareaRef} referenceSurfaceRef={referenceSurfaceRef} text={text}
 onTextChange={e=>{setText(e.target.value);log("change",e.target.value)}} onSelect={()=>log("caret",textareaRef.current.selectionStart)}
 onKeyDown={e=>{if(e.ctrlKey&&e.key==="Enter"){e.preventDefault();log("shortcut",text)}}}
 onClose={()=>log("close",text)} onSubmit={()=>log("submit",text)} canSubmit={canSubmit} submitTitle="提交"
 references={[{key:"exact-revision",label:"参考图",versionLabel:"已固定版本",thumbnailSrc:"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",onOpen:()=>log("open","exact-revision"),onRemove:()=>log("remove","exact-revision")}]}
 attachAction={{label:"从画布添加引用",onClick:()=>log("attach",textareaRef.current.selectionStart)}}
 referencePicker={<><LcosIconButton aria-label="找材料" onClick={()=>log("library",text)}>材料</LcosIconButton>
 <LcosIconButton aria-label="语音输入" onPointerDown={()=>log("voice-caret",textareaRef.current.selectionStart)} onClick={()=>log("voice",text)}>语音</LcosIconButton></>}
 continuationControls={<details><summary>会话选项</summary><button onClick={()=>log("retry-original",text)}>重试原消息</button></details>}
 feedback={feedback} feedbackAction={{label:"重试读取",onClick:()=>log("recover",text)}}
 onMaterialDragOver={e=>{e.preventDefault();log("drag-over",text)}}
 onMaterialDrop={e=>{e.preventDefault();e.stopPropagation();log("drop",[e.dataTransfer.getData("application/x-lcos-material"),text]);setFeedback("引用已保留")}}
 onMaterialPaste={e=>{e.preventDefault();log("paste",[e.clipboardData.getData("application/x-lcos-material"),text])}}/>
 </NativeComposerProvider>}
createRoot(document.getElementById("root")).render(<App/>);`;
fs.writeFileSync(path.join(fixtureDir, 'entry.tsx'), entry);
await buildPilotEntry(path.relative(root, path.join(fixtureDir, 'entry.tsx')), path.join(fixtureDir, 'app.js'), 'browser');
const server = http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  const files = { '/app.js': ['app.js', 'text/javascript'], '/app.css': ['app.css', 'text/css'] };
  const item = files[new URL(request.url, 'http://127.0.0.1').pathname];
  if (item) { response.writeHead(200, { 'content-type': item[1] }).end(fs.readFileSync(path.join(fixtureDir, item[0]))); return; }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<html><head><link rel="stylesheet" href="/app.css"></head><body style="width:500px"><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const require = createRequire(path.join(installedRoot, 'package.json'));
const { chromium } = require('playwright-core');
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--disable-background-networking'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route('**/*', route => route.request().url().startsWith(origin) || route.request().url().startsWith('data:') ? route.continue() : route.abort());
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  const input = page.getByRole('textbox', { name: 'Composer 输入' });
  await input.waitFor();
  assert.equal(await input.inputValue(), '保留草稿');
  await input.fill('新草稿，材料仍在');
  await input.evaluate(element => { element.focus(); element.setSelectionRange(3, 3); element.dispatchEvent(new Event('select', { bubbles: true })); });
  await page.getByRole('button', { name: '语音输入', exact: true }).click();
  assert.equal(await page.evaluate(() => window.events.find(event => event.name === 'voice-caret').value), 3, 'voice receives original caret before blur');
  await page.getByRole('button', { name: '找材料', exact: true }).click();
  assert.equal(await page.locator('.lcos-icon-btn').count(), 0, 'known old visual buttons are replaced, callbacks retained');
  await page.getByRole('button', { name: '提交', exact: true }).click();
  assert.equal(await input.inputValue(), '新草稿，材料仍在', 'leaf does not clear the draft on submit');
  await page.getByRole('button', { name: '切换发送' }).click();
  assert.equal(await page.getByRole('button', { name: '提交', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: '查看引用 参考图 · 已固定版本', exact: true }).click();
  await page.getByRole('button', { name: '移除引用 参考图', exact: true }).click();
  await page.locator('[data-lcos-composer-reference-surface]').evaluate(element => {
    const data = new DataTransfer(); data.setData('application/x-lcos-material', 'exact-source');
    element.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await page.getByText('会话选项', { exact: true }).click();
  await page.getByRole('button', { name: '重试原消息', exact: true }).click();
  await page.getByRole('button', { name: '重试读取', exact: true }).click();
  await input.press('Control+Enter');
  await page.getByRole('button', { name: '切换呈现' }).click();
  await page.getByRole('button', { name: '关闭 Composer', exact: true }).click();
  const events = await page.evaluate(() => window.events);
  for (const name of ['submit', 'library', 'voice', 'open', 'remove', 'drop', 'paste', 'retry-original', 'recover', 'shortcut', 'close']) {
    assert.equal(events.filter(event => event.name === name).length, 1, `${name} reaches exactly one original callback`);
  }
  assert.deepEqual(events.find(event => event.name === 'drop').value, ['exact-source', '新草稿，材料仍在']);
  assert.deepEqual(events.find(event => event.name === 'paste').value, ['exact-source', '新草稿，材料仍在']);
  assert.equal(await page.evaluate(() => window.refs.referenceSurfaceRef.current.contains(window.refs.textareaRef.current)), true);
  assert.equal(await page.evaluate(() => window.refs.referenceSurfaceRef.current.contains(document.querySelector('.native-composer-heading'))), false);
  assert.equal(await page.evaluate(() => window.refs.referenceSurfaceRef.current.contains(document.querySelector('.native-composer-options'))), false);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, originalFunctionsUntouched: true, originalContainers: ['Bl', 'Gy', 'FM', 'Dy'],
    controlledEvents: events.map(event => event.name), evidence: 'isolated real-browser controlled leaf; production Host submission still needs integrated runtime verification' }, null, 2));
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
