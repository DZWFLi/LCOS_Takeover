import type { ColorPinSnapshotV0, SpatialMarkerIntentV0, SpatialMarkerTargetRefV0 } from '../../lcos/packages/contracts/src/index';
import { nativeNavigationTarget, type NativeNavigationFacts, type NativeNavigationScene } from './native-navigation-markers';
import { projectNativePins, nativePinColorKey, validateNativePinSnapshot } from './native-colorpin-model';

type Row = Record<string, any>;
export type NativeCanvasGuiOwner = { projectId: string; canvasId: string; workspaceId: string; surfaceRef: string };
export type NativeCanvasGuiCoreResponse = { status: number; body: any };
export interface NativeCanvasGuiMarkerOptions {
  projectId: string;
  repository: { get(projectId: string): any; getProjectionBindings(projectId: string): readonly any[];
    listConnectedConversations(projectId: string): readonly any[]; getProjectExecutionProjection(projectId: string): any };
  readNodes(canvasId: string): Promise<readonly Row[]>;
  resolveCanvas(canvasId: string): NativeCanvasGuiOwner | undefined | Promise<NativeCanvasGuiOwner | undefined>;
  /** Existing Core HTTP owner. Preserve its status, body, meta and unknown transport failures. */
  requestCore(method: string, path: string, body?: unknown): Promise<NativeCanvasGuiCoreResponse>;
  /** Original Huabu mutex/GUI data owner; never an arbitrary node-data writer. */
  commitNativeGui?(canvasId: string, nodeId: string, patch: { color_pins?: string[]; lcos_gui_navigation_pin?: boolean },
    expected: { identity: string; value: unknown }, originator: 'user' | 'agent'): Promise<any>;
}
export type NativeCanvasGuiOperation =
  | { type: 'SET_NAVIGATION_PIN'; nodeId: string; pinned: boolean; scope?: 'local' | 'cross-surface' }
  | { type: 'SET_COLOR_PIN'; nodeId: string; color: string; present: boolean }
  | { type: 'RENAME_COLOR_PIN'; definitionId: string; label: string; expectedLabel: string | null; expectedUpdatedAt: string }
  | { type: 'RENAME_COLOR_PIN'; color: string; label: string; expectedDefinitionId: null };
export type NativeCanvasGuiResult = { status: 'confirmed' | 'rejected' | 'unknown'; changed?: boolean; canvasId: string;
  operation: NativeCanvasGuiOperation['type']; nodeId?: string; targetRef?: SpatialMarkerTargetRefV0;
  marker?: SpatialMarkerIntentV0; membership?: any; definition?: any; changeSetId?: string;
  nativeNode?: { canvasId: string; nodeId: string }; spatialReceipt?: any;
  pending?: true; reason?: string; coreResponse?: NativeCanvasGuiCoreResponse };
export class NativeCanvasGuiMarkerError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) { super(message); this.name = 'NativeCanvasGuiMarkerError'; }
}
const fail = (status: number, code: string, message: string): never => { throw new NativeCanvasGuiMarkerError(status, code, message); };
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const rows = (value: any): Row[] => Array.isArray(value) ? value : [];
const sameTarget = (a: any, b: any) => !!a && !!b && a.projectId === b.projectId && a.kind === b.kind && a.id === b.id;
const sameOwner = (a: NativeCanvasGuiOwner, b?: NativeCanvasGuiOwner) => !!b && ['projectId','canvasId','workspaceId','surfaceRef'].every(key => a[key as keyof NativeCanvasGuiOwner] === b[key as keyof NativeCanvasGuiOwner]);
const stableSurface = (value: unknown): value is string => typeof value === 'string' && /^(main|assembly|(?:workspace|scope|conversation):.+)$/.test(value);
export const nativeCanvasGuiNodeIdentity = (node: Row) => JSON.stringify([node.id,node.type,...['lcos_ref','lcos_collection_ref','lcos_conversation_ref',
  'lcos_execution_ref','lcos_run_ref','lcos_member_ref'].map(field=>{const ref=node.data?.[field];return ref&&typeof ref==='object'
    ? Object.fromEntries(['version','projectId','canvasId','workspaceId','entityType','entityId','artifactId','artifactViewId',
      'viewId','collectionId','connectedConversationId','runId'].filter(key=>ref[key]!==undefined).map(key=>[key,ref[key]])) : ref;})]);
const nodeIdentity = nativeCanvasGuiNodeIdentity;
export const nativeCanvasGuiReferenceFields = ['lcos_ref','lcos_collection_ref','lcos_conversation_ref','lcos_execution_ref','lcos_run_ref','lcos_member_ref',
  'lcos_result_ref','lcos_file_ref','lcos_method_member_ref','lcosCollectionId','lcosCollectionNodeId','lcos_native_collection'] as const;
/** A broken typed reference must never silently become a local ordinary node. */
export const nativeCanvasGuiUnboundNode = (node: Row | undefined, bindings: readonly Row[], canvasId: string) => !!node
  && text(node.id) && node.data?.id === node.id && (node.canvas_id===undefined || node.canvas_id===canvasId)
  && !bindings.some(row => row.canvasId === canvasId && row.spatialKind === 'node' && row.spatialId === node.id)
  && !nativeCanvasGuiReferenceFields.some(key => node.data?.[key] !== undefined);
export function nativeCanvasGuiColors(node: Row): string[] | undefined {
  const pins = node.data?.color_pins ?? [];
  if (!Array.isArray(pins) || pins.some(color => typeof color !== 'string' || !/^[0-9a-fA-F]{6}$/.test(color))) return undefined;
  const normalized = pins.map((color: string) => color.toUpperCase());
  return new Set(normalized).size === normalized.length ? normalized : undefined;
}
const originalValue = (response: NativeCanvasGuiCoreResponse) => response.body?.value;
const ok = (response: NativeCanvasGuiCoreResponse) => response.status >= 200 && response.status < 300 && response.body?.ok === true && Object.hasOwn(response.body, 'value');
const operations = ['SET_NAVIGATION_PIN','SET_COLOR_PIN','RENAME_COLOR_PIN'] as const;

/** A thin same-process adapter. Typed markers stay in Core; ordinary GUI fields
 * stay in their original Huabu node. No second marker store or coordinates. */
export function createNativeCanvasGuiMarkers(options: NativeCanvasGuiMarkerOptions) {
  const prefix = '/projects/' + encodeURIComponent(options.projectId);
  const capabilities = () => ({ operations: [...operations], notes: [
    'Navigation targets exact existing canonical carriers; no Run execution or stage prerequisite.',
    'Color authoring uses the exact material View or typed entity from the original palette; ordinary nodes use their original color_pins. No workflow state prerequisite.',
    'A failed or unknown mutation is never retried by this adapter. Read the original records before another user decision.',
  ] });
  function guiCapability(type: string) {
    if (!operations.includes(type as any)) fail(404,'GUI_OPERATION_NOT_CONNECTED','这个画布标记操作尚未接入。');
    const id = {type:'string',minLength:1,pattern:'.*\\S.*'};
    const properties = type === 'SET_NAVIGATION_PIN' ? {type:{const:type},nodeId:id,pinned:{type:'boolean'},scope:{enum:['local','cross-surface'],default:'local'}}
      : type === 'SET_COLOR_PIN' ? {type:{const:type},nodeId:id,color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},present:{type:'boolean'}}
      : {type:{const:type},definitionId:id,label:{type:'string',minLength:1,maxLength:500,pattern:'.*\\S.*'},expectedLabel:{type:['string','null']},expectedUpdatedAt:id,
        color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},expectedDefinitionId:{type:'null'}};
    const required = ['type',...(type === 'SET_NAVIGATION_PIN' ? ['nodeId','pinned'] : type === 'SET_COLOR_PIN'
      ? ['nodeId','color','present'] : ['label'])];
    const renameShapes = type === 'RENAME_COLOR_PIN' ? {oneOf:[
      {required:['definitionId','expectedLabel','expectedUpdatedAt'],properties:{color:false,expectedDefinitionId:false}},
      {required:['color','expectedDefinitionId'],properties:{definitionId:false,expectedLabel:false,expectedUpdatedAt:false}},
    ]} : {};
    return { type, schema:{type:'object',properties,required,additionalProperties:false,...renameShapes}, required: type === 'SET_NAVIGATION_PIN' ? ['nodeId','pinned'] : type === 'SET_COLOR_PIN'
      ? ['nodeId','color','present'] : ['label'],
      scope: type === 'SET_NAVIGATION_PIN' ? ['local','cross-surface'] : undefined,
      description: type === 'SET_NAVIGATION_PIN' ? '固定或取消固定准确现有节点；默认仅当前现场。'
        : type === 'SET_COLOR_PIN' ? '添加或移除准确现有节点的 #RRGGBB 颜色；材料位置、实体与普通节点各沿原保存者。' : '已有组用刚读取的 definitionId、名称及更新时间改名；当前普通节点的无定义颜色组用 color 和 expectedDefinitionId:null 首次命名。名称在项目同色组共享。' };
  }
  async function owner(canvasId: string) {
    const value = await options.resolveCanvas(canvasId);
    if (!text(canvasId) || !value || value.canvasId !== canvasId || value.projectId !== options.projectId || !text(value.workspaceId) || !stableSurface(value.surfaceRef))
      fail(404,'GUI_CANVAS_UNAVAILABLE','当前画布的原项目和现场尚未确认。');
    return value!;
  }
  async function unchanged(expected: NativeCanvasGuiOwner) {
    if (!sameOwner(expected, await options.resolveCanvas(expected.canvasId))) fail(409,'GUI_CANVAS_OWNER_CHANGED','现场已变化，没有修改旧画布。');
  }
  async function coreRead(path: string) {
    const response = await options.requestCore('GET',prefix + path);
    if (!ok(response)) throw new NativeCanvasGuiMarkerError(response.status,response.body?.error?.code ?? 'GUI_FACTS_UNAVAILABLE',
      response.body?.error?.message ?? '原标记记录暂时无法读取。',response.body);
    return originalValue(response);
  }
  async function facts(expected: NativeCanvasGuiOwner) {
    let graph = options.repository.get(options.projectId), bindings = options.repository.getProjectionBindings(options.projectId);
    if (graph?.project?.id !== options.projectId || !Array.isArray(bindings)) fail(503,'GUI_FACTS_UNAVAILABLE','当前项目的原标记身份暂时无法读取。');
    const workspaces = rows(graph.workspaces).filter(value => value.canvasId === expected.canvasId), workspace = workspaces[0];
    const scopes = rows(graph.scopes).filter(value => value.id === workspace?.scopeId);
    if (workspaces.length !== 1 || workspace?.id !== expected.workspaceId || workspace.projectId !== options.projectId || workspace.archivedAt
      || scopes.length !== 1 || scopes[0]?.projectId !== options.projectId || scopes[0]?.archivedAt)
      fail(409,'GUI_WORKSPACE_IDENTITY_UNAVAILABLE','原工作现场的归属尚未确认。');
    // Optional typed read models must not lock unrelated material GUI.
    let conversations: any[] = [], runs: any[] = [], resultSlots: any[] = [], conversationsAvailable = false, runsAvailable = false, resultSlotsAvailable = false;
    try { const value = options.repository.listConnectedConversations(options.projectId); if (Array.isArray(value) && value.every(row => row.projectId === options.projectId)) { conversations = [...value]; conversationsAvailable = true; } } catch {}
    try { const value = options.repository.getProjectExecutionProjection(options.projectId); if (value?.projectId === options.projectId && Array.isArray(value.runs) && value.runs.every((row: Row) => row.projectId === options.projectId)) { runs = value.runs; runsAvailable = true;
      if (Array.isArray(value.resultSlots) && value.resultSlots.every((row: Row) => row.projectId === options.projectId)) { resultSlots = value.resultSlots; resultSlotsAvailable=true; } } } catch {}
    const [navigation, colors, nodes] = await Promise.allSettled([coreRead('/spatial-markers'),coreRead('/color-pins'),options.readNodes(expected.canvasId)]);
    await unchanged(expected);
    if (nodes.status !== 'fulfilled' || !Array.isArray(nodes.value)) fail(503,'GUI_NODES_UNAVAILABLE','原画布节点暂时无法读取。');
    // The canonical DTO can finish after a normal material revision advances.
    // Re-read existing identity facts, not a version lock on GUI expression.
    graph = options.repository.get(options.projectId);bindings = options.repository.getProjectionBindings(options.projectId);
    const latestOwners=rows(graph?.workspaces).filter(value=>value.canvasId===expected.canvasId),latest=latestOwners[0];
    const latestScopes=rows(graph?.scopes).filter(value=>value.id===latest?.scopeId);
    if(graph?.project?.id!==options.projectId||!Array.isArray(bindings)||latestOwners.length!==1||latest?.id!==expected.workspaceId
      ||latest.projectId!==options.projectId||latest.archivedAt||latestScopes.length!==1||latestScopes[0]?.projectId!==options.projectId||latestScopes[0]?.archivedAt)
      fail(409,'GUI_WORKSPACE_IDENTITY_UNAVAILABLE','读取期间现场归属变化，没有修改标记。');
    const live = nodes.value, navAvailable = navigation.status === 'fulfilled' && Array.isArray(navigation.value)
      && navigation.value.every(marker => marker?.projectId === options.projectId && text(marker.id) && marker.targetRef?.projectId === options.projectId
        && ['view','entity','surface'].includes(marker.targetRef.kind) && text(marker.targetRef.id) && ['local','cross-surface'].includes(marker.scope)
        && (marker.scope !== 'local' || stableSurface(marker.sourceSurfaceRef)) && (marker.sourceSurfaceRef === undefined || stableSurface(marker.sourceSurfaceRef))
        && text(marker.createdAt) && text(marker.updatedAt)) && new Set(navigation.value.map((marker: Row)=>marker.id)).size === navigation.value.length;
    let snapshot: ColorPinSnapshotV0 | undefined;
    if (colors.status === 'fulfilled') try { snapshot = validateNativePinSnapshot(colors.value, options.projectId); } catch {}
    const scene: NativeNavigationScene = { ...expected, api: {} };
    const navigationFacts: NativeNavigationFacts = { markers: navAvailable ? navigation.value : [], graph: { ...graph,connectedConversations:conversations,runs,resultSlots },bindings:[...bindings],availability:{conversations:conversationsAvailable,runs:runsAvailable,resultSlots:resultSlotsAvailable} };
    const colorProjection = snapshot ? projectNativePins({ ...scene,nodes:live },{snapshot,graph:navigationFacts.graph,bindings}) : undefined;
    return {scene,nodes:live,navigationFacts,navAvailable,snapshot,colorProjection};
  }
  function oneNode(current: Awaited<ReturnType<typeof facts>>,nodeId: string) {
    const found = current.nodes.filter(node => node.id === nodeId);
    if (found.length !== 1 || !found[0]?.data || found[0].data.id !== nodeId) fail(404,'GUI_NODE_UNAVAILABLE','这个原节点已不在当前画布。');
    return found[0]!;
  }
  const navMatches = (current: Awaited<ReturnType<typeof facts>>,target: SpatialMarkerTargetRefV0,scope: string) =>
    current.navigationFacts.markers.filter(marker => sameTarget(marker.targetRef,target) && marker.scope === scope
      && (scope === 'cross-surface' || marker.sourceSurfaceRef === current.scene.surfaceRef));
  function colorTarget(current: Awaited<ReturnType<typeof facts>>,nodeId: string) {
    const target = current.colorProjection?.byNode.get(nodeId)?.target;
    return target;
  }
  const ordinaryNode = (current: Awaited<ReturnType<typeof facts>>,node: Row | undefined) => !!options.commitNativeGui
    && typeof node?.data?.lcos_gui_navigation_pin==='boolean' && nativeCanvasGuiUnboundNode(node,current.navigationFacts.bindings,current.scene.canvasId);
  async function read(canvasId: string,nodeIds?: readonly string[]) {
    const expected = await owner(canvasId),current = await facts(expected);
    if (nodeIds !== undefined && (!Array.isArray(nodeIds) || nodeIds.some(id => !text(id)) || nodeIds.length > 200)) fail(400,'GUI_NODES_INVALID','请选择不超过 200 个准确节点。');
    const ids = nodeIds ?? current.nodes.map(node => node.id);
    return { ...expected, available:true, nodes:ids.map(nodeId => {
      const found = current.nodes.filter(node => node.id === nodeId), node = found.length === 1 ? found[0] : undefined;
      const target = nativeNavigationTarget(node,current.scene,current.navigationFacts),color = current.colorProjection?.byNode.get(nodeId);
      const ordinary = ordinaryNode(current,node), nativeColors = node ? nativeCanvasGuiColors(node) : undefined;
      if (ordinary) return { nodeId,available:true,locked:node!.data.locked === true,
        navigation:{available:true,nativeNode:{canvasId,nodeId},scope:'local',pinned:node!.data.lcos_gui_navigation_pin === true},
        colors:{available:!!nativeColors,nativeNode:{canvasId,nodeId},...(nativeColors?{colors:nativeColors,definitions:current.snapshot?.definitions ?? []}:{reason:'native-colors-invalid'})} };
      return { nodeId,available:!!node,locked:node?.data?.locked === true,
        navigation: { available:!!node && !!target && current.navAvailable,targetRef:target,
          ...(!node||!target||!current.navAvailable ? {reason:!node?'node-missing':!target?'canonical-target-unavailable':'navigation-read-unavailable'} : {markers:current.navigationFacts.markers.filter(marker => sameTarget(marker.targetRef,target) && (marker.scope === 'cross-surface' || marker.sourceSurfaceRef === expected.surfaceRef))}) },
        colors: { available:!!node && !!color?.target && !!current.snapshot,targetRef:color?.target,
          ...(!node||!color?.target||!current.snapshot ? {reason:!node?'node-missing':!current.snapshot?'color-read-unavailable':'canonical-authoring-unavailable'} : {memberships:color.memberships,colors:color.pins,definitions:current.snapshot.definitions}) } };
    }) };
  }
  function validate(operation: any): asserts operation is NativeCanvasGuiOperation {
    const keys = operation && typeof operation === 'object' && !Array.isArray(operation) ? Object.keys(operation) : [];
    const creating = operation?.type === 'RENAME_COLOR_PIN' && Object.hasOwn(operation,'color');
    const allowed = operation?.type === 'SET_NAVIGATION_PIN' ? ['type','nodeId','pinned','scope'] : operation?.type === 'SET_COLOR_PIN'
      ? ['type','nodeId','color','present'] : operation?.type === 'RENAME_COLOR_PIN' ? creating
        ? ['type','color','label','expectedDefinitionId'] : ['type','definitionId','label','expectedLabel','expectedUpdatedAt'] : [];
    if (!allowed.length || keys.some(key => !allowed.includes(key)) || operation.type !== 'RENAME_COLOR_PIN' && !text(operation.nodeId)
      || operation.type === 'SET_NAVIGATION_PIN' && (typeof operation.pinned !== 'boolean' || operation.scope !== undefined && !['local','cross-surface'].includes(operation.scope))
      || operation.type === 'SET_COLOR_PIN' && (typeof operation.present !== 'boolean' || typeof operation.color !== 'string' || !nativePinColorKey(operation.color))
      || operation.type === 'RENAME_COLOR_PIN' && (!text(operation.label) || operation.label.trim().length > 500
        || (creating ? typeof operation.color !== 'string' || !nativePinColorKey(operation.color) || operation.expectedDefinitionId !== null
          : !text(operation.definitionId) || !(operation.expectedLabel === null || typeof operation.expectedLabel === 'string') || !text(operation.expectedUpdatedAt))))
      fail(400,'GUI_OPERATION_INVALID','请使用准确节点、颜色或刚读取的颜色组名称；不能夹带正文或其他字段。');
  }
  async function operate(canvasId: string,input: unknown,originator: 'user' | 'agent' = 'agent'): Promise<NativeCanvasGuiResult> {
    validate(input);const operation = input,expected = await owner(canvasId),first = await facts(expected);
    const result = (status: NativeCanvasGuiResult['status'],changed: boolean | undefined,extra: Partial<NativeCanvasGuiResult> = {}): NativeCanvasGuiResult =>
      ({status,...(changed===undefined?{}:{changed}),canvasId,operation:operation.type,...('nodeId' in operation?{nodeId:operation.nodeId}:{}),...extra});
    let target: SpatialMarkerTargetRefV0 | undefined,proof: string | undefined, ordinary = false;
    if ('nodeId' in operation) {
      const node = oneNode(first,operation.nodeId);if (node.data.locked || node.dragging || node.resizing) fail(409,'GUI_NODE_LOCKED','节点正在操作或已锁定，没有修改标记。');
      proof = nodeIdentity(node);target = operation.type === 'SET_COLOR_PIN' ? colorTarget(first,node.id) : nativeNavigationTarget(node,first.scene,first.navigationFacts);
      ordinary = ordinaryNode(first,node);
      if (!target && !ordinary) fail(409,'GUI_TARGET_UNAVAILABLE','这个节点的原标记身份尚未确认，没有修改其他目标。');
      if (ordinary && operation.type === 'SET_NAVIGATION_PIN' && operation.scope === 'cross-surface') fail(422,'GUI_NATIVE_SCOPE_UNAVAILABLE','普通画布节点固定在当前位置；不会伪造跨现场共享对象。');
    }
    // Re-read the same current Core and canonical DTO immediately before any
    // mutation; no cached toolbar state authorizes a later object/scene.
    const current = await facts(expected);await unchanged(expected);
    if ('nodeId' in operation) { const node = oneNode(current,operation.nodeId);
      const now = operation.type === 'SET_COLOR_PIN' ? colorTarget(current,node.id) : nativeNavigationTarget(node,current.scene,current.navigationFacts);
      if (node.data.locked || node.dragging || node.resizing || nodeIdentity(node) !== proof
        || (ordinary ? !ordinaryNode(current,node) || !!now : !sameTarget(now,target))) fail(409,'GUI_TARGET_CHANGED','节点或准确引用刚有变化，没有修改其他目标。'); }
    if (ordinary && 'nodeId' in operation) {
      const node = oneNode(current,operation.nodeId),nativeNode={canvasId,nodeId:node.id},field = operation.type === 'SET_NAVIGATION_PIN' ? 'lcos_gui_navigation_pin' : 'color_pins';
      const pins = nativeCanvasGuiColors(node);
      if (operation.type === 'SET_COLOR_PIN' && !pins) fail(409,'GUI_NATIVE_COLORS_INVALID','原节点的颜色记录需要核对，没有覆盖它。');
      const before = field === 'color_pins' ? pins! : node.data.lcos_gui_navigation_pin === true;
      const color = operation.type === 'SET_COLOR_PIN' ? nativePinColorKey(operation.color)! : undefined;
      const desired = operation.type === 'SET_NAVIGATION_PIN' ? operation.pinned : operation.present
        ? pins!.includes(color!) ? pins! : [...pins!,color!] : pins!.filter(value => value !== color);
      if (JSON.stringify(before) === JSON.stringify(desired)) return result('confirmed',false,{nativeNode});
      let receipt: any;
      try {
        receipt = await options.commitNativeGui!(canvasId,node.id,{[field]:desired},{identity:proof!,value:before},originator);
        const validReceipt = receipt?.canvasId === canvasId && Number.isSafeInteger(receipt.fromVersion) && Number.isSafeInteger(receipt.toVersion)
          && receipt.toVersion > receipt.fromVersion && receipt.spatialSaved === true && Array.isArray(receipt.changedNodeIds) && receipt.changedNodeIds.includes(node.id);
        const next = await facts(expected);await unchanged(expected);
        if (!validReceipt) return result('unknown',undefined,{nativeNode,spatialReceipt:receipt,pending:true,reason:'原画布回执尚未确认，没有自动重放。'});
        const found=next.nodes.filter(value=>value.id===node.id),latest=found.length===1?found[0]:undefined;
        if (!latest) return result('rejected',true,{nativeNode,spatialReceipt:receipt,reason:'原修改已保存，节点随后已变化；没有重建或重复修改它。'});
        const actual = field === 'color_pins' ? nativeCanvasGuiColors(latest) : latest.data.lcos_gui_navigation_pin === true;
        // The original writer already compared the full field before saving.
        // After its valid ACK, another color may change independently; confirm
        // this requested color without rejecting or overwriting that later edit.
        const satisfied = operation.type === 'SET_COLOR_PIN'
          ? Array.isArray(actual) && actual.includes(color!) === operation.present
          : actual === desired;
        if (!nativeCanvasGuiUnboundNode(latest,next.navigationFacts.bindings,canvasId) || nodeIdentity(latest) !== proof || !satisfied)
          return result('rejected',true,{nativeNode,spatialReceipt:receipt,reason:'标记刚有变化，已保留最新画布结果。'});
        return result('confirmed',true,{nativeNode,spatialReceipt:receipt});
      } catch (cause: any) {
        if (!receipt && [400,401,403,404,405,409,422].includes(cause?.status)) return result('rejected',false,{nativeNode,reason:cause.message});
        return result('unknown',receipt?.spatialSaved===true?true:undefined,{nativeNode,...(receipt?{spatialReceipt:receipt}:{}),pending:true,reason:'原画布修改结果尚未确认，请读取当前节点；没有自动重放。'});
      }
    }
    let method: string,path: string,body: unknown,deletedAlready: ((next: Awaited<ReturnType<typeof facts>>) => boolean) | undefined,confirm: (next: Awaited<ReturnType<typeof facts>>,value: any) => boolean;
    if (operation.type === 'SET_NAVIGATION_PIN') {
      if (!current.navAvailable) fail(503,'GUI_NAVIGATION_UNAVAILABLE','固定记录暂时无法读取，没有提交修改。');
      const scope = operation.scope ?? 'local',matches = navMatches(current,target!,scope);
      if (matches.length > 1) fail(409,'GUI_NAVIGATION_AMBIGUOUS','同一目标有多笔固定记录，请在原目录核对。');
      if (operation.pinned && matches.length || !operation.pinned && !matches.length) return result('confirmed',false,{targetRef:target,marker:matches[0]});
      method = operation.pinned ? 'POST' : 'DELETE';path = prefix + '/spatial-markers' + (operation.pinned?'':'/'+encodeURIComponent(matches[0]!.id));
      body = operation.pinned ? {targetRef:target,scope,...(scope==='local'?{sourceSurfaceRef:expected.surfaceRef}:{})} : undefined;
      if(!operation.pinned)deletedAlready=next=>next.navAvailable&&!next.navigationFacts.markers.some(marker=>marker.id===matches[0]!.id);
      confirm = (next,value) => next.navAvailable && (operation.pinned ? navMatches(next,target!,scope).length === 1
        && navMatches(next,target!,scope)[0]!.id === value?.id && sameTarget(value?.targetRef,target) && value?.projectId===options.projectId
        && value?.scope===scope && (scope==='cross-surface'||value?.sourceSurfaceRef===expected.surfaceRef)
        : value?.deleted===true && value?.markerId===matches[0]!.id && !next.navigationFacts.markers.some(marker => marker.id === matches[0]!.id));
    } else if (operation.type === 'SET_COLOR_PIN') {
      if (!current.snapshot) fail(503,'GUI_COLORS_UNAVAILABLE','颜色记录暂时无法读取，没有提交修改。');
      const color = '#'+nativePinColorKey(operation.color)!,definition = current.snapshot.definitions.find(row => row.color.toUpperCase() === color);
      const matches = current.snapshot.memberships.filter(row => row.colorPinId === definition?.id && sameTarget(row.targetRef,target));
      if (matches.length > 1) fail(409,'GUI_COLOR_AMBIGUOUS','原颜色成员记录需要核对，没有更改其他位置。');
      if (operation.present && matches.length || !operation.present && !matches.length) return result('confirmed',false,{targetRef:target,membership:matches[0],definition});
      method = operation.present?'POST':'DELETE';path = prefix+'/color-pins/memberships'+(operation.present?'':'/'+encodeURIComponent(matches[0]!.id));
      body = operation.present?{targetRef:target,...(definition?{colorPinId:definition.id}:{color})}:undefined;
      if(!operation.present)deletedAlready=next=>!!next.snapshot&&!next.snapshot.memberships.some(member=>member.id===matches[0]!.id);
      confirm = (next,value) => !!next.snapshot && (operation.present ? next.snapshot.memberships.some(row => row.id === value?.membership?.id
        && sameTarget(row.targetRef,target) && sameTarget(value?.membership?.targetRef,target) && value?.membership?.projectId===options.projectId
        && value?.definition?.projectId===options.projectId && value?.definition?.color?.toUpperCase()===color && value.definition.id===row.colorPinId
        && next.snapshot!.definitions.some(d => d.id === row.colorPinId && d.color.toUpperCase() === color))
        : value?.deleted===true && value?.membershipId===matches[0]!.id && !next.snapshot.memberships.some(row => row.id === matches[0]!.id));
    } else {
      if (!current.snapshot) fail(503,'GUI_COLORS_UNAVAILABLE','颜色组暂时无法读取，没有提交修改。');
      if ('color' in operation) {
        const color = '#'+nativePinColorKey(operation.color)!,label=operation.label.trim();
        if (current.snapshot.definitions.some(row=>row.color.toUpperCase()===color))
          fail(409,'GUI_COLOR_LABEL_CHANGED','这个颜色组刚有了名称，请读取最新名称后再改。');
        const hasOriginalColor=current.nodes.some(node=>ordinaryNode(current,node)&&nativeCanvasGuiColors(node)?.includes(color.slice(1)));
        if (!hasOriginalColor) fail(409,'GUI_COLOR_GROUP_UNAVAILABLE','当前画布中没有这组普通节点颜色，没有另建空组。');
        method='POST';path=prefix+'/color-pins/definitions';body={color,label,expectedDefinitionId:null};
        confirm=(next,value)=>!!next.snapshot && value?.definition?.projectId===options.projectId
          && value.definition.color?.toUpperCase()===color && value.definition.label===label && text(value.definition.id)
          && next.snapshot.definitions.some(row=>row.id===value.definition.id&&row.color.toUpperCase()===color
            && row.label===label&&row.createdAt===value.definition.createdAt&&row.updatedAt===value.definition.updatedAt);
      } else {
        const definition = current.snapshot.definitions.find(row => row.id === operation.definitionId),label = operation.label.trim();
        if (!definition || definition.updatedAt !== operation.expectedUpdatedAt || (definition.label??null) !== operation.expectedLabel) fail(409,'GUI_COLOR_LABEL_CHANGED','颜色组名称刚有变化，请按最新名称再改。');
        if (definition.label === label) return result('confirmed',false,{definition});
        method='PATCH';path=prefix+'/color-pins/definitions/'+encodeURIComponent(operation.definitionId);
        body={label,expectedLabel:operation.expectedLabel,expectedUpdatedAt:operation.expectedUpdatedAt};
        confirm=(next,value)=>!!next.snapshot && value?.definition?.projectId===options.projectId && value?.definition?.id===operation.definitionId
          && next.snapshot.definitions.some(row=>row.id===operation.definitionId&&row.label===label&&row.updatedAt===value.definition.updatedAt);
      }
    }
    let response: NativeCanvasGuiCoreResponse | undefined;
    try {
      response = await options.requestCore(method,path,body);
      if (!ok(response)) {
        if(response.status===404&&deletedAlready){const next=await facts(expected);await unchanged(expected);if(deletedAlready(next))return result('confirmed',false,{targetRef:target,coreResponse:response,reason:'原记录已被移除，本次没有重复修改。'});}
        const definite = [400,401,403,404,405,409,422].includes(response.status);
        return result(definite?'rejected':'unknown',definite?false:undefined,{targetRef:target,coreResponse:response,...(!definite?{pending:true as const}:{}),reason:response.body?.error?.message??'原标记修改尚未确认。'});
      }
      const value=originalValue(response),next=await facts(expected);await unchanged(expected);
      if (!confirm(next,value)) return result('unknown',response.body?.meta?.changeSetId?true:undefined,{targetRef:target,coreResponse:response,pending:true,reason:'原修改回执尚未读回一致，没有自动重放。'});
      return result('confirmed',!!response.body?.meta?.changeSetId,{targetRef:target,coreResponse:response,changeSetId:response.body?.meta?.changeSetId,
        ...(operation.type==='SET_NAVIGATION_PIN'&&operation.pinned?{marker:value}:{}),
        ...(operation.type==='SET_COLOR_PIN'&&operation.present?{membership:value.membership,definition:value.definition}:{}),
        ...(operation.type==='RENAME_COLOR_PIN'?{definition:value.definition}:{})});
    } catch (cause) {
      return result('unknown',response&&ok(response)?!!response.body?.meta?.changeSetId:undefined,{targetRef:target,pending:true,...(response?{coreResponse:response}:{}),reason:'原修改结果尚未确认，请读取原记录；没有自动重放。'});
    }
  }
  return {capabilities,guiCapability,read,operate};
}
