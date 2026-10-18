'use strict';

// 扩展入口：只负责依赖装配、命令模块注册、编辑器事件接线。
// 具体命令按领域拆分到 src/commands/，共享编辑器工具在 src/core/editor.js。
const vscode = require('vscode');
const { Checker } = require('./src/service/checker');
const { PanelManager } = require('./src/ui/panel');
const { ScrapeManager } = require('./src/service/scrape');
const { registerNavigationCommands } = require('./src/commands/navigation');
const { registerOrganizeCommands } = require('./src/commands/organize');
const { registerEncodingCommands, applyEncodingSettings } = require('./src/commands/encoding');
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

  registerNavigationCommands({ reg, panel, checker, cfg });
  registerOrganizeCommands({ reg, panel, checker, cfg });
  registerEncodingCommands({ reg, panel, scrape });
  registerFileCommands({ reg, panel, checker });
  registerBatchCommands({ reg, scrape, cfg });
  registerScrapeCommands({ reg, panel, scrape });

  reg('panel', () => panel.reveal());

  // ── 编辑器事件 ──
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((d) => checker.checkDocument(d)),
    vscode.workspace.onDidCloseTextDocument((d) => checker.forget(d)),
    vscode.workspace.onDidChangeTextDocument((e) => {
      // 小文件每次改动立即复查；大文件防抖（行数阈值 8000 ≈ 320KB+ 文本，避免每键全量扫描卡顿）
      if (e.document.lineCount <= 8000) {
        checker.checkDocument(e.document);
      } else {
        checker.schedule(e.document);
      }
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
      if (e) {
        panel.lastEditor = e;
        checker.checkDocument(e.document);
      }
      checker.refreshStatusBar();
      panel.scheduleUpdate();
    }),
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (e.selections && e.selections.length) {
        panel.onCursor(e.selections[0].active.line);
      }
    })
  );

  if (vscode.window.activeTextEditor) {
    panel.lastEditor = vscode.window.activeTextEditor;
    checker.checkDocument(vscode.window.activeTextEditor.document);
  }
  checker.refreshStatusBar();

  // 一次性引导: 中文编码自动识别（GB2312/GBK 文件打开乱码的根治开关）
  (async () => {
    try {
      if (context.globalState.get('novelToolkit.encodingSetupDone')) {
        return;
      }
      const f = vscode.workspace.getConfiguration('files');
      const candidates = f.get('candidateGuessEncodings', []);
      if (f.get('autoGuessEncoding', false) && Array.isArray(candidates) && candidates.includes('gb18030')) {
        context.globalState.update('novelToolkit.encodingSetupDone', true);
        return;
      }
      const pick = await vscode.window.showWarningMessage(
        '小说工具箱：检测到未开启中文编码自动识别——GB2312/GBK 编码的 txt 打开会乱码。一键开启？（全局设置，可随时关闭）',
        '一键开启（推荐）', '暂不'
      );
      if (pick === '一键开启（推荐）') {
        await applyEncodingSettings();
        vscode.window.showInformationMessage('已开启编码自动识别：GB2312/GBK/GB18030/Big5/UTF-16 编码的 txt 将自动正确显示');
      }
      context.globalState.update('novelToolkit.encodingSetupDone', true);
    } catch (e) { /* 引导失败不影响功能 */ }
  })();
}

function deactivate() {}

module.exports = { activate, deactivate };
