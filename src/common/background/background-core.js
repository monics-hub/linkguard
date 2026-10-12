// Lógica del background, común a Chrome (service worker) y Firefox (event page).
//  - Decide en qué pestañas se activa la protección (lista de vigilancia + pestañas derivadas).
//  - Inyecta los scripts de protección SOLO donde hacen falta (no en todas las webs).
//  - Abre los enlaces aceptados y recuerda que esa pestaña viene del correo.
//  - Habla con urlscan.io (la API key nunca sale del background).
(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  const CORE_FILES = [
    'common/data/defaults.js',
    'common/data/psl-data.js',
    'common/core/punycode.js',
    'common/core/domain.js',
    'common/core/lookalike.js',
    'common/core/analyzer.js',
    'common/core/settings.js',
    'common/ui/modal-styles.js',
    'common/ui/modal.js',
    'common/content/content.js',
  ];
  function contentFiles() {
    return (PG.BUILD && PG.BUILD.tldts ? ['vendor/tldts.umd.min.js'] : []).concat(CORE_FILES);
  }

  const WEB_URL = /^(https?|ftp):\/\//i;
  const GRACE_MS = 4000;

  // ------------------------------------------------------------ pestañas derivadas del correo
  // Se guardan en storage.session para sobrevivir a que el service worker se duerma.
  async function getDerived() {
    const d = await PG.platform.session.get('derivedTabs');
    return (d && d.derivedTabs) || {};
  }
  async function markDerived(tabId, why) {
    if (tabId == null || tabId < 0) return;
    const d = await getDerived();
    d[tabId] = { since: Date.now(), why };
    await PG.platform.session.set({ derivedTabs: d });
  }
  async function unmarkDerived(tabId) {
    const d = await getDerived();
    if (d[tabId]) { delete d[tabId]; await PG.platform.session.set({ derivedTabs: d }); }
  }

  const hostOf = (url) => { try { return new URL(url).hostname; } catch (_) { return ''; } };

  /** ¿Debe estar activa la protección para este remitente? */
  async function computeContext(sender, referrer) {
    const s = await PG.settings.load();
    if (!s.enabled || !sender.tab) return null;
    const tabUrl = sender.tab.url || sender.url || '';
    if (!/^https?:/i.test(tabUrl)) return null;
    const topHost = hostOf(tabUrl);
    if (PG.domain.hostInList(topHost, s.watchlist)) return { mode: 'portal', topHost, settings: s };
    if (!s.followFromWatched) return null;
    const derived = await getDerived();
    if (derived[sender.tab.id]) return { mode: 'derived', topHost, settings: s };
    // Respaldo: cabecera Referer (document.referrer) apuntando al portal de correo.
    if (sender.frameId === 0 && referrer && PG.domain.hostInList(hostOf(referrer), s.watchlist)) {
      await markDerived(sender.tab.id, 'referer');
      return { mode: 'derived', topHost, settings: s };
    }
    return null;
  }

  // ------------------------------------------------------------ mensajes
  const handlers = {
    async PG_BOOT(msg, sender) {
      const ctx = await computeContext(sender, msg.referrer);
      if (!ctx) return { active: false };
      try {
        await PG.platform.inject(sender.tab.id, sender.frameId || 0, contentFiles());
      } catch (e) {
        return { active: false, error: String(e && e.message) };
      }
      return { active: true };
    },

    async PG_CONTEXT(msg, sender) {
      const ctx = await computeContext(sender, msg.referrer);
      if (!ctx) return null;
      return { mode: ctx.mode, topHost: ctx.topHost, settings: PG.settings.publicView(ctx.settings), platform: PG.platform.name };
    },

    async PG_OPEN(msg, sender) {
      const url = String(msg.url || '');
      if (!WEB_URL.test(url)) throw new Error('Solo se abren enlaces web (http/https).');
      const tab = sender.tab;
      if (!tab) throw new Error('Sin pestaña de origen');
      const s = await PG.settings.load();
      const track = s.followFromWatched && msg.track !== false;
      if (msg.disposition === 'same') {
        if (track) await markDerived(tab.id, 'link');
        await PG.platform.tabs.update(tab.id, { url });
        return { ok: true };
      }
      const created = await PG.platform.tabs.create({
        url,
        active: msg.disposition !== 'background',
        openerTabId: tab.id,
        index: typeof tab.index === 'number' ? tab.index + 1 : undefined,
      });
      if (track && created) await markDerived(created.id, 'link');
      return { ok: true };
    },

    async PG_TRUST(msg) {
      const s = await PG.settings.addToWhitelist(msg.domain);
      return { ok: true, whitelist: s.whitelist };
    },

    async PG_URLSCAN_SUBMIT(msg) {
      const s = await PG.settings.load();
      if (!s.urlscanApiKey) throw new Error('No hay API key de urlscan.io configurada.');
      if (!(await PG.platform.dataConsent.contains())) {
        throw new Error('Firefox necesita tu permiso para enviar URLs a urlscan.io: actívalo en la configuración de la extensión.');
      }
      const url = String(msg.url || '');
      if (!WEB_URL.test(url)) throw new Error('urlscan.io solo analiza URLs http/https.');
      return PG.urlscan.submit(s.urlscanApiKey, url, s.urlscanVisibility);
    },

    async PG_URLSCAN_RESULT(msg) {
      const s = await PG.settings.load();
      return PG.urlscan.result(s.urlscanApiKey, String(msg.uuid || ''));
    },

    async PG_URLSCAN_TEST(msg) {
      return PG.urlscan.testKey(String(msg.apiKey || ''));
    },

    async PG_OPEN_OPTIONS() {
      await PG.platform.openOptionsPage();
      return { ok: true };
    },

    async PG_TAB_STATUS(msg) {
      const tab = await PG.platform.tabs.get(msg.tabId);
      const ctx = await computeContext({ tab, frameId: 0 }, '');
      return { active: !!ctx, mode: ctx ? ctx.mode : null, host: hostOf(tab.url || '') };
    },
  };

  // ------------------------------------------------------------ arranque
  function start() {
    PG.platform.onMessage((msg, sender) => {
      const h = msg && handlers[msg.type];
      if (!h) return null;
      return h(msg, sender);
    });

    PG.platform.tabs.onRemoved((tabId) => { unmarkDerived(tabId); });

    if (PG.platform.webNavigation) {
      // Si el usuario escribe otra dirección en la barra, la pestaña deja de considerarse "del correo".
      PG.platform.webNavigation.onCommitted(async (d) => {
        if (d.frameId !== 0) return;
        const derived = await getDerived();
        const entry = derived[d.tabId];
        if (!entry || Date.now() - entry.since < GRACE_MS) return;
        const q = d.transitionQualifiers || [];
        if (q.includes('from_address_bar') || ['typed', 'auto_bookmark', 'keyword', 'keyword_generated', 'generated', 'start_page'].includes(d.transitionType)) {
          unmarkDerived(d.tabId);
        }
      });
      // Pestañas abiertas por la propia página (window.open, target=_blank no interceptado…).
      PG.platform.webNavigation.onCreatedNavigationTarget(async (d) => {
        const s = await PG.settings.load();
        if (!s.enabled || !s.followFromWatched) return;
        const derived = await getDerived();
        if (derived[d.sourceTabId]) return markDerived(d.tabId, 'opener');
        try {
          const src = await PG.platform.tabs.get(d.sourceTabId);
          if (PG.domain.hostInList(hostOf(src.url), s.watchlist)) markDerived(d.tabId, 'opener');
        } catch (_) { /* pestaña ya cerrada */ }
      });
    }

    PG.platform.onInstalled(async (details) => {
      if (details.reason !== 'install') return;
      let granted = true;
      try { granted = await PG.platform.permissions.contains({ origins: ['<all_urls>'] }); } catch (_) {}
      if (!granted) PG.platform.openOptionsPage();
    });
  }

  PG.backgroundCore = { start, computeContext, handlers };
})(typeof globalThis !== 'undefined' ? globalThis : this);
