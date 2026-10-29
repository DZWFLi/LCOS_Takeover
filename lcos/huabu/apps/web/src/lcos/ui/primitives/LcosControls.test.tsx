// @vitest-environment happy-dom
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LcosButton } from './LcosButton';
import { LcosIconButton } from './LcosIconButton';

import type { ReactNode } from 'react';
import type { Root } from 'react-dom/client';

let root: Root | undefined;
let host: HTMLDivElement | undefined;

async function render(node: ReactNode) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(node));
  return host;
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe('Oreo skin on the existing LCOS native controls', () => {
  it('leaves unmapped custom families unchanged', async () => {
    const element = await render(<LcosButton className="existing-hud">定位</LcosButton>);
    expect(element.querySelector('.existing-hud')).not.toBeNull();
    expect(element.querySelector('[data-lcos-control-skin]')).toBeNull();
    expect(element.querySelector('.lcos-oreo-face')).toBeNull();
  });

  it('keeps one action-owning native element and one visual face', async () => {
    const element = await render(<LcosButton appearance="oreo" variant="secondary">确认</LcosButton>);
    expect(element.querySelectorAll('button')).toHaveLength(1);
    expect(element.querySelectorAll('.lcos-oreo-face')).toHaveLength(1);
    expect(element.querySelector('button')?.getAttribute('data-lcos-control-type')).toBe('secondary');
    expect(element.querySelector('button')?.hasAttribute('appearance')).toBe(false);
  });

  it('forwards its ref, native attributes, and enabled callback', async () => {
    const ref = createRef<HTMLButtonElement>();
    const onClick = vi.fn();
    const element = await render(<LcosButton ref={ref} appearance="oreo" aria-label="取用" onClick={onClick}>取用</LcosButton>);
    expect(ref.current).toBe(element.querySelector('button'));
    expect(ref.current?.type).toBe('button');
    await act(async () => ref.current?.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not create a disabled-action success path', async () => {
    const onClick = vi.fn();
    const element = await render(<LcosIconButton appearance="oreo" variant="primary" disabled aria-label="提交" onClick={onClick}>↑</LcosIconButton>);
    const button = element.querySelector('button');
    expect(button?.disabled).toBe(true);
    await act(async () => button?.click());
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to type=button but preserves explicit submit', async () => {
    const element = await render(<><LcosButton appearance="oreo">普通操作</LcosButton><LcosButton appearance="oreo" type="submit">提交</LcosButton></>);
    expect([...element.querySelectorAll('button')].map((button) => button.type)).toEqual(['button', 'submit']);
  });

  it('uses explicit leading and trailing slots without replacing their assets', async () => {
    const element = await render(<LcosButton appearance="oreo" leadingIcon={<span data-leading />} trailingIcon={<span data-trailing />}>取用</LcosButton>);
    expect(element.querySelectorAll('.lcos-oreo-label-icon')).toHaveLength(2);
    expect(element.querySelector('[data-leading]')).not.toBeNull();
    expect(element.querySelector('[data-trailing]')).not.toBeNull();
    expect(element.querySelector('.lcos-oreo-label')?.textContent).toBe('取用');
  });

  it('maps destructive to the explicit Figma danger skin', async () => {
    const element = await render(<LcosButton appearance="oreo" variant="destructive">删除</LcosButton>);
    expect(element.querySelector('button')?.getAttribute('data-lcos-control-type')).toBe('destructive');
  });

  it('only activates the floating variant actually present in the kit', async () => {
    const element = await render(<><LcosIconButton appearance="oreo" variant="secondary" floating aria-label="次要浮动">+</LcosIconButton><LcosIconButton appearance="oreo" variant="primary" floating aria-label="主操作">+</LcosIconButton></>);
    expect(element.querySelectorAll('[data-lcos-control-floating="true"]')).toHaveLength(1);
  });

  it('keeps forwarded icon refs and explicit rectangle presentation', async () => {
    const ref = createRef<HTMLButtonElement>();
    const element = await render(<LcosIconButton appearance="oreo" shape="rectangle" ref={ref} aria-label="操作">+</LcosIconButton>);
    expect(ref.current).toBe(element.querySelector('button'));
    expect(ref.current?.getAttribute('data-lcos-control-shape')).toBe('rectangle');
  });
});
