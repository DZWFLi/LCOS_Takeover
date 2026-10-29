(() => {
  const originalFetch = window.fetch.bind(window);
  const stripQuery = value => {
    try {
      const url = new URL(String(value), location.href);
      return url.origin === 'null' ? url.protocol + '//' + url.host + url.pathname : url.origin + url.pathname;
    } catch { return String(value).slice(0, 250); }
  };
  const localOrigin = location.origin;
  const send = (kind, detail) => {
    originalFetch('/api/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'renderer', kind, detail }), credentials: 'omit'
    }).catch(() => {});
  };
  send('diagnostics-installed', { backend: 'not-connected', renderer: 'original-installed-bundle' });
  addEventListener('securitypolicyviolation', event => send('csp-blocked', {
    directive: event.effectiveDirective, blockedURI: stripQuery(event.blockedURI),
    sourceFile: stripQuery(event.sourceFile), lineNumber: event.lineNumber
  }));
  addEventListener('error', event => send('page-error', {
    message: String(event.message || 'Resource failed to load.').slice(0, 500),
    filename: stripQuery(event.filename || event.target?.src || ''),
    lineNumber: event.lineno || 0
  }), true);
  addEventListener('unhandledrejection', event => send('unhandled-rejection', {
    message: String(event.reason?.message || event.reason || 'Unknown rejection').slice(0, 500)
  }));
  window.fetch = function (input, init) {
    const raw = input instanceof Request ? input.url : input;
    let url;
    try { url = new URL(String(raw), location.href); }
    catch { return originalFetch(input, init); }
    if (url.origin !== localOrigin && url.protocol !== 'data:') {
      send('remote-fetch-attempt', {
        url: stripQuery(url), method: init?.method || (input instanceof Request ? input.method : 'GET')
      });
      send('remote-fetch-blocked', { url: stripQuery(url) });
      return Promise.reject(new TypeError('Offline experiment blocks remote fetch.'));
    }
    return originalFetch(input, init).then(response => {
      if (!response.ok) send('http-failed', { url: stripQuery(url), status: response.status });
      return response;
    }).catch(error => {
      send('fetch-failed', { url: stripQuery(url), message: String(error.message).slice(0, 250) });
      throw error;
    });
  };
  const originalOpen = window.open.bind(window);
  window.open = function (value, ...options) {
    let target;
    try { target = new URL(String(value || ''), location.href); }
    catch { send('navigation-blocked', { target: 'invalid-url' }); return null; }
    if (target.origin !== localOrigin || !['http:', 'https:'].includes(target.protocol)) {
      send('navigation-blocked', { target: stripQuery(target) });
      return null;
    }
    return originalOpen(target.href, ...options);
  };
  document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a[href]');
    if (!anchor) return;
    let target;
    try { target = new URL(anchor.href, location.href); }
    catch { event.preventDefault(); return; }
    const localFileDownload = target.origin === localOrigin && target.protocol === 'blob:'
      && anchor.hasAttribute('download') && anchor.download.trim().length > 0;
    if (!localFileDownload && (target.origin !== localOrigin || !['http:', 'https:'].includes(target.protocol))) {
      event.preventDefault();
      event.stopImmediatePropagation();
      send('navigation-blocked', { target: stripQuery(target) });
    }
  }, true);
})();

