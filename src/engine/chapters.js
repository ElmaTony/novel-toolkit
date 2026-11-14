'use strict';

// 识别不依赖 vscode; cool18/parse 的中文数字解析为纯函数, 供编号提取复用
const { cnNumeral } = require('./cool18/parse');

// 章节行 = 整行只有章节标记 + 短标题。防正文误判的关键不在单一长度, 而在:
//   1) 标题段不得跨过句末标点（。！？；…） —— 正文句子很快会遇到
//   2) 紧贴标题（无空格）上限 6 字且其后必须是行尾/句末标点 —— "第一节课数学课"这类碎句放行,
//      "第二节课正是数学课，铃声……"里逗号后还有内容, 行尾锚点匹配不上
//   3) 空格分隔的标题上限 30 字（长标题不再被截）
//   4) 编号 1~9 位（覆盖 第一千零二十四章 这类长数字）, 且允许 第 12 章 式空格
//   5) 容忍整行被 【】（）[] 包裹, Chapter 大小写, 繁体 終章/後記/尾聲
const NUM_CHARS = '〇零一二三四五六七八九十百千万两0-9０-９';
// 标题尾部规则 v3:
//   - 空格分隔的标题放宽到 40 字，允许 ！？…（章节标题常见），但仍禁止 。；
//   - 无空格紧贴标题保留 6 字上限，避免把正文句子当成章节名；
//   - 6 字以上的无空格标题由 chapterEntries 的上下文候选逻辑兜底。
const TITLE_TAIL = '(?:[ \\t\\u3000]+[^。；\\n]{0,40}|[^。；\\n\\s]{0,6}(?![^。；\\s]))?';
const DEFAULT_CHAPTER_PATTERN = '^\\s*(?:[\\[【（(]\\s*)?(?:'
  + '第\\s*[' + NUM_CHARS + ']{1,9}\\s*[章节卷回部集话]' + TITLE_TAIL
  + '|卷[' + NUM_CHARS + ']{1,9}' + TITLE_TAIL
  + '|(?:序章|序言|楔子|引子|尾声|终章|后记|番外|終章|後記|尾聲)[^。；\\n]{0,20}'
  + '|(?:Chapter|CHAPTER|chapter)\\s*\\d+\\s*[^\\n]{0,40}'
  + ')\\s*(?:[\\]】）)]\\s*)?$';

// 中等长度章节候选: 严格正则漏掉时，用“章节标记 + 上下文”兜底。
// 只接受标题特征明显、或明显独立成行的候选，避免把“第二节课开始了……”当章节。
const LOOSE_HEAD_RE = new RegExp(
  '^\\s*(?:[\\[【（(]\\s*)?('
  + '第\\s*[' + NUM_CHARS + ']{1,9}\\s*[章节卷回部集话]'
  + '|卷[' + NUM_CHARS + ']{1,9}'
  + '|(?:序章|序言|楔子|引子|尾声|终章|后记|番外|終章|後記|尾聲)'
  + '|(?:Chapter|CHAPTER|chapter)\\s*\\d+'
  + ')([^\\n]*)$'
);
const TITLE_PUNCT_RE = /[：:·—–\-（）()【】「」『』“”‘’《》]/;
const BODY_START_RE = /^(?:课|天|次|个|些|位|名|种|样|时|刻|年|月|日|周|秒|分|小时|会儿|开始|结束|之后|以前|的|是|有|在|我|你|他|她|它|我们|你们|他们|大家|老师|同学)/;

const isBlank = (s) => String(s || '').trim() === '';

// 返回 { tail } 或 null；tail 已去掉包裹括号与首尾空白
function looseChapterTail(line) {
  const m = String(line || '').match(LOOSE_HEAD_RE);
  if (!m) { return null; }
  let tail = m[2].trim().replace(/\s*(?:[\]】）)]\s*)?$/, '').trim();
  if (!tail) { return { tail: '' }; }
  if (tail.length > 36) { return null; }
  if (/[。；]/.test(tail)) { return null; }
  // ！？… 只允许出现在标题末尾，避免“！后面还有正文”被当成标题
  if (/[！？…][\s\S]+/.test(tail)) { return null; }
  return { tail };
}

function isLooseChapterLine(lines, i, cand) {
  if (!cand) { return false; }
  const prev = i > 0 ? lines[i - 1] : '';
  const next = i < lines.length - 1 ? lines[i + 1] : '';
  const blankAround = isBlank(prev) || isBlank(next);
  const neighborLong = (prev.trim().length >= 50) || (next.trim().length >= 50);
  const standalone = blankAround || neighborLong;
  const hasTitlePunct = TITLE_PUNCT_RE.test(cand.tail);
  // 明显的正文口吻（“第二节课开始了……”）直接拒绝
  if (BODY_START_RE.test(cand.tail)) { return false; }
  if (standalone) { return true; }
  if (hasTitlePunct && cand.tail.length <= 30) { return true; }
  return cand.tail.length <= 8;
}

// 编译结果按模式串缓存: 面板每次防抖更新都会调 buildChapterRegex，避免重复编译
const _regexCache = new Map();

function buildChapterRegex(pattern) {
  const key = pattern || '';
  let re = _regexCache.get(key);
  if (re) {
    return re;
  }
  try {
    re = new RegExp(key || DEFAULT_CHAPTER_PATTERN);
  } catch (e) {
    re = new RegExp(DEFAULT_CHAPTER_PATTERN);
  }
  _regexCache.set(key, re);
  return re;
}

// 返回所有章节名所在行号（升序）
function chapterLines(lines, pattern) {
  return chapterEntries(lines, pattern).map((e) => e.line);
}

// 卷-章两级结构: 卷行（第一卷/卷二）标记 kind='volume', 章行 kind='chapter'
const VOLUME_RE = /^\s*(?:第[〇零一二三四五六七八九十百千万两0-9０-９]{1,9}\s*卷(?![章节话回集部])|卷[〇零一二三四五六七八九十百千万两0-9０-９]{1,9})/;

function chapterEntries(lines, pattern) {
  const re = buildChapterRegex(pattern);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let ok = re.test(line);
    if (!ok) {
      const cand = looseChapterTail(line);
      ok = isLooseChapterLine(lines, i, cand);
    }
    if (ok) {
      out.push({
        line: i,
        title: line.trim().slice(0, 80) || ('第 ' + (i + 1) + ' 行'),
        kind: VOLUME_RE.test(line) ? 'volume' : 'chapter',
      });
    }
  }
  return out;
}

// ---------- 章节号统一（阿拉伯 → 汉字） ----------

const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const CN_UNITS = ['', '十', '百', '千'];
const CN_GROUPS = ['', '万', '亿'];
const FW_DIGITS = { '０': 0, '１': 1, '２': 2, '３': 3, '４': 4, '５': 5, '６': 6, '７': 7, '８': 8, '９': 9 };

// 整数 → 汉字数字（小写: 一二三…十百千万亿）。
// 规则: 末尾零不写（110→一百一十）；数中间的零只补一个（105→一百零一）；
// 万/亿组缺千位时跨组补零（10001→一万零一）；10~19 开头不写"一"（10→十、12→十二）。
function numToCn(num) {
  const n = Number(num);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) { return ''; }
  if (n === 0) { return '零'; }
  const groups = [];
  let v = n;
  while (v > 0) { groups.push(v % 10000); v = Math.floor(v / 10000); }
  const parts = []; // 从高到低 [{ seg, out }]
  for (let g = groups.length - 1; g >= 0; g--) {
    const seg = groups[g];
    if (seg === 0) { continue; } // 整组为零: 不输出, 跨组零在拼接时按需补
    let segOut = '';
    for (let i = 3; i >= 0; i--) {
      const d = Math.floor(seg / Math.pow(10, i)) % 10;
      if (d === 0) {
        if (segOut && !segOut.endsWith('零')) { segOut += '零'; }
      } else {
        segOut += CN_DIGITS[d] + CN_UNITS[i];
      }
    }
    segOut = segOut.replace(/零+$/, '');
    parts.push({ seg, out: segOut + CN_GROUPS[g] });
  }
  let res = '';
  for (let i = 0; i < parts.length; i++) {
    if (i > 0 && parts[i].seg < 1000) { res += '零'; } // 高组存在但本组无千位 → 跨组零
    res += parts[i].out;
  }
  if (res.startsWith('一十')) { res = res.slice(1); }
  return res;
}

// 第N+单位（第123章 / 第４５卷…）。只取行内第一处 = 章节标记本身；
// 且 unifyChapterNumbers 只处理已通过章节正则识别的行，正文里的"第3次"碰不到
const CH_ARABIC_RE = /(第)([0-9０-９]+)(?=\s*[章节卷回部集话])/;
// 行首"卷N"样式（卷123）
const VOL_ARABIC_RE = /^(\s*卷)([0-9０-９]+)/;

function fwToInt(s) {
  let v = 0;
  for (const ch of s) {
    const d = FW_DIGITS[ch] !== undefined ? FW_DIGITS[ch] : (ch >= '0' && ch <= '9' ? ch.charCodeAt(0) - 48 : -1);
    if (d < 0) { return NaN; }
    v = v * 10 + d;
  }
  return v;
}

// 只改"已识别为章节名"的行: 第123章→第一百二十三章, 卷99→卷九十九; 正文行与其他数字一律不动
function unifyChapterNumbers(lines, pattern) {
  const chapterSet = new Set(chapterEntries(lines, pattern).map((e) => e.line));
  const out = lines.slice();
  const changed = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/[0-9０-９]/.test(line) || !chapterSet.has(i)) { continue; }
    let m = line.match(CH_ARABIC_RE);
    let from;
    let to;
    if (m) {
      const cn = numToCn(fwToInt(m[2]));
      if (!cn) { continue; }
      from = m[0];
      to = '第' + cn;
      out[i] = line.slice(0, m.index) + to + line.slice(m.index + m[0].length);
    } else if ((m = line.match(VOL_ARABIC_RE))) {
      const cn = numToCn(fwToInt(m[2]));
      if (!cn) { continue; }
      from = '卷' + m[2];
      to = '卷' + cn;
      out[i] = m[1] + cn + line.slice(m.index + m[0].length);
    } else {
      continue;
    }
    changed.push({ line: i, from, to });
  }
  return { lines: out, changed };
}

// ---------- 章节缺失检查 ----------

const FW_DIG_MAP = { '０': '0', '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6', '７': '7', '８': '8', '９': '9' };

// 从章节行提取编号: 第12章→12, 第十二章→12, 第一千零二十四章→1024; 序章/番外→null
function chapterNumber(title) {
  const m = String(title || '').match(/第\s*([0-9０-９〇零一二三四五六七八九十百千万两]+)\s*[章节回集话]/);
  if (!m) { const english = String(title || '').match(/\bchapter\s*(\d+)/i); return english ? Number(english[1]) : null; }
  const raw = m[1].replace(/[０-９]/g, (c) => FW_DIG_MAP[c]);
  if (/^\d+$/.test(raw)) { return Number(raw); }
  const n = cnNumeral(raw);
  return n > 0 ? n : null;
}

// 分卷检查编号连续性: 每卷内提取编号, 找 [min,max] 间缺失; 无编号章不计入
function chapterGaps(lines, pattern) {
  const entries = chapterEntries(lines, pattern);
  const rawGroups = [[]];
  for (const e of entries) {
    if (e.kind === 'volume') {
      rawGroups.push([]);
    } else {
      rawGroups[rawGroups.length - 1].push(e);
    }
  }
  let totalChapters = 0;
  let totalMissing = 0;
  let totalUnparsed = 0;
  let totalDuplicates = 0;
  const duplicateSamples = [];
  const groups = [];
  for (const g of rawGroups) {
    if (!g.length) { continue; }
    const numbers = [];
    let unparsed = 0;
    for (const e of g) {
      const n = chapterNumber(e.title);
      if (n === null || n <= 0) { unparsed++; } else { numbers.push(n); }
    }
    const frequencies = new Map();
    for (const n of numbers) frequencies.set(n, (frequencies.get(n) || 0) + 1);
    const dup = [...frequencies.keys()].filter(n => frequencies.get(n) > 1);
    for (const n of new Set(dup)) {
      totalDuplicates++;
      duplicateSamples.push('第' + n + '章×' + frequencies.get(n));
    }
    let missing = [];
    let min = 0;
    let max = 0;
    if (numbers.length) {
      min = Math.min(...numbers);
      max = Math.max(...numbers);
      const sorted = [...frequencies.keys()].sort((a, b) => a - b);
      for (let index = 1; index < sorted.length; index++) {
        const first = sorted[index - 1] + 1;
        const last = sorted[index] - 1;
        if (last < first) continue;
        if (last - first < 5000 && missing.length + last - first + 1 <= 5000) {
          for (let n = first; n <= last; n++) missing.push(n);
        } else missing.push(first === last ? String(first) : first + '–' + last);
        totalMissing += last - first + 1;
      }
    }
    totalChapters += g.length;

    totalUnparsed += unparsed;
    groups.push({ count: g.length, numbered: numbers.length, unparsed, min, max, missing, duplicates: [...new Set(dup)] });
  }
  return { totalChapters, totalMissing, totalUnparsed, totalDuplicates, duplicateSamples, groups };
}

module.exports = {
  DEFAULT_CHAPTER_PATTERN,
  buildChapterRegex,
  chapterLines,
  chapterEntries,
  numToCn,
  unifyChapterNumbers,
  chapterNumber,
  chapterGaps,
};
