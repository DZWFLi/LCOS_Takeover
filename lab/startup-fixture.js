(() => {
  'use strict';

  const fixtureId = 'offline-fixture-canvas';
  const fixturePath = '/canvas/' + fixtureId;
  const showFixtureDiagnostics = location.pathname.startsWith('/renderer/')
    || new URLSearchParams(location.search).get('diagnostics') === '1';
  const fixtureUser = Object.freeze({
    user_id: 'offline-fixture-user',
    user_name: '离线演示用户',
    email: 'offline-fixture@local.invalid',
    org_id: 'offline-fixture-org',
    org_name: '本地 Fixture',
    email_verified: false
  });

  // Mask credential reads without deleting or changing browser storage.
  if (typeof Storage !== 'undefined' && Storage.prototype &&
      typeof Storage.prototype.getItem === 'function') {
    const originalGetItem = Storage.prototype.getItem;
    Object.defineProperty(Storage.prototype, 'getItem', {
      configurable: true,
      writable: true,
      value: function (key) {
        if (key === 'access_token' || key === 'refresh_token') return null;
        return Reflect.apply(originalGetItem, this, [key]);
      }
    });
  }

  if (window.location.pathname === '/takeover/' || window.location.pathname === '/renderer/') {
    window.history.replaceState(window.history.state, '', fixturePath);
  }

  function mountFixtureBadge() {
    if (document.documentElement.dataset.lcosTheme === 'light' && !showFixtureDiagnostics) return;
    if (document.getElementById('lcos-offline-fixture-badge')) return;
    const host = document.createElement('div');
    host.id = 'lcos-offline-fixture-badge';
    const shadow = host.attachShadow({ mode: 'open' });
    const badge = document.createElement('div');
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-live', 'polite');
    badge.textContent = 'LOCAL FIXTURE · READ ONLY · BILLING NOT CONNECTED';
    const style = document.createElement('style');
    style.textContent = ':host { all: initial; position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; }' +
      'div { box-sizing: border-box; padding: 9px 12px; border: 1px solid #d9a441;' +
      'border-radius: 8px; background: #231d10; color: #ffe2a6; font: 700 11px/1.2 ' +
      'ui-sans-serif, system-ui, sans-serif; letter-spacing: .06em; box-shadow: 0 3px 14px #0006; }';
    shadow.append(style, badge);
    document.documentElement.append(host);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountFixtureBadge, { once: true });
  } else {
    mountFixtureBadge();
  }

  const bootstrap = store => {
    if (!store || typeof store.getState !== 'function' || typeof store.setState !== 'function') {
      throw new Error('Offline fixture could not bind to the renderer auth store.');
    }
    const state = store.getState();
    if (!state || typeof state.refreshUserInfo !== 'function') {
      throw new Error('Offline fixture auth store shape changed; refusing to continue.');
    }

    const refreshFixtureIdentity = async () => {
      store.setState({ userInfo: fixtureUser, authState: 'authenticated', isLoading: false });
      return fixtureUser;
    };
    store.setState({
      userInfo: fixtureUser,
      authState: 'authenticated',
      isLoading: false,
      refreshUserInfo: refreshFixtureIdentity,
      updateAuthState: refreshFixtureIdentity,
      setTokenAndRefresh: async () => {
        throw new Error('Authentication is disabled in the local fixture.');
      }
    });

    // BrowserRouter reads the current path when the original renderer mounts.
    if (window.location.pathname !== fixturePath) {
      window.history.replaceState(window.history.state, '', fixturePath);
    }
    mountFixtureBadge();
  };

  Object.defineProperty(window, '__LCOS_OFFLINE_TAKEOVER__', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({ mode: 'fixture-only', fixtureId, fixturePath, bootstrap })
  });
})();
