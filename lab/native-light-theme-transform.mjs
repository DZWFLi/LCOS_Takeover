import path from 'node:path';
import { parseOriginalDonorScript } from './agent-node-transform.mjs';

const pageAsset = 'page-Da_DfwiK.js';
const chatAsset = 'agent-host-provider-uVo_bky5.js';
const contentAsset = 'course-api-base-url-CifxI1ia.js';
const sharedAsset = 'index-BAQXnPag.js';
const controlsAsset = 'UnlimitedModeToggle-D4wysAbz.js';
const themeLink = '<link rel="stylesheet" href="/native-light-theme.css" data-lcos-native-light-theme>';
const themeMarker = '\n/* LCOS native light paint adaptation. */\n';

/** First paint and the actual document theme change together; no dark flash,
 * second overlay, image inversion, or application theme store is introduced. */
export function transformNativeLightThemeHtml(html) {
  if (typeof html !== 'string') throw new TypeError('Native theme HTML must be text.');
  let result = html.replace(/<(html|body)\b([^>]*)>/gi, (_whole, tag, attributes) => {
    let attrs = attributes.replace(/\s+data-lcos-theme="[^"]*"/g, '').replace(/\s+data-theme="[^"]*"/g, '');
    const classes = /\sclass="([^"]*)"/.exec(attrs);
    const names = (classes?.[1] ?? '').split(/\s+/).filter(name => name && name !== 'dark' && name !== 'light');
    names.push('light');
    if (classes) attrs = attrs.replace(classes[0], ' class="' + names.join(' ') + '"');
    else attrs += ' class="light"';
    return '<' + tag + attrs + ' data-theme="light"' + (tag.toLowerCase() === 'html' ? ' data-lcos-theme="light"' : '') + '>';
  }).replace(/(<meta\s+name="theme-color"\s+content=")[^"]*("\s*\/?>)/i, '$1#FAFAFA$2')
    .replace('background: #000;', 'background: #FAFAFA;');
  if (!result.includes('data-lcos-native-light-theme')) result = result.replace('</head>', themeLink + '\n</head>');
  return result;
}

function walk(root, callback) {
  const queue = [root];
  while (queue.length) {
    const node = queue.pop(); if (!node?.type) continue;
    callback(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) queue.push(...value.filter(child => child?.type));
      else if (value?.type) queue.push(value);
    }
  }
}
function nameOf(property) { return !property.computed ? property.key?.name ?? property.key?.value : undefined; }
function topLevelOwners(program) {
  return program.body.flatMap(statement => {
    const item = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    return item?.type === 'VariableDeclaration'
      ? item.declarations
      : item?.type === 'FunctionDeclaration' ? [item] : [];
  });
}
function ownerName(node) { return node.id?.name; }
const paint = new Map([
  ['#0f0f0f', 'background'], ['#0a0a0a', 'background-canvas'], ['#121212', 'chat-background'],
  ['#141414', 'chat-background'], ['#171717', 'card'], ['#181818', 'card'], ['#18181b', 'card'],
  ['#191919', 'card'], ['#1a1a1a', 'chat-bubble-header'], ['#1c1c1c', 'sidebar'],
  ['#1d1d1d', 'card'], ['#1d1f21', 'card'], ['#1f1f1f', 'card'], ['#222', 'secondary'],
  ['#222222', 'secondary'], ['#242424', 'accent'], ['#262626', 'popover'], ['#27272a', 'popover'],
  ['#2b2b2b', 'muted'], ['#2e2e2e', 'chat-bubble-surface'], ['#303030', 'accent'], ['#333333', 'accent'],
  ['#272729', 'popover'], ['#2f2f2f', 'popover'], ['#1b1b1c', 'popover'], ['#21191a', 'popover'],
]);

// These are the shipped UI owners, not a whole-module recolour. The native
// image/Collection renderers and their media/illustration paint stay excluded.
export const nativeLightThemeOwnerNames = {
  [pageAsset]: new Set(['jF', 'CU', 'Zp', 'IS', 'LS', 'iF', 'oF', 'TS', 'rU', 'Kn', 'uU', 'hU', 'fU',
    'fH', 'l9', 'r9', '$H', 'rE', 'GH', 'WH', 'nE', 'iE', 'n9', 'YH', 't2']),
  [contentAsset]: new Set(['yBe', 'UVe', 'Lw', 'TK', 'c2', 'vZ', 'uZ', 'gT', 'XO', 'gm', 'vY',
    'SY', 'EY', 'UX', 't2', 'Cd', 'cS', 'DY', 'LY', 'QO', 'Vde', 'Hde']),
  [sharedAsset]: new Set(['dc', '$is', 'IQe']),
  [controlsAsset]: new Set(['pO', 'lC', 'cl']),
};

function utilityParts(token) {
  let depth = 0, split = 0;
  for (let index = 0; index < token.length; index += 1) {
    if (token[index] === '[' || token[index] === '(') depth += 1;
    else if (token[index] === ']' || token[index] === ')') depth -= 1;
    else if (token[index] === ':' && depth === 0) split = index + 1;
  }
  const prefix = token.slice(0, split), raw = token.slice(split);
  return { prefix, important: raw.startsWith('!') ? '!' : '', utility: raw.replace(/^!/, '') };
}

/** Translate literal chrome paint into the same semantic tokens already used
 * by TapNow. Never touch media src/data, graph geometry, animation, or identity. */
export function nativeLightClassNames(value) {
  const inverseControl = value.split(/\s+/).some(token => {
    const utility = token.replace(/^(?:(?:hover|focus|active|disabled):)+/, '');
    const match = /^bg-(?:primary|destructive|foreground|(?:blue|sky|cyan|red|rose)-(?:500|600|700|800|900|950))(?:\/(\d+))?$/.exec(utility);
    return match && (match[1] === undefined || Number(match[1]) >= 70);
  });
  const whiteButton = /(?:^|\s)bg-white(?:\/(?:[7-9]\d|100))?(?:\s|$)/.test(value) && /(?:^|\s)text-(?:black|\[#(?:171717|1f1f1f)\])(?:\s|$)/i.test(value);
  return value.split(/(\s+)/).map(token => {
    if (/^\s+$/.test(token)) return token;
    const { prefix, important, utility: originalUtility } = utilityParts(token);
    // The original dark variant remains dormant under the real light theme.
    if (prefix.split(':').includes('dark')) return token;
    let utility = originalUtility;
    if (whiteButton && /^bg-white(?:\/.*)?$/.test(utility)) utility = utility.replace('bg-white', 'bg-foreground');
    else if (whiteButton && /^text-(?:black|\[#(?:171717|1f1f1f)\])$/i.test(utility)) utility = 'text-background';
    else if (!inverseControl && /^text-white(?:\/.*)?$/.test(utility)) utility = utility.replace('text-white', 'text-foreground');
    else if (/^(?:border(?:-[trblxy])?|ring|outline|divide)-white(?:\/.*)?$/.test(utility)) utility = utility.replace('-white', '-foreground');
    else if (/^bg-white\/.+$/.test(utility)) utility = utility.replace('bg-white', 'bg-foreground');
    else if (utility === 'bg-black') utility = 'bg-background';
    else if (/^bg-black\/.+$/.test(utility)) utility = utility.replace('bg-black', 'bg-foreground');
    else if (/^bg-\[radial-gradient\(.*rgba\(18,18,18,0\.96\).*\)\]$/.test(utility)) utility = 'bg-[var(--lcos-native-panel-gradient)]';
    else if (/^(bg|border)-\[oklch\((?:20|31)%_0\.008_250\)\]$/.test(utility)) utility = utility.startsWith('bg-') ? 'bg-popover' : 'border-border';
    else if (/^(bg|text|border)-(?:zinc|neutral|gray|slate)-(\d+)(\/.*)?$/.test(utility)) {
      const neutral = /^(bg|text|border)-(?:zinc|neutral|gray|slate)-(\d+)(\/.*)?$/.exec(utility);
      const shade = Number(neutral[2]), suffix = neutral[3] ?? '';
      if (neutral[1] === 'bg' && shade >= 500) utility = 'bg-popover' + suffix;
      else if (neutral[1] === 'text') utility = (shade <= 300 || shade >= 700 ? 'text-foreground' : 'text-muted-foreground') + suffix;
      else if (neutral[1] === 'border' && shade >= 500) utility = 'border-border' + suffix;
    }
    else {
      const rgba = /^(bg|text|border)-\[rgba\((\d+),(\d+),(\d+),([\d.]+)\)\]$/.exec(utility);
      if (rgba && rgba[2] === rgba[3] && rgba[3] === rgba[4]) {
        if (rgba[1] === 'bg' && Number(rgba[2]) <= 48) utility = 'bg-card/[' + rgba[5] + ']';
        else if (Number(rgba[2]) === 255 && !inverseControl) utility = rgba[1] + '-foreground/[' + rgba[5] + ']';
      }
      const literal = /^(bg|text|border)-\[(#[0-9a-fA-F]{3,8})\](\/.*)?$/.exec(utility);
      if (literal) {
        const color = literal[2].toLowerCase(), suffix = literal[3] ?? '';
        if (literal[1] === 'bg' && paint.has(color)) utility = 'bg-' + paint.get(color) + suffix;
        else if (literal[1] === 'text' && ['#fff', '#ffffff', '#fafafa', '#f5f5f5', '#f0f0f0', '#e6e6e6', '#e5e5e5', '#d4d4d8', '#cccccc', '#ccc'].includes(color) && !inverseControl) utility = 'text-foreground' + suffix;
        else if (literal[1] === 'text' && ['#a8a8a8', '#a3a3a3', '#9c9c9c', '#7a7a7a', '#737373'].includes(color)) utility = 'text-muted-foreground' + suffix;
      }
    }
    // A light status panel needs dark red copy; retain the original red status.
    if (/^text-red-(?:50|100|200)(?:\/.*)?$/.test(utility)) utility = 'text-destructive';
    return prefix + important + utility;
  }).join('');
}

function replacePaintSeam(source, original, adapted, label) {
  if (source.includes(adapted) && !source.includes(original)) return source;
  if (source.split(original).length !== 2) throw new Error('Original native ' + label + ' paint seam changed.');
  return source.replace(original, adapted);
}

function nativeLightInlinePaint(value, property) {
  if (property === 'scrollbarColor' && value === 'rgba(255,255,255,0.22) transparent')
    return 'color-mix(in srgb, var(--foreground) 22%, transparent) transparent';
  if (property === 'color') {
    const match = /^rgba\(255,\s*255,\s*255,\s*([\d.]+)\)$/.exec(value);
    if (match) return `color-mix(in srgb, var(--foreground) ${Math.max(70, Number(match[1]) * 100)}%, transparent)`;
  }
  if (property === 'border') return value.replace(/var\(--Line-Primary,\s*#FFFFFF14\)/i, 'var(--border)');
  return value;
}

/** Final served-JS transform, after slot extraction. Only known native chrome
 * owners get literal-to-token conversion; Collection renderers are excluded. */
export function transformNativeLightThemeScript(filename, source) {
  const asset = path.basename(filename);
  if (![pageAsset, chatAsset, contentAsset, sharedAsset, controlsAsset].includes(asset)) return source;
  if (source.endsWith(themeMarker)) return source;
  let result = source;
  if (asset === pageAsset) {
    result = replacePaintSeam(result,
      'r.jsx(Qk,{color:"rgba(255, 255, 255, 0.3)",bgColor:"rgba(0,0,0)"})',
      'r.jsx(Qk,{color:"var(--lcos-canvas-dot)",bgColor:"var(--background-canvas)"})', 'canvas Background');
    result = replacePaintSeam(result, 'rd={backgroundColor:"#171717"}', 'rd={backgroundColor:"var(--card)"}', 'header background');
    result = replacePaintSeam(result, 'id="hover:!bg-[#242424]"', 'id="lcos-native-light-hover"', 'header hover');
  }
  if (asset === contentAsset) {
    result = replacePaintSeam(result, 'sF="rgba(90,90,99,0.5)"', 'sF="var(--lcos-minimap-node)"', 'MiniMap neutral node');
    result = replacePaintSeam(result, 'rF="rgba(255,255,255,0.6)"', 'rF="var(--lcos-minimap-node-border)"', 'MiniMap node rim');
    result = replacePaintSeam(result, 'bgColor:"rgba(24,24,27,0.92)"', 'bgColor:"var(--popover)"', 'MiniMap background');
    result = replacePaintSeam(result, 'border:"1.5px solid rgba(255, 255, 255, 1)",backgroundColor:"rgba(0,0,0,0.1)",boxShadow:"0 0 0 9999px rgba(0,0,0,0.22)"',
      'border:"1.5px solid var(--lcos-minimap-viewport)",backgroundColor:"var(--lcos-minimap-viewport-fill)",boxShadow:"0 0 0 9999px var(--lcos-minimap-outside)"', 'MiniMap viewport');
    result = replacePaintSeam(result,
      'Kq="radial-gradient(ellipse 165.86% 163.75% at 50% 15%, #1A1A1A 0%, #282828 35.54%, #464847 67.77%, #656766 100%)"',
      'Kq="var(--lcos-native-control-gradient)"', 'viewer control gradient');
  }
  const program = parseOriginalDonorScript(result, asset);
  const owners = topLevelOwners(program).filter(node => asset === chatAsset
    || nativeLightThemeOwnerNames[asset]?.has(ownerName(node))
    || /^LCOSNative(?:Media|TextViewer|Viewer)/.test(ownerName(node) ?? ''));
  const edits = new Map();
  for (const owner of owners) walk(owner, node => {
    if (node.type === 'ObjectProperty' && nameOf(node) === 'style' && node.value?.type === 'ObjectExpression') {
      for (const item of node.value.properties) {
        if (item.type !== 'ObjectProperty' || item.value?.type !== 'StringLiteral') continue;
        const next = nativeLightInlinePaint(item.value.value, nameOf(item));
        if (next !== item.value.value) edits.set(item.value.start, { start: item.value.start, end: item.value.end, text: JSON.stringify(next) });
      }
    }
    // Card variants and the text-toolbar class helper are class-only owners.
    // Their strings are outside JSX className but still paint, not domain data.
    if (['$is', 'cS', 'cl'].includes(ownerName(owner)) && node.type === 'StringLiteral') {
      const next = nativeLightClassNames(node.value);
      if (next !== node.value) edits.set(node.start, { start: node.start, end: node.end, text: JSON.stringify(next) });
    }
    if (asset === sharedAsset && ownerName(owner) === 'dc' && node.type === 'ObjectProperty'
      && nameOf(node) === 'theme' && node.value?.type === 'StringLiteral' && node.value.value === 'dark') {
      edits.set(node.value.start, { start: node.value.start, end: node.value.end, text: '"light"' });
    }
    if (node.type !== 'ObjectProperty' || !['className', 'containerClassName', 'contentClassName', 'overlayClassName'].includes(nameOf(node))) return;
    walk(node.value, value => {
      if (value.type !== 'StringLiteral') return;
      const next = nativeLightClassNames(value.value);
      if (next !== value.value) edits.set(value.start, { start: value.start, end: value.end, text: JSON.stringify(next) });
    });
  });
  for (const edit of [...edits.values()].sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  return result + themeMarker;
}
