import fs from 'node:fs/promises';
import path from 'node:path';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'output/原生ColorPin整合_20261017h/原操作只读源码摘录.json');
const requested = {
  'page-Da_DfwiK.js': ['fH', 'jF', 'IS', 'TS', 'iF', 'sF', 'fU', 'wU', 'H7', 'CT', 'IH', 'eG', 'l9', 'r9', 'aE', 'JB', 'TH', 'bB'],
  'context-CTZaAQiJ.js': [],
  'agent-host-provider-uVo_bky5.js': [],
  'course-api-base-url-CifxI1ia.js': [],
};
const needles = ['suggestions/dynamic', 'Ctrl+I', 'ctrl+i', 'meta+i', 'meta+j', 'mod+j', 'hotkey', 'template', 'Template',
  'createAgent', 'agentNode', 'openSettingsModal', 'showHotKeyPanel', 'VOICE', 'canvas.shortcuts', 'audio', 'voice'];
const report = { mode: 'Local static owner extraction only; no candidate, browser, Core, donor execution or product edit', files: {}, currentBundles: {} };
for (const [file, names] of Object.entries(requested)) {
  const source = await fs.readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets', file), 'utf8');
  const ast = parse(source, file), declarations = ast.body.flatMap(node => node.type === 'FunctionDeclaration' ? [node]
    : node.type === 'VariableDeclaration' ? node.declarations : []), byName = new Map(declarations.map(node => [node.id?.name, node]));
  const selected = new Set(names), matches = {};
  for (const needle of needles) {
    const owners = declarations.filter(node => source.slice(node.start, node.end).includes(needle));
    matches[needle] = owners.map(node => node.id?.name); owners.forEach(node => { if (source.slice(node.start, node.end).length < 45000) selected.add(node.id?.name); });
  }
  report.files[file] = { matches, entries: Object.fromEntries([...selected].flatMap(name => {
    const node = byName.get(name); return node ? [[name, { start: node.start, end: node.end, line: node.loc?.start.line, source: source.slice(node.start, node.end) }]] : [];
  })) };
}
for (const name of ['agent-ui.js','native-pile-ui.js','native-text-first-ui.js']) {
  const file = path.join(root, '.runtime/isolated-native-flow-20261017c/native-ui', name);
  const source = await fs.readFile(file, 'utf8');
  const modules = [...source.matchAll(/^\/\/ ([^\n]+)$/gm)].map(match => match[1].trim());
  const adopted = JSON.parse(await fs.readFile(file + '.sources.json', 'utf8'));
  report.currentBundles[name] = { file, bytes: Buffer.byteLength(source), modules: modules.filter(value => value.includes('lcos/') || value.includes('lab/')),
    adoptedSources: adopted.resources, modified: (await fs.stat(file)).mtime.toISOString() };
}
await fs.writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, files: Object.fromEntries(Object.entries(report.files).map(([file, data]) => [file, { owners: Object.keys(data.entries), matches: data.matches }])) }));
