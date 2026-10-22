'use strict';

// 文本整理命令：合并、缩进、空行、章节号、省略号、引号、全角半角、繁简
const vscode = require('vscode');
const transforms = require('../engine/transforms');
const chapters = require('../engine/chapters');
const { t2sDetail } = require('../engine/zh-convert');
const { docLines, applyLines, noDoc } = require('../core/editor');

// 繁简转换清单输出面板（懒创建, 复用）
let _t2sChannel = null;
function t2sChannel() {
  if (!_t2sChannel) {
    _t2sChannel = vscode.window.createOutputChannel('小说工具箱 · 繁简转换清单');
  }
  return _t2sChannel;
}

function registerOrganizeCommands({ reg, panel, checker, cfg }) {
  reg('merge', async () => {
    const editor = panel.editor();
    if (!editor) {
      return noDoc();
    }
    const r = transforms.mergeLines(docLines(editor.document), {
      indentStartsParagraph: cfg().get('indentStartsParagraph', true),
      smartParagraphs: cfg().get('smartParagraphs', true),
      keepBlankLines: cfg().get('keepBlankLines', true)
    });
    if (r.merged === 0) {
      const hint = r.indentParagraphs > 0
        ? '（已识别小说排版：' + r.indentParagraphs + ' 个缩进段落，但没有可合并的段内换行）'
        : '（未识别到小说排版特征：既没有段首缩进，也没有可合并的段内换行）';
      return vscode.window.showInformationMessage('没有需要合并的段内换行 ' + hint);
    }
    const info = r.indentParagraphs > 0 ? '，识别到 ' + r.indentParagraphs + ' 个缩进段落' : '';
    await applyLines(
      editor,
      r.lines,
      '已合并 ' + r.merged + ' 处段内换行（共 ' + r.paragraphs + ' 段' + info + '）；不满意可 Ctrl+Z 撤销'
    );
  });

  reg('dedent', async () => {
    const editor = panel.editor();
    if (!editor) {
      return noDoc();
    }
    const r = transforms.dedentLines(docLines(editor.document));
    if (r.count === 0) {
      return vscode.window.showInformationMessage('所有行都已经贴最左侧，没有缩进可去除');
    }
    await applyLines(editor, r.lines, '已去除 ' + r.count + ' 行的行首缩进；不满意可 Ctrl+Z 撤销');
  });

  reg('indent', async () => {
    const editor = panel.editor();
    if (!editor) {
      return noDoc();
    }
    const r = transforms.indentLines(docLines(editor.document), {
      indentString: cfg().get('indentString', '　　'),
      skipChapterTitles: cfg().get('indentSkipChapterTitles', false),
      chapterPattern: cfg().get('chapterPattern'),
      normalizeExisting: cfg().get('indentNormalizeExisting', true)
    });
    if (r.added === 0 && r.normalized === 0) {
      return vscode.window.showInformationMessage('没有添加任何缩进（' + r.skipped + ' 行已有缩进或被跳过）');
    }
    const ok = await applyLines(
      editor,
      r.lines,
      '已为 ' + r.added + ' 行添加首行缩进' +
        (r.normalized > 0 ? '，并统一 ' + r.normalized + ' 行已有缩进' : '') +
        (r.skipped > 0 ? '（' + r.skipped + ' 行已有缩进或章节名未动）' : '') +
        '；贴左检查已暂停，Alt+F8 可恢复；不满意可 Ctrl+Z 撤销'
    );
    if (ok) {
      checker.silence(editor.document);
    }
  });

  reg('removeBlankLines', async () => {
    const editor = panel.editor();
    if (!editor) {
      return noDoc();
    }
    const r = transforms.removeBlankLines(docLines(editor.document));
    if (r.removed === 0) {
      return vscode.window.showInformationMessage('没有空白行可消除');
    }
    await applyLines(editor, r.lines, '已消除 ' + r.removed + ' 个空白行；不满意可 Ctrl+Z 撤销');
  });

  reg('blankBeforeChapters', async () => {
    const editor = panel.editor();
    if (!editor) {
      return noDoc();
    }
    const lines = docLines(editor.document);
    const chs = chapters.chapterLines(lines, cfg().get('chapterPattern'));
    if (chs.length === 0) {
      return vscode.window.showInformationMessage('未识别到章节名（可调整设置里的 novelToolkit.chapterPattern）');
    }
    const r = transforms.insertBlanksBeforeChapters(lines, chs);
    if (r.added === 0 && r.collapsed === 0) {
      return vscode.window.showInformationMessage('每个章节名前都已有且仅有一个空行，无需处理');
    }
    await applyLines(
      editor,
      r.lines,
      '已在 ' + r.added + ' 个章节名前插入空行' +
        (r.collapsed > 0 ? '，并折叠 ' + r.collapsed + ' 个多余空行' : '') +
        '（首个章节除外，共识别 ' + chs.length + ' 章）；不满意可 Ctrl+Z 撤销'
    );
  });

  reg('unifyChapterNumbers', async () => {
    const editor = panel.editor();
    if (!editor) {
      return noDoc();
    }
    const lines = docLines(editor.document);
    const r = chapters.unifyChapterNumbers(lines, cfg().get('chapterPattern'));
    if (!r.changed.length) {
      return vscode.window.showInformationMessage('没有需要统一的阿拉伯数字章节号（已全部是汉字，或未识别到章节名）');
    }
    const sample = r.changed.slice(0, 3).map((c) => c.from + '→' + c.to).join('、');
    await applyLines(
      editor,
      r.lines,
      '已把 ' + r.changed.length + ' 处章节号统一为汉字（' + sample + (r.changed.length > 3 ? ' 等' : '') +
        '）；只改章节名行，正文未动；不满意可 Ctrl+Z 撤销'
    );
  });

  reg('normalizeEllipsis', async () => {
    const editor = panel.editor();
    if (!editor) {
      return noDoc();
    }
    const lines = docLines(editor.document);
    const r = transforms.normalizeEllipsis(lines);
    let msg = '已整改 ' + r.changed + ' 行省略号（≥4 点→……，2~3 点→…）';
    if (r.singles.length) {
      const lns = r.singles.slice(0, 6).map((s) => (s.line + 1) + '行').join('、');
      msg += '；另有 ' + r.singles.length + ' 处孤立点号未处理（' + lns + (r.singles.length > 6 ? ' 等' : '') + '），请自行确认';
    }
    if (r.changed === 0) {
      return vscode.window.showInformationMessage(r.singles.length ? msg : '没有发现需要整改的省略号');
    }
    await applyLines(editor, r.lines, msg + '；不满意可 Ctrl+Z 撤销');
  });

  reg('replaceCornerQuotes', async () => {
    const editor = panel.editor();
    if (!editor) {
      return noDoc();
    }
    const r = transforms.replaceCornerQuotes(docLines(editor.document));
    if (r.count === 0) {
      return vscode.window.showInformationMessage('没有找到直角引号「」或『』');
    }
    let msg = '已替换 ' + r.count + ' 个直角引号（「」→“”，『』→‘’，涉及 ' + r.linesChanged + ' 行）';
    if (r.innerCount) {
      msg += '；其中嵌套引号 ' + r.innerCount + ' 个';
    }
    await applyLines(editor, r.lines, msg + '；不满意可 Ctrl+Z 撤销');
  });

  reg('fullwidthToHalfwidth', async () => {
    const editor = panel.editor();
    if (!editor) {
      return noDoc();
    }
    const pick = await vscode.window.showQuickPick([
      {
        label: '仅全角英数 → 半角（中文正文安全）',
        description: 'Ｓｏｒｒｙ→Sorry、１２３→123、＄５０＠→$50@；中文标点 ，。！？：；（）～ 保留不动',
        mode: 'alnum',
      },
      {
        label: '全部全角字符 → 半角（整段全角英文用）',
        description: '在上一档基础上全角标点也转：，→ , ！→ ! ？→ ?（适合整段被全角输入法打出的英文）',
        mode: 'all',
      },
    ], { placeHolder: '选择转换范围（汉字与全角空格　不会被动）' });
    if (!pick) {
      return;
    }
    const r = transforms.fullwidthToHalf(docLines(editor.document), pick.mode);
    const spaceNote = r.spaces ? '；' + r.spaces + ' 个全角空格按惯例未动' : '';
    if (r.count === 0) {
      return vscode.window.showInformationMessage(
        '没有可转换的全角字符' +
        (r.kept ? '（有 ' + r.kept + ' 个全角标点按所选范围保留）' : '') + spaceNote);
    }
    const keepNote = r.kept ? '，按所选范围保留 ' + r.kept + ' 个全角标点' : '';
    await applyLines(
      editor,
      r.lines,
      '已把 ' + r.count + ' 个全角字符转为半角（涉及 ' + r.linesChanged + ' 行' + keepNote + '）' +
        spaceNote + '；不满意可 Ctrl+Z 撤销'
    );
  });

  reg('checkChapters', async () => {
    const editor = panel.editor();
    if (!editor) {
      return noDoc();
    }
    const lines = docLines(editor.document);
    const r = chapters.chapterGaps(lines, cfg().get('chapterPattern'));
    if (!r.totalChapters) {
      return vscode.window.showInformationMessage('未识别到章节名（可调整设置里的 novelToolkit.chapterPattern）');
    }
    let msg = '共识别 ' + r.totalChapters + ' 章';
    if (r.totalUnparsed) {
      msg += '（' + r.totalUnparsed + ' 章无编号，如序章/番外，不参与检查）';
    }
    if (!r.totalMissing) {
      msg += '：编号连续，无缺失';
    } else {
      const parts = r.groups
        .filter((g) => g.missing.length)
        .map((g) => '缺第' + g.missing.slice(0, 6).join('、第') + '章' + (g.missing.length > 6 ? ' 等 ' + g.missing.length + ' 章' : ''));
      msg += '：' + parts.join('；');
      if (r.groups.some((g) => g.min > 1)) {
        msg += '（部分分组编号不从第1章起，若为跨卷续号属正常）';
      }
    }
    if (r.totalDuplicates) {
      msg += '；重复编号 ' + r.totalDuplicates + ' 个（' + r.duplicateSamples.slice(0, 3).join('、') + '）';
    }
    vscode.window.showInformationMessage(msg);
  });

  reg('t2sFile', async () => {
    const editor = panel.editor();
    if (!editor) {
      return noDoc();
    }
    const lines = docLines(editor.document);
    let changedLines = 0;
    let totalChanges = 0;
    // 聚合: from\tto → { from, to, count, lines[] }（同一行同一字/词只记一次行号）
    const agg = new Map();
    const out = lines.map((l, idx) => {
      const lineNo = idx + 1;
      const { output, changes } = t2sDetail(l);
      if (changes.length) {
        changedLines++;
        for (const c of changes) {
          totalChanges++;
          const key = c.from + '\t' + c.to;
          let e = agg.get(key);
          if (!e) {
            e = { from: c.from, to: c.to, count: 0, lines: [] };
            agg.set(key, e);
          }
          e.count++;
          if (e.lines[e.lines.length - 1] !== lineNo) {
            e.lines.push(lineNo);
          }
        }
      }
      return output;
    });
    if (totalChanges === 0) {
      return vscode.window.showInformationMessage('文件中没有繁体字');
    }
    // 清单面板: 按次数降序 + 长词组优先, 行号最多展示 12 个
    const entries = [...agg.values()].sort((a, b) =>
      (b.count - a.count) || (b.from.length - a.from.length) || (a.from < b.from ? -1 : 1));
    const ch = t2sChannel();
    ch.clear();
    ch.appendLine('繁→简 转换清单 —— ' + (editor.document.fileName || '').split(/[\\/]/).pop());
    ch.appendLine('共 ' + totalChanges + ' 处替换 · ' + changedLines + ' 行变化 · ' + entries.length + ' 个字/词（按出现次数排序）');
    ch.appendLine('─'.repeat(56));
    for (const e of entries) {
      const shown = e.lines.slice(0, 12).join(', ');
      const more = e.lines.length > 12 ? ' …共' + e.lines.length + '行' : '';
      const tag = e.from.length > 1 ? '（词组）' : '';
      ch.appendLine(e.from + ' → ' + e.to + tag + ' ×' + e.count + '　行 ' + shown + more);
    }
    ch.show(true); // true = 保持编辑器焦点
    await applyLines(
      editor,
      out,
      '已转换 ' + changedLines + ' 行（' + totalChanges + ' 处），清单已输出到「繁简转换清单」面板；不满意可 Ctrl+Z 撤销'
    );
  });
}

module.exports = { registerOrganizeCommands };
