'use strict';

// 朱墨工作台：所有资源随插件分发，面板不加载外部字体、图标或脚本。
// 浅色「宣纸」/ 深色「夜墨」：墨色为主，朱色只用于批注（问题）、当前位置与焦点。
const fs = require('fs');
const path = require('path');

const ICONS = {
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h4"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  scan: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 12h10"/>',
  wrap: '<path d="M3 5h18M3 10h14a4 4 0 0 1 0 8h-5m3-3-3 3 3 3M3 15h4"/>',
  outdent: '<path d="M12 5h9M12 12h9M12 19h9M8 8l-4 4 4 4"/>',
  indent: '<path d="M12 5h9M12 12h9M12 19h9M4 8l4 4-4 4"/>',
  blank: '<path d="M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1"/>',
  spacer: '<path d="M3 4h18M3 20h18M12 8v8M8.5 12h7"/>',
  convert: '<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>',
  ellipsis: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  corner: '<path d="M10 4H5v9M14 20h5v-9"/>',
  narrow: '<path d="M4 6h16M6 12h12M9 18h6"/>',
  hash: '<path d="M10 4 8 20M16 4l-2 16M4.5 9h15M4 15h15"/>',
  listcheck: '<path d="M11 6h10M11 12h10M11 18h10M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
  batch: '<path d="M3 7V4h7l2 3h9v13H3z"/><path d="M8 13h8M8 16h5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  locate: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  folder: '<path d="M3 7V4h7l2 3h9v13H3z"/>',
  settings: '<path d="M3 6h4m4 0h10M3 12h10m4 0h4M3 18h4m4 0h10"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  history: '<path d="M4 5v5h5M4.5 15a8 8 0 1 0 .5-6.5M12 8v5l3 2"/>',
  log: '<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
  refresh: '<path d="M20 4v6h-6M4 20v-6h6M5.5 9a7 7 0 0 1 13-1M18.5 15a7 7 0 0 1-13 1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/>',
  link: '<path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9m-4 4 3 3"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
};

function icon(name, cls) {
  return '<svg class="icon' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICONS[name] || ICONS.file) + '</svg>';
}

const CSS = `
:root{
  color-scheme:dark;
  --bg:#181715;--card:#211f1c;--inset:#2a2824;--hover:#2e2b27;
  --ink:#ebe5d8;--ink-2:#aaa296;--ink-3:#877f74;
  --line:#33302b;--line-2:#48433c;
  --zhu:#e2745d;--zhu-soft:#3b2520;--zhu-line:#6b3a30;
  --ok:#8fc29f;--warn:#e2ab5f;
  --btn:#ebe5d8;--btn-ink:#1a1816;--btn-hover:#fffaf0;
  --shadow:0 1px 2px #0000004d;
  --radius:8px;
  --serif:"Songti SC","Noto Serif CJK SC","Source Han Serif SC","STSong",SimSun,serif;
}
body.vscode-light:not([data-theme="dark"]),body[data-theme="light"]{
  color-scheme:light;
  --bg:#f4f0e6;--card:#fbf9f3;--inset:#ebe5d7;--hover:#efe9dc;
  --ink:#2a2622;--ink-2:#6c6459;--ink-3:#837a6d;
  --line:#e2dbcc;--line-2:#cfc5b2;
  --zhu:#b03a28;--zhu-soft:#f5e3dc;--zhu-line:#e2b6a9;
  --ok:#3d7656;--warn:#a2641a;
  --btn:#2a2622;--btn-ink:#faf6ec;--btn-hover:#403a33;
  --shadow:0 1px 2px #5a4a2a14;
}
body.vscode-high-contrast:not([data-theme]),body.vscode-high-contrast-light:not([data-theme]){
  --bg:var(--vscode-editor-background);--card:var(--vscode-editor-background);--inset:var(--vscode-editor-background);--hover:var(--vscode-list-hoverBackground);
  --ink:var(--vscode-editor-foreground);--ink-2:var(--vscode-editor-foreground);--ink-3:var(--vscode-editor-foreground);
  --line:var(--vscode-contrastBorder);--line-2:var(--vscode-contrastBorder);
  --zhu:var(--vscode-focusBorder);--zhu-soft:var(--vscode-list-activeSelectionBackground);--zhu-line:var(--vscode-contrastBorder);
  --btn:var(--vscode-button-background);--btn-ink:var(--vscode-button-foreground);--btn-hover:var(--vscode-button-background);
  --shadow:none;
}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--vscode-font-family,system-ui),"Microsoft YaHei",sans-serif;font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased}
button,input,textarea{font:inherit;color:inherit}
button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:30px;border:0;border-radius:6px;padding:5px 9px;background:transparent;cursor:pointer;white-space:nowrap}
button:hover{background:var(--hover)}
button:disabled{opacity:.4;cursor:default}
button:disabled:hover{background:transparent}
:focus-visible{outline:2px solid var(--vscode-focusBorder,var(--zhu));outline-offset:1px}
[hidden]{display:none!important}
.icon{width:16px;height:16px;flex:none}
.muted{color:var(--ink-2)}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-thumb{background:var(--line-2);border-radius:10px;border:3px solid transparent;background-clip:content-box}::-webkit-scrollbar-track{background:transparent}

/* 框架：页眉 / 可滚动主体 / 任务栏 */
.app{height:100vh;display:flex;flex-direction:column;min-width:0}
.header{flex:none;display:flex;align-items:center;gap:8px;height:44px;padding:0 10px 0 6px;border-bottom:1px solid var(--line);background:var(--bg)}
.tabs{display:flex;align-self:stretch;gap:2px}
.tab{position:relative;align-self:stretch;min-height:0;padding:0 10px;border-radius:0;color:var(--ink-2);font-weight:500}
.tab:hover{background:transparent;color:var(--ink)}
.tab[aria-selected="true"]{color:var(--ink);font-weight:600}
.tab[aria-selected="true"]::after{content:"";position:absolute;left:10px;right:10px;bottom:-1px;height:2px;border-radius:2px;background:var(--zhu)}
.header-actions{display:flex;gap:2px;margin-left:auto}
.icon-btn{width:30px;min-width:30px;padding:0;color:var(--ink-2)}
.icon-btn:hover{color:var(--ink)}
#themeButton .icon{display:none}
body:not([data-theme]) #themeButton .i-auto,body[data-theme="light"] #themeButton .i-light,body[data-theme="dark"] #themeButton .i-dark{display:block}
.main{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column}
.page{width:100%;max-width:1120px;margin:0 auto;padding:14px 16px 16px}

/* 通用区块 */
.section{margin-top:18px}
.section-head{display:flex;align-items:center;gap:6px;min-height:28px;margin-bottom:8px}
.section-title{margin:0;font-size:11px;font-weight:600;letter-spacing:.12em;color:var(--ink-2)}
.section-title .count{margin-left:6px;letter-spacing:0;font-weight:400;color:var(--ink-3)}
.section-head .spacer{flex:1}
.ghost{min-height:26px;padding:3px 7px;font-size:12px;color:var(--ink-2)}
.ghost:hover{color:var(--ink)}
.ghost .icon{width:14px;height:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}
.primary{background:var(--btn);color:var(--btn-ink);border-radius:var(--radius);font-weight:600;min-height:36px;padding:8px 14px}
.primary:hover{background:var(--btn-hover)}
.primary:disabled:hover{background:var(--btn)}
.secondary{border:1px solid var(--line-2);border-radius:var(--radius);min-height:36px;padding:7px 12px;font-weight:500;background:var(--card)}
.secondary:hover{background:var(--hover)}
.full{width:100%}
.empty{color:var(--ink-3);padding:22px 10px;text-align:center;font-size:12px;white-space:normal}

/* 整理页 */
.page-organize{display:flex;flex-direction:column;flex:1 0 auto}
.org-side{flex:none}
.org-toc{flex:1 1 auto;display:flex;flex-direction:column;min-height:240px}
.docbar{display:flex;align-items:center;gap:8px;min-height:34px;padding:0 4px 0 2px;min-width:0}
.docbar>.icon{color:var(--ink-3)}
.file-name{flex:0 1 auto;min-width:0;justify-content:flex-start;gap:6px;padding:4px 6px;margin-left:-4px;font-weight:600;font-size:13px;text-align:left;white-space:normal;overflow-wrap:anywhere}
.file-name .icon{width:13px;height:13px;color:var(--ink-3);opacity:0;transition:opacity .15s}
.file-name:hover .icon,.file-name:focus-visible .icon{opacity:1}
.file-status{margin-left:auto;flex:none;display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--ink-3)}
.file-status.dirty{color:var(--warn)}
.file-status.dirty::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.checks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.check{position:relative;display:flex;flex-direction:column;gap:2px;padding:9px 6px 6px 11px;min-width:0;overflow:hidden}
.check::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:2px;border-radius:2px;background:var(--line-2)}
.check.warn::before{background:var(--zhu)}
.check.ok::before{background:var(--ok)}
.check-label{font-size:11px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.check-body{display:flex;align-items:center;gap:4px}
.check-count{flex:1;min-width:0;font-size:20px;font-weight:600;line-height:1.3;font-variant-numeric:tabular-nums;color:var(--ink-3)}
.check.warn .check-count{color:var(--zhu)}
.check.ok .check-count{color:var(--ok)}
.check.ok .check-count::after{content:" ✓";font-size:12px;font-weight:500}
.arrows{display:flex;flex:none}
.arrows button{width:24px;min-width:24px;min-height:26px;padding:0;color:var(--ink-2)}
.arrows .icon{width:15px;height:15px}
.silence-note{display:flex;align-items:center;gap:8px;margin:8px 0 0;padding:7px 10px;border-radius:var(--radius);background:var(--zhu-soft);color:var(--ink);font-size:12px}
.silence-note span{flex:1;min-width:0;white-space:normal}
.silence-note button{min-height:24px;padding:2px 8px;font-size:12px;font-weight:600;color:var(--zhu)}
.check-btn.emph{color:var(--zhu)}
.tools-box{margin-top:18px}
.tools-box>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:6px;min-height:28px;margin-bottom:6px;border-radius:6px}
.tools-box>summary::-webkit-details-marker{display:none}
.tools-box>summary .hint{margin-left:auto;font-size:11px;color:var(--ink-3)}
.tools-box>summary .chev{width:14px;height:14px;color:var(--ink-3);transition:transform .15s;transform:rotate(-90deg)}
.tools-box[open]>summary .chev{transform:none}
.tool-group+.tool-group{margin-top:10px}
.group-label{font-size:11px;color:var(--ink-3);margin:0 0 5px 2px}
.tools{display:grid;grid-template-columns:repeat(auto-fill,minmax(124px,1fr));gap:6px}
.tool{justify-content:flex-start;gap:8px;min-height:32px;padding:6px 9px;border:1px solid var(--line);border-radius:7px;background:var(--card);font-size:12px;text-align:left;white-space:normal;min-width:0}
.tool:hover{border-color:var(--line-2);background:var(--hover)}
.tool .icon{width:15px;height:15px;color:var(--ink-2)}
.tool:hover .icon{color:var(--zhu)}
.tool span{min-width:0;overflow-wrap:anywhere}
.search{display:flex;align-items:center;gap:7px;height:32px;padding:0 10px;margin-bottom:8px;border:1px solid var(--line);border-radius:7px;background:var(--card);color:var(--ink-3)}
.search:focus-within{border-color:var(--zhu-line)}
.search .icon{width:14px;height:14px}
.search input{flex:1;min-width:0;border:0;outline:0;background:transparent;font-size:12px;color:var(--ink)}
input::placeholder,textarea::placeholder{color:var(--ink-3);opacity:1}
.chapter-list{position:relative;flex:1 1 0;min-height:max(220px,55vh);overflow-y:auto;padding:4px}
.ch{position:relative;display:flex;align-items:baseline;justify-content:flex-start;gap:10px;width:100%;min-height:30px;padding:5px 9px;border-radius:5px;font-size:12px;font-weight:400;text-align:left;white-space:normal;min-width:0}
.ch .num{flex:none;min-width:26px;font-family:var(--vscode-editor-font-family,monospace);font-size:11px;color:var(--ink-3);font-variant-numeric:tabular-nums}
.ch .t{flex:1;min-width:0;overflow-wrap:anywhere}
.ch .ln{flex:none;font-size:11px;color:var(--ink-3);font-variant-numeric:tabular-nums}
.ch.current{background:var(--zhu-soft);color:var(--ink);font-weight:500}
.ch.current::before{content:"";position:absolute;left:0;top:6px;bottom:6px;width:2px;border-radius:2px;background:var(--zhu)}
.ch.current .num{color:var(--zhu)}
.ch.vol{position:sticky;top:-4px;z-index:1;margin-top:4px;border-radius:0;background:var(--card);color:var(--ink-2);font-weight:600;font-size:11px;letter-spacing:.06em;border-bottom:1px solid var(--line)}
.ch.vol:first-child{margin-top:0}
.ch.vol:hover{background:var(--hover)}
.ch.vol .num{display:none}
.ch.vol.current{color:var(--zhu)}

/* 抓取页 */
.page-scrape{max-width:680px}
.segmented{display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:3px;border-radius:9px;background:var(--inset);margin-bottom:16px}
.segmented button{min-height:30px;border-radius:7px;color:var(--ink-2);font-weight:500}
.segmented button:hover{background:transparent;color:var(--ink)}
.segmented button[aria-selected="true"]{background:var(--card);color:var(--ink);font-weight:600;box-shadow:var(--shadow)}
.status-line{display:flex;align-items:center;gap:8px;min-height:34px;padding:4px 4px 4px 12px;margin-bottom:14px;font-size:12px}
.status-line .text{flex:1;min-width:0;white-space:normal;color:var(--ink-2)}
.cookie{display:inline-flex;align-items:center;gap:7px;color:var(--ink-2)}
.cookie::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--ink-3);flex:none}
.cookie.ok{color:var(--ink)}.cookie.ok::before{background:var(--ok)}
.cookie.warn{color:var(--warn)}.cookie.warn::before{background:var(--warn)}
.input-label{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-weight:600;font-size:12px;margin-bottom:6px}
.link-input{display:block;width:100%;min-height:96px;resize:vertical;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:10px 11px;font-family:var(--vscode-editor-font-family,monospace);font-size:12px;line-height:1.7;overflow-wrap:anywhere;outline:0}
.link-input:focus{border-color:var(--zhu-line);box-shadow:0 0 0 3px var(--zhu-soft)}
.preview{min-height:18px;font-size:11px;color:var(--ink-3);margin:6px 2px 12px;overflow-wrap:anywhere}
.action-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:8px}
.quick{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:8px}
.quick button{flex-direction:column;gap:3px;min-height:52px;padding:7px 4px;border:1px solid var(--line);border-radius:var(--radius);background:var(--card);font-size:11px;color:var(--ink-2);white-space:normal;text-align:center}
.quick button:hover{color:var(--ink);border-color:var(--line-2);background:var(--hover)}
.quick .icon{width:17px;height:17px}
.series-list{overflow:hidden}
.srow{display:flex;align-items:center;gap:11px;padding:10px 12px;min-width:0}
.srow+.srow{border-top:1px solid var(--line)}
.srow .spine{display:grid;place-items:center;width:26px;height:34px;flex:none;border-radius:2px 5px 5px 2px;background:var(--zhu-soft);color:var(--zhu);font-family:var(--serif);font-size:14px;font-weight:700;box-shadow:inset 3px 0 0 var(--zhu-line)}
.srow .st{font-size:12px;font-weight:500;overflow-wrap:anywhere}
.srow .sm{font-size:11px;color:var(--ink-3);margin-top:2px;overflow-wrap:anywhere}
.options{margin-top:14px}
.options>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:6px;min-height:30px;font-size:12px;color:var(--ink-2);border-radius:6px}
.options>summary::-webkit-details-marker{display:none}
.options>summary .chev{width:14px;height:14px;transition:transform .15s;transform:rotate(-90deg)}
.options[open]>summary .chev{transform:none}
.options-body{padding:4px 2px 2px 20px}
.force-row{display:flex;align-items:flex-start;gap:8px;font-size:12px;margin:4px 0;cursor:pointer}
.force-row input{accent-color:var(--zhu);margin:3px 0 0;flex:none}
.force-note{font-size:11px;color:var(--ink-3);margin:2px 0 8px 21px}
.meta-line{font-size:11px;line-height:1.7;color:var(--ink-3);overflow-wrap:anywhere;margin:4px 0;font-family:var(--vscode-editor-font-family,monospace)}

/* 任务栏 */
.taskbar{position:relative;flex:none;display:flex;align-items:center;gap:8px;min-height:38px;padding:4px 8px 4px 16px;border-top:1px solid var(--line);background:var(--bg);font-size:12px}
.dot{width:7px;height:7px;border-radius:50%;background:var(--ok);flex:none}
.dot.busy{background:var(--warn);animation:pulse 1.4s ease-in-out infinite}
.dot.error{background:var(--zhu)}
#taskText{flex:1;min-width:0;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.taskbar .ghost{min-height:28px}
.cancel{color:var(--zhu)!important;font-weight:600}
.progress{position:absolute;left:0;right:0;top:-1px;height:2px;overflow:hidden;background:transparent}
.progress-fill{height:100%;width:0;background:var(--zhu);transition:width .25s}
.progress.indeterminate .progress-fill{width:30%;animation:progress 1.5s ease-in-out infinite}
.theme-hint{position:fixed;top:54px;right:12px;z-index:5;padding:6px 12px;border-radius:7px;background:var(--btn);color:var(--btn-ink);font-size:12px;box-shadow:0 4px 14px #0000002e;pointer-events:none}
.theme-hint:empty{display:none}
@keyframes progress{0%{transform:translateX(-100%)}100%{transform:translateX(340%)}}
@keyframes pulse{50%{opacity:.35}}

/* 宽面板：目录独占右栏 */
@media (min-width:640px){
  .page-organize{flex-direction:row;gap:22px;flex:1 1 0;min-height:0;padding-bottom:14px}
  .org-side{width:330px;overflow-y:auto;margin:-4px;padding:4px}
  .org-toc{min-height:0}
  .chapter-list{min-height:160px}
  .org-toc>.section:first-child{margin-top:0}
}
/* 窄面板 */
@media (max-width:330px){
  .page{padding:12px 10px}
  .header{padding:0 6px 0 2px;gap:6px}
  .tab{padding:0 8px}
  .checks{grid-template-columns:1fr;gap:4px}
  .check{flex-direction:row;align-items:center;padding:4px 4px 4px 11px}
  .check::before{top:7px;bottom:7px}
  .check-label{flex:1;font-size:12px;color:var(--ink)}
  .check-count{flex:none;font-size:14px;text-align:right}
  .quick button{min-height:44px}
  .action-row{grid-template-columns:1fr}
}
@media (pointer:coarse){button,summary{min-height:40px}.arrows button{width:34px;min-height:36px}input,textarea{font-size:16px!important}}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}.progress.indeterminate .progress-fill{width:100%;opacity:.5}}
`;

function buildPanelHtml() {
  const script = fs.readFileSync(path.join(__dirname, 'panel-webview.js'), 'utf8');
  const nonce = require('crypto').randomBytes(16).toString('hex');
  const tool = (command, label, name, doc = true) => '<button type="button" class="tool" data-run="' + command + '"' + (doc ? ' data-doc' : '') + '>' + icon(name) + '<span>' + label + '</span></button>';
  const group = (label, items) => '<div class="tool-group"><p class="group-label">' + label + '</p><div class="tools">' + items.join('') + '</div></div>';
  const check = (name, id, prev, next) => '<div class="check card" id="row' + id + '"><span class="check-label">' + name + '</span><div class="check-body"><span class="check-count" id="count' + id + '">—</span><span class="arrows"><button type="button" data-doc data-run="' + prev + '" aria-label="上一处' + name + '" title="上一处">' + icon('left') + '</button><button type="button" data-doc data-run="' + next + '" aria-label="下一处' + name + '" title="下一处">' + icon('right') + '</button></span></div></div>';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>小说工具箱</title>
<style>${CSS}</style>
</head>
<body>
<div class="app">
  <header class="header">
    <nav class="tabs" role="tablist" aria-label="工具箱页面">
      <button type="button" class="tab" id="organizeTab" data-tab="organize" role="tab" aria-selected="true" aria-controls="tab-organize">整理</button>
      <button type="button" class="tab" id="scrapeTab" data-tab="scrape" role="tab" aria-selected="false" aria-controls="tab-scrape">抓取</button>
    </nav>
    <div class="header-actions">
      <button type="button" class="icon-btn" id="themeButton" data-action="theme" aria-label="切换面板主题" title="主题：跟随 VS Code">${icon('auto', 'i-auto')}${icon('sun', 'i-light')}${icon('moon', 'i-dark')}</button>
      <button type="button" class="icon-btn" data-host="openSettings" aria-label="打开插件设置" title="插件设置">${icon('settings')}</button>
    </div>
  </header>
  <main class="main">
    <section id="tab-organize" class="page page-organize" role="tabpanel" aria-labelledby="organizeTab">
      <div class="org-side">
        <div class="docbar">${icon('file')}<button type="button" class="file-name" id="fileName" data-doc data-host="renameFile" title="重命名当前文件"><span id="fileNameText">正在读取文件…</span>${icon('pencil')}</button><span class="file-status" id="fileStatus"></span></div>
        <div class="section">
          <div class="section-head"><h2 class="section-title">校对</h2><span class="spacer"></span><button type="button" class="ghost check-btn" id="checkBtn" data-doc data-run="check" title="立即检查全文（Alt+F8）">${icon('scan')}检查全文</button></div>
          <div class="checks" aria-label="检查结果">
            ${check('空白', 'Ws', 'prevProblem', 'nextProblem')}
            ${check('标点短行', 'Short', 'prevShort', 'nextShort')}
            ${check('引号配对', 'Quote', 'prevQuote', 'nextQuote')}
          </div>
          <p class="silence-note" id="silenceNote" hidden><span>自动检查已暂停（保存或添加缩进后）</span><button type="button" data-doc data-run="check">恢复检查</button></p>
        </div>
        <details class="tools-box" id="toolsPanel" open>
          <summary>${icon('chevron', 'chev')}<span class="section-title">整理</span><span class="hint">均可 Ctrl+Z 撤销</span></summary>
          ${group('段落', [tool('merge', '合并段内换行', 'wrap'), tool('dedent', '去除行首缩进', 'outdent'), tool('removeBlankLines', '消除空白行', 'blank'), tool('blankBeforeChapters', '章节前插空行', 'spacer'), tool('indent', '添加首行缩进', 'indent')])}
          ${group('文字', [tool('t2sFile', '繁体转简体', 'convert'), tool('normalizeEllipsis', '省略号整改', 'ellipsis'), tool('replaceCornerQuotes', '直角引号替换', 'corner'), tool('fullwidthToHalfwidth', '全角转半角', 'narrow')])}
          ${group('章节与批量', [tool('checkChapters', '检查缺章重复', 'listcheck'), tool('unifyChapterNumbers', '章节号转汉字', 'hash'), tool('batchProcess', '批量整理文件夹', 'batch', false)])}
        </details>
      </div>
      <div class="org-toc">
        <div class="section">
          <div class="section-head"><h2 class="section-title">目录<span class="count" id="chCount"></span></h2><span class="spacer"></span>
            <button type="button" class="icon-btn" data-doc data-action="locate" aria-label="定位当前章" title="定位当前章">${icon('locate')}</button>
            <button type="button" class="icon-btn" data-doc data-run="prevChapter" aria-label="上一章" title="上一章">${icon('up')}</button>
            <button type="button" class="icon-btn" data-doc data-run="nextChapter" aria-label="下一章" title="下一章">${icon('down')}</button>
          </div>
          <label class="search">${icon('search')}<input id="search" type="search" placeholder="搜索章节名或编号，回车跳转" aria-label="搜索章节"></label>
        </div>
        <div id="chapters" class="chapter-list card"><div class="empty">打开文稿后显示章节目录</div></div>
      </div>
    </section>
    <section id="tab-scrape" class="page page-scrape" role="tabpanel" aria-labelledby="scrapeTab" hidden>
      <div class="segmented" role="tablist" aria-label="抓取来源">
        <button type="button" id="pixivSource" data-source="pixiv" role="tab" aria-selected="true" aria-controls="source-pixiv">Pixiv 小说</button>
        <button type="button" id="cool18Source" data-source="cool18" role="tab" aria-selected="false" aria-controls="source-cool18">cool18 书屋</button>
      </div>
      <section id="source-pixiv" role="tabpanel" aria-labelledby="pixivSource">
        <div class="status-line card"><span class="text"><span class="cookie" id="cookieChip">Cookie 未设置</span></span><button type="button" class="ghost" data-run="pixivSetCookie">${icon('key')}管理 Cookie</button></div>
        <label class="input-label" for="pixivInput">作品链接或 ID<span class="muted" style="font-weight:400;font-size:11px">单篇 · 系列 · 作者</span></label>
        <textarea id="pixivInput" class="link-input" rows="4" spellcheck="false" placeholder="粘贴小说、系列或作者链接，可多行&#10;裸数字按单篇小说 ID 处理"></textarea>
        <p class="preview" id="pixivPreview" aria-live="polite">支持小说、系列和作者链接</p>
        <button type="button" class="primary full" data-task-start data-pixiv-grab>${icon('download')}开始抓取</button>
        <div class="quick">
          <button type="button" data-doc data-task-start data-host="pixivGrabFile" title="抓取当前文件（或选区）中的 Pixiv 链接">${icon('link')}当前文件链接</button>
          <button type="button" data-task-start data-run="pixivGrabUser" title="输入作者 ID 抓取全部作品">${icon('user')}作者全量…</button>
          <button type="button" data-run="pixivOpenOutput" title="打开 Pixiv 输出目录">${icon('folder')}输出目录</button>
        </div>
        <div class="section">
          <div class="section-head"><h2 class="section-title">已抓系列<span class="count" id="seriesCount"></span></h2><span class="spacer"></span><button type="button" class="ghost" data-task-start data-run="pixivUpdate">${icon('refresh')}检查更新</button></div>
          <div id="series" class="series-list card"><div class="empty">还没有已抓系列</div></div>
        </div>
        <details class="options"><summary>${icon('chevron', 'chev')}抓取选项</summary><div class="options-body"><label class="force-row"><input type="checkbox" id="forceGrab"><span>强制重抓</span></label><p class="force-note">下载成功后备份并替换目标文件；失败时保留原文，旧版目录保留。</p><div class="meta-line" id="pixivMeta"></div></div></details>
      </section>
      <section id="source-cool18" role="tabpanel" aria-labelledby="cool18Source" hidden>
        <div class="status-line card"><span class="text">跟随帖内章节链接爬全本，或按列表顺序批量抓取；同名文件会跳过。</span></div>
        <label class="input-label" for="cool18Input">帖子链接或 ID<span class="muted" style="font-weight:400;font-size:11px">每行一条</span></label>
        <textarea id="cool18Input" class="link-input" rows="4" spellcheck="false" placeholder="每行一个帖子链接或 ID&#10;爬全本从第一个输入出发跟随章节链接"></textarea>
        <p class="preview" id="cool18Preview" aria-live="polite">支持帖子链接或 ID，每行一条</p>
        <div class="action-row">
          <button type="button" class="primary" data-task-start data-cool18-deep="true">${icon('download')}爬全本</button>
          <button type="button" class="secondary" data-task-start data-cool18-deep="false">${icon('list')}按列表批量</button>
        </div>
        <div class="quick">
          <button type="button" data-doc data-task-start data-host="cool18GrabFile" title="抓取当前文件（或选区）中的 cool18 链接">${icon('link')}当前文件链接</button>
          <button type="button" data-task-start data-run="cool18Search" title="按关键词搜索 cool18">${icon('search')}搜索…</button>
          <button type="button" data-run="cool18OpenOutput" title="打开 cool18 输出目录">${icon('folder')}输出目录</button>
        </div>
        <details class="options"><summary>${icon('chevron', 'chev')}连接与输出</summary><div class="options-body"><div class="meta-line" id="cool18Meta"></div></div></details>
      </section>
    </section>
  </main>
  <footer class="taskbar">
    <div id="taskProgress" class="progress" role="progressbar" aria-label="抓取进度" hidden><div id="taskProgressFill" class="progress-fill"></div></div>
    <span class="dot" id="taskDot" aria-hidden="true"></span>
    <span id="taskText" role="status" aria-live="polite">就绪</span>
    <button type="button" class="ghost cancel" id="cancelBtn" data-host="pixivCancel" hidden>${icon('close')}取消</button>
    <button type="button" class="icon-btn" data-run="showScrapeLog" aria-label="抓取日志" title="抓取日志">${icon('log')}</button>
    <button type="button" class="icon-btn" data-run="showHistory" aria-label="抓取历史" title="抓取历史">${icon('history')}</button>
  </footer>
  <div id="themeHint" class="theme-hint" role="status" aria-live="polite"></div>
</div>
<script nonce="${nonce}">
${script}
</script>
</body>
</html>`;
}

module.exports = { buildPanelHtml };
