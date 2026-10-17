import { beforeEach, expect, it } from 'vitest';

import { useLcosShellStore } from './lcosShellStore';
import { windowIdsForRegion } from './windowRegionTopology';
import { readerReturnWindowId } from '../professional/readerReturnWindow';

beforeEach(()=>{localStorage.clear();useLcosShellStore.getState().clear();useLcosShellStore.getState().setProject('reading-project');});
const state=()=>useLcosShellStore.getState();
it('three ordinary materials retain three exact Reader tabs in one region and keep reading positions',()=>{
  state().openReader('A','a',{revisionId:'old-a'});
  const firstRegion=state().windowRegions[0]!;
  state().setWindowRegionRect(firstRegion.id,{x:50,y:80,width:900,height:620});
  state().rememberReaderPosition('a:old-a',{scrollTop:280,zoom:1.25});
  state().openReader('B','b',{revisionId:'fixed-b'});state().openReader('C','c',{revisionId:'fixed-c'});
  expect(state().windowRegions).toHaveLength(1);expect(state().windows).toHaveLength(3);
  expect(windowIdsForRegion(state().windowRegions[0])).toHaveLength(3);
  expect(state().windowRegions[0]?.rect).toEqual({x:50,y:80,width:900,height:620});
  state().openReader('A again','a',{revisionId:'old-a'});
  expect(state().windows.find(window=>window.active)).toMatchObject({target:'a',readerRevisionId:'old-a'});
  expect(state().readerPositions['a:old-a']).toEqual({scrollTop:280,zoom:1.25});
});
it('source tracing opens in its original reading group and close-return preserves the originating tab',()=>{
  state().openReader('A','a');const a=state().windows[0]!;
  state().openReader('B','b',{revisionId:'old-b',returnToWindowId:a.id});
  const b=state().windows.find(window=>window.target==='b')!;
  expect(readerReturnWindowId(b,state().windows)).toBe(a.id);
  state().closeWindow(b.id);state().activateWindow(a.id);
  expect(state().windowRegions).toHaveLength(1);expect(state().windows).toMatchObject([{id:a.id,active:true}]);
});
it('ordinary opening does not collapse an explicit split and uses its active reading pane',()=>{
  state().openReader('A','a');state().openReader('B','b');
  const region=state().windowRegions[0]!;
  state().splitWindowRegion(region.id,'vertical');state().setWindowRegionSplitRatio(region.id,0.64);
  const activeGroup=state().windowRegions[0]!.activeGroupId;
  state().openReader('C','c');
  const after=state().windowRegions[0]!;
  expect(after.groups).toHaveLength(2);expect(after.splitDirection).toBe('vertical');expect(after.splitRatio).toBe(0.64);
  expect(after.groups.find(group=>group.id===activeGroup)?.windowIds).toHaveLength(2);
});
it('an explicit detached reader stays independent and subsequent reading joins the active detached group',()=>{
  state().openReader('A','a');state().openReader('B','b');
  state().ungroupWindowRegion(state().windowRegions[0]!.id);
  const b=state().windows.find(window=>window.target==='b')!,detached=state().windowRegions.find(region=>windowIdsForRegion(region).includes(b.id))!;
  state().openReader('C','c');
  expect(state().windowRegions).toHaveLength(2);
  expect(windowIdsForRegion(state().windowRegions.find(region=>region.id===detached.id))).toHaveLength(2);
});
it('a mixed Assembly/Reader group is not chosen as the default reading group',()=>{
  state().openWindow('assembly','材料库');const assemblyRegion=state().windowRegions[0]!;
  state().openReader('A','a');const readerRegion=state().windowRegions[1]!;
  state().groupWindowRegions(readerRegion.id,assemblyRegion.id);state().openReader('B','b');
  expect(state().windowRegions).toHaveLength(2);
  expect(windowIdsForRegion(state().windowRegions.find(region=>region.id===assemblyRegion.id))).toHaveLength(2);
});
it('project reopen restores the grouped exact versions and their active tab',()=>{
  state().openReader('A','a',{revisionId:'old-a'});state().openReader('B','b',{revisionId:'fixed-b'});
  const region=state().windowRegions[0]!;state().setProject('another');state().setProject('reading-project');
  expect(state().windowRegions[0]?.id).toBe(region.id);expect(state().windowRegions).toHaveLength(1);
  expect(state().windows.find(window=>window.active)).toMatchObject({target:'b',readerRevisionId:'fixed-b'});
});
