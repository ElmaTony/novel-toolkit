'use strict';

// 从 OpenCC 原始数据生成 src/engine/zh-convert-data.js（一次性工具，可重复运行）
//
// 用法: node scripts/gen-zh-data.js [opencc数据目录]   (默认 tmp-opencc/)
// 数据源准备（Apache-2.0, https://github.com/BYVoid/OpenCC）, 缺失时先下载到 tmp-opencc/:
//   TSCharacters.txt  TSPhrases.txt  CJK_Compatibility_Ideographs.txt  JPShinjitaiCharacters.txt
//   例如: curl -sL -o tmp-opencc/<文件名> "https://cdn.jsdelivr.net/gh/BYVoid/OpenCC@master/data/dictionary/<文件名>"
//   TSCharacters.txt             繁→简 字符（主表; 多候选取第 1 个; 恒等跳过）
//   TSPhrases.txt                繁→简 歧义词组（含恒等保护词组 如 乾坤→乾坤）
//   CJK_Compatibility_Ideographs U+F900 兼容区→标准字（BIG5/GBK 转码残留）
//   JPShinjitaiCharacters.txt    日文新字体→繁体（pixiv 机翻残留; 组合成 日文→简体）
//
// 不使用（方向相反/会污染简体）:
//   TWVariants.txt / HKVariants.txt   方向是 通用字形→台/港字形（如 着→著），组合会反向误转
//   TWPhrases.txt / HKPhrases.txt     方向是 简→繁（大陆→台湾用词）
//
// 安全规则: 变体组合新增的映射, 键若属于 GB2312 简体规范字集则跳过
//   （日文新字体与简体大量同形, 如 欠/翻/研/沪/芸/叙 —— 它们是合法简体字, 不能被转走）

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'tmp-opencc');
const OUT = path.join(ROOT, 'src', 'engine', 'zh-convert-data.js');

function parseDict(file) {
  const p = path.join(SRC_DIR, file);
  if (!fs.existsSync(p)) throw new Error('缺少源字典：' + file + '；未修改现有字表');
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const key = line.slice(0, tab).trim();
    const firstVal = line.slice(tab + 1).trim().split(' ')[0];
    if (!key || !firstVal) continue;
    out.push([key, firstVal]);
  }
  return out;
}

const isSingleBmp = (ch) => ch.length === 1 && ch.codePointAt(0) >= 0x2E80;

// ── 第 1 层: 繁→简 主表 ──
const rawChars = parseDict('TSCharacters.txt');
const rawPhrases = parseDict('TSPhrases.txt');

const chars = [];
const charSeen = new Set();
let skippedIdentity = 0;
let skippedNonBmp = 0;

for (const [t, s] of rawChars) {
  if (!isSingleBmp(t) || !isSingleBmp(s)) { skippedNonBmp++; continue; }
  if (t === s) { skippedIdentity++; continue; }
  if (charSeen.has(t)) continue;
  charSeen.add(t);
  chars.push(t + s);
}

// 主表 Map（供变体组合查询用）
const mainMap = new Map();
for (const pair of chars) { mainMap.set(pair[0], pair[1]); }
const viaMain = (ch) => {
  // 逐字过主表; 未收录的字保持原样（视为已是简体同形）
  if (mainMap.has(ch)) { return mainMap.get(ch); }
  return ch;
};

// ── GB2312 简体规范字集（6763 字, 16-87 区）──
// 变体组合的键若在此集合内, 说明它是合法简体字, 转走它 = 简体误伤
function gb2312Chars() {
  const dec = new TextDecoder('gbk');
  const set = new Set();
  for (let q = 16; q <= 87; q++) {
    for (let w = 1; w <= 94; w++) {
      const s = dec.decode(Buffer.from([0xA0 + q, 0xA0 + w]));
      if (s && s.length === 1 && s.codePointAt(0) >= 0x4E00) { set.add(s); }
    }
  }
  return set;
}
const GB2312 = gb2312Chars();

// ── 第 2 层: 变体字组合（CJK 兼容区 / 日文新字体）──
const VARIANT_SOURCES = [
  'CJK_Compatibility_Ideographs.txt',
  'JPShinjitaiCharacters.txt',
];
const variantCounts = {};
let variantAdded = 0;
let variantBlockedBySimplified = 0;
for (const src of VARIANT_SOURCES) {
  variantCounts[src] = 0;
  for (const [variant, target] of parseDict(src)) {
    if (!isSingleBmp(variant) || ![...target].every(isSingleBmp)) continue;
    if (variant === target) continue;
    // 已被主表收录的不动（主表优先）
    if (charSeen.has(variant)) continue;
    // 键是 GB2312 简体规范字 → 跳过（防简体误伤）
    if (GB2312.has(variant)) { variantBlockedBySimplified++; continue; }
    // 组合: 变体 → 标准繁体 → 简体
    const simplified = [...target].map(viaMain).join('');
    if (variant === simplified) continue;
    if (simplified.length !== 1) continue; // 只收单字→单字
    charSeen.add(variant);
    chars.push(variant + simplified);
    variantCounts[src]++;
    variantAdded++;
  }
}

// ── 第 3 层: 词组（单字"词组"折入字符表）──
const phrases = [];
const phraseSeen = new Set();
let foldedSingle = 0;
for (const [t, s] of rawPhrases) {
  if ([...t].length === 1) {
    if (isSingleBmp(t) && isSingleBmp(s) && t !== s && !charSeen.has(t)) {
      charSeen.add(t);
      chars.push(t + s);
      foldedSingle++;
    }
    continue;
  }
  if (phraseSeen.has(t)) continue;
  phraseSeen.add(t);
  phrases.push([t, s]);
}

if (chars.length < 2000 || phrases.length < 100) throw new Error('源字典异常或不完整，拒绝覆盖现有字表');

// ── 输出 ──
const lines = [];
lines.push("'use strict';");
lines.push('');
lines.push('// 繁→简 数据表 —— 由 scripts/gen-zh-data.js 生成, 请勿手工编辑');
lines.push('// 数据源: OpenCC (https://github.com/BYVoid/OpenCC), Apache-2.0');
lines.push('// 生成时间: ' + new Date().toISOString().slice(0, 10));
lines.push('// 字符 ' + chars.length + ' 对 (繁→简主表 + 变体组合; 多候选歧义字默认保持原样, 引擎层另行覆盖)');
lines.push('// 词组 ' + phrases.length + ' 条 (含恒等词组如 乾坤→乾坤, 阻止字符层误转)');
lines.push('');
const jsStr = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
lines.push('const CHARS = [');
for (let i = 0; i < chars.length; i += 10) {
  lines.push('  ' + chars.slice(i, i + 10).map((p) => jsStr(p)).join(', ') + ',');
}
lines.push('];');
lines.push('');
lines.push('const PHRASES = [');
for (let i = 0; i < phrases.length; i += 2) {
  lines.push('  ' + phrases.slice(i, i + 2).map(([t, s]) => '[' + jsStr(t) + ', ' + jsStr(s) + ']').join(', ') + ',');
}
lines.push('];');
lines.push('');
lines.push('module.exports = { CHARS, PHRASES };');
lines.push('');

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');

console.log('字符对:', chars.length,
  '(TS主表', (chars.length - variantAdded - foldedSingle) +
  ', 恒等跳过 ' + skippedIdentity + ', 非BMP跳过 ' + skippedNonBmp + ')');
console.log('变体组合新增', variantAdded, ':',
  VARIANT_SOURCES.map((s) => s.replace('.txt', '') + ' +' + variantCounts[s]).join(' '),
  '| 简体字保护拦截 ' + variantBlockedBySimplified + ' 条');
console.log('单字词组折入:', foldedSingle);
console.log('词组:', phrases.length, '(原始 ' + rawPhrases.length + ')');
console.log('写出:', path.relative(ROOT, OUT));
