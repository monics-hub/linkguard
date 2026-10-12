// Lectura/escritura de la configuración. Común a ambos navegadores: solo usa PG.platform.
(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});
  const KEY = 'settings';

  const LIST_KEYS = ['watchlist', 'internalHosts', 'whitelist', 'protectedDomains'];

  function normalize(raw) {
    const s = { ...PG.DEFAULT_SETTINGS, ...(raw || {}) };
    for (const k of LIST_KEYS) {
      const list = Array.isArray(s[k]) ? s[k] : String(s[k] || '').split(/[\s,;]+/);
      s[k] = [...new Set(list.map(PG.domain.normalizeHostEntry).filter(Boolean))];
    }
    if (!['discreet', 'full', 'skip'].includes(s.knownMode)) s.knownMode = 'discreet';
    if (!['public', 'unlisted', 'private'].includes(s.urlscanVisibility)) s.urlscanVisibility = 'unlisted';
    s.dangerDelaySeconds = Math.max(0, Math.min(10, Number(s.dangerDelaySeconds) || 0));
    s.urlscanApiKey = String(s.urlscanApiKey || '').trim();
    return s;
  }

  async function load() {
    const data = await PG.platform.storage.get(KEY);
    return normalize(data && data[KEY]);
  }

  async function save(partial) {
    const current = await load();
    const next = normalize({ ...current, ...partial });
    await PG.platform.storage.set({ [KEY]: next });
    return next;
  }

  async function addToWhitelist(domain) {
    const s = await load();
    const d = PG.domain.normalizeHostEntry(domain);
    if (d && !s.whitelist.includes(d)) s.whitelist.push(d);
    return save({ whitelist: s.whitelist });
  }

  /** Llama a cb(nuevaConfig) cada vez que cambie la configuración (en cualquier contexto). */
  function onChange(cb) {
    PG.platform.onStorageChanged((changes, area) => {
      if (area === 'local' && changes[KEY]) cb(normalize(changes[KEY].newValue));
    });
  }

  /** Versión "pública" para enviar a las páginas: nunca incluye la API key. */
  function publicView(s) {
    const { urlscanApiKey, ...rest } = s;
    return { ...rest, urlscanConfigured: !!urlscanApiKey };
  }

  PG.settings = { load, save, addToWhitelist, onChange, normalize, publicView, KEY };
})(typeof globalThis !== 'undefined' ? globalThis : this);
