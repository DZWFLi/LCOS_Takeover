import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const ref = path.join(root, 'reference');
const web = path.join(ref, 'tapnow-installed', 'resources', 'web');
const archive = await fs.readFile(path.join(ref, 'tapnow-installed', 'resources', 'app.asar'));
const parsed = JSON.parse(archive.subarray(16, 16 + archive.readUInt32LE(12)).toString('utf8'));
const base = 8 + archive.readUInt32LE(4);

function getEntry(name) {
  let files = parsed.files;
  let value;
  const parts = name.split('/');
  for (let i = 0; i < parts.length; i += 1) {
    value = files?.[parts[i]];
    if (!value) return undefined;
    if (i < parts.length - 1) files = value.files;
  }
  return value;
}

function entryBytes(value) {
  if (!value || value.unpacked) return undefined;
  const start = base + Number(value.offset);
  const end = start + Number(value.size);
  if (start < base || end > archive.length) throw new Error('ASAR entry exceeds archive bounds.');
  return archive.subarray(start, end);
}

const manifest = JSON.parse(entryBytes(getEntry('package.json')).toString('utf8'));
const comparisons = [];
for (const [packed, saved] of [['dist/main.cjs', 'main.cjs'], ['dist/preload.cjs', 'preload.cjs'], ['dist/capture-preload.cjs', 'capture-preload.cjs']]) {
  const item = getEntry(packed);
  const packedBytes = entryBytes(item);
  const savedBytes = await fs.readFile(path.join(ref, 'desktop-shell', saved));
  comparisons.push({ entry: packed, bytes: item?.size ?? null, referenceBytes: savedBytes.length, exactMatch: packedBytes?.equals(savedBytes) ?? false });
}

const inventory = JSON.parse(await fs.readFile(path.join(root, 'evidence', 'inventory.json'), 'utf8'));
const counts = {};
for (const channel of inventory.desktopIpcChannels ?? []) {
  const group = channel.split(':')[1] ?? 'unknown';
  counts[group] = (counts[group] ?? 0) + 1;
}
const count = (groups) => groups.reduce((total, group) => total + (counts[group] ?? 0), 0);

const specs = [
  ['reference/tapnow-installed/resources/web/assets/index-BAQXnPag.js', ['isDesktop', 'desktop_app', 'web_app', 'getWebAuthOrigin', 'onSessionCallback', 'openExternalUrl', 'setWindowLayout', 'apiProxyOrigin', 'localFiles', 'screenCapture', 'onNavigate']],
  ['reference/tapnow-installed/resources/web/assets/agent-host-provider-uVo_bky5.js', ['screenCapture', 'localFiles', 'openFiles', 'readFileInDirectory', 'writeFileInDirectory', 'createShellCommandProposal', 'runShellCommand', 'Desktop native capability is not available']],
  ['reference/tapnow-installed/resources/web/assets/UnlimitedModeToggle-D4wysAbz.js', ['selectSaveTarget', 'requestMicrophone', 'downloads']],
];
const rendererConsumers = [];
for (const [file, signals] of specs) {
  try {
    const source = await fs.readFile(path.join(root, file), 'utf8');
    rendererConsumers.push({ file, found: true, signals: signals.filter((signal) => source.includes(signal)) });
  } catch { rendererConsumers.push({ file, found: false, signals: [] }); }
}

const rawClasses = [
  ['core-web', 'Canvas / Library', [], 'optional', 'Observed in browser without tapDesktop', 'No loss to observed pages', 'none'],
  ['shell', 'Install / window / tray / protocol', ['app'], 'native-only', 'Browser tabs and URLs only', 'No app window, tray, installer, or deep-link wakeup', 'Web low; desktop parity high'],
  ['auth', 'Login callback', ['auth'], 'partial fallback', 'Web auth exists; desktop uses custom protocol and loopback callback', 'No desktop OAuth return path; first-login path needs browser proof', 'Web low; parity medium'],
  ['updates', 'App and Web bundle updates', ['updates'], 'native-only', 'Web deploy updates the site', 'No binary updater or local bundle lifecycle', 'Web none; desktop parity high'],
  ['local-files', 'Local files and path grants', ['local-files'], 'native-only for Agent tools', 'Web picker/upload is single-action only', 'No directory walk, scoped persistent grants, or grant revocation', 'medium-high'],
  ['capture', 'Region capture / screen sources / recording', ['capture', 'screen-capture'], 'native-only for region workflow', 'User-selected screen or existing image only', 'No region overlay, hotkeys, clipboard capture, or recording chunks', 'Parity high; upload-only low'],
  ['downloads', 'Managed downloads', ['downloads'], 'partial fallback', 'Browser downloads handle ordinary files', 'No managed target, queue, or progress', 'low-medium'],
  ['media', 'Microphone status', ['media'], 'partial fallback', 'Browser Media API prompts user', 'No OS status or system settings jump', 'low-medium'],
  ['system-os', 'OS apps / settings / window / registered files', ['system'], 'partial fallback', 'Ordinary URLs only', 'No app discovery, window layout, permission settings, or OS file open', 'Registered paths low; rest medium-high', 7],
  ['shell-approval', 'Shell proposal / approve / revoke / audit', ['system'], 'native-only; security-sensitive', 'No safe Web equivalent', 'Proposal, scope binding, approvals, revoke, and audit', 'high', 4],
  ['notifications', 'System notifications and navigation', ['notifications', 'navigation'], 'partial fallback', 'Page notices and ordinary URLs', 'No tray notification or protocol deep-link event', 'low-medium'],
  ['maintenance', 'Storage and diagnostics', ['storage', 'diagnostics'], 'native-only management', 'Browser can clear site data', 'No desktop logs, temp files, or diagnostic bundle', 'drop low; retain medium'],
  ['network', 'Desktop API route state', ['network'], 'partial fallback', 'Current site origin and server routing', 'No desktop proxy state or route status', 'hosted low; local proxy medium'],
];
const classifications = rawClasses.map(([id, area, groups, bridge, browser, loss, complexity, fixed]) => ({
  id, area, channels: fixed ?? count(groups), bridge, browser, loss, complexity,
}));

const indexHtml = await fs.readFile(path.join(web, 'index.html'), 'utf8');
const meta = JSON.parse(await fs.readFile(path.join(web, 'desktop-build-meta.json'), 'utf8'));
const update = await fs.readFile(path.join(ref, 'tapnow-installed', 'resources', 'app-update.yml'), 'utf8');

const output = {
  workspace: 'LCOS-DSH-03',
  generatedAt: '2026-10-13',
  method: {
    scope: 'Read-only static inspection of copied installer resources, shell references, installed web bundle, and LCOS source.',
    asar: 'Parsed header and package.json in memory; compared three packaged shell entries with saved references. No extracted copy was written.',
    execution: 'No TapNow executable, updater, shell command, IPC action, or cloud endpoint was executed or called.',
    rendererScan: 'Lexical substring scan; not full AST analysis.',
    hashesAdded: false,
  },
  package: {
    name: manifest.name,
    version: manifest.version,
    main: manifest.main,
    archiveBytes: archive.length,
    headerJsonBytes: archive.readUInt32LE(12),
    webBundleVersion: meta.release?.webBundleVersion ?? null,
    webEntry: indexHtml.match(/<script[^>]+src="([^"]+)"/)?.[1] ?? null,
    runtimeMarker: indexHtml.match(/<meta name="tapnow-desktop-runtime" content="([^"]+)"/)?.[1] ?? null,
    updaterProvider: update.match(/^provider:\s*(.+)$/m)?.[1]?.trim() ?? null,
    updaterUrl: update.match(/^url:\s*(.+)$/m)?.[1]?.trim() ?? null,
    packagedShellEntries: comparisons,
  },
  currentBrowserObservation: {
    tapDesktop: false,
    coreSurfaces: ['Canvas', 'Library'],
    basis: 'Existing live-browser observation supplied in task context; not independently reopened.',
  },
  channelTotal: inventory.desktopIpcChannels?.length ?? 0,
  channelCountsByPrefix: counts,
  rendererConsumers,
  classifications,
  reuseCandidates: [
    { file: 'lcos/apps/local-core/src/path-guard.ts:35', use: 'Canonical path and selected-file containment.', limit: 'Not persistent per-path grants or revoke UI.' },
    { file: 'lcos/apps/local-core/src/native-directory-picker.ts:26', use: 'Native directory picker.', limit: 'Windows-only; not the whole file bridge.' },
    { file: 'lcos/apps/local-core/src/os-integration.ts:16,41', use: 'Open/reveal registered LCOS paths.', limit: 'Not arbitrary paths, app enumeration, or window control.' },
    { file: 'lcos/apps/local-core/src/capture-gateway-service.ts:108,122', use: 'Accept screenshot data; trusted Runtime Host required for local-file capture.', limit: 'Does not capture a screen or region.' },
    { file: 'lcos/apps/local-core/src/agentlet-runtime-service.ts:203', use: 'Constrained argv execution.', limit: 'Not TapNow approval lifecycle.' },
  ],
  recommendation: 'For browser-first Canvas/Library, remove Electron, both updater paths, and tapDesktop/tapCapture from the shipped surface. Keep existing Local Core path and execution protections. Reintroduce only needed OS capabilities behind Local Core; report unsupported when absent rather than returning success.',
};
await fs.writeFile(path.join(root, 'evidence', 'desktop-boundaries.json'), JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  version: manifest.version,
  main: manifest.main,
  exactShellMatches: comparisons.filter((item) => item.exactMatch).length,
  channels: output.channelTotal,
  groups: Object.keys(counts).length,
}, null, 2));
