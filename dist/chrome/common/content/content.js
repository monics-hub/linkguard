// Interceptor de clics (común a Chrome y Firefox). Solo se inyecta en el portal de correo y en las
// pestañas abiertas desde él. Escucha en fase de captura sobre window, así actúa ANTES que los
// manejadores de Gmail/Outlook y la navegación no llega a empezar hasta que el usuario decide.
(function (root) {
  'use strict';
  const PG = root.PG;
  if (!PG || root.__linkGuardActive) return;
  root.__linkGuardActive = true;

  let ctx = null;
  let settings = null;
  let pageHost = '';
  let pageRegistrable = '';
  let bypass = false;

  async function refresh() {
    try {
      const r = await PG.platform.sendMessage({ type: 'PG_CONTEXT', referrer: document.referrer });
      if (!r || r.error) { ctx = null; return; }
      ctx = r;
      settings = r.settings;
      pageHost = r.topHost;
      pageRegistrable = PG.domain.registrable(pageHost);
      // Pre-calienta la PSL y la lista de marcas para que también el primer clic sea instantáneo.
      PG.analyzer.analyze({ href: 'https://www.example.com/', text: 'example.com', settings });
    } catch (_) {
      ctx = null; // la extensión se actualizó o se desactivó: la página sigue funcionando normal
    }
  }
  refresh();
  PG.platform.onStorageChanged((changes, area) => { if (area === 'local' && changes[PG.settings.KEY]) refresh(); });

  // ------------------------------------------------------------------ helpers
  function findAnchor(e) {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    for (const n of path) {
      if (!n || n.nodeType !== 1) continue;
      if ((n.localName === 'a' || n.localName === 'area') && n.hasAttribute('href')) return n;
      if (n === document.body) break;
    }
    const t = e.target;
    return t && t.closest ? t.closest('a[href], area[href]') : null;
  }

  function hrefOf(a) {
    if (typeof a.href === 'string') return a.href;
    const raw = a.href && a.href.baseVal ? a.href.baseVal : a.getAttribute('href'); // <a> dentro de SVG
    try { return new URL(raw, document.baseURI).href; } catch (_) { return ''; }
  }

  function linkText(a) {
    if (a.localName === 'area') return a.getAttribute('alt') || '';
    return (a.innerText || a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  }

  function dispositionFor(e, a) {
    if (e.type === 'auxclick' || e.ctrlKey || e.metaKey) return 'background';
    if (e.shiftKey) return 'newtab';
    const t = (a.getAttribute('target') || '').toLowerCase();
    if (t && !['_self', '_top', '_parent'].includes(t)) return 'newtab';
    return 'same';
  }

  async function send(msg) {
    const r = await PG.platform.sendMessage(msg);
    if (r && r.error) throw new Error(r.error);
    return r;
  }

  // ------------------------------------------------------------------ abrir tras el "SÍ"
  async function proceed(a, href, disposition) {
    if (/^(https?|ftp):/i.test(href)) {
      try {
        await send({ type: 'PG_OPEN', url: href, disposition });
        return;
      } catch (_) { /* respaldo abajo */ }
      if (disposition === 'same') location.assign(href);
      else window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    // Otros protocolos (zoommtg:, msteams:…): se repite el clic original dejando pasar el evento.
    bypass = true;
    try { a.click(); } finally { bypass = false; }
  }

  // ------------------------------------------------------------------ interceptor
  function onActivate(e) {
    if (!ctx || !settings || bypass || !e.isTrusted) return;
    if (e.type === 'click' && e.button !== 0) return;
    if (e.type === 'auxclick' && e.button !== 1) return;
    const a = findAnchor(e);
    if (!a) return;
    const href = hrefOf(a);
    if (!href) return;

    const t0 = performance.now();
    const decision = PG.analyzer.decide({ href, text: linkText(a), pageHost, pageRegistrable, mode: ctx.mode, settings });
    const elapsedMs = performance.now() - t0;
    if (decision.action !== 'prompt') return;

    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();

    const report = decision.report;
    const disposition = dispositionFor(e, a);
    PG.ui.show({
      report,
      settings,
      elapsedMs,
      actions: {
        proceed: () => proceed(a, href, disposition),
        cancel: () => {},
        trust: async () => {
          try { await send({ type: 'PG_TRUST', domain: report.registrable }); } catch (_) {}
          proceed(a, href, disposition);
        },
        scanSubmit: (url) => send({ type: 'PG_URLSCAN_SUBMIT', url }),
        scanResult: (uuid) => send({ type: 'PG_URLSCAN_RESULT', uuid }),
        openTab: (url) => send({ type: 'PG_OPEN', url, disposition: 'newtab', track: false }).catch(() => window.open(url, '_blank', 'noopener')),
        openOptions: () => send({ type: 'PG_OPEN_OPTIONS' }),
        analyze: (url) => PG.analyzer.analyze({ href: url, text: '', settings }),
      },
    });
  }

  // `window` explícito: en Firefox el global de un content script es un sandbox, no la ventana.
  window.addEventListener('click', onActivate, true);
  window.addEventListener('auxclick', onActivate, true);
})(typeof globalThis !== 'undefined' ? globalThis : this);
