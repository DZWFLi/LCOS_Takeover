import { parseOriginalDonorScript } from './agent-node-transform.mjs';

const pageAsset = 'page-Da_DfwiK.js';
const controlsAsset = 'UnlimitedModeToggle-D4wysAbz.js';
const narrow = 'typeof window!=="undefined"&&window.matchMedia("(max-width: 640px)").matches';
function walk(node, visit) {
  if (!node?.type) return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'tokens', 'comments'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value?.type) walk(value, visit);
  }
}
function one(root, predicate, label) {
  const matches = []; walk(root, node => { if (predicate(node)) matches.push(node); });
  if (matches.length !== 1) throw new Error('Native shell ' + label + ' is unavailable.');
  return matches[0];
}
const property = (object, name) => object?.properties?.find(item => (item.key?.name ?? item.key?.value) === name);
const jsx = (node, name) => node.type === 'CallExpression' && node.arguments?.[0]?.name === name;

/** Keep the existing canvas, menus and original state owner. The offline shell
 * does not expose cloud commerce or suggestions that target the donor input. */
export function transformNativeShellControlsScript(filename, source) {
  const asset = filename.split(/[\\/]/).pop();
  if (![pageAsset, controlsAsset].includes(asset) || source.includes('/* lcos-native-shell-controls */')) return source;
  const program = parseOriginalDonorScript(source, filename), edits = [];
  const replace = (node, text) => edits.push({ start: node.start, end: node.end, text });
  if (asset === controlsAsset) {
    const store = one(program, node => node.type === 'VariableDeclarator' && node.id?.name === 'Le', 'chat visibility owner');
    const initial = one(store, node => node.type === 'ObjectProperty' && (node.key?.name ?? node.key?.value) === 'isOpen'
      && node.value?.type === 'CallExpression' && node.value.callee?.name === '$C', 'chat initial visibility');
    replace(initial.value, '(' + narrow + ')?!1:$C()');
    const count = one(store, node => node.type === 'ObjectProperty' && node.key?.name === 'incrementCanvasOpenCount', 'chat visit opening');
    const open = one(count, node => node.type === 'BinaryExpression' && node.operator === '<=' && node.right?.name === 'hy', 'automatic chat opening');
    replace(open, '(' + source.slice(open.start, open.end) + ')&&!(' + narrow + ')');
  } else {
    // Only the original plus-menu rows are disconnected. Imported media and the
    // independent editor rail retain their existing readers and actions.
    const rail = one(program, node => node.type === 'VariableDeclarator' && node.id?.name === 'fH', 'plus menu owner');
    const section = key => one(rail, node => {
      if (!jsx(node, 'ms')) return false;
      const heading = property(node.arguments[1], 'heading')?.value;
      return property(heading?.arguments?.[1], 'children')?.value?.arguments?.[0]?.value === key;
    }, 'plus menu section ' + key);
    const addBlock = section('nodes.addBlock'), utilities = section('dock.utilities');
    const addRows = property(addBlock.arguments[1], 'children')?.value;
    if (addRows?.type !== 'ArrayExpression') throw new Error('Native shell plus menu rows are unavailable.');
    for (const key of ['imageNode', 'videoNode', 'audioNode', 'worldNode', 'playlistNode', 'threeDStudioNode', 'imageEditorNode']) {
      const item = one(rail, node => {
        if (!jsx(node, 'ss')) return false;
        const props = node.arguments[1], label = property(props, 'label')?.value;
        if (label?.type !== 'CallExpression' || label.arguments[0]?.value !== 'nodes.' + key) return false;
        return key !== 'imageEditorNode' || property(props, 'testid')?.value?.property?.name === 'ADD_IMAGE_EDITOR_NODE_BTN';
      }, 'disconnected plus menu ' + key);
      if (item.start >= utilities.start && item.end <= utilities.end) continue;
      // Remove this row's tooltip/restriction wrapper too, so it cannot leave
      // an empty trigger or a floating upgrade badge in the original menu.
      const wrapper = addRows.elements.filter(row => row && row.start <= item.start && row.end >= item.end);
      if (wrapper.length !== 1) throw new Error('Native shell plus menu wrapper ' + key + ' is unavailable.');
      replace(wrapper[0], 'null');
    }
    replace(utilities, 'null');
    const suggestions = one(program, node => node.type === 'VariableDeclarator' && node.id?.name === 'MF', 'collapsed assistant');
    const load = one(suggestions, node => node.type === 'CallExpression' && node.callee?.name === 'RF', 'donor suggestions');
    replace(load.arguments[1], '!1');

    // Keep MF's actual button, state and motion; only expose its original
    // containing-block bottom offset to the shared screen-layout observer.
    const floatingAssistant = one(suggestions, node => node.type === 'CallExpression'
      && property(node.arguments?.[1], 'data-pile-gallery-chrome')?.value?.value === 'bottom-right', 'collapsed assistant wrapper');
    const floatingProps = floatingAssistant.arguments[1];
    if (property(floatingProps, 'style')) throw new Error('Native assistant wrapper already owns an unknown inline layout.');
    edits.push({ start: floatingProps.end - 1, end: floatingProps.end - 1,
      text: ',"data-lcos-native-collapsed-assistant":true,style:{bottom:"var(--lcos-native-assistant-bottom,24px)"}' });

    const toolbar = one(program, node => node.type === 'CallExpression'
      && property(node.arguments?.[1], 'data-pile-gallery-chrome')?.value?.value === 'top-right', 'top toolbar');
    const row = one(toolbar, node => node.type === 'ObjectProperty' && node.key?.name === 'children'
      && node.value?.type === 'ArrayExpression' && node.value.elements.some(item => jsx(item, 'fV')), 'top toolbar row');
    for (const [label, matches] of [
      ['credits', item => source.slice(item.start, item.end).includes('trackCheckTapiesButtonClicked')],
      ['community', item => source.slice(item.start, item.end).includes('Te("community")')],
      ['cloud sharing', item => { let found = false; walk(item, child => { if (jsx(child, 'k7')) found = true; }); return found; }],
    ]) {
      const slot = row.value.elements.filter(item => item && matches(item));
      if (slot.length !== 1) throw new Error('Native shell ' + label + ' slot is unavailable.');
      replace(slot[0], 'null');
    }
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  const result = source + '\n/* lcos-native-shell-controls */\n';
  parseOriginalDonorScript(result, filename);
  return result;
}
