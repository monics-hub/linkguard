// Cálculo del DOMINIO REGISTRABLE (el que realmente controla el sitio) con la Public Suffix List.
//   www.paypal.com.verificacion-cuenta.xyz → registrable: verificacion-cuenta.xyz
//   login.bancosantander.es               → registrable: bancosantander.es
//   alguien.github.io                     → registrable: alguien.github.io (github.io es sufijo público)
//
// Si la librería `tldts` está presente (window.tldts, ver README → "Usar tldts"), se usa ella.
// Si no, se usa este motor propio con la copia de la PSL incluida en data/psl-data.js.
(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  let rules = null, wildcards = null, exceptions = null;

  function loadRules() {
    if (rules) return;
    rules = new Set(); wildcards = new Set(); exceptions = new Set();
    const raw = (PG.PSL_DATA && PG.PSL_DATA.rules) || '';
    for (const r of raw.split('\n')) {
      if (!r) continue;
      if (r.startsWith('!')) exceptions.add(r.slice(1));
      else if (r.startsWith('*.')) wildcards.add(r.slice(2));
      else rules.add(r);
    }
  }

  const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

  function isIp(hostname) {
    if (!hostname) return false;
    if (hostname.startsWith('[') || hostname.includes(':')) return true; // IPv6
    return IPV4.test(hostname);
  }

  /** Devuelve el sufijo público y si coincidió con una regla real de la PSL (o solo con la regla "*"). */
  function publicSuffixOf(labels) {
    for (let i = 0; i < labels.length; i++) {
      const candidate = labels.slice(i).join('.');
      if (exceptions.has(candidate)) return { suffix: labels.slice(i + 1).join('.'), listed: true };
      if (rules.has(candidate)) return { suffix: candidate, listed: true };
      if (i + 1 < labels.length && wildcards.has(labels.slice(i + 1).join('.'))) return { suffix: candidate, listed: true };
    }
    return { suffix: labels[labels.length - 1], listed: false }; // regla implícita "*"
  }

  function parseBuiltin(hostname) {
    loadRules();
    const labels = hostname.split('.').filter(Boolean);
    const { suffix, listed } = publicSuffixOf(labels);
    const suffixLabels = suffix ? suffix.split('.').length : 0;
    if (labels.length <= suffixLabels) {
      return { hostname, isIp: false, publicSuffix: suffix, knownSuffix: listed, domain: null, domainWithoutSuffix: null, subdomain: '' };
    }
    const domainLabels = labels.slice(labels.length - suffixLabels - 1);
    return {
      hostname,
      isIp: false,
      publicSuffix: suffix,
      knownSuffix: listed,
      domain: domainLabels.join('.'),
      domainWithoutSuffix: domainLabels[0],
      subdomain: labels.slice(0, labels.length - suffixLabels - 1).join('.'),
    };
  }

  function parseWithTldts(hostname) {
    const r = root.tldts.parse(hostname, { allowPrivateDomains: true, extractHostname: false });
    return {
      hostname,
      isIp: !!r.isIp,
      publicSuffix: r.publicSuffix,
      knownSuffix: !!(r.isIcann || r.isPrivate),
      domain: r.domain,
      domainWithoutSuffix: r.domainWithoutSuffix,
      subdomain: r.subdomain || '',
    };
  }

  /**
   * @param {string} hostname  hostname YA normalizado por new URL() (minúsculas, punycode).
   */
  function parse(hostname) {
    hostname = String(hostname || '').toLowerCase().replace(/\.$/, '');
    if (!hostname) return { hostname, isIp: false, publicSuffix: null, knownSuffix: false, domain: null, domainWithoutSuffix: null, subdomain: '' };
    if (isIp(hostname)) return { hostname, isIp: true, publicSuffix: null, knownSuffix: false, domain: hostname, domainWithoutSuffix: null, subdomain: '' };
    if (root.tldts && typeof root.tldts.parse === 'function') return parseWithTldts(hostname);
    return parseBuiltin(hostname);
  }

  /** Dominio registrable o, si no lo hay, el propio hostname. */
  function registrable(hostname) {
    const p = parse(hostname);
    return p.domain || p.hostname;
  }

  /** Normaliza una entrada escrita por el usuario ("https://WWW.Banco.com/x", "*.banco.com") → "www.banco.com" / "banco.com". */
  function normalizeHostEntry(entry) {
    let s = String(entry || '').trim().toLowerCase();
    if (!s) return '';
    s = s.replace(/^\*\./, '');
    try {
      const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(s) ? s : 'http://' + s);
      return u.hostname.replace(/\.$/, '');
    } catch (_) {
      return '';
    }
  }

  /** ¿host es igual a pattern o un subdominio suyo? */
  function hostMatches(host, pattern) {
    if (!host || !pattern) return false;
    return host === pattern || host.endsWith('.' + pattern);
  }

  function hostInList(host, list) {
    return (list || []).some((p) => hostMatches(host, p));
  }

  PG.domain = { parse, registrable, isIp, normalizeHostEntry, hostMatches, hostInList, engine: () => (root.tldts ? 'tldts' : 'interno') };
})(typeof globalThis !== 'undefined' ? globalThis : this);
