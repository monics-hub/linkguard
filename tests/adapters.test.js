// Pruebas de integración del background con los DOS adaptadores (Chrome y Firefox) usando
// APIs simuladas. Comprueban que el mismo código común se comporta igual en ambos navegadores.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', 'src');
const BG_FILES = ['common/data/defaults.js', 'common/core/domain.js', 'common/core/settings.js', 'common/background/urlscan.js', 'common/background/background-core.js'];

function event() {
  const ls = [];
  return { addListener: (f) => ls.push(f), ls };
}

function fakeApi(style) {
  const store = {}, session = {};
  const calls = { inject: [], create: [], update: [] };
  let nextTab = 10;
  const area = (obj) => ({
    get: async (k) => (k == null ? { ...obj } : Object.fromEntries([].concat(k).filter((x) => x in obj).map((x) => [x, structuredClone(obj[x])]))),
    set: async (o) => { Object.assign(obj, structuredClone(o)); },
  });
  const api = {
    runtime: { id: 'ext', onMessage: event(), onInstalled: event(), getURL: (p) => p, openOptionsPage: async () => {} },
    storage: { local: area(store), session: area(session), onChanged: event() },
    tabs: {
      create: async (p) => { calls.create.push(p); return { id: nextTab++, url: p.url }; },
      update: async (id, p) => { calls.update.push([id, p]); return { id }; },
      get: async (id) => ({ id, url: 'https://mail.google.com/mail/' }),
      query: async () => [],
      onRemoved: event(),
    },
    webNavigation: { onCommitted: event(), onCreatedNavigationTarget: event() },
    scripting: { executeScript: async (o) => { calls.inject.push(o); return []; } },
    permissions: { contains: async () => true, request: async () => true },
  };
  // Simula la diferencia real entre navegadores en runtime.onMessage.
  async function dispatch(msg, sender) {
    sender = { id: 'ext', ...sender };
    const [listener] = api.runtime.onMessage.ls;
    if (style === 'chrome') {
      return new Promise((resolve) => { const keep = listener(msg, sender, resolve); assert.equal(keep, true); });
    }
    return listener(msg, sender);
  }
  return { api, calls, dispatch, session };
}

function boot(browser) {
  const { api, calls, dispatch, session } = fakeApi(browser);
  const ctx = vm.createContext({ console, URL, setTimeout, clearTimeout, fetch: async () => { throw new Error('sin red'); }, structuredClone, btoa });
  ctx.globalThis = ctx;
  if (browser === 'chrome') ctx.chrome = api; else ctx.browser = api;
  for (const f of [`${browser}/platform.js`, ...BG_FILES]) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  vm.runInContext('PG.backgroundCore.start()', ctx);
  return { ctx, api, calls, dispatch, session };
}

for (const browser of ['chrome', 'firefox']) {
  test(`${browser}: activa en el portal, sigue la pestaña abierta y no toca el resto`, async () => {
    const { calls, dispatch } = boot(browser);
    const gmail = { tab: { id: 1, index: 0, url: 'https://mail.google.com/mail/u/0/' }, frameId: 0 };

    let r = await dispatch({ type: 'PG_BOOT', referrer: '' }, gmail);
    assert.equal(r.active, true);
    assert.equal(calls.inject.length, 1);
    assert.ok(calls.inject[0].files.includes('common/content/content.js'));

    r = await dispatch({ type: 'PG_CONTEXT' }, gmail);
    assert.equal(r.mode, 'portal');
    assert.equal('urlscanApiKey' in r.settings, false, 'la API key nunca se envía a la página');

    // Página no vigilada → nada
    r = await dispatch({ type: 'PG_BOOT', referrer: '' }, { tab: { id: 5, url: 'https://www.youtube.com/' }, frameId: 0 });
    assert.equal(r.active, false);

    // El usuario pulsa SÍ en un enlace target=_blank
    r = await dispatch({ type: 'PG_OPEN', url: 'https://tienda.example/promo', disposition: 'newtab' }, gmail);
    assert.equal(r.ok, true);
    assert.equal(calls.create[0].openerTabId, 1);
    const newTab = { tab: { id: 10, url: 'https://tienda.example/promo' }, frameId: 0 };
    r = await dispatch({ type: 'PG_CONTEXT' }, newTab);
    assert.equal(r.mode, 'derived');

    // Respaldo por Referer
    r = await dispatch({ type: 'PG_CONTEXT', referrer: 'https://outlook.live.com/mail/0/' }, { tab: { id: 77, url: 'https://x.example/' }, frameId: 0 });
    assert.equal(r.mode, 'derived');

    // Solo se abren URLs web
    r = await dispatch({ type: 'PG_OPEN', url: 'javascript:alert(1)', disposition: 'same' }, gmail);
    assert.ok(r.error);

    // Confiar en un dominio
    r = await dispatch({ type: 'PG_TRUST', domain: 'tienda.example' }, gmail);
    assert.deepEqual([...r.whitelist], ['tienda.example']);
  });
}
