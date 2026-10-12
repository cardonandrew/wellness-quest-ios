/**
 * Wellness Quest Native Bridge
 *
 * Intercepts the app's ./actions RPC calls and routes them to the
 * on-device SQLite implementation (native-actions.js) instead of
 * a remote server. This makes the app fully offline and native.
 *
 * Load order in index.html:
 *   1. native-actions.js  (defines window.WellnessQuestNative)
 *   2. native-bridge.js   (this file — installs the fetch interceptor)
 *   3. app bundle         (makes ./actions calls, transparently intercepted)
 */
(function () {
  'use strict';

  // Wait for the native actions module to be ready
  function whenReady(callback) {
    if (window.WellnessQuestNative && window.WellnessQuestNative._initialized) {
      callback();
    } else {
      setTimeout(() => whenReady(callback), 50);
    }
  }

  // Check if a URL is an ./actions call
  function isActionsCall(url) {
    if (typeof url !== 'string') return false;
    // Matches: ./actions, /actions, actions, and absolute variants
    return url === './actions' ||
           url === '/actions' ||
           url === 'actions' ||
           url.endsWith('/actions') ||
           url.endsWith('./actions');
  }

  whenReady(() => {
    console.log('[native-bridge] Installing ./actions interceptor');

    const originalFetch = window.fetch.bind(window);

    window.fetch = async function (url, options) {
      const urlStr = typeof url === 'string' ? url : (url && url.url) || '';

      if (isActionsCall(urlStr) && options && options.method === 'POST') {
        try {
          const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
          const { action, args } = body;

          console.log(`[native-bridge] Routing action: ${action}`);

          const result = await window.WellnessQuestNative.callAction(action, args);

          // Return a Response-like object matching what the SDK expects
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (err) {
          console.error(`[native-bridge] Action failed:`, err);
          return new Response(JSON.stringify({
            error: err.message || 'Action failed',
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      // Not an actions call — pass through normally
      return originalFetch(url, options);
    };

    // Also intercept XMLHttpRequest for robustness
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._isActionsCall = isActionsCall(url) && method === 'POST';
      this._actionsUrl = url;
      return originalXHROpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (body) {
      if (this._isActionsCall) {
        const xhr = this;
        (async () => {
          try {
            const parsed = typeof body === 'string' ? JSON.parse(body) : body;
            const result = await window.WellnessQuestNative.callAction(parsed.action, parsed.args);

            // Simulate a successful XHR response
            Object.defineProperty(xhr, 'status', { value: 200, writable: false });
            Object.defineProperty(xhr, 'responseText', { value: JSON.stringify(result), writable: false });
            Object.defineProperty(xhr, 'response', { value: JSON.stringify(result), writable: false });
            Object.defineProperty(xhr, 'readyState', { value: 4, writable: false });

            if (xhr.onreadystatechange) xhr.onreadystatechange();
            if (xhr.onload) xhr.onload();
          } catch (err) {
            console.error(`[native-bridge] XHR action failed:`, err);
            Object.defineProperty(xhr, 'status', { value: 500, writable: false });
            Object.defineProperty(xhr, 'readyState', { value: 4, writable: false });
            if (xhr.onreadystatechange) xhr.onreadystatechange();
            if (xhr.onerror) xhr.onerror(err);
          }
        })();
        return;
      }
      return originalXHRSend.call(this, body);
    };

    console.log('[native-bridge] Interceptor installed — app is now fully offline-capable');
  });
})();
