'use strict';

// 检查与跳转命令：全文检查、空白/短行/引号/章节跳转、章节列表
const vscode = require('vscode');
const { jumpToLine, jumpToRange, noDoc } = require('../core/editor');

function registerNavigationCommands({ reg, panel, checker }) {
  reg('check', async () => {
    const editor = panel.editor();
    if (!editor) {
      return noDoc();
    }
    if (!checker.appliesTo(editor.document)) {
      return vscode.window.showInformationMessage('当前文件类型已排除检查');
    }
    const r = await checker.fullScan(editor.document);
    if (!r) {
      return;
    }
    if (r.ws.length === 0 && r.mid.length === 0 && r.short.length === 0 && r.quote.length === 0) {
      return vscode.window.showInformationMessage('已扫描全文：没有空白、标点短行与引号配对问题 ✓');
    }
    if (r.ws.length > 0 || r.mid.length > 0) {
      if (r.ranges && Array.isArray(r.ranges.blank) && r.ranges.blank.length > 0) {
        jumpToRange(editor, r.ranges.blank[0], 0, r.ranges.blank.length, '空白');
      } else {
        const blankLines = [...new Set([...r.ws, ...r.mid])].sort((a, b) => a - b);
        jumpToLine(editor, blankLines, blankLines[0], '空白');
      }
    } else if (r.quote.length > 0) {
      jumpToLine(editor, r.quote, r.quote[0], '引号配对');
    } else {
      jumpToLine(editor, r.short, r.short[0], '残留短行');
    }
    vscode.window.showInformationMessage(
      '已扫描全文：' + r.ws.length + ' 处行首空白、' + r.mid.length + ' 处正文空格、' +
      r.short.length + ' 处疑似标点短行、' +
      r.quote.length + ' 处引号疑似不配对；Alt+F8 / Alt+F7 逐个跳转'
    );
  });

  const makeJump = (keys, label, emptyMsg, backwards) => async () => {
    const editor = panel.editor();
    if (!editor) {
      return;
    }
    const r = await checker.fullScan(editor.document);
    if (!r) {
      return;
    }
    const keyList = Array.isArray(keys) ? keys : [keys];
    const rangeKey = keyList.includes('ws') || keyList.includes('mid') ? 'blank' : keyList[0];
    const rangeList = r.ranges && Array.isArray(r.ranges[rangeKey]) ? r.ranges[rangeKey] : null;
    if (rangeList && rangeList.length === 0) {
      vscode.window.setStatusBarMessage(emptyMsg, 4000);
      return;
    }
    if (rangeList && rangeList.length > 0) {
      const sel = editor.selection;
      const selStart = sel.start || sel.active;
      const selEnd = sel.end || sel.active;
      let targetIdx;
      if (backwards) {
        for (let i = 0; i < rangeList.length; i++) {
          const item = rangeList[i];
          if (item.line < selStart.line || (item.line === selStart.line && item.endCol <= selStart.character)) {
            targetIdx = i;
          }
        }
        if (targetIdx === undefined) targetIdx = rangeList.length - 1;
      } else {
        targetIdx = rangeList.findIndex((item) =>
          item.line > selEnd.line || (item.line === selEnd.line && item.startCol >= selEnd.character));
        if (targetIdx < 0) targetIdx = 0;
      }
      const range = rangeList[targetIdx];
      if (editor.document.isClosed || !range || range.line < 0 || range.line >= editor.document.lineCount) {
        return;
      }
      jumpToRange(editor, range, targetIdx, rangeList.length, label);
      return;
    }
    const lines = [...new Set([].concat(...keyList.map((k) => r[k] || [])))].sort((a, b) => a - b);
    if (lines.length === 0) {
      vscode.window.setStatusBarMessage(emptyMsg, 4000);
      return;
    }
    const cursor = editor.selection.active.line;
    let target;
    if (backwards) {
      target = undefined;
      for (const i of lines) {
        if (i < cursor) {
          target = i;
        }
      }
      if (target === undefined) {
        target = lines[lines.length - 1];
      }
    } else {
      target = lines.find((i) => i > cursor);
      if (target === undefined) {
        target = lines[0];
      }
    }
    if (editor.document.isClosed || target === undefined || target < 0 || target >= editor.document.lineCount) {
      return;
    }
    jumpToLine(editor, lines, target, label);
  };

  reg('nextProblem', makeJump(['ws', 'mid'], '空白', '全文没有空白问题（行首/正文）✓', false));
  reg('prevProblem', makeJump(['ws', 'mid'], '空白', '全文没有空白问题（行首/正文）✓', true));
  reg('nextShort', makeJump('short', '残留短行', '全文没有标点短行 ✓', false));
  reg('prevShort', makeJump('short', '残留短行', '全文没有标点短行 ✓', true));
  reg('nextQuote', makeJump('quote', '引号配对', '全文没有引号配对问题 ✓', false));
  reg('prevQuote', makeJump('quote', '引号配对', '全文没有引号配对问题 ✓', true));

  const chapterJump = (backwards) => async () => {
    const editor = panel.editor();
    if (!editor) {
      return;
    }
    const lines = (await panel.chapterEntries(editor.document)).map(entry => entry.line);
    if (lines.length === 0) {
      vscode.window.setStatusBarMessage('未识别到章节名（可调整 novelToolkit.chapterPattern）', 4000);
      return;
    }
    const cursor = editor.selection.active.line;
    let target;
    if (backwards) {
      target = undefined;
      for (const i of lines) {
        if (i < cursor) {
          target = i;
        }
      }
      if (target === undefined) {
        target = lines[lines.length - 1];
      }
    } else {
      target = lines.find((i) => i > cursor);
      if (target === undefined) {
        target = lines[0];
      }
    }
    if (editor.document.isClosed || target === undefined || target < 0 || target >= editor.document.lineCount) {
      return;
    }
    const start = new vscode.Position(target, 0);
    editor.revealRange(new vscode.Range(start, start), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    editor.selection = new vscode.Selection(start, start);
    const title = editor.document.lineAt(target).text.trim().slice(0, 30);
    vscode.window.setStatusBarMessage(
      '章节 ' + (lines.indexOf(target) + 1) + ' / ' + lines.length + '：' + title, 5000
    );
  };

  reg('nextChapter', chapterJump(false));
  reg('prevChapter', chapterJump(true));

  reg('chapterList', async () => {
    const editor = panel.editor();
    if (!editor) {
      return noDoc();
    }
    const doc = editor.document;
    const entries = await panel.chapterEntries(doc);
    if (entries.length === 0) {
      return vscode.window.showInformationMessage('未识别到章节名（可调整设置里的 novelToolkit.chapterPattern）');
    }
    const items = entries.map((e) => ({
      label: (e.kind === 'volume' ? '▍[卷] ' : '') + e.title.slice(0, 60),
      description: '第 ' + (e.line + 1) + ' 行',
      line: e.line
    }));
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: '共 ' + items.length + ' 项（含卷），选择后跳转'
    });
    if (pick) {
      panel.jump(pick.line);
    }
  });
}

module.exports = { registerNavigationCommands };
