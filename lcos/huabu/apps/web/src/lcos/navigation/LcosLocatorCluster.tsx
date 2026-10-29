import { useEffect, useRef } from 'react';

import { Popover } from '@/components/Common/Popover';
import { useCloseOnEscape } from '@/hooks/useCloseOnEscape';

import { LcosSpatialCursorMark } from './LcosSpatialCursorMark';
import { locatorFanGroups } from './locatorDensity';
import { lcosGlassStyle } from '../ui/lcosTokens';

import type { DensityLocator } from './locatorDensity';
import type { LcosSurfaceKey } from '../shell/lcosShellStore';

export function LcosLocatorCluster({ id,x,y,members,expanded,onExpandedChange,onLocate,surface }: {
  readonly id: string; readonly x: number; readonly y: number; readonly members: readonly DensityLocator[];
  readonly expanded: boolean; readonly onExpandedChange: (open: boolean) => void;
  readonly onLocate: (ids: readonly string[]) => void; readonly surface: LcosSurfaceKey;
}): React.JSX.Element {
  const timer=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel=():void=>{if(timer.current)clearTimeout(timer.current);};
  const leave=():void=>{cancel();timer.current=setTimeout(()=>onExpandedChange(false),180);};
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  useCloseOnEscape(expanded,()=>onExpandedChange(false),{canvasBlank:true});
  const groups=locatorFanGroups(members);
  return <>
    <button type="button" data-lcos-locator-cluster={id} aria-label={`${members.length} 个空间标记，定位全部`}
      aria-expanded={expanded} onMouseEnter={()=>{cancel();onExpandedChange(true);}} onMouseLeave={leave}
      onFocus={()=>{cancel();onExpandedChange(true);}} onPointerDown={event=>event.stopPropagation()}
      onClick={()=>{onExpandedChange(false);onLocate(members.map(member=>member.id));}}
      className="pointer-events-auto fixed z-[64] grid h-11 w-11 place-items-center rounded-full border-0 bg-transparent"
      style={{left:x,top:y,transform:'translate(-50%,-50%)'}}>
      <LcosSpatialCursorMark surface={surface} phase="edge" badge={members.length} label={`${members.length} 个标记`} />
    </button>
    {expanded&&<Popover position={{x:x+24,y}} style={{...lcosGlassStyle,width:264,padding:10,maxHeight:'60vh',overflow:'auto'}}
      dismissOnEscape={false} onDismiss={()=>onExpandedChange(false)} zIndex={80}>
      <div data-lcos-locator-fan role="group" aria-label="空间标记分组" onMouseEnter={cancel} onMouseLeave={leave} onFocusCapture={cancel}>
        {groups.map(group=><section key={group.id} className="mb-2">
          <button type="button" className="flex min-h-9 w-full items-center justify-between text-left text-xs"
            data-lcos-locator-fan-group={group.id} onClick={()=>{onExpandedChange(false);onLocate(group.allIds);}}>
            <strong>{group.label}</strong><span>{group.members.length+group.overflowCount}</span>
          </button>
          <div className="flex flex-wrap gap-1">{group.members.map(member=><button key={member.id} type="button"
            data-lcos-locator-fan-leaf={member.id} className="min-h-8 max-w-full rounded-lg px-2 text-left text-xs"
            onClick={()=>{onExpandedChange(false);onLocate([member.id]);}}>{member.label}</button>)}</div>
          {group.overflowCount>0&&<small>另有 {group.overflowCount} 项，点击组名定位全部</small>}
        </section>)}
      </div>
    </Popover>}
  </>;
}
