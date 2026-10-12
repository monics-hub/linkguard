// Ventana del botón de la barra: estado de la pestaña actual y accesos rápidos.
(async function () {
  'use strict';
  const PG = globalThis.PG;
  const $ = (id) => document.getElementById(id);
  let settings = await PG.settings.load();
  const [tab] = await PG.platform.tabs.query({ active: true, currentWindow: true });
  let host = '';
  try { host = new URL(tab.url).hostname; } catch (_) {}

  async function render() {
    $('enabled').checked = settings.enabled;
    $('host').textContent = host || '';
    let st = { active: false, mode: null };
    try { st = (await PG.platform.sendMessage({ type: 'PG_TAB_STATUS', tabId: tab.id })) || st; } catch (_) {}
    const s = $('status');
    s.toggleAttribute('data-on', !!st.active);
    s.textContent = !settings.enabled ? 'Protección desactivada'
      : st.mode === 'portal' ? '✓ Vigilando: portal de correo'
      : st.mode === 'derived' ? '✓ Vigilando: página abierta desde tu correo'
      : 'Inactiva en esta pestaña (no está en tu lista de vigilancia)';
    $('watch').hidden = !host || !/^https?:/.test(tab.url || '') || PG.domain.hostInList(host, settings.watchlist);
  }

  $('enabled').addEventListener('change', async (e) => { settings = await PG.settings.save({ enabled: e.target.checked }); render(); });
  $('watch').addEventListener('click', async () => {
    settings = await PG.settings.save({ watchlist: [...settings.watchlist, host] });
    $('status').textContent = '✓ Añadido. Recarga la página para activar la protección.';
    $('watch').hidden = true;
  });
  $('options').addEventListener('click', () => { PG.platform.openOptionsPage(); window.close(); });
  render();
})();
