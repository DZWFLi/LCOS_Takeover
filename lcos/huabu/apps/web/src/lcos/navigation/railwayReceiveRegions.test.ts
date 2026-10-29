import { afterEach, expect, it, vi } from 'vitest';

import { railwayReceiveRegions } from './railwayReceiveRegions';
import { canCommitDropRelease } from '../drop/dropReleaseConsistency';
import { DropTargetRegistry } from '../drop/dropTargetRegistry';

import type { DropResolution } from '../drop/dropTypes';
import type { DropPayload, SemanticDropState } from '@local-creative-os/web-gen2';

const originalHit = Object.getOwnPropertyDescriptor(document,'elementsFromPoint');
afterEach(() => {
  document.body.replaceChildren();
  if (originalHit) Object.defineProperty(document,'elementsFromPoint',originalHit);
  else Reflect.deleteProperty(document,'elementsFromPoint');
  vi.restoreAllMocks();
});

function fixture() {
  const icon = document.createElement('button');
  const peek = document.createElement('div');
  const overlay = document.createElement('div');
  document.body.append(icon,peek,overlay);
  let iconRect = new DOMRect(10,20,36,36);
  const peekRect = new DOMRect(80,20,180,120);
  vi.spyOn(icon,'getBoundingClientRect').mockImplementation(() => iconRect);
  vi.spyOn(peek,'getBoundingClientRect').mockReturnValue(peekRect);
  let cover = false;
  Object.defineProperty(document,'elementsFromPoint',{ configurable:true,value:(x:number,y:number) => {
    if (cover) return [overlay];
    return [icon,peek].filter(element => {
      const rect = element.getBoundingClientRect();
      return element.isConnected && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    });
  }});
  const regions = railwayReceiveRegions([icon,peek]);
  const rect = regions.readRect();
  if (!rect) throw new Error('Expected connected GUI regions');
  const registry = new DropTargetRegistry();
  registry.register({targetId:'railway:p:rail:collection',kind:'collection-membership',label:'材料集合',
    rect,readRect:regions.readRect,acceptsPoint:regions.acceptsPoint,priority:30,enabled:true,
    semantic:{kind:'collection-membership',collectionId:'actual-collection'}});
  return {registry,icon,peek,move:()=>{iconRect=new DOMRect(20,180,36,36);},cover:()=>{cover=true;}};
}

it('keeps one strict receiver through icon to Peek, without accepting the gap',() => {
  const {registry} = fixture();
  const icon = registry.hitTest({x:28,y:38});
  const peek = registry.hitTest({x:120,y:70});
  expect(icon?.targetId).toBe(peek?.targetId);
  expect(registry.snapshot()).toHaveLength(1);
  expect(registry.hitTest({x:65,y:38})).toBeUndefined();
  const payload: DropPayload = {kind:'objects',objects:[{entityType:'artifact',entityId:'material'}]};
  const read = (targetId:string): {state:SemanticDropState;resolution:DropResolution} => ({
    state:{status:'preview',payload,destination:{targetId,previewPoint:{x:120,y:70}},carryAnchor:'left'},
    resolution:{status:'ready',
      intent:{kind:'collection-membership',targetId,collectionId:'actual-collection',memberRef:{type:'artifact',id:'material'}}},
  });
  if (!icon || !peek) throw new Error('Expected the two visible GUI hit regions');
  expect(canCommitDropRelease(read(icon.targetId),read(peek.targetId))).toBe(true);
  expect(canCommitDropRelease(read(icon.targetId),read('another-destination'))).toBe(false);
});

it('reads moved GUI geometry and removes disconnected regions without changing identity',() => {
  const {registry,icon,peek,move} = fixture();
  move();
  expect(registry.hitTest({x:28,y:38})).toBeUndefined();
  expect(registry.hitTest({x:38,y:195})?.targetId).toBe('railway:p:rail:collection');
  peek.remove();
  expect(registry.hitTest({x:120,y:70})).toBeUndefined();
  icon.remove();
  expect(registry.snapshot()).toEqual([]);
});

it('rejects a region covered by another window',() => {
  const {registry,cover} = fixture();
  expect(registry.hitTest({x:120,y:70})).toBeDefined();
  cover();
  expect(registry.hitTest({x:120,y:70})).toBeUndefined();
});
