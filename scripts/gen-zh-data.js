'use strict';

// 从 OpenCC 原始数据生成 src/engine/zh-convert-data.js（一次性工具，可重复运行）
//
// 数据源（Apache-2.0, https://github.com/BYVoid/OpenCC）:
//   TSCharacters.txt  行格式: 繁\t简1 [简2 ...]   多候选时取第 1 个为默认
//   TSPhrases.txt     行格式: 繁词\t简词1 [简词2 ...]
//
// 用法: node scripts/gen-zh-data.js [opencc数据目录]   (默认 tmp-opencc/)
//
// 规则:
//   - 字符表: 键或值不是单个 UTF-16 单元、或低于 U+2E80 的行跳过
//   - 恒等映射 (繁===简) 跳过 —— 歧义字默认保持原样, 由引擎层手工覆盖
//     (著/祇/瞭 等小说高频字在 src/engine/zh-convert.js 的 EXTRA_CHARS 处理)
//   - 词组表: 全部保留（含恒等词组, 如 乾坤→乾坤, 用于阻止字符层误转）
//   - 单字词组折入字符表

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'tmp-opencc');
const OUT = path.join(ROOT, 'src', 'engine', 'zh-convert-data.js');

function parseDict(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
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

const rawChars = parseDict(path.join(SRC_DIR, 'TSCharacters.txt'));
const rawPhrases = parseDict(path.join(SRC_DIR, 'TSPhrases.txt'));

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

// 单字"词组"折入字符表; 其余保留
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

// ── 输出 ──
const lines = [];
lines.push("'use strict';");
lines.push('');
lines.push('// 繁→简 数据表 —— 由 scripts/gen-zh-data.js 生成, 请勿手工编辑');
lines.push('// 数据源: OpenCC (https://github.com/BYVoid/OpenCC), Apache-2.0');
lines.push('// 生成时间: ' + new Date().toISOString().slice(0, 10));
lines.push('// 字符 ' + chars.length + ' 对 (多候选歧义字默认保持原样, 引擎层另行覆盖)');
lines.push('// 词组 ' + phrases.length + ' 条 (含恒等词组如 乾坤→乾坤, 阻止字符层误转)');
lines.push('');
lines.push('const CHARS = [');
for (let i = 0; i < chars.length; i += 10) {
  lines.push('  ' + chars.slice(i, i + 10).map((p) => "'" + p + "'").join(', ') + ',');
}
lines.push('];');
lines.push('');
lines.push('const PHRASES = [');
for (let i = 0; i < phrases.length; i += 2) {
  lines.push('  ' + phrases.slice(i, i + 2).map(([t, s]) => "['" + t + "', '" + s + "']").join(', ') + ',');
}
lines.push('];');
lines.push('');
lines.push('module.exports = { CHARS, PHRASES };');
lines.push('');

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');

console.log('字符对:', chars.length, '(原始 ' + rawChars.length + ', 恒等跳过 ' + skippedIdentity +
  ', 非BMP跳过 ' + skippedNonBmp + ', 单字词组折入 ' + foldedSingle + ')');
console.log('词组:', phrases.length, '(原始 ' + rawPhrases.length + ')');
console.log('写出:', path.relative(ROOT, OUT));
