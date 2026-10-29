/** Trimmed mature G1 paletteProvider/keymap mechanics. Entries are actions
 * supplied by existing owners, never project content or a new command store. */
export interface LcosLauncherAction {
  readonly id: string; readonly title: string; readonly hint?: string;
  readonly keywords?: string; readonly run: () => void;
}
export const ACTION_LAUNCHER_KEYS = { open: 'k', previous: 'ArrowUp', next: 'ArrowDown', execute: 'Enter' } as const;
export function rankLauncherActions(actions: readonly LcosLauncherAction[], query: string): LcosLauncherAction[] {
  const needle = query.trim().toLocaleLowerCase();
  return actions.map((action,index) => {
    const title = action.title.toLocaleLowerCase();
    const score = !needle ? 0 : title.startsWith(needle) ? 3 : title.includes(needle) ? 2
      : action.keywords?.toLocaleLowerCase().includes(needle) ? 1 : -1;
    return { action,index,score };
  }).filter(item => item.score >= 0).sort((a,b) => b.score - a.score || a.index - b.index)
    .slice(0,50).map(item => item.action);
}
export function moveLauncherSelection(current: number, count: number, delta: -1 | 1): number {
  return count ? (Math.min(Math.max(current,0),count-1) + delta + count) % count : 0;
}
