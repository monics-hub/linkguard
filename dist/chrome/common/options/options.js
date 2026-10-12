// Página de opciones (común a Chrome y Firefox).
(function () {
  'use strict';
  const PG = globalThis.PG;
  const $ = (id) => document.getElementById(id);
  let settings = null;
  let savedTimer = null;

  const LISTS = ['watchlist', 'internalHosts', 'protectedDomains'];

  async function save(partial) {
    settings = await PG.settings.save(partial);
    render();
    $('saved').textContent = '✓ Guardado';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { $('saved').textContent = ''; }, 1800);
  }

  function render() {
    $('enabled').checked = settings.enabled;
    $('enabledLabel').textContent = settings.enabled ? 'Activada' : 'Desactivada';
    for (const k of LISTS) if (document.activeElement !== $(k)) $(k).value = settings[k].join('\n');
    $('followFromWatched').checked = settings.followFromWatched;
    for (const r of document.querySelectorAll('input[name=knownMode]')) r.checked = r.value === settings.knownMode;
    $('dangerDelaySeconds').value = settings.dangerDelaySeconds;
    if (document.activeElement !== $('urlscanApiKey')) $('urlscanApiKey').value = settings.urlscanApiKey;
    $('urlscanVisibility').value = settings.urlscanVisibility;
    $('urlscanStripQuery').checked = settings.urlscanStripQuery;

    const list = $('wlList');
    list.replaceChildren();
    $('wlCount').textContent = settings.whitelist.length ? `(${settings.whitelist.length})` : '';
    if (!settings.whitelist.length) list.append(Object.assign(document.createElement('li'), { className: 'empty', textContent: 'Vacía' }));
    for (const d of settings.whitelist) {
      const li = document.createElement('li');
      const rm = Object.assign(document.createElement('button'), { textContent: '×', title: `Quitar ${d}` });
      rm.setAttribute('aria-label', `Quitar ${d}`);
      rm.addEventListener('click', () => save({ whitelist: settings.whitelist.filter((x) => x !== d) }));
      li.append(d, rm);
      list.append(li);
    }
    renderConsent();
  }

  async function renderPermissions() {
    let ok = true;
    try { ok = await PG.platform.permissions.contains({ origins: ['<all_urls>'] }); } catch (_) {}
    $('perm').hidden = ok;
  }

  async function renderConsent() {
    const box = $('consentBox');
    box.hidden = !(PG.platform.dataConsent.supported && settings.urlscanApiKey);
    if (box.hidden) return;
    const ok = await PG.platform.dataConsent.contains();
    $('consentState').textContent = ok ? '✓ Consentimiento concedido' : 'Pendiente';
    $('consentState').className = 'small ' + (ok ? 'ok' : 'err');
    $('consentBtn').hidden = ok;
  }

  function wire() {
    $('enabled').addEventListener('change', (e) => save({ enabled: e.target.checked }));
    for (const k of LISTS) $(k).addEventListener('change', (e) => save({ [k]: e.target.value }));
    $('followFromWatched').addEventListener('change', (e) => save({ followFromWatched: e.target.checked }));
    for (const r of document.querySelectorAll('input[name=knownMode]')) r.addEventListener('change', (e) => save({ knownMode: e.target.value }));
    $('dangerDelaySeconds').addEventListener('change', (e) => save({ dangerDelaySeconds: e.target.value }));
    $('urlscanApiKey').addEventListener('change', (e) => save({ urlscanApiKey: e.target.value }));
    $('urlscanVisibility').addEventListener('change', (e) => save({ urlscanVisibility: e.target.value }));
    $('urlscanStripQuery').addEventListener('change', (e) => save({ urlscanStripQuery: e.target.checked }));

    $('wlForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = PG.domain.normalizeHostEntry($('wlInput').value);
      if (!v) return;
      $('wlInput').value = '';
      save({ whitelist: [...settings.whitelist, v] });
    });

    $('grant').addEventListener('click', async () => {
      try { await PG.platform.permissions.request({ origins: ['<all_urls>'] }); } catch (_) {}
      renderPermissions();
    });

    $('showKey').addEventListener('click', () => {
      const i = $('urlscanApiKey');
      i.type = i.type === 'password' ? 'text' : 'password';
      $('showKey').textContent = i.type === 'password' ? 'Mostrar' : 'Ocultar';
    });

    $('testKey').addEventListener('click', async () => {
      const out = $('keyResult');
      const apiKey = $('urlscanApiKey').value.trim();
      if (!apiKey) { out.textContent = 'Escribe primero la API key.'; out.className = 'small err'; return; }
      await save({ urlscanApiKey: apiKey });
      out.textContent = 'Comprobando…'; out.className = 'small';
      try {
        const r = await PG.platform.sendMessage({ type: 'PG_URLSCAN_TEST', apiKey });
        if (!r || r.error) throw new Error(r ? r.error : 'sin respuesta');
        out.textContent = `✓ Clave válida. Escaneos disponibles — públicos: ${r.public} · no listados: ${r.unlisted} · privados: ${r.private}`;
        out.className = 'small ok';
      } catch (e) {
        out.textContent = '✗ ' + e.message; out.className = 'small err';
      }
    });

    $('consentBtn').addEventListener('click', async () => { await PG.platform.dataConsent.request(); renderConsent(); });

    for (const b of document.querySelectorAll('.examples [data-url]')) {
      b.addEventListener('click', () => { $('tryUrl').value = b.dataset.url; $('tryText').value = b.dataset.text; showDemo(); });
    }
    $('tryShow').addEventListener('click', showDemo);
  }

  // Muestra la ventana de aviso real dentro de esta página, sin abrir nada.
  function showDemo() {
    let href = $('tryUrl').value.trim();
    if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) href = 'https://' + href;
    const t0 = performance.now();
    const report = PG.analyzer.analyze({ href, text: $('tryText').value, settings });
    const elapsedMs = performance.now() - t0;
    const send = async (msg) => { const r = await PG.platform.sendMessage(msg); if (r && r.error) throw new Error(r.error); return r; };
    PG.ui.show({
      report, elapsedMs, settings: PG.settings.publicView(settings),
      actions: {
        proceed: () => alert(`Modo de prueba: aquí se abriría\n${href}`),
        cancel: () => {},
        trust: () => save({ whitelist: [...settings.whitelist, report.registrable] }),
        scanSubmit: (url) => send({ type: 'PG_URLSCAN_SUBMIT', url }),
        scanResult: (uuid) => send({ type: 'PG_URLSCAN_RESULT', uuid }),
        openTab: (url) => window.open(url, '_blank', 'noopener'),
        openOptions: () => { PG.ui.close(); $('urlscanApiKey').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('urlscanApiKey').focus(); },
        analyze: (url) => PG.analyzer.analyze({ href: url, text: '', settings }),
      },
    });
  }

  async function init() {
    settings = await PG.settings.load();
    wire();
    render();
    renderPermissions();
    const b = PG.BUILD || {};
    $('about').textContent = `LinkGuard ${PG.VERSION} · ${PG.platform.name} · Public Suffix List: motor ${PG.domain.engine()}${PG.PSL_DATA ? ', copia del ' + PG.PSL_DATA.date : ''}${b.date ? ' · build ' + b.date : ''}`;
    PG.settings.onChange((s) => { settings = s; render(); });
  }

  init();
})();
