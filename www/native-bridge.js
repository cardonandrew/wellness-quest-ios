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
 * The previous bridge intercepted window.fetch, which the bundle's
 * prelude had already replaced — requests never reached it and hung
 * forever with no error. Do not reintroduce fetch/XHR interception as
 * the transport; the tunnel port is the only path the app uses.
 */
(function () {
  'use strict';

  var READY_TIMEOUT_MS = 15000;
  var CALL_TIMEOUT_MS = 20000;

  // --- base64 helpers -------------------------------------------------------
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

  // --- native readiness -----------------------------------------------------
  // Resolves once native-actions.js has initialized the on-device SQLite
  // database. Rejects after READY_TIMEOUT_MS so a broken native layer
  // surfaces as an error response (the app's "Trail interrupted" screen)
  // instead of an endless "Setting your trail…" hang.
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

  // --- http.req handling ----------------------------------------------------
  function isActionsPath(path) {
    if (typeof path !== 'string') return false;
    var p = path.split('?')[0].replace(/^\.\//, '').replace(/^\//, '');
    return p === 'actions' || p.endsWith('/actions');
  }

  function handleHttpReq(msg, reply) {
    if (!isActionsPath(msg.path)) {
      reply({
        type: 'http.res', id: msg.id, status: 404,
        headers: [['content-type', 'text/plain']], bodyB64: '',
      });
      return;
    }
    (async function () {
      try {
        var bodyText = msg.bodyB64 ? b64ToText(msg.bodyB64) : '';
        var payload = bodyText ? JSON.parse(bodyText) : {};
        var action = payload.action;
        var args = payload.args || {};
        console.log('[wq-host] action: ' + action);
        var result = await callActionWithTimeout(action, args);
        reply({
          type: 'http.res', id: msg.id, status: 200,
          headers: [['content-type', 'application/json']],
          bodyB64: textToB64(JSON.stringify({ data: result })),
        });
      } catch (err) {
        console.error('[wq-host] action failed:', err);
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

  // --- host handshake ---------------------------------------------------------
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
        // Anything else (pings, telemetry) needs no host in the offline app.
      };
      if (channel.port1.start) channel.port1.start();
      window.postMessage({ type: 'bundle:init-port' }, '*', [channel.port2]);
      console.log('[wq-host] tunnel port handed to bundle');
    } catch (err) {
      console.error('[wq-host] failed to hand tunnel port:', err);
      channel = null;
    }
  });

  console.log('[wq-host] host listener installed — waiting for bundle announce');
})();
