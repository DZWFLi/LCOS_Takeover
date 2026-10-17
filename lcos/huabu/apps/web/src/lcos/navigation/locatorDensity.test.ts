import {expect,it} from 'vitest';

import {locatorFanGroups,projectLocatorDensity} from './locatorDensity';

import type {DensityLocator} from './locatorDensity';

const marker=(id:string,x=970,y=300,overrides:Partial<DensityLocator>={}):DensityLocator=>({id,label:id,x,y,phase:'edge',edge:'right',surface:'main',selected:false,groupKey:'pin',groupLabel:'参考',...overrides});
it('clusters nearby real normal marks by edge/surface and breaks out selected targets',()=>{
  const projected=projectLocatorDensity([marker('one'),marker('two',970,320),marker('selected',970,310,{selected:true}),marker('other-edge',10,310,{edge:'left'})],1);
  expect(projected.filter(item=>item.kind==='marker').map(item=>item.kind==='marker'?item.marker.id:'')).toEqual(['selected','other-edge']);
  expect(projected.find(item=>item.kind==='cluster')).toMatchObject({members:[{id:'one'},{id:'two'}]});
});
it('uses zoom/screen density rather than an arbitrary marker count, without cross-surface grouping',()=>{
  expect(projectLocatorDensity([marker('a'),marker('b',970,360)],1)).toHaveLength(2);
  expect(projectLocatorDensity([marker('a'),marker('b',970,360)],.2)).toHaveLength(1);
  expect(projectLocatorDensity([marker('a'),marker('b',970,310,{surface:'context'})],.2)).toHaveLength(2);
});
it('fan exposes five semantic groups and six direct leaves, preserving all actual target ids in overflow',()=>{
  const members=Array.from({length:42},(_,i)=>marker(String(i),970,300,{groupKey:`group-${i%7}`,groupLabel:`组${i%7}`}));
  const groups=locatorFanGroups(members);expect(groups).toHaveLength(5);
  expect(groups.every(group=>group.members.length<=6)).toBe(true);
  expect(new Set(groups.flatMap(group=>group.allIds))).toEqual(new Set(members.map(item=>item.id)));
  expect(groups.at(-1)?.overflowCount).toBeGreaterThan(0);
});
