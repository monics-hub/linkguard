// Cliente de la API de urlscan.io (se ejecuta solo en el background: la API key nunca llega a las páginas).
// Docs: https://urlscan.io/docs/api/
(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});
  const BASE = 'https://urlscan.io';
  const UUID = /^[0-9a-f-]{36}$/i;

  function explain(status, body) {
    const msg = (body && (body.description || body.message)) || '';
    if (status === 401 || status === 403) return 'API key de urlscan.io inválida o sin permisos.' + (msg ? ` (${msg})` : '');
    if (status === 429) return 'Has superado el límite de escaneos de tu plan de urlscan.io. Inténtalo más tarde.';
    if (status === 400) return 'urlscan.io rechazó el escaneo: ' + (msg || 'URL no válida o dominio que no resuelve.');
    return `Error ${status} de urlscan.io${msg ? ': ' + msg : ''}`;
  }

  async function submit(apiKey, url, visibility) {
    const res = await fetch(`${BASE}/api/v1/scan/`, {
      method: 'POST',
      headers: { 'API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, visibility, tags: ['linkguard'] }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(explain(res.status, body));
    return { uuid: body.uuid, reportUrl: body.result, visibility: body.visibility || visibility };
  }

  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  /** Descarga la captura como data: URL (así se ve aunque la CSP del correo bloquee imágenes externas). */
  async function screenshot(uuid) {
    try {
      const res = await fetch(`${BASE}/screenshots/${uuid}.png`);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 2_500_000) return null;
      return 'data:image/png;base64,' + toBase64(buf);
    } catch (_) {
      return null;
    }
  }

  async function result(apiKey, uuid) {
    if (!UUID.test(uuid)) throw new Error('Identificador de escaneo no válido');
    const res = await fetch(`${BASE}/api/v1/result/${uuid}/`, { headers: apiKey ? { 'API-Key': apiKey } : {} });
    if (res.status === 404) return { pending: true };
    if (res.status === 410) throw new Error('urlscan.io eliminó este escaneo.');
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(explain(res.status, j));
    const page = j.page || {};
    const overall = (j.verdicts && j.verdicts.overall) || {};
    const brands = (overall.brands || []).map((b) => (typeof b === 'string' ? b : b && (b.name || b.key))).filter(Boolean);
    return {
      pending: false,
      finalUrl: page.url || (j.task && j.task.url) || '',
      domain: page.domain || '',
      ip: page.ip || '',
      country: page.country || '',
      server: page.server || '',
      asn: page.asnname || '',
      title: page.title || '',
      domainAgeDays: page.apexDomainAgeDays != null ? page.apexDomainAgeDays : page.domainAgeDays,
      malicious: !!overall.malicious,
      score: typeof overall.score === 'number' ? overall.score : null,
      categories: overall.categories || [],
      brands,
      reportUrl: (j.task && j.task.reportURL) || `${BASE}/result/${uuid}/`,
      screenshot: await screenshot(uuid),
    };
  }

  async function testKey(apiKey) {
    const res = await fetch(`${BASE}/user/quotas/`, { headers: { 'API-Key': apiKey } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(explain(res.status, j));
    const limits = j.limits || {};
    const q = (k) => limits[k] && limits[k].day ? `${limits[k].day.remaining ?? '?'} de ${limits[k].day.limit ?? '?'} hoy` : 'no disponible';
    return { ok: true, public: q('public'), unlisted: q('unlisted'), private: q('private') };
  }

  PG.urlscan = { submit, result, testKey };
})(typeof globalThis !== 'undefined' ? globalThis : this);
