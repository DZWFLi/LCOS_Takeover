import { describe, expect, it } from 'vitest';
import { layoutLocatorMarkers, type LocatorMarkerInput, type LocatorRect } from './locatorMarkerLayout';
const intersection = (a:LocatorRect,b:LocatorRect)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
const inputs = (count:number,w:number,h:number):LocatorMarkerInput[] => Array.from({length:count},(_,i)=>({id:`target-${String(i).padStart(2,'0')}`,x:w-26,y:h/2,edgeX:w-26,edgeY:h/2,width:46,height:44}));
function verify(count:number,w:number,h:number,obstacles:LocatorRect[]) {
 const source=inputs(count,w,h), result=layoutLocatorMarkers(source,{left:0,top:0,right:w,bottom:h},obstacles);
 const rects=result.map(p=>({left:p.x-23,right:p.x+23,top:p.y-22,bottom:p.y+22}));
 expect(result.map(p=>p.id)).toEqual(source.map(p=>p.id)); expect(result.every(p=>!p.crowded)).toBe(true);
 for(const [i,rect] of rects.entries()) {expect(rect.left).toBeGreaterThanOrEqual(0);expect(rect.right).toBeLessThanOrEqual(w);expect(rect.top).toBeGreaterThanOrEqual(0);expect(rect.bottom).toBeLessThanOrEqual(h);for(const other of [...obstacles,...rects.slice(0,i)])expect(intersection(rect,other)).toBe(false);}
 return result;
}
describe('dense exact Locator hit placement',()=>{
 it.each([[24,1440,900],[24,390,844],[24,320,568],[60,1440,900]])('%i same-ray targets remain separate in %ix%i', (n,w,h)=>{verify(n,w,h,[{left:w-190,top:h/2-70,right:w,bottom:h/2+70},{left:w/2-88,top:h-70,right:w/2+88,bottom:h-20}]);});
 it('does not reorder target positions just because membership iteration order changed',()=>{
   const source=inputs(24,390,844);const safe={left:0,top:0,right:390,bottom:844};
   const a=layoutLocatorMarkers(source,safe,[]),b=layoutLocatorMarkers([...source].reverse(),safe,[]);
   expect(new Map(a.map(p=>[p.id,p]))).toEqual(new Map(b.map(p=>[p.id,p])));
 });
 it('retains every identity and explicitly marks physical exhaustion rather than inventing a group',()=>{
   const source=inputs(8,60,60),result=layoutLocatorMarkers(source,{left:0,top:0,right:60,bottom:60},[]);
   expect(result.map(p=>p.id)).toEqual(source.map(p=>p.id));expect(result.some(p=>p.crowded)).toBe(true);
 });
});
