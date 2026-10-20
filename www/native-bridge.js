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
 *
 * Two rules this file must never break:
 *   1. The interceptor is installed SYNCHRONOUSLY at script load. The app
 *      bundle runs `var an = $w()` at module evaluation and captures
 *      `globalThis.fetch` in a closure — if we waited for native init first
 *      (as the old version did), the capture would grab the ORIGINAL fetch
 *      and every ./actions call would bypass this bridge entirely.
 *   2. Responses match the server actions protocol: success is
 *      `{ data: result }`, failure is `{ error: message }`. The app client
 *      unwraps `l.data`, so returning the raw result breaks every call.
 */
(function () {
  'use strict';

  // --- readiness -----------------------------------------------------------
  // Resolves when native-actions.js has finished initializing the on-device
  // SQLite database. Rejects after READY_TIMEOUT_MS so a missing or broken
  // SQLite plugin surfaces as a clear error on the "Trail interrupted"
  // screen instead of hanging the app on "Setting your trail…" forever.
  // The promise is cached: after the first timeout, later calls fail fast.
  var READY_TIMEOUT_MS = 15000;
  var readyPromise = null;

  function whenReady() {
    if (!readyPromise) {
      readyPromise = new Promise(function (resolve, reject) {
        var started = Date.now();
        (function poll() {
          var native = window.WellnessQuestNative;
          if (native && native._initialized) {
            resolve();
          } else if (Date.now() - started > READY_TIMEOUT_MS) {
            var initErr = native && native._initError;
            reject(new Error(
              'WellnessQuest native layer did not initialize within ' + (READY_TIMEOUT_MS / 1000) + 's. ' +
              'The on-device SQLite plugin may be missing from the native build.' +
              (initErr ? ' Init error: ' + (initErr.message || initErr) : '')
            ));
          } else {
            setTimeout(poll, 100);
          }
        })();
      });
    }
    return readyPromise;
  }

  // Normalize a fetch URL (string or Request-like object) to a string
  function normalizeUrl(url) {
    if (typeof url === 'string') return url;
    if (url && typeof url.url === 'string') return url.url;
    return '';
  }

  // Check if a URL is an ./actions call
  function isActionsCall(url) {
    url = normalizeUrl(url);
    if (typeof url !== 'string' || url === '') return false;
    // Matches: ./actions, /actions, actions, and absolute variants
    return url === './actions' ||
           url === '/actions' ||
           url === 'actions' ||
           url.endsWith('/actions') ||
           url.endsWith('./actions');
  }

  // Per-call timeout: a hanging native action (e.g. a SQLite promise that
  // never settles) must surface as the visible "Trail interrupted" error
  // instead of infinite loading. whenReady() already bounds initialization;
  // this bounds each individual action call.
  var CALL_TIMEOUT_MS = 20000;
  function callActionWithTimeout(action, args) {
    return Promise.race([
      window.WellnessQuestNative.callAction(action, args),
      new Promise(function (_, reject) {
        setTimeout(function () {
          reject(new Error('Action "' + action + '" timed out after 20s'));
        }, CALL_TIMEOUT_MS);
      }),
    ]);
  }

  function successResponse(result) {
    return new Response(JSON.stringify({ data: result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function errorResponse(err) {
    return new Response(JSON.stringify({
      error: (err && err.message) || 'Action failed',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Install the fetch interceptor synchronously — see rule 1 above.
  var originalFetch = window.fetch.bind(window);

  window.fetch = async function (url, options) {
    var urlStr = normalizeUrl(url);

    if (isActionsCall(urlStr) && options && options.method === 'POST') {
      try {
        await whenReady();

        var body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        var action = body.action;
        var args = body.args;

        console.log('[native-bridge] Routing action: ' + action);

        var result = await callActionWithTimeout(action, args);

        // Return a Response matching what the app client expects ({ data })
        return successResponse(result);
      } catch (err) {
        console.error('[native-bridge] Action failed:', err);
        return errorResponse(err);
      }
    }

    // Not an actions call — pass through normally
    return originalFetch(url, options);
  };

  // Also intercept XMLHttpRequest for robustness.
  // Prototype-level patching applies regardless of capture timing.
  var originalXHROpen = XMLHttpRequest.prototype.open;
  var originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    var rest = Array.prototype.slice.call(arguments, 2);
    this._isActionsCall = isActionsCall(url) && method === 'POST';
    this._actionsUrl = url;
    return originalXHROpen.apply(this, [method, url].concat(rest));
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (this._isActionsCall) {
      var xhr = this;
      (async function () {
        try {
          await whenReady();

          var parsed = typeof body === 'string' ? JSON.parse(body) : body;
          var result = await callActionWithTimeout(parsed.action, parsed.args);

          // Simulate a successful XHR response ({ data } shape)
          var text = JSON.stringify({ data: result });
          Object.defineProperty(xhr, 'status', { value: 200, writable: false });
          Object.defineProperty(xhr, 'responseText', { value: text, writable: false });
          Object.defineProperty(xhr, 'response', { value: text, writable: false });
          Object.defineProperty(xhr, 'readyState', { value: 4, writable: false });

          if (xhr.onreadystatechange) xhr.onreadystatechange();
          if (xhr.onload) xhr.onload();
        } catch (err) {
          console.error('[native-bridge] XHR action failed:', err);
          Object.defineProperty(xhr, 'status', { value: 500, writable: false });
          Object.defineProperty(xhr, 'responseText', {
            value: JSON.stringify({ error: (err && err.message) || 'Action failed' }),
            writable: false,
          });
          Object.defineProperty(xhr, 'readyState', { value: 4, writable: false });
          if (xhr.onreadystatechange) xhr.onreadystatechange();
          if (xhr.onerror) xhr.onerror(err);
        }
      })();
      return;
    }
    return originalXHRSend.call(this, body);
  };

  console.log('[native-bridge] Interceptor installed synchronously — app is now fully offline-capable');
})();
