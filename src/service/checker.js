'use strict';

const vscode = require('vscode');
const transforms = require('../engine/transforms');

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
    const lines = [];
    for (let i = 0; i < doc.lineCount; i++) {
      lines.push(doc.lineAt(i).text);
    }
    const r = transforms.scanLines(lines, {
      ignoreBlankLines: c.get('ignoreBlankLines', true),
      shortLineCheck: c.get('shortLineCheck', true),
      shortLineMaxChars: c.get('shortLineMaxChars', 2),
      quotePairCheck: c.get('quotePairCheck', true)
    });
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
      const d = new vscode.Diagnostic(
        new vscode.Range(q.line, 0, q.line, lines[q.line].length),
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
    this.fullScan(doc);
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

  silence(doc) {
    this.silenced.add(doc.uri.toString());
    this.diags.delete(doc.uri);
    this.notify();
  }

  // 文档关闭后彻底清理：诊断残留、静音标记、待触发的防抖定时器
  forget(doc) {
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
      short: dl.filter((d) => d.code === 'short-line').length,
      quote: dl.filter((d) => d.code === 'quote-pair').length,
      silenced: this.silenced.has(uri.toString())
    };
  }

  // 文件重命名时迁移检查状态（警告清单 + 静音标记），内容未变则状态不变
  moveState(oldUri, newUri) {
    const wasSilenced = this.silenced.has(oldUri.toString());
    this.silenced.delete(oldUri.toString());
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
    if (!editor) {
      this.statusBar.hide();
      return;
    }
    if (this.cfg().get('excludedLanguages', []).includes(editor.document.languageId)) {
      this.statusBar.text = '贴左:—';
      this.statusBar.tooltip = '该文件类型已排除检查';
      this.statusBar.show();
      return;
    }
    const c = this.counts(editor.document.uri);
    if (c.silenced) {
      this.statusBar.text = '贴左:已静音';
      this.statusBar.tooltip = '已保存/已缩进，检查暂停中；Alt+F8 重新检查';
      this.statusBar.show();
      return;
    }
    if (c.ws === 0 && c.short === 0) {
      this.statusBar.text = '贴左:✓';
      this.statusBar.tooltip = '当前文件所有行都贴最左侧（点击重新检查）';
    } else {
      this.statusBar.text = '贴左:' + c.ws + (c.short > 0 ? ' 残留:' + c.short : '');
      this.statusBar.tooltip = '当前文件有 ' + c.ws + ' 处行首空白' +
        (c.short > 0 ? '、' + c.short + ' 处疑似标点短行' : '') + '（点击重新检查）';
    }
    this.statusBar.show();
  }
}

module.exports = { Checker, SOURCE };
