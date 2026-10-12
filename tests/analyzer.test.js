// Pruebas del núcleo común (se ejecutan en Node: `npm test` o `node --test tests/`).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src', 'common');
for (const f of ['data/defaults.js', 'data/psl-data.js', 'core/punycode.js', 'core/domain.js', 'core/lookalike.js', 'core/analyzer.js']) {
  require(path.join(SRC, f));
}
const PG = globalThis.PG;
const S = { ...PG.DEFAULT_SETTINGS, whitelist: [], protectedDomains: ['mibanco.com.mx'] };
const analyze = (href, text = '') => PG.analyzer.analyze({ href, text, settings: S });
const codes = (r) => r.alerts.map((a) => a.code);

test('dominio registrable con la PSL', () => {
  assert.equal(PG.domain.parse('www.paypal.com.verificacion-cuenta.xyz').domain, 'verificacion-cuenta.xyz');
  assert.equal(PG.domain.parse('login.bancosantander.es').domain, 'bancosantander.es');
  assert.equal(PG.domain.parse('a.b.example.co.uk').domain, 'example.co.uk');
  assert.equal(PG.domain.parse('www.sat.gob.mx').domain, 'sat.gob.mx');
  assert.equal(PG.domain.parse('alguien.github.io').domain, 'alguien.github.io');
  assert.equal(PG.domain.parse('co.uk').domain, null);
  assert.equal(PG.domain.parse('192.168.1.1').isIp, true);
});

test('punycode: homógrafo cirílico', () => {
  const r = analyze('https://аpple.com/login'); // "а" cirílica
  assert.equal(r.hostname, 'xn--pple-43d.com');
  assert.equal(r.unicodeHostname, 'аpple.com');
  assert.equal(r.level, 'danger');
  assert.ok(codes(r).includes('idn'));
  assert.ok(codes(r).some((c) => c.startsWith('lookalike:')));
});

test('ejemplo del enunciado: paypal.com en subdominio', () => {
  const r = analyze('https://www.paypal.com.verificacion-cuenta.xyz/login');
  assert.equal(r.registrable, 'verificacion-cuenta.xyz');
  assert.equal(r.level, 'danger');
  assert.ok(codes(r).includes('lookalike:brand-in-subdomain'));
});

test('texto visible distinto del destino → peligro', () => {
  const r = analyze('https://cuentas-seguras.top/x', 'www.banco.com');
  assert.equal(r.level, 'danger');
  assert.ok(codes(r).includes('text-mismatch'));
  const ok = analyze('https://www.banco.com/x', 'banco.com');
  assert.ok(!codes(ok).includes('text-mismatch'));
  const file = analyze('https://ejemplo.com/f', 'Factura_2026.zip');
  assert.ok(!codes(file).includes('text-mismatch'));
  const same = analyze('https://www.amazon.es/pedido', 'amazon.com');
  assert.ok(!codes(same).includes('text-mismatch'));
});

test('IP, acortador, @ engañoso, puerto, data:', () => {
  assert.ok(codes(analyze('http://185.22.33.4/login')).includes('ip'));
  assert.ok(codes(analyze('http://3232235777/')).includes('ip')); // IP en decimal → 192.168.1.1
  const s = analyze('https://bit.ly/3abc');
  assert.ok(codes(s).includes('shortener'));
  assert.equal(s.level, 'warn');
  assert.equal(analyze('https://paypal.com@malo.xyz/').level, 'danger');
  assert.ok(codes(analyze('https://ejemplo.com:8443/')).includes('port'));
  const d = analyze('data:text/html;base64,PGgxPkhvbGE8L2gxPg==');
  assert.equal(d.level, 'danger');
  assert.equal(d.canProceed, false);
});

test('imitaciones de marcas y de dominios propios', () => {
  for (const u of ['https://paypa1.com/', 'https://rnicrosoft.com/', 'https://paypal-seguridad.com/',
    'https://santnader.com/', 'https://paypal.xyz/', 'https://micuenta-paypal.web.app/', 'https://mibanco-mx.com/acceso',
    'https://netflix-pagos.net/']) {
    assert.equal(analyze(u).level, 'danger', u);
  }
});

test('dominios oficiales → aviso discreto, sin falsos positivos', () => {
  for (const u of ['https://www.paypal.com/myaccount', 'https://www.amazon.com.mx/', 'https://login.microsoftonline.com/',
    'https://www.google.es/', 'https://www.bbva.mx/']) {
    const r = analyze(u);
    assert.equal(r.level, 'known', u + ' ' + JSON.stringify(r.alerts));
  }
  for (const u of ['https://www.pineapple.com/', 'https://www.wikipedia.org/', 'https://news.ycombinator.com/', 'https://www.elpais.com/']) {
    assert.equal(analyze(u).level, 'neutral', u + ' ' + JSON.stringify(analyze(u).alerts));
  }
  assert.equal(analyze('https://docs.google.com/forms/d/e/x/viewform').level, 'neutral');
});

test('desenvuelve redirecciones de Gmail y Outlook', () => {
  const g = analyze('https://www.google.com/url?q=https://evil-paypal.com/x&sa=D');
  assert.equal(g.registrable, 'evil-paypal.com');
  assert.ok(codes(g).includes('unwrapped'));
  const o = analyze('https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fbit.ly%2Fabc&data=05');
  assert.equal(o.registrable, 'bit.ly');
});

test('decide(): evita la fatiga de avisos', () => {
  const base = { settings: { ...S, whitelist: ['empresa.com'] }, pageHost: 'mail.google.com', mode: 'portal' };
  const d = (href, extra = {}) => PG.analyzer.decide({ ...base, href, ...extra }).action;
  assert.equal(d('https://mail.google.com/mail/u/0/#inbox'), 'ignore');
  assert.equal(d('https://accounts.google.com/SignOutOptions'), 'ignore');
  assert.equal(d('mailto:a@b.com'), 'ignore');
  assert.equal(d('https://intranet.empresa.com/'), 'ignore');
  assert.equal(d('https://phish.example/'), 'prompt');
  assert.equal(d('https://shop.tienda.com/b', { mode: 'derived', pageHost: 'www.tienda.com', pageRegistrable: 'tienda.com' }), 'ignore');
  assert.equal(d('https://otro.com/', { mode: 'derived', pageHost: 'www.tienda.com', pageRegistrable: 'tienda.com' }), 'prompt');
  // un dominio parecido a uno de la lista blanca SIEMPRE avisa
  const r = PG.analyzer.decide({ ...base, href: 'https://empresa-login.com/' });
  assert.equal(r.action, 'prompt');
  assert.equal(r.report.level, 'danger');
});

test('rendimiento: análisis en milisegundos', () => {
  analyze('https://warmup.com');
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) analyze(`https://sub${i}.paypal-verif${i}.com/login`, 'paypal.com');
  const per = (performance.now() - t0) / 200;
  assert.ok(per < 5, `demasiado lento: ${per.toFixed(2)} ms`);
});
