// Decodificador Punycode (RFC 3492) mínimo: xn--pple-43d → аpple (con "а" cirílica).
// Los navegadores ya convierten los hostnames a punycode al parsear una URL; este módulo
// hace el camino inverso para poder mostrar al usuario CÓMO se vería el dominio engañoso.
(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  const BASE = 36, TMIN = 1, TMAX = 26, SKEW = 38, DAMP = 700, INITIAL_BIAS = 72, INITIAL_N = 128;

  function adapt(delta, numPoints, firstTime) {
    let k = 0;
    delta = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
    delta += Math.floor(delta / numPoints);
    for (; delta > ((BASE - TMIN) * TMAX) >> 1; k += BASE) delta = Math.floor(delta / (BASE - TMIN));
    return Math.floor(k + ((BASE - TMIN + 1) * delta) / (delta + SKEW));
  }

  function basicToDigit(cp) {
    if (cp >= 0x30 && cp < 0x3a) return 26 + (cp - 0x30);
    if (cp >= 0x41 && cp < 0x5b) return cp - 0x41;
    if (cp >= 0x61 && cp < 0x7b) return cp - 0x61;
    return BASE;
  }

  /** Decodifica UNA etiqueta sin el prefijo "xn--". Lanza error si es inválida. */
  function decodeLabel(input) {
    const output = [];
    let basic = input.lastIndexOf('-');
    if (basic < 0) basic = 0;
    for (let j = 0; j < basic; ++j) {
      if (input.charCodeAt(j) >= 0x80) throw new Error('punycode: carácter no básico');
      output.push(input.charCodeAt(j));
    }
    let i = 0, n = INITIAL_N, bias = INITIAL_BIAS;
    for (let index = basic > 0 ? basic + 1 : 0; index < input.length;) {
      const oldi = i;
      for (let w = 1, k = BASE; ; k += BASE) {
        if (index >= input.length) throw new Error('punycode: entrada truncada');
        const digit = basicToDigit(input.charCodeAt(index++));
        if (digit >= BASE) throw new Error('punycode: dígito inválido');
        i += digit * w;
        const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
        if (digit < t) break;
        w *= BASE - t;
      }
      const out = output.length + 1;
      bias = adapt(i - oldi, out, oldi === 0);
      n += Math.floor(i / out);
      i %= out;
      output.splice(i++, 0, n);
    }
    return String.fromCodePoint(...output);
  }

  /** Convierte un hostname ASCII (con etiquetas xn--) a su forma Unicode visible. */
  function toUnicode(hostname) {
    return String(hostname || '')
      .split('.')
      .map((label) => {
        if (!/^xn--/i.test(label)) return label;
        try { return decodeLabel(label.slice(4).toLowerCase()); } catch (_) { return label; }
      })
      .join('.');
  }

  PG.punycode = { toUnicode, decodeLabel };
})(typeof globalThis !== 'undefined' ? globalThis : this);
