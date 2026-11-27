'use strict';

// 编辑器共享工具：文档行读取、EOL、整篇替换、问题行跳转
// 命令模块只依赖这里，不直接重复实现这些底层操作。

const vscode = require('vscode');
const { isDocEditor } = require('./doc');

const MID_SPACE_ONCE_RE = /[\u3400-\u4DBF\u4E00-\u9FFF]([ \t]+)(?=[\u3400-\u4DBF\u4E00-\u9FFF])/;
const TRAIL_SPACE_ONCE_RE = /[ \t]+$/;

function docLines(doc) {
  const out = new Array(doc.lineCount);
  for (let i = 0; i < doc.lineCount; i++) {
    out[i] = doc.lineAt(i).text;
  }
  return out;
}

function docText(doc) {
  return typeof doc.getText === 'function' ? doc.getText() : docLines(doc).join('\n');
}

const eolOf = (doc) => (doc.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n');

async function applyLines(editor, newLines, successMsg) {
  const doc = editor.document;
  const edit = new vscode.WorkspaceEdit();
  let usedSparse = false;
  if (doc.lineCount === newLines.length && newLines.length >= 200) {
    const changed = [];
    const limit = Math.min(200, Math.floor(newLines.length * 0.2));
    for (let i = 0; i < newLines.length; i++) {
      if (doc.lineAt(i).text !== newLines[i]) {
        changed.push(i);
        if (changed.length > limit) break;
      }
    }
    if (changed.length > 0 && changed.length <= limit) {
      for (const idx of changed) {
        edit.replace(doc.uri, new vscode.Range(idx, 0, idx, doc.lineAt(idx).text.length), newLines[idx]);
      }
      usedSparse = true;
    }
  }
  if (!usedSparse) {
    edit.replace(
      doc.uri,
      new vscode.Range(0, 0, doc.lineCount - 1, doc.lineAt(doc.lineCount - 1).text.length),
      newLines.join(eolOf(doc))
    );
  }
  const ok = await vscode.workspace.applyEdit(edit);
  if (ok) {
    vscode.window.showInformationMessage(successMsg);
  } else {
    vscode.window.showErrorMessage('修改失败，请重试');
  }
  return ok;
}

function jumpToLine(editor, lines, target, label) {
  const lineObj = editor.document.lineAt(target);
  const firstNonWs = lineObj.firstNonWhitespaceCharacterIndex || 0;
  let startCol = 0;
  let endCol = firstNonWs;
  if (typeof lineObj.text === 'string') {
    if (label === '残留短行' || label === '引号配对') {
      startCol = firstNonWs;
      endCol = lineObj.text.trimEnd().length;
    } else if ((label === '空白' || !label) && firstNonWs === 0) {
      const mid = lineObj.text.match(MID_SPACE_ONCE_RE);
      if (mid) {
        startCol = mid.index + 1;
        endCol = startCol + mid[1].length;
      } else {
        const trail = lineObj.text.match(TRAIL_SPACE_ONCE_RE);
        if (trail) {
          startCol = trail.index;
          endCol = startCol + trail[0].length;
        }
      }
    }
  }
  const start = new vscode.Position(target, startCol);
  const end = new vscode.Position(target, endCol);
  editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  editor.selection = new vscode.Selection(start, end);
  vscode.window.setStatusBarMessage(
    (label || '行首空白') + '：第 ' + (target + 1) + ' 行，第 ' + (lines.indexOf(target) + 1) + ' / ' + lines.length + ' 处',
    5000
  );
}

const noDoc = () => vscode.window.showInformationMessage('当前没有打开的文件');

module.exports = { isDocEditor, docLines, docText, eolOf, applyLines, jumpToLine, noDoc };
