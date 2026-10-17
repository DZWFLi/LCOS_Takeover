import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { setWorkspacePath } from '../../lcos/huabu/apps/server/src/modules/workspace.ts';
import { initStorage,closeStorage,createSpace,space } from '../../lcos/huabu/apps/server/src/modules/storage/index.ts';
import { executeOnServer } from '../../lcos/huabu/apps/server/src/modules/canvas/canvas-executor.ts';
export async function startSpatialPilot({runtimeRoot,canvasId='takeover-pilot-canvas'}) {
  process.env.HUABU_DATA_DIR=path.join(runtimeRoot,'huabu-private');
  const workspace=path.join(runtimeRoot,'huabu-workspace');await mkdir(workspace,{recursive:true});
  setWorkspacePath(workspace);
  try{
  const storage=await initStorage({structured:{kind:'disk'},blobs:{kind:'disk'}});await storage.structured.spaces().ensureWorld();
  if(!await space(canvasId).read())await createSpace(canvasId,'图片文本接入实验');
  return {canvasId,read:()=>space(canvasId).read(),
    execute:commands=>executeOnServer({canvasId,commands,originator:{source:'user'},publish:false}),
    async close(){await closeStorage();}};
  }catch(error){await closeStorage().catch(()=>{});throw error;}
}
