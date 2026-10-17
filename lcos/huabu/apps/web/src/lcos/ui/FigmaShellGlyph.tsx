// 原始矢量来自 nFUdroLvI5qJZuYTW8h2rF；出处逐项列于 assets/README.md。
// 仅呈现既有身份，不按标题、节点数据或文件名推断业务物种。
import bench from './assets/bench.svg?url';
import collection from './assets/collection.svg?url';
import context from './assets/context.svg?url';
import disabled from './assets/disabled.svg?url';
import empty from './assets/empty.svg?url';
import error from './assets/error.svg?url';
import focus from './assets/focus.svg?url';
import grid from './assets/grid.svg?url';
import loading from './assets/loading.svg?url';
import normal from './assets/normal.svg?url';
import pinBody from './assets/pin-body.svg?url';
import pinHighlight from './assets/pin-highlight.svg?url';
import plus from './assets/plus.svg?url';
import project from './assets/project.svg?url';
import recovery from './assets/recovery.svg?url';
import root from './assets/root.svg?url';
import search from './assets/search.svg?url';
import workflow from './assets/workflow.svg?url';

const GLYPHS = { bench, collection, context, disabled, empty, error, focus,
  grid, loading, normal, plus, project, recovery, root, search, workflow } as const;
export type FigmaShellGlyphName = keyof typeof GLYPHS;

export function FigmaShellGlyph({ name, size = 21, className, monochrome = false }: {
  readonly name: FigmaShellGlyphName;
  readonly size?: number;
  readonly className?: string;
  /** Opt-in for single-ink exported glyphs; never recolours multi-colour assets. */
  readonly monochrome?: boolean;
}): React.JSX.Element {
  if (monochrome) {
    return <span data-lcos-figma-glyph={name} data-lcos-glyph-monochrome
      className={className} aria-hidden="true" style={{
        display: 'block', width: size, height: size, flexShrink: 0,
        backgroundColor: 'currentColor', maskImage: `url("${GLYPHS[name]}")`,
        WebkitMaskImage: `url("${GLYPHS[name]}")`, maskSize: '100% 100%',
        WebkitMaskSize: '100% 100%', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat',
      }} />;
  }
  return <img data-lcos-figma-glyph={name} className={className}
    src={GLYPHS[name]} alt="" aria-hidden draggable={false} width={size} height={size}
    style={{ display: 'block', width: size, height: size, flexShrink: 0 }} />;
}

/** 两个原始子图层：形状用 alpha mask 接受真实 canonical color；高光单独保留。 */
export function FigmaPinMark({ color }: { readonly color: string }): React.JSX.Element {
  return (
    <span data-lcos-pin-mark aria-hidden>
      <span data-lcos-pin-shape style={{ backgroundColor: color,
        maskImage: `url("${pinBody}")`, WebkitMaskImage: `url("${pinBody}")` }} />
      <img data-lcos-pin-highlight src={pinHighlight} alt="" draggable={false} width={14} height={4} />
    </span>
  );
}
