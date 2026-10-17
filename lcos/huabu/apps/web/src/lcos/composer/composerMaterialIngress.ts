import { composerInputKey, restoredComposerCaret } from './composerInputJourney';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { useLcosShellStore } from '../shell/lcosShellStore';
import { LCOS_MATERIAL_TRANSFER_MIME, materialCitationBlock, parseMaterialTransfer } from '../ui/professional/donor/Gen1TextTransfer';

type IngressResult = {readonly claimed:false} | {readonly claimed:true;readonly ok:boolean;readonly message:string};

/** Reader drop/paste uses the same draft and citation as the explicit excerpt
 * action. This never imports a file, changes the receiver or submits a task. */
export function insertComposerMaterial(projectId:string, inputKey:string | undefined,
  transfer:Pick<DataTransfer,'types'|'getData'>, selection?:{readonly start:number;readonly end:number}):IngressResult {
  if (!Array.from(transfer.types).includes(LCOS_MATERIAL_TRANSFER_MIME)) return {claimed:false};
  const value=parseMaterialTransfer(transfer.getData(LCOS_MATERIAL_TRANSFER_MIME));
  const reject=(message:string):IngressResult=>({claimed:true,ok:false,message});
  if (!value) return reject('摘录无法识别，原输入保留。');
  const shell=useLcosShellStore.getState(),references=useLcosReferenceStore.getState();
  if (!inputKey || shell.projectId!==projectId || !shell.composerOpen || composerInputKey(shell.composerTarget)!==inputKey
    || references.projectId!==projectId) return reject('原输入已改变，未把摘录加入其他任务。');
  const source=value.source;
  if (source.projectId!==projectId || typeof source.artifactId!=='string' || !source.artifactId.trim()
    || typeof source.revisionId!=='string' || !source.revisionId.trim()) return reject('摘录的项目或版本来源尚未确认，原输入保留。');
  const text='text' in value.content && typeof value.content.text==='string' ? value.content.text : undefined;
  if (!text?.trim()) return reject('此摘录暂无正文，请在阅读器选择文字；原输入保留。');
  const admission=references.addEntitiesToDraft([{entityType:'artifact',entityId:source.artifactId,revisionId:source.revisionId,
    displayLabel:source.title,...(source.viewId ? {artifactViewId:source.viewId} : {})}],shell.composerTarget?.intent);
  if (admission.reason) return reject(admission.reason);
  const caret=selection ? {start:Math.max(0,Math.min(shell.composerPrompt.length,selection.start)),
    end:Math.max(0,Math.min(shell.composerPrompt.length,selection.end))}
    : restoredComposerCaret(shell.composerCaret,projectId,inputKey,shell.composerPrompt);
  const prefix=shell.composerPrompt.slice(0,caret.start),suffix=shell.composerPrompt.slice(caret.end);
  const insertion=`${prefix && !prefix.endsWith('\n') ? '\n\n' : ''}${materialCitationBlock(source,text)}${suffix ? '\n\n' : ''}`;
  const next=prefix+insertion+suffix;
  shell.setComposerPrompt(next);
  shell.rememberComposerCaret({projectId,targetKey:inputKey,text:next,start:prefix.length+insertion.length,end:prefix.length+insertion.length});
  return {claimed:true,ok:true,message:'摘录与同版本材料已加入输入，尚未发送。'};
}
