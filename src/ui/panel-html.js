'use strict';

// 纸墨工作台：所有资源随插件分发，面板不加载外部字体、图标或脚本。
const fs = require('fs');
const path = require('path');

const ICONS = {
  book: '<path d="M3 4h6a4 4 0 0 1 3 1 4 4 0 0 1 3-1h6v15h-6a4 4 0 0 0-3 1 4 4 0 0 0-3-1H3z"/><path d="M12 5v15"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h4M9 12h6M9 16h6"/>',
  scan: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 12h10"/>',
  wrap: '<path d="M3 5h18M3 10h14a4 4 0 0 1 0 8h-5m3-3-3 3 3 3M3 15h4"/>',
  outdent: '<path d="M12 5h9M12 12h9M12 19h9M8 8l-4 4 4 4"/>',
  indent: '<path d="M12 5h9M12 12h9M12 19h9M4 8l4 4-4 4"/>',
  blank: '<path d="M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  locate: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  folder: '<path d="M3 7V4h7l2 3h9v13H3z"/>',
  settings: '<path d="M3 6h4m4 0h10M3 12h10m4 0h4M3 18h4m4 0h10"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>',
  theme: '<circle cx="12" cy="12" r="7"/><path d="M12 5v14M12 1v1m0 20v1M1 12h1m20 0h1"/>',
  history: '<path d="M4 5v5h5M4 10a8 8 0 1 1 0 5M12 7v6l4 2"/>',
  refresh: '<path d="M20 4v6h-6M4 20v-6h6M5 8a8 8 0 0 1 15 2M4 14a8 8 0 0 0 15 2"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
};

function icon(name) {
  return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICONS[name] || ICONS.file) + '</svg>';
}

function buildPanelHtml() {
  const script = fs.readFileSync(path.join(__dirname, 'panel-webview.js'), 'utf8');
  const nonce = require('crypto').randomBytes(16).toString('hex');
  const tool = (command, label, name, doc = true) => '<button type="button" class="tool" data-run="' + command + '"' + (doc ? ' data-doc' : '') + '>' + icon(name) + '<span>' + label + '</span></button>';
  const extra = (command, label, doc = true) => '<button type="button" data-run="' + command + '"' + (doc ? ' data-doc' : '') + '>' + label + '</button>';
  const issue = (name, id, prev, next) => '<div class="issue-row" id="row' + id + '"><span class="issue-mark" aria-hidden="true">—</span><span>' + name + '</span><span class="issue-count" id="count' + id + '">—</span><span class="arrows"><button type="button" data-doc data-run="' + prev + '" aria-label="上一处' + name + '">‹</button><button type="button" data-doc data-run="' + next + '" aria-label="下一处' + name + '">›</button></span></div>';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>小说工具箱</title>
<style>
:root{color-scheme:dark;--paper:#202822;--surface:#1d2420;--raised:#29332c;--ink:#e2e7de;--secondary:#a7b5a8;--line:#39473c;--accent:#aac7ac;--accent-soft:#303f32;--button:#b0cbb1;--button-text:#1d2c21;--warn:#e3b578;--warn-soft:#423626;--danger:#efa7a1;--radius:8px}
body.vscode-light:not([data-theme="dark"]),body[data-theme="light"]{color-scheme:light;--paper:#f7f7f1;--surface:#fbfaf6;--raised:#fffefb;--ink:#252e28;--secondary:#657067;--line:#dedfd6;--accent:#476854;--accent-soft:#e6ece2;--button:#476854;--button-text:#fffef6;--warn:#956236;--warn-soft:#f4eade;--danger:#a83b35}
body.vscode-high-contrast:not([data-theme]),body.vscode-high-contrast-light:not([data-theme]){--paper:var(--vscode-editor-background);--surface:var(--vscode-editor-background);--raised:var(--vscode-editor-background);--ink:var(--vscode-editor-foreground);--secondary:var(--vscode-editor-foreground);--line:var(--vscode-contrastBorder);--accent:var(--vscode-focusBorder);--accent-soft:var(--vscode-list-activeSelectionBackground);--button:var(--vscode-button-background);--button-text:var(--vscode-button-foreground)}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--vscode-font-family,system-ui),"Microsoft YaHei",sans-serif;font-size:13px;line-height:1.5}button,input,textarea{font:inherit;color:inherit}button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:32px;border:0;border-radius:6px;padding:6px 9px;background:transparent;cursor:pointer}button:hover{background:var(--accent-soft)}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:2px solid var(--vscode-focusBorder,var(--accent));outline-offset:2px}button:disabled:hover{background:transparent}[hidden]{display:none!important}.icon{width:16px;height:16px;flex:none}.muted{color:var(--secondary)}.small{font-size:11px}.flex{display:flex;align-items:center;gap:8px;min-width:0}
.app{max-width:760px;min-width:0;margin:0 auto}.header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:20px 20px 14px}.brand-symbol{display:grid;place-items:center;width:31px;height:35px;flex:none;border-radius:4px 9px 4px 4px;background:var(--accent);color:var(--paper)}.brand-name{font-size:15px;font-weight:600;letter-spacing:.5px}.brand-en{font-size:10px;letter-spacing:1.5px;color:var(--secondary);margin-top:1px}.header-actions{display:flex;gap:2px}.header-actions button{width:30px;padding:6px}.tabs{display:flex;gap:24px;border-bottom:1px solid var(--line);padding:0 20px}.tab{position:relative;padding:10px 0;border-radius:0;color:var(--secondary)}.tab[aria-selected="true"]{color:var(--accent);font-weight:600}.tab[aria-selected="true"]:after{content:"";position:absolute;bottom:-1px;left:0;right:0;height:2px;background:var(--accent)}.tabpage{padding:18px 20px}.file-row{display:flex;align-items:center;gap:7px;margin-bottom:16px;min-width:0}.file-row>.icon{color:var(--secondary)}.file-name{padding:0;min-width:0;justify-content:flex-start;text-align:left;overflow-wrap:anywhere}.file-status{margin-left:auto;white-space:nowrap;font-size:11px;color:var(--secondary)}.primary{background:var(--button);color:var(--button-text);border-radius:var(--radius);font-weight:600;padding:10px 13px;min-height:39px}.primary:hover{background:var(--button);filter:brightness(1.08)}.primary:disabled:hover{background:var(--button)}.full{width:100%}.shortcut{margin-left:auto;font-size:11px;opacity:.7}.issue-list{padding:9px 0 11px;border-bottom:1px solid var(--line)}.issue-row{display:flex;align-items:center;gap:9px;min-height:33px;font-size:12px}.issue-mark{font-size:13px;color:var(--secondary);width:14px;text-align:center}.issue-row.warn .issue-mark{color:var(--warn)}.issue-row.ok .issue-mark{color:var(--accent)}.issue-count{margin-left:auto;color:var(--secondary);font-size:11px}.arrows{display:flex;gap:2px}.arrows button{width:26px;min-height:27px;padding:0;font-size:19px;color:var(--secondary)}.section-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:20px 0 10px}.section-head h2{font-size:12px;font-weight:600;letter-spacing:.3px;margin:0}.section-head button{font-size:11px;color:var(--secondary);min-height:25px;padding:3px 5px}.section-head .icon{width:14px;height:14px}.tools{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}.tool{background:var(--raised);border:1px solid var(--line);border-radius:var(--radius);padding:11px 9px;justify-content:flex-start;font-size:12px;min-width:0;text-align:left}.tool .icon{color:var(--secondary);width:15px;height:15px}.tool span{overflow-wrap:anywhere}.details{margin-top:10px;color:var(--secondary)}.details summary{display:flex;align-items:center;justify-content:space-between;min-height:32px;cursor:pointer;font-size:11px;list-style:none}.details summary::-webkit-details-marker{display:none}.details .chevron{font-size:14px}.details[open] .chevron{transform:rotate(180deg)}.extra-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px;padding:6px 0 8px}.extra-grid button{justify-content:flex-start;font-size:12px;text-align:left;font-weight:400}.search{display:flex;align-items:center;gap:7px;background:var(--surface);border:1px solid var(--line);border-radius:7px;padding:6px 9px;margin-bottom:8px;color:var(--secondary)}.search .icon{width:14px;height:14px}.search input{width:100%;min-width:0;border:0;background:transparent;padding:3px 0;font-size:12px;color:var(--ink)}input::placeholder,textarea::placeholder{color:var(--secondary);opacity:.85}.chapter-list{display:flex;flex-direction:column;gap:3px;min-height:86px}.ch{display:flex;align-items:baseline;justify-content:flex-start;gap:9px;width:100%;padding:9px;font-size:12px;font-weight:400;text-align:left;min-width:0}.ch .num{font-family:var(--vscode-editor-font-family,monospace);font-size:11px;min-width:24px;color:var(--secondary)}.ch .t{flex:1;min-width:0;overflow-wrap:anywhere}.ch .ln{font-size:11px;color:var(--secondary);white-space:nowrap;font-variant-numeric:tabular-nums}.ch.vol{font-size:11px;color:var(--secondary);margin-top:6px}.ch.vol .num{display:none}.ch.current{background:var(--accent-soft);color:var(--accent)}.ch.current .num{color:var(--accent)}.empty{color:var(--secondary);padding:18px 8px;text-align:center;font-size:12px}.chapter-nav{display:flex;justify-content:space-between;margin-top:9px;border-top:1px solid var(--line);padding-top:5px}.chapter-nav button{font-size:11px;color:var(--secondary)}
.source-switch{display:grid;grid-template-columns:1fr 1fr;gap:3px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:3px;margin-bottom:22px}.source-switch button[aria-selected="true"]{background:var(--raised);color:var(--accent);font-weight:600;box-shadow:0 1px 3px #0000000c}.eyebrow{font-size:10px;letter-spacing:1.8px;color:var(--secondary);margin:0 0 5px}.grab-heading{font-family:"Songti SC",SimSun,serif;font-size:24px;font-weight:500;line-height:1.5;margin:0 0 5px}.grab-intro{font-size:12px;color:var(--secondary);margin:0 0 20px}.input-label{display:block;font-weight:500;font-size:12px;margin-bottom:8px}.link-input{display:block;width:100%;min-height:110px;resize:vertical;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:11px;font-size:12px;line-height:1.7;overflow-wrap:anywhere}.preview{min-height:19px;font-size:11px;color:var(--secondary);margin:8px 0 14px;overflow-wrap:anywhere}.sub-actions{display:flex;justify-content:space-between;gap:4px;flex-wrap:wrap;margin:7px 0}.sub-actions button{font-size:11px;padding:6px 3px;font-weight:400;color:var(--secondary)}.sub-actions .icon{width:14px;height:14px}.connection{display:flex;justify-content:space-between;align-items:center;gap:8px;border-top:1px solid var(--line);padding:11px 0;margin-top:18px;font-size:11px;color:var(--secondary)}.cookie{color:var(--secondary)}.cookie.ok{color:var(--accent)}.cookie.warn{color:var(--warn)}.connection button{font-size:11px;min-height:26px;padding:3px}.srow{display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--line);padding:12px 0}.srow .book{display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);width:28px;height:36px;border-radius:2px 5px 5px 2px;flex:none}.srow .book .icon{width:15px;height:15px}.srow .st{font-size:12px;overflow-wrap:anywhere}.srow .sm{font-size:11px;color:var(--secondary);margin-top:3px;overflow-wrap:anywhere}.meta-line{font-size:11px;line-height:1.7;color:var(--secondary);overflow-wrap:anywhere;margin:5px 0}.force-row{display:flex;align-items:flex-start;gap:7px;font-size:12px;margin:7px 0;color:var(--ink)}.force-row input{accent-color:var(--accent);margin:4px 0 0;flex:none}.force-note{font-size:11px;color:var(--secondary);margin:5px 0 10px}.taskbar{border-top:1px solid var(--line);padding:11px 20px 12px;background:var(--paper)}.task-row{display:flex;align-items:center;gap:8px;font-size:11px;min-width:0}.dot{width:6px;height:6px;background:var(--accent);border-radius:50%;flex:none}.dot.busy{background:var(--warn)}#taskText{flex:1;min-width:0;overflow-wrap:anywhere}.taskbar button{font-size:11px;min-height:28px;padding:4px 6px;color:var(--secondary)}.progress{height:3px;background:var(--line);border:0;border-radius:3px;overflow:hidden;margin-top:9px}.progress-fill{height:100%;width:0;background:var(--accent);transition:width .2s}.progress.indeterminate .progress-fill{width:35%;animation:progress 1.6s ease-in-out infinite}.theme-hint{font-size:11px;color:var(--secondary);padding:0 20px 9px;min-height:17px}.theme-hint:empty{display:none}@keyframes progress{0%{transform:translateX(-100%)}100%{transform:translateX(390%)}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}.progress.indeterminate .progress-fill{width:100%;opacity:.5}}@media(max-width:340px){.header{padding:17px 14px 12px}.tabs{padding:0 14px}.tabpage{padding:16px 14px}.taskbar{padding-left:14px;padding-right:14px}.brand-name{font-size:14px}.brand-en{font-size:9px;letter-spacing:1px}.ch{gap:6px;padding:8px 6px}.ch .ln{font-size:10px}.tool{gap:6px;padding:10px 7px}.section-head{gap:5px}.section-head button{font-size:10px}}@media(pointer:coarse){button,summary{min-height:42px}.arrows button{width:34px;min-height:36px}input,textarea{font-size:16px!important}}
.app{min-height:100vh;display:flex;flex-direction:column}.app>main{flex:1}#chapters{max-height:clamp(150px,calc(100vh - 650px),440px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--line) transparent}.taskbar{position:sticky;bottom:0;z-index:2}.chapter-list:focus-within{scroll-behavior:auto}
</style>
</head>
<body>
<div class="app">
  <header class="header">
    <div class="flex"><span class="brand-symbol">${icon('book')}</span><div><div class="brand-name">小说工具箱</div><div class="brand-en">NOVEL TOOLKIT</div></div></div>
    <div class="header-actions"><button type="button" id="themeButton" data-action="theme" aria-label="切换面板主题" title="主题：跟随 VS Code">${icon('theme')}</button><button type="button" data-host="openSettings" aria-label="打开插件设置" title="插件设置">${icon('settings')}</button></div>
  </header>
  <nav class="tabs" role="tablist" aria-label="工具箱页面">
    <button type="button" class="tab" id="organizeTab" data-tab="organize" role="tab" aria-selected="true" aria-controls="tab-organize">整理</button>
    <button type="button" class="tab" id="scrapeTab" data-tab="scrape" role="tab" aria-selected="false" aria-controls="tab-scrape">抓取</button>
  </nav>
  <main>
    <section id="tab-organize" class="tabpage" role="tabpanel" aria-labelledby="organizeTab">
      <div class="file-row">${icon('file')}<button type="button" class="file-name" id="fileName" data-doc data-host="renameFile" title="重命名当前文件">正在读取文件…</button><span class="file-status" id="fileStatus"></span></div>
      <button type="button" class="primary full" data-doc data-run="check">${icon('scan')}检查全文<span class="shortcut">空白 · 短行 · 引号</span></button>
      <div class="issue-list" aria-label="检查结果">
        ${issue('空白', 'Ws', 'prevProblem', 'nextProblem')}
        ${issue('标点短行', 'Short', 'prevShort', 'nextShort')}
        ${issue('引号配对', 'Quote', 'prevQuote', 'nextQuote')}
      </div>
      <div class="section-head"><h2>正文整理</h2><span class="small muted">可撤销</span></div>
      <div class="tools">${tool('merge', '合并段内换行', 'wrap')}${tool('dedent', '去除行首缩进', 'outdent')}${tool('indent', '添加首行缩进', 'indent')}${tool('removeBlankLines', '消除空白行', 'blank')}</div>
      <details class="details" id="moreTools"><summary>更多处理<span class="chevron" aria-hidden="true">⌄</span></summary><div class="extra-grid">
        ${extra('blankBeforeChapters', '章节前插入空行')}${extra('unifyChapterNumbers', '章节号转汉字')}${extra('t2sFile', '繁体转简体')}${extra('normalizeEllipsis', '省略号整改')}${extra('replaceCornerQuotes', '直角引号替换')}${extra('fullwidthToHalfwidth', '全角转半角')}${extra('checkChapters', '检查缺章与重复')}${extra('batchProcess', '批量整理文件夹', false)}
      </div></details>
      <div class="section-head"><h2>章节目录 <span class="muted" id="chCount"></span></h2><button type="button" data-doc data-action="locate">${icon('locate')}定位当前章</button></div>
      <label class="search">${icon('search')}<input id="search" type="search" placeholder="搜索章节名或编号" aria-label="搜索章节"></label>
      <div id="chapters" class="chapter-list"><div class="empty">打开文稿后显示章节目录</div></div>
      <div class="chapter-nav"><button type="button" data-doc data-run="prevChapter">‹ 上一章</button><button type="button" data-doc data-run="nextChapter">下一章 ›</button></div>
    </section>
    <section id="tab-scrape" class="tabpage" role="tabpanel" aria-labelledby="scrapeTab" hidden>
      <div class="source-switch" role="tablist" aria-label="抓取来源">
        <button type="button" id="pixivSource" data-source="pixiv" role="tab" aria-selected="true" aria-controls="source-pixiv">Pixiv 小说</button>
        <button type="button" id="cool18Source" data-source="cool18" role="tab" aria-selected="false" aria-controls="source-cool18">cool18 书屋</button>
      </div>
      <section id="source-pixiv" role="tabpanel" aria-labelledby="pixivSource">
        <p class="eyebrow">PIXIV NOVELS</p><h2 class="grab-heading">把故事带回来。</h2><p class="grab-intro">单篇、系列或作者作品，整理成可读的文本。</p>
        <label class="input-label" for="pixivInput">作品链接或 ID</label><textarea id="pixivInput" class="link-input" rows="4" spellcheck="false" placeholder="粘贴小说、系列或作者链接&#10;裸数字按单篇小说 ID 处理"></textarea>
        <p class="preview" id="pixivPreview" aria-live="polite">支持小说、系列和作者链接</p>
        <button type="button" class="primary full" data-task-start data-pixiv-grab>${icon('download')}开始抓取</button>
        <div class="sub-actions"><button type="button" data-doc data-task-start data-host="pixivGrabFile">${icon('file')}当前文件链接</button><button type="button" data-task-start data-run="pixivGrabUser">${icon('user')}作者全量…</button><button type="button" data-run="pixivOpenOutput">${icon('folder')}输出目录</button></div>
        <div class="connection"><span class="cookie" id="cookieChip">Cookie 未设置</span><button type="button" data-run="pixivSetCookie">管理 Cookie ›</button></div>
        <div class="section-head"><h2>已抓系列 <span class="muted" id="seriesCount"></span></h2><button type="button" data-task-start data-run="pixivUpdate">${icon('refresh')}检查更新</button></div>
        <div id="series"><div class="empty">还没有已抓系列</div></div>
        <details class="details"><summary>抓取选项<span class="chevron" aria-hidden="true">⌄</span></summary><label class="force-row"><input type="checkbox" id="forceGrab"><span>强制重抓</span></label><p class="force-note">先清除目标旧文件与记录。系列目录中的手动修改也会被删除，请先备份。</p><div class="meta-line" id="pixivMeta"></div></details>
      </section>
      <section id="source-cool18" role="tabpanel" aria-labelledby="cool18Source" hidden>
        <p class="eyebrow">COOL18 LIBRARY</p><h2 class="grab-heading">沿着章节，继续读。</h2><p class="grab-intro">跟随帖内章节链接，或按给定列表顺序抓取。</p>
        <label class="input-label" for="cool18Input">帖子链接或 ID</label><textarea id="cool18Input" class="link-input" rows="4" spellcheck="false" placeholder="每行一个帖子链接或 ID&#10;爬全本从第一个输入出发跟随章节链接"></textarea>
        <p class="preview" id="cool18Preview" aria-live="polite">支持帖子链接或 ID，每行一条</p>
        <button type="button" class="primary full" data-task-start data-cool18-deep="true">${icon('download')}爬全本</button>
        <div class="sub-actions"><button type="button" data-task-start data-cool18-deep="false">按列表批量</button><button type="button" data-doc data-task-start data-host="cool18GrabFile">${icon('file')}当前文件链接</button><button type="button" data-task-start data-run="cool18Search">${icon('search')}搜索…</button></div>
        <div class="connection"><span>同名现有文件会跳过</span><button type="button" data-run="cool18OpenOutput">${icon('folder')}输出目录</button></div>
        <details class="details"><summary>连接与输出<span class="chevron" aria-hidden="true">⌄</span></summary><div class="meta-line" id="cool18Meta"></div></details>
      </section>
    </section>
  </main>
  <footer class="taskbar"><div class="task-row"><span class="dot" id="taskDot" aria-hidden="true"></span><span id="taskText" role="status" aria-live="polite">就绪</span><button type="button" id="cancelBtn" data-host="pixivCancel" hidden>取消</button><button type="button" data-run="showScrapeLog" title="查看抓取日志">日志</button><button type="button" data-run="showHistory">${icon('history')}历史</button></div><div id="taskProgress" class="progress" role="progressbar" aria-label="抓取进度" hidden><div id="taskProgressFill" class="progress-fill"></div></div></footer>
  <div id="themeHint" class="theme-hint" role="status" aria-live="polite"></div>
</div>
<script nonce="${nonce}">
${script}
</script>
</body>
</html>`;
}

module.exports = { buildPanelHtml };
