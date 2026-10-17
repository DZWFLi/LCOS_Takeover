import { useReactFlow } from '@xyflow/react';

import useCanvasStore from '@/store/canvasStore';

import { useLcosReferenceStore } from '../lcosReferenceState';
import { useLcosShellStore } from '../shell/lcosShellStore';
import { lcosTokens } from '../ui/lcosTokens';

import type { MiniMapNodeProps } from '@xyflow/react';

export function miniMapSpecies(input: { readonly entityType?: string; readonly artifactKind?: string;
  readonly mimeType?: string; readonly sourceKind?: string; readonly nodeType?: string }): string {
  if (input.entityType === 'scope') return input.artifactKind === 'workflow' ? 'workflow' : 'context';
  if (['collection','workspace','conversation'].includes(input.entityType ?? '')) return input.entityType ?? 'file';
  const kind=input.artifactKind ?? input.nodeType ?? '';
  if(kind==='question')return 'conversation';
  if(kind==='frame')return 'frame';
  if(input.sourceKind==='url'||input.sourceKind==='web'||kind==='link'||kind==='web'||input.mimeType==='text/html'||input.mimeType==='application/xhtml+xml')return 'web';
  if(kind==='markdown'||kind==='note'||kind==='text'||input.entityType==='note')return 'text';
  if(kind==='image'||input.mimeType?.startsWith('image/'))return 'image';
  if(kind==='video'||input.mimeType?.startsWith('video/'))return 'video';
  if(kind==='audio'||input.mimeType?.startsWith('audio/'))return 'audio';
  if(kind==='pdf'||input.mimeType==='application/pdf')return 'pdf';
  if(kind==='presentation')return 'presentation';
  if(input.mimeType?.startsWith('text/'))return 'text';
  return 'file';
}

/** Native Huabu/React Flow MiniMap node only. Coordinates and panning remain
 * with that MiniMap; this adapts real species and the same live locate cue. */
export function LcosMiniMapNode({ id,x,y,width,height,selected }: MiniMapNodeProps): React.JSX.Element {
  const rf=useReactFlow();
  const ref=useLcosReferenceStore(state=>state.nodeEntityRefs.get(id));
  const canvasId=useCanvasStore(state=>state.canvasId);
  const beacon=useLcosShellStore(state=>{
    const request=state.locateRequest;
    return request?.status==='projected' && (!request.canvasId || request.canvasId===canvasId)
      && (request.nodeIds?.includes(id) || request.nodeId===id) === true;
  });
  const node=rf.getNode(id);
  const nodeType=node?.type ?? (typeof node?.data.nodeType==='string'?node.data.nodeType:undefined);
  const species=miniMapSpecies({entityType:ref?.entityType,artifactKind:ref?.descriptor?.artifactKind,
    mimeType:ref?.descriptor?.mimeType ?? ref?.mimeType,sourceKind:ref?.descriptor?.sourceKind,nodeType});
  const color=selected||beacon?lcosTokens.color.accent:lcosTokens.color.muted;
  const strokeWidth=Math.max(1,Math.min(width,height)*.025);
  const inset=Math.min(width,height)*.12;
  return <g data-lcos-minimap-node={id} data-lcos-minimap-species={species} data-lcos-minimap-beacon={beacon||undefined}
    transform={`translate(${x},${y})`}>
    {species==='frame'?<rect width={width} height={height} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray="6 4" />
      : species==='conversation'?<rect width={width} height={height} rx={Math.min(width,height)/2} fill={color} fillOpacity=".55" />
        : <rect width={width} height={height} rx={species==='collection'||species==='workspace'?Math.min(width,height)*.15:3} fill={color} fillOpacity=".55" />}
    {(species==='text'||species==='pdf'||species==='file')&&<path d={`M${inset} ${height*.35}H${width-inset} M${inset} ${height*.55}H${width*.7}`} fill="none" stroke="white" strokeWidth={strokeWidth} />}
    {species==='image'&&<path d={`M${inset} ${height-inset}L${width*.42} ${height*.35}L${width*.62} ${height*.62}L${width*.77} ${height*.45}L${width-inset} ${height-inset}`} fill="none" stroke="white" strokeWidth={strokeWidth} />}
    {(species==='video'||species==='presentation')&&<path d={`M${width*.4} ${height*.25}L${width*.72} ${height*.5}L${width*.4} ${height*.75}Z`} fill="white" />}
    {species==='audio'&&<path d={`M${width*.2} ${height*.5}H${width*.3}L${width*.4} ${height*.25}L${width*.55} ${height*.75}L${width*.7} ${height*.5}H${width*.8}`} fill="none" stroke="white" strokeWidth={strokeWidth} />}
    {(species==='context'||species==='workflow')&&<path d={`M${width*.22} ${height*.5}H${width*.78} M${width*.5} ${height*.2}V${height*.8}`} stroke="white" strokeWidth={strokeWidth} />}
    {species==='collection'&&<path d={`M${inset} ${height*.25}H${width*.42}L${width*.55} ${height*.38}H${width-inset}`} fill="none" stroke="white" strokeWidth={strokeWidth} />}
    {beacon&&<rect x={-inset/2} y={-inset/2} width={width+inset} height={height+inset} rx={5} fill="none" stroke={lcosTokens.color.accent} strokeWidth={strokeWidth*2} />}
  </g>;
}
