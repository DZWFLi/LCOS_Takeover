// TEST-ONLY. This scene imports shipped Views and the actual motion/react package.
// No Core/ReactFlow data is simulated as a production result.
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ContextAtlasView } from '/src/lcos/ui/context/ContextAtlasView';
import { ContextCollectionView } from '/src/lcos/ui/context/ContextCollectionView';
import { WorkflowHandView } from '/src/lcos/ui/workflow/WorkflowHandView';
import { WorkflowTaskCardView } from '/src/lcos/ui/workflow/WorkflowTaskCardView';
import { TemporalRailView } from '/src/lcos/ui/context/TemporalRailView';
import { PortalPreviewView } from '/src/lcos/ui/professional/PortalPreviewView';

const cover = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="214"><rect width="200" height="214" fill="#dce9e1"/><text x="18" y="110" font-size="16">测试材料</text></svg>')}`;
const labels = ['品牌原点', '关于山野', '研究与访谈', '主视觉探索', '语气与文字', '准备出发'];
const temporal = [{ id:'one', label:'测试组一', ratio:.15 }, { id:'two', label:'不可用组', ratio:.5, disabled:true }, { id:'three', label:'测试组三', ratio:.8 }];
function Scene() {
  const [atlas, setAtlas] = useState(false);
  const [hand, setHand] = useState(false);
  const [deckCount, setDeckCount] = useState(5);
  const [takes, setTakes] = useState(0);
  const [enters, setEnters] = useState(0);
  const [shifts, setShifts] = useState(0);
  const [pane, setPane] = useState<'atlas'|'hand'|'temporal'|'portal'>('atlas');
  const [portalState, setPortalState] = useState<'旧缓存'|'部分预览'>('旧缓存');
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Explicit test owner, not a replacement for production overlay/nav ownership.
      if (event.key === 'Escape' && !event.defaultPrevented) { setAtlas(false); setHand(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return <MotionConfig reducedMotion="user">
    <div className="test-controls">
      <b>Stage7 组件验证 · 测试数据，不是生产工作现场</b>
      <button id="atlas-toggle" onClick={()=>{setPane('atlas');setAtlas(v=>!v);}}>集合总览</button>
      <button id="hand-toggle" onClick={()=>{setPane('hand');setHand(v=>!v);}}>手牌</button>
      <button id="many-cards" onClick={()=>setDeckCount(24)}>24 张卡</button>
      <button id="temporal-show" onClick={()=>setPane('temporal')}>时间轨</button>
      <button id="portal-show" onClick={()=>setPane('portal')}>目标预览</button>
      <button id="portal-next" onClick={()=>setPortalState('部分预览')}>部分预览</button>
      <output id="takes">{takes}</output><output id="enters">{enters}</output><output id="shifts">{shifts}</output>
    </div>
    <motion.div id="engine-probe" initial={{x:0}} animate={{x:100}} transition={{duration:1,ease:'linear'}} style={{position:'fixed',left:0,top:80,width:4,height:4}} />
    {pane === 'atlas' ? <AnimatePresence initial={false} mode="sync">
      {atlas ? <ContextAtlasView key="atlas" onClose={()=>setAtlas(false)} header={<><span>6 个集合</span><button className="lcos-atlas-close" aria-label="收回 Atlas" onClick={()=>setAtlas(false)}>×</button></>}>
        <div className="lcos-atlas-grid">{labels.map((label,i)=><ContextCollectionView key={label} title={label} onActivate={()=>setEnters(n=>n+1)} organization={i%2?'时间':'事情'} previewUrl={cover} secondaryPreviewUrl={cover} action={<button aria-label={`进入${label}`} onClick={()=>setEnters(n=>n+1)}>进入</button>} />)}</div>
      </ContextAtlasView> : null}
    </AnimatePresence> : null}
    {pane==='hand' ? <WorkflowHandView open={hand} header={<><span>工作流</span><button className="lcos-workflow-hand-close" aria-label="收回手牌" onClick={()=>setHand(false)}>×</button></>}>
      <div className="lcos-workflow-hand-pool"><div className="lcos-workflow-hand-cards">{Array.from({length:deckCount},(_,i)=><WorkflowTaskCardView key={i} title={`测试任务 ${i+1}`} state="静息" previewUrl={cover} onUse={()=>setTakes(n=>n+1)} />)}</div></div>
    </WorkflowHandView> : null}
    {pane==='temporal' ? <TemporalRailView items={temporal} scopeKey="test" onWindowShift={()=>setShifts(n=>n+1)} onActivate={()=>setEnters(n=>n+1)}/> : null}
    {pane==='portal' ? <div className="test-portal"><PortalPreviewView state={portalState} title="目标场景" onRetry={()=>setTakes(n=>n+1)} onZoom={()=>setShifts(n=>n+1)}><div data-lcos-real-portal-preview><button id="native-preview">内部预览动作</button></div></PortalPreviewView></div> : null}
  </MotionConfig>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Scene/></StrictMode>);
