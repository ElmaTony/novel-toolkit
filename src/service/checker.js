'use strict';

const vscode = require('vscode');
const transforms = require('../engine/transforms');
const { AnalysisWorker, isLargeDocument } = require('../engine/analysis-worker');

const SOURCE = 'NovelToolkit';

// 贴左 + 标点短行检查引擎：诊断集合、按文件静音、防抖、状态栏
class Checker {
  constructor(context) {
    this.cfg = () => vscode.workspace.getConfiguration('novelToolkit');
    this.diags = vscode.languages.createDiagnosticCollection(SOURCE);
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBar.name = '小说工具箱';
    this.statusBar.command = 'novelToolkit.check';
    this.silenced = new Set();
    this.timers = new Map();
    this.analysis = new AnalysisWorker();
    this.scanCache = new WeakMap();
    this.scanJobs = new WeakMap();
    this.scanEpoch = 0;
    this.disposed = false;
    context.subscriptions.push({ dispose: () => { this.disposed = true; this.reset(); this.analysis.dispose(); } });
    this.onStateChange = null; // 由装配层设置，扫描/静音后回调
    context.subscriptions.push(this.diags, this.statusBar);
  }

  appliesTo(doc) {
    const c = this.cfg();
    const schemeOk = doc.uri.scheme === 'file' || doc.uri.scheme === 'untitled';
    return schemeOk &&
      c.get('enabled', true) &&
      !c.get('excludedLanguages', []).includes(doc.languageId);
  }

  fullScan(doc) {
    if (!this.appliesTo(doc)) {
      this.diags.delete(doc.uri);
      this.silenced.delete(doc.uri.toString());
      this.notify();
      return undefined;
    }
    this.silenced.delete(doc.uri.toString());
    const c = this.cfg();
    const options = {
      ignoreBlankLines: c.get('ignoreBlankLines', true),
      shortLineCheck: c.get('shortLineCheck', true),
      shortLineMaxChars: c.get('shortLineMaxChars', 2),
      quotePairCheck: c.get('quotePairCheck', true),
      chapterPattern: c.get('chapterPattern'),
    };
    const signature = JSON.stringify(options);
    const cached = this.scanCache.get(doc);
    const version = doc.version;
    const publish = (lines, r) => {
      if (this.disposed || doc.isClosed || doc.version !== version || !this.appliesTo(doc)) return;
      this.scanCache.set(doc, { version, signature, lines, result: r });
      return this.publish(doc, lines, r);
    };
    if (cached && version !== undefined && cached.version === version && cached.signature === signature) return publish(cached.lines, cached.result);
    if (!isLargeDocument(doc)) {
      const lines = [];
      for (let i = 0; i < doc.lineCount; i++) lines.push(doc.lineAt(i).text);
      return publish(lines, transforms.scanLines(lines, options));
    }
    const text = typeof doc.getText === 'function'
      ? doc.getText()
      : Array.from({ length: doc.lineCount }, (_, i) => doc.lineAt(i).text).join('\n');
    const job = {};
    const epoch = this.scanEpoch;
    this.scanJobs.set(doc, job);
    return this.analysis.run('scan', { text, options }).then(result => {
      if (this.scanEpoch !== epoch || this.scanJobs.get(doc) !== job || this.silenced.has(doc.uri.toString())) return;
      return publish(null, result);
    });
  }

  publish(doc, lines, r) {
    const list = [];
    for (const w of r.ws) {
      const d = new vscode.Diagnostic(
        new vscode.Range(w.line, 0, w.line, w.len),
        '第 ' + (w.line + 1) + ' 行行首有空白（' + w.desc + '），未贴最左侧',
        vscode.DiagnosticSeverity.Warning
      );
      d.source = SOURCE;
      d.code = 'leading-whitespace';
      list.push(d);
    }
    for (const w of r.mid) {
      const d = new vscode.Diagnostic(
        new vscode.Range(w.line, w.col, w.line, w.col + w.len),
        '第 ' + (w.line + 1) + ' 行' + w.desc + '，请删除',
        vscode.DiagnosticSeverity.Warning
      );
      d.source = SOURCE;
      d.code = 'mid-space';
      list.push(d);
    }
    for (const s of r.short) {
      const d = new vscode.Diagnostic(
        new vscode.Range(s.line, s.lead, s.line, s.lead + s.text.length),
        '第 ' + (s.line + 1) + ' 行疑似合并残留的标点短行（' + s.text + '），请检查处理',
        vscode.DiagnosticSeverity.Warning
      );
      d.source = SOURCE;
      d.code = 'short-line';
      list.push(d);
    }
    for (const q of r.quote) {
      const len = lines ? lines[q.line].length : doc.lineAt(q.line).text.length;
      const d = new vscode.Diagnostic(
        new vscode.Range(q.line, 0, q.line, len),
        '第 ' + (q.line + 1) + ' 行引号疑似不配对（' + q.problems + '），请检查处理',
        vscode.DiagnosticSeverity.Warning
      );
      d.source = SOURCE;
      d.code = 'quote-pair';
      list.push(d);
    }
    this.diags.set(doc.uri, list);
    this.notify();
    return {
      ws: r.ws.map((w) => w.line),
      mid: [...new Set(r.mid.map((w) => w.line))],
      short: r.short.map((s) => s.line),
      quote: r.quote.map((q) => q.line)
    };
  }

  checkDocument(doc, force) {
    if (!doc) {
      return;
    }
    if (!force && this.silenced.has(doc.uri.toString())) {
      return;
    }
    const result = this.fullScan(doc);
    if (result && result.catch) result.catch(error => { if (!this.disposed) vscode.window.setStatusBarMessage('检查失败：' + error.message, 5000); });
    return result;
  }

  // 大文件防抖复查
  schedule(doc) {
    const key = doc.uri.toString();
    const old = this.timers.get(key);
    if (old) {
      clearTimeout(old);
    }
    this.timers.set(key, setTimeout(() => {
      this.timers.delete(key);
      this.checkDocument(doc);
    }, 250));
  }

  reset() {
    this.scanEpoch++;
    this.scanCache = new WeakMap();
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.diags.clear();
    this.silenced.clear();
  }

  silence(doc) {
    this.scanJobs.delete(doc);
    const key = doc.uri.toString();
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
    this.silenced.add(key);
    this.diags.delete(doc.uri);
    this.notify();
  }

  // 文档关闭后彻底清理：诊断残留、静音标记、待触发的防抖定时器
  forget(doc) {
    this.scanCache.delete(doc);
    this.scanJobs.delete(doc);
    const key = doc.uri.toString();
    this.diags.delete(doc.uri);
    this.silenced.delete(key);
    const t = this.timers.get(key);
    if (t) {
      clearTimeout(t);
      this.timers.delete(key);
    }
    this.notify();
  }

  counts(uri) {
    const dl = this.diags.get(uri) || [];
    return {
      ws: dl.filter((d) => d.code === 'leading-whitespace').length,
      mid: dl.filter((d) => d.code === 'mid-space').length,
      short: dl.filter((d) => d.code === 'short-line').length,
      quote: dl.filter((d) => d.code === 'quote-pair').length,
      silenced: this.silenced.has(uri.toString())
    };
  }

  // 文件重命名时迁移检查状态（警告清单 + 静音标记），内容未变则状态不变
  moveState(oldUri, newUri) {
    const oldKey = oldUri.toString();
    const timer = this.timers.get(oldKey);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(oldKey);
    }
    const wasSilenced = this.silenced.has(oldKey);
    this.silenced.delete(oldKey);
    const list = this.diags.get(oldUri);
    this.diags.delete(oldUri);
    if (wasSilenced) {
      this.silenced.add(newUri.toString());
    }
    if (list && list.length) {
      this.diags.set(newUri, list);
    }
    this.notify();
  }

  notify() {
    this.refreshStatusBar();
    if (this.onStateChange) {
      this.onStateChange();
    }
  }

  refreshStatusBar() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !editor.document || editor.document.isClosed) {
      this.statusBar.hide();
      return;
    }
    const scheme = editor.document.uri && editor.document.uri.scheme;
    if (scheme && scheme !== 'file' && scheme !== 'untitled') {
      this.statusBar.hide();
      return;
    }
    const c = this.cfg();
    if (!c.get('enabled', true)) {
      this.statusBar.text = '贴左:关';
      this.statusBar.tooltip = '自动检查已关闭（点击手动检查当前文件）';
      this.statusBar.show();
      return;
    }
    if (c.get('excludedLanguages', []).includes(editor.document.languageId)) {
      this.statusBar.text = '贴左:—';
      this.statusBar.tooltip = '该文件类型已排除检查';
      this.statusBar.show();
      return;
    }
    const counts = this.counts(editor.document.uri);
    if (counts.silenced) {
      this.statusBar.text = '贴左:已静音';
      this.statusBar.tooltip = '已保存/已缩进，检查暂停中；Alt+F8 重新检查';
      this.statusBar.show();
      return;
    }
    if (counts.ws === 0 && counts.mid === 0 && counts.short === 0 && counts.quote === 0) {
      this.statusBar.text = '贴左:✓';
      this.statusBar.tooltip = '当前文件无空白、标点短行与引号配对问题（点击重新检查）';
    } else {
      this.statusBar.text = '贴左:' + counts.ws +
        (counts.mid > 0 ? ' 空格:' + counts.mid : '') +
        (counts.short > 0 ? ' 残留:' + counts.short : '') +
        (counts.quote > 0 ? ' 引号:' + counts.quote : '');
      this.statusBar.tooltip = '当前文件有 ' + counts.ws + ' 处行首空白、' + counts.mid + ' 处正文空格' +
        (counts.short > 0 ? '、' + counts.short + ' 处疑似标点短行' : '') +
        (counts.quote > 0 ? '、' + counts.quote + ' 处引号疑似不配对' : '') + '（点击重新检查）';
    }
    this.statusBar.show();
  }
}

module.exports = { Checker, SOURCE };
