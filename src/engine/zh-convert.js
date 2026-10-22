'use strict';

// 繁→简 转换引擎（v3: OpenCC 全量字表 + 变体组合 + GB2312 简体零误伤）
//
// 数据层: zh-convert-data.js —— scripts/gen-zh-data.js 从 OpenCC 生成
//   - ~3600 字对（繁→简主表 + CJK 兼容区/日文新字体组合, 简体同形字已拦截）
//   - ~480 歧义词组（乾坤/瞭望/回覆/神祇…, 先于字符层匹配）
//
// 手工层: OpenCC 保守策略不覆盖、但小说文本高频的场景
//   - 著→着   看著/拿著/想著…; 著作/著名/显著 等 40+ 词组保护（繁/简双键）
//   - 祇→只   祇是/祇有/祇能…; 神祇 词组保护
//   - 瞭→了   瞭解/瞭如指掌…; 瞭望/瞭哨 词组保护
//   - 儸→罗   OpenCC 映射为㑩; 小说中仅见"侏儸紀", 覆盖为罗
//   - 妳/牠/姪/錬/徚/覇/槪/汚/倐 等 10 个变体字 OpenCC 未收
//
// API:
//   t2s(text)          → string          （保持不变）
//   t2sDetail(text)    → { output, changes: [{from, to}] }  转换明细（词组级/字符级）
//
// 匹配: 词组按首字分桶 + 桶内长词优先, 大文件无全表扫描

const { CHARS, PHRASES } = require('./zh-convert-data');

// ── 手工补充字符（覆盖/补充 OpenCC 默认）──
const EXTRA_CHARS = [
  '著着', // OpenCC 不转; 小说中助词用法占绝对多数
  '祇只', // OpenCC 默认保持; 小说中"祇是/祇有"高频
  '瞭了', // OpenCC 默认保持; 瞭解 ≫ 瞭望, 瞭望/瞭哨由词组保护
  '儸罗', // OpenCC 映射为㑩(猡㑩义); 小说中仅见"侏儸紀", 覆盖为罗
  '倐倏', // 异体字, OpenCC 未收
  // OpenCC 未收的变体字（原手工表遗留, 实测出现于网文）
  '妳你', '牠它', '姪侄', '錬炼', '徚悚', '覇霸', '槪概', '汚污',
];

// ── 手工补充词组 ──
// 著系说明: EXTRA_CHARS 有 著→着, 但"著"在简体中也是合法字（显著/著作）,
// 因此含"著"的合法词需要 繁体键 + 简体键 双份保护（繁键钉住繁体输入, 简键钉住简体输入）
const EXTRA_PHRASES = [
  // 著 (zhù, 显著义) 保留繁形, 其余场景 著→着 —— 简体键
  ['著作', '著作'], ['著名', '著名'], ['著称', '著称'], ['著述', '著述'],
  ['著者', '著者'], ['原著', '原著'], ['名著', '名著'], ['编著', '编著'],
  ['译著', '译著'], ['论著', '论著'], ['合著', '合著'], ['专著', '专著'],
  ['遗著', '遗著'], ['拙著', '拙著'], ['大著', '大著'], ['昭著', '昭著'],
  ['卓著', '卓著'], ['显著', '显著'], ['土著', '土著'], ['巨著', '巨著'],
  ['执著', '执著'], ['著录', '著录'],
  // 注意: 不保护"著书/著書" —— 助词"著+書"（看著書）频率远高于动宾"著書"（著书立说）
  // 著系 —— 繁体键
  ['著稱', '著称'], ['編著', '编著'], ['譯著', '译著'], ['論著', '论著'],
  ['專著', '专著'], ['遺著', '遗著'], ['顯著', '显著'], ['執著', '执著'],
  ['著錄', '著录'],
  // 甚麼 → 什么（OpenCC 按字保守不转）
  ['甚麼', '什么'], ['甚麽', '什么'],
  // 藉系"借"义补全（OpenCC 词组缺这三条）
  ['藉著', '借着'], ['藉詞', '借词'], ['藉機', '借机'],
  // 简体合法词钉住（GB2312 内的歧义字, 字符层会转, 词组层挡回）
  ['瞭哨', '瞭哨'],
  ['哪吒', '哪吒'],           // 吒→咤 会误伤"哪吒"
  ['乾清宫', '乾清宫'], ['乾陵', '乾陵'], // 乾→干 的简体专名
];

// ── 字符表 ──
const T2S = new Map();
for (const pair of [...CHARS, ...EXTRA_CHARS]) {
  if (pair.length !== 2) { throw new Error('zh-convert 字对长度错误: ' + JSON.stringify(pair)); }
  const t = pair[0];
  const s = pair[1];
  if (t === s || t.codePointAt(0) < 0x2E80 || s.codePointAt(0) < 0x2E80) { continue; }
  T2S.set(t, s);
}

// ── 词组桶: 首字 → [[繁词, 简词], ...], 桶内长词优先 ──
// 恒等词组（乾坤→乾坤）必须保留: 它们的作用是"挡住"字符层的 乾→干
const _BUCKETS = new Map();
for (const [t, s] of [...PHRASES, ...EXTRA_PHRASES]) {
  if ([...t].length < 2) { continue; }
  const head = t[0];
  if (!_BUCKETS.has(head)) { _BUCKETS.set(head, []); }
  _BUCKETS.get(head).push([t, s]);
}
for (const bucket of _BUCKETS.values()) {
  bucket.sort((a, b) => b[0].length - a[0].length);
}

function _convert(text, collect) {
  const changes = collect ? [] : null;
  let result = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const bucket = _BUCKETS.get(ch);
    if (bucket) {
      let matched = false;
      for (const [phrase, replacement] of bucket) {
        if (text.startsWith(phrase, i)) {
          result += replacement;
          if (collect) { changes.push({ from: phrase, to: replacement }); }
          i += phrase.length;
          matched = true;
          break;
        }
      }
      if (matched) { continue; }
    }
    const mapped = T2S.get(ch);
    if (mapped) {
      result += mapped;
      if (collect) { changes.push({ from: ch, to: mapped }); }
    } else {
      result += ch;
    }
    i++;
  }
  return { result, changes };
}

function t2s(text) {
  if (!text) { return text; }
  return _convert(text, false).result;
}

// 转换明细: 每次替换（词组级/字符级）记一条 { from, to }, 供调用方聚合展示
function t2sDetail(text) {
  if (!text) { return { output: text, changes: [] }; }
  const { result, changes } = _convert(text, true);
  return { output: result, changes };
}

module.exports = { t2s, t2sDetail, T2S, PAIRS: [...CHARS, ...EXTRA_CHARS] };
