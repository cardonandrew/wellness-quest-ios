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
 * Build 112 additions:
 * - Viewport lock v2: build 111's stylesheet lost to the bundle's own
 *   runtime CSS adaptation. The lock is now applied as inline styles
 *   with !important priority and re-asserted by a MutationObserver, so
 *   the page itself can never scroll — tall screens scroll inside their
 *   shell only, like a native app.
 * - The badge also reports the onboardingComplete flag from each
 *   loadApp result and, once, the raw profile row types (debugState),
 *   which pinned the "You're all set" freeze on the mappers' strict
 *   === 1 checks vs the iOS driver's string values.
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
      if (badgeLines.length > 7) badgeLines.shift();
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
        'max-width:82vw;white-space:pre-wrap;';
      document.body.appendChild(badgeEl);
    }
    badgeEl.textContent = badgeLines.map(function (l) { return l.text; }).join('\n');
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

  // --- viewport lock ------------------------------------------------------------
  // setImp writes inline styles with !important priority. Re-sets of the
  // same element+property are throttled to one per 2s: some shorthand
  // properties serialize differently on readback (e.g. flex), and an
  // unthrottled observer loop over a mismatched readback can spin.
  var impLastSet = new WeakMap();
  function setImp(el, prop, value) {
    if (!el || !el.style) return;
    var now = Date.now();
    var perEl = impLastSet.get(el);
    if (!perEl) { perEl = {}; impLastSet.set(el, perEl); }
    if (el.style.getPropertyValue(prop) === value &&
        el.style.getPropertyPriority(prop) === 'important') return;
    if (perEl[prop] && now - perEl[prop] < 2000) return;
    perEl[prop] = now;
    el.style.setProperty(prop, value, 'important');
  }
  function lockViewport() {
    try {
      var html = document.documentElement;
      setImp(html, 'height', '100%');
      setImp(html, 'overflow', 'hidden');
      setImp(html, 'overscroll-behavior', 'none');
      var body = document.body;
      if (body) {
        setImp(body, 'height', '100%');
        setImp(body, 'overflow', 'hidden');
        setImp(body, 'overscroll-behavior', 'none');
        setImp(body, 'margin', '0');
      }
      var root = document.querySelector('[data-generated-space-root]');
      if (root) {
        setImp(root, 'position', 'fixed');
        setImp(root, 'inset', '0');
        setImp(root, 'height', '100dvh');
        setImp(root, 'overflow', 'hidden');
        setImp(root, 'overscroll-behavior', 'none');
      }
      var wrap = document.querySelector('.hatch-space-root');
      if (wrap) {
        setImp(wrap, 'min-height', '0');
        setImp(wrap, 'height', '100%');
        setImp(wrap, 'overflow', 'hidden');
        // Host-frame padding (host header + extra bottom inset) has no
        // counterpart in the standalone app; it only shifts content.
        setImp(wrap, 'padding-top', '0');
        setImp(wrap, 'padding-bottom', '0');
      }
      var shells = document.querySelectorAll('.app-shell, .error-shell');
      for (var i = 0; i < shells.length; i++) {
        setImp(shells[i], 'height', '100%');
        setImp(shells[i], 'min-height', '0');
        setImp(shells[i], 'overflow-y', 'auto');
        setImp(shells[i], 'overflow-x', 'hidden');
        setImp(shells[i], 'overscroll-behavior', 'none');
      }
      // Onboarding: fit exactly to size, no scrolling. The shell becomes
      // a full-height flex column and the stage flexes to fill it, so
      // each step's section is exactly the visible height and its
      // margin-top:auto primary button lands at the bottom of the
      // screen (previously the stage's svh-based min-height overshot
      // the shell and stranded the button below the fold).
      var obShells = document.querySelectorAll('.onboarding-shell');
      for (var j = 0; j < obShells.length; j++) {
        setImp(obShells[j], 'height', '100%');
        setImp(obShells[j], 'min-height', '0');
        setImp(obShells[j], 'overflow', 'hidden');
        setImp(obShells[j], 'overscroll-behavior', 'none');
        if (!obShells[j].classList.contains('onboarding-celebration')) {
          setImp(obShells[j], 'display', 'flex');
          setImp(obShells[j], 'flex-direction', 'column');
        }
      }
      var stages = document.querySelectorAll('.onboarding-stage');
      for (var k = 0; k < stages.length; k++) {
        setImp(stages[k], 'flex-grow', '1');
        setImp(stages[k], 'flex-shrink', '1');
        setImp(stages[k], 'flex-basis', 'auto');
        setImp(stages[k], 'min-height', '0');
        var section = stages[k].querySelector(':scope > section');
        if (section) {
          setImp(section, 'height', '100%');
          setImp(section, 'min-height', '0');
        }
      }
    } catch (e) { /* never break the app for layout */ }
  }
  lockViewport();
  document.addEventListener('DOMContentLoaded', lockViewport);

  // Layout probe: report real geometry so a screenshot shows where the
  // onboarding primary button actually sits vs the visible height.
  var lastLayoutLine = '';
  function probeLayout() {
    try {
      var shell = document.querySelector('.onboarding-shell');
      if (!shell) return;
      var btn = document.querySelector('.onboarding-primary');
      var r = btn ? btn.getBoundingClientRect() : null;
      var line = 'L ih=' + window.innerHeight +
        ' shell=' + Math.round(shell.getBoundingClientRect().height) +
        ' btn=' + (r ? Math.round(r.top) + '/' + Math.round(r.height) : 'none');
      if (line !== lastLayoutLine) {
        lastLayoutLine = line;
        diag(line);
      }
    } catch (e) { /* probe only */ }
  }
  setTimeout(probeLayout, 1200);
  setTimeout(probeLayout, 3000);
  setTimeout(probeLayout, 6000);
  var lockObserver = new MutationObserver(function () { lockViewport(); });
  function startLockObserver() {
    if (document.documentElement) {
      lockObserver.observe(document.documentElement, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'],
      });
      // The layout settles quickly; don't observe forever.
      setTimeout(function () { lockObserver.disconnect(); }, 60000);
    }
  }
  startLockObserver();

  // --- base64 helpers -------------------------------------------------------------
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

  // --- native readiness ---------------------------------------------------------------
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

  // --- http.req handling ------------------------------------------------------------------
  function isActionsPath(path) {
    if (typeof path !== 'string') return false;
    var p = path.split('?')[0].replace(/^\.\//, '').replace(/^\//, '');
    return p === 'actions' || p.endsWith('/actions');
  }

  var firstLoadSeen = false;
  var loadCount = 0;
  var debugShown = false;
  function maybeDebug() {
    if (debugShown || loadCount < 2) return;
    debugShown = true;
    callActionWithTimeout('debugState', {}).then(function (d) {
      if (d && d.profile) {
        diag('dbg oc=' + JSON.stringify(d.profile.onboarding_complete) +
          '/' + d.profile.onboarding_type +
          ' set=' + d.settingsCount + ' tasks=' + d.tasksCount);
      } else {
        diag('dbg: no profile row', true);
      }
    }).catch(function (e) {
      diag('dbg failed: ' + (e && e.message), true);
    });
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
        var extra = '';
        if (action === 'loadApp') {
          loadCount += 1;
          extra = ' ob=' + (result && result.onboardingComplete ? '1' : '0');
        }
        diag('< ' + action + ' ok ' + (Date.now() - startedAt) + 'ms' + extra);
        reply({
          type: 'http.res', id: msg.id, status: 200,
          headers: [['content-type', 'application/json']],
          bodyB64: textToB64(JSON.stringify({ data: result })),
        });
        if (action === 'loadApp') maybeDebug();
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

  // --- host handshake ---------------------------------------------------------------------------
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
      diag('WQ host b116 · port ok');
    } catch (err) {
      diag('port handoff failed: ' + (err && err.message), true);
      channel = null;
    }
  });

  diag('WQ host b116 · waiting for app');
})();
