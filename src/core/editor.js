'use strict';

// 编辑器共享工具：文档行读取、EOL、整篇替换、问题行跳转
// 命令模块只依赖这里，不直接重复实现这些底层操作。

const vscode = require('vscode');
const { isDocEditor } = require('./doc');
const { firstSpaceIssueRange } = require('../engine/transforms');
const chapters = require('../engine/chapters');

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

function isTargetChapterLine(doc, target) {
  const prev = target > 0 ? doc.lineAt(target - 1).text : '';
  const cur = doc.lineAt(target).text;
  const next = target + 1 < doc.lineCount ? doc.lineAt(target + 1).text : '';
  const slice = target > 0 ? [prev, cur, next] : [cur, next];
  const localIndex = target > 0 ? 1 : 0;
  let pattern;
  try {
    if (vscode.workspace && typeof vscode.workspace.getConfiguration === 'function') {
      pattern = vscode.workspace.getConfiguration('novelToolkit').get('chapterPattern');
    }
  } catch (_) { /* ignore */ }
  return chapters.chapterLines(slice, pattern).includes(localIndex);
}

function jumpToRange(editor, range, index, total, label) {
  const start = new vscode.Position(range.line, range.startCol);
  const end = new vscode.Position(range.line, range.endCol);
  editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  editor.selection = new vscode.Selection(start, end);
  vscode.window.setStatusBarMessage(
    (label || '空白') + '：第 ' + (range.line + 1) + ' 行，第 ' + (index + 1) + ' / ' + total + ' 处',
    5000
  );
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
      const hit = firstSpaceIssueRange(lineObj.text, isTargetChapterLine(editor.document, target));
      if (hit) {
        startCol = hit.startCol;
        endCol = hit.endCol;
      }
    }
  }
  const defaultLabel = firstNonWs > 0 ? '行首空白' : '空白';
  const start = new vscode.Position(target, startCol);
  const end = new vscode.Position(target, endCol);
  editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  editor.selection = new vscode.Selection(start, end);
  vscode.window.setStatusBarMessage(
    (label || defaultLabel) + '：第 ' + (target + 1) + ' 行，第 ' + (lines.indexOf(target) + 1) + ' / ' + lines.length + ' 处',
    5000
  );
}

const noDoc = () => vscode.window.showInformationMessage('当前没有打开的文件');

module.exports = { isDocEditor, docLines, docText, eolOf, applyLines, jumpToLine, jumpToRange, noDoc };
