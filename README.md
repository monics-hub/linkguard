# LinkGuard — aviso anti‑phishing para tu correo web

Extensión para **Chrome** y **Firefox** (escritorio y Firefox para Android). Cuando haces clic en un enlace dentro de Gmail u Outlook, **detiene la navegación al instante** y muestra una ventana con el **dominio real** en grande, alertas calculadas localmente y tres decisiones: **NO**, **SÍ** o **Analizar con URLScan**.

```
┌──────────────────────────────────────────────────────┐
│ ⛨ ¡PELIGRO! ESTE ENLACE PARECE FRAUDULENTO            │
├──────────────────────────────────────────────────────┤
│ DOMINIO REAL DE DESTINO                              │
│ verificacion-cuenta.xyz            ← grande, negrita │
│ www.paypal.com.verificacion-cuenta.xyz               │
│ https://www.paypal.com.verificacion-cuenta.xyz/login │
│ ⛔ ¡Finge ser PayPal!                                 │
│ ⛔ ¡El texto del enlace miente sobre el destino!      │
│ ▸ Más detalles (3)                                   │
│ ¿Deseas continuar a verificacion-cuenta.xyz?         │
│ Confiar en este dominio y no volver a avisar         │
├──────────────────────────────────────────────────────┤
│ [Analizar con URLScan]              [ SÍ ]  [ NO ]   │
│ ⚠ puede exponer públicamente la URL                  │
└──────────────────────────────────────────────────────┘
```

## Qué hace

**Dominio real, no la URL decorada**
- Calcula el **dominio registrable** con la [Public Suffix List](https://publicsuffix.org) (copia oficial incluida, 10 336 reglas, incluye `github.io`, `web.app`, `gob.mx`, `co.uk`…). Si instalas [`tldts`](https://github.com/remusao/tldts) se usa automáticamente (ver más abajo).
- Lo muestra **grande y en negrita**; debajo, el host completo (con la parte registrable resaltada) y la URL completa en letra menor.
- Dominios con caracteres de otros alfabetos se muestran en **punycode**: `аpple.com` (con «а» cirílica) → **`xn--pple-43d.com`**, indicando además cómo se vería.
- Quita las redirecciones que añaden los portales (Google `/url?q=`, **Outlook Safe Links**, Proofpoint, Barracuda…) para enseñarte el destino real, pero **abre el enlace original** para no perder la protección del proveedor.

**Comprobaciones locales instantáneas (sin red, ~1 ms)**

| Comprobación | Nivel |
|---|---|
| El texto visible es un dominio distinto del destino («banco.com» → otro sitio) | 🔴 Peligro |
| Dominio que imita una marca conocida o **tus dominios de confianza** (homógrafos, `paypa1`, `rnicrosoft`, `paypal-seguridad.com`, `paypal.xyz`, `paypal.com.otro.xyz`, typosquatting) | 🔴 Peligro |
| Dominio que mezcla alfabetos / `usuario@` engañoso en la URL / enlaces `data:` | 🔴 Peligro |
| Dirección IP en lugar de dominio (también IP en decimal: `http://3232235777`) | 🟠 Precaución |
| Acortadores (bit.ly, tinyurl, t.co, cutt.ly…; 50 servicios) → sugiere urlscan | 🟠 Precaución |
| Punycode sin mezcla, `http` sin cifrar, puerto raro, texto≠destino vía rastreador de marketing | 🟠 Precaución |
| TLD baratos muy usados en fraudes, demasiados subdominios, palabras «login/verificar/cuenta», servicios donde cualquiera publica (Google Forms, SharePoint, GitHub Pages…) | ℹ️ Informativo |

La lista de marcas (`src/common/data/defaults.js`) incluye ~50 objetivos habituales en el mundo hispanohablante: PayPal, Apple, Microsoft, Google, Amazon, Meta, bancos (Santander, BBVA, Banamex, Banorte, CaixaBank, Sabadell, Bancolombia, BancoEstado…), mensajerías (DHL, FedEx, Correos, Estafeta), administraciones (SAT, Agencia Tributaria, DGT, ARCA/AFIP, SII, DIAN), etc.

**Intensidad variable**
- 🔴 **Peligro**: fondo rojo, borde rojo, el botón **SÍ queda bloqueado 2 s** (configurable) para evitar el clic reflejo; clic fuera de la ventana no la cierra.
- 🟠 **Precaución**: cabecera ámbar.
- 🔵 **Neutral**: «Vas a salir de tu correo».
- 🟢 **Conocido**: ventana pequeña y discreta en la esquina (o sin aviso, si así lo eliges).

**Contra la fatiga de avisos**
- Solo actúa en tu **lista de vigilancia** (por defecto `mail.google.com`, `outlook.live.com`, `outlook.office.com`, `outlook.office365.com`, `outlook.cloud.microsoft`) **y en las pestañas abiertas desde ella**, detectadas por pestaña de origen y, como respaldo, por la cabecera **Referer**. Si en esa pestaña escribes otra dirección en la barra, deja de vigilarse. Google, YouTube, etc. abiertos por tu cuenta no muestran nada.
- Los enlaces internos del portal (bandeja, carpetas, cuenta, cerrar sesión) **no avisan**. En las webs abiertas desde el correo, los enlaces dentro del mismo sitio tampoco.
- Botón **«Confiar en este dominio»**: lo añade a la lista blanca y abre el enlace. Si el dominio tiene alertas de peligro pide confirmación. No se ofrece para acortadores ni servicios de contenido de terceros.
- Fuera de la lista de vigilancia, la extensión solo carga un pequeño script que pregunta si debe actuar; el analizador y la PSL se inyectan **únicamente** en las pestañas vigiladas.

**urlscan.io (opcional)**
- Sin API key: el botón ofrece **buscar análisis previos del dominio** (solo se envía el nombre de dominio como búsqueda) o configurar la clave.
- Con API key (el plan gratuito sirve): envía la URL, muestra el **destino final tras las redirecciones** (ideal para acortadores), veredicto, IP, país, antigüedad del dominio, marcas imitadas y captura de pantalla, y vuelve a pasar las comprobaciones locales sobre el destino final.
- Siempre muestra una **advertencia de exposición** adaptada a la visibilidad elegida (pública en rojo; no listada por defecto; privada). Casilla para **quitar los parámetros `?…`** antes de enviar (suelen llevar tu correo).
- La API key vive solo en el background; nunca llega a las páginas web.

## Estructura: código común + adaptadores

```
src/
├── common/                      ← IDÉNTICO en Chrome y Firefox
│   ├── data/
│   │   ├── defaults.js          configuración, marcas, acortadores, redirectores, TLD
│   │   └── psl-data.js          Public Suffix List (generado por tools/gen-psl.mjs)
│   ├── core/                    lógica pura, sin APIs del navegador (probada en Node)
│   │   ├── punycode.js          decodificador RFC 3492
│   │   ├── domain.js            dominio registrable (PSL propia o tldts)
│   │   ├── lookalike.js         homógrafos, typosquatting, marca en subdominio…
│   │   ├── analyzer.js          analyze() y decide()
│   │   └── settings.js          configuración (solo usa PG.platform)
│   ├── background/
│   │   ├── background-core.js   pestañas vigiladas, inyección, apertura, mensajes
│   │   └── urlscan.js           cliente de la API de urlscan.io
│   ├── content/
│   │   ├── bootstrap.js         script mínimo en todas las páginas
│   │   └── content.js           interceptor de clics (fase de captura)
│   ├── ui/                      ventana de aviso (Shadow DOM cerrado)
│   ├── options/                 página de configuración
│   └── popup/                   botón de la barra
├── chrome/                      ← ADAPTADOR CHROME
│   ├── platform.js              chrome.* → PG.platform (sendResponse, storage.session…)
│   ├── background.js            service worker: importScripts() de los módulos comunes
│   └── manifest.json            MV3 con service_worker, match_origin_as_fallback
├── firefox/                     ← ADAPTADOR FIREFOX
│   ├── platform.js              browser.* → PG.platform (promesas, openerTabId en Android,
│   │                            consentimiento de datos de Firefox 140+)
│   ├── background.js            event page (background.scripts)
│   └── manifest.json            MV3 con gecko / gecko_android y data_collection_permissions
└── icons/
```

Todo el código común habla con el navegador a través de **una sola interfaz**, `PG.platform` (storage, mensajería, pestañas, webNavigation, inyección, permisos). Cada `platform.js` la implementa para su navegador; añadir otro navegador (Edge, Safari…) solo requiere otro adaptador.

## Compilar

Requiere Node 18+ (sin dependencias obligatorias):

```bash
node build.mjs          # genera dist/chrome/, dist/firefox/ y sus .zip
npm test                # 12 pruebas: analizador + ambos adaptadores con APIs simuladas
```

**Usar tldts** (opcional): `npm install && node build.mjs` copia `tldts` a `vendor/` y el analizador lo usa automáticamente; si no está, usa la PSL integrada.

**Actualizar la Public Suffix List**: descarga `https://publicsuffix.org/list/public_suffix_list.dat` en `tools/` y ejecuta `npm run psl`.

## Instalar

**Chrome / Edge / Brave (escritorio)**
1. `chrome://extensions` → activa **Modo de desarrollador**.
2. **Cargar descomprimida** → elige `dist/chrome`.

**Firefox (escritorio)**
- Prueba rápida: `about:debugging#/runtime/this-firefox` → **Cargar complemento temporal** → `dist/firefox/manifest.json` (se quita al cerrar Firefox).
- Permanente: firma el zip gratis en [addons.mozilla.org](https://addons.mozilla.org/developers/) como **«En tu propio sitio» (unlisted)** y abre el `.xpi` firmado en Firefox.
- Si Firefox muestra el aviso «Falta un permiso» en la configuración, pulsa **Conceder acceso a los sitios**.

**Firefox para Android**
- El manifiesto ya declara `gecko_android`. Firma el paquete en AMO (unlisted o público) y, en Firefox Android: *Ajustes → Acerca de Firefox* → toca el logo 5 veces para activar el menú de depuración → *Ajustes → Instalar complemento desde archivo* → elige el `.xpi` firmado.
- La ventana se adapta al móvil (hoja inferior a pantalla completa, botones de 48 px, respeta la zona segura).

**Chrome para Android**: la app estándar de Chrome para teléfonos **sigue sin admitir extensiones** (Google prueba soporte solo en una versión «Desktop Android» para Chromebooks/PC). En Android usa Firefox, o un navegador derivado de Chromium que acepte extensiones de la Chrome Web Store con `dist/chrome`.

> ⚠ En el móvil solo protege el **correo abierto en el navegador** (mail.google.com, outlook.live.com…). Las apps nativas de Gmail y Outlook no admiten extensiones.

## Limitaciones conocidas

- No intercepta «Abrir en pestaña nueva» del menú contextual, ni arrastrar un enlace a la barra de pestañas, ni la pulsación larga → «Abrir en pestaña nueva» del móvil (las extensiones no pueden interceptarlos). El clic normal, el clic con Ctrl/Cmd/Mayús, el clic central y Enter sí.
- Los acortadores no se expanden localmente a propósito: hacerlo visitaría el enlace desde tu IP (y confirmaría al atacante que tu correo está activo). Para eso está urlscan.io.
- «Sin veredicto de malicia» en urlscan.io no garantiza que un sitio sea seguro.
- La detección de imitaciones usa una lista de marcas y tus dominios; añade en *Dominios propios a proteger* los que más te importen (tu banco, tu empresa).

## Privacidad

Todo el análisis es local. No hay telemetría. Lo único que sale de tu equipo es lo que tú envías explícitamente a urlscan.io con el botón «Enviar a urlscan.io y analizar» (o la búsqueda del nombre de dominio si no tienes API key).

## Licencias

Código: MIT. `psl-data.js` se genera a partir de la Public Suffix List (MPL‑2.0).
