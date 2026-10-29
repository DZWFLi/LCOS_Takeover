import { parseOriginalDonorScript } from './agent-node-transform.mjs';

const TARGET = 'agent-host-provider-uVo_bky5.js';
const BEFORE = 'LCOSRenderBeforeMessage';
const AFTER = 'LCOSRenderAfterMessages';

function walk(root, visitor) {
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node.type !== 'string') continue;
    visitor(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) { for (const child of value) if (child?.type) pending.push(child); }
      else if (value?.type) pending.push(value);
    }
  }
}

function one(items, description) {
  if (items.length !== 1) throw new Error(`Native Chat messages seam changed: expected one ${description}, found ${items.length}.`);
  return items[0];
}

function matching(root, predicate) {
  const found = [];
  walk(root, node => { if (predicate(node)) found.push(node); });
  return found;
}

function property(object, name) {
  return object?.properties?.find(entry => entry.type === 'ObjectProperty'
    && (entry.key?.name ?? entry.key?.value) === name);
}

function jsx(call) {
  return call?.type === 'CallExpression' && call.callee?.type === 'MemberExpression'
    && ['jsx', 'jsxs'].includes(call.callee.property?.name);
}

function ownerOf(program) {
  const owner = one(matching(program, node => node.type === 'VariableDeclarator' && node.id?.name === 'U5'), 'original U5 owner');
  if (owner.init?.type !== 'ArrowFunctionExpression' || owner.init.params.length !== 1
    || owner.init.params[0]?.type !== 'ObjectPattern') {
    throw new Error('Native Chat messages seam changed: U5 no longer has its original controlled props.');
  }
  const parameter = owner.init.params[0];
  for (const name of ['messages', 'canvasId', 'onLoadOlder', 'streamingMessageId']) {
    if (!property(parameter, name)) throw new Error(`Native Chat messages seam changed: original ${name} prop is missing.`);
  }
  return { owner, parameter };
}

function slotsOf(owner, source) {
  const wrapper = one(matching(owner.init.body, node => jsx(node)
    && property(node.arguments[1], 'data-chat-message-id')), 'original message wrapper');
  const messageId = property(wrapper.arguments[1], 'data-chat-message-id').value;
  const beforeChildren = property(wrapper.arguments[1], 'children')?.value;
  if (messageId?.type !== 'MemberExpression' || messageId.property?.name !== 'id'
    || beforeChildren?.type !== 'ArrayExpression') {
    throw new Error('Native Chat messages seam changed: original message identity/children are unavailable.');
  }
  one(matching(beforeChildren, node => jsx(node)
    && property(node.arguments[1], 'message')?.value?.name === messageId.object?.name), 'original per-message renderer');
  const anchor = one(matching(owner.init.body, node => jsx(node)
    && node.arguments[0]?.name === 'yh'
    && property(node.arguments[1], 'containerRef')), 'original message container anchor');
  const afterChildren = one(matching(owner.init.body, node => node.type === 'ArrayExpression'
    && node.elements.includes(anchor)), 'original message list children');
  const maps = afterChildren.elements.filter(node => node?.type === 'CallExpression'
    && node.callee?.type === 'MemberExpression' && node.callee.property?.name === 'map');
  one(maps, 'original message map');
  if (afterChildren.elements.indexOf(maps[0]) >= afterChildren.elements.indexOf(anchor)) {
    throw new Error('Native Chat messages seam changed: message anchor no longer follows the message map.');
  }
  return { beforeChildren, afterChildren, anchor, messageId: source.slice(messageId.start, messageId.end) };
}

function installedState(owner, parameter, slots, source) {
  const beforeProp = property(parameter, 'renderBeforeMessage');
  const afterProp = property(parameter, 'renderAfterMessages');
  const beforeCalls = matching(owner, node => node.type === 'OptionalCallExpression' && node.callee?.name === BEFORE);
  const afterCalls = matching(owner, node => node.type === 'OptionalCallExpression' && node.callee?.name === AFTER);
  const reserved = matching(owner, node => node.type === 'Identifier' && [BEFORE, AFTER].includes(node.name));
  if (!beforeProp && !afterProp && beforeCalls.length === 0 && afterCalls.length === 0 && reserved.length === 0) return false;
  const before = beforeCalls[0];
  const after = afterCalls[0];
  if (beforeProp?.value?.name !== BEFORE || afterProp?.value?.name !== AFTER
    || beforeCalls.length !== 1 || afterCalls.length !== 1
    || before?.optional !== true || after?.optional !== true
    || before.arguments.length !== 1 || source.slice(before.arguments[0].start, before.arguments[0].end) !== slots.messageId
    || after.arguments.length !== 0 || slots.beforeChildren.elements[0] !== before
    || slots.afterChildren.elements.indexOf(after) !== slots.afterChildren.elements.indexOf(slots.anchor) - 1) {
    throw new Error('Native Chat messages seam is partial or changed; both optional activity slots must be installed together.');
  }
  return true;
}

/** Add two controlled render slots inside the original U5 content/scroll owner.
 * The original hD, message renderer, anchors, contexts, pagination and scrolling
 * effects remain byte-identical. Omitted callbacks add no rendered UI. */
export function transformNativeChatMessagesScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== TARGET) return source;
  const program = parseOriginalDonorScript(source, filename);
  const { owner, parameter } = ownerOf(program);
  const slots = slotsOf(owner, source);
  if (installedState(owner, parameter, slots, source)) return source;
  const edits = [
    { start: parameter.end - 1, text: `,renderBeforeMessage:${BEFORE},renderAfterMessages:${AFTER}` },
    { start: slots.beforeChildren.start + 1, text: `${BEFORE}?.(${slots.messageId}),` },
    { start: slots.anchor.start, text: `${AFTER}?.(),` },
  ];
  let transformed = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) transformed = transformed.slice(0, edit.start) + edit.text + transformed.slice(edit.start);
  const installed = parseOriginalDonorScript(transformed, filename);
  const next = ownerOf(installed);
  if (!installedState(next.owner, next.parameter, slotsOf(next.owner, transformed), transformed)) {
    throw new Error('Native Chat messages activity slots were not installed.');
  }
  return transformed;
}
