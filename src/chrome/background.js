// ENTRADA DEL BACKGROUND EN CHROME (Manifest V3 → service worker).
// Chrome carga un único script; los módulos comunes se importan con importScripts().
// Las rutas son relativas a este archivo (platform/background.js dentro del paquete).
importScripts(
  'platform.js',
  '../common/data/build-info.js',
  '../common/data/defaults.js',
  '../common/core/domain.js',
  '../common/core/settings.js',
  '../common/background/urlscan.js',
  '../common/background/background-core.js'
);

// Los listeners deben registrarse de forma síncrona al arrancar el service worker.
PG.backgroundCore.start();
