import type { WarehouseItemV1 } from '@local-creative-os/contracts';

export function isWorkflowCardItem(item: WarehouseItemV1): boolean {
  // LcosTaskCard is reserved for canonical Workflow actions. Ordinary
  // materials and sessions use separate compact reference/receiver lanes.
  return item.kind === 'workflow';
}

export function isWorkflowMaterialItem(item: WarehouseItemV1): boolean {
  return item.kind === 'artifact'
    || item.kind === 'resource'
    || item.kind === 'note'
    || item.kind === 'context'
    || item.kind === 'collection';
}

export function isWorkflowReceiverItem(item: WarehouseItemV1): boolean {
  return item.kind === 'conversation';
}

export function workflowCardMeta(item: WarehouseItemV1): string {
  switch (item.kind) {
    case 'workflow': return '工作流 · 卡牌';
    case 'artifact': return item.fileName === undefined ? '材料 · Artifact' : `材料 · ${item.fileName}`;
    case 'resource': return '材料 · Resource';
    case 'note': return '材料 · Note';
    case 'context': return '上下文 · 引用';
    case 'collection': return '集合 · 引用';
    default: return '引用';
  }
}
