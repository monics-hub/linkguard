// ADAPTADOR FIREFOX (escritorio y Android).
// Traduce la API `browser.*` (basada en promesas) a la interfaz común PG.platform.
(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});
  if (PG.platform) return;
  const api = root.browser;
  const DATA = { data_collection: ['browsingActivity'] };

  PG.platform = {
    name: 'firefox',

    storage: {
      get: (keys) => api.storage.local.get(keys),
      set: (obj) => api.storage.local.set(obj),
    },
    session: {
      get: (keys) => api.storage.session.get(keys),
      set: (obj) => api.storage.session.set(obj),
    },
    onStorageChanged(cb) {
      api.storage.onChanged.addListener(cb);
    },

    // --- Mensajería: en Firefox el listener puede devolver directamente una promesa.
    sendMessage(msg) {
      return api.runtime.sendMessage(msg);
    },
    onMessage(handler) {
      api.runtime.onMessage.addListener((msg, sender) => {
        if (sender.id !== api.runtime.id) return undefined;
        return Promise.resolve()
          .then(() => handler(msg, sender))
          .then((res) => (res === undefined ? null : res), (err) => ({ error: String((err && err.message) || err) }));
      });
    },

    tabs: {
      async create(props) {
        try {
          return await api.tabs.create(props);
        } catch (e) {
          // Firefox para Android puede rechazar openerTabId: se reintenta sin él.
          const { openerTabId, ...rest } = props;
          return api.tabs.create(rest);
        }
      },
      update: (tabId, props) => api.tabs.update(tabId, props),
      get: (tabId) => api.tabs.get(tabId),
      query: (q) => api.tabs.query(q),
      onRemoved: (cb) => api.tabs.onRemoved.addListener(cb),
    },
    webNavigation: api.webNavigation
      ? {
          onCommitted: (cb) => api.webNavigation.onCommitted.addListener(cb),
          onCreatedNavigationTarget: (cb) =>
            api.webNavigation.onCreatedNavigationTarget && api.webNavigation.onCreatedNavigationTarget.addListener(cb),
        }
      : null,

    async inject(tabId, frameId, files) {
      try {
        return await api.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files, injectImmediately: true });
      } catch (e) {
        if (!/injectImmediately/i.test(String(e))) throw e;
        return api.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files });
      }
    },

    getURL: (p) => api.runtime.getURL(p),
    openOptionsPage: () => api.runtime.openOptionsPage(),
    onInstalled: (cb) => api.runtime.onInstalled.addListener(cb),

    // En Firefox (MV3) los permisos de sitio pueden no estar concedidos tras instalar.
    permissions: {
      contains: (p) => api.permissions.contains(p),
      request: (p) => api.permissions.request(p),
    },

    // Consentimiento integrado de Firefox (140+ escritorio, 142+ Android) para enviar URLs a urlscan.io.
    dataConsent: {
      supported: true,
      async contains() {
        try { return await api.permissions.contains(DATA); } catch (_) { return true; } // Firefox antiguo: no aplica
      },
      async request() {
        try { return await api.permissions.request(DATA); } catch (_) { return true; }
      },
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
