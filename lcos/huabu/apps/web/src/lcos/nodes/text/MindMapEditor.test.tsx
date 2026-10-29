import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MindMapEditor } from './MindMapEditor';
import { outlineRows, parseOutline } from './outlineTree';
let root: Root, host: HTMLDivElement;
const save = vi.fn(), cancel = vi.fn();
const key = (value: string, extra: KeyboardEventInit = {}) => act(() => window.dispatchEvent(new KeyboardEvent('keydown', {key:value,bubbles:true,cancelable:true,...extra})));
const topic = (text: string) => [...document.querySelectorAll<SVGGElement>('g.lcos-mindmap-topic')].find((g) => g.textContent === text);
const click = (text: string) => act(() => topic(text)?.dispatchEvent(new MouseEvent('click',{bubbles:true})));
beforeEach(() => {
  save.mockReset(); cancel.mockReset(); save.mockResolvedValue(true);
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
  act(() => root.render(<MindMapEditor title="中文根" outline={'- 分支\n  - 子孙\n- 同级'} onSave={save} onCancel={cancel}/>));
});
afterEach(() => {act(() => root.unmount());host.remove();});
describe('mature map editing through one canonical save owner', () => {
  it('copies and cuts entire subtrees without duplicate keys or leaking Delete into canvas', async () => {
    const canvasDelete=vi.fn();window.addEventListener('keydown',canvasDelete);
    click('分支');key('c',{ctrlKey:true});key('v',{ctrlKey:true});
    expect(document.querySelectorAll('g.lcos-mindmap-topic')).toHaveLength(6);
    key('x',{ctrlKey:true});
    expect(document.querySelectorAll('g.lcos-mindmap-topic')).toHaveLength(4);
    click('同级');key('Delete'); expect(canvasDelete).not.toHaveBeenCalled();
    window.removeEventListener('keydown',canvasDelete);
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="保存导图"]')?.click());
    const rows=outlineRows(parseOutline(save.mock.calls[0]?.[0].body));
    expect(rows.map((row)=>row.node.text)).toEqual(['分支','子孙']);
    expect(new Set(rows.map((row)=>row.node.id)).size).toBe(rows.length);
  });
  it('commits the current graph input and keeps its draft when canonical save is unconfirmed', async () => {
    save.mockResolvedValue(false);
    act(() => topic('分支')?.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})));
    const input=document.querySelector<HTMLInputElement>('.mindmap-editor input');if(!input)throw new Error('Missing graph input');
    act(() => {const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;setter?.call(input,'修改中文');input.dispatchEvent(new Event('input',{bubbles:true}));});
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="保存导图"]')?.click());
    expect(save.mock.calls[0]?.[0].body).toContain('修改中文');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('草稿仍保留');
    expect(cancel).not.toHaveBeenCalled();
  });
  it('adds a child with Tab and lifts it with Shift+Tab', async () => {
    click('同级');key('Tab');
    const input=document.querySelector<HTMLInputElement>('.mindmap-editor input');if(!input)throw new Error('Missing new child input');
    act(() => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set?.call(input,'新子级');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));});
    key('Tab',{shiftKey:true});
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="保存导图"]')?.click());
    expect(outlineRows(parseOutline(save.mock.calls[0]?.[0].body)).find((row) => row.node.text === '新子级')?.depth).toBe(0);
  });
});
