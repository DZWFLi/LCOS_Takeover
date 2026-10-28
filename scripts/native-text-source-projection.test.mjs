import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { readNativeTextSourceRendererModules, nativeTextSourceCourse, nativeTextSourceIndex } from '../lab/native-text-source-projection-build.mjs';

const root = path.resolve(import.meta.dirname, '..');
const dependency = createRequire(path.join(currentGen2Root, 'package.json'));
const web = createRequire(path.join(currentGen2Root, 'huabu/apps/web/package.json'));
const esbuild = dependency('esbuild'), { chromium } = dependency('playwright-core');
const output = path.join(root, 'output/画布摘录Drop_20261027/同原CT_Node语义投影', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, checks: [], samples: [], errors: [], network: [], nodeFetches: [], coreWrites: 0, models: 0,
  scope: 'Actual transformed original CT/uW/jX dependency closure in ReactDOMServer+installed linkedom, exact original createNativeTextIndex compared with same CT in real Chrome. No running LCOS project, global fake DOM, alternate Markdown parser, model or network.' };
let browser; const originalFetch = globalThis.fetch;
try {
  const nodeOutput = path.join(output, 'projector.mjs');
  const globals = Object.fromEntries(['window','document','HTMLElement','Element','Node','navigator'].map(key => [key, globalThis[key]]));
  await buildPilotEntry('lab/pilot/native-text-source-projection.ts', nodeOutput, 'node');
  globalThis.fetch = async address => { report.nodeFetches.push(String(address)); throw new Error('Source projection must not fetch.'); };
  const projector = await import(pathToFileURL(nodeOutput));
  const parts = await readNativeTextSourceRendererModules(); report.originalBindings = { course: parts.course.count, index: parts.index.count };
  const texts = [
    ['plain', '开头 重复🙂 中间 重复🙂 结尾'],
    ['headings-inline-softline', '# 标题🙂\n\n第一行 **粗体** 与 *斜体*、~~删除~~ 和 [链接](https://example.invalid)。\n第二行 `code` &amp; 尾。\n\n## 第二节\n\n重复 **粗体**。'],
    ['lists-tasks-quotes', '- 外层一 **加粗**\n- 外层二\n  - 嵌套 A\n  - 嵌套 B\n\n1. 有序一\n2. 有序二\n\n- [x] 完成\n- [ ] 待办\n\n> 引用第一行\n> 第二行。'],
    ['table-fenced-inline', '| 姓名 | 内容 |\n| --- | --- |\n| A | **重复🙂** |\n| B | `value` |\n\n```js\nconst answer = 42;\nconsole.log(answer);\n```\n\n后文。'],
    ['html-image-break', '前文<br>后文\n\n![图片替代文字](data:image/png;base64,iVBORw0KGgo=)\n\n<div hidden>隐藏 HTML</div>\n\n末尾 &lt;tag&gt;。\n\n横线\n\n---\n\n最后  \n硬换行。'],
    ['brief', '# PortaSplit MVP Brief\n\nGoal: show a local creative project as a persistent Canvas, not a throwaway frontend fixture.\n\nAudience: a small product team.\n\nSuccess:\n- Source files have stable FileRecord identity.\n- Canvas restores after Local Core restart.\n'],
    ['double-entities-unicode', '&amp;amp; &amp;copy; &#x1F642; &#128578; &notit; &unknown; &#xD800; &#0;\n\n中文 🧑‍💻 e\u0301 &lt;script&gt; 双重 **&amp;lt;tag&amp;gt;**。'],
    ['malformed-html', '前文\n\n<div><b>未闭合 <i>HTML\n\n<p hidden>隐藏段落\n\n<table><tr><td>A &amp; B\n\n<script>throw new Error("must not execute")</script>\n\n末尾。'],
  ];
  const fixture = `import React from'react';import{createRoot}from'react-dom/client';import{CT}from'${nativeTextSourceCourse}';import{createNativeTextIndex}from'./lab/pilot/native-text-location.ts';const values=${JSON.stringify(texts)};createRoot(document.getElementById('app')).render(<>{values.map(([id,markdown])=><section id={id} key={id}><CT markdown={markdown} sourceLines/></section>)}</>);window.__ORIGINAL_CT_INDEX__=()=>Object.fromEntries(values.map(([id])=>[id,createNativeTextIndex(document.getElementById(id)).text]));`;
  const built = await esbuild.build({ stdin: { contents: fixture, loader: 'tsx', resolveDir: root, sourcefile: 'actual-CT-projection-parity.tsx' },
    bundle: true, jsx: 'automatic', platform: 'browser', format: 'iife', write: false, outfile: path.join(output, 'browser.js'), logLevel: 'silent',
    plugins: [{ name: 'actual-original-CT', setup(build) {
      build.onResolve({ filter: /^lcos-original-text-(course|index)$/ }, args => ({ path: args.path, namespace: 'actual-CT' }));
      build.onLoad({ filter: /.*/, namespace: 'actual-CT' }, args => ({ contents: args.path === nativeTextSourceCourse ? parts.course.source : parts.index.source, loader: 'js', resolveDir: parts.assets }));
      build.onResolve({ filter: /^(react(?:\/.*)?|react-dom(?:\/.*)?)$/ }, args => ({ path: web.resolve(args.path) }));
    } }] });
  const js = built.outputFiles.find(file => file.path.endsWith('.js')).text;
  await fs.writeFile(path.join(output, 'browser.js'), js);
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking','--disable-sync','--no-first-run'] });
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1000, height: 900 } });
  await context.route('**/*', route => { report.network.push(route.request().url()); return route.abort(); });
  await context.routeWebSocket('**/*', socket => socket.close());
  const page = await context.newPage(); page.on('pageerror', error => report.errors.push(String(error)));
  await page.setContent('<!doctype html><html><head></head><body><div id="app"></div></body></html>');
  await page.addScriptTag({ content: js }); await page.locator('#brief h1').waitFor();
  const browserText = await page.evaluate(() => window.__ORIGINAL_CT_INDEX__());
  for (const [id, markdown] of texts) {
    const node = await projector.nativeExcerptSourceText(markdown), chrome = browserText[id];
    report.samples.push({ id, markdown, node, chrome, equal: node === chrome }); assert.equal(node, chrome, id);
  }
  report.checks.push('eight actual Chrome CT documents exactly match Node ReactDOMServer+linkedom with the same createNativeTextIndex: repeated UTF16, formatting/links/softline, lists/tasks/quotes, table/code, image/breaks, Brief, double entities/Unicode and malformed HTML');
  assert.equal(browserText.brief.indexOf('Goal: show a local'), 21);
  assert.notEqual(browserText['headings-inline-softline'], texts.find(row => row[0] === 'headings-inline-softline')[1]);
  assert.ok(!browserText['table-fenced-inline'].includes('复制代码'));
  report.checks.push('Brief original [21,39] selection coordinates remain exact; Markdown source markers and code controls are not miscounted as visible text');
  for (const [key, value] of Object.entries(globals)) assert.equal(globalThis[key], value, key + ' global untouched');
  assert.equal(await projector.nativeExcerptSourceText(texts[1][1]), browserText['headings-inline-softline']);
  report.checks.push('repeated server projection is deterministic and does not install or mutate window/document/DOM globals; installed linkedom only parses inert local SSR markup');
  assert.deepEqual(report.errors, []); assert.deepEqual(report.network, []); assert.deepEqual(report.nodeFetches, []);
  report.checks.push('Node fetch observer and all Chrome network routes remain unused/blocked; HTML parsing never executes script or starts image/resource requests');
  report.passed = true;
} catch (error) { report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; }
finally { globalThis.fetch = originalFetch; await browser?.close(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks, error: report.error, output }, null, 2)); }
