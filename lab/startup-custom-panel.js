(() => {
  function renderCanvasInspector(runtime) {
    const element = runtime.jsx;
    return element('aside', {
      'data-lcos-panel': 'editable-canvas-component',
      'aria-label': 'LCOS 本地工作台',
      style: { position: 'absolute', right: 12, top: 64, bottom: 12, width: 340, padding: 20,
        background: '#171c21', color: '#e9edf1', border: '1px solid #39424a', borderRadius: 12,
        zIndex: 20, overflow: 'auto', fontFamily: 'system-ui' },
      children: [
        element('h2', { style: { margin: '0 0 12px', fontSize: 18 }, children: 'LCOS · 本地工作台' }, 'title'),
        element('p', { style: { color: '#eac276' }, children: '可编辑组件实验 / Core 未连接' }, 'state'),
        element('p', { children: '这是接入原 Canvas 页面挂载点的本地模块，不是另画一张画布。原节点、缩放与素材库仍由安装版组件渲染。' }, 'explanation'),
        element('details', { children: [
          element('summary', { style: { cursor: 'pointer', padding: '10px 0' }, children: '展开接管边界' }, 'summary'),
          element('p', { children: '已替换原 Agent 聊天侧栏；尚未承接保存、文件字节、生成或任何原生系统动作。' }, 'content')
        ] }, 'details'),
        element('a', { href: '/api/compat/status', target: '_blank', rel: 'noopener', style: { color: '#a8cfef' }, children: '查看本地只读适配状态' }, 'status-link')
      ]
    });
  }
  Object.defineProperty(window, '__LCOS_CUSTOM_PANEL__', {
    value: Object.freeze({ render: renderCanvasInspector }), writable: false, configurable: false
  });
})();
