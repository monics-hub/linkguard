// Analizador de enlaces: comprobaciones locales e instantáneas (sin red, < 1 ms por enlace).
// Es código puro (sin APIs del navegador) → se comparte tal cual entre Chrome y Firefox
// y se prueba con Node (tests/analyzer.test.js).
(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  const IGNORED_SCHEMES = new Set(['mailto', 'tel', 'sms', 'callto', 'javascript', 'about', 'blob', 'chrome', 'chrome-extension', 'moz-extension', 'edge', 'file']);
  const WEB_SCHEMES = new Set(['http', 'https', 'ftp']);

  // ---------------------------------------------------------------- redirecciones del portal
  function decodeProofpoint2(u) {
    return decodeURIComponent(u.replace(/-/g, '%').replace(/_/g, '/'));
  }
  function decodeProofpoint3(href) {
    const m = href.match(/\/v3\/__(.+?)__;/);
    return m ? m[1].replace(/\*/g, '') : null; // simplificado: los "*" codifican caracteres sustituidos
  }

  /** Quita las capas de redirección de Gmail, Safe Links, etc. Máximo 4 niveles. */
  function unwrap(href) {
    const chain = [];
    let current = href;
    for (let depth = 0; depth < 4; depth++) {
      let u;
      try { u = new URL(current); } catch (_) { break; }
      const rule = PG.REDIRECTORS.find((r) => r.host.test(u.hostname) && (!r.path || r.path.test(u.pathname)));
      if (!rule) break;
      let next = null;
      if (rule.decode === 'proofpoint3') next = decodeProofpoint3(current);
      else {
        for (const p of rule.params || []) {
          const v = u.searchParams.get(p);
          if (v) { next = rule.decode === 'proofpoint2' ? decodeProofpoint2(v) : v; break; }
        }
      }
      if (!next || !/^[a-z][a-z0-9+.-]*:/i.test(next)) break;
      chain.push(rule.name);
      current = next;
    }
    return { url: current, chain };
  }

  // ---------------------------------------------------------------- texto visible del enlace
  const TEXT_DOMAIN_RE = /(?<![\p{L}\p{N}@._-])(?:(https?):\/\/)?((?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+\p{L}[\p{L}\p{N}-]{1,62})(?![\p{L}\p{N}-]|\.[\p{L}\p{N}])/giu;

  /** Dominios que aparecen escritos en el texto visible del enlace ("banco.com", "https://x.com/…"). */
  function domainsInText(text) {
    const out = [];
    if (!text) return out;
    const s = String(text).slice(0, 500);
    for (const m of s.matchAll(TEXT_DOMAIN_RE)) {
      const hasScheme = !!m[1];
      const raw = m[2];
      const tld = raw.split('.').pop().toLowerCase();
      if (PG.FILE_LIKE_TLDS.has(tld) && !hasScheme && !/^www\./i.test(raw)) continue;
      let host;
      try { host = new URL('http://' + raw).hostname; } catch (_) { continue; }
      const p = PG.domain.parse(host);
      if (!p.domain || !p.knownSuffix) continue;
      out.push({ text: raw, hostname: host, registrable: p.domain, parsed: p });
      if (out.length >= 5) break;
    }
    return out;
  }

  // ---------------------------------------------------------------- análisis principal
  const targetsCache = new WeakMap();
  function targetsFor(settings) {
    let t = targetsCache.get(settings);
    if (!t) { t = PG.lookalike.buildTargets(settings); targetsCache.set(settings, t); }
    return t;
  }

  const alert = (level, code, title, detail) => ({ level, code, title, detail: detail || '' });

  function isUserContentHost(host) {
    return PG.domain.hostInList(host, PG.USER_CONTENT_HOSTS);
  }

  /**
   * Analiza un enlace.
   * @param {{href:string, text?:string, settings:object}} input
   */
  function analyze({ href, text, settings }) {
    settings = settings || PG.DEFAULT_SETTINGS;
    const targets = targetsFor(settings);
    const alerts = [];
    const { url: finalUrl, chain } = unwrap(href);

    const report = {
      href, url: finalUrl, unwrappedBy: chain, scheme: '', hostname: '', unicodeHostname: '',
      registrable: '', unicodeRegistrable: '', subdomain: '', publicSuffix: '', isIp: false,
      isIdn: false, port: '', official: null, isShortener: false, isUserContent: false,
      textDomains: [], alerts, level: 'neutral', canProceed: true, analyzedAt: Date.now(),
    };

    let u;
    try { u = new URL(finalUrl); } catch (_) {
      alerts.push(alert('danger', 'invalid', 'Enlace mal formado', 'No se pudo interpretar la dirección del enlace.'));
      report.level = 'danger';
      return report;
    }
    report.scheme = u.protocol.replace(/:$/, '');

    if (report.scheme === 'data') {
      alerts.push(alert('danger', 'data-url', 'Página incrustada en el propio enlace (data:)',
        'El enlace no lleva a ningún sitio web: contiene una página completa oculta en la URL. Es una técnica usada para falsificar formularios de acceso. Los navegadores bloquean su apertura.'));
      report.registrable = '(sin dominio)';
      report.level = 'danger';
      report.canProceed = false;
      return report;
    }
    if (!WEB_SCHEMES.has(report.scheme)) {
      alerts.push(alert('warn', 'external-app', `Abre una aplicación externa (${report.scheme}:)`,
        'Este enlace no es una página web: pedirá a tu sistema que abra otro programa.'));
      report.registrable = report.scheme + ':';
      report.level = 'warn';
      return report;
    }

    // --- Dominio real
    const hostname = u.hostname.replace(/\.$/, '');
    const parsed = PG.domain.parse(hostname);
    report.hostname = hostname;
    report.unicodeHostname = PG.punycode.toUnicode(hostname);
    report.isIdn = /(^|\.)xn--/.test(hostname);
    report.isIp = parsed.isIp;
    report.registrable = parsed.domain || hostname;
    report.unicodeRegistrable = PG.punycode.toUnicode(report.registrable);
    report.subdomain = parsed.subdomain || '';
    report.publicSuffix = parsed.publicSuffix || '';
    report.port = u.port;

    const official = PG.lookalike.officialBrand(parsed, targets);
    report.official = official ? official.name : null;
    report.isShortener = PG.SHORTENERS.has(report.registrable) || PG.SHORTENERS.has(hostname);
    report.isUserContent = isUserContentHost(hostname);

    if (chain.length) {
      alerts.push(alert('info', 'unwrapped', `Redirección de ${[...new Set(chain)].join(' → ')} eliminada`,
        'Tu proveedor de correo envuelve los enlaces en una redirección; se muestra el destino real. Al continuar se abre el enlace original, así conservas su protección.'));
    }

    // --- Credenciales en la URL: https://paypal.com@sitio-malo.xyz
    if (u.username || u.password) {
      alerts.push(alert('danger', 'userinfo', 'La URL contiene un "@" engañoso',
        `Lo que aparece antes del "@" (${decodeURIComponent(u.username).slice(0, 60)}) es decorativo: el navegador irá en realidad a ${report.registrable}.`));
    }

    // --- IP en lugar de dominio
    if (parsed.isIp) {
      const priv = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
      alerts.push(alert('warn', 'ip', 'Dirección IP en lugar de nombre de dominio',
        priv ? 'Apunta a una dirección de red local/privada. Ningún servicio legítimo te enviaría algo así por correo.'
             : 'Los sitios legítimos usan nombres de dominio. Una IP oculta quién está detrás del sitio.'));
    }

    // --- IDN / punycode
    if (report.isIdn) {
      const label = PG.punycode.toUnicode(parsed.domainWithoutSuffix || '');
      const mixed = PG.lookalike.mixedScript(label);
      alerts.push(alert(mixed ? 'danger' : 'warn', 'idn',
        mixed ? 'El dominio mezcla alfabetos (posible homógrafo)' : 'Dominio con caracteres internacionales',
        `Se ve como «${report.unicodeHostname}», pero su forma real es «${hostname}». Letras de otros alfabetos pueden imitar letras latinas.`));
    }

    // --- Imitación de marcas / dominios de confianza
    const unicodeLabel = PG.punycode.toUnicode(parsed.domainWithoutSuffix || '');
    const kinds = {
      'same-name-other-tld': (f) => `Usa el nombre «${f.key}» pero NO es un dominio oficial de ${f.brand}.`,
      homograph: (f) => `Visualmente se parece a «${f.key}» (letras sustituidas por otras parecidas), pero es otro dominio.`,
      'brand-token': (f) => `Incluye «${f.key}» como parte del nombre para aparentar ser ${f.brand}, pero lo controla otra persona.`,
      'brand-substring': (f) => `Contiene «${f.key}» pegado a otras palabras para aparentar ser ${f.brand}.`,
      typo: (f) => `Está a una o dos letras de «${f.key}» (${f.brand}): técnica de typosquatting.`,
      'brand-in-subdomain': (f) => `Pone «${f.key}» al principio de la dirección para engañar a la vista; el sitio real es ${report.registrable}.`,
    };
    for (const f of PG.lookalike.detect(parsed, unicodeLabel, targets).slice(0, 2)) {
      const who = f.user ? `tu dominio de confianza ${f.brand}` : f.brand;
      alerts.push(alert(f.level, 'lookalike:' + f.kind,
        f.level === 'danger' ? `¡Finge ser ${who}!` : `Se parece a ${who}`, kinds[f.kind](f)));
    }

    // --- Texto visible ≠ destino real
    const textDomains = domainsInText(text);
    report.textDomains = textDomains.map((d) => d.text);
    if (textDomains.length && !textDomains.some((d) => d.registrable === report.registrable)) {
      const shown = textDomains[0];
      const shownBrand = PG.lookalike.officialBrand(shown.parsed, targets);
      const sameBrand = shownBrand && official && shownBrand === official;
      if (sameBrand) {
        alerts.push(alert('info', 'text-other-official', 'El texto muestra otro dominio de la misma empresa',
          `El texto dice «${shown.text}» y el enlace va a ${report.registrable}; ambos pertenecen a ${official.name}.`));
      } else if (PG.CLICK_TRACKERS.has(report.registrable) || report.isShortener) {
        alerts.push(alert('warn', 'text-mismatch-tracker', 'El texto no coincide con el destino (redirección oculta)',
          `El texto dice «${shown.text}», pero el enlace pasa por ${report.registrable}. Suele ser un rastreador de email marketing, pero el destino final no se ve: analízalo con urlscan si dudas.`));
      } else {
        alerts.push(alert('danger', 'text-mismatch', '¡El texto del enlace miente sobre el destino!',
          `El enlace muestra «${shown.text}», pero en realidad te lleva a ${report.registrable}.`));
      }
    }

    // --- Acortadores
    if (report.isShortener) {
      alerts.push(alert('warn', 'shortener', 'Acortador de URL: el destino real está oculto',
        `${report.registrable} solo redirige a otra dirección que no se puede ver desde aquí. Usa «Analizar con URLScan» para descubrir a dónde lleva.`));
    }

    // --- Contenido publicado por terceros en servicios de grandes empresas
    if (report.isUserContent && !report.isShortener) {
      alerts.push(alert('info', 'user-content', 'Servicio donde cualquiera puede publicar',
        `Aunque ${report.registrable} pertenezca a una empresa conocida, el contenido de esta página lo pudo crear cualquiera (formularios, documentos, webs gratuitas). No introduzcas contraseñas.`));
    }

    // --- Otros indicadores ligeros
    if (report.scheme === 'http') {
      alerts.push(alert(official ? 'info' : 'warn', 'http', 'Conexión sin cifrar (http)', 'Lo que escribas en ese sitio podría ser interceptado.'));
    }
    if (report.port && !['80', '443'].includes(report.port)) {
      alerts.push(alert('warn', 'port', `Puerto no habitual (${report.port})`, 'Los sitios web normales no indican un puerto en la dirección.'));
    }
    const tld = (report.publicSuffix || '').split('.').pop();
    if (!official && PG.SUSPICIOUS_TLDS.has(tld)) {
      alerts.push(alert('info', 'tld', `Extensión .${tld} muy usada en fraudes`, 'No es necesariamente maliciosa, pero es habitual en campañas de phishing por ser barata.'));
    }
    if (!official && report.subdomain && report.subdomain.split('.').length >= 4) {
      alerts.push(alert('info', 'deep-subdomain', 'Demasiados subdominios', 'Las direcciones muy largas sirven para esconder el dominio real al final.'));
    }
    if (!official && PG.lookalike.hasPhishingWord(decodeURIComponent(u.pathname + u.search).slice(0, 400) + ' ' + (report.subdomain || ''))) {
      alerts.push(alert('info', 'phishing-words', 'La dirección contiene palabras típicas de phishing', 'Por ejemplo "login", "verificar", "cuenta" o "pago".'));
    }

    if (official && !alerts.some((a) => a.level !== 'info')) {
      alerts.unshift(alert('ok', 'official', `Dominio oficial de ${official.name}`, `${report.registrable} pertenece a ${official.name}.`));
    }

    // --- Nivel global → intensidad del aviso
    if (alerts.some((a) => a.level === 'danger')) report.level = 'danger';
    else if (alerts.some((a) => a.level === 'warn')) report.level = 'warn';
    else if (official && !report.isUserContent) report.level = 'known';
    else report.level = 'neutral';

    const order = { danger: 0, warn: 1, ok: 2, info: 3 };
    alerts.sort((a, b) => order[a.level] - order[b.level]);
    return report;
  }

  /**
   * Decide si un clic debe mostrar el aviso o dejarse pasar (anti fatiga de avisos).
   * @param {{href, text, pageHost, pageRegistrable, mode:'portal'|'derived', settings}} p
   * @returns {{action:'ignore'|'prompt', reason?:string, report?:object}}
   */
  function decide(p) {
    const settings = p.settings || PG.DEFAULT_SETTINGS;
    let u;
    try { u = new URL(p.href); } catch (_) { return { action: 'ignore', reason: 'invalid' }; }
    const scheme = u.protocol.replace(/:$/, '');
    if (IGNORED_SCHEMES.has(scheme)) return { action: 'ignore', reason: 'scheme' };

    const report = analyze({ href: p.href, text: p.text, settings });
    const host = report.hostname;
    if (host) {
      if (host === p.pageHost) return { action: 'ignore', reason: 'same-host', report };
      if (PG.domain.hostInList(host, settings.internalHosts)) return { action: 'ignore', reason: 'internal', report };
      if (p.mode === 'portal' && PG.domain.hostInList(host, settings.watchlist)) return { action: 'ignore', reason: 'portal', report };
      if (p.mode === 'derived' && p.pageRegistrable && report.registrable === p.pageRegistrable && report.level !== 'danger') {
        return { action: 'ignore', reason: 'same-site', report };
      }
      if (PG.domain.hostInList(host, settings.whitelist)) return { action: 'ignore', reason: 'whitelist', report };
      if (report.level === 'known' && settings.knownMode === 'skip') return { action: 'ignore', reason: 'known', report };
    }
    return { action: 'prompt', report };
  }

  PG.analyzer = { analyze, decide, unwrap, domainsInText };
})(typeof globalThis !== 'undefined' ? globalThis : this);
