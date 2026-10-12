// Script mínimo que se carga en todas las páginas (y marcos). No analiza nada: solo pregunta al
// background si esta pestaña está en la lista de vigilancia o viene del correo. Si es así, el
// background inyecta aquí los módulos de protección; si no, la página queda intacta.
(function (root) {
  'use strict';
  if (root.__linkGuardBoot) return;
  root.__linkGuardBoot = true;
  const PG = root.PG;
  if (!PG || !PG.platform) return;
  PG.platform.sendMessage({ type: 'PG_BOOT', referrer: document.referrer }).catch(() => {});
})(typeof globalThis !== 'undefined' ? globalThis : this);
