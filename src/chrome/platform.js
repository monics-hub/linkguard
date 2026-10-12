// ADAPTADOR CHROME (y navegadores Chromium: Edge, Brave, Opera, Kiwi/Lemur en Android…).
// Traduce la API `chrome.*` a la interfaz común PG.platform que usan los módulos de src/common.
(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});
  if (PG.platform) return;
  const api = root.chrome;

  // Memoria de respaldo si storage.session no existe (navegadores Chromium antiguos).
  const memorySession = {};

  PG.platform = {
    name: 'chrome',

    storage: {
      get: (keys) => api.storage.local.get(keys),
      set: (obj) => api.storage.local.set(obj),
    },
    session: {
      get: (keys) => (api.storage.session ? api.storage.session.get(keys) : Promise.resolve(pick(memorySession, keys))),
      set: (obj) => (api.storage.session ? api.storage.session.set(obj) : Promise.resolve(Object.assign(memorySession, obj))),
    },
    onStorageChanged(cb) {
      api.storage.onChanged.addListener(cb);
    },

    // --- Mensajería: en Chrome el listener debe devolver `true` y usar sendResponse.
    sendMessage(msg) {
      return api.runtime.sendMessage(msg);
    },
    onMessage(handler) {
      api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (sender.id !== api.runtime.id) return false;
        Promise.resolve()
          .then(() => handler(msg, sender))
          .then((res) => sendResponse(res === undefined ? null : res), (err) => sendResponse({ error: String((err && err.message) || err) }));
        return true;
      });
    },

    // --- Pestañas
    tabs: {
      create: (props) => api.tabs.create(props),
      update: (tabId, props) => api.tabs.update(tabId, props),
      get: (tabId) => api.tabs.get(tabId),
      query: (q) => api.tabs.query(q),
      onRemoved: (cb) => api.tabs.onRemoved.addListener(cb),
    },
    webNavigation: api.webNavigation
      ? {
          onCommitted: (cb) => api.webNavigation.onCommitted.addListener(cb),
          onCreatedNavigationTarget: (cb) => api.webNavigation.onCreatedNavigationTarget.addListener(cb),
        }
      : null,

    /** Inyecta los scripts de protección solo en el marco que lo pidió. */
    inject(tabId, frameId, files) {
      return api.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files, injectImmediately: true });
    },

    getURL: (p) => api.runtime.getURL(p),
    openOptionsPage: () => api.runtime.openOptionsPage(),
    onInstalled: (cb) => api.runtime.onInstalled.addListener(cb),

    permissions: {
      contains: (p) => api.permissions.contains(p),
      request: (p) => api.permissions.request(p),
    },
    // Chrome no tiene consentimiento de recopilación de datos integrado: siempre "concedido".
    dataConsent: {
      supported: false,
      contains: async () => true,
      request: async () => true,
    },
  };

  function pick(obj, keys) {
    if (keys == null) return { ...obj };
    const out = {};
    for (const k of [].concat(keys)) if (k in obj) out[k] = obj[k];
    return out;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
