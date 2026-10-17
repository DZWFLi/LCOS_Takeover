import type { ComponentType, ReactNode } from 'react';
export interface TapnowPinColor {id:string;hex:string;nameKey:string}
export interface TapnowPinGroup {groupId:string;group:TapnowPinColor;nodeIds:string[];count:number}
export function createTapnowPinParts(dependencies: Record<string, unknown>): {
 palette: TapnowPinColor[];
 ColorDot: ComponentType<{hex:string;selected?:boolean;className?:string;ariaLabel?:string;onClick?:()=>void}>;
 MultiPin: ComponentType<{pins:string[]}>;
 GroupChip: ComponentType<{group:TapnowPinGroup;open:boolean;onOpenChange:(open:boolean)=>void;canDownload:boolean;onDownload:()=>void;onRemoveAllNodes:(id:string)=>void;customName?:string;onRename:(id:string,label:string)=>void;renameDisabled?:boolean}>;
 GroupMenu: ComponentType<{children:ReactNode}>;
};
