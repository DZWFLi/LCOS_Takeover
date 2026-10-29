import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';

import {LcosLocatorCluster} from './LcosLocatorCluster';

import type {DensityLocator} from './locatorDensity';

const roots:ReturnType<typeof createRoot>[]=[];
afterEach(()=>{for(const root of roots.splice(0))act(()=>root.unmount());document.body.replaceChildren();});
it('group and leaf entries dispatch exact existing target ids, with no second camera or marker identity',async()=>{
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const members:DensityLocator[]=Array.from({length:9},(_,i)=>({id:`node-${i}`,label:`材料${i}`,x:980,y:300,surface:'main',phase:'edge',edge:'right',selected:false,groupKey:'references',groupLabel:'参考'}));
  const locate=vi.fn();const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push(root);
  await act(async()=>root.render(<LcosLocatorCluster id="cluster" x={970} y={300} members={members} expanded onExpandedChange={()=>{}} onLocate={locate} surface="main"/>));
  expect(document.querySelectorAll('[data-lcos-locator-fan-leaf]')).toHaveLength(6);
  expect(document.body.textContent).toContain('另有 3 项');
  await act(async()=>document.querySelector<HTMLButtonElement>('[data-lcos-locator-fan-leaf="node-3"]')?.click());
  expect(locate).toHaveBeenLastCalledWith(['node-3']);
  await act(async()=>document.querySelector<HTMLButtonElement>('[data-lcos-locator-fan-group="references"]')?.click());
  expect(locate).toHaveBeenLastCalledWith(members.map(member=>member.id));
});
