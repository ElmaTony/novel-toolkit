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
  // 台湾正字/异体字（OpenCC 以"台湾标准字形"为由不收; 简体输出需要转换）
  // 来源: OpenCC STCharacters 反查漏网（繁体候选未被 TS 收录且非 GB2312 简体目标）
  '暱昵', '菓果', '鎗枪', '燄焰', '瑯琅', '揹背', '甦苏',
  '籐藤', '荳豆', '隄堤', '拏拿', '斲斫', '蘗檗', '濬浚',
  // 误伤还原映射（v0.16.2 的 TWVariants/JP 错误映射把简体转成了这些异体字;
  // 值均为 GB2312 未收录字, 简体文本中不会合法出现, 补入零冲突）
  // 冲突值(滤/缺/豫/辨/艺/滨/罐/夹/丝/糖 本身是合法简体)无法映射, 只能靠原文重转
  '襃褒', '痺痹', '飜翻', '晄晃', '郞郎', '萠萌', '甁瓶',
  '愼慎', '敍叙', '硏研', '睪睾', '簷檐', '㩩罗',
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
  ['乾嘉', '乾嘉'], ['乾道', '乾道'],     // 年号保留乾
  ['文徵明', '文徵明'],                   // 明代画家, 人名保留徵
  ['宮商角徵羽', '宫商角徵羽'],           // 五音之徵(zhǐ) 保留
  // 误伤还原词组（v0.16.2 误伤后的固定词形 → 正确词形; 均为无意义词形, 简体文本不会天然出现）
  ['艺艺', '芸芸'],     // 芸芸众生 曾被误转为 艺艺众生
  ['豫以', '予以'],     // 予以/豫以
  ['沙家滨', '沙家浜'], // 地名
  ['滤剧', '沪剧'], ['滤上', '沪上'], ['滤语', '沪语'], // 沪 误伤族
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
// 同键按后者优先去重，保证 EXTRA_PHRASES 可覆盖 OpenCC 默认词组。
const _PHRASE_MAP = new Map();
for (const [t, s] of [...PHRASES, ...EXTRA_PHRASES]) {
  if ([...t].length < 2) { continue; }
  _PHRASE_MAP.set(t, s);
}
const _BUCKETS = new Map();
for (const [t, s] of _PHRASE_MAP) {
  const head = t[0];
  if (!_BUCKETS.has(head)) { _BUCKETS.set(head, []); }
  _BUCKETS.get(head).push([t, s]);
}
for (const bucket of _BUCKETS.values()) {
  bucket.sort((a, b) => b[0].length - a[0].length);
}
// 仅当输出词形再次运行 _convert 会被破坏时，才补入二次保护词条（避免纯简体词污染“词组保护”清单）。
const _DIRTY_BUCKETS = new Set();
for (const [source, output] of _PHRASE_MAP) {
  if (source === output || [...output].length < 2) continue;
  if (_convert(output, false).result !== output) {
    const head = output[0];
    const bucket = _BUCKETS.get(head) || [];
    if (!bucket.some(([key]) => key === output)) {
      bucket.push([output, output]);
      _BUCKETS.set(head, bucket);
      _DIRTY_BUCKETS.add(head);
    }
  }
}
for (const head of _DIRTY_BUCKETS) {
  _BUCKETS.get(head).sort((a, b) => b[0].length - a[0].length);
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

// 转换清单聚合器（纯函数, 可单测）:
//   恒等命中（from === to, 词组保护）不计入替换总数, 单独归入 protected
//   result(): { totalChanges, changedLines, real: [{from,to,count,lines}], protected: [...] }
function createChangeSummary() {
  const real = new Map();
  const prot = new Map();
  return {
    add(changes, lineNo) {
      for (const c of changes) {
        const bucket = c.from === c.to ? prot : real;
        const key = c.from + '\t' + c.to;
        let e = bucket.get(key);
        if (!e) { e = { from: c.from, to: c.to, count: 0, lines: [] }; bucket.set(key, e); }
        e.count++;
        if (e.lines[e.lines.length - 1] !== lineNo) { e.lines.push(lineNo); }
      }
    },
    result() {
      const realArr = [...real.values()];
      const protArr = [...prot.values()];
      const lineSet = new Set();
      for (const e of realArr) { for (const n of e.lines) { lineSet.add(n); } }
      return {
        totalChanges: realArr.reduce((s, e) => s + e.count, 0),
        changedLines: lineSet.size,
        real: realArr,
        protected: protArr,
        protectedTotal: protArr.reduce((s, e) => s + e.count, 0),
      };
    },
  };
}

module.exports = { t2s, t2sDetail, createChangeSummary, T2S, PAIRS: [...CHARS, ...EXTRA_CHARS] };
