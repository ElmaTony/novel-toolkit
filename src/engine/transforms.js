'use strict';

// 纯文本变换与检测：输入输出都是 string[]，不依赖 vscode，可独立测试。

const WS_RE = /^\s+/;
const WORDISH_RE = /[\w\u4e00-\u9fff\u3400-\u4dbf]/;

// 正文空格检测（行首空白之外，v0.16.6）：
//   汉字之间夹半角空格（"他 说"）→ 几乎必为复制/排版残留
//   行尾空格/制表符 → 隐藏脏数据
// 英文单词间空格、中英文之间的空格、章节标题的标记分隔空格不报（排版规范允许）
const MID_SPACE_RE = /[\u3400-\u4DBF\u4E00-\u9FFF]([ \t]+)(?=[\u3400-\u4DBF\u4E00-\u9FFF])/g;
const TRAIL_SPACE_RE = /[ \t]+$/;
const CHAPTER_HEAD_PREFIX_RE = /^\s*(?:[\[【（(]\s*)?(?:第\s*[〇零一二三四五六七八九十百千万两廿卅卌0-9０-９]{1,9}\s*[章节卷回部集话]|卷[〇零一二三四五六七八九十百千万两廿卅卌0-9０-９]{1,9}|序章|序言|楔子|引子|尾声|终章|后记|番外|終章|後記|尾聲)/;

const isBlank = (text) => text.trim() === '';

function isSeparatorLine(text) {
  const t = text.trim();
  return t !== '' && !WORDISH_RE.test(t);
}

// 整行只有省略号（……）是正常排版（悬念收尾），不算短行问题；缩进（含全角空格）一并放行
const ELLIPSIS_ONLY_RE = /^[\s\u2026]+$/;

function isShortPunctLine(text, maxChars) {
  const t = text.trim();
  if (t === '' || t.length > maxChars) {
    return false;
  }
  if (ELLIPSIS_ONLY_RE.test(t)) {
    return false;
  }
  return !WORDISH_RE.test(t);
}

function describeLeading(ws) {
  let spaces = 0;
  let tabs = 0;
  let boms = 0;
  let other = 0;
  for (const ch of ws) {
    if (ch === ' ') {
      spaces++;
    } else if (ch === '\t') {
      tabs++;
    } else if (ch === '\uFEFF') {
      boms++;
    } else {
      other++;
    }
  }
  const parts = [];
  if (spaces > 0) {
    parts.push('半角空格×' + spaces);
  }
  if (tabs > 0) {
    parts.push('Tab×' + tabs);
  }
  if (boms > 0) {
    parts.push('BOM字符×' + boms);
  }
  if (other > 0) {
    parts.push('其他不可见空白（如全角/不间断空格）×' + other);
  }
  return parts.join('、');
}

// 引号配对检查: 按左→右顺序配对（闭前开后也能检出），并豁免英文缩写词内撇号（如 don’t）
const QUOTE_PAIRS = [
  ['「', '」'],
  ['『', '』'],
  ['“', '”'],
  ['‘', '’'],
];
const EN_APOSTROPHE_RE = /([A-Za-z])’(?=[A-Za-z])/g;

function quoteIssues(line) {
  const cleaned = String(line || '').replace(EN_APOSTROPHE_RE, '$1\'');
  const problems = [];
  for (const [open, close] of QUOTE_PAIRS) {
    let unmatchedOpen = 0;
    let unmatchedClose = 0;
    for (const ch of cleaned) {
      if (ch === open) {
        unmatchedOpen++;
      } else if (ch === close) {
        if (unmatchedOpen > 0) unmatchedOpen--;
        else unmatchedClose++;
      }
    }
    if (unmatchedClose > 0) {
      problems.push(close + ' 缺开引号 ×' + unmatchedClose);
    }
    if (unmatchedOpen > 0) {
      problems.push(open + ' 未闭合 ×' + unmatchedOpen);
    }
  }
  return problems;
}

// 贴左检查 + 标点短行检查 + 引号配对检查
function scanLines(lines, opts) {
  const o = Object.assign(
    { ignoreBlankLines: true, shortLineCheck: true, shortLineMaxChars: 2, quotePairCheck: true, chapterPattern: undefined },
    opts
  );
  const chapterSet = new Set(require('./chapters').chapterLines(lines, o.chapterPattern));
  const ws = [];
  const short = [];
  const quote = [];
  const mid = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const blank = isBlank(text);
    if (o.shortLineCheck && !blank && isShortPunctLine(text, o.shortLineMaxChars)) {
      const m = text.match(WS_RE);
      short.push({ line: i, lead: m ? m[0].length : 0, text: text.trim() });
    }
    if (o.quotePairCheck && !blank) {
      const issues = quoteIssues(text);
      if (issues.length) {
        quote.push({ line: i, problems: issues.join('、') });
      }
    }
    if (blank && o.ignoreBlankLines) {
      continue;
    }
    if (!blank) {
      // 正文内空格: 汉字间半角空格 / 行尾空格（章节标题行豁免章节标记后的分隔空格）
      const isChap = chapterSet.has(i);
      const headMatch = isChap ? text.match(CHAPTER_HEAD_PREFIX_RE) : null;
      const headEnd = headMatch ? headMatch[0].length : -1;
      let skippedCustomSep = false;
      for (const ms of text.matchAll(MID_SPACE_RE)) {
        const spacePos = ms.index + 1;
        if (isChap) {
          if (headEnd >= 0 && spacePos <= headEnd && ms[1] === ' ') continue;
          if (headEnd < 0 && !skippedCustomSep && ms[1] === ' ') { skippedCustomSep = true; continue; }
        }
        mid.push({ line: i, col: spacePos, len: ms[1].length, desc: '正文汉字之间有空格' });
      }
      const ts = text.match(TRAIL_SPACE_RE);
      if (ts) {
        mid.push({ line: i, col: ts.index, len: ts[0].length, desc: '行尾有空格' });
      }
    }
    const m = text.match(WS_RE);
    if (m) {
      ws.push({ line: i, len: m[0].length, desc: describeLeading(m[0]) });
    }
  }
  return { ws, short, quote, mid };
}

// 合并段落内换行：段落 = 空行分隔 或 行首有缩进的行。
// smartParagraphs: 当源文件几乎每行都有缩进时，缩进不再是段落信号，
// 改用“上一行是否以句末标点/收引号结束”和“本行是否以对话引号开头”判断段落起点，
// 避免整本书被当成一段，或每行都被当成新段落。
const SENTENCE_END_RE = /[。！？…”’」』】）)]\s*$/;
const DIALOGUE_START_RE = /^\s*[“「『‘]/;

function mergeLines(lines, opts) {
  const o = Object.assign(
    { indentStartsParagraph: true, keepBlankLines: true, smartParagraphs: true },
    opts
  );
  let nonBlank = 0;
  let indented = 0;
  for (const raw of lines) {
    if (!isBlank(raw)) {
      nonBlank++;
      if (/^\s/.test(raw)) { indented++; }
    }
  }
  const indentUniversal = nonBlank > 0 && indented / nonBlank >= 0.8;

  const chapterSet = new Set(require('./chapters').chapterLines(lines, o.chapterPattern));
  const out = [];
  let buf = null;
  let merged = 0;
  let paragraphs = 0;
  let indentParagraphs = 0;
  const flush = () => {
    if (buf !== null) {
      out.push(buf);
      buf = null;
    }
  };
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const raw = lines[lineIndex];
    if (chapterSet.has(lineIndex)) { flush(); out.push(raw.replace(/\s+$/, '')); paragraphs++; continue; }
    if (isBlank(raw)) {
      flush();
      if (o.keepBlankLines) {
        out.push('');
      }
      continue;
    }
    if (isSeparatorLine(raw)) {
      flush();
      out.push(raw.replace(/\s+$/, ''));
      paragraphs++;
      continue;
    }
    const pieces = o.indentStartsParagraph ? splitInlineBreaks(raw) : [raw];
    for (let k = 0; k < pieces.length; k++) {
      const piece = pieces[k].replace(/\s+$/, '');
      if (!piece) {
        continue;
      }
      const startsIndent = o.indentStartsParagraph && k === 0 && /^\s/.test(raw);
      let startsNew;
      if (k > 0 || buf === null) {
        startsNew = true;
      } else if (!startsIndent) {
        startsNew = false;
      } else if (!o.smartParagraphs || !indentUniversal) {
        startsNew = true;
      } else {
        // 每行都有缩进：只有上一段已收句，或本行是对话开头，才另起一段
        startsNew = SENTENCE_END_RE.test(buf) || DIALOGUE_START_RE.test(piece);
      }
      if (startsIndent && startsNew) {
        indentParagraphs++;
      }
      if (startsNew) {
        paragraphs++;
        flush();
        buf = piece;
      } else {
        const cont = piece.trim();
        if (/[\w]$/.test(buf) && /^[\w]/.test(cont)) {
          buf += ' ' + cont;
        } else {
          buf += cont;
        }
        merged++;
      }
    }
  }
  flush();
  return { lines: out, merged, paragraphs, indentParagraphs, indentUniversal };
}

function dedentLines(lines) {
  let count = 0;
  const out = lines.map((text) => {
    const m = text.match(WS_RE);
    if (m) {
      count++;
      return text.slice(m[0].length);
    }
    return text;
  });
  return { lines: out, count };
}

function indentLines(lines, opts) {
  const o = Object.assign(
    {
      indentString: '　　',
      skipChapterTitles: false,
      chapterPattern: undefined,
      normalizeExisting: true,
    },
    opts
  );
  let chapterSet = null;
  if (o.skipChapterTitles) {
    const chapters = require('./chapters');
    chapterSet = new Set(chapters.chapterLines(lines, o.chapterPattern));
  }
  let added = 0;
  let skipped = 0;
  let normalized = 0;
  const out = lines.map((text, i) => {
    if (isBlank(text)) {
      return text;
    }
    if (chapterSet && chapterSet.has(i)) {
      skipped++;
      return text;
    }
    const m = text.match(WS_RE);
    if (m) {
      if (m[0] === o.indentString || !o.normalizeExisting) {
        skipped++;
        return text;
      }
      // 已有缩进但不是配置的缩进（如 4 空格 / 单全角空格）→ 统一成 indentString
      normalized++;
      return o.indentString + text.slice(m[0].length);
    }
    added++;
    return o.indentString + text;
  });
  return { lines: out, added, skipped, normalized };
}

function removeBlankLines(lines) {
  let removed = 0;
  const out = [];
  for (const text of lines) {
    if (isBlank(text)) {
      removed++;
      continue;
    }
    out.push(text);
  }
  return { lines: out, removed };
}

// 章节名前插入空行；首个章节除外；统一为“恰好一个空行”：
// 已有 1 个空行不重复插；已有多个空行则折叠为 1 个，避免章节前出现大片空白。
function insertBlanksBeforeChapters(lines, chapterIdxs) {
  const set = new Set(chapterIdxs);
  const first = chapterIdxs[0];
  const out = [];
  let added = 0;
  let collapsed = 0;
  for (let i = 0; i < lines.length; i++) {
    if (set.has(i) && i !== first) {
      let blankCount = 0;
      while (out.length && out[out.length - 1].trim() === '') {
        out.pop();
        blankCount++;
      }
      if (blankCount > 1) {
        collapsed += blankCount - 1;
      }
      if (out.length > 0) {
        out.push('');
        if (blankCount === 0) { added++; }
      }
    }
    out.push(lines[i]);
  }
  return { lines: out, added, collapsed };
}

// 段中切分: 行内任何 2 个以上的连续空格串（全角/半角/不间断空格混排均可）都视为段落接缝
//   1) 纯全角空格串 → 切分, 右片段保留 "　　" 缩进前缀（段落缩进惯例）
//   2) 含半角/不间断空格的串 → 切分, 空格丢弃
//   行首的空白串是段落缩进, 不切分, 纯全角时保留 "　　" 前缀语义
// 注意: String.split 会把匹配文本吞掉, 必须用 exec 手动切
function splitInlineBreaks(line) {
  const s = String(line);
  const trimmedRight = s.replace(/[ \u00a0\u3000]+$/, '');
  if (!trimmedRight) {
    return [s];
  }
  const leadMatch = trimmedRight.match(/^[ \t\u00a0\u3000]+/);
  const lead = leadMatch ? leadMatch[0] : '';
  const body = trimmedRight.slice(lead.length);
  const re = /[\u3000\u00a0 ]{2,}/g;
  if (!re.test(body)) {
    return [trimmedRight];
  }
  re.lastIndex = 0;
  const out = [];
  let last = 0;
  let prefix = lead;
  let m;
  while ((m = re.exec(body)) !== null) {
    const runStart = m.index;
    if (runStart > last) {
      out.push(prefix + body.slice(last, runStart).replace(/[ \u00a0\u3000]+$/, ''));
    }
    prefix = /^\u3000+$/.test(m[0]) ? '　　' : '';
    last = runStart + m[0].length;
  }
  if (last < body.length) {
    out.push(prefix + body.slice(last));
  }
  return out.length ? out : [s];
}

// ---------- 省略号整改 ----------
// 点类字符 → 计几个"点": …/⋯/⋮ 各计 3（本身就是省略号字形）, ‥ 计 2,
// 其余（•·・.．。｡）各计 1。连续点串合并计数后归一:
//   ≥4 点 → ……（六点省略号）; 2~3 点 → …（三点省略号）
// 单点不改, 分两种情况:
//   句点类（.．。｡）静默放行（句号/小数点）; 点号类（·・）前后都是汉字时是间隔号（哈利·波特）放行;
//   其余单点记入 singles 交上层提示（如行尾孤立的 ・/•/⋯）。
const ELLIPSIS_DOT_POINTS = {
  '…': 3, '⋯': 3, '⋮': 3, '‥': 2,
  '•': 1, '·': 1, '・': 1,
  '.': 1, '．': 1, '。': 1, '｡': 1,
};
const ELLIPSIS_PERIOD_CHARS = new Set(['.', '．', '。', '｡']);
const CJKISH_RE = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/;

function normalizeEllipsis(lines) {
  const out = new Array(lines.length);
  let changed = 0;
  const singles = [];
  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i]);
    if (![...line].some((c) => c in ELLIPSIS_DOT_POINTS)) {
      out[i] = line;
      continue;
    }
    let res = '';
    let lineChanged = false;
    let j = 0;
    while (j < line.length) {
      const ch = line[j];
      if (!(ch in ELLIPSIS_DOT_POINTS)) {
        res += ch;
        j++;
        continue;
      }
      let k = j;
      let points = 0;
      while (k < line.length && line[k] in ELLIPSIS_DOT_POINTS) {
        points += ELLIPSIS_DOT_POINTS[line[k]];
        k++;
      }
      if (points >= 4) {
        const rep = '……';
        if (rep !== line.slice(j, k)) { lineChanged = true; }
        res += rep;
      } else if (points >= 2) {
        const rep = '…';
        if (rep !== line.slice(j, k)) { lineChanged = true; }
        res += rep;
      } else {
        const prev = line[j - 1];
        const next = line[k];
        const separator = (ch === '·' || ch === '・') && CJKISH_RE.test(prev || '') && CJKISH_RE.test(next || '');
        if (ELLIPSIS_PERIOD_CHARS.has(ch) || separator) {
          res += ch;
        } else {
          res += ch;
          singles.push({ line: i, char: ch });
        }
      }
      j = k;
    }
    out[i] = lineChanged ? res : line;
    if (lineChanged) { changed++; }
  }
  return { lines: out, changed, singles };
}

// ---------- 直角引号 → 弯引号 ----------
// 「」→“” 为外层引号，『』→‘’ 为嵌套引号；两类一起转换，符合中文出版排版惯例。
// 统计 count 为总转换数，innerCount 为其中嵌套引号的数量，便于上层提示。
function replaceCornerQuotes(lines) {
  let count = 0;
  let linesChanged = 0;
  let innerCount = 0;
  const out = lines.map((line) => {
    const s = String(line);
    const r = s.replace(/[「」『』]/g, (ch) => {
      count++;
      if (ch === '「') { return '“'; }
      if (ch === '」') { return '”'; }
      innerCount++;
      return ch === '『' ? '‘' : '’';
    });
    if (r !== s) {
      linesChanged++;
    }
    return r;
  });
  return { lines: out, count, linesChanged, innerCount };
}

// ---------- 全角字符 → 半角 ----------
// 只处理 U+FF01–U+FF5E（全角形式区：Ｓｏｒｒｙ、１２３、，！等），汉字/假名一律不动。
// mode = 'alnum'（中文正文安全）: 全角英数与中性符号转半角，中文常用标点保留：
//   保留 ！＂＇（）．，：；？～（这些在中文正文里有正常排版职责）
// mode = 'all'（整段全角英文用）: 区块内全部转半角，中文标点也会变成英文标点
// 全角空格 U+3000 两种模式都不转：它承担缩进/分隔语义，转半角会破坏排版并触发行首空白检查
const FW_ALNUM_KEEP = new Set([
  0xFF01, 0xFF02, 0xFF07, 0xFF08, 0xFF09,
  0xFF0C, 0xFF0E, 0xFF1A, 0xFF1B, 0xFF1F, 0xFF5E,
]);

function fullwidthToHalf(lines, mode) {
  let count = 0;
  let linesChanged = 0;
  let spaces = 0;
  let kept = 0;
  const out = lines.map((line) => {
    const s = String(line);
    let res = '';
    let changed = false;
    for (const ch of s) {
      const code = ch.codePointAt(0);
      if (code === 0x3000) {
        spaces++;
        res += ch;
        continue;
      }
      if (code >= 0xFF01 && code <= 0xFF5E) {
        if (mode !== 'all' && FW_ALNUM_KEEP.has(code)) {
          kept++;
          res += ch;
          continue;
        }
        count++;
        res += String.fromCharCode(code - 0xFEE0);
        changed = true;
        continue;
      }
      res += ch;
    }
    if (changed) {
      linesChanged++;
    }
    return changed ? res : s;
  });
  return { lines: out, count, linesChanged, spaces, kept };
}

module.exports = {
  isBlank,
  isSeparatorLine,
  isShortPunctLine,
  quoteIssues,
  describeLeading,
  scanLines,
  mergeLines,
  splitInlineBreaks,
  dedentLines,
  indentLines,
  removeBlankLines,
  insertBlanksBeforeChapters,
  normalizeEllipsis,
  replaceCornerQuotes,
  fullwidthToHalf
};
