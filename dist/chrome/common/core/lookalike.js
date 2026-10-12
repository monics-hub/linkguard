// Detección de dominios que FINGEN ser una marca conocida o uno de tus dominios de confianza:
//   homógrafos (аpple.com con "а" cirílica), sustituciones visuales (paypa1, rnicrosoft),
//   typosquatting (paypall, santnader), marca + palabra (paypal-seguridad.com),
//   mismo nombre con otro TLD (paypal.xyz) y marca en el subdominio (paypal.com.evil.xyz).
(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  // Caracteres que se ven como letras latinas (subconjunto práctico de Unicode "confusables").
  const CONFUSABLES = {
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ї': 'i',
    'ј': 'j', 'ѕ': 's', 'һ': 'h', 'ԁ': 'd', 'ӏ': 'l', 'ԛ': 'q', 'ԝ': 'w', 'ɡ': 'g', 'ү': 'y',
    'в': 'b', 'к': 'k', 'м': 'm', 'н': 'h', 'т': 't', 'ь': 'b', 'п': 'n',
    'ν': 'v', 'ο': 'o', 'α': 'a', 'ρ': 'p', 'τ': 't', 'ι': 'i', 'κ': 'k', 'ε': 'e', 'υ': 'u',
    'χ': 'x', 'ϲ': 'c', 'ω': 'w', 'β': 'b', 'η': 'n',
    'ı': 'i', 'ł': 'l', 'ƚ': 'l', 'ɩ': 'i', 'ǀ': 'l', 'ⅼ': 'l', 'ⅰ': 'i', 'ß': 'ss', 'æ': 'ae',
    'ø': 'o', 'đ': 'd', 'ħ': 'h', 'ŀ': 'l',
    '0': 'o', '1': 'l', '3': 'e', '5': 's', '7': 't', '8': 'b', '|': 'l',
  };

  /** "Esqueleto" visual: dos cadenas con el mismo esqueleto se ven casi iguales. */
  function skeleton(s) {
    s = String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
    let out = '';
    for (const ch of s) out += CONFUSABLES[ch] !== undefined ? CONFUSABLES[ch] : ch;
    return out.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/i/g, 'l');
  }
  const flat = (s) => s.replace(/[-_.]/g, '');

  function levenshtein(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  const LATIN = /[a-z]/;
  const NON_LATIN_LETTER = /[Ͱ-ϿЀ-ԯ԰-֏֐-׿؀-ۿ฀-๿Ⴀ-ჿḀ-ỿ぀-ヿ一-鿿가-힯]/;

  /** ¿Una etiqueta mezcla alfabetos latino y no latino? (señal clásica de homógrafo) */
  function mixedScript(unicodeLabel) {
    return LATIN.test(unicodeLabel) && NON_LATIN_LETTER.test(unicodeLabel);
  }

  const CCTLD = /^(?:[a-z]{2}|(?:com|co|net|org|gob|gov|ne|or|ac|edu)\.[a-z]{2})$/;

  /** Lista de objetivos a proteger: marcas incorporadas + lista blanca + dominios protegidos del usuario. */
  function buildTargets(settings) {
    const targets = PG.BRANDS.map((b) => ({
      name: b.name,
      keys: b.keys,
      generic: new Set(b.generic || []),
      domains: new Set(b.domains),
      ccTld: !!b.ccTld,
      user: false,
    }));
    const userDomains = new Set([...(settings.protectedDomains || []), ...(settings.whitelist || [])]);
    for (const entry of userDomains) {
      const p = PG.domain.parse(entry);
      if (!p.domain || !p.domainWithoutSuffix || p.isIp) continue;
      const key = p.domainWithoutSuffix;
      targets.push({
        name: p.domain,
        keys: [key],
        generic: new Set(key.length < 4 ? [key] : []),
        domains: new Set([p.domain]),
        ccTld: false,
        user: true,
      });
    }
    for (const t of targets) t.keySkeletons = t.keys.map((k) => ({ key: k, sk: flat(skeleton(k)) }));
    return targets;
  }

  /** ¿Es un dominio oficial de alguna marca conocida? Devuelve la marca o null. */
  function officialBrand(parsed, targets) {
    if (!parsed.domain) return null;
    for (const t of targets) {
      if (t.user) continue;
      if (t.domains.has(parsed.domain)) return t;
      if (t.ccTld && t.keys.includes(parsed.domainWithoutSuffix) && CCTLD.test(parsed.publicSuffix || '')) return t;
    }
    return null;
  }

  function hasPhishingWord(s) {
    s = String(s || '').toLowerCase();
    return PG.PHISHING_WORDS.some((w) => s.includes(w));
  }

  /**
   * @param parsed   resultado de PG.domain.parse()
   * @param unicodeLabel  domainWithoutSuffix en Unicode (para homógrafos)
   * @returns lista de hallazgos { level:'danger'|'warn', brand, kind, key }
   */
  function detect(parsed, unicodeLabel, targets) {
    const findings = [];
    if (!parsed.domain || parsed.isIp) return findings;
    if (officialBrand(parsed, targets)) return findings;

    const label = unicodeLabel || parsed.domainWithoutSuffix || '';
    const labelSk = skeleton(label);
    const labelFlat = flat(labelSk);
    const tokens = labelSk.split(/[-_]+/).filter(Boolean);
    const tld = (parsed.publicSuffix || '').split('.').pop();
    const riskyContext = hasPhishingWord(label) || PG.SUSPICIOUS_TLDS.has(tld);
    const sub = parsed.subdomain || '';
    const subSk = skeleton(PG.punycode.toUnicode(sub));
    const subTokens = subSk.split(/[-_.]+/).filter(Boolean);

    for (const t of targets) {
      if (t.domains.has(parsed.domain)) continue;
      let best = null;
      const push = (level, kind, key) => {
        if (!best || (level === 'danger' && best.level !== 'danger')) best = { level, brand: t.name, kind, key, user: t.user };
      };
      for (const { key, sk } of t.keySkeletons) {
        const generic = t.generic.has(key);
        if (sk.length < 3) continue;

        // 1) Mismo nombre (o visualmente idéntico) con otro dominio/TLD.
        if (labelFlat === sk) {
          const sameAscii = (parsed.domainWithoutSuffix || '') === key;
          push(generic && sameAscii && !riskyContext ? 'warn' : 'danger', sameAscii ? 'same-name-other-tld' : 'homograph', key);
          continue;
        }
        // 2) La marca aparece como palabra dentro del dominio (paypal-seguridad.com).
        if (tokens.length > 1 && tokens.map(flat).includes(sk)) {
          push(generic && !riskyContext ? 'warn' : 'danger', 'brand-token', key);
          continue;
        }
        // 3) La marca aparece pegada a otras palabras (paypalseguro.com).
        if (!generic && sk.length >= 5 && labelFlat.includes(sk)) {
          push(riskyContext ? 'danger' : 'warn', 'brand-substring', key);
          continue;
        }
        // 4) Typosquatting: a 1–2 letras de distancia (paypall, santnader).
        if (sk.length >= 5) {
          const max = sk.length >= 9 ? 2 : 1;
          const candidates = [labelFlat, ...tokens.map(flat)];
          if (candidates.some((c) => c.length >= 4 && levenshtein(c, sk, max) <= max)) {
            push(!generic && sk.length >= 6 ? 'danger' : 'warn', 'typo', key);
            continue;
          }
        }
        // 5) La marca o su dominio oficial en el SUBDOMINIO (paypal.com.verificacion-cuenta.xyz).
        if (sub) {
          const officialInSub = [...t.domains].some((d) => (sub + '.').includes(d + '.'));
          if (officialInSub) { push('danger', 'brand-in-subdomain', key); continue; }
          if (!generic && subTokens.map(flat).includes(sk)) push(riskyContext ? 'danger' : 'warn', 'brand-in-subdomain', key);
        }
      }
      if (best) findings.push(best);
    }
    findings.sort((a, b) => (a.level === b.level ? 0 : a.level === 'danger' ? -1 : 1));
    return findings;
  }

  PG.lookalike = { skeleton, levenshtein, mixedScript, buildTargets, officialBrand, detect, hasPhishingWord };
})(typeof globalThis !== 'undefined' ? globalThis : this);
