type Node = { id: string; type?: string; data?: Record<string, any> };
type Document = { node: Node; title: string; entries: any[]; [key: string]: any };
const plain = (value: unknown) => typeof value === 'string' ? value : '';
const familyNames: Record<string, string> = { conversation: '智能体', collection: '集合', task: '任务', file: '文件', other: '其他' };
export function nativeSearchFamily(node: Node, original?: (node: Node) => string): string {
  if (node.type === 'lcos-conversation' || node.data?.lcos_conversation_ref) return 'conversation';
  if (node.type === 'lcos-execution' || node.data?.lcos_execution_ref) return 'task';
  if (node.type === 'pile' || node.data?.lcos_collection_ref) return 'collection';
  if (node.data?.lcos_file_ref && !['image','video','audio'].includes(node.type ?? '')) return 'file';
  return original?.(node) || node.type || 'other';
}
export function nativeSearchDescription(node: Node): string {
  const data = node.data ?? {}, family = nativeSearchFamily(node);
  if (family === 'conversation') return data.lcos_conversation_state?.isRunning ? '智能体 · 正在回复'
    : data.lcos_conversation_state?.waitingReason ? '智能体 · 等待处理' : '智能体对话';
  if (family === 'collection') return Array.isArray(data.memberIds) ? `集合 · ${data.memberIds.length} 项内容` : '集合';
  if (family === 'task') {
    const status = data.lcos_execution_facts?.execution?.status;
    const label = ({ created: '尚未开始', queued: '等待开始', running: '进行中', waiting_input: '等你回复',
      waiting_review: '等待确认', completed: '已完成', succeeded: '已完成', failed: '需要处理', cancelled: '已取消' } as Record<string,string>)[status];
    return label ? '任务 · ' + label : '任务';
  }
  const content = plain(data.text) || plain(data.content) || plain(data.prompt) || plain(data.params?.prompt);
  if (content.trim()) return content.replace(/\s+/g, ' ').trim().slice(0, 240);
  return ({ image: '图片', video: '视频', audio: '音频', text: '空白文本', note: '空白文本', file: '文件', group: '分组', world: 'World' } as Record<string,string>)[family] ?? '画布内容';
}

/** Presentation for the original search builder only. Never edit actual nodes,
 * copy backend IDs into search text, or introduce another selection/camera owner. */
export function LCOSNativeSearchDocuments(nodes: Node[], original: (nodes: Node[]) => Document[]): Document[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const projected = nodes.map(node => {
    const family = nativeSearchFamily(node), data = node.data ?? {};
    const title = plain(data.title).trim() || familyNames[family] || ({ text: '文本', note: '文本', image: '图片', video: '视频', audio: '音频', group: '分组' } as Record<string,string>)[family] || '画布内容';
    return { ...node, data: { ...data, title, text: plain(data.text) || plain(data.content) || nativeSearchDescription(node) } };
  });
  return original(projected).map(document => ({ ...document, node: byId.get(document.node.id) ?? document.node }));
}
export function LCOSNativeSearchFilter(documents: Document[], kind: string, originalFamily: (node: Node) => string): Document[] {
  return kind === 'all' ? documents : documents.filter(document => nativeSearchFamily(document.node, originalFamily) === kind);
}
export function LCOSNativeSearchFilters(original: any[], documents: Document[], originalFamily: (node: Node) => string, icons: Record<string, any>) {
  const families = new Set(documents.map(document => nativeSearchFamily(document.node, originalFamily)));
  const extras = Object.entries(familyNames).map(([id, fallback]) => ({ id, fallback, labelKey: 'lcos.nodeSearch.' + id, icon: icons[id] ?? icons.file }));
  const known = new Set([...original, ...extras].map(item => item.id));
  const unknown = [...families].filter(id => !known.has(id));
  const available = [...original, ...extras, ...unknown.map(id => ({ id, fallback: '其他', labelKey: 'lcos.nodeSearch.other', icon: icons.file }))];
  return available.filter(item => item.id === 'all' || families.has(item.id));
}
export function LCOSNativeSearchSummary(result: any, query: string): string {
  // When the original matcher found body/prompt text, show that actual match.
  if (query.trim() && result.field !== 'title' && plain(result.preview).trim()) return result.preview;
  return nativeSearchDescription(result.document.node);
}
