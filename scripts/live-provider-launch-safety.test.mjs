import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scripts = path.join(root, 'scripts');
const names = ['launch-live-qwen-acp.mjs', 'configure-live-provider-secret.mjs', 'start-linked-continuation.mjs'];
const sources = Object.fromEntries(await Promise.all(names.map(async name => [name, await fs.readFile(path.join(scripts, name), 'utf8')])));
const syntheticKey = 'sk-review-synthetic-only-0123456789';
const syntheticToken = 'ab'.repeat(32);
const clean = source => source.replace(/^import[^\n]*;\r?$/gm, '').replaceAll('fileURLToPath(import.meta.url)', 'scriptFilename');
const checks = [];

function fakeProcess(filename, args = []) {
  const output = { stdout: '', stderr: '' };
  const process_ = Object.assign(new EventEmitter(), {
    argv: [process.execPath, filename, ...args], execPath: process.execPath,
    env: { PATH: 'synthetic-path', SystemRoot: 'synthetic-system', WINDIR: 'synthetic-system',
      HOME: 'OLD-HOME', USERPROFILE: 'OLD-PROFILE', QWEN_HOME: 'OLD-QWEN-HOME',
      OPENAI_API_KEY: 'OLD-SECRET', NODE_OPTIONS: '--poison', HUABU_HOST_TOKEN: 'OLD-TOKEN' },
    cwd: () => path.join(root, '.runtime', 'isolated-node-carry-20261020', 'agent-verification-project'),
    stdout: { write: value => { output.stdout += value; return true; } },
    stderr: { write: value => { output.stderr += value; return true; } },
  });
  return { process_, output };
}

function runWrapper({ stored = JSON.stringify({ apiKey: syntheticKey }), readFailure = false, mkdirFailure = false, prepareFailure = false } = {}) {
  const filename = path.join(scripts, names[0]);
  const { process_, output } = fakeProcess(filename);
  let spawned;
  const child = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), kill() {} });
  const fakeFs = { readFileSync() { if (readFailure) throw new Error(syntheticKey + ': private read failed'); return stored; },
    mkdirSync() { if (mkdirFailure) throw new Error(syntheticKey + ': private mkdir failed'); } };
  vm.runInNewContext(clean(sources[names[0]]), { scriptFilename: filename, fs: fakeFs, path, process: process_, StringDecoder,
    prepareNativeProviderMcp() { if (prepareFailure) throw new Error(syntheticKey + ': synthetic preparation failure'); },
    spawn(command, argv, options) { spawned = { command, argv, options }; return child; } }, { filename });
  return { child, process_, output, get spawned() { return spawned; } };
}

for (const options of [{ stored: '{"apiKey":"' + syntheticKey + '" broken' }, { readFailure: true }, { stored: '{}' }]) {
  const result = runWrapper(options);
  assert.equal(result.spawned, undefined);
  assert.equal(result.process_.exitCode, 1);
  assert.equal(result.output.stdout, '');
  assert.equal(result.output.stderr, 'Authorized provider credential is unavailable.\n');
  assert(!result.output.stderr.includes(syntheticKey));
}
assert.equal(runWrapper({ mkdirFailure: true }).output.stderr, 'Real ACP provider could not prepare or start.\n');
assert.equal(runWrapper({ prepareFailure: true }).output.stderr, 'Real ACP provider could not prepare or start.\n');
checks.push({ name: 'Unreadable, malformed and missing credentials produce fixed errors without file fragments', pass: true });

const normal = runWrapper();
assert.deepEqual(Array.from(normal.spawned.options.stdio), ['inherit', 'inherit', 'pipe']);
assert.equal(normal.output.stdout, '');
assert.equal(normal.spawned.options.env.OPENAI_API_KEY, syntheticKey);
assert.equal(normal.spawned.options.env.QWEN_HOME, undefined);
assert.equal(normal.spawned.options.env.NODE_OPTIONS, undefined);
assert.equal(normal.spawned.options.env.HUABU_HOST_TOKEN, undefined);
assert(normal.spawned.options.env.USERPROFILE.startsWith(path.join(root, '.runtime')));
assert.equal(normal.spawned.options.env.HOME, normal.spawned.options.env.USERPROFILE);
assert.equal(normal.spawned.options.cwd, normal.process_.cwd());
assert(!JSON.stringify(normal.spawned.argv).includes(syntheticKey));
assert(normal.spawned.argv.includes('--acp'));
assert.equal(normal.spawned.argv[normal.spawned.argv.indexOf('--approval-mode') + 1], 'default');
checks.push({ name: 'ACP stdin and stdout inherit unchanged; fresh profile and explicit provider environment', pass: true });

const raw = Buffer.from('前缀🙂 ' + syntheticKey + ' / ' + syntheticKey + ' 结尾\n');
const expected = '前缀🙂 [REDACTED] / [REDACTED] 结尾\n';
for (let split = 0; split <= raw.length; split++) {
  const result = runWrapper();
  result.child.stderr.emit('data', raw.subarray(0, split));
  result.child.stderr.emit('data', raw.subarray(split));
  result.child.stderr.emit('end');
  assert.equal(result.output.stderr, expected, 'stderr split ' + split);
  assert.equal(result.output.stdout, '');
}
const bytewise = runWrapper();
for (const byte of raw) bytewise.child.stderr.emit('data', Buffer.from([byte]));
bytewise.child.stderr.emit('end');
assert.equal(bytewise.output.stderr, expected);
checks.push({ name: 'Only the exact loaded key is redacted across every byte split; Unicode remains intact', pass: true, splitCases: raw.length + 2 });

async function runPrivateInput(probe) {
  const filename = path.join(scripts, names[1]);
  const { process_, output } = fakeProcess(filename, ['--runtime-label=isolated-review-synthetic', ...(probe ? ['--probe-input'] : [])]);
  const writes = [];
  process_.stdin = Object.assign(new EventEmitter(), { isTTY: false, setEncoding() {}, pause() {} });
  process_.exit = code => { throw { privateTestExit: code }; };
  const pending = vm.runInNewContext('(async()=>{' + clean(sources[names[1]]) + '\n})()', {
    scriptFilename: filename, fs: { mkdir: async () => {}, writeFile: async (...args) => { writes.push(args); } },
    path, process: process_, setTimeout: () => 1, clearTimeout() {}, console: { log: value => process_.stdout.write(value + '\n') },
  }, { filename });
  await new Promise(resolve => setImmediate(resolve));
  process_.stdin.emit('data', (probe ? 'codex-private-stdin-probe' : syntheticKey) + '\r');
  try { await pending; assert.fail('Expected explicit process exit'); }
  catch (error) { assert.equal(error.privateTestExit, 0); }
  assert(!output.stdout.includes(syntheticKey));
  assert(!output.stderr.includes(syntheticKey));
  if (probe) assert.equal(writes.length, 0);
  else { assert.equal(writes.length, 1); assert.equal(writes[0][2].flag, 'wx'); assert.equal(writes[0][2].mode, 0o600); }
}
await runPrivateInput(true);
await runPrivateInput(false);
checks.push({ name: 'Private stdin accepts CR; probe never writes credentials and normal save remains exclusive', pass: true });

async function runLinked(start) {
  const filename = path.join(scripts, names[2]);
  const { process_, output } = fakeProcess(filename, [start ? '--start' : '--prepare-only']);
  const coreRoot = path.join(root, '.runtime', 'isolated-node-carry-20261020');
  const hostRoot = path.join(root, '.runtime', 'isolated-live-continuation-host-20261023');
  const tokenFile = path.join(hostRoot, 'connection-token.json');
  const reads = [], writes = [];
  let spawned;
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill() {}, pid: 12345 });
  const logs = [];
  const context = { scriptFilename: filename, path, process: process_, StringDecoder, URL,
    fs: { realpath: async value => path.resolve(value), mkdir: async () => {},
      readFile: async value => {
        reads.push(value);
        if (value === path.join(hostRoot, 'host-preparation.json')) return JSON.stringify({ prepared: true,
          mixedScopeSourceTransforms: true, runtimeRoot: hostRoot, origin: 'http://127.0.0.1:56321', port: 56321,
          agentletId: 'synthetic-agentlet', connectionTokenFile: tokenFile,
          actualBranches: Object.fromEntries(['originalHostRoutes', 'originalGateway', 'scopeHostParser', 'scopePromptProvenance', 'scopeResolvedTextCheck'].map(key => [key, true])) });
        if (value === tokenFile) return JSON.stringify({ connectionToken: syntheticToken });
        throw new Error('Unexpected synthetic read');
      }, writeFile: async (...args) => { writes.push(args); } },
    spawn(command, argv, options) { spawned = { command, argv, options }; return child; },
    createWriteStream() { const log = Object.assign(new EventEmitter(), { text: '', write(value) { this.text += value; }, end(value) { this.text += value; } }); logs.push(log); return log; },
    console: { log: value => process_.stdout.write(value + '\n') },
  };
  const source = clean(sources[names[2]]).replace(/main\(\)\.catch\([\s\S]*$/, 'globalThis.testMain=main;');
  vm.runInNewContext(source, context, { filename });
  await context.testMain();
  assert.deepEqual(reads, [path.join(hostRoot, 'host-preparation.json'), tokenFile]);
  assert(!JSON.stringify(writes).includes(syntheticToken));
  assert(!output.stdout.includes(syntheticToken));
  assert(!output.stderr.includes(syntheticToken));
  if (!start) assert.equal(spawned, undefined);
  else {
    assert.equal(spawned.options.env.HUABU_HOST_TOKEN, syntheticToken);
    assert.equal(spawned.options.env.HUABU_HOST_TIMEOUT_MS, '360000');
    assert.equal(spawned.options.env.LCOS_NATIVE_CANVAS_TOOLS_ENABLED, '1');
    assert.equal(spawned.options.env.HUABU_AGENTLET_SPAWN_CWD, path.join(coreRoot, 'agent-verification-project'));
    assert.equal(spawned.options.env.QWEN_HOME, undefined);
    assert.equal(spawned.options.env.OPENAI_API_KEY, undefined);
    assert(!JSON.stringify(spawned.argv).includes(syntheticToken));
    assert(spawned.argv.includes('--native-rail-pilot') && spawned.argv.includes('--live-continuation'));
    const logText = Buffer.from('before ' + syntheticToken + ' after\n');
    for (const byte of logText) child.stderr.emit('data', Buffer.from([byte]));
    child.stderr.emit('end');
    assert.equal(logs[1].text, 'before [REDACTED] after\n');
  }
}
await runLinked(false);
await runLinked(true);
checks.push({ name: 'Linked Core prepare cannot spawn; explicit start keeps token out of arguments, reports and chunked logs', pass: true });

const report = { passed: true, checks, actualCredentialFilesRead: 0, liveSessionsAccessed: 0, realChildProcesses: 0, modelRequests: 0,
  method: 'Exact current script source executed with synthetic filesystem, process and child ports; no provider code executed.' };
const outputDir = path.join(root, 'output', '混合Scope取用_20261022', '真实Provider启动审阅', new Date().toISOString().replaceAll(':', '-'));
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: true, groups: checks.length, report: path.join(outputDir, 'report.json'), actualCredentialFilesRead: 0, modelRequests: 0 }, null, 2));
