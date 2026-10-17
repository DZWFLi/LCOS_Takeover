// TapNow bCe/q0e/Y0e: 80/60px selected/idle strip, four-column result grid,
// focus/grid switch. Canonical collection members and their preview loader are injected.
import { useState, type ReactNode } from 'react';
import { Grid2X2, Image } from 'lucide-react';
import { Button } from '@/components/Common/Button';
import './reader-media-results.css';

export function ReaderMediaResultsView({ items }: { readonly items: readonly {
  readonly id: string; readonly title: string; readonly preview: ReactNode; readonly thumbnail?: ReactNode; readonly onOpen: () => void;
}[] }): React.JSX.Element {
  const [mode, setMode] = useState<'detail' | 'grid'>('detail');
  const [selectedId, setSelectedId] = useState(items[0]?.id);
  const active = items.find(item => item.id === selectedId) ?? items[0];
  return <section className="lcos-reader-media-results" aria-label="集合图片浏览">
    <div className="lcos-reader-results-tools"><span>{items.length} 张图片</span>
      <div role="group" aria-label="图片浏览方式"><Button variant="ghost" iconOnly aria-label="图片聚焦视图" aria-pressed={mode === 'detail'} onClick={() => setMode('detail')}><Image size={16} /></Button>
        <Button variant="ghost" iconOnly aria-label="图片网格视图" aria-pressed={mode === 'grid'} onClick={() => setMode('grid')}><Grid2X2 size={16} /></Button></div></div>
    {mode === 'grid' ? <div className="lcos-reader-results-grid">{items.map(item => <div key={item.id} className="lcos-reader-results-tile">
      <div tabIndex={0} role="button" aria-label={`聚焦 ${item.title}`} onClick={() => { setSelectedId(item.id); setMode('detail'); }}
        onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSelectedId(item.id); setMode('detail'); } }}>{item.thumbnail ?? item.preview}</div>
      <span title={item.title}>{item.title}</span></div>)}</div>
      : active ? <><div className="lcos-reader-results-detail" data-lcos-media-result={active.id}>{active.preview}</div>
        <div className="lcos-reader-results-strip" aria-label="集合图片">{items.map(item => <div key={item.id} tabIndex={0} role="button"
          aria-label={`查看 ${item.title}`} aria-pressed={item.id === active.id} className="lcos-reader-results-thumb"
          onClick={() => setSelectedId(item.id)} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSelectedId(item.id); } }}>{item.thumbnail ?? item.preview}</div>)}</div>
        <div className="lcos-reader-results-footer"><span>{active.title}</span><Button size="sm" onClick={active.onOpen}>打开阅读器</Button></div></>
      : <p role="status">这个集合还没有可浏览的图片。</p>}
  </section>;
}
