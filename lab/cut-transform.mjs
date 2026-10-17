const MAIN_BUNDLE = 'index-BAQXnPag.js';
const CANVAS_BUNDLE = 'page-Da_DfwiK.js';

function count(source, needle) {
  return source.split(needle).length - 1;
}

function replaceRegion(source, filename, startMarker, endMarker, replacement) {
  const startCount = count(source, startMarker);
  if (startCount !== 1) {
    throw new Error(filename + ': expected one cut seam for ' + startMarker + '; found ' + startCount + '.');
  }
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) {
    throw new Error(filename + ': cut boundary ' + endMarker + ' was not found after ' + startMarker + '.');
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

function replaceOnce(source, filename, needle, replacement) {
  const matches = count(source, needle);
  if (matches !== 1) {
    throw new Error(filename + ': expected one cut seam for ' + needle + '; found ' + matches + '.');
  }
  return source.replace(needle, replacement);
}

/**
 * Apply narrow, in-memory frontend cuts for the loopback ablation profile.
 * Vendor files under reference/ are read-only; callers serve the returned text.
 */
export function transformCutScript(filename, source) {
  if (typeof filename !== 'string' || typeof source !== 'string') {
    throw new TypeError('Cut transform expects a filename and source text.');
  }
  const basename = filename.split(/[\\/]/).pop();
  if (basename === MAIN_BUNDLE) {
    let transformed = source;
    transformed = replaceRegion(transformed, basename,
      'function rht(){', 'function h0s(t={})', 'function rht(){}');
    transformed = replaceRegion(transformed, basename,
      'function e2r(){', 'function t2r()', 'function e2r(){}');
    transformed = replaceRegion(transformed, basename,
      'function Kut(t){', 'const fcs=', 'function Kut(){}');
    transformed = replaceOnce(transformed, basename,
      'OIa=Axs.initSession',
      'OIa=()=>Promise.resolve({ok:!1,reason:"tracking_disabled"})');
    return transformed;
  }
  if (basename === CANVAS_BUNDLE) {
    let transformed = source;
    transformed = replaceRegion(transformed, basename,
      'LF=()=>{const e=Ks(a=>a.isOpen)', ',Xa=({node:', 'LF=()=>window.__LCOS_CUSTOM_PANEL__?.render(r)||null');
    transformed = replaceRegion(transformed, basename,
      'function PB(e){', 'function DB({canvasId:e})', 'function PB(){}');
    return transformed;
  }
  return source;
}
