import { normalizeWindowRegion } from '../shell/windowRegionTopology';

import type { LcosWindow } from '../shell/lcosShellStore';
import type { WindowRegionInput } from '../shell/windowRegionTopology';

/** Ordinary reading adds a tab to the current reading group. Explicit split
 * panes and detached regions keep their own layout; mixed instrument groups
 * are never adopted as the default Reader destination. No new saved owner. */
export function readerOpeningGroup(windows:readonly Pick<LcosWindow,'id'|'bodyKey'|'active'>[],
  regions:readonly WindowRegionInput[],originWindowId?:string):{readonly regionId:string;readonly groupId:string} | undefined {
  const readers=new Set(windows.filter(window=>window.bodyKey==='reader').map(window=>window.id));
  const preferred=originWindowId && readers.has(originWindowId) ? originWindowId
    : windows.find(window=>window.active && window.bodyKey==='reader')?.id;
  const candidates=regions.flatMap(input=>{
    const region=normalizeWindowRegion(input);
    return [...region.groups].sort((a,b)=>Number(b.id===region.activeGroupId)-Number(a.id===region.activeGroupId))
      .filter(group=>group.windowIds.length>0 && group.windowIds.every(id=>readers.has(id)))
      .map(group=>({regionId:region.id,groupId:group.id,windowIds:group.windowIds}));
  });
  const chosen=(preferred ? candidates.find(candidate=>candidate.windowIds.includes(preferred)) : undefined) ?? candidates[0];
  return chosen ? {regionId:chosen.regionId,groupId:chosen.groupId} : undefined;
}
