import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { transformNativeColorPinCourseScript as transform } from '../lab/native-colorpin-course-transform.mjs';

const root = path.resolve(import.meta.dirname, '..'), dep = createRequire(path.join(installedRoot, 'huabu/apps/web/package.json'));
const React = dep('react'), jsx = dep('react/jsx-runtime'), { createRoot } = dep('react-dom/client'), { Window } = dep('happy-dom');
const ts = createRequire(path.join(installedRoot, 'package.json'))('typescript');
const output = path.join(root, 'output/原生ColorPin整合_20261017h'); await fs.mkdir(output, { recursive: true });
const report = { passed: false, scope: 'actual original Dg/Hie/jie/Lie/Gie/Iie/Oie source in React, actual native status component; controlled Popover/button/translation/Pin command leaves, not actual Radix or full App',
  candidateWrites: 0, coreWrites: 0, models: 0, checks: [] };
const dom = new Window({ url: 'http://127.0.0.1:1/' });
const names = ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'IS_REACT_ACT_ENVIRONMENT'];
const saved = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
for (const name of names.slice(0, -1)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? dom : dom[name] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let mounted;
try {
  const filename = 'course-api-base-url-CifxI1ia.js', source = transform(filename, await fs.readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets', filename), 'utf8'));
  const declarations = new Map(parse(source, filename).body.flatMap(node => node.type === 'FunctionDeclaration' ? [[node.id.name, node]]
    : node.type === 'VariableDeclaration' ? node.declarations.map(value => [value.id?.name, value]) : []));
  const code = ['Oie', 'Lie', 'jie', 'Gie', 'Hie', 'Iie'].map(name => { const node = declarations.get(name); assert.ok(node, name);
    return (node.type === 'FunctionDeclaration' ? '' : 'const ') + source.slice(node.start, node.end) + ';'; }).join('\n');
  const palette = [['F0606B', 'red'], ['F4A14B', 'orange'], ['EDC63D', 'yellow'], ['4FC978', 'green'], ['4EA8FF', 'blue'], ['A55CF0', 'purple']]
    .map(([id, name]) => ({ id, hex: '#' + id, nameKey: name }));
  const choices = [...palette, { id: '123ABC', hex: '#123ABC', label: '已有自定义色' }], toggles = [];
  let checks = 0, state = { managed: true, enabled: true, disabled: false, triggerDisabled: false, needsCheck: false, notice: '', check: async () => { checks++; } };
  const popoverContext = React.createContext(null), Fragment = ({ children }) => children;
  const Root = ({ open, onOpenChange, children }) => React.createElement(popoverContext.Provider, { value: { open, onOpenChange } }, children);
  const Trigger = ({ children }) => { const popover = React.useContext(popoverContext); return React.cloneElement(children, {
    onClick: event => { children.props.onClick?.(event); if (!event.defaultPrevented) popover.onOpenChange(!popover.open); },
  }); };
  const Content = ({ children, onCloseAutoFocus, onKeyDownCapture, onPointerDownCapture, onPointerDownOutside, side, align, sideOffset, ...props }) => {
    const popover = React.useContext(popoverContext); React.useEffect(() => {
      if (!popover.open) return; return () => onCloseAutoFocus?.({ preventDefault() {} });
    }, [popover.open]);
    return popover.open ? React.createElement('div', { ...props, role: 'dialog', onKeyDownCapture,
      onKeyDown: event => { if (event.key === 'Escape') popover.onOpenChange(false); } }, children) : null;
  };
  const NativeStatusSource = await fs.readFile(path.join(root, 'lab/pilot/native-colorpin-port.tsx'), 'utf8');
  const statusProgram = ts.createSourceFile('status.tsx', NativeStatusSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const statusFn = statusProgram.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'NativeColorPinNodeStatus');
  assert.ok(statusFn); const compiled = ts.transpileModule(statusFn.getText(statusProgram), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const statusModule = { exports: {} }; new Function('require', 'exports', compiled)(name => dep(name), statusModule.exports);
  const env = { d: React, a: jsx, Jc: palette, Me: () => ({ t: value => value, i18n: { resolvedLanguage: 'en' } }),
    LCOSUseNativeColorPinChoices: () => choices, NativeColorPinNodeStatus: statusModule.exports.NativeColorPinNodeStatus,
    LW: () => 'en', Vie: { en: ', ' }, Ra: ({ children, variant, size, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    to: Root, _n: Fragment, no: Trigger, so: Content,
    ee: (...values) => values.filter(Boolean).join(' '), ni: () => React.createElement('svg', { 'data-original-check-icon': true }),
    FW: () => React.createElement('svg', { 'data-original-moving-pin-icon': true }), Bie: () => React.useRef(null),
    kM: (index, count, x, y) => ({ x: index * x, y: index * y }) };
  const actual = new Function(...Object.keys(env), code + '\nreturn{Hie,Iie};')(...Object.values(env));
  const outlet = document.createElement('div'); document.body.append(outlet); mounted = createRoot(outlet);
  const render = async () => React.act(async () => mounted.render(React.createElement(actual.Hie, { pins: ['123ABC'], disabled: state.triggerDisabled,
    lcosNative: state, onToggle: key => toggles.push(key) })));
  const click = async element => React.act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  await render(); let trigger = document.querySelector('[data-pin-popover-open] button'); assert.ok(trigger && !trigger.disabled);
  await click(trigger); let popover = document.querySelector('[data-native-colorpin-popover]'); assert.ok(popover);
  assert.equal(popover.querySelectorAll('button[aria-pressed]').length, 7);
  let custom = popover.querySelector('button[aria-label="已有自定义色"]'); assert.ok(custom); assert.equal(custom.getAttribute('aria-pressed'), 'true');
  assert.ok(document.querySelector('[data-pin-color="123ABC"]'), 'Original moving icon keeps existing non-six-color dot');
  await click(custom); assert.deepEqual(toggles, ['123ABC']);
  report.checks.push('actual original Popover shows six default plus existing custom color and original Gie moving-dot markup; one original dot click dispatches once');
  state = { ...state, disabled: true, needsCheck: true, notice: '标记结果尚未确认，请核对。' }; await render();
  assert.ok([...document.querySelectorAll('[data-native-colorpin-popover] button[aria-pressed]')].every(button => button.disabled));
  const check = [...document.querySelectorAll('button')].find(button => button.textContent === '核对标记结果'); assert.ok(check && !check.disabled);
  await click(check); assert.equal(checks, 1); assert.equal(toggles.length, 1);
  await React.act(async () => popover.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  assert.equal(document.querySelector('[data-native-colorpin-popover]'), null);
  trigger = document.querySelector('[data-pin-popover-open] button'); assert.equal(trigger.disabled, false);
  assert.equal(document.activeElement, trigger, 'Actual original Oie close autofocus returns to original trigger');
  await click(trigger); assert.ok(document.querySelector('[data-native-colorpin-popover]'));
  assert.ok([...document.querySelectorAll('button')].some(button => button.textContent === '核对标记结果'));
  assert.equal(toggles.length, 1); report.checks.push('unknown disables every dot but keeps original trigger reopenable; original Oie Escape focus returns, reopened same Popover retains GET-check action and dispatches no extra mutation');
  state = { ...state, disabled: true, needsCheck: false, triggerDisabled: true, notice: '' }; await render();
  trigger = document.querySelector('[data-pin-popover-open] button'); assert.equal(trigger.disabled, true);
  report.checks.push('busy uses actual native disabled button; no new popover, toolbar or HUD owner');
  report.passed = true;
} catch (error) { report.error = String(error.stack ?? error); throw error; }
finally {
  if (mounted) await React.act(async () => mounted.unmount());
  for (const name of names) if (saved[name]) Object.defineProperty(globalThis, name, saved[name]); else delete globalThis[name];
  dom.happyDOM.abort(); await fs.writeFile(path.join(output, '原色点Popover实际组件.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ passed: report.passed, checks: report.checks, output }));
