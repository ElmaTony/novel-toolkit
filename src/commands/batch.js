'use strict';

// 批量命令：文件夹批量整理 / 批量转码
const vscode = require('vscode');
const path = require('path');
const { BatchProcessor } = require('../service/batch');

function pickFolder(defaultPath) {
  return vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: '选择文件夹',
    defaultUri: defaultPath ? vscode.Uri.file(defaultPath) : undefined,
  });
}

function summarizeBatch(kind, r) {
  const lines = [kind + '完成：共 ' + r.total + ' 个 txt'];
  if (kind === '批量整理') {
    lines.push('有改动 ' + r.changed + ' 个、已规范 ' + r.unchanged + ' 个');
  } else {
    lines.push('转码 ' + r.converted + ' 个、已是 UTF-8 ' + r.already + ' 个');
  }
  if (r.errors.length) lines.push('出错 ' + r.errors.length + ' 个');
  if (r.cancelled) lines.push('（已取消）');
  return lines.join('，');
}

function registerBatchCommands({ reg, scrape, cfg }) {
  const batch = new BatchProcessor();

  reg('batchProcess', async () => {
    const picks = await pickFolder(scrape.cool18OutputRoot());
    if (!picks || !picks.length) return;
    const folder = picks[0].fsPath;
    const backup = cfg().get('batchBackup', true);
    let r = null;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: '批量整理（合并换行→贴左→缩进）', cancellable: true },
      async (progress, token) => {
        r = await batch.processFolder(folder, {
          backup,
          signal: token,
          indentStartsParagraph: cfg().get('indentStartsParagraph', true),
          smartParagraphs: cfg().get('smartParagraphs', true),
          keepBlankLines: cfg().get('keepBlankLines', true),
          indentString: cfg().get('indentString', '　　'),
          skipChapterTitles: cfg().get('indentSkipChapterTitles', false),
          normalizeExisting: cfg().get('indentNormalizeExisting', true),
          chapterPattern: cfg().get('chapterPattern'),
          onProgress: (file, res) => progress.report({ message: path.basename(file) + ' → ' + (res.changed ? '已整理' : '无改动') }),
        });
      }
    );
    scrape.log('批量整理: ' + summarizeBatch('批量整理', r) + ' → ' + folder);
    const pick = await vscode.window.showInformationMessage(
      summarizeBatch('批量整理', r), '打开文件夹', '查看日志');
    if (pick === '打开文件夹') scrape.openOutput('cool18');
    if (pick === '查看日志') scrape.showLog();
  });

  reg('batchConvert', async () => {
    const picks = await pickFolder(scrape.cool18OutputRoot());
    if (!picks || !picks.length) return;
    const folder = picks[0].fsPath;
    const backup = cfg().get('batchBackup', true);
    let r = null;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: '批量转码为 UTF-8', cancellable: true },
      async (progress, token) => {
        r = await batch.convertFolder(folder, {
          backup,
          signal: token,
          onProgress: (file, encoding) => progress.report({ message: path.basename(file) + ' ← ' + encoding }),
        });
      }
    );
    scrape.log('批量转码: ' + summarizeBatch('批量转码', r) + ' → ' + folder);
    const pick = await vscode.window.showInformationMessage(
      summarizeBatch('批量转码', r), '查看日志');
    if (pick === '查看日志') scrape.showLog();
  });
}

module.exports = { registerBatchCommands };
