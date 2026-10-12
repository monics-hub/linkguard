// Datos y configuración por defecto, comunes a Chrome y Firefox.
(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  PG.VERSION = '1.0.0';

  /** Configuración inicial. El usuario puede cambiarlo todo desde la página de opciones. */
  PG.DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    // Lista de vigilancia: la extensión SOLO actúa en estos sitios (y sus subdominios)…
    watchlist: [
      'mail.google.com',
      'outlook.live.com',
      'outlook.office.com',
      'outlook.office365.com',
      'outlook.cloud.microsoft',
    ],
    // …y en las pestañas que se abrieron desde ellos (detección por pestaña de origen y Referer).
    followFromWatched: true,
    // Hosts que forman parte de la interfaz del portal de correo: nunca muestran aviso.
    internalHosts: [
      'accounts.google.com',
      'myaccount.google.com',
      'support.google.com',
      'login.live.com',
      'login.microsoftonline.com',
      'account.microsoft.com',
      'support.microsoft.com',
    ],
    // Lista blanca (dominios de confianza): no se muestra aviso para ellos ni sus subdominios.
    whitelist: [],
    // Dominios propios que quieres proteger frente a imitaciones (tu banco, tu empresa…).
    protectedDomains: [],
    // Qué hacer con dominios oficiales conocidos (paypal.com, google.com…): 'discreet' | 'full' | 'skip'
    knownMode: 'discreet',
    // Segundos que el botón SÍ permanece bloqueado cuando el aviso es de PELIGRO (evita el clic reflejo).
    dangerDelaySeconds: 2,
    // urlscan.io (opcional)
    urlscanApiKey: '',
    urlscanVisibility: 'unlisted', // 'public' | 'unlisted' | 'private'
    urlscanStripQuery: true,
  });

  /** Acortadores de URL: el destino real queda oculto. */
  PG.SHORTENERS = new Set([
    'bit.ly', 'bitly.com', 'j.mp', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'v.gd',
    'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at', 'rb.gy', 't.ly', 'tiny.cc', 'bl.ink',
    's.id', 'lnkd.in', 'shorte.st', 'adf.ly', 'bit.do', 'qrco.de', 'short.gy', 'clck.ru',
    'u.to', 'x.co', 'trib.al', 'dlvr.it', 'ift.tt', 'fb.me', 'wp.me', 'amzn.to', 'surl.li',
    'urlz.fr', 'tny.im', 'shorturl.asia', 'snip.ly', 'linktr.ee', 'han.gl', 'me2.do', 'cli.re',
    'gg.gg', 'tr.ee', 'shor.by', 'urlr.me', '2no.co', 'zpr.io', '1drv.ms', 'forms.gle', 'we.tl',
  ]);

  /** Servicios de rastreo de clics de email marketing (el texto suele no coincidir con el destino). */
  PG.CLICK_TRACKERS = new Set([
    'list-manage.com', 'mailchi.mp', 'sendgrid.net', 'mandrillapp.com', 'mailgun.org',
    'hubspotlinks.com', 'hs-sites.com', 'exacttarget.com', 'exct.net', 'rs6.net', 'awstrack.me',
    'mlsend.com', 'sparkpostmail.com', 'mcsv.net', 'klclick.com', 'klclick1.com', 'klclick2.com',
    'createsend.com', 'cmail19.com', 'cmail20.com', 'pardot.com', 'sendibt3.com', 'sendibt2.com',
    'mailjet.com', 'customeriomail.com', 'emltrk.com', 'doubleclick.net', 'mktoweb.com',
    'salesforce-sites.com', 'acemlna.com', 'acemlnb.com', 'acemlnc.com', 'activehosted.com',
  ]);

  /**
   * Redirectores que los propios portales de correo añaden (Gmail, Safe Links de Outlook…).
   * Se "desenvuelven" para mostrar el destino real. Se abre el enlace original (no el
   * desenvuelto) para no saltarse la protección del proveedor (p. ej. Safe Links).
   */
  PG.REDIRECTORS = [
    { name: 'Google', host: /^(www\.)?google\.[a-z.]+$/, path: /^\/url$/, params: ['q', 'url'] },
    { name: 'Outlook Safe Links', host: /\.safelinks\.protection\.outlook\.com$/, params: ['url'] },
    { name: 'YouTube', host: /^(www\.)?youtube\.com$/, path: /^\/redirect$/, params: ['q'] },
    { name: 'Facebook', host: /^(l|lm)\.facebook\.com$/, path: /^\/l\.php$/, params: ['u'] },
    { name: 'Instagram', host: /^l\.instagram\.com$/, params: ['u'] },
    { name: 'Barracuda', host: /^linkprotect\.cudasvc\.com$/, params: ['a'] },
    { name: 'Proofpoint', host: /^urldefense\.proofpoint\.com$/, path: /^\/v2\/url$/, params: ['u'], decode: 'proofpoint2' },
    { name: 'Proofpoint', host: /^urldefense\.com$/, path: /^\/v3\/__/, decode: 'proofpoint3' },
  ];

  /** TLD baratos o muy usados en campañas de phishing (aviso informativo). */
  PG.SUSPICIOUS_TLDS = new Set([
    'zip', 'mov', 'xyz', 'top', 'click', 'link', 'gq', 'ml', 'cf', 'tk', 'ga', 'loan', 'men',
    'review', 'rest', 'cam', 'icu', 'buzz', 'sbs', 'cfd', 'quest', 'monster', 'bar', 'lol',
    'cyou', 'bond', 'beauty', 'hair', 'skin', 'makeup', 'mom', 'autos', 'boats', 'yachts', 'win',
  ]);

  /** TLD que coinciden con extensiones de archivo: en el texto del enlace no se tratan como dominio. */
  PG.FILE_LIKE_TLDS = new Set(['zip', 'mov', 'py', 'md', 'sh', 'rs', 'pl', 'ps', 'cs', 'js', 'so', 'ai', 'pk']);

  /** Palabras típicas de phishing (en dominios y rutas). */
  PG.PHISHING_WORDS = [
    'login', 'logon', 'signin', 'sign-in', 'verify', 'verif', 'secure', 'seguridad', 'seguro',
    'account', 'cuenta', 'update', 'actualiza', 'confirm', 'password', 'contrasena', 'clave',
    'banca', 'bancaonline', 'support', 'soporte', 'wallet', 'billing', 'factura', 'invoice',
    'pago', 'payment', 'unlock', 'desbloque', 'suspend', 'suspendid', 'recover', 'recupera',
    'auth', 'validate', 'valida', 'acceso', 'access', 'webscr', 'reembolso', 'refund',
  ];

  /**
   * Servicios donde cualquiera puede publicar contenido. Un enlace aquí NO es "oficial"
   * aunque el dominio sea de una gran empresa (Google Forms, SharePoint, GitHub Pages…).
   */
  PG.USER_CONTENT_HOSTS = [
    'sites.google.com', 'docs.google.com', 'drive.google.com', 'forms.gle', 'storage.googleapis.com',
    'firebasestorage.googleapis.com', 'web.app', 'firebaseapp.com', 'sharepoint.com', '1drv.ms',
    'onedrive.live.com', 'dropbox.com', 'dropboxusercontent.com', 'github.io', 'pages.dev',
    'workers.dev', 'netlify.app', 'vercel.app', 'wetransfer.com', 'we.tl', 'notion.site',
    'canva.site', 'wixsite.com', 'weebly.com', 'blogspot.com', 'glitch.me', 'ipfs.io', 'r2.dev',
    'azurewebsites.net', 'blob.core.windows.net', 'web.core.windows.net', 'herokuapp.com',
    'typeform.com', 'jotform.com', 's3.amazonaws.com', 'amazonaws.com', 'forms.office.com',
    'forms.microsoft.com', 'sway.office.com', 'linktr.ee', 'webflow.io', 'framer.app', 'replit.app',
  ];

  /**
   * Marcas conocidas para detectar imitaciones.
   *  - keys: nombres que un atacante copiaría en el dominio.
   *  - domains: dominios registrables oficiales.
   *  - ccTld: también es oficial <nombre>.<ccTLD> (amazon.es, google.com.mx…).
   *  - generic: el nombre es una palabra común; la coincidencia exacta solo es "peligro"
   *    si va acompañada de palabras de phishing o TLD sospechoso.
   */
  PG.BRANDS = [
    { name: 'PayPal', keys: ['paypal'], domains: ['paypal.com', 'paypal.me', 'paypalobjects.com', 'paypal-community.com'] },
    { name: 'Apple', keys: ['apple', 'icloud', 'itunes', 'appleid'], generic: ['apple'], domains: ['apple.com', 'icloud.com', 'me.com', 'itunes.com', 'mzstatic.com', 'apple.news', 'icloud-content.com'] },
    { name: 'Microsoft', keys: ['microsoft', 'outlook', 'hotmail', 'onedrive', 'sharepoint', 'office365', 'microsoftonline', 'msftonline'], generic: ['outlook'], domains: ['microsoft.com', 'microsoftonline.com', 'live.com', 'outlook.com', 'office.com', 'office365.com', 'hotmail.com', 'onedrive.com', 'sharepoint.com', 'azure.com', 'windows.net', 'msn.com', 'bing.com', 'skype.com', 'xbox.com', 'cloud.microsoft', 'microsoft365.com', 'msauth.net', 'msftauth.net', 'office.net', 'windows.com', 'microsoftedge.com', 'microsoftstore.com', 'aka.ms'] },
    { name: 'Google', keys: ['google', 'gmail', 'youtube'], ccTld: true, domains: ['google.com', 'gmail.com', 'youtube.com', 'youtu.be', 'gstatic.com', 'googleusercontent.com', 'googleapis.com', 'goo.gl', 'g.co', 'withgoogle.com', 'google.dev', 'forms.gle', 'googlemail.com'] },
    { name: 'Amazon', keys: ['amazon', 'primevideo'], ccTld: true, domains: ['amazon.com', 'amazonaws.com', 'a.co', 'amzn.to', 'primevideo.com', 'audible.com', 'aboutamazon.com', 'amazon.science'] },
    { name: 'Meta / Facebook', keys: ['facebook', 'instagram', 'whatsapp', 'messenger', 'meta'], generic: ['meta', 'messenger'], domains: ['facebook.com', 'fb.com', 'fb.me', 'facebookmail.com', 'instagram.com', 'whatsapp.com', 'whatsapp.net', 'wa.me', 'meta.com', 'messenger.com', 'metamail.com', 'fbcdn.net'] },
    { name: 'Netflix', keys: ['netflix'], domains: ['netflix.com', 'nflxso.net', 'nflxext.com'] },
    { name: 'LinkedIn', keys: ['linkedin'], domains: ['linkedin.com', 'lnkd.in', 'licdn.com'] },
    { name: 'X / Twitter', keys: ['twitter'], domains: ['twitter.com', 'x.com', 't.co'] },
    { name: 'Dropbox', keys: ['dropbox'], domains: ['dropbox.com', 'dropboxusercontent.com', 'db.tt'] },
    { name: 'DocuSign', keys: ['docusign'], domains: ['docusign.com', 'docusign.net'] },
    { name: 'Adobe', keys: ['adobe', 'acrobat'], domains: ['adobe.com', 'adobelogin.com', 'acrobat.com', 'echosign.com', 'adobesign.com'] },
    { name: 'WeTransfer', keys: ['wetransfer'], domains: ['wetransfer.com', 'we.tl'] },
    { name: 'Spotify', keys: ['spotify'], domains: ['spotify.com', 'spoti.fi', 'scdn.co'] },
    { name: 'Steam', keys: ['steampowered', 'steamcommunity', 'steam'], generic: ['steam'], domains: ['steampowered.com', 'steamcommunity.com', 'steamstatic.com'] },
    { name: 'DHL', keys: ['dhl'], ccTld: true, domains: ['dhl.com'] },
    { name: 'FedEx', keys: ['fedex'], ccTld: true, domains: ['fedex.com'] },
    { name: 'UPS', keys: ['ups'], generic: ['ups'], domains: ['ups.com'] },
    { name: 'USPS', keys: ['usps'], domains: ['usps.com', 'usps.gov'] },
    { name: 'Correos', keys: ['correos', 'correosdemexico'], generic: ['correos'], domains: ['correos.es', 'correos.com', 'correosdemexico.gob.mx', 'correos.cl'] },
    { name: 'Estafeta', keys: ['estafeta'], domains: ['estafeta.com'] },
    { name: 'Mercado Libre', keys: ['mercadolibre', 'mercadolivre'], ccTld: true, domains: ['mercadolibre.com', 'mercadolivre.com.br', 'mlstatic.com'] },
    { name: 'Mercado Pago', keys: ['mercadopago'], ccTld: true, domains: ['mercadopago.com'] },
    { name: 'Santander', keys: ['santander', 'bancosantander'], ccTld: true, domains: ['santander.com', 'bancosantander.es', 'santander.com.mx', 'santander.co.uk', 'openbank.es'] },
    { name: 'BBVA', keys: ['bbva'], ccTld: true, domains: ['bbva.com', 'bbva.es', 'bbva.mx', 'bbva.com.co', 'bbva.pe', 'bbva.com.ar'] },
    { name: 'Citibanamex', keys: ['banamex', 'citibanamex'], domains: ['banamex.com', 'citibanamex.com'] },
    { name: 'Banorte', keys: ['banorte'], domains: ['banorte.com'] },
    { name: 'HSBC', keys: ['hsbc'], ccTld: true, domains: ['hsbc.com', 'hsbc.com.mx', 'hsbc.co.uk'] },
    { name: 'CaixaBank', keys: ['caixabank', 'lacaixa'], domains: ['caixabank.es', 'caixabank.com', 'lacaixa.es'] },
    { name: 'Banco Sabadell', keys: ['bancsabadell', 'bancosabadell', 'sabadell'], domains: ['bancsabadell.com', 'bancosabadell.com', 'sabadell.com'] },
    { name: 'ING', keys: ['ing'], generic: ['ing'], ccTld: true, domains: ['ing.com', 'ing.es'] },
    { name: 'Scotiabank', keys: ['scotiabank'], ccTld: true, domains: ['scotiabank.com', 'scotiabank.com.mx', 'scotiabank.cl', 'scotiabankchile.cl'] },
    { name: 'BancoEstado', keys: ['bancoestado'], domains: ['bancoestado.cl'] },
    { name: 'Bancolombia', keys: ['bancolombia'], domains: ['bancolombia.com', 'grupobancolombia.com'] },
    { name: 'Itaú', keys: ['itau'], ccTld: true, domains: ['itau.com.br', 'itau.cl', 'itau.com.uy', 'itau.com'] },
    { name: 'SAT (México)', keys: ['sat'], generic: ['sat'], domains: ['sat.gob.mx'] },
    { name: 'Agencia Tributaria', keys: ['agenciatributaria', 'aeat'], domains: ['agenciatributaria.gob.es', 'agenciatributaria.es'] },
    { name: 'DGT', keys: ['dgt'], generic: ['dgt'], domains: ['dgt.es'] },
    { name: 'Seguridad Social', keys: ['segsocial', 'seg-social'], domains: ['seg-social.es', 'seg-social.gob.es'] },
    { name: 'ARCA / AFIP', keys: ['afip', 'arca'], generic: ['arca'], domains: ['afip.gob.ar', 'arca.gob.ar'] },
    { name: 'SII Chile', keys: ['sii'], generic: ['sii'], domains: ['sii.cl'] },
    { name: 'DIAN', keys: ['dian'], generic: ['dian'], domains: ['dian.gov.co'] },
    { name: 'Coinbase', keys: ['coinbase'], domains: ['coinbase.com'] },
    { name: 'Binance', keys: ['binance'], domains: ['binance.com'] },
    { name: 'MetaMask', keys: ['metamask'], domains: ['metamask.io'] },
    { name: 'Booking.com', keys: ['booking'], generic: ['booking'], domains: ['booking.com', 'bstatic.com'] },
    { name: 'Airbnb', keys: ['airbnb'], ccTld: true, domains: ['airbnb.com'] },
    { name: 'Yahoo', keys: ['yahoo'], ccTld: true, domains: ['yahoo.com', 'yimg.com'] },
    { name: 'eBay', keys: ['ebay'], ccTld: true, domains: ['ebay.com'] },
    { name: 'Zoom', keys: ['zoom'], generic: ['zoom'], domains: ['zoom.us', 'zoom.com'] },
  ];
})(typeof globalThis !== 'undefined' ? globalThis : this);
