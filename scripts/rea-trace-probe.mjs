import { createWriteStream } from 'node:fs';
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = path.resolve(root, process.argv[2] || '.runtime/rea-static-20261013/desktop-shell-s3hiFU');
if (!sourceDirectory.startsWith(path.join(root, '.runtime', 'rea-static-20261013') + path.sep)) {
  throw new Error('Only this experiment\'s retained results are allowed.');
}
const measurement = JSON.parse(await readFile(path.join(sourceDirectory, 'measurement.json'), 'utf8'));
const pkg = JSON.parse(await readFile(path.join(path.dirname(measurement.cli), '..', 'package.json'), 'utf8'));
if (pkg.name !== 'rea-agents' || pkg.version !== '6.4.0') throw new Error('Expected cached REA 6.4.0.');
const envelope = JSON.parse(await readFile(path.join(sourceDirectory, 'stdout.json'), 'utf8'));
const application = envelope.normalized_result ? envelope : envelope.details?.partial_observation;
if (!application?.normalized_result?.semantic_graph) throw new Error('No retained semantic graph.');
const seedValue = process.argv[3] || 'tap-desktop:local-files:open-directory';
const query = { seed: { kind: 'literal', value: seedValue }, direction: 'forward-influence' };
const parent = path.join(root, '.runtime', 'rea-static-20261013', 'traces');
await mkdir(parent, { recursive: true });
const destination = await mkdtemp(path.join(parent, 'literal-'));
const inputPath = path.join(destination, 'input.json');
await writeFile(inputPath, JSON.stringify({ application, query }), { flag: 'wx' });
const stdout = createWriteStream(path.join(destination, 'stdout.json'), { flags: 'wx' });
const stderr = createWriteStream(path.join(destination, 'stderr.log'), { flags: 'wx' });
const start = performance.now();
const child = spawn(process.execPath, [measurement.cli, 'trace-javascript-semantics', inputPath, '--format', 'json'],
  { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
child.stdout.pipe(stdout);
child.stderr.pipe(stderr);
let ended = false;
const timeout = setTimeout(() => {
  if (!ended) spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
}, 45000);
const [exitCode, signal] = await once(child, 'close');
ended = true;
clearTimeout(timeout);
if (!stdout.writableFinished) await once(stdout, 'finish');
if (!stderr.writableFinished) await once(stderr, 'finish');
const result = JSON.parse(await readFile(path.join(destination, 'stdout.json'), 'utf8'));
const normalized = result.normalized_result;
const report = { query, exitCode, signal, elapsedMs: performance.now() - start, destination,
  status: normalized?.status, summary: normalized?.summary, coverage: normalized?.coverage,
  error: result.error, code: result.code, limitations: normalized?.limitations };
await writeFile(path.join(destination, 'measurement.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
process.exitCode = exitCode === 0 ? 0 : 1;
