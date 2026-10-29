(() => {
  let activeHost = null;
  let activeController = null;
  function bindRecoveredWorkbench(element) {
    if (element === activeHost) return;
    activeController?.destroy(); activeController = null; activeHost = element;
    if (!element) return;
    element.textContent = '组件模块加载中…';
    import('/lab/adoption/workbench.mjs').then(async module => {
      if (activeHost !== element) return;
      const controller = await module.mountAdoptionWorkbench(element, { compact: true });
      if (activeHost !== element) controller.destroy(); else activeController = controller;
    }).catch(error => {
      if (activeHost === element) element.textContent = '组件载入失败：' + error.message;
    });
  }
  function renderAdoptionPanel(runtime) {
    return runtime.jsx('aside', {
      'data-lcos-panel': 'gen2-component-adoption', 'aria-label': 'Gen2 原组件试接',
      style: { position: 'absolute', right: 12, top: 64, bottom: 12,
        width: 'min(520px, calc(100vw - 110px))', padding: 12, overflow: 'auto',
        background: '#171c21', color: '#e9edf1', border: '1px solid #39424a', borderRadius: 12, zIndex: 20 },
      children: runtime.jsx('div', { ref: bindRecoveredWorkbench })
    });
  }
  Object.defineProperty(window, '__LCOS_CUSTOM_PANEL__', {
    value: Object.freeze({ render: renderAdoptionPanel }), writable: false, configurable: false
  });
})();
