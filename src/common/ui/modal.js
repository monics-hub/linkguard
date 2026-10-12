// Ventana de aviso (común a Chrome y Firefox). Se construye solo con createElement/textContent:
// las URLs las controla el atacante, así que jamás se interpretan como HTML.
(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});
  const SVGNS = 'http://www.w3.org/2000/svg';

  // ------------------------------------------------------------------ utilidades DOM
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }

  const ICONS = {
    danger: 'M12 2 3 5.5v6.1c0 5.2 3.8 9.6 9 10.4 5.2-.8 9-5.2 9-10.4V5.5L12 2Zm0 5v6m0 3.5v.01',
    warn: 'M12 3 2 20.5h20L12 3Zm0 6.5v5m0 3v.01',
    info: 'M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19Zm0 8v6m0-9.5v.01',
    ok: 'M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19Zm-4.2 9.7 2.9 2.9 5.6-5.8',
    leave: 'M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  };
  function icon(name) {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', ICONS[name] || ICONS.info);
    svg.append(p);
    return svg;
  }

  function applyStyles(shadow) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(PG.UI_CSS);
      shadow.adoptedStyleSheets = [sheet];
      return;
    } catch (_) { /* Firefox (mundo aislado) o navegador antiguo → <style> */ }
    shadow.append(h('style', { text: PG.UI_CSS }));
  }

  const HEADINGS = {
    danger: ['¡Peligro! Este enlace parece fraudulento', 'No introduzcas contraseñas ni datos bancarios en ese sitio.'],
    warn: ['Precaución: revisa este enlace', 'Hay detalles que no encajan. Comprueba el destino antes de continuar.'],
    neutral: ['Vas a salir de tu correo', 'Comprueba que el dominio es el que esperas.'],
    known: ['Enlace a un sitio oficial conocido', 'Aviso discreto: el dominio pertenece a una organización conocida.'],
  };

  const VISIBILITY_TEXT = {
    public: ['La URL se publicará en urlscan.io', 'Visibilidad PÚBLICA: cualquiera podrá ver la URL completa, la captura de pantalla y el contenido de la página en la portada y el buscador de urlscan.io.'],
    unlisted: ['La URL saldrá de tu equipo', 'Visibilidad NO LISTADA: no aparece en búsquedas públicas, pero sí la pueden ver investigadores de seguridad verificados de urlscan Pro.'],
    private: ['La URL saldrá de tu equipo', 'Visibilidad PRIVADA: solo tú la ves en tu cuenta (requiere cuota privada en tu plan). urlscan.io sí visitará la página.'],
  };

  let current = null;

  // ------------------------------------------------------------------ ventana
  /**
   * @param {object} o
   * @param {object} o.report     resultado de PG.analyzer.analyze()
   * @param {object} o.settings   configuración (vista pública, sin API key)
   * @param {object} o.actions    { proceed, trust, cancel, scanSubmit, scanResult, openTab, openOptions, analyze }
   */
  function show(o) {
    if (current) current.close('replaced');
    const { report, settings, actions } = o;
    const level = report.level;
    const discreet = level === 'known' && settings.knownMode !== 'full';
    const previouslyFocused = document.activeElement;
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

    const host = document.createElement('linkguard-dialog');
    for (const [k, v] of Object.entries({ position: 'fixed', inset: '0', 'z-index': '2147483647', display: 'block' })) {
      host.style.setProperty(k, v, 'important');
    }
    const shadow = host.attachShadow({ mode: 'closed' });
    applyStyles(shadow);

    // --- cabecera
    const [title, subtitle] = HEADINGS[level] || HEADINGS.neutral;
    const head = h('header', { class: 'head' },
      icon(level === 'danger' ? 'danger' : level === 'warn' ? 'warn' : level === 'known' ? 'ok' : 'leave'),
      h('div', null, h('h2', { id: 'lg-title', text: title }), h('p', { text: subtitle })));

    // --- dominio real, grande
    const domainBlock = [
      h('p', { class: 'eyebrow', text: report.isIp ? 'Dirección IP de destino' : 'Dominio real de destino' }),
      h('p', { class: 'domain', id: 'lg-domain', text: report.registrable || report.hostname || '—' }),
    ];
    if (report.isIdn) {
      domainBlock.push(h('p', { class: 'idn' }, 'En pantalla se vería como ', h('b', { text: `«${report.unicodeRegistrable}»` }),
        '. Se muestra su forma real (punycode) porque contiene caracteres de otros alfabetos.'));
    }
    if (report.hostname && report.subdomain) {
      domainBlock.push(h('p', { class: 'hostline' },
        h('span', { text: report.subdomain + '.' }), h('mark', { text: report.registrable })));
    }
    domainBlock.push(h('div', { class: 'urlbox', title: 'URL completa', text: report.url }));

    // --- alertas: peligro/precaución siempre visibles; las informativas, plegadas
    const alertItem = (a) => h('li', { class: 'alert', 'data-level': a.level },
      icon(a.level === 'danger' ? 'danger' : a.level === 'warn' ? 'warn' : a.level === 'ok' ? 'ok' : 'info'),
      h('div', null, h('b', { text: a.title }), a.detail ? h('span', { text: a.detail }) : null));
    const mainAlerts = report.alerts.filter((a) => a.level !== 'info');
    const infoAlerts = discreet ? [] : report.alerts.filter((a) => a.level === 'info');
    const alerts = h('div', { id: 'lg-alerts' },
      mainAlerts.length ? h('ul', { class: 'alerts' }, mainAlerts.map(alertItem)) : null,
      infoAlerts.length ? h('details', { class: 'more' },
        h('summary', { text: `Más detalles (${infoAlerts.length})` }),
        h('ul', { class: 'alerts' }, infoAlerts.map(alertItem))) : null);

    const question = h('p', { class: 'question' }, '¿Deseas continuar a ', h('strong', { text: report.registrable || 'este destino' }), '?');

    // --- confiar en este dominio
    let trustBtn = null;
    if (report.hostname && !report.isIp && report.canProceed && !report.isShortener && !report.isUserContent) {
      trustBtn = h('button', { class: 'linkbtn', type: 'button', text: `Confiar en ${report.registrable} y no volver a avisar` });
      trustBtn.addEventListener('click', () => {
        if (level === 'danger' && !trustBtn.hasAttribute('data-armed')) {
          trustBtn.setAttribute('data-armed', '');
          trustBtn.textContent = `Este dominio tiene alertas de PELIGRO. Pulsa otra vez para confiar igualmente en ${report.registrable}`;
          return;
        }
        close('trust');
        actions.trust();
      });
    }

    // --- panel urlscan
    const scanPanel = h('section', { class: 'scan', hidden: true, 'aria-live': 'polite' });

    // --- pie: [Analizar con URLScan]  ……  [SÍ] [NO]
    const scanBtn = h('button', { class: 'btn scanbtn', type: 'button', text: 'Analizar con URLScan' });
    const yesBtn = h('button', { class: 'btn yes', type: 'button', text: 'SÍ' });
    const noBtn = h('button', { class: 'btn no', type: 'button', text: 'NO' });
    const canScan = /^https?:$/.test(safeProtocol(report.url));
    if (!canScan) scanBtn.disabled = true;
    const foot = h('footer', { class: 'foot' },
      h('div', { class: 'scanwrap' }, scanBtn, h('small', { text: '⚠ Analizar puede exponer públicamente la URL' })),
      h('div', { class: 'decide' }, yesBtn, noBtn));

    const meta = h('div', { class: 'meta', text: `LinkGuard · análisis local en ${o.elapsedMs != null ? o.elapsedMs.toFixed(1) : '<1'} ms · sin enviar datos` });

    const card = h('div', { class: 'card', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'lg-title', 'aria-describedby': 'lg-domain lg-alerts', tabindex: '-1' },
      head,
      h('div', { class: 'body' }, domainBlock, alerts, question, trustBtn ? h('p', { class: 'trust' }, trustBtn) : null, scanPanel),
      foot, meta);
    const backdrop = h('div', { class: 'backdrop', 'data-level': level, 'data-discreet': discreet || null }, card);
    shadow.append(backdrop);

    // --- comportamiento de los botones
    if (!report.canProceed) {
      yesBtn.disabled = true;
      yesBtn.title = 'Por seguridad este tipo de enlace no se puede abrir';
    } else if (level === 'danger' && settings.dangerDelaySeconds > 0) {
      // Evita el "clic reflejo": el SÍ se desbloquea tras unos segundos.
      let left = settings.dangerDelaySeconds;
      yesBtn.disabled = true;
      yesBtn.textContent = `SÍ (${left})`;
      const tick = () => {
        left -= 1;
        if (left <= 0) { yesBtn.disabled = false; yesBtn.textContent = 'SÍ'; return; }
        yesBtn.textContent = `SÍ (${left})`;
        later(tick, 1000);
      };
      later(tick, 1000);
    }
    yesBtn.addEventListener('click', () => { if (!yesBtn.disabled) { close('yes'); actions.proceed(); } });
    noBtn.addEventListener('click', () => { close('no'); actions.cancel && actions.cancel(); });
    scanBtn.addEventListener('click', () => {
      scanPanel.hidden = !scanPanel.hidden;
      if (!scanPanel.hidden && !scanPanel.firstChild) renderScanIntro();
      if (!scanPanel.hidden) scanPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop && level !== 'danger') { close('backdrop'); actions.cancel && actions.cancel(); }
    });

    // Teclado: Esc = NO; Tab queda atrapado dentro de la ventana.
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close('esc'); actions.cancel && actions.cancel(); return; }
      if (e.key === 'Tab') {
        const f = [...shadow.querySelectorAll('button:not([disabled]), input:not([disabled]), summary, [tabindex="0"]')].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const i = f.indexOf(shadow.activeElement);
        const next = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 ? 0 : i + 1);
        e.preventDefault();
        f[next].focus();
      }
      e.stopPropagation(); // que Gmail/Outlook no reciban atajos de teclado mientras decides
    };
    host.addEventListener('keydown', onKey);
    // Bloquea los atajos de teclado de la página (p. ej. "e" archiva en Gmail) mientras el aviso está abierto.
    const swallow = (e) => { if (!host.contains(e.target) && e.target !== host) { e.stopImmediatePropagation(); if (e.key === 'Escape') { close('esc'); actions.cancel && actions.cancel(); } } };
    window.addEventListener('keydown', swallow, true);

    (document.body || document.documentElement).append(host);
    noBtn.focus({ preventScroll: true });

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', swallow, true);
      host.remove();
      if (current && current.host === host) current = null;
      try { previouslyFocused && previouslyFocused.focus && previouslyFocused.focus({ preventScroll: true }); } catch (_) {}
    }
    current = { host, close };

    // ------------------------------------------------------------------ urlscan
    function renderScanIntro() {
      scanPanel.replaceChildren();
      scanPanel.append(h('h3', { text: 'Analizar con urlscan.io' }));
      if (!settings.urlscanConfigured) {
        scanPanel.append(
          h('p', { text: 'No has configurado una API key de urlscan.io (el plan gratuito basta). Sin ella puedes buscar si alguien ya analizó este dominio: solo se envía el nombre del dominio como búsqueda, no la URL completa.' }),
          h('div', { class: 'row' },
            h('button', { class: 'btn small primary', type: 'button', text: `Buscar análisis previos de ${report.registrable}`, onclick: () => actions.openTab(`https://urlscan.io/search/#${encodeURIComponent('domain:' + report.registrable)}`) }),
            h('button', { class: 'btn small', type: 'button', text: 'Configurar API key', onclick: () => actions.openOptions() })));
        return;
      }
      const [vTitle, vText] = VISIBILITY_TEXT[settings.urlscanVisibility] || VISIBILITY_TEXT.unlisted;
      const strip = h('input', { type: 'checkbox' });
      strip.checked = !!settings.urlscanStripQuery;
      const preview = h('code');
      const toSend = () => {
        if (!strip.checked) return report.url;
        try { const u = new URL(report.url); u.search = ''; u.hash = ''; return u.href; } catch (_) { return report.url; }
      };
      const updatePreview = () => { preview.textContent = toSend(); };
      strip.addEventListener('change', updatePreview);
      updatePreview();
      const go = h('button', { class: 'btn small primary', type: 'button', text: 'Enviar a urlscan.io y analizar' });
      go.addEventListener('click', () => runScan(toSend()));
      scanPanel.append(
        h('p', { class: 'exposure', 'data-public': settings.urlscanVisibility === 'public' || null }, h('b', { text: '⚠ ' + vTitle + '. ' }), vText),
        h('label', null, strip, h('span', { text: 'Quitar los parámetros (?…) antes de enviar. Suelen contener tu correo o identificadores personales.' })),
        h('p', null, 'Se enviará: ', preview),
        h('div', { class: 'row' }, go));
    }

    async function runScan(url) {
      const started = Date.now();
      const status = h('p', null, h('span', { class: 'spinner' }), 'Enviando a urlscan.io…');
      scanPanel.replaceChildren(h('h3', { text: 'Analizar con urlscan.io' }), status);
      let sub;
      try {
        sub = await actions.scanSubmit(url);
        if (!sub || sub.error) throw new Error((sub && sub.error) || 'Sin respuesta');
      } catch (e) { return scanError(e); }
      const reportBtn = h('button', { class: 'btn small', type: 'button', text: 'Ver informe en urlscan.io', onclick: () => actions.openTab(sub.reportUrl) });
      scanPanel.append(h('div', { class: 'row' }, reportBtn));
      const poll = async () => {
        if (closed) return;
        const secs = Math.round((Date.now() - started) / 1000);
        status.replaceChildren(h('span', { class: 'spinner' }), `Escaneando en un navegador aislado de urlscan.io… ${secs} s (suele tardar 10–40 s)`);
        let r;
        try { r = await actions.scanResult(sub.uuid); if (r && r.error) throw new Error(r.error); } catch (e) { return scanError(e); }
        if (r && r.pending) {
          if (Date.now() - started > 120000) return scanError(new Error('El escaneo tarda demasiado. Consulta el informe en urlscan.io más tarde.'));
          later(poll, 3000);
          return;
        }
        renderScanResult(r, reportBtn);
      };
      later(poll, 10000);
      status.replaceChildren(h('span', { class: 'spinner' }), 'Escaneo en cola. Esperando resultado…');
    }

    function renderScanResult(r, reportBtn) {
      const nodes = [h('h3', { text: 'Resultado de urlscan.io' })];
      nodes.push(h('p', null, h('span', { class: 'verdict', 'data-bad': r.malicious || null, text: r.malicious ? 'MALICIOSO según urlscan.io' : 'Sin veredicto de malicia' }),
        r.score != null ? `  puntuación ${r.score}` : ''));
      let finalReport = null;
      if (r.finalUrl) {
        try { finalReport = actions.analyze(r.finalUrl); } catch (_) {}
        const changed = finalReport && finalReport.registrable !== report.registrable;
        nodes.push(h('p', { class: 'eyebrow', text: changed ? 'Destino final tras las redirecciones' : 'Destino final' }));
        nodes.push(h('p', { class: 'final', 'data-level': finalReport ? finalReport.level : null, text: finalReport ? finalReport.registrable : r.domain }));
        nodes.push(h('div', { class: 'urlbox', text: r.finalUrl }));
        if (finalReport && changed) {
          const important = finalReport.alerts.filter((a) => a.level === 'danger' || a.level === 'warn' || a.level === 'ok');
          if (important.length) {
            nodes.push(h('ul', { class: 'alerts' }, important.map((a) => h('li', { class: 'alert', 'data-level': a.level },
              icon(a.level === 'danger' ? 'danger' : a.level === 'warn' ? 'warn' : 'ok'), h('div', null, h('b', { text: a.title }), h('span', { text: a.detail }))))));
          }
        }
      }
      const facts = [];
      const fact = (k, v) => { if (v !== '' && v != null) facts.push(h('dt', { text: k }), h('dd', { text: String(v) })); };
      fact('Título', r.title);
      fact('IP', r.ip);
      fact('País', r.country);
      fact('Proveedor', r.asn);
      if (r.domainAgeDays != null) fact('Antigüedad del dominio', `${r.domainAgeDays} días${r.domainAgeDays < 30 ? ' ⚠ muy reciente' : ''}`);
      if (r.brands && r.brands.length) fact('Marcas imitadas', r.brands.join(', '));
      if (r.categories && r.categories.length) fact('Categorías', r.categories.join(', '));
      if (facts.length) nodes.push(h('dl', { class: 'facts' }, facts));
      if (r.screenshot) {
        const img = h('img', { class: 'shot', alt: 'Captura de la página tomada por urlscan.io', src: r.screenshot });
        img.addEventListener('error', () => img.remove());
        nodes.push(img);
      }
      nodes.push(h('p', { text: 'Ausencia de veredicto no garantiza que el sitio sea seguro: urlscan.io no siempre detecta páginas nuevas.' }));
      nodes.push(h('div', { class: 'row' }, reportBtn));
      scanPanel.replaceChildren(...nodes);
      scanPanel.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    function scanError(e) {
      scanPanel.replaceChildren(h('h3', { text: 'Analizar con urlscan.io' }),
        h('p', { class: 'error', text: String((e && e.message) || e) }),
        h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', text: 'Abrir configuración', onclick: () => actions.openOptions() })));
    }

    return { close };
  }

  function safeProtocol(u) {
    try { return new URL(u).protocol; } catch (_) { return ''; }
  }

  PG.ui = { show, isOpen: () => !!current, close: () => current && current.close() };
})(typeof globalThis !== 'undefined' ? globalThis : this);
