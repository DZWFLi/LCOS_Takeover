const STARTUP_SCRIPT = '<script src="/startup-fixture.js"></script>';
const DIAGNOSTIC_SCRIPT = '<script src="/renderer-diagnostics.js"></script>';
const AUTH_STORE_MARKER = 'const Cr=zp()';
const BOOT_CALL = ';hFl();';
const INJECTED_BOOT_CALL = ';window.__LCOS_OFFLINE_TAKEOVER__.bootstrap(Cr);hFl();';
const API_BASE_SOURCE = 'VITE_API_BASE_URL:"https://app.tapnow.ai"';
const API_BASE_TARGET = 'VITE_API_BASE_URL:window.location.origin';

function count(source, needle) {
  return source.split(needle).length - 1;
}

/**
 * Add the local-fixture bootstrap before the installed renderer's module entry.
 * This only touches the in-memory HTML string returned by the lab server.
 */
export function transformRendererHtml(html) {
  if (typeof html !== 'string') throw new TypeError('Renderer HTML must be text.');
  if (html.includes('src="/startup-fixture.js"')) return html;

  if (count(html, DIAGNOSTIC_SCRIPT) === 1) {
    return html.replace(DIAGNOSTIC_SCRIPT, DIAGNOSTIC_SCRIPT + '\n' + STARTUP_SCRIPT);
  }
  if (count(html, '<head>') !== 1) {
    throw new Error('Renderer HTML did not contain one expected <head> insertion point.');
  }
  return html.replace('<head>', '<head>\n' + STARTUP_SCRIPT);
}

/**
 * The server runs this for every installed .js asset in takeover mode.
 * Non-entry assets pass through byte-for-byte; the single renderer entry is
 * bound to the fixture store immediately before its existing hFl() startup.
 */
export function transformRendererScript(filename, source) {
  if (typeof filename !== 'string' || typeof source !== 'string') {
    throw new TypeError('Renderer script transform expects a filename and source text.');
  }

  const hasEntryCall = source.includes(BOOT_CALL);
  const hasAuthStore = source.includes(AUTH_STORE_MARKER);
  const hasApiBase = source.includes(API_BASE_SOURCE);
  if (!hasEntryCall && !hasAuthStore && !hasApiBase) return source;
  if (!hasEntryCall || !hasAuthStore || !hasApiBase ||
      count(source, BOOT_CALL) !== 1 ||
      count(source, AUTH_STORE_MARKER) !== 1 ||
      count(source, API_BASE_SOURCE) !== 1) {
    throw new Error('Renderer startup seam changed; refusing to serve a partial takeover transform.');
  }

  return source
    .replace(API_BASE_SOURCE, API_BASE_TARGET)
    .replace(BOOT_CALL, INJECTED_BOOT_CALL);
}
