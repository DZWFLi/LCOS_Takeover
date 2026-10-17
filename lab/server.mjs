import http from 'node:http';
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const labRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.dirname(labRoot);
const vendorRoot = path.join(workspaceRoot, 'reference', 'tapnow-installed', 'resources', 'web');
const args = process.argv.slice(2);
const takeover = args.includes('--takeover');
const cut = args.includes('--cut');
const islands = args.includes('--islands');
const adoption = args.includes('--adoption');
const fullIntegration = args.includes('--full-integration');
const nativeRailPilot = args.includes('--native-rail-pilot');
const nativeAssemblyPilot = args.includes('--native-assembly-pilot') || nativeRailPilot;
const nativeTextPilot = args.includes('--native-text-pilot') || nativeAssemblyPilot;
const nativeCollectionPilot = args.includes('--native-collection-pilot') || nativeTextPilot;
const surfaceCore = args.includes('--surface-core') || fullIntegration;
const nodes = args.includes('--nodes') || surfaceCore;
if (nodes && (!takeover || !cut || adoption || islands)) throw new Error('Use --nodes with --takeover --cut only.');
if (cut && !takeover) throw new Error('Use --cut together with --takeover.');
if (adoption && (!takeover || !cut)) throw new Error('Use --adoption with --takeover --cut.');
const runtimeLabelArg = args.find(value => value.startsWith('--runtime-label='));
const defaultRuntimeLabel = fullIntegration ? 'live-full-integration' : surfaceCore ? 'live-surface-core-v2' : nodes ? 'offline-node-lab' : adoption ? 'offline-adoption' : cut ? 'offline-cut' : islands ? 'offline-islands' : takeover ? 'offline-takeover' : 'offline-lab';
const runtimeLabel = runtimeLabelArg?.slice('--runtime-label='.length) || defaultRuntimeLabel;
if (nativeCollectionPilot && (!fullIntegration || !runtimeLabelArg || !runtimeLabel.startsWith('isolated-'))) {
  throw new Error('Native Collection is an opt-in isolated full-integration preview.');
}
if (runtimeLabelArg && (!fullIntegration || runtimeLabel !== 'live-full-integration' && !/^isolated-[a-z0-9][a-z0-9-]{0,100}$/.test(runtimeLabel))) {
  throw new Error('A custom full-integration runtime must be a bounded isolated-* child name, not a filesystem path or reserved runtime.');
}
const runtimeRoot = path.join(workspaceRoot, '.runtime', runtimeLabel);
if (runtimeLabelArg && runtimeLabel !== 'live-full-integration') {
  try {
    const [base, target] = await Promise.all([fs.realpath(path.join(workspaceRoot, '.runtime')), fs.realpath(runtimeRoot)]);
    const relative = path.relative(base, target);
    if (relative === '' || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
      throw new Error('The isolated runtime resolves outside the existing workspace runtime directory.');
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const stateFile = path.join(runtimeRoot, 'widget-state.json');
const eventsFile = path.join(runtimeRoot, 'events.ndjson');
const portArg = args.findIndex(value => value === '--port');
const inlinePort = args.find(value => value.startsWith('--port='));
const requestedPort = inlinePort ? inlinePort.slice(7) : portArg >= 0 ? args[portArg + 1] : '17873';
const port = Number(requestedPort);
if (nativeCollectionPilot && [17879, 17880, 17881].includes(port)) throw new Error('Native Collection cannot use a historical/live port.');
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Use --port with an integer from 1024 to 65535.');
}

let startupTransform;
let startupFixture;
let backendCompat;
let cutTransform;
let nodeTransform;
let nodeBackend;
let nodeUpload;
let surfaceDockTransform;
let historyIntentTransform;
let agentNodeTransform;
let nativeTextTransform;
let nativeFirstTextTransform;
let nativeImageTitleTransform;
let nativePileCollectionTransform;
let nativeAssemblyLibraryTransform;
let nativeMaterialRailTransform;
let nativeChatFrameTransform;
let nativeChatMessagesTransform;
let nativeChatActionsTransform;
let nativeComposerFrameTransform;
let nativeLightThemeTransform;
let nativeLibraryContextsTransform;
let nativeMaterialViewerTransform;
let nativeHistoryTransform;
let nativeDefaultTextPlacementTransform;
let nativeTiptapAutosaveTransform;
let nativeTextActionsTransform;
let nativeLibraryDropTransform;
let nativeColorPinCourseTransform;
let nativeColorPinPageTransform;
let nativeFileUploadTransform;
if (fullIntegration) historyIntentTransform = await import('./history-intent-transform.mjs');
if (fullIntegration) agentNodeTransform = await import('./agent-node-transform.mjs');
if (fullIntegration) nativeChatFrameTransform = await import('./native-chat-frame-transform.mjs');
if (fullIntegration) nativeChatMessagesTransform = await import('./native-chat-messages-transform.mjs');
if (fullIntegration) nativeChatActionsTransform = await import('./native-chat-actions-transform.mjs');
if (fullIntegration) nativeComposerFrameTransform = await import('./native-composer-source-transform.mjs');
if (fullIntegration) nativeLightThemeTransform = await import('./native-light-theme-transform.mjs');
if (fullIntegration) nativeMaterialViewerTransform = await import('./native-material-viewer-transform.mjs');
if (fullIntegration) nativeHistoryTransform = await import('./native-history-transform.mjs');
if (fullIntegration) nativeDefaultTextPlacementTransform = await import('./native-project-text-create-transform.mjs');
if (fullIntegration) nativeFileUploadTransform = await import('./native-file-upload-transform.mjs');
if (fullIntegration) nativeTiptapAutosaveTransform = await import('./native-tiptap-autosave-transform.mjs');
if (nativeAssemblyPilot) nativeLibraryContextsTransform = await import('./native-library-contexts-transform.mjs');
if (fullIntegration) nativeTextTransform = await import('./native-text-transform.mjs');
if (nativeTextPilot) nativeFirstTextTransform = await import('./native-text-first-transform.mjs');
if (nativeTextPilot) nativeTextActionsTransform = await import('./native-text-actions-transform.mjs');
if (fullIntegration) nativeImageTitleTransform = await import('./native-image-title-transform.mjs');
if (nativeCollectionPilot) nativePileCollectionTransform = await import('./native-pile-collection-transform.mjs');
if (nativeAssemblyPilot) nativeAssemblyLibraryTransform = await import('./native-assembly-library-transform.mjs');
if (nativeAssemblyPilot) nativeLibraryDropTransform = await import('./native-library-drop-transform.mjs');
if (nativeRailPilot) nativeMaterialRailTransform = await import('./native-material-rail-transform.mjs');
if (nativeRailPilot) nativeColorPinCourseTransform = await import('./native-colorpin-course-transform.mjs');
if (nativeRailPilot) nativeColorPinPageTransform = await import('./native-colorpin-page-transform.mjs');
if (nodes) {
  nodeTransform = await import('./node-transform.mjs');
  if (!surfaceCore) {
    nodeBackend = await (await import('./node-lab-backend.mjs')).createNodeLabBackend({ runtimeRoot });
    nodeUpload = await (await import('./node-lab-upload.mjs')).createNodeLabUpload({ runtimeRoot, origin: 'http://127.0.0.1:' + port });
  } else surfaceDockTransform = await import('./surface-dock-transform.mjs');
}
if (takeover) {
  startupTransform = await import('./startup-transform.mjs');
  startupFixture = (await import('./startup-fixtures.mjs')).handleStartupFixture;
  const backendModule = await import('./backend-compat.mjs');
  backendCompat = await backendModule.createBackendCompat({ fixtureMode: true, coreOrigin: undefined });
  if (cut) cutTransform = await import('./cut-transform.mjs');
}

const maxBodyBytes = 128 * 1024;
const maxEvents = 2000;
let states = { widgets: {} };
let events = [];
let sequence = 0;
let mutations = Promise.resolve();
const queue = operation => {
  const next = mutations.then(operation);
  mutations = next.catch(() => {});
  return next;
};

await fs.mkdir(runtimeRoot, { recursive: true });
let gen2ClientModules;
const gen2ClientRoot = path.join(runtimeRoot, 'gen2-client-modules');
if (adoption) {
  const { prepareGen2ClientModules } = await import('./gen2-client-build.mjs');
  gen2ClientModules = await prepareGen2ClientModules(gen2ClientRoot);
}
await fs.access(path.join(vendorRoot, 'usercontent-proxy', 'apps', 'color-adjust@v2.285e6ccb.html'));
try {
  const parsed = JSON.parse(await fs.readFile(stateFile, 'utf8'));
  if (!parsed || typeof parsed.widgets !== 'object' || Array.isArray(parsed.widgets)) {
    throw new Error('Invalid saved widget state; preserve the file and inspect it.');
  }
  states = parsed;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
try {
  const lines = (await fs.readFile(eventsFile, 'utf8')).split('\n').filter(Boolean);
  for (const line of lines.slice(-maxEvents)) {
    try { events.push(JSON.parse(line)); }
    catch { /* A partial final event never changes the saved widget state. */ }
  }
  sequence = Math.max(0, ...events.map(event => Number(event.sequence) || 0));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

async function recordEvent(source, kind, detail = {}) {
  return queue(async () => {
    const event = { sequence: ++sequence, at: new Date().toISOString(), source, kind, detail };
    await fs.appendFile(eventsFile, JSON.stringify(event) + '\n', 'utf8');
    events.push(event);
    if (events.length > maxEvents) events = events.slice(-maxEvents);
    return event;
  });
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.webmanifest': 'application/manifest+json'
};
const csp = [
  "default-src 'self'", "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "media-src 'self' data: blob:", "font-src 'self' data:",
  "connect-src 'self'", "object-src 'none'", "frame-src 'self' blob:",
  "worker-src 'self' blob:", "base-uri 'self'", "form-action 'none'",
  "frame-ancestors 'self'"
].join('; ');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function respondJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}
function sameOrigin(request) {
  const expected = new Set(['http://127.0.0.1:' + port, 'http://localhost:' + port]);
  return !request.headers.origin || expected.has(request.headers.origin);
}
async function readJson(request) {
  if (!String(request.headers['content-type'] || '').startsWith('application/json')) {
    throw new HttpError(415, 'Use Content-Type: application/json.');
  }
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBodyBytes) throw new HttpError(413, 'Request body exceeds 128 KiB.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Expected a JSON body.'); }
}
async function resolveStatic(root, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { throw new HttpError(400, 'Invalid path encoding.'); }
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').includes('..')) {
    throw new HttpError(403, 'Path is outside the static directory.');
  }
  const target = path.resolve(root, '.' + '/' + decoded);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new HttpError(403, 'Path is outside the static directory.');
  }
  let realTarget;
  try { realTarget = await fs.realpath(target); }
  catch (error) {
    if (error.code === 'ENOENT') throw new HttpError(404, 'Local file not found.');
    throw error;
  }
  const realRoot = await fs.realpath(root);
  const realRelative = path.relative(realRoot, realTarget);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new HttpError(403, 'Linked file is outside the static directory.');
  }
  const stat = await fs.stat(realTarget);
  if (!stat.isFile()) throw new HttpError(404, 'Local file not found.');
  return { file: realTarget, size: stat.size };
}
// Imported transform owners are fixed for this server process. Share their
// result between simultaneous original-module requests; changed vendor source
// is still observed, and local UI/CSS files keep their normal fresh reads.
const vendorScriptCache = new Map();
async function serveStatic(request, response, root, pathname) {
  const { file, size } = await resolveStatic(root, pathname);
  if (takeover && root === vendorRoot && path.extname(file) === '.js') {
    const original = await fs.readFile(file, 'utf8');
    const cached = vendorScriptCache.get(file);
    let content = cached?.original === original ? cached.content : null;
    if (!content) {
      content = (async () => {
    const startupSource = await startupTransform.transformRendererScript(path.basename(file), original);
    const cutSource = cut ? await cutTransform.transformCutScript(path.basename(file), startupSource) : startupSource;
    const bridged = nodes ? nodeTransform.transformNodeBridgeScript(path.basename(file), cutSource).replace('VITE_FILE_ACCESS_URL:""', 'VITE_FILE_ACCESS_URL:window.location.origin') : cutSource;
    const docked = surfaceCore ? surfaceDockTransform.transformSurfaceDockScript(path.basename(file), bridged) : bridged;
    const historied = fullIntegration ? historyIntentTransform.transformHistoryIntentScript(path.basename(file), docked) : docked;
    const chatMessages = fullIntegration ? nativeChatMessagesTransform.transformNativeChatMessagesScript(path.basename(file), historied) : historied;
    const chatActions = fullIntegration ? nativeChatActionsTransform.transformNativeChatActionsScript(path.basename(file), chatMessages) : chatMessages;
    const chatFrame = fullIntegration ? nativeChatFrameTransform.transformNativeChatFrameScript(path.basename(file), chatActions) : chatActions;
    const chatComposer = fullIntegration ? nativeComposerFrameTransform.transformNativeComposerFrame(path.basename(file), chatFrame) : chatFrame;
    const agented = fullIntegration ? agentNodeTransform.transformAgentNodeScript(path.basename(file), chatComposer) : chatComposer;
    const created = fullIntegration ? nativeDefaultTextPlacementTransform.transformNativeDefaultTextPlacementScript(path.basename(file), agented) : agented;
    const texted = nativeTextPilot ? nativeFirstTextTransform.transformNativeFirstTextScript(path.basename(file), created)
      : fullIntegration && !nativeCollectionPilot ? nativeTextTransform.transformNativeTextScript(path.basename(file), created) : created;
    const textActions = nativeTextPilot ? nativeTextActionsTransform.transformNativeTextActionsScript(path.basename(file), texted) : texted;
    const titled = fullIntegration && !nativeCollectionPilot ? nativeImageTitleTransform.transformNativeImageTitleScript(path.basename(file), textActions) : textActions;
    const piled = nativeCollectionPilot ? nativePileCollectionTransform.transformNativePileCollectionScript(path.basename(file), titled) : titled;
    const assembled = nativeAssemblyPilot ? nativeAssemblyLibraryTransform.transformNativeAssemblyLibraryScript(path.basename(file), piled) : piled;
    const libraryDragged = nativeAssemblyPilot ? nativeLibraryDropTransform.transformNativeLibraryDropScript(path.basename(file), assembled) : assembled;
    const libraryNoticed = nativeAssemblyPilot ? nativeLibraryDropTransform.transformNativeLibraryDropNoticeScript(path.basename(file), libraryDragged) : libraryDragged;
    const railed = nativeRailPilot ? nativeMaterialRailTransform.transformNativeMaterialRailScript(path.basename(file), libraryNoticed) : libraryNoticed;
    const libraryContexts = nativeAssemblyPilot ? nativeLibraryContextsTransform.transformNativeLibraryContextsScript(path.basename(file), railed) : railed;
    const historyViewed = fullIntegration ? nativeHistoryTransform.transformNativeHistoryScript(path.basename(file), libraryContexts) : libraryContexts;
    const viewed = fullIntegration ? nativeMaterialViewerTransform.transformNativeMaterialViewerScript(path.basename(file), historyViewed) : historyViewed;
    const autosaved = fullIntegration ? nativeTiptapAutosaveTransform.transformNativeTiptapAutosaveScript(path.basename(file), viewed) : viewed;
    const colorPinCourse = nativeRailPilot ? nativeColorPinCourseTransform.transformNativeColorPinCourseScript(path.basename(file), autosaved) : autosaved;
    const colorPinPage = nativeRailPilot ? nativeColorPinPageTransform.transformNativeColorPinPageScript(path.basename(file), colorPinCourse) : colorPinCourse;
    const uploaded = fullIntegration ? nativeFileUploadTransform.transformNativeFileUploadScript(path.basename(file), colorPinPage) : colorPinPage;
    const transformed = fullIntegration ? nativeLightThemeTransform.transformNativeLightThemeScript(path.basename(file), uploaded) : uploaded;
    if (typeof transformed !== 'string') throw new Error('Startup transform must return JavaScript text.');
      return transformed;
      })();
      vendorScriptCache.set(file, { original, content });
      content.catch(() => { if (vendorScriptCache.get(file)?.content === content) vendorScriptCache.delete(file); });
    }
    const transformed = await content;
    response.writeHead(200, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Content-Length': Buffer.byteLength(transformed),
      ...(request.headers.origin === 'null' ? { 'Access-Control-Allow-Origin': 'null' } : {})
    });
    response.end(request.method === 'HEAD' ? undefined : transformed);
    return;
  }
  const headers = {
    'Content-Type': mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Accept-Ranges': 'bytes'
  };
  // The isolated vendor frame has an opaque origin; expose only read-only static files.
  if (request.headers.origin === 'null') headers['Access-Control-Allow-Origin'] = 'null';
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (request.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
    if (!match || (!match[1] && !match[2])) throw new HttpError(416, 'Unsupported byte range.');
    if (!match[1]) start = Math.max(0, size - Number(match[2]));
    else start = Number(match[1]);
    if (match[1] && match[2]) end = Math.min(end, Number(match[2]));
    if (start >= size || start > end || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      response.setHeader('Content-Range', 'bytes */' + size);
      throw new HttpError(416, 'Byte range is outside the file.');
    }
    status = 206;
    headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
  }
  headers['Content-Length'] = Math.max(0, end - start + 1);
  response.writeHead(status, headers);
  if (request.method === 'HEAD' || size === 0) { response.end(); return; }
  createReadStream(file, { start, end }).on('error', () => response.destroy()).pipe(response);
}

if (surfaceCore) {
  const { startSurfaceCoreFacade } = await import(pathToFileURL(path.join(runtimeRoot, 'surface-core-facade.mjs')).href);
  nodeBackend = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: 'http://127.0.0.1:' + port, fullIntegration, nativeCollectionPilot, nativeTextPilot, nativeAssemblyPilot, nativeRailPilot });
  if (fullIntegration) nodeUpload = nodeBackend.upload;
}
function decorateHtml(bootHtml) {
  let html = cut ? bootHtml.replace('<head>', '<head>\n<script src="/' + (nodes ? 'startup-node-panel.js' : adoption ? 'startup-adoption-panel.js' : 'startup-custom-panel.js') + '"></script>') : bootHtml;
  if (surfaceCore) html = html.replace('<head>', '<head>\n' + (fullIntegration ? '<script src="/startup-native-text-save-port.js"></script>' : '') + '<script src="/startup-surface-core.js"></script><link rel="stylesheet" href="/surface-dock.css" data-lcos-surface-dock-css>');
  if (fullIntegration) html = html.replace('<head>', '<head>\n<script src="/startup-history-intent.js"></script><link rel="stylesheet" href="/lcos/agent-ui.css">');
  if (nativeCollectionPilot) html = html.replace('<head>', '<head>\n<link rel="stylesheet" href="/lcos/native-pile-ui.css">');
  if (nativeTextPilot) html = html.replace('<head>', '<head>\n<link rel="stylesheet" href="/lcos/native-text-first-ui.css">');
  return fullIntegration ? nativeLightThemeTransform.transformNativeLightThemeHtml(html) : html;
}
const server = http.createServer(async (request, response) => {
  response.setHeader('Content-Security-Policy', csp);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cache-Control', 'no-store');
  try {
    const allowedHosts = new Set(['127.0.0.1:' + port, 'localhost:' + port]);
    if (!allowedHosts.has(request.headers.host)) throw new HttpError(403, 'Loopback Host required.');
    const url = new URL(request.url, 'http://127.0.0.1:' + port);
    const pathname = url.pathname;
    if (pathname === '/health' && request.method === 'GET') {
      respondJson(response, 200, {
        ok: true, mode: 'offline', bind: '127.0.0.1', port, pid: process.pid,
        ...(surfaceCore ? { surfaceCount: nodeBackend.workspaces.length } : { widget: 'color-adjust@v2.285e6ccb' }), cloudBackendConnected: false,
        profile: fullIntegration ? 'original-tapnow-full-integration-in-progress' : surfaceCore ? 'original-tapnow-real-core-three-workspaces' : nodes ? 'original-nodes-local-fixture-writes' : adoption ? 'adoption-components-fixture' : cut ? 'cut-fixture' : islands ? 'tool-islands' : takeover ? 'takeover-fixture' : 'original-offline',
        ...(fullIntegration ? { fullScopeComplete: false, translationRegistry: '/api/lcos/translation' } : {}),
        ...(nativeCollectionPilot ? { nativeCollectionPilot: true } : {}),
        ...(nativeTextPilot ? { nativeTextPilot: true, runtimeLabel } : {}),
        ...(nativeAssemblyPilot ? { nativeAssemblyPilot: true } : {}),
        ...(nativeRailPilot ? { nativeRailPilot: true } : {}),
        realCoreConnected: surfaceCore,
        localBackendMode: surfaceCore ? 'isolated-core-headless-huabu' : takeover ? 'explicit-fixture-no-core' : 'not-connected'
      });
      return;
    }
    if (pathname.startsWith('/api/')) {
      if (!sameOrigin(request)) throw new HttpError(403, 'API requests must come from the local host page.');
      if (fullIntegration && await nodeBackend.handleCoreEventStream?.(request, response, url)) return;
      if (nodeUpload && await nodeUpload(request, response, url)) return;
      if (adoption && pathname === '/api/adoption/status' && request.method === 'GET') {
        respondJson(response, 200, { mode: 'component-adoption-fixture',
          realCoreConnected: false, canonicalWritesConnected: false,
          gen2ClientCode: gen2ClientModules.files, dataSource: 'explicit-fixture-fetch',
          domainTruthOwner: 'Local Core, not this demonstration',
          productionSpatialOwner: 'Huabu, not the isolated TapNow donor canvas' });
        return;
      }
      if (pathname === '/api/state' && request.method === 'GET') {
        await mutations;
        respondJson(response, 200, states);
        return;
      }
      if (pathname === '/api/state' && request.method === 'PUT') {
        const body = await readJson(request);
        if (!body || !/^[a-z][a-z0-9-]{1,63}$/.test(body.widget || '') ||
            body.widget === 'constructor' || body.widget === 'prototype' ||
            !body.state || typeof body.state !== 'object' || Array.isArray(body.state)) {
          throw new HttpError(400, 'Expected { widget: "color-adjust", state: { ... } }.');
        }
        const saved = await queue(async () => {
          const next = {
            widgets: {
              ...states.widgets,
              [body.widget]: { state: body.state, updatedAt: new Date().toISOString() }
            }
          };
          const temporaryFile = stateFile + '.tmp';
          await fs.writeFile(temporaryFile, JSON.stringify(next, null, 2) + '\n', 'utf8');
          await fs.rename(temporaryFile, stateFile);
          states = next;
          return next.widgets[body.widget];
        });
        await recordEvent('server', 'state-saved', { widget: body.widget });
        respondJson(response, 200, { ok: true, widget: body.widget, ...saved });
        return;
      }
      if (pathname === '/api/errors' && request.method === 'GET') {
        await mutations;
        const kinds = new Set(['request-rejected', 'csp-blocked', 'frame-csp-blocked', 'host-csp-blocked', 'page-error', 'unhandled-rejection', 'remote-fetch-attempt', 'remote-fetch-blocked', 'navigation-blocked', 'http-failed', 'fetch-failed', 'action-not-connected']);
        respondJson(response, 200, { errors: events.filter(event => kinds.has(event.kind)), lastSequence: sequence });
        return;
      }
      if (pathname === '/api/events' && request.method === 'GET') {
        await mutations;
        const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
        respondJson(response, 200, {
          events: events.filter(event => event.sequence > after), lastSequence: sequence
        });
        return;
      }
      if (pathname === '/api/events' && request.method === 'POST') {
        const body = await readJson(request);
        if (!body || typeof body.kind !== 'string' || !body.kind || body.kind.length > 100) {
          throw new HttpError(400, 'Expected { source?, kind, detail? }.');
        }
        const event = await recordEvent(
          typeof body.source === 'string' ? body.source.slice(0, 100) : 'host',
          body.kind,
          body.detail && typeof body.detail === 'object' ? body.detail : {}
        );
        respondJson(response, 201, { ok: true, sequence: event.sequence });
        return;
      }
      if (takeover) {
        const emptySurfaceDelete = surfaceCore && request.method === 'DELETE'
          && Number(request.headers['content-length'] || 0) === 0 && !request.headers['transfer-encoding'];
        const body = request.method === 'GET' || request.method === 'HEAD' || emptySurfaceDelete
          ? undefined
          : await readJson(request);
        const input = { method: request.method, pathname, url, body };
        const result = (nodes && await nodeBackend.handle(input)) || (surfaceCore
          ? pathname === '/api/bff/billing/init' && await startupFixture(input)
          : await startupFixture(input) || await backendCompat(input));
        if (result) {
          await recordEvent('compat', 'api-response', {
            method: request.method, path: pathname,
            status: result.status, mode: surfaceCore ? 'real-core-headless-huabu' : nodes ? 'node-fixture-writes-no-core' : 'fixture-no-core'
          });
          if (Buffer.isBuffer(result.body)) {
            response.writeHead(result.status, { 'Content-Type': result.contentType || 'application/octet-stream', 'Content-Length': result.body.length });
            response.end(request.method === 'HEAD' ? undefined : result.body);
          } else respondJson(response, result.status, result.body);
          return;
        }
      }
      throw new HttpError(surfaceCore ? 501 : 404, 'Local API endpoint is not implemented.');
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      throw new HttpError(405, 'Only local read-only static requests are supported here.');
    }
    if (pathname === '/renderer') {
      response.writeHead(302, { Location: '/renderer/' });
      response.end();
      return;
    }
    if (pathname === '/takeover' && takeover) {
      response.writeHead(302, { Location: '/takeover/' });
      response.end();
      return;
    }
    if (pathname === '/renderer/' || (takeover && pathname === '/takeover/')) {
      const original = await fs.readFile(path.join(vendorRoot, 'index.html'), 'utf8');
      const diagnosticScript = '<script src="/renderer-diagnostics.js"></script>';
      const diagnosticHtml = original.replace('<head>', '<head>\n' + diagnosticScript);
      const bootHtml = takeover ? await startupTransform.transformRendererHtml(diagnosticHtml) : diagnosticHtml;
      const html = decorateHtml(bootHtml);
      await recordEvent('server', 'renderer-loaded', {
        mode: surfaceCore ? 'original-tapnow-real-core' : takeover ? 'takeover-fixture' : 'original-installed-bundle', backend: surfaceCore ? 'isolated-core-headless-huabu' : 'not-connected'
      });
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : html);
      return;
    }
    if (pathname === '/' || pathname === '/host.html') {
      await serveStatic(request, response, labRoot, '/host.html');
      return;
    }
    if (islands && pathname === '/islands/') {
      await serveStatic(request, response, labRoot, '/island-host.html');
      return;
    }
    if (adoption && pathname === '/adoption') {
      response.writeHead(302, { Location: '/adoption/' }); response.end(); return;
    }
    if (adoption && pathname === '/adoption/') {
      await serveStatic(request, response, labRoot, '/adoption-host.html'); return;
    }
    if (adoption && pathname.startsWith('/gen2-clients/')) {
      await serveStatic(request, response, gen2ClientRoot, pathname.slice('/gen2-clients'.length)); return;
    }
    if (adoption && (pathname.startsWith('/lab/components/recovered/') ||
      pathname.startsWith('/lab/adoption/') || pathname === '/lab/adapters/gen2-feature-source.mjs')) {
      await serveStatic(request, response, labRoot, pathname.slice('/lab'.length)); return;
    }
    if (pathname === '/renderer-diagnostics.js') {
      if (surfaceCore) {
        const source = (await fs.readFile(path.join(labRoot, 'renderer-diagnostics.js'), 'utf8')).replace("backend: 'not-connected'", "backend: 'isolated-core-headless-huabu'");
        response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); response.end(source); return;
      }
      await serveStatic(request, response, labRoot, pathname);
      return;
    }
    if (surfaceCore && ['/surface-dock-ui.js', '/surface-dock.css'].includes(pathname)) {
      await serveStatic(request, response, labRoot, pathname); return;
    }
    if (fullIntegration && pathname === '/native-light-theme.css') {
      await serveStatic(request, response, labRoot, pathname); return;
    }
    if (fullIntegration && ['/lcos/native-react.js', '/lcos/native-jsx-runtime.js', '/lcos/native-react-dom.js', '/lcos/native-router.js', '/lcos/native-flow.js'].includes(pathname)) {
      await serveStatic(request, response, labRoot, pathname.slice('/lcos'.length)); return;
    }
    if (fullIntegration && (['/lcos/agent-ui.js', '/lcos/agent-ui.css', ...(nativeCollectionPilot ? ['/lcos/native-pile-ui.js', '/lcos/native-pile-ui.css'] : []), ...(nativeTextPilot ? ['/lcos/native-text-first-ui.js', '/lcos/native-text-first-ui.css'] : [])].includes(pathname) || pathname.startsWith('/lcos/assets/'))) {
      await serveStatic(request, response, path.join(runtimeRoot, 'native-ui'), pathname.slice('/lcos'.length)); return;
    }
    if (takeover && pathname.startsWith('/startup-') && pathname.endsWith('.js')) {
      if (fullIntegration && pathname === '/startup-native-text-save-port.js') {
        // One fixed alias to the classic factory, before the existing revision
        // wrapper. No generic filesystem proxy or additional script loader.
        await serveStatic(request, response, labRoot, '/native-text-save-port.js'); return;
      }
      if (surfaceCore && pathname === '/startup-node-panel.js') {
        const projectId = nodeBackend.core.projectId;
        if (typeof projectId !== 'string' || !projectId.trim()) throw new Error('Original node bridge needs the actual Core project identity.');
        const source = (await fs.readFile(path.join(labRoot, 'startup-node-panel.js'), 'utf8')).replace("mode: 'fixture-writes-only'", "mode: 'real-core-headless-huabu', projectId: " + JSON.stringify(projectId));
        response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); response.end(source); return;
      }
      if (nodes && pathname === '/startup-fixture.js') {
        const original = await fs.readFile(path.join(labRoot, 'startup-fixture.js'), 'utf8');
        const mainCanvas = surfaceCore ? nodeBackend.workspaces.find(workspace => workspace.preferredSurface === 'main')?.canvasId : 'offline-fixture-canvas';
        if (!mainCanvas) throw new Error('Main Workspace canvas missing.');
        const adapted = original.replace("const fixtureId = 'offline-fixture-canvas';", "const fixtureId = /^\\/canvas\\/[^/]+$/.test(window.location.pathname) ? window.location.pathname.split('/').pop() : " + JSON.stringify(mainCanvas) + ';')
          .replace("if (window.location.pathname !== fixturePath)", "if (window.location.pathname !== fixturePath && window.location.pathname !== '/canvas/projects')")
          .replace('LOCAL FIXTURE · READ ONLY · BILLING NOT CONNECTED', surfaceCore ? 'LOCAL CORE · THREE WORKSPACES · SYNTHETIC PROJECT · CLOUD NOT CONNECTED' : 'LOCAL NODE FIXTURE · LOCAL SAVES · CORE / CLOUD NOT CONNECTED')
          .replace("mode: 'fixture-only'", surfaceCore ? "mode: 'real-core-synthetic-identity'" : "mode: 'fixture-only'")
          .replace('right: 16px; bottom: 16px;', surfaceCore ? 'right: 16px; top: 76px; max-width: calc(100vw - 32px);' : 'right: 16px; bottom: 16px;');
        response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); response.end(adapted); return;
      }
      await serveStatic(request, response, labRoot, pathname);
      return;
    }
    if (pathname.startsWith('/vendor/')) {
      await serveStatic(request, response, vendorRoot, pathname.slice('/vendor'.length));
      return;
    }
    if (pathname.startsWith('/renderer/')) {
      await serveStatic(request, response, vendorRoot, pathname.slice('/renderer'.length));
      return;
    }
    if (takeover && request.headers.accept?.includes('text/html') && !path.extname(pathname)) {
      const original = await fs.readFile(path.join(vendorRoot, 'index.html'), 'utf8');
      const observed = original.replace('<head>', '<head>\n<script src="/renderer-diagnostics.js"></script>');
      const bootHtml = await startupTransform.transformRendererHtml(observed);
      const html = decorateHtml(bootHtml);
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : html);
      return;
    }
    // Original Vite output uses root-absolute /assets/... references.
    if (nodes && pathname.startsWith('/node-fixtures/')) {
      await serveStatic(request, response, labRoot, pathname); return;
    }
    await serveStatic(request, response, vendorRoot, pathname);
  } catch (error) {
    const status = error.status || 500;
    const detail = {
      method: request.method,
      path: String(request.url || '').split('?')[0].slice(0, 300),
      status, message: status === 500 ? 'Local server error.' : error.message
    };
    recordEvent('server', 'request-rejected', detail).catch(() => {});
    if (response.headersSent) response.destroy();
    else respondJson(response, status, { ok: false, error: detail.message });
  }
});

server.on('clientError', (_error, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});
server.on('error', error => {
  console.error('Offline lab failed: ' + error.message);
  process.exitCode = 1;
  if (surfaceCore) nodeBackend.close().catch(closeError => console.error('Core close failed: ' + closeError.message));
});
server.listen(port, '127.0.0.1', async () => {
  await recordEvent('server', 'started', {
    port, widget: 'color-adjust@v2.285e6ccb', backend: surfaceCore ? 'isolated-core-headless-huabu' : 'not-connected'
  });
  console.log('Offline host: http://127.0.0.1:' + port + '/');
  console.log('Original renderer diagnostic: http://127.0.0.1:' + port + '/renderer/');
  if (takeover) console.log((surfaceCore ? 'Original TapNow + isolated Core: ' : 'Takeover fixture (not Core): ') + 'http://127.0.0.1:' + port + '/takeover/');
  if (adoption) console.log('Recovered component + original Gen2 clients (fixture responses): http://127.0.0.1:' + port + '/adoption/');
  console.log('Runtime data: ' + runtimeRoot);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(async () => { if (surfaceCore) await nodeBackend.close(); process.exitCode = 0; }));
}

