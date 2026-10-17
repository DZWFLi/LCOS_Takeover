(() => {
  window.__LCOS_CUSTOM_PANEL__ = { render: () => null };
  window.__LCOS_NODE_LAB__ = { mode: 'fixture-writes-only', canvasId: null, api: null };
  // UI connection lifetime only, not another Core/domain event bus.
  const notifyBridgeLifetime = () => {
    if (typeof window.dispatchEvent === 'function' && typeof window.Event === 'function') {
      window.dispatchEvent(new window.Event('lcos-native-bridge-changed'));
    }
  };
  window.__LCOS_NODE_BRIDGE_HOST__ = {
    connect({ canvasId, api }) {
      window.__LCOS_NODE_LAB__.canvasId = canvasId;
      window.__LCOS_NODE_LAB__.api = api;
      notifyBridgeLifetime();
      return () => {
        if (window.__LCOS_NODE_LAB__.api === api) {
          window.__LCOS_NODE_LAB__.api = null;
          window.__LCOS_NODE_LAB__.canvasId = null;
          notifyBridgeLifetime();
        }
      };
    }
  };
})();
