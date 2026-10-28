import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

const option = name => process.argv.find(value => value.startsWith('--' + name + '='))?.slice(name.length + 3);
const origin = 'http://127.0.0.1:56311', base = '/api/lcos/core/projects/disposable-surface-core-facade';
const get = async route => {
  const response = await fetch(origin + route, { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, route);
  const body = await response.json(); assert.ok(body.ok === true || body.code === 0 || route === '/health', route);
  return body.value ?? body.data ?? body;
};
const health = await get('/health');
assert.equal(health.runtimeLabel, 'isolated-node-carry-20261020'); assert.equal(health.realCoreConnected, true);
const names = ['graph', 'presentations', 'bindings', 'runs', 'markers', 'operations', 'connected', 'sessions'];
const routes = ['/graph', '/presentations', '/spatial/bindings', '/execution-projection', '/spatial-markers', '/conversation-continuations', '/connected-conversations', '/conversations'];
const data = Object.fromEntries((await Promise.all(routes.map(route => get(base + route)))).map((value, index) => [names[index], value]));
data.messages = {}; data.canvases = {};
for (const session of data.sessions) {
  const payload = await get(base + '/conversations/' + encodeURIComponent(session.id) + '/messages?limit=1000');
  assert.equal(Boolean(payload.hasMore ?? payload.nextCursor), false);
  const rows = Array.isArray(payload) ? payload : payload.messages ?? payload.items; assert.ok(Array.isArray(rows));
  data.messages[session.id] = rows;
}
for (const id of ['surface-core-main', 'surface-core-context', 'surface-core-workflow']) data.canvases[id] = await get('/api/canvas/v1/canvases/' + id);
const long = data.connected.find(row => row.id === 'connected-conversation-b0b62164-091e-4656-b495-40da78541bf0'); assert.ok(long?.conversationSessionId);
const projection = await get(base + '/connected-conversations/' + long.id + '/collaboration-session');
const image = data.canvases['surface-core-main'].nodes.find(node => node.id === 'surface-main-image'); assert.ok(image);
const compareFile = option('compare');
if (compareFile) {
  const prior = JSON.parse(await fs.readFile(path.resolve(compareFile), 'utf8')).data;
  const different = [...new Set([...Object.keys(data), ...Object.keys(prior)])].filter(key => !isDeepStrictEqual(data[key], prior[key]));
  assert.equal(different.join(', '), '', 'Changed fact groups (not dumping message bodies)');
}
const summary = { pid: health.pid, unchanged: compareFile ? true : undefined, markers: data.markers.length, journal: data.operations.length,
  totalMessages: Object.values(data.messages).reduce((sum, rows) => sum + rows.length, 0), longConversationMessages: data.messages[long.conversationSessionId].length,
  imagePosition: image.position, imageMeasured: image.measured, canSend: projection.capabilities.canSend, canResume: projection.capabilities.canResume, modelCalls: 0 };
const output = path.resolve(option('output') ?? 'output/原输入材质与反馈接回_20261026/只读事实.json');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify({ checkedAt: new Date().toISOString(), summary, data }, null, 2));
console.log(JSON.stringify({ output, ...summary }, null, 2));
