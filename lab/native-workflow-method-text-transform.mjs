/** Keep the original material validation and editable method text. The complete
 * method travels as its original Scope address; submit resolves its contents. */
export function transformNativeWorkflowMethodText(source) {
  const normalized=source.replaceAll('\r\n','\n');
  const edits=[
    ["readonly prompt: string; readonly references:", "readonly prompt: string; readonly archivedAt?: string; readonly references:"],
    ["return { status: 'ready', prompt: text.join('\\n\\n'), references };", "return { status: 'ready', prompt: text.join('\\n\\n'), references: [{entityType:'scope',entityId:scopeId,mode:'full',displayLabel:scope.name}], ...((scope as {archivedAt?:string}).archivedAt === undefined ? {} : {archivedAt:(scope as {archivedAt?:string}).archivedAt}) };"],
    ["  const text = [`工作流方法：${scope.name}`, `来源 Project：${projectId}`, `来源 Scope：${scopeId}`];", "  const text = [`工作流方法：${scope.name}`];"],
    ['    text.push(`来源 Presentation：${method.id} · version ${method.version}`);', '    // Exact source identity remains in the canonical read and whole Scope reference.'],
    ["${branch.targetViewId ? `；目标：${branch.targetViewId}` : ''}", "${branch.targetViewId ? '；使用已绑定材料' : ''}"],
    ["${actionNames.get(edge.fromActionId) ?? edge.fromActionId}", "${actionNames.get(edge.fromActionId) || '未命名步骤'}"],
    ["${actionNames.get(edge.toActionId) ?? edge.toActionId}", "${actionNames.get(edge.toActionId) || '未命名步骤'}"],
    ["${operator.label || id} · ${operator.kind}", "${operator.label || '未命名结构'} · ${({condition:'条件分支','parallel-split':'分头进行','parallel-join':'汇合结果',reference:'材料说明'} as Record<string,string>)[operator.kind] ?? '结构说明'}"],
    ["    for (const id of method.state.memberViewIds) if (!(id in operators)) viewIds.add(id);", "    for (const id of method.state.memberViewIds) if (!(id in operators) || graph.artifactViews.some(view => String(view.id) === id)) viewIds.add(id);\n    for (const operator of Object.values(operators)) for (const branch of operator.branches ?? []) if (branch.targetViewId) viewIds.add(branch.targetViewId);"],
  ];
  if(edits.every(([,to])=>normalized.includes(to))&&edits.every(([from])=>!normalized.includes(from)))return source;
  for(const [from]of edits)if(normalized.split(from).length!==2)throw new Error('Original Workflow method text seam changed.');
  return edits.reduce((text,[from,to])=>text.replace(from,to),normalized);
}

export function transformNativeWorkflowMethodTake(source) {
  const from="  if (method.status !== 'ready') throw new Error(method.reason);";
  const to=from+"\n  if (method.archivedAt !== undefined) throw new Error('方法已移除，恢复后可继续使用。');";
  if(source.includes(to))return source;if(source.split(from).length!==2)throw new Error('Original method take seam changed.');return source.replace(from,to);
}

export function transformNativeWorkflowWarehouseQuery(source) {
  const from='  const params = new URLSearchParams();',to=from+"\n  if ((query as {scopeLifecycle?:string}).scopeLifecycle) params.set('scopeLifecycle',(query as {scopeLifecycle:string}).scopeLifecycle);";
  if(source.includes(to))return source;if(source.split(from).length!==2)throw new Error('Original Warehouse query seam changed.');return source.replace(from,to);
}
