// Estilos de la ventana de aviso. Viven dentro de un Shadow DOM cerrado: la página (Gmail,
// Outlook…) no puede alterarlos ni leer su contenido, y nuestros estilos no rompen la página.
(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  PG.UI_CSS = String.raw`
:host { all: initial; }
* { box-sizing: border-box; }

.backdrop {
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  padding: 16px; background: rgba(15, 23, 42, .48);
  font: 15px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: var(--ink); -webkit-font-smoothing: antialiased;
  animation: fade .12s ease-out;
  --ink: #101828; --muted: #475467; --faint: #667085; --line: #e4e7ec; --paper: #ffffff;
  --soft: #f2f4f7; --mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;
  --red: #b42318; --red-soft: #fef3f2; --red-line: #fda29b;
  --amber: #b54708; --amber-soft: #fffaeb; --amber-line: #fec84b;
  --blue: #1d3f6e; --blue-soft: #eff4fb;
  --green: #067647; --green-soft: #ecfdf3; --green-line: #abefc6;
}
.backdrop[data-level="danger"] { background: rgba(68, 6, 6, .62); }
.backdrop[data-discreet] { background: rgba(15, 23, 42, .14); align-items: flex-end; justify-content: flex-end; }
@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes pop { from { transform: translateY(8px) scale(.985); opacity: 0 } to { transform: none; opacity: 1 } }

.card {
  width: min(600px, 100%); max-height: calc(100vh - 32px); max-height: calc(100dvh - 32px);
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--paper); border-radius: 18px;
  box-shadow: 0 24px 64px rgba(0,0,0,.32), 0 2px 6px rgba(0,0,0,.12);
  animation: pop .16s ease-out; outline: none;
}
.backdrop[data-level="danger"] .card { border: 3px solid var(--red); }
.backdrop[data-discreet] .card { width: min(460px, 100%); }

/* ---------- cabecera */
.head { display: flex; gap: 12px; align-items: center; padding: 14px 20px; color: #fff; background: var(--blue); }
.backdrop[data-level="danger"] .head { background: var(--red); padding: 18px 20px; }
.backdrop[data-level="warn"] .head { background: var(--amber); }
.backdrop[data-level="known"] .head { background: var(--green-soft); color: var(--green); border-bottom: 1px solid var(--green-line); }
.head svg { flex: none; width: 28px; height: 28px; }
.backdrop[data-level="danger"] .head svg { width: 34px; height: 34px; }
.head h2 { margin: 0; font-size: 17px; line-height: 1.25; font-weight: 750; letter-spacing: -.005em; }
.backdrop[data-level="danger"] .head h2 { font-size: 20px; text-transform: uppercase; letter-spacing: .01em; }
.head p { margin: 2px 0 0; font-size: 12.5px; opacity: .88; }

/* ---------- cuerpo */
.body { padding: 18px 20px 6px; overflow-y: auto; overscroll-behavior: contain; }
.eyebrow { font-size: 11.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--faint); margin: 0 0 4px; }
.domain {
  margin: 0; font-size: clamp(24px, 6vw, 34px); line-height: 1.12; font-weight: 800; letter-spacing: -.015em;
  word-break: break-all; color: var(--ink);
}
.backdrop[data-level="danger"] .domain { color: var(--red); font-size: clamp(26px, 7vw, 38px); }
.backdrop[data-discreet] .domain { font-size: 24px; }
.idn { margin: 6px 0 0; font-size: 13.5px; color: var(--muted); }
.idn b { font-weight: 700; color: var(--ink); font-family: var(--mono); }
.hostline { margin: 10px 0 0; font-family: var(--mono); font-size: 13px; color: var(--faint); word-break: break-all; }
.hostline mark { background: none; color: var(--ink); font-weight: 800; }
.urlbox {
  margin: 8px 0 0; padding: 8px 10px; border-radius: 8px; background: var(--soft);
  font-family: var(--mono); font-size: 12px; line-height: 1.5; color: var(--muted);
  word-break: break-all; max-height: 5.2em; overflow-y: auto; user-select: all;
}

.alerts { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 8px; }
.alert { display: grid; grid-template-columns: 20px 1fr; gap: 10px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--soft); }
.alert svg { width: 20px; height: 20px; margin-top: 1px; }
.alert b { display: block; font-size: 14px; line-height: 1.3; }
.alert span { display: block; font-size: 13px; color: var(--muted); margin-top: 2px; }
.alert[data-level="danger"] { background: var(--red-soft); border-color: var(--red-line); color: var(--red); }
.alert[data-level="danger"] b { font-size: 15px; }
.alert[data-level="warn"] { background: var(--amber-soft); border-color: var(--amber-line); color: var(--amber); }
.alert[data-level="ok"] { background: var(--green-soft); border-color: var(--green-line); color: var(--green); }
.alert[data-level="info"] { color: var(--blue); }

.more { margin: 10px 0 0; }
.more summary { cursor: pointer; font-size: 13px; font-weight: 650; color: var(--muted); padding: 2px 0; }
.more .alerts { margin-top: 8px; }
.alert[data-level="info"] b { font-size: 13.5px; }
.question { margin: 16px 0 4px; font-size: 16.5px; font-weight: 650; }
.trust { margin: 6px 0 2px; }
.linkbtn {
  appearance: none; border: 0; background: none; padding: 4px 0; font: inherit; font-size: 13.5px;
  color: var(--blue); text-decoration: underline; text-underline-offset: 3px; cursor: pointer;
}
.linkbtn[data-armed] { color: var(--red); font-weight: 700; }

/* ---------- panel urlscan */
.scan { margin: 12px 0 4px; padding: 12px 14px; border-radius: 12px; border: 1px dashed #98a2b3; background: #fcfcfd; font-size: 13.5px; }
.scan[hidden] { display: none; }
.scan h3 { margin: 0 0 6px; font-size: 14px; }
.scan p { margin: 6px 0; color: var(--muted); }
.scan .exposure { color: var(--amber); background: var(--amber-soft); border: 1px solid var(--amber-line); border-radius: 8px; padding: 8px 10px; }
.scan .exposure[data-public] { color: var(--red); background: var(--red-soft); border-color: var(--red-line); font-weight: 650; }
.scan label { display: flex; gap: 8px; align-items: flex-start; margin: 8px 0; color: var(--ink); cursor: pointer; }
.scan code { font-family: var(--mono); font-size: 12px; word-break: break-all; color: var(--ink); }
.scan .row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.verdict { display: inline-block; padding: 3px 10px; border-radius: 999px; font-weight: 750; font-size: 13px; }
.verdict[data-bad] { background: var(--red); color: #fff; }
.verdict:not([data-bad]) { background: var(--green-soft); color: var(--green); border: 1px solid var(--green-line); }
.final { margin: 8px 0 2px; font-size: 22px; font-weight: 800; word-break: break-all; }
.final[data-level="danger"] { color: var(--red); }
.facts { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 8px 0; font-size: 12.5px; color: var(--muted); }
.facts dt { font-weight: 650; color: var(--ink); }
.facts dd { margin: 0; word-break: break-all; }
.shot { display: block; width: 100%; margin-top: 8px; border-radius: 8px; border: 1px solid var(--line); }
.spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #d0d5dd; border-top-color: var(--blue); border-radius: 50%; animation: spin .8s linear infinite; vertical-align: -2px; margin-right: 6px; }
@keyframes spin { to { transform: rotate(360deg) } }
.error { color: var(--red); font-weight: 600; }

/* ---------- pie con los botones */
.foot {
  display: flex; align-items: flex-end; justify-content: space-between; gap: 12px;
  padding: 12px 20px 16px; border-top: 1px solid var(--line); background: var(--paper);
}
.scanwrap { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.scanwrap small { font-size: 11.5px; line-height: 1.3; color: var(--amber); max-width: 230px; }
.decide { display: flex; gap: 10px; margin-left: auto; }
button.btn {
  appearance: none; font: inherit; font-weight: 750; font-size: 15px; letter-spacing: .02em;
  min-height: 44px; padding: 0 20px; border-radius: 10px; cursor: pointer;
  border: 1.5px solid transparent; transition: filter .1s, transform .05s;
}
button.btn:active { transform: translateY(1px); }
button.btn:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
button.btn[disabled] { opacity: .5; cursor: not-allowed; }
.btn.yes { background: #fff; color: var(--ink); border-color: #98a2b3; min-width: 84px; }
.btn.no { background: var(--blue); color: #fff; min-width: 96px; }
.btn.scanbtn { background: #fff; color: var(--blue); border-color: var(--blue); font-size: 14px; font-weight: 700; padding: 0 14px; }
.btn.small { min-height: 36px; font-size: 13.5px; padding: 0 12px; }
.btn.primary { background: var(--blue); color: #fff; }
.backdrop[data-level="danger"] .btn.no { background: var(--green); font-size: 16px; }
.backdrop[data-level="danger"] .btn.yes { color: var(--red); border-color: var(--red-line); }
.backdrop[data-level="known"] .btn.no { background: #344054; }
.btn:hover:not([disabled]) { filter: brightness(.94); }
.meta { padding: 0 20px 10px; font-size: 11px; color: #98a2b3; background: var(--paper); text-align: right; }

/* ---------- móvil */
@media (max-width: 520px) {
  .backdrop { padding: 0; align-items: flex-end; }
  .card { width: 100%; max-height: 92vh; max-height: 92dvh; border-radius: 18px 18px 0 0; }
  .backdrop[data-level="danger"] .card { border-width: 3px 0 0; }
  .head { padding: 12px 16px; }
  .body { padding: 14px 16px 4px; }
  .foot { flex-wrap: wrap; padding: 10px 16px calc(14px + env(safe-area-inset-bottom)); }
  .scanwrap { flex: 1 1 100%; flex-direction: row; align-items: center; gap: 10px; }
  .scanwrap small { max-width: none; }
  .decide { flex: 1 1 100%; }
  .decide .btn { flex: 1; min-height: 48px; }
}

/* ---------- modo oscuro */
@media (prefers-color-scheme: dark) {
  .backdrop { --ink: #f2f4f7; --muted: #c0c6d0; --faint: #98a2b3; --line: #344054; --paper: #161b26; --soft: #1f2633;
    --red-soft: #3b1210; --amber-soft: #3a2709; --green-soft: #0b2e1f; --blue-soft: #15233a; --blue: #2e5a9a; }
  .backdrop[data-level="danger"] .domain, .alert[data-level="danger"], .final[data-level="danger"] { color: #ff8a80; }
  .alert[data-level="warn"], .scanwrap small, .scan .exposure { color: #fdb022; }
  .alert[data-level="ok"], .backdrop[data-level="known"] .head { color: #47cd89; }
  .alert[data-level="info"], .linkbtn { color: #84adff; }
  .more summary { color: var(--muted); }
  .scan { background: #1a2130; }
  .btn.yes, .btn.scanbtn { background: transparent; color: var(--ink); }
  .btn.scanbtn { color: #84adff; border-color: #84adff; }
}
`;
})(typeof globalThis !== 'undefined' ? globalThis : this);
