'use strict';

// 扩展入口：只负责依赖装配、命令模块注册、编辑器事件接线。
// 具体命令按领域拆分到 src/commands/，共享编辑器工具在 src/core/editor.js。
const vscode = require('vscode');
const { Checker } = require('./src/service/checker');
const { PanelManager } = require('./src/ui/panel');
const { ScrapeManager } = require('./src/service/scrape');
const { registerNavigationCommands } = require('./src/commands/navigation');
const { registerOrganizeCommands, disposeOrganize } = require('./src/commands/organize');
const { isLargeDocument } = require('./src/engine/analysis-worker');
const { isDocEditor } = require('./src/core/doc');
const { registerFileCommands } = require('./src/commands/files');
const { registerBatchCommands } = require('./src/commands/batch');
const { registerScrapeCommands } = require('./src/commands/scrape');

function activate(context) {
  const cfg = () => vscode.workspace.getConfiguration('novelToolkit');

  const checker = new Checker(context);
  const scrape = new ScrapeManager(context);
  const panel = new PanelManager(context, checker, scrape);
  checker.onStateChange = () => panel.scheduleUpdate();

  const reg = (name, fn) =>
    context.subscriptions.push(vscode.commands.registerCommand('novelToolkit.' + name, fn));

  registerNavigationCommands({ reg, panel, checker });
  registerOrganizeCommands({ reg, panel, checker, cfg });
  context.subscriptions.push({ dispose: disposeOrganize });
  registerFileCommands({ reg, panel, checker });
  registerBatchCommands({ reg, scrape, cfg });
  registerScrapeCommands({ reg, panel, scrape });

  reg('panel', () => panel.reveal());

  // ── 编辑器事件 ──
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('novelToolkit')) return;
      checker.reset();
      for (const doc of vscode.workspace.textDocuments) checker.checkDocument(doc, true);
      panel.chapterCache = new WeakMap();
      panel.scheduleUpdate();
      panel.postScrapeState();
    }),
    vscode.workspace.onDidOpenTextDocument((d) => checker.checkDocument(d)),
    vscode.workspace.onDidCloseTextDocument((d) => checker.forget(d)),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (!e || !e.document) return;
      const scheme = e.document.uri && e.document.uri.scheme;
      if (scheme && scheme !== 'file' && scheme !== 'untitled') return;
      if (Array.isArray(e.contentChanges) && e.contentChanges.length === 0) return;
      // 小文件 100ms 轻量防抖（避开输入法连续组词过程），大文件 250ms 防抖
      checker.schedule(e.document, isLargeDocument(e.document) ? 250 : 100);
      panel.scheduleUpdate();
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (cfg().get('silenceAfterSave', true)) {
        checker.silence(doc);
      } else {
        checker.checkDocument(doc, true);
      }
      panel.scheduleUpdate();
    }),
    vscode.window.onDidChangeActiveTextEditor((e) => {
      if (isDocEditor(e)) {
        panel.lastEditor = e;
        checker.checkDocument(e.document);
      }
      checker.refreshStatusBar();
      panel.scheduleUpdate();
    }),
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (e.textEditor === panel.editor() && e.selections && e.selections.length) {
        panel.onCursor(e.selections[0].active.line);
      }
    })
  );

  if (isDocEditor(vscode.window.activeTextEditor)) {
    panel.lastEditor = vscode.window.activeTextEditor;
    checker.checkDocument(vscode.window.activeTextEditor.document);
  }
  checker.refreshStatusBar();

}

function deactivate() {}

module.exports = { activate, deactivate };
