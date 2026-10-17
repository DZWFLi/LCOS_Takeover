import { resolveArtifactUrl } from '@/api/artifact';

import type { NavigationEntityIdentity } from './semanticNavigationLocations';

export interface RailwayMapMember extends NavigationEntityIdentity {
  readonly key: string;
  readonly label: string;
  readonly kind: string;
  readonly availability: string;
}
export interface RailwayMemberGeometry {
  readonly memberKey: string;
  readonly nodeId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly imageSrc?: string;
}
export interface RailwayMemberMapSnapshot {
  readonly canvasId?: string;
  readonly canvasLabel?: string;
  readonly geometry: readonly RailwayMemberGeometry[];
  readonly issue?: string;
}

/** GEN1 railMemberLayout: one real coordinate system; no seeded/fallback positions. */
export function railwayMemberMapLayout(geometry: readonly RailwayMemberGeometry[], limit = 12) {
  const valid = geometry.filter(item => [item.x,item.y,item.width,item.height].every(Number.isFinite)
    && item.width > 0 && item.height > 0);
  const shown = valid.slice(0, Math.max(0, limit));
  if (!shown.length) return { placed: [], overflow: valid.length };
  const left = Math.min(...shown.map(item => item.x));
  const top = Math.min(...shown.map(item => item.y));
  const spanX = Math.max(1, ...shown.map(item => item.x + item.width - left));
  const spanY = Math.max(1, ...shown.map(item => item.y + item.height - top));
  return { placed: shown.map(item => ({ ...item,
    left: 6 + ((item.x - left) / spanX) * 72,
    top: 7 + ((item.y - top) / spanY) * 64,
    mapWidth: Math.max(8, Math.min(24, (item.width / spanX) * 72)),
    mapHeight: Math.max(10, Math.min(28, (item.height / spanY) * 64)),
  })), overflow: valid.length - shown.length };
}

const kindLabel = (kind: string): string => ({ image:'图片', text:'文本', pdf:'PDF', presentation:'幻灯片',
  audio:'音频', video:'视频', file:'文件', artifact:'材料', note:'笔记', collection:'集合', scope:'范围',
  workspace:'工作现场', conversation:'会话', run:'任务' }[kind] ?? '引用');

/** Pure read-only view. Membership and geometry remain with their original owners. */
export function RailwayMemberMap({ members, snapshot, unresolvedCount = 0 }: {
  readonly members: readonly RailwayMapMember[];
  readonly snapshot: RailwayMemberMapSnapshot;
  readonly unresolvedCount?: number;
}): React.JSX.Element {
  const byKey = new Map(members.map(member => [member.key,member]));
  const validGeometry = snapshot.geometry.filter(item => byKey.has(item.memberKey)
    && [item.x,item.y,item.width,item.height].every(Number.isFinite) && item.width > 0 && item.height > 0);
  const layout = railwayMemberMapLayout(validGeometry);
  const located = new Set(validGeometry.map(item => item.memberKey));
  const missing = members.length - located.size + unresolvedCount;
  const distribution = new Map<string,number>();
  for (const member of members) distribution.set(member.kind,(distribution.get(member.kind) ?? 0) + 1);
  const total = members.length + unresolvedCount;
  return <div className="lcos-railway-member-map-summary" data-lcos-railway-member-map-summary>
    {layout.placed.length > 0 ? <div className="lcos-railway-member-map" data-lcos-railway-member-map={snapshot.canvasId}>
      <svg role="img" aria-label={`成员真实布局 · ${total} 个成员`} viewBox="0 0 100 82" width="100%" height="96" preserveAspectRatio="xMidYMid meet">
        {layout.placed.map(item => { const member = byKey.get(item.memberKey);
          if (!member) return null;
          return <g key={item.memberKey} data-lcos-railway-map-member={item.memberKey} data-member-kind={member.kind}
            data-member-availability={member.availability}>
            <title>{member.label} · {kindLabel(member.kind)}{member.availability === 'missing' ? ' · 原材料缺失' : ''}</title>
            <rect x={item.left} y={item.top} width={item.mapWidth} height={item.mapHeight} rx="2"
              fill="currentColor" fillOpacity={member.availability === 'missing' ? '.08' : '.16'} stroke="currentColor" strokeOpacity=".35"
              strokeDasharray={member.availability === 'missing' ? '2 2' : undefined} strokeWidth=".5" />
            {item.imageSrc && snapshot.canvasId && member.availability !== 'missing' &&
              <image href={resolveArtifactUrl(item.imageSrc,snapshot.canvasId)} x={item.left} y={item.top}
                width={item.mapWidth} height={item.mapHeight} preserveAspectRatio="xMidYMid meet" />}
          </g>;
        })}
        {layout.overflow > 0 && <text x="94" y="78" textAnchor="end" fontSize="9" fill="currentColor" data-lcos-railway-map-overflow>+{layout.overflow}</text>}
      </svg>
    </div> : total > 0 ? <p role="status" data-lcos-railway-geometry-missing>暂无成员空间布局数据</p> : null}
    <small data-lcos-railway-member-count>{total} 个成员
      {layout.overflow > 0 ? ` · 另有 ${layout.overflow} 项未绘出` : ''}
      {missing > 0 && layout.placed.length > 0 ? ` · ${missing} 项未在此现场定位` : ''}
      {unresolvedCount > 0 ? ` · ${unresolvedCount} 项引用暂不可解析` : ''}
    </small>
    {distribution.size > 0 && <span className="lcos-railway-member-kinds" data-lcos-railway-member-kinds>
      {[...distribution].map(([kind,count]) => <span key={kind}>{kindLabel(kind)} × {count}</span>)}
    </span>}
    {members.some(member => member.availability === 'missing') && <small role="status">部分原材料已缺失</small>}
    {snapshot.canvasLabel && layout.placed.length > 0 && <small className="lcos-railway-map-location">{snapshot.canvasLabel} · 真实成员位置</small>}
    {snapshot.issue && <small role="status" data-lcos-railway-geometry-status>{snapshot.issue}</small>}
  </div>;
}
