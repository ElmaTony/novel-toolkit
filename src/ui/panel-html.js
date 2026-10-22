'use strict';

// 面板 HTML: Claude CDS 暖调编辑感 v6
// 令牌来源: open-claude-ui (Clay #d97757 / Surface 0-3 / 发丝边框 / 弹簧动效)
// 支持 VSCode 深浅色；交互仍使用 data-* 属性 + panel-webview.js 事件委托
const fs = require('fs');
const path = require('path');

function buildPanelHtml() {
  const script = fs.readFileSync(path.join(__dirname, 'panel-webview.js'), 'utf8');
  const nonce = require('crypto').randomBytes(16).toString('hex');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  :root {
    --clay: #d97757;
    --clay-hover: #e08264;
    --clay-soft: rgba(217, 119, 87, .14);
    --clay-line: rgba(217, 119, 87, .34);
    --clay-text: #f0a184;

    --success: #7ccf9b;
    --warning: #e0b35a;
    --danger: #ef8a8a;

    --surface-0: #0b0b0b;
    --surface-1: #151515;
    --surface-2: #1a1a19;
    --surface-3: #20201f;
    --surface-popover: #2c2c2a;

    --text-primary: #f5f5f5;
    --text-secondary: #a3a3a3;
    --text-muted: #666666;

    --alpha-1: rgba(255, 255, 255, .05);
    --alpha-2: rgba(255, 255, 255, .09);
    --alpha-3: rgba(255, 255, 255, .18);
    --alpha-4: rgba(255, 255, 255, .30);
    --border: var(--alpha-2);
    --border-strong: var(--alpha-3);

    --radius-panel: 10px;
    --radius-card: 12px;
    --radius-btn: 8px;
    --radius-xs: 6px;
    --radius-pill: 9999px;

    --shadow-panel: 0 0 0 1px var(--border), 0 1px 2px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .4);
    --shadow-float: 0 8px 28px rgba(0, 0, 0, .55), 0 2px 8px rgba(0, 0, 0, .4);

    --ease-enter: cubic-bezier(.22, 1, .36, 1);
    --ease-pop: cubic-bezier(.34, 1.56, .64, 1);
    --ease-swift: cubic-bezier(.16, 1, .3, 1);
  }

  body.vscode-light {
    --surface-0: #f9f9f7;
    --surface-1: #fcfcfb;
    --surface-2: #ffffff;
    --surface-3: #ffffff;
    --surface-popover: #ffffff;

    --text-primary: #151515;
    --text-secondary: #525252;
    --text-muted: #8a8a8a;

    --alpha-1: rgba(21, 21, 21, .05);
    --alpha-2: rgba(21, 21, 21, .10);
    --alpha-3: rgba(21, 21, 21, .20);
    --alpha-4: rgba(21, 21, 21, .35);
    --border: var(--alpha-2);
    --border-strong: var(--alpha-3);

    --shadow-panel: 0 0 0 1px var(--border), 0 1px 2px rgba(0, 0, 0, .05), 0 2px 8px rgba(0, 0, 0, .08);
    --shadow-float: 0 8px 24px rgba(0, 0, 0, .12), 0 2px 6px rgba(0, 0, 0, .08);
  }

  body.vscode-high-contrast {
    --border: rgba(255, 255, 255, .34);
    --border-strong: rgba(255, 255, 255, .55);
  }

  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    font-family: var(--vscode-font-family), system-ui, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: var(--vscode-font-size, 13px);
    color: var(--text-primary);
    margin: 0; padding: 12px;
    min-height: 100vh;
    background:
      radial-gradient(900px 480px at 84% -10%, rgba(217, 119, 87, .10), transparent 60%),
      radial-gradient(700px 420px at -10% 32%, rgba(120, 120, 110, .08), transparent 60%),
      var(--surface-0);
    line-height: 1.45;
  }
  body.vscode-light {
    background:
      radial-gradient(900px 480px at 84% -10%, rgba(217, 119, 87, .08), transparent 60%),
      radial-gradient(700px 420px at -10% 32%, rgba(120, 120, 110, .05), transparent 60%),
      var(--surface-0);
  }

  .bg-orbs { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
  .bg-orbs i { position: absolute; border-radius: 50%; filter: blur(100px); opacity: .09; }
  .bg-orbs i:nth-child(1) { width: 280px; height: 280px; top: -100px; right: -60px; background: var(--clay); }
  .bg-orbs i:nth-child(2) { width: 220px; height: 220px; top: 38%; left: -90px; background: #7a7a70; opacity: .07; }
  .bg-orbs i:nth-child(3) { width: 180px; height: 180px; bottom: -70px; right: 22%; background: var(--clay-text); opacity: .04; }

  .glass, .glass-panel {
    position: relative; z-index: 1;
    background: linear-gradient(180deg, rgba(255, 255, 255, .025), transparent 28%), var(--surface-1);
    backdrop-filter: blur(22px) saturate(1.3);
    -webkit-backdrop-filter: blur(22px) saturate(1.3);
    border: 1px solid var(--border);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }
  body.vscode-light .glass,
  body.vscode-light .glass-panel {
    background: linear-gradient(180deg, rgba(255, 255, 255, .72), rgba(255, 255, 255, .18)), var(--surface-1);
  }

  /* 顶栏 */
  .topbar {
    display: flex; align-items: center; gap: 12px;
    padding: 8px 8px 12px; margin-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }
  .brand {
    font-weight: 560; font-size: 13px; letter-spacing: .01em;
    white-space: nowrap; display: flex; align-items: center; gap: 9px;
    color: var(--text-primary);
  }
  .brand-icon {
    width: 26px; height: 26px; border-radius: 8px;
    display: grid; place-items: center;
    background: var(--clay); color: #1a0f0b; flex: none;
    box-shadow: 0 2px 10px rgba(217, 119, 87, .20);
  }
  .brand-icon svg { width: 15px; height: 15px; }
  .tabs {
    display: flex; gap: 2px; flex: 1; max-width: 208px;
    margin-left: auto;
    padding: 3px;
    background: var(--alpha-1);
    border: 1px solid var(--border);
    border-radius: 9px;
  }
  .tab {
    flex: 1; border: 0; background: transparent;
    color: var(--text-secondary);
    padding: 6px 9px; font-size: 12px; cursor: pointer;
    border-radius: 6px; font-family: inherit; font-weight: 540;
    transition: background .2s var(--ease-swift), color .2s var(--ease-swift), box-shadow .2s var(--ease-swift);
  }
  .tab:hover { color: var(--text-primary); }
  .tab.active {
    background: var(--clay-soft);
    color: var(--clay-text);
    box-shadow: inset 0 0 0 1px var(--clay-line);
  }

  .tabpage[hidden] { display: none; }
  .tabpage > * { animation: rise .28s var(--ease-enter) backwards; }
  .tabpage > *:nth-child(2) { animation-delay: .03s; }
  .tabpage > *:nth-child(3) { animation-delay: .06s; }
  .tabpage > *:nth-child(4) { animation-delay: .09s; }
  @keyframes rise { from { opacity: 0; transform: translateY(7px); } }

  /* 文件卡 */
  .file-card {
    padding: 12px; margin-bottom: 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
  }
  .file-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .file-name {
    font-weight: 560; word-break: break-all; min-width: 0;
    cursor: pointer; transition: color .12s ease; font-size: 12.5px;
    color: var(--text-primary);
    flex: 1 1 140px;
  }
  .file-name:hover { color: var(--clay-text); }
  .chips { display: flex; gap: 5px; flex-wrap: wrap; margin-left: auto; }
  .chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 9px; border-radius: var(--radius-pill);
    font-size: 10.5px; font-weight: 540; letter-spacing: .01em;
    background: var(--alpha-1);
    border: 1px solid var(--border);
    color: var(--text-secondary); white-space: nowrap;
    transition: all .15s ease;
  }
  .chip::before {
    content: ''; width: 5px; height: 5px; border-radius: 50%;
    background: currentColor; opacity: .7; flex: none;
  }
  .chip.ok   { color: var(--success); border-color: rgba(124, 207, 155, .28); background: rgba(124, 207, 155, .08); }
  .chip.warn { color: var(--warning); border-color: rgba(224, 179, 90, .28); background: rgba(224, 179, 90, .08); }
  .chip.info { color: var(--clay-text); border-color: var(--clay-line); background: var(--clay-soft); }

  /* 分区 */
  .section { margin-bottom: 16px; }
  .section-title {
    display: flex; align-items: center; gap: 8px;
    font-size: 10px; font-weight: 620; letter-spacing: .14em;
    color: var(--text-muted);
    margin: 0 2px 9px; user-select: none; text-transform: uppercase;
  }
  .section-title::before {
    content: ''; width: 3px; height: 11px; border-radius: 2px;
    background: var(--clay); opacity: .9;
  }
  .section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }

  /* 按钮 */
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
  button {
    display: inline-flex; align-items: center; justify-content: center; gap: 5px;
    font-family: inherit; font-size: 12px; font-weight: 540;
    padding: 8px 11px; cursor: pointer;
    border-radius: var(--radius-btn);
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-primary);
    transition: background .18s var(--ease-swift), border-color .18s var(--ease-swift), transform .18s var(--ease-pop), box-shadow .18s var(--ease-swift);
    white-space: nowrap; position: relative; overflow: hidden;
  }
  button:hover {
    background: var(--surface-3);
    border-color: var(--border-strong);
    transform: translateY(-1px);
    box-shadow: 0 3px 10px rgba(0, 0, 0, .18);
  }
  button:active { transform: translateY(0) scale(.985); box-shadow: none; }
  button:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1px var(--surface-1), 0 0 0 1.5px var(--clay), 0 0 8px 2px rgba(217, 119, 87, .30);
  }
  button:disabled { opacity: .4; cursor: not-allowed; transform: none; }
  button.wide { grid-column: 1 / 3; }
  button.full { width: 100%; margin-bottom: 7px; }
  button.primary {
    background: var(--clay); border-color: transparent; color: #1a0f0b;
    font-weight: 600;
    box-shadow: 0 2px 10px rgba(217, 119, 87, .20);
  }
  button.primary:hover { background: var(--clay-hover); }
  button.ghost {
    background: transparent; border: 1px solid var(--border);
    color: var(--text-primary);
  }
  button.ghost:hover { background: var(--alpha-1); border-color: var(--border-strong); }
  button.tiny { padding: 3px 8px; font-size: 11px; border-radius: var(--radius-xs); }

  /* 跳转行 */
  .nav-row {
    display: grid; grid-template-columns: 34px 1fr 1fr; gap: 6px;
    align-items: center; margin-bottom: 6px;
  }
  .nav-label { font-size: 11px; color: var(--text-muted); font-weight: 540; }

  /* 输入 */
  input.search, textarea.ta {
    font-family: inherit; font-size: 12px;
    background: var(--surface-2);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: var(--radius-btn);
    transition: border-color .18s var(--ease-swift), box-shadow .18s var(--ease-swift), background .18s var(--ease-swift);
  }
  input.search { flex: 1; min-width: 60px; padding: 7px 10px; }
  input.search:focus, textarea.ta:focus {
    outline: none; border-color: var(--border-strong);
    background: var(--surface-3);
    box-shadow: inset 0 0 0 1px var(--surface-1), 0 0 0 1.5px rgba(217, 119, 87, .55);
  }
  input.search::placeholder, textarea.ta::placeholder { color: var(--text-muted); }
  textarea.ta { width: 100%; resize: vertical; padding: 9px 10px; line-height: 1.5; }

  .meta-line { font-size: 11px; color: var(--text-muted); margin-bottom: 6px; word-break: break-all; }
  .preview { font-size: 11px; color: var(--text-muted); margin: 5px 0 7px 2px; }
  .force-row {
    display: inline-flex; align-items: center; gap: 7px; font-size: 11px; color: var(--text-secondary);
    margin: 0 2px 9px; cursor: pointer; user-select: none; width: fit-content;
    padding: 4px 10px 4px 8px; border-radius: 8px;
    background: var(--surface-2); border: 1px solid var(--border);
    transition: all .18s ease;
  }
  .force-row:hover { color: var(--text-primary); border-color: var(--border-strong); }
  .force-row input { accent-color: var(--clay); cursor: pointer; margin: 0; }
  .force-row:has(input:checked) {
    color: var(--clay-text); border-color: var(--clay-line); background: var(--clay-soft);
  }

  /* 列表 */
  .list-head { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; }
  .list-title { font-size: 12px; font-weight: 600; flex: none; }
  .list-count { font-size: 11px; color: var(--text-muted); flex: none; }
  #chapters, .mini-list {
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: var(--surface-1);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    overflow-y: auto;
    padding: 4px;
  }
  #chapters { max-height: calc(100vh - 470px); min-height: 120px; }
  .mini-list { max-height: 160px; }
  .ch, .srow {
    display: flex; align-items: baseline; gap: 8px;
    padding: 7px 8px;
    border-radius: 6px;
    border-left: 2px solid transparent;
    cursor: pointer;
    transition: background .16s var(--ease-swift), border-color .16s var(--ease-swift), box-shadow .16s var(--ease-swift);
  }
  .ch:hover, .srow:hover { background: var(--alpha-1); }
  .ch .num, .srow .num {
    font-size: 10px; color: var(--text-muted);
    min-width: 28px; text-align: right; flex: none;
    font-variant-numeric: tabular-nums;
  }
  .ch .t, .srow .st {
    flex: 1; min-width: 0; font-size: 12px;
    color: var(--text-secondary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ch .ln { font-size: 10px; color: var(--text-muted); flex: none; }

  /* 卷名 */
  .ch.vol {
    border-left-color: var(--clay);
    background: var(--clay-soft);
  }
  .ch.vol .t { color: var(--text-primary); font-weight: 600; }
  .ch.vol .num { color: var(--clay-text); font-weight: 600; }

  /* 当前选中行 */
  .ch.current {
    border-left-color: var(--clay);
    background: var(--clay-soft);
    box-shadow: inset 0 0 0 1px var(--clay-line);
  }
  .ch.current .t { color: var(--text-primary); font-weight: 600; }
  .ch.current .num, .ch.current .ln { color: var(--clay-text); }

  .empty { padding: 22px 10px; text-align: center; color: var(--text-muted); font-size: 12px; }

  /* 抓取页系列列表 */
  .srow { border-bottom: 1px solid var(--border); }
  .srow:last-child { border-bottom: none; }
  .srow .sm { font-size: 11px; color: var(--text-muted); flex: none; }

  /* 任务条 */
  .taskbar {
    position: sticky; bottom: 10px; z-index: 15;
    display: flex; align-items: center; gap: 9px;
    padding: 9px 10px; margin-top: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-btn);
    box-shadow: var(--shadow-float);
  }
  .dot {
    width: 7px; height: 7px; border-radius: 50%; flex: none;
    background: var(--success);
    box-shadow: 0 0 7px rgba(124, 207, 155, .55);
    transition: background .2s ease;
  }
  .dot.busy {
    background: var(--warning);
    box-shadow: 0 0 9px rgba(224, 179, 90, .60);
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse { 50% { opacity: .35; box-shadow: 0 0 12px rgba(224, 179, 90, .65); } }
  #taskText { flex: 1; min-width: 0; font-size: 11.5px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: var(--alpha-3); border-radius: 4px;
    border: 2px solid transparent; background-clip: content-box;
  }
  ::-webkit-scrollbar-thumb:hover { background: var(--alpha-4); background-clip: content-box; }
</style>
</head>
<body>

<div class="bg-orbs" aria-hidden="true"><i></i><i></i><i></i></div>

<div class="topbar glass">
  <span class="brand">
    <span class="brand-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/>
        <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20"/>
      </svg>
    </span>
    小说工具箱
  </span>
  <div class="tabs">
    <button class="tab active" data-tab="organize" title="排版流水线：贴左/短行/引号检查、一键整理、章节导航（打开面板：Alt+F10 / Alt+F11）">整理</button>
    <button class="tab" data-tab="scrape" title="cool18 书屋 / Pixiv 小说抓取（打开面板：Alt+F10 / Alt+F11）">抓取</button>
  </div>
</div>

<div id="tab-organize" class="tabpage">

  <div class="card glass file-card">
    <div class="file-row">
      <span class="file-name" id="fileName" title="点击重命名文件（需已保存到磁盘且无未保存修改）">…</span>
      <div class="chips">
        <span class="chip" id="chipWs" title="贴左 = 行首无多余空白（快捷键：Alt+F8 下一处 / Shift+Alt+F8 上一处）">贴左 —</span>
        <span class="chip" id="chipShort" title="短行 = 疑似合并残留的单独成行标点（快捷键：Alt+F7 下一处 / Shift+Alt+F7 上一处）">短行 —</span>
        <span class="chip" id="chipQuote" title="引号 = 行内引号未配对（无全局快捷键，可用命令面板搜索）">引号 —</span>
        <span class="chip info" id="chipCh" title="章节 = 当前文件识别到的章节/卷数量（快捷键：Alt+F9 下一章 / Shift+Alt+F9 上一章）">章节 —</span>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">一键整理</div>
    <div class="grid">
      <button data-run="merge">合并段落内换行</button>
      <button data-run="removeBlankLines">消除空白行</button>
      <button data-run="dedent">去除行首缩进</button>
      <button data-run="indent">添加首行缩进</button>
      <button class="wide" data-run="blankBeforeChapters">章节名前插入空行</button>
      <button class="wide" data-run="unifyChapterNumbers" title="第123章 → 第一百二十三章（含卷号、全角数字）；只改章节名行，正文不动">章节号统一（数字 → 汉字）</button>
      <button class="wide" data-run="normalizeEllipsis" title="≥4 个各种形式的点（…⋯•・。…）→ 六点省略号……；2~3 个点 → 三点省略号…；孤立单点不改、另行提示">省略号整改</button>
    </div>
  </div>

  <div class="section">
    <div class="section-title">检查与跳转</div>
    <button class="full primary" data-run="check">全文检查（空白 + 短行 + 引号）</button>
    <button class="full" data-run="checkChapters" title="按卷分组核对章节编号连续性，报告缺失与重复编号">章节缺失检查</button>
    <div class="nav-row">
      <span class="nav-label">空白</span>
      <button data-run="prevProblem" title="跳到上一处行首空白（Shift+Alt+F8）">‹ 上一处</button>
      <button data-run="nextProblem" title="跳到下一处行首空白（Alt+F8）">下一处 ›</button>
    </div>
    <div class="nav-row">
      <span class="nav-label">短行</span>
      <button data-run="prevShort" title="跳到上一处标点短行（Shift+Alt+F7）">‹ 上一处</button>
      <button data-run="nextShort" title="跳到下一处标点短行（Alt+F7）">下一处 ›</button>
    </div>
    <div class="nav-row">
      <span class="nav-label">引号</span>
      <button data-run="prevQuote" title="跳到上一处引号配对问题（无全局快捷键，可用命令面板搜索）">‹ 上一处</button>
      <button data-run="nextQuote" title="跳到下一处引号配对问题（无全局快捷键，可用命令面板搜索）">下一处 ›</button>
    </div>
    <div class="nav-row">
      <span class="nav-label">章节</span>
      <button data-run="prevChapter" title="跳到上一章（Shift+Alt+F9）">‹ 上一章</button>
      <button data-run="nextChapter" title="跳到下一章（Alt+F9）">下一章 ›</button>
    </div>
  </div>

  <div class="section">
    <div class="section-title">编码处理</div>
    <div class="grid">
      <button data-run="detectEncoding">检测文件编码</button>
      <button data-run="convertToUtf8">转为 UTF-8</button>
      <button class="wide" data-run="setupEncoding">启用中文编码自动识别</button>
    </div>
  </div>

  <div class="section">
    <div class="section-title">增强处理</div>
    <div class="grid">
      <button data-run="t2sFile">繁→简</button>
      <button data-run="fullwidthToHalfwidth" title="Ｓｏｒｒｙ→Sorry、１２３→123；中文标点可保留；汉字与全角空格　不会被动">全角→半角（Ｓｏｒｒｙ → Sorry）</button>
      <button class="wide" data-run="replaceCornerQuotes" title="「」→“”，『』→‘’；含嵌套引号一起转换">直角引号换弯引号（「」→“”，『』→‘’）</button>
    </div>
  </div>

  <div class="section">
    <div class="section-title">章节列表</div>
    <div class="list-head">
      <span class="list-title">全书</span>
      <span class="list-count" id="chCount"></span>
      <input class="search" id="search" type="text" placeholder="搜索章节…">
      <button class="tiny" data-action="locate">定位</button>
    </div>
    <div id="chapters"><div class="empty">加载中…</div></div>
  </div>

</div>

<div id="tab-scrape" class="tabpage" hidden>

  <div class="section">
    <div class="section-title">cool18 书屋</div>
    <div class="meta-line" id="cool18Meta">输出目录加载中…</div>
    <textarea id="cool18Input" class="ta" rows="3"
      placeholder="粘贴帖子链接或帖子 ID，每行一个&#10;单个链接 = 自动跟随章节链接爬全本；多个 = 按列表顺序抓取"></textarea>
    <div class="preview" id="cool18Preview">（还没识别到链接）</div>
    <div class="grid">
      <button class="primary" data-cool18-deep="true">爬全本</button>
      <button data-cool18-deep="false">按列表批量</button>
      <button data-host="cool18GrabFile" title="解析当前编辑文件里的 cool18 链接/帖子 ID">抓当前文件链接</button>
      <button data-run="cool18Search" title="输入关键词站内搜索">搜索</button>
      <button data-run="cool18OpenOutput" title="打开 cool18 输出目录">输出目录</button>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Pixiv 小说 <span class="chip" id="cookieChip">Cookie …</span></div>
    <div class="meta-line" id="pixivMeta">输出目录加载中…</div>
    <textarea id="pixivInput" class="ta" rows="3"
      placeholder="粘贴小说 / 系列 / 作者页链接或作品 ID，可多行多个"></textarea>
    <div class="preview" id="pixivPreview">（还没识别到链接）</div>
    <label class="force-row" title="勾选后点「开始抓取」：先删除该系列的旧文件与抓取记录，再从头重新下载（用于文件删了仍提示已存在的情况）">
      <input type="checkbox" id="forceGrab">
      <span>强制重抓（清除旧文件与记录）</span>
    </label>
    <div class="grid">
      <button class="primary" data-pixiv-grab>开始抓取</button>
      <button data-host="pixivGrabFile">抓当前文件链接</button>
      <button data-run="pixivGrabUser">作者全量…</button>
      <button data-run="pixivUpdate">增量更新</button>
      <button data-run="pixivSetCookie">Cookie…</button>
      <button data-run="pixivOpenOutput">输出目录</button>
    </div>
  </div>

  <div class="section">
    <div class="list-head">
      <span class="list-title">已抓系列</span>
      <span class="list-count" id="seriesCount"></span>
      <button class="tiny" data-run="showScrapeLog" title="小说工具箱: 显示抓取运行日志">日志</button>
    </div>
    <div id="series" class="mini-list"><div class="empty">加载中…</div></div>
  </div>

  <div class="taskbar glass">
    <span id="taskDot" class="dot"></span>
    <span id="taskText">空闲</span>
    <button class="tiny" id="cancelBtn" data-host="pixivCancel" title="取消当前抓取任务" hidden>取消</button>
    <button class="tiny" data-run="showHistory" title="小说工具箱: 查看抓取历史">历史</button>
  </div>

</div>

<script nonce="${nonce}">
${script}
</script>
</body>
</html>`;
}

module.exports = { buildPanelHtml };
