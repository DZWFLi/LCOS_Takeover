import fs from 'node:fs/promises';
import path from 'node:path';

const record = (value: any) => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: any) => typeof value === 'string' && value.length > 0 && value.length <= 220 && value.trim() === value;
export class NativeSessionCanvasTargetError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
const unavailable = () => new NativeSessionCanvasTargetError(503, 'canvas_tools_unconfirmed', '当前现场归属暂未确认，本次消息未发送。');

/** Child addresses contain only the existing Core project and Workspace keys.
 * Decoding is a candidate check, never authority to attach an arbitrary Space. */
function dynamicWorkspace(config: any, canvasId: any) {
  if (!identifier(canvasId) || !/^worksite-[a-z0-9_-]+$/i.test(canvasId)) return undefined;
  try {
    const encoded = canvasId.slice('worksite-'.length);
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    const keys = JSON.parse(decoded);
    if (!Array.isArray(keys) || keys.length !== 2 || !keys.every(identifier) || keys[0] !== config.projectId
      || Buffer.from(JSON.stringify(keys)).toString('base64url') !== encoded) return undefined;
    return keys[1] as string;
  } catch { return undefined; }
}
export const isNativeSessionCanvasTarget = (config: any, canvasId: any) => identifier(canvasId)
  && (Object.hasOwn(config.canvases, canvasId) || dynamicWorkspace(config, canvasId) !== undefined);

/** The fixed MCP and Host read the same runtime connection. Only the original
 * authenticated capabilities route can confirm a dynamic Core-owned canvas.
 * Nothing supplied by the browser chooses a URL, token or executable. */
export async function confirmNativeSessionCanvasTarget(config: any, canvasId: string) {
  if (Object.hasOwn(config.canvases, canvasId)) return;
  if (!dynamicWorkspace(config, canvasId))
    throw new NativeSessionCanvasTargetError(400, 'canvas_preparation_invalid', '当前消息或画布目标尚未确认。');
  try {
    const runtime = path.resolve(path.dirname(config.script), '..', '.runtime', config.runtimeLabel);
    const filename = path.join(runtime, 'kernel-connection.json');
    if (await fs.realpath(runtime) !== runtime || await fs.realpath(filename) !== filename) throw unavailable();
    const stat = await fs.stat(filename);
    if (!stat.isFile() || stat.size > 8192) throw unavailable();
    const connection = JSON.parse(await fs.readFile(filename, 'utf8'));
    if (!record(connection) || connection.projectId !== config.projectId
      || typeof connection.connectionToken !== 'string' || !/^[a-f0-9]{64}$/.test(connection.connectionToken)) throw unavailable();
    const origin = new URL(connection.origin);
    if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
      || !origin.port || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw unavailable();
    const response = await fetch(new URL('/api/rfs/' + encodeURIComponent(canvasId) + '/capabilities', origin), {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { Authorization: 'Bearer ' + connection.connectionToken, Accept: 'application/json' },
    });
    if (response.status === 404 || response.status === 409)
      throw new NativeSessionCanvasTargetError(409, 'canvas_target_changed', '当前现场已变化，请重新打开原现场后发送。');
    if (!response.ok) throw unavailable();
    const capabilities = await response.json();
    const exact = (actual: any, expected: string[]) => Array.isArray(actual) && actual.length === expected.length
      && expected.every(type => actual.includes(type));
    if (!exact(capabilities?.queryTypes, ['GET_SPACE_OUTLINE', 'INSPECT_NODES', 'INSPECT_EDGES'])
      || !exact(capabilities?.commandTypes, ['SET_NODE_GEOMETRY', 'MERGE_NODE_DATA'])
      || !exact(capabilities?.guiTypes, ['SET_NAVIGATION_PIN', 'SET_COLOR_PIN', 'RENAME_COLOR_PIN'])) throw unavailable();
  } catch (error) {
    // Do not expose local configuration, credential fragments, URLs or fetch errors.
    throw error instanceof NativeSessionCanvasTargetError ? error : unavailable();
  }
}
