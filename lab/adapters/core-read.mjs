export class AdapterError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export function validateCoreOrigin(input) {
  if (input === undefined || input === null || input === '') return null;
  const url = new URL(input);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) ||
      !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new TypeError('coreOrigin requires an explicit http://127.0.0.1:PORT or http://[::1]:PORT origin.');
  }
  return url.origin;
}

export function createCoreReader({ coreOrigin, fixtureMode = false, fixtureRead, timeoutMs = 3000 } = {}) {
  const origin = validateCoreOrigin(coreOrigin);
  if (fixtureMode && origin) throw new TypeError('Choose fixtureMode or coreOrigin; fixture fallback is never automatic.');
  const metadata = { mode: fixtureMode ? 'fixture' : origin ? 'core-readonly' : 'unavailable',
    read_only: true, core_connected: false,
    source: fixtureMode ? 'synthetic-lcos-fixtures' : origin ? 'explicit-core-http' : 'unconfigured' };
  async function read(route) {
    if (fixtureMode) return structuredClone(await fixtureRead(route));
    if (!origin) throw new AdapterError(503, 'CORE_UNAVAILABLE', 'No isolated Core origin configured. Enable fixtureMode explicitly for synthetic data.');
    let response;
    try {
      response = await fetch(origin + route, { method: 'GET', redirect: 'error', credentials: 'omit',
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
    } catch { throw new AdapterError(503, 'CORE_UNAVAILABLE', 'Configured Core could not be read; no fallback was used.'); }
    if (!response.ok) throw new AdapterError(503, 'CORE_READ_FAILED', 'Configured Core rejected the read.');
    let envelope;
    const chunks = []; let length = 0;
    try {
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > 4 * 1024 * 1024) throw new Error('Too large');
        chunks.push(chunk);
      }
      envelope = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { throw new AdapterError(502, 'CORE_RESPONSE_INVALID', 'Core response was not a bounded JSON envelope.'); }
    if (envelope?.ok !== true || !Object.hasOwn(envelope, 'value')) {
      throw new AdapterError(502, 'CORE_RESPONSE_INVALID', 'Core did not return { ok: true, value }.');
    }
    metadata.core_connected = true;
    return envelope.value;
  }
  return { read, metadata };
}
