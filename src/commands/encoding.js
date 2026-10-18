'use strict';

// 编码命令：检测、转 UTF-8、一键开启自动识别
const vscode = require('vscode');
const fs = require('fs');
const { detectEncoding: detectEncodingOf, decodeToUtf8 } = require('../engine/encoding');
const { noDoc } = require('../core/editor');

const ENC_NAMES = {
  utf8: 'UTF-8',
  utf8bom: 'UTF-8（带 BOM）',
  utf16le: 'UTF-16 LE',
  utf16be: 'UTF-16 BE',
  gb18030: 'GB18030（兼容 GBK/GB2312）',
  big5: 'Big5（繁体中文）',
};

async function applyEncodingSettings() {
  const files = vscode.workspace.getConfiguration('files');
  await files.update('autoGuessEncoding', true, vscode.ConfigurationTarget.Global);
  await files.update('candidateGuessEncodings', [
    'utf8', 'gb18030', 'gbk', 'gb2312', 'big5', 'utf16le', 'utf16be', 'windows1252',
  ], vscode.ConfigurationTarget.Global);
}

function registerEncodingCommands({ reg, panel, scrape }) {
  reg('setupEncoding', async () => {
    scrape.log('编码: 一键开启中文编码自动识别（写入全局设置）');
    await applyEncodingSettings();
    const pick = await vscode.window.showInformationMessage(
      '已开启编码自动识别（全局设置）。注意：已经打开的乱码文件不会自动刷新——现在就对当前文件做检测并重新打开吗？',
      '检测当前文件编码', '知道了'
    );
    if (pick === '检测当前文件编码') {
      vscode.commands.executeCommand('novelToolkit.detectEncoding');
    }
  });

  reg('detectEncoding', async () => {
    const editor = panel.editor();
    if (!editor) {
      return noDoc();
    }
    const doc = editor.document;
    if (doc.uri.scheme !== 'file') {
      return vscode.window.showInformationMessage('请先把文件保存到磁盘（Ctrl+S）再检测编码');
    }
    scrape.log('编码: 检测文件编码 → ' + doc.uri.fsPath);
    const buf = fs.readFileSync(doc.uri.fsPath);
    const enc = detectEncodingOf(buf);
    scrape.log('编码: 检测结果 = ' + (ENC_NAMES[enc] || enc));
    const pick = await vscode.window.showInformationMessage(
      '磁盘上的文件编码检测为：' + (ENC_NAMES[enc] || enc) + '。要怎么处理？',
      '用该编码重新打开', '转为 UTF-8', '不用了'
    );
    if (pick === '用该编码重新打开') {
      scrape.log('编码: 用 ' + enc + ' 重新打开');
      await vscode.commands.executeCommand('workbench.action.files.reopenWithEncoding',
        enc === 'utf8bom' ? 'utf8' : enc);
    } else if (pick === '转为 UTF-8') {
      vscode.commands.executeCommand('novelToolkit.convertToUtf8');
    }
  });

  reg('convertToUtf8', async () => {
    const editor = panel.editor();
    if (!editor) {
      return noDoc();
    }
    const doc = editor.document;
    if (doc.uri.scheme !== 'file') {
      return vscode.window.showInformationMessage('请先把文件保存到磁盘（Ctrl+S）再转码');
    }
    if (doc.isDirty) {
      return vscode.window.showWarningMessage('文件有未保存的修改，请先 Ctrl+S 保存再转码');
    }
    scrape.log('编码: 转码为 UTF-8 → ' + doc.uri.fsPath);
    const buf = fs.readFileSync(doc.uri.fsPath);
    const det = decodeToUtf8(buf);
    if (det.encoding === 'utf8') {
      return vscode.window.showInformationMessage('文件已经是 UTF-8 编码，无需转码');
    }
    const tmpPath = doc.uri.fsPath + '.' + Date.now() + '.utf8.tmp';
    try {
      fs.writeFileSync(tmpPath, det.text, 'utf8');
      fs.renameSync(tmpPath, doc.uri.fsPath);
    } catch (e) {
      try { fs.unlinkSync(tmpPath); } catch (e2) { /* 尽力清理 */ }
      return vscode.window.showErrorMessage('转码失败，原文件未改动：' + (e.message || e));
    }
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('workbench.action.files.revert');
    scrape.log('编码: 已从 ' + det.encoding + ' 转码为 UTF-8 完成');
    vscode.window.showInformationMessage('已从 ' + (ENC_NAMES[det.encoding] || det.encoding) +
      ' 转码为 UTF-8：' + doc.uri.fsPath);
  });
}

module.exports = { registerEncodingCommands, applyEncodingSettings };
