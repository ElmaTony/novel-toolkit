'use strict';

// 批量命令：文件夹批量整理
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

function summarizeBatch(r) {
  const lines = ['批量整理完成：共 ' + r.total + ' 个 txt'];
  lines.push('有改动 ' + r.changed + ' 个、已规范 ' + r.unchanged + ' 个');
  if (r.errors.length) lines.push('出错 ' + r.errors.length + ' 个');
  if (r.needsReview && r.needsReview.length) lines.push('解码存疑已跳过 ' + r.needsReview.length + ' 个');
  if (r.cancelled) lines.push('（已取消）');
  return lines.join('，');
}

function registerBatchCommands({ reg, scrape, cfg }) {
  const batch = new BatchProcessor();
  let running = false;
  const runBatch = async (action) => {
    if (running) {
      vscode.window.showInformationMessage('已有批量任务进行中，请等它完成或先取消');
      return;
    }
    running = true;
    try {
      return await action();
    } finally {
      running = false;
    }
  };

  reg('batchProcess', async () => {
    const result = await runBatch(async () => {
      const picks = await pickFolder(scrape.cool18OutputRoot());
      if (!picks || !picks.length) return;
      const folder = picks[0].fsPath;
      const backup = cfg().get('batchBackup', true);
      const r = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '批量整理（合并换行→贴左→缩进）', cancellable: true },
        (progress, token) => batch.processFolder(folder, {
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
        })
      );
      return { folder, r };
    });
    if (!result) return;
    const { folder, r } = result;
    scrape.log(summarizeBatch(r) + ' → ' + folder);
    for (const error of r.errors) scrape.log(error);
    for (const file of r.needsReview || []) scrape.log('解码存疑，原文保留：' + file);
    const pick = await vscode.window.showInformationMessage(
      summarizeBatch(r), '打开文件夹', '查看日志');
    if (pick === '打开文件夹') scrape.openOutputDir(folder);
    if (pick === '查看日志') scrape.showLog();
  });

}

module.exports = { registerBatchCommands };
