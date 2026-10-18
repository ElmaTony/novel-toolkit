'use strict';

// cool18（留园禁忌书屋）解析层 —— 从 Python 版 cool18_scraper.py 移植为纯 JS
// 页面结构 (2026-10 验证):
//   标题: <h1 class="main-title">…</h1>
//   作者: 送交者: <a …>名字</a> … 于 YYYY-MM-DD HH:MM
//   正文: <div class="content-section" id="content-section"> 内的 <pre>…</pre>
//         （pre 无闭合时回退到 content-section 截断）
//   段落: 正文内 <p></p> 为段落分隔; 源文本含 ~60 字硬换行, 需合并
//   章节链: 正文开头 <B><font size=4> 内一串 <a href="…tid=…">【书名】(NN-MM)</a>

const PARA = '\x00'; // 强段落哨兵: <p></p> 与空行
const WRAP = '\x01'; // 待判定换行哨兵: <br> 与源文本换行（是段落边界还是硬换行由段首缩进判定）
const BBS4 = 'https://www.cool18.com/bbs4/index.php?app=forum&act=threadview&tid=';
const { splitInlineBreaks } = require('../transforms');

const FW_MAP = {
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
  '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
  '－': '-', '—': '-', '–': '-', '（': '(', '）': ')'
};
const foldFW = (s) => String(s || '').replace(/[０-９－—–（）]/g, (c) => FW_MAP[c]);

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', copy: '©',
  reg: '®', trade: '™', middot: '·', deg: '°', times: '×',
  divide: '÷', plusmn: '±', yen: '¥', cent: '¢', pound: '£',
  sect: '§', para: '¶', bull: '•', prime: '′', Prime: '″',
  frac12: '½', sup2: '²', sup3: '³', micro: 'µ', dagger: '†'
};

function unescapeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => {
      const code = parseInt(h, 16);
      try { return String.fromCodePoint(code); } catch (e) { return m; }
    })
    .replace(/&#(\d+);/g, (m, d) => {
      const code = parseInt(d, 10);
      try { return String.fromCodePoint(code); } catch (e) { return m; }
    })
    .replace(/&([a-zA-Z][a-zA-Z0-9]{1,10});/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : m);
}

function cleanText(s) {
  return unescapeEntities(String(s || '').replace(/<[^>]+>/g, '')).trim();
}

// 字节流 → 文本: utf-8 严格 → gb18030 → big5 → utf-8 替换模式
function decodePage(buf) {
  for (const enc of ['utf-8', 'gb18030', 'big5']) {
    try {
      return new TextDecoder(enc, { fatal: true }).decode(buf);
    } catch (e) { /* try next encoding */ }
  }
  return new TextDecoder('utf-8').decode(buf);
}

function extractThread(page, opts = {}) {
  let m = page.match(/<h1 class="main-title">([\s\S]*?)<\/h1>/);
  const title = m ? cleanText(m[1]) : '未知标题';

  m = page.match(/送交者:\s*<a[^>]*>([^<]+)<\/a>/);
  const author = m ? m[1].trim() : '';
  m = page.match(/于\s*(\d{4}-\d{2}-\d{2}[^\n<]*)/);
  const date = m ? m[1].trim() : '';

  m = page.match(/<pre>([\s\S]*?)<\/pre>/i);
  if (!m) {
    m = page.match(/id="content-section">([\s\S]*?)(?=<div class="view_ad_incontent"|<div class="ai-detection-feedback")/i);
  }
  if (!m) {
    throw new Error('找不到正文 (<pre> / content-section 均未命中)');
  }
  const bodyHtml = m[1];

  const links = [];
  for (const am of bodyHtml.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const tm = unescapeEntities(am[1]).match(/tid=(\d+)/);
    if (tm) {
      links.push({ tid: Number(tm[1]), text: cleanText(am[2]) });
    }
  }

  return { title, author, date, body: bodyToText(bodyHtml, opts), links };
}

// 哨兵前的块: 首个全角空格缩进行之前视为元信息(逐行保留), 之后视为正文(合并硬换行)
function splitHead(block) {
  const lines = block.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('\u3000') === 0) {
      return [lines.slice(0, i).join('\n'), lines.slice(i).join('\n')];
    }
  }
  return [block, ''];
}

// 合并段内 ~60 字硬换行; 两侧都是 ASCII 词时补空格防止粘连
function unwrap(para) {
  let p = String(para).replace(/\r/g, '');
  while (p.includes('\n')) {
    p = p.replace(/([A-Za-z0-9,.;:!?])\n([A-Za-z0-9])/, '$1 $2');
    p = p.replace('\n', '');
  }
  return p;
}

const JOIN_RE_A = /[\w]$/;
const JOIN_RE_B = /^[\w]/;
const joinWrap = (a, b) => (JOIN_RE_A.test(a) && JOIN_RE_B.test(b) ? a + ' ' + b : a + b);

// 把片段内的 WRAP 哨兵（<br>/源换行）按硬换行合并掉
function unwrapWrap(s) {
  let p = String(s).replace(new RegExp(WRAP + '+', 'g'), WRAP);
  while (p.includes(WRAP)) {
    p = p.replace(/([A-Za-z0-9,.;:!?])\x01([A-Za-z0-9])/, '$1 $2');
    p = p.replace(WRAP, '');
  }
  return p;
}

// 连续空行折叠为一个
function collapseBlankRuns(lines) {
  const out = [];
  for (let p of lines) {
    p = p.replace(/\s+$/, '');
    if (!p) {
      if (out.length && out[out.length - 1] !== '') {
        out.push('');
      }
      continue;
    }
    out.push(p);
  }
  return out.join('\n').replace(/^\n+|\n+$/g, '');
}

// 站点广告/签名行清理 v2：保守策略，只删“明确是站点签名/纯链接”的行。
// 误伤控制：
//   1) 含站点域名的行，若同时含中文句读（。！？；）→ 视为正文，保留；
//   2) “本文由/更多精彩”只认行首，且限制长度；
//   3) “留园网”只认短行且无句读；
//   4) 所有删除都通过 onRemove 回调交给上层写日志，方便人工复核。
const DOMAIN_RE = /(?:cool18|6park)\.com/i;
const SENTENCE_PUNCT_RE = /[。！？；]/;

function isAdLine(line) {
  const t = String(line || '').trim();
  if (!t || t.length > 160) { return false; }
  if (DOMAIN_RE.test(t)) {
    // 纯域名/链接行：允许删除；一旦像正文句子（含句读）就保留
    return !SENTENCE_PUNCT_RE.test(t) && (t.length <= 120 || /^(?:https?:\/\/|www\.)/i.test(t));
  }
  if (/^[\[【(（]?\s*本帖最后由/.test(t)) { return true; }
  if (/留园网/.test(t) && t.length <= 40 && !SENTENCE_PUNCT_RE.test(t)) { return true; }
  const by = t.match(/^[\[【(（]?\s*本文由([\u4e00-\u9fa5A-Za-z0-9_·]{1,12})(?:整理|发布)/);
  if (by && !/[他她我你们后前的地得]/.test(by[1]) && t.length <= 80) { return true; }
  if (/^[\[【(（]?\s*更多精彩.{0,20}(?:请访问|请关注|请到|请点击|请浏览|尽在)/.test(t) && t.length <= 80) { return true; }
  return false;
}

function stripAdLines(text, onRemove) {
  return String(text || '').split('\n').filter((line) => {
    if (isAdLine(line)) {
      if (typeof onRemove === 'function') { onRemove(line.trim()); }
      return false;
    }
    return true;
  }).join('\n');
}

// 正文归一化 v2 —— cool18 帖子源格式差异极大（2026-10 实测三种形态）:
//   A. <p> 分段 + 段首"　　"          → 直接按 <p> 分段
//   B. <p>/<br> 混用, 60 字硬换行成行  → <br> 应合并回段内
//   C. 仅分章 <p>, 段落间只有换行符,
//      "　　"以行内形式出现           → 须按行内"　　"拆段
// 规则（与"贴左/合并"工具同一信号体系）:
//   段落边界 = <p> / 空行 / 行首或行内的"　　"（2+ 全角空格）
//   其余换行 = 硬换行, 合并回段内
//   首个"　　"段之前的行视为元信息（标题/作者/日期）, 逐行保留
//   完全没有"　　"且无 <p> 的源 → 退回旧行为（逐行保留）
function bodyToText(bodyHtml, opts = {}) {
  let html = String(bodyHtml)
    .replace(/<B>\s*<font[^>]*>\s*/gi, '')
    .replace(/<\/font[^>]*>\s*<\/B>/gi, '')
    .replace(/<a href="[^"]*tid=\d+[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '');

  const hasParaTags = /<p(>| )/i.test(html);

  html = html.replace(/<\/?p[^>]*>/gi, PARA).replace(/<br\s*\/?>/gi, WRAP);
  const text = unescapeEntities(html.replace(/<[^>]+>/g, '')).replace(/\r/g, '').replace(/\n/g, WRAP);

  // 缩进/接缝标记: 全角缩进或 2+ 半角空格接缝都算
  const hasMarkers = /\u3000{2,}/.test(text) || /[ \u00a0]{2,}/.test(text);

  if (!hasMarkers && !hasParaTags) {
    return collapseBlankRuns(text.split(WRAP));
  }

  const paras = [];
  let buf = null;
  let inProse = false;

  const flush = () => {
    if (buf !== null) {
      const p = buf.replace(/\s+$/, '');
      if (p) {
        paras.push(p);
      }
      buf = null;
    }
  };

  for (const seg of text.split(PARA)) {
    // 段中切分（行内"　　"缩进 / 句读+多空格接缝）, 切出的后续片段强制作为新段落
    const pieces = hasMarkers ? splitInlineBreaks(seg) : [seg];
    for (let k = 0; k < pieces.length; k++) {
      let piece = pieces[k].replace(/^[ \t]+/, '');
      if (!piece) {
        continue;
      }
      const startsIndent = hasMarkers && /^\u3000{2}/.test(piece);
      if (startsIndent) {
        if (!inProse) {
          // 从元信息区进入正文: 去掉元信息末尾的空行
          while (paras.length && paras[paras.length - 1] === '') {
            paras.pop();
          }
        }
        inProse = true;
      }
      if (!inProse) {
        // 元信息区: 逐行保留, 空行折叠
        flush();
        for (const ln of piece.split(WRAP)) {
          const t2 = ln.replace(/\s+$/, '');
          if (!t2) {
            if (paras.length && paras[paras.length - 1] !== '') {
              paras.push('');
            }
          } else {
            paras.push(t2);
          }
        }
        continue;
      }
      if (startsIndent || k > 0 || buf === null) {
        flush();
        buf = unwrapWrap(piece);
      } else {
        buf = joinWrap(buf, unwrapWrap(piece));
      }
    }
    flush(); // PARA = 强段落边界
  }
  flush();

  const cleaned = collapseBlankRuns(paras);
  return opts.cleanAds === false ? cleaned : stripAdLines(cleaned, opts.onRemove);
}

// 中文数字 → 阿拉伯数字（支持 〇零一二三四五六七八九十百千万两，如 二十三→23、一百零五→105）
function cnNumeral(str) {
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units = { 十: 10, 百: 100, 千: 1000, 万: 10000, 亿: 100000000 };
  let total = 0;
  let section = 0;
  let num = 0;
  for (const ch of String(str || '')) {
    if (Object.prototype.hasOwnProperty.call(digits, ch)) {
      num = digits[ch];
    } else if (Object.prototype.hasOwnProperty.call(units, ch)) {
      const u = units[ch];
      if (u >= 10000) {
        section = (section + num) * u;
        total += section;
        section = 0;
      } else {
        section += (num || 1) * u;
      }
      num = 0;
    } else {
      return 0;
    }
  }
  return total + section + num;
}

// 部序: 章号后紧邻的 上/中/下（或 前/中/后）分部 —— （5上）（13中）第5章(下) 这类一章分帖连载
// 部序字符后不能再紧跟汉字/数字, 否则视为正文词（"第5章 中间人"的 中、"第5章前的回忆"的 前 都不匹配）
const PART_MAP = { 前: 1, 上: 1, 中: 2, 下: 3, 后: 3 };
function partIndex(s) {
  const m = s.match(/(?:\d{1,4}|[〇零一二三四五六七八九十百千万两]{1,8})(?:\s*[章节卷回部集话])?\s*[（(\[【]?\s*([上中下前后])(?![〇零一二三四五六七八九十百千万两0-9０-９\u4e00-\u9fff])/);
  return m ? (PART_MAP[m[1]] || 0) : 0;
}

// 从帖子标题/链接文字解析排序键 [卷号, 章号, 部序, tid, 章号结束]
// v5: 部序进键（且在 tid 之前）—— 同章 上/中/下 分帖是不同内容, 不参与"同章去重保长版"
// v4: 卷 > 章两级排序（一卷内章号可独立编排）; 章号优先于卷号提取（"第二卷…第五十二章"→卷2章52）;
//     日期去毒（"2026-01-08"不是章节号）; 无"第X单位"时退回显式区间/末两数字
function chapterKey(text, tid) {
  const s = foldFW(text)
    .replace(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?/g, ' '); // 日期去毒: 发布日期不是章节号
  const part = partIndex(s);
  let vol = null;
  let chap = null;
  for (const mm of s.matchAll(/第([〇零一二三四五六七八九十百千万两0-9０-９]{1,8})([章节卷回部集话])/g)) {
    const n = /^\d+$/.test(mm[1]) ? Number(mm[1]) : cnNumeral(mm[1]);
    if (!(n > 0) || n > 100000) {
      // 超大编号不是正常章节号（远端标题可构造"第99999999话"），直接忽略防下游无界循环
      continue;
    }
    if (mm[2] === '卷') {
      if (vol === null) {
        vol = n;
      }
    } else if (chap === null) {
      chap = n;
      break; // 第一个章号即为准（章比卷更细）
    }
  }
  if (vol === null && chap === null) {
    // 无"第X单位": 显式区间(84-85) / 末两个数字兜底
    let m = s.match(/(?:^|[^\d])(\d{1,3})\s*[-~～]\s*(\d{1,3})(?!\d)/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      return [0, Math.min(a, b), part, tid, Math.max(a, b)];
    }
    const nums = s.match(/\d+/g) || [];
    if (nums.length >= 2) {
      const a = Number(nums[nums.length - 2]);
      const b = Number(nums[nums.length - 1]);
      return [0, Math.min(a, b), part, tid, Math.max(a, b)];
    }
    if (nums.length === 1) {
      return [0, Number(nums[0]), part, tid, Number(nums[0])];
    }
    return [1e9, 0, part, tid, 0]; // 解析不出任何编号的排最后
  }
  return [vol === null ? 0 : vol, chap === null ? 0 : chap, part, tid, chap === null ? 0 : chap];
}

// 搜索结果页解析: 抽取含 tid= 的帖子链接（按页面顺序去重）
function parseSearchResults(page) {
  const links = [];
  const seen = new Set();
  const re = /<a\s+href="([^"]*tid=\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(page)) !== null) {
    const text = cleanText(m[2]);
    const tidM = unescapeEntities(m[1]).match(/tid=(\d+)/);
    if (!tidM || !text) {
      continue;
    }
    if (seen.has(tidM[1])) {
      continue;
    }
    seen.add(tidM[1]);
    links.push({ tid: Number(tidM[1]), title: text });
  }
  return links;
}

function sanitizeName(name) {
  let s = String(name || '')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/^_+|_+$/g, '');
  // 标题来自远端页面不可信：剥开头的点（防 '..' 逃出输出目录）、Windows 保留设备名前缀化
  s = s.replace(/^\.+/, '');
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i.test(s)) s = '_' + s;
  return s.slice(0, 80) || 'untitled';
}

// 粘贴文本 → 按顺序去重的帖子 URL 列表。支持: 完整链接 / 纯tid / 行尾带标题
function parseEntries(text, logFn = () => {}) {
  const entries = [];
  const seen = new Set();
  for (const raw of String(text || '').split(/\r?\n/)) {
    const s = raw.trim().replace(/[０-９]/g, (c) => FW_MAP[c]);
    if (!s || s.startsWith('#')) {
      continue;
    }
    let m = s.match(/tid=(\d+)/);
    if (!m) {
      m = s.match(/^(\d{6,})$/);
    }
    if (!m) {
      if (/https?:\/\//.test(s)) {
        logFn('[忽略] 链接里没有 tid: ' + raw.trim().slice(0, 70));
      }
      continue;
    }
    if (seen.has(m[1])) {
      logFn('[跳过] 重复 tid=' + m[1]);
      continue;
    }
    seen.add(m[1]);
    entries.push(BBS4 + m[1]);
  }
  return entries;
}

function isCool18ish(text) {
  return /cool18\.com|tid=\d+|(?:^|\s)\d{6,}(?:\s|$)/m.test(String(text || ''));
}

module.exports = {
  PARA,
  BBS4,
  foldFW,
  unescapeEntities,
  cleanText,
  decodePage,
  extractThread,
  bodyToText,
  splitHead,
  unwrap,
  stripAdLines,
  chapterKey,
  parseSearchResults,
  cnNumeral,
  sanitizeName,
  parseEntries,
  isCool18ish
};
