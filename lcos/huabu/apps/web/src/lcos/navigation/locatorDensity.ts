/** Trimmed 3e Gen1 spatialMarkerSystem density/fan geometry. This consumes
 * already-projected live targets; pin identities, camera and marker truth stay
 * with the existing owners. No arbitrary marker-count aggregation threshold. */
export interface DensityLocator {
  readonly id: string; readonly label: string; readonly x: number; readonly y: number;
  readonly phase: 'near-edge' | 'edge'; readonly surface: string; readonly edge: string;
  readonly selected: boolean; readonly groupKey: string; readonly groupLabel: string;
}
export type DensityProjection<T extends DensityLocator> =
  | { readonly kind: 'marker'; readonly marker: T }
  | { readonly kind: 'cluster'; readonly id: string; readonly x: number; readonly y: number; readonly members: readonly T[] };
export function projectLocatorDensity<T extends DensityLocator>(items: readonly T[],zoom: number): DensityProjection<T>[] {
  const radius=Math.max(44,Math.min(88,52+Math.max(0,1-zoom)*44));
  const projections: DensityProjection<T>[]=[];
  const buckets: T[][]=[];
  for(const item of [...items].sort((a,b)=>Number(b.selected)-Number(a.selected))){
    if(item.selected){projections.push({kind:'marker',marker:item});continue;}
    const bucket=buckets.find(group=>{
      const first=group[0]; if(!first||first.phase!==item.phase||first.surface!==item.surface||first.edge!==item.edge)return false;
      const x=group.reduce((sum,value)=>sum+value.x,0)/group.length;
      const y=group.reduce((sum,value)=>sum+value.y,0)/group.length;
      return Math.hypot(item.x-x,item.y-y)<=radius;
    });
    if(bucket)bucket.push(item);else buckets.push([item]);
  }
  for(const group of buckets){
    if(group.length===1)projections.push({kind:'marker',marker:group[0]});
    else projections.push({kind:'cluster',id:JSON.stringify(group.map(item=>item.id).sort()),
      x:group.reduce((sum,item)=>sum+item.x,0)/group.length,y:group.reduce((sum,item)=>sum+item.y,0)/group.length,members:group});
  }
  return projections;
}
export interface LocatorFanGroup<T extends DensityLocator> {readonly id:string;readonly label:string;readonly members:readonly T[];readonly allIds:readonly string[];readonly overflowCount:number}
/** G1 semantic first fan: at most five groups, six direct children per group;
 * overflow fits that real group instead of exploding dozens of bubbles. */
export function locatorFanGroups<T extends DensityLocator>(members:readonly T[],groupCap=5,leafCap=6):LocatorFanGroup<T>[] {
  const groups=new Map<string,{label:string;members:T[]}>();
  for(const item of members){const group=groups.get(item.groupKey);if(group)group.members.push(item);else groups.set(item.groupKey,{label:item.groupLabel,members:[item]});}
  const ordered=[...groups].map(([id,group])=>({id,...group})).sort((a,b)=>b.members.length-a.members.length||a.label.localeCompare(b.label));
  const visible=ordered.length<=groupCap?ordered:ordered.slice(0,Math.max(1,groupCap-1));
  if(ordered.length>groupCap)visible.push({id:'more-directions',label:'更多方向',members:ordered.slice(visible.length).flatMap(group=>group.members)});
  return visible.map(group=>({id:group.id,label:group.label,members:group.members.slice(0,leafCap),allIds:group.members.map(item=>item.id),overflowCount:Math.max(0,group.members.length-leafCap)}));
}
