import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at < 0 ? fallback : args[at + 1];
};
const label = option('--label', 'static');
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Use a simple experiment label.');
const referenceRoot = await realpath(path.join(root, 'reference'));
let input;
let inputSelection = null;
if (args.includes('--canvas-slice')) {
  const inputRoot = path.join(root, '.runtime', 'rea-static-inputs');
  await mkdir(inputRoot, { recursive: true });
  input = await mkdtemp(path.join(inputRoot, 'canvas-'));
  await mkdir(path.join(input, 'assets'));
  const files = [
    'page-Da_DfwiK.js', 'agent-host-provider-uVo_bky5.js',
    'CanvasDevTools-Ca0vASx7.js', 'index-D3gYo15G.js', 'page-D__yp7hl.js',
  ];
  const copied = [];
  for (const name of files) {
    const source = path.join(referenceRoot, 'tapnow-installed', 'resources', 'web', 'assets', name);
    const destination = path.join(input, 'assets', name);
    await copyFile(source, destination);
    const before = await readFile(source);
    const after = await readFile(destination);
    if (!before.equals(after)) throw new Error(`Copy mismatch: ${name}`);
    copied.push({ path: `assets/${name}`, bytes: before.length, byteIdentical: true });
  }
  inputSelection = {
    kind: 'partial-copied-slice', files: copied,
    limitations: 'Five original ESM assets only. The 13 MB shared main and other imports are absent, not replaced with stubs. This is not whole-application coverage.',
  };
} else {
  input = await realpath(path.resolve(root, option('--input', 'reference/desktop-shell')));
  if (!input.startsWith(`${referenceRoot}${path.sep}`)) throw new Error('Only copied reference inputs are allowed.');
}
const overallMs = Number(option('--overall-ms', '240000'));
const perSourceMs = Number(option('--source-ms', '60000'));
if (![overallMs, perSourceMs].every(n => Number.isInteger(n) && n >= 1000 && n <= 600000)) {
  throw new Error('Invalid finite measurement timeout.');
}

const cacheRoot = path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx');
let cli;
for (const item of await readdir(cacheRoot, { withFileTypes: true })) {
  if (!item.isDirectory()) continue;
  const packageRoot = path.join(cacheRoot, item.name, 'node_modules', 'rea-agents');
  try {
    const pkg = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
    if (pkg.name === 'rea-agents' && pkg.version === '6.4.0') {
      cli = path.join(packageRoot, 'scripts', 'rea.mjs');
      break;
    }
  } catch { /* Other cached packages are irrelevant. */ }
}
if (!cli) throw new Error('REA 6.4.0 is not cached. This script never downloads or sets up tools.');
const resultRoot = path.join(root, '.runtime', 'rea-static-20261013');
await mkdir(resultRoot, { recursive: true });
const outputDirectory = await mkdtemp(path.join(resultRoot, `${label}-`));
const stdoutPath = path.join(outputDirectory, 'stdout.json');
const stderrPath = path.join(outputDirectory, 'stderr.log');
const stdout = createWriteStream(stdoutPath, { flags: 'wx' });
const stderr = createWriteStream(stderrPath, { flags: 'wx' });
const cliArgs = [cli, 'analyze-javascript-application', input,
  '--max-heap-mb', '1024', '--analysis-timeout-ms', String(perSourceMs), '--format', 'json'];
const startedAt = new Date().toISOString();
const start = performance.now();
const child = spawn(process.execPath, cliArgs, {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
child.stdout.pipe(stdout);
child.stderr.pipe(stderr);
let stdoutBytes = 0;
let stderrBytes = 0;
child.stdout.on('data', chunk => { stdoutBytes += chunk.length; });
child.stderr.on('data', chunk => { stderrBytes += chunk.length; });
let timedOut = false;
let ended = false;
let samplePending;
const memory = { samples: 0, sampledPeakWorkingSetBytes: 0, peakOwnedProcessCount: 0, failures: 0 };
const sampleMemory = async () => {
  const sampler = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize | ConvertTo-Json -Compress'],
  { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  let data = '';
  sampler.stdout.setEncoding('utf8');
  sampler.stdout.on('data', chunk => { data += chunk; });
  await once(sampler, 'close');
  try {
    const all = JSON.parse(data);
    const owned = new Set([child.pid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of all) {
        if (owned.has(p.ParentProcessId) && !owned.has(p.ProcessId)) {
          owned.add(p.ProcessId); changed = true;
        }
      }
    }
    const found = all.filter(p => owned.has(p.ProcessId));
    const bytes = found.reduce((sum, p) => sum + Number(p.WorkingSetSize), 0);
    if (found.length === 0) return;
    memory.samples += 1;
    memory.sampledPeakWorkingSetBytes = Math.max(memory.sampledPeakWorkingSetBytes, bytes);
    memory.peakOwnedProcessCount = Math.max(memory.peakOwnedProcessCount, found.length);
  } catch { memory.failures += 1; }
};
const memoryTimer = setInterval(() => {
  if (ended || samplePending) return;
  samplePending = sampleMemory().finally(() => { samplePending = undefined; });
}, 5000);
const timeout = setTimeout(() => {
  if (ended) return;
  timedOut = true;
  // Only terminate the REA process tree created by this invocation, never other Node processes.
  spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
    windowsHide: true, stdio: 'ignore',
  });
}, overallMs);
console.log(JSON.stringify({ phase: 'started', version: '6.4.0', pid: child.pid, input, outputDirectory,
  overallMs, perSourceMs, maxHeapMb: 1024 }));
const [exitCode, signal] = await once(child, 'close');
const elapsedMs = performance.now() - start;
ended = true;
clearTimeout(timeout);
clearInterval(memoryTimer);
if (samplePending) await samplePending;
if (!stdout.writableFinished) await once(stdout, 'finish');
if (!stderr.writableFinished) await once(stderr, 'finish');
const measurement = {
  label, version: '6.4.0', node: process.version, input, cli,
  startedAt, finishedAt: new Date().toISOString(), elapsedMs,
  exitCode, signal, timedOut, stdoutBytes, stderrBytes,
  limits: { overallMs, perSourceMs, analyzerMaxOldSpaceMb: 1024 },
  memory: { ...memory, sampledPeakWorkingSetBytes: memory.peakOwnedProcessCount ? memory.sampledPeakWorkingSetBytes : null,
    interpretation: '5-second sampled sum of REA-owned process-tree working sets; not exact peak RSS. Null means no live owned process was sampled.' },
  inputSelection,
  outputDirectory, stdoutPath, stderrPath,
  scope: 'Static copied-input analysis only. No setup, MCP registration, target execution, or cloud application action.',
};
await writeFile(path.join(outputDirectory, 'measurement.json'), `${JSON.stringify(measurement, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ phase: 'finished', ...measurement }));
process.exitCode = timedOut || exitCode !== 0 ? 1 : 0;
