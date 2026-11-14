'use strict';

// 文件命令：重命名当前文件
const vscode = require('vscode');
const path = require('path');
const { noDoc } = require('../core/editor');

function registerFileCommands({ reg, panel, checker }) {
  reg('renameFile', async () => {
    const editor = panel.editor();
    if (!editor) {
      return noDoc();
    }
    const doc = editor.document;
    if (doc.uri.scheme !== 'file') {
      return vscode.window.showInformationMessage(
        '当前是未保存的新文件：先 Ctrl+S 保存为本地文件，再点文件名重命名');
    }
    if (doc.isDirty) {
      return vscode.window.showWarningMessage('文件有未保存的修改，请先 Ctrl+S 保存，再重命名');
    }
    const oldPath = doc.uri.fsPath;
    const dir = path.dirname(oldPath);
    const oldName = path.basename(oldPath);
    const ext = path.extname(oldName);
    const newName = await vscode.window.showInputBox({
      prompt: '输入新的文件名（同名文件会被拒绝；漏写扩展名会自动补上）',
      value: oldName,
      ignoreFocusOut: true,
    });
    if (newName === undefined || !newName.trim() || newName.trim() === oldName) {
      return;
    }
    let clean = newName.trim();
    if (!clean.toLowerCase().endsWith(ext.toLowerCase())) {
      clean += ext;
    }
    const stem = clean.slice(0, clean.length - ext.length);
    if (/[\x00-\x1f]/.test(clean) || /[. ]$/.test(clean) ||
        /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i.test(stem)) {
      return vscode.window.showErrorMessage('文件名含非法字符/Windows 保留名（CON、NUL 等），或以点/空格结尾');
    }
    if (/[\\/:*?"<>|]/.test(clean) || path.basename(clean) !== clean || path.dirname(path.resolve(dir, clean)) !== path.resolve(dir)) {
      return vscode.window.showErrorMessage('请输入文件名，不能包含目录或路径分隔符');
    }
    const newUri = vscode.Uri.file(path.join(dir, clean));
    try {
      await vscode.workspace.fs.rename(doc.uri, newUri, { overwrite: false });
    } catch (e) {
      return vscode.window.showErrorMessage('重命名失败：' + (e.message || e) + '（同名文件已存在？）');
    }
    checker.moveState(doc.uri, newUri);
    const newDoc = await vscode.workspace.openTextDocument(newUri);
    const shown = await vscode.window.showTextDocument(newDoc, { viewColumn: editor.viewColumn, preserveFocus: true });
    panel.lastEditor = shown;
    panel.scheduleUpdate();
    vscode.window.showInformationMessage('已重命名为：' + clean);
  });
}

module.exports = { registerFileCommands };
