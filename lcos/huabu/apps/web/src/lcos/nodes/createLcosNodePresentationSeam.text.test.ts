import {describeProjectedEntity} from '@local-creative-os/web-gen2';
import {describe,it,beforeEach,expect} from 'vitest';

import {useLcosReferenceStore} from '../lcosReferenceState';
import {createLcosNodePresentationSeam} from './createLcosNodePresentationSeam';
import {LcosCanvasTextBody} from './LcosCanvasTextBody';
const input={nodeId:'core-text',nodeType:'text',data:{contentMissing:true}};
beforeEach(()=>{useLcosReferenceStore.getState().reset();useLcosReferenceStore.getState().setProject('p-text');});
function bind(extra:Record<string,unknown>={}){useLcosReferenceStore.getState().registerNodeEntity(input.nodeId,{entityType:'artifact',entityId:'a-text',descriptor:describeProjectedEntity({entityType:'artifact',entityId:'a-text',title:'Text',artifactKind:'markdown',managed:true,revisionStatus:'current',currentRevisionId:'rev-current',presentedRevisionId:'rev-current',canvasTextEditable:true,...extra})});}
describe('canonical text intrinsic body ownership',()=>{
 it('uses the real managed body despite a missing native sidecar and returns one stable intrinsic host',()=>{bind();const seam=createLcosNodePresentationSeam();expect(seam.resolve(input)).toBe(LcosCanvasTextBody);const host=seam.resolveHostPresentation?.(input);expect(host?.intrinsicHeight).toBe(true);expect(seam.resolveHostPresentation?.(input)).toBe(host);});
 it('never turns known HTML, URL/web sources or a web native host into a Milkdown text owner',()=>{const seam=createLcosNodePresentationSeam();for(const facts of [{mimeType:'text/html'},{sourceKind:'url',mimeType:'text/markdown'},{sourceKind:'web',mimeType:'text/plain'}]){bind(facts);expect(seam.resolve(input)).not.toBe(LcosCanvasTextBody);expect(seam.resolveHostPresentation?.(input)?.intrinsicHeight).not.toBe(true);}bind({mimeType:'text/markdown'});expect(seam.resolveHostPresentation?.({...input,nodeType:'web'})?.intrinsicHeight).not.toBe(true);});
 it('never grants editing to an unbound missing sidecar, historical revision or explicit extra View',()=>{const seam=createLcosNodePresentationSeam();expect(seam.resolve(input)).not.toBe(LcosCanvasTextBody);bind({presentedRevisionId:'rev-old'});expect(seam.resolve(input)).not.toBe(LcosCanvasTextBody);bind({artifactViewReferenceKind:'explicit_additional'});expect(seam.resolve(input)).not.toBe(LcosCanvasTextBody);});
 it('keeps cross-scope material references on the actual source registry without invoking canvas-text or retiring same-scope editing',()=>{const seam=createLcosNodePresentationSeam();bind({canvasTextEditable:false,fileRecordId:'original-file',preview:'原材料正文'});expect(seam.resolve(input)).not.toBe(LcosCanvasTextBody);expect(seam.resolveHostPresentation?.(input)?.intrinsicHeight).not.toBe(true);bind({canvasTextEditable:true});expect(seam.resolve(input)).toBe(LcosCanvasTextBody);});
});
