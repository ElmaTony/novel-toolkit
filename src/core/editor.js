'use strict';

// 编辑器共享工具：文档行读取、EOL、整篇替换、问题行跳转
// 命令模块只依赖这里，不直接重复实现这些底层操作。

const vscode = require('vscode');

function docLines(doc) {
  const out = new Array(doc.lineCount);
  for (let i = 0; i < doc.lineCount; i++) {
    out[i] = doc.lineAt(i).text;
  }
  return out;
}

const eolOf = (doc) => (doc.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n');

async function applyLines(editor, newLines, successMsg) {
  const doc = editor.document;
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    doc.uri,
    new vscode.Range(0, 0, doc.lineCount - 1, doc.lineAt(doc.lineCount - 1).text.length),
    newLines.join(eolOf(doc))
  );
  const ok = await vscode.workspace.applyEdit(edit);
  if (ok) {
    vscode.window.showInformationMessage(successMsg);
  } else {
    vscode.window.showErrorMessage('修改失败，请重试');
  }
  return ok;
}

function jumpToLine(editor, lines, target, label) {
  const start = new vscode.Position(target, 0);
  const end = new vscode.Position(target, editor.document.lineAt(target).firstNonWhitespaceCharacterIndex);
  editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  editor.selection = new vscode.Selection(start, end);
  vscode.window.setStatusBarMessage(
    (label || '行首空白') + '：第 ' + (target + 1) + ' 行，第 ' + (lines.indexOf(target) + 1) + ' / ' + lines.length + ' 处',
    5000
  );
}

const noDoc = () => vscode.window.showInformationMessage('当前没有打开的文件');

module.exports = { docLines, eolOf, applyLines, jumpToLine, noDoc };
