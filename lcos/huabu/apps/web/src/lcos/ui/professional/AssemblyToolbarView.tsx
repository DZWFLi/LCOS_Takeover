import { Grid2X2, List } from 'lucide-react';
import { useId, useRef, useEffect } from 'react';

import { ASSEMBLY_FILTERS } from './assemblyPresentation';
import searchIcon from '../assets/search.svg';
import { LcosButton } from '../primitives/LcosButton';
import './professional-assembly.css';
import './tapnow-library.css';

import type { WarehouseSortV1 } from '@local-creative-os/contracts';
import { ASSEMBLY_ITEM_WIDTH } from './assemblyBrowseGeometry';
import type { AssemblyMaterialFilter } from './assemblyPresentation';

export interface AssemblyToolbarViewProps {
  readonly viewMode?: 'grid' | 'list';
  readonly onViewModeChange?: (mode: 'grid' | 'list') => void;
  readonly query: string;
  readonly placeholder: string;
  readonly onQueryChange: (query: string) => void;
  readonly onSearch: () => void;
  readonly onClear: () => void;
  readonly filter: AssemblyMaterialFilter;
  readonly onFilterChange: (filter: AssemblyMaterialFilter) => void;
  readonly showFilters?: boolean;
  readonly localSearch?: boolean;
  readonly itemWidth?: number;
  readonly onItemWidthChange?: (width: number) => void;
  readonly sort?: WarehouseSortV1;
  readonly onSortChange?: (sort: WarehouseSortV1) => void;
}
/** TapNow QM search/keyboard presentation; LCOS supplies source tabs and real search. */
export function AssemblyToolbarView({ viewMode = 'grid', onViewModeChange, query, placeholder, onQueryChange, onSearch, onClear, filter,
  onFilterChange, showFilters = true, localSearch = false, itemWidth = ASSEMBLY_ITEM_WIDTH.default, onItemWidthChange,
  sort = 'updated', onSortChange }: AssemblyToolbarViewProps): React.JSX.Element {
  const id = useId();
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent): void => {
      if (disclosure.current?.open && event.target instanceof Node && !disclosure.current.contains(event.target)) { disclosure.current.open = false; }
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  return <div className="lcos-assembly-toolbar">
    <form role="search" aria-label={placeholder} onSubmit={(event) => { event.preventDefault(); onSearch(); }}>
      <label className="lcos-assembly-search-field" htmlFor={id}>
        <img src={searchIcon} alt="" width={18} height={18} />
        <input id={id} type="search" enterKeyHint="search" autoComplete="off" data-lcos-assembly-search value={query}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            const body = event.currentTarget.closest('[data-lcos-assembly]');
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur(); }
            else if (event.key === 'ArrowDown') {
              const first = [...(body?.querySelectorAll<HTMLButtonElement>('.lcos-assembly-scroll button:not(:disabled)') ?? [])]
                .find(button => button.getClientRects().length > 0 && !button.closest('[hidden]'));
              if (first) { event.preventDefault(); first.focus(); }
            } else if (event.key === 'ArrowUp') {
              const source = body?.querySelector<HTMLButtonElement>('[data-lcos-assembly-source-tab][aria-pressed="true"]');
              if (source) { event.preventDefault(); source.focus(); }
            }
          }}
          onChange={(event) => onQueryChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
      </label>
      {!localSearch ? <LcosButton appearance="oreo" variant="secondary" type="submit" className="lcos-assembly-search-submit">搜索</LcosButton> : null}
      {query !== '' ? <LcosButton appearance="oreo" variant="ghost" onClick={onClear} aria-label="清除搜索">清除</LcosButton> : null}
    </form>
    {onViewModeChange && <div className="lcos-library-view-switch" role="group" aria-label="素材显示方式">
      <button type="button" aria-label="网格视图" aria-pressed={viewMode === 'grid'} onClick={() => onViewModeChange('grid')}><Grid2X2 size={15} /></button>
      <button type="button" aria-label="列表视图" aria-pressed={viewMode === 'list'} onClick={() => onViewModeChange('list')}><List size={15} /></button>
    </div>}
    {showFilters || onItemWidthChange ? <details ref={disclosure} className="lcos-assembly-filter" data-lcos-assembly-filter onKeyDownCapture={(event) => {
      if (event.key !== 'Escape' || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || !event.currentTarget.open) { return; }
      event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false;
      event.currentTarget.querySelector('summary')?.focus();
    }}>
      <summary>浏览设置{filter === 'all' ? '' : ` · ${ASSEMBLY_FILTERS.find((entry) => entry.value === filter)?.label}`}</summary>
      <div className="lcos-assembly-filter-popover" role="group" aria-label="浏览设置">
        {showFilters ? <><span>材料类型</span>
        <div>{ASSEMBLY_FILTERS.map((entry) => <LcosButton appearance="oreo" key={entry.value} variant="secondary"
          aria-pressed={filter === entry.value} onClick={(event) => {
            onFilterChange(entry.value);
            const disclosure = event.currentTarget.closest('details');
            if (disclosure) { disclosure.open = false; disclosure.querySelector('summary')?.focus(); }
          }}>{entry.label}</LcosButton>)}</div></> : null}
        {onSortChange ? <label className="lcos-assembly-setting">排序<select aria-label="材料排序" value={sort} onChange={(event) => onSortChange(event.target.value as WarehouseSortV1)}>
          <option value="updated">最近更新</option><option value="name">名称</option><option value="usage">使用次数</option>
        </select></label> : null}
        {onItemWidthChange ? <label className="lcos-assembly-setting">材料大小
          <input type="range" aria-label="材料大小" min={ASSEMBLY_ITEM_WIDTH.min} max={ASSEMBLY_ITEM_WIDTH.max} step={8}
            value={itemWidth} onChange={(event) => onItemWidthChange(Number(event.target.value))} />
        </label> : null}
      </div>
    </details> : null}
  </div>;
}
