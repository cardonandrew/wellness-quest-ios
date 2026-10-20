/**
 * Wellness Quest — Tunnel Host (standalone native bridge)
 *
 * How the app actually talks (discovered by tracing the shipped bundle):
 * the app code runs inside a sandboxed "CVM" bundle whose prelude replaces
 * window.fetch / XMLHttpRequest / WebSocket with tunnel implementations.
 * Every relative HTTP request is forwarded as a MessagePort message
 *   { type: "http.req", id, method, path, headers: [[k, v]], bodyB64 }
 * and the promise only settles when the HOST replies
 *   { type: "http.res", id, status, headers: [[k, v]], bodyB64 }
 * (or { type: "http.res", id, error: { message } }).
 *
 * Handshake: the bundle announces { type: "bundle:ready" } to
 * window.parent every 120 ms until the host answers by posting
 * { type: "bundle:init-port" } with a transferred MessagePort.
 *
 * In the original hosted runtime that host was the surrounding page. In
 * this standalone app the page is top-level (window.parent === window),
 * so the host lives here: this script loads before the bundle, answers
 * the announce with a MessageChannel port, and serves the app's
 * ./actions requests from the on-device SQLite layer
 * (native-actions.js -> window.WellnessQuestNative).
 *
 * Build 111 additions:
 * - Splash floor: the first loadApp response is held until ~1.5 s after
 *   page start so the "Setting your trail…" screen reads as a proper
 *   splash instead of flashing past (or never appearing) on fast loads.
 * - Fixed-to-size CSS: once the tunnel attaches, the bundle adapts to
 *   its old hosted layout and lets the whole page scroll like a web
 *   page. Injected rules pin the app to the viewport; inner screens keep
 *   their own scrolling.
 * - Diagnostic badge (temporary): a tiny on-screen log of tunnel/native
 *   events so a screenshot shows exactly where the app is stuck.
 */
(function () {
  'use strict';

  var READY_TIMEOUT_MS = 15000;
  var CALL_TIMEOUT_MS = 20000;
  var SPLASH_MIN_MS = 1500;
  var PAGE_START = Date.now();

  // --- diagnostics badge ------------------------------------------------------
  var badgeEl = null;
  var badgeLines = [];
  function diag(line, isError) {
    try {
      badgeLines.push({ text: line, isError: !!isError, at: Date.now() });
      if (badgeLines.length > 6) badgeLines.shift();
      renderBadge();
    } catch (e) { /* diagnostics must never break the app */ }
  }
  function renderBadge() {
    if (!document.body) return;
    if (!badgeEl) {
      badgeEl = document.createElement('div');
      badgeEl.id = 'wq-diag';
      badgeEl.style.cssText =
        'position:fixed;left:6px;top:calc(env(safe-area-inset-top,0px) + 6px);' +
        'z-index:99999;pointer-events:none;font:9px/1.5 ui-monospace,Menlo,monospace;' +
        'color:#8dffa9;background:rgba(0,0,0,0.55);padding:4px 6px;border-radius:6px;' +
        'max-width:78vw;white-space:pre-wrap;';
      document.body.appendChild(badgeEl);
    }
    badgeEl.textContent = badgeLines.map(function (l) { return l.text; }).join('\n');
    badgeLines.forEach(function (l, i) { void i; });
    badgeEl.style.color = badgeLines.some(function (l) { return l.isError; }) ? '#ffb3b3' : '#8dffa9';
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { renderBadge(); });
  }
  window.addEventListener('error', function (e) {
    diag('JS ERROR: ' + (e.message || 'unknown'), true);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    diag('UNHANDLED: ' + ((r && r.message) || String(r)), true);
  });

  // --- fixed-to-size CSS ------------------------------------------------------
  function injectCss() {
    if (document.getElementById('wq-viewport-fix')) return;
    var style = document.createElement('style');
    style.id = 'wq-viewport-fix';
    style.textContent =
      'html,body{height:100%!important;overflow:hidden!important;overscroll-behavior:none!important;}' +
      '[data-generated-space-root]{position:fixed!important;inset:0!important;height:100dvh!important;' +
      'overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:none!important;}' +
      '.hatch-space-root[data-hatch-space-root]{min-height:100dvh!important;}';
    (document.head || document.documentElement).appendChild(style);
  }
  injectCss();

  // --- base64 helpers -----------------------------------------------------------
  function bytesToB64(bytes) {
    var binary = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
  function b64ToBytes(b64) {
    var binary = atob(b64 || '');
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  function textToB64(text) {
    return bytesToB64(new TextEncoder().encode(text));
  }
  function b64ToText(b64) {
    return new TextDecoder().decode(b64ToBytes(b64));
  }

  // --- native readiness -----------------------------------------------------------
  var readyPromise = null;
  function whenReady() {
    if (!readyPromise) {
      readyPromise = new Promise(function (resolve, reject) {
        var started = Date.now();
        (function poll() {
          var native = window.WellnessQuestNative;
          if (native && native._initialized) {
            if (native._initError) {
              reject(native._initError instanceof Error
                ? native._initError
                : new Error(String(native._initError)));
            } else {
              resolve();
            }
          } else if (Date.now() - started > READY_TIMEOUT_MS) {
            reject(new Error(
              'WellnessQuest native layer did not initialize within ' +
              (READY_TIMEOUT_MS / 1000) + 's. The on-device SQLite plugin ' +
              'may be missing from the native build.'
            ));
          } else {
            setTimeout(poll, 100);
          }
        })();
      });
    }
    return readyPromise;
  }

  function callActionWithTimeout(action, args) {
    var timeout;
    var call = (async function () {
      await whenReady();
      return window.WellnessQuestNative.callAction(action, args);
    })();
    var limit = new Promise(function (_resolve, reject) {
      timeout = setTimeout(function () {
        reject(new Error('Action "' + action + '" timed out after ' +
          (CALL_TIMEOUT_MS / 1000) + 's'));
      }, CALL_TIMEOUT_MS);
    });
    return Promise.race([call, limit]).then(
      function (value) { clearTimeout(timeout); return value; },
      function (err) { clearTimeout(timeout); throw err; }
    );
  }

  // --- http.req handling --------------------------------------------------------------
  function isActionsPath(path) {
    if (typeof path !== 'string') return false;
    var p = path.split('?')[0].replace(/^\.\//, '').replace(/^\//, '');
    return p === 'actions' || p.endsWith('/actions');
  }

  var firstLoadSeen = false;
  function handleHttpReq(msg, reply) {
    if (!isActionsPath(msg.path)) {
      reply({
        type: 'http.res', id: msg.id, status: 404,
        headers: [['content-type', 'text/plain']], bodyB64: '',
      });
      return;
    }
    (async function () {
      var startedAt = Date.now();
      try {
        var bodyText = msg.bodyB64 ? b64ToText(msg.bodyB64) : '';
        var payload = bodyText ? JSON.parse(bodyText) : {};
        var action = payload.action;
        var args = payload.args || {};
        var isFirstLoad = action === 'loadApp' && !firstLoadSeen;
        if (isFirstLoad) firstLoadSeen = true;
        diag('> ' + action);
        var result = await callActionWithTimeout(action, args);
        if (isFirstLoad) {
          var remaining = SPLASH_MIN_MS - (Date.now() - PAGE_START);
          if (remaining > 0) await new Promise(function (r) { setTimeout(r, remaining); });
        }
        diag('< ' + action + ' ok ' + (Date.now() - startedAt) + 'ms');
        reply({
          type: 'http.res', id: msg.id, status: 200,
          headers: [['content-type', 'application/json']],
          bodyB64: textToB64(JSON.stringify({ data: result })),
        });
      } catch (err) {
        diag('! ' + ((err && err.message) || 'Action failed'), true);
        reply({
          type: 'http.res', id: msg.id, status: 500,
          headers: [['content-type', 'application/json']],
          bodyB64: textToB64(JSON.stringify({
            error: (err && err.message) || 'Action failed',
          })),
        });
      }
    })();
  }

  // --- host handshake -----------------------------------------------------------------------
  var channel = null;
  window.addEventListener('message', function (ev) {
    var data = ev.data;
    if (!data || typeof data !== 'object' || data.type !== 'bundle:ready') return;
    if (channel) return; // port already handed over; bundle attaches only once
    try {
      channel = new MessageChannel();
      channel.port1.onmessage = function (pe) {
        var msg = pe.data;
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'http.req') {
          handleHttpReq(msg, function (res) {
            try { channel.port1.postMessage(res); } catch (e) { /* port gone */ }
          });
        } else if (msg.type === 'ws.open') {
          try {
            channel.port1.postMessage({
              type: 'ws.error', id: msg.id,
              message: 'WebSocket is not available in the offline app',
            });
          } catch (e) { /* port gone */ }
        }
      };
      if (channel.port1.start) channel.port1.start();
      window.postMessage({ type: 'bundle:init-port' }, '*', [channel.port2]);
      diag('WQ host b111 · port ok');
    } catch (err) {
      diag('port handoff failed: ' + (err && err.message), true);
      channel = null;
    }
  });

  diag('WQ host b111 · waiting for app');
})();
