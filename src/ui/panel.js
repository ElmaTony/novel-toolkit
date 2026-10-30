'use strict';

const vscode = require('vscode');
const chapters = require('../engine/chapters');
const { buildPanelHtml } = require('./panel-html');
const { parseCool18Entries, parsePixivInput } = require('../service/scrape');
const { RUNNABLE, HOST_COMMANDS } = require('./messages');

// RUNNABLE / HOST_COMMANDS 集中定义在 ./messages

// 工具面板（Webview）: 整理标签（按钮+章节列表）+ 抓取标签（cool18/Pixiv）
class PanelManager {
  constructor(context, checker, scrape) {
    this.context = context;
    this.checker = checker;
    this.scrape = scrape;
    this.panel = null;
    this.lastEditor = null;
    this.updateTimer = null;
    this.cursorTimer = null;
    this.cursorLine = -1;
    scrape.onTask = (running, text) => this.postTask(running, text);

    const btn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    btn.name = '小说工具箱面板';
    btn.text = '$(book) 小说工具箱';
    btn.tooltip = '打开小说工具箱面板（整理 + 抓取 + 章节列表）';
    btn.command = 'novelToolkit.panel';
    btn.show();
    context.subscriptions.push(btn);

    this.cancelItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
    this.cancelItem.name = '小说工具箱取消任务';
    this.cancelItem.text = '$(sync~spin) 抓取中…';
    this.cancelItem.tooltip = '点击取消当前抓取任务';
    this.cancelItem.command = 'novelToolkit.scrapeCancel';
    this.cancelItem.hide();
    context.subscriptions.push(this.cancelItem);
  }

  // 面板按钮始终作用于最近编辑的文件
  editor() {
    const editor = vscode.window.activeTextEditor || this.lastEditor;
    return editor && !editor.document.isClosed ? editor : null;
  }

  reveal() {
    if (this.panel) {
      this.panel.reveal();
      this.update();
      this.postScrapeState();
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      'novelToolkitPanel',
      '小说工具箱',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    this.panel.webview.html = buildPanelHtml();
    this.panel.onDidDispose(() => {
      this.panel = null;
    }, null, this.context.subscriptions);
    this.panel.webview.onDidReceiveMessage((msg) => this.handle(msg));
    this.update();
    this.postScrapeState();
  }

  post(msg) {
    if (this.panel) {
      this.panel.webview.postMessage(msg);
    }
  }

  postTask(running, text) {
    this.post({ type: 'task', running, text: text || '' });
    if (running) {
      const t = text || '抓取中…';
      this.cancelItem.text = '$(sync~spin) 抓取中：' + (t.length > 20 ? t.slice(0, 20) + '…' : t) + '（取消）';
      this.cancelItem.tooltip = '点击取消当前任务：' + t;
      this.cancelItem.show();
    } else {
      this.cancelItem.hide();
    }
  }

  postScrapeState() {
    if (!this.panel) {
      return;
    }
    const st = this.scrape.snapshot();
    this.scrape.pixivCookie().then((c) => {
      st.busy = this.scrape.busy;
      st.taskText = this.scrape.taskText || '';
      st.cookieSet = !!c;
      st.cookieLen = c.length;
      this.post({ type: 'scrapeState', state: st });
    }, () => {
      st.busy = this.scrape.busy;
      st.taskText = this.scrape.taskText || '';
      st.cookieSet = false;
      this.post({ type: 'scrapeState', state: st });
    });
  }

  async handle(msg) {
    if (!msg || typeof msg.command !== 'string') {
      return;
    }
    if (msg.command !== 'run' && !HOST_COMMANDS.includes(msg.command)) {
      return; // 未定义的消息一律忽略（协议见 ./messages）
    }
    if (msg.command === 'run' && RUNNABLE.includes(msg.name)) {
      vscode.commands.executeCommand('novelToolkit.' + msg.name);
      return;
    }
    if (msg.command === 'refresh') {
      this.update();
      this.postScrapeState();
      return;
    }
    if (msg.command === 'chapter' && Number.isInteger(msg.line) && msg.line >= 0) {
      this.jump(msg.line);
      return;
    }
    if (msg.command === 'openSettings') {
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:localtools.novel-toolkit');
      return;
    }
    if (msg.command === 'scrapePreview') {
      const kind = msg.kind;
      const items = kind === 'cool18'
        ? parseCool18Entries(String(msg.text || ''))
        : parsePixivInput(String(msg.text || ''));
      let detail;
      if (kind === 'cool18') {
        detail = items.length
          ? '识别到 ' + items.length + ' 个帖子' + (items.length === 1 ? '（将自动跟随章节链接爬全本）' : '（按列表顺序抓取）')
          : '（粘贴 cool18 链接或帖子 ID，每行一个）';
      } else {
        const c = { novel: 0, series: 0, user: 0 };
        items.forEach((t) => { c[t.type]++; });
        const parts = [];
        if (c.novel) parts.push('单篇 ' + c.novel);
        if (c.series) parts.push('系列 ' + c.series);
        if (c.user) parts.push('作者 ' + c.user);
        detail = items.length ? '识别到：' + parts.join(' · ') : '（支持 novel/series/users 链接和裸 ID）';
      }
      this.post({ type: 'scrapePreview', kind, text: detail });
      return;
    }
    if (msg.command === 'cool18Grab') {
      const entries = parseCool18Entries(String(msg.text || ''));
      if (this.scrape.busy) {
        this.postTask(false, '已有抓取任务进行中，请等它完成或先取消');
        return;
      }
      if (!entries.length) {
        this.postTask(false, '没有识别到 cool18 帖子链接或 ID（每行一个）');
        return;
      }
      await this.scrape.cool18(entries, {
        deep: !!msg.deep || entries.length === 1,
        reporter: {
          report: (t) => this.postTask(true, t),
          finish: (_r, m) => this.postTask(false, m || ''),
        },
      });
      this.postScrapeState();
      return;
    }
    if (msg.command === 'cool18GrabFile') {
      const ed = this.editor();
      if (!ed) {
        this.postTask(false, '先打开一个含 cool18 链接的文件再点（每行一个链接或帖子 ID）');
        return;
      }
      const text = !ed.selection.isEmpty ? ed.document.getText(ed.selection) : ed.document.getText();
      const entries = parseCool18Entries(text);
      if (this.scrape.busy) {
        this.postTask(false, '已有抓取任务进行中，请等它完成或先取消');
        return;
      }
      if (!entries.length) {
        this.postTask(false, '当前文件里没有识别到 cool18 链接或帖子 ID');
        return;
      }
      await this.scrape.cool18(entries, {
        deep: false,
        reporter: {
          report: (t) => this.postTask(true, t),
          finish: (_r, m) => this.postTask(false, m || ''),
        },
      });
      this.postScrapeState();
      return;
    }
    if (msg.command === 'pixivGrab') {
      const targets = parsePixivInput(String(msg.text || ''));
      if (this.scrape.busy) {
        this.postTask(false, '已有抓取任务进行中，请等它完成或先取消');
        return;
      }
      const reporter = {
        report: (t) => this.postTask(true, t),
        finish: (_r, m) => this.postTask(false, m || ''),
      };
      const r = await this.scrape.executePixiv(targets, reporter, undefined, { force: !!msg.force });
      if (r && r.authError) {
        this.postTask(false, 'Cookie 缺失或已失效 —— 点「Cookie…」设置后重试');
        vscode.commands.executeCommand('novelToolkit.pixivSetCookie');
      }
      this.postScrapeState();
      return;
    }
    if (msg.command === 'pixivGrabFile') {
      const ed = this.editor();
      if (!ed) {
        this.postTask(false, '先打开一个含 Pixiv 链接的 txt 文件再点');
        return;
      }
      const text = !ed.selection.isEmpty ? ed.document.getText(ed.selection) : ed.document.getText();
      const targets = parsePixivInput(text);
      if (this.scrape.busy) {
        this.postTask(false, '已有抓取任务进行中，请等它完成或先取消');
        return;
      }
      const reporter = {
        report: (t) => this.postTask(true, t),
        finish: (_r, m) => this.postTask(false, m || ''),
      };
      const r = await this.scrape.executePixiv(targets, reporter, undefined, { force: !!msg.force });
      if (r && r.authError) {
        this.postTask(false, 'Cookie 缺失或已失效 —— 点「Cookie…」设置后重试');
        vscode.commands.executeCommand('novelToolkit.pixivSetCookie');
      }
      this.postScrapeState();
      return;
    }
    if (msg.command === 'pixivCancel') {
      if (!this.scrape.cancel()) {
        this.postTask(false, '当前没有正在运行的抓取');
      }
      return;
    }
    if (msg.command === 'setCookie') {
      vscode.commands.executeCommand('novelToolkit.pixivSetCookie');
      return;
    }
    if (msg.command === 'renameFile') {
      vscode.commands.executeCommand('novelToolkit.renameFile');
      return;
    }
  }

  jump(line) {
    const ed = this.editor();
    if (!ed || line < 0 || line >= ed.document.lineCount) {
      return;
    }
    const start = new vscode.Position(line, 0);
    const end = new vscode.Position(line, ed.document.lineAt(line).firstNonWhitespaceCharacterIndex);
    vscode.window.showTextDocument(ed.document, {
      viewColumn: ed.viewColumn,
      preserveFocus: true
    }).then((shown) => {
      shown.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      shown.selection = new vscode.Selection(start, end);
    }, () => {});
  }

  update() {
    if (!this.panel) {
      return;
    }
    const ed = this.editor();
    if (!ed) {
      this.post({
        type: 'update', fileName: '（没有打开的文件）', chapters: [],
        wsCount: -1, midCount: -1, shortCount: -1, quoteCount: -1,
        silenced: false, hasDocument: false, dirty: false
      });
      return;
    }
    const doc = ed.document;
    this.cursorLine = ed.selection.active.line;
    const cfg = vscode.workspace.getConfiguration('novelToolkit');
    const lines = [];
    for (let i = 0; i < doc.lineCount; i++) {
      lines.push(doc.lineAt(i).text);
    }
    const chs = chapters.chapterEntries(lines, cfg.get('chapterPattern')).map((e) => ({
      line: e.line,
      title: e.title,
      kind: e.kind
    }));
    let fileName;
    if (doc.isUntitled) {
      fileName = '未保存文件';
    } else {
      fileName = doc.fileName.replace(/^.*[\\/]/, '');
    }
    let wsCount = -1;
    let midCount = -1;
    let shortCount = -1;
    let quoteCount = -1;
    let silencedFlag = false;
    if (this.checker.appliesTo(doc)) {
      const c = this.checker.counts(doc.uri);
      wsCount = c.ws;
      midCount = c.mid;
      shortCount = c.short;
      quoteCount = c.quote;
      silencedFlag = c.silenced;
    }
    this.post({
      type: 'update',
      fileName: fileName,
      chapters: chs,
      wsCount: wsCount,
      midCount: midCount,
      shortCount: shortCount,
      quoteCount: quoteCount,
      silenced: silencedFlag,
      hasDocument: true,
      dirty: doc.isDirty
    });
    this.postCursor();
  }

  onCursor(line) {
    this.cursorLine = line;
    if (!this.panel) {
      return;
    }
    if (this.cursorTimer) {
      clearTimeout(this.cursorTimer);
    }
    this.cursorTimer = setTimeout(() => {
      this.cursorTimer = null;
      this.postCursor();
    }, 150);
  }

  postCursor() {
    if (this.panel) {
      this.panel.webview.postMessage({ type: 'cursor', line: this.cursorLine });
    }
  }

  scheduleUpdate() {
    if (!this.panel) {
      return;
    }
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    this.updateTimer = setTimeout(() => {
      this.updateTimer = null;
      this.update();
      this.postScrapeState();
    }, 300);
  }
}

module.exports = { PanelManager };
