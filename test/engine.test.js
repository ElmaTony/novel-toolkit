'use strict';

// 纯离线测试: node test/engine.test.js
// 不打网络、不碰用户目录 —— 落盘全部走 os.tmpdir() 临时目录
// 覆盖: 整理引擎(transforms/chapters) / cool18 解析(fixtures) / Pixiv 全流程(FakeFetcher)

const fs = require('fs');
const path = require('path');
const { makeTemp } = require('./temp');

const t = require('../src/engine/transforms');
const chaptersMod = require('../src/engine/chapters');
const zh = require('../src/engine/zh-convert');
const c18 = require('../src/engine/cool18/parse');
const { parseInput: pixivParseInput } = require('../src/engine/pixiv/parseInput');
const { renderContent } = require('../src/engine/pixiv/render');
const { sanitizeName: pixivSanitize, Writer } = require('../src/engine/pixiv/writer');
const { extractCookie, classify, PixivError } = require('../src/engine/pixiv/fetcher');
const { PixivCore } = require('../src/engine/pixiv/index');

let pass = 0;
let fail = 0;
const fails = [];
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; fails.push(name); console.log('FAIL: ' + name); }
}
function ok(cond, msg) { check(msg, cond); }
function eq(a, b, msg) {
  if (a === b) { pass++; }
  else { fail++; fails.push(msg); console.log('FAIL: ' + msg + ' (期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a) + ')'); }
}

// ============ 1. 整理引擎 ============
console.log('== 整理引擎 transforms/chapters');

check('短行: 句号', t.isShortPunctLine('。', 2));
check('短行: 带缩进句号', t.isShortPunctLine('　　。', 2));
check('短行: 纯省略号不报', !t.isShortPunctLine('……', 2));
check('短行: 带缩进省略号不报', !t.isShortPunctLine('　　……', 2));
check('短行: 省略号夹实义标点仍报', t.isShortPunctLine('…。', 2));
check('短行: 省略号加汉字不报', !t.isShortPunctLine('嗯……', 2));
check('短行: 长分隔线不报', !t.isShortPunctLine('————', 2));
check('短行: 含汉字不报', !t.isShortPunctLine('嗯？', 2));

const mg = t.mergeLines(['　　第一段内容', '被折行的一半。', '', '　　第二段。', '接着写1TB硬盘'], {});
check('merge: 合并2处', mg.merged === 2);
check('merge: 段落数2', mg.paragraphs === 2);
check('merge: 拼接结果', mg.lines[2] === '　　第二段。接着写1TB硬盘');
check('merge: 保留空行', mg.lines[1] === '');
const mgA = t.mergeLines(['　　abc', 'def'], {});
check('merge: 英文两侧补空格', mgA.lines[0] === '　　abc def');
// smartParagraphs: 每行都有缩进时，不把每一行都当新段落
const mgSmart = t.mergeLines([
  '　　第一段第一行，还没说完',
  '　　第一段第二行，说完了。',
  '　　第二段开始。',
], { smartParagraphs: true });
check('merge-smart: 段内折行合并', mgSmart.merged === 1 && mgSmart.paragraphs === 2);
check('merge-smart: 句末标点后另起段', mgSmart.lines.length === 2 && mgSmart.lines[1] === '　　第二段开始。');
// 对话引号开头也另起段
const mgDialog = t.mergeLines([
  '　　他推开门，看到',
  '　　“你来了。”她说。',
], { smartParagraphs: true });
check('merge-smart: 对话引号另起段', mgDialog.paragraphs === 2);

const dd = t.dedentLines(['　　A', 'B', '\tC']);
check('dedent: 2处', dd.count === 2 && dd.lines[0] === 'A' && dd.lines[2] === 'C');
const id = t.indentLines(['A', '　　B', '', 'C'], { indentString: '　　' });
check('indent: 加2跳1空1', id.added === 2 && id.skipped === 1 && id.lines[0] === '　　A' && id.lines[1] === '　　B' && id.lines[2] === '');
const id2 = t.indentLines(['第一章 开端', '正文'], { indentString: '　　', skipChapterTitles: true, chapterPattern: undefined });
check('indent: 跳过章节名', id2.added === 1 && id2.skipped === 1 && id2.lines[0] === '第一章 开端');
const idNorm = t.indentLines(['   四空格缩进', '　单全角空格', '　　标准缩进'], { indentString: '　　', normalizeExisting: true });
check('indent: 统一已有缩进', idNorm.normalized === 2 && idNorm.lines[0] === '　　四空格缩进' && idNorm.lines[1] === '　　单全角空格');
check('indent: 标准缩进不重复', idNorm.skipped === 1 && idNorm.lines[2] === '　　标准缩进');

const rb = t.removeBlankLines(['　　第一段', '', '　　', '   ', '正文']);
check('blank: 删3行', rb.removed === 3 && rb.lines.length === 2);

const lines6 = ['书名：测试', '第一章 开始', '　　内容一。', '第二章 继续', '　　内容二。', '', '第三章 再会', '　　内容三。'];
const chs6 = chaptersMod.chapterLines(lines6);
check('chapters: 识别3章', chs6.length === 3 && chs6.join(',') === '1,3,6');
const ib = t.insertBlanksBeforeChapters(lines6, chs6);
check('insert: 仅第二章前插1处', ib.added === 1);
check('insert: 第二章前有空行', ib.lines[ib.lines.indexOf('第二章 继续') - 1] === '');
check('insert: 第三章前不重复插', ib.lines[ib.lines.indexOf('第三章 再会') - 1] === '');
check('chapters: 坏正则回退默认', chaptersMod.buildChapterRegex('(((').test('第一章 x'));
check('chapters: 识别番外', chaptersMod.buildChapterRegex().test('番外一 日常'));

// 卷-章两级结构
const ve = chaptersMod.chapterEntries([
  '本书简介', '第一卷 风起云涌', '第一章 开始', '　　正文一', '卷二 短暂的平静', '第二章 继续', '第三卷', '第三章 结束',
]);
eq(ve.filter((e) => e.kind === 'volume').length, 3, '卷: 第一卷/卷二/第三卷 识别为 volume');
eq(ve.filter((e) => e.kind === 'chapter').length, 3, '卷: 三章识别为 chapter');
eq(ve.find((e) => e.line === 1).kind, 'volume', '卷: 第一卷行 kind=volume');
eq(ve.find((e) => e.line === 4).kind, 'volume', '卷: "卷二"式命名也识别');
eq(ve.find((e) => e.line === 2).kind, 'chapter', '卷: 第一章行 kind=chapter');
eq(chaptersMod.chapterLines([
  '本书简介', '第一卷 风起云涌', '第一章 开始', '　　正文一', '卷二 短暂的平静', '第二章 继续', '第三卷', '第三章 结束',
]).join(','), '1,2,4,5,6,7', '卷: chapterLines 含卷行');

// 章节正则 v2: 正文句子不得误判为章节（用户实测 "第二节课正是数学课…" 案例）
check('chapters-v2: 裸"第八章"识别', chaptersMod.buildChapterRegex().test('第八章'));
check('chapters-v2: 带标题短行识别', chaptersMod.buildChapterRegex().test('第十二章 风起云涌'));
check('chapters-v2: 无空格标题识别', chaptersMod.buildChapterRegex().test('第一章意外的偏转'));
check('chapters-v2: 序章 带短标题', chaptersMod.buildChapterRegex().test('序章 觉醒'));
check('chapters-v2: 正文长句不识别',
  !chaptersMod.buildChapterRegex().test('　　第二节课正是数学课，铃声还没响李玉英就走了进来把昨晚那一摞试卷交给数学委员发下来，发到我手里时几个不出预料的地方醒目的红叉渗着森森寒气，教室里闹哄哄的只有我心里冰凉。'));
check('chapters-v2: 正文含句号不识别', !chaptersMod.buildChapterRegex().test('第二节课开始了。大家都很安静'));
check('chapters-v2: 序章开头的长正文不识别',
  !chaptersMod.buildChapterRegex().test('序章之后的剧情让人期待，我看得津津有味，一口气看到天亮。'));

// 章节正则 v3: 长标题/长编号/空格/括号/繁体变体（用户报"识别缺少不连贯"后的完善）
check('chapters-v3: 20字以上长标题', chaptersMod.buildChapterRegex().test('第一章 这是一段超过二十个字的长章节标题用来验证不再被截断'));
check('chapters-v3: 40字上限', chaptersMod.buildChapterRegex().test('第一章 ' + '很'.repeat(40)));
check('chapters-v3: 41字超限不识别', !chaptersMod.buildChapterRegex().test('第一章 ' + '很'.repeat(41)));
check('chapters-v3: 长中文编号', chaptersMod.buildChapterRegex().test('第一千零二十四章 大结局'));
check('chapters-v3: 第 12 章 带空格', chaptersMod.buildChapterRegex().test('第 12 章 标题'));
check('chapters-v3: 全角括号包裹', chaptersMod.buildChapterRegex().test('【第一章】'));
check('chapters-v3: 圆括号后缀', chaptersMod.buildChapterRegex().test('第十二章(下)'));
check('chapters-v3: 繁体終章', chaptersMod.buildChapterRegex().test('終章 归途'));
check('chapters-v3: 小写chapter', chaptersMod.buildChapterRegex().test('chapter 3 The Beginning'));
check('chapters-v3: 逗号标题', chaptersMod.buildChapterRegex().test('第十章 昨天，今天，明天'));
check('chapters-v3: 正文以逗号续行不识别',
  !chaptersMod.buildChapterRegex().test('第三天他们起了个大早，收拾好行李就出发了，谁也没再提昨晚的事。'));
check('chapters-v3: 卷号长编号', chaptersMod.buildChapterRegex().test('卷一千零一'));
check('chapters-v3: 数词条后长句不识别',
  !chaptersMod.buildChapterRegex().test('第二节课开始了大家都很安静老师走进教室把手里的课本放在讲台上开始点名'));

// 章节正则 v4: 中等长度 / 标题内标点 / 无空格标题（用户报"中等长度识别不到"）
check('chapters-v4: 标题带感叹号', chaptersMod.buildChapterRegex().test('第十二章 风起云涌！'));
check('chapters-v4: 标题带问号', chaptersMod.buildChapterRegex().test('第十二章 谁在敲门？'));
check('chapters-v4: 标题带省略号', chaptersMod.buildChapterRegex().test('第十二章 尘埃落定…'));
check('chapters-v4: 无空格中等标题（独立行）', (function () {
  const lines = ['第一章 开始', '正文。', '', '第十二章风起云涌时', '', '正文。'];
  return chaptersMod.chapterLines(lines).includes(3);
})());
check('chapters-v4: 无空格中等标题（前后长文）', (function () {
  const lines = ['前面是一段很长的正文，'.repeat(8), '第十二章风起云涌时', '后面是一段很长的正文，'.repeat(8)];
  return chaptersMod.chapterLines(lines).includes(1);
})());
check('chapters-v4: 正文口吻仍不误判',
  !chaptersMod.chapterLines(['第二节课开始了大家都很安静老师走进教室把手里的课本放在讲台上开始点名']).length);

// chapterNumber 编号提取
eq(chaptersMod.chapterNumber('第12章 风起'), 12, '编号: 阿拉伯');
eq(chaptersMod.chapterNumber('第十二章 风起'), 12, '编号: 汉字');
eq(chaptersMod.chapterNumber('第一千零二十四章 大结局'), 1024, '编号: 长汉字');
eq(chaptersMod.chapterNumber('第０５章 全角'), 5, '编号: 全角数字');
eq(chaptersMod.chapterNumber('番外一 日常'), null, '编号: 番外无编号');
eq(chaptersMod.chapterNumber('序章 觉醒'), null, '编号: 序章无编号');

// chapterGaps 缺失检查（分卷分组）
const gapLines = [
  '第一卷 风起',
  '第一章 开始',
  '第二章 发展',
  '第四章 跳跃',
  '第二卷 平静',
  '第二章 再开始',
  '第四章 又跳',
  '番外一 日常',
];
const gaps = chaptersMod.chapterGaps(gapLines);
eq(gaps.totalChapters, 6, '缺失: 章数不含卷/已识别');
eq(gaps.groups.length, 2, '缺失: 两个分卷组');
eq(gaps.groups[0].missing.join(','), '3', '缺失: 卷1缺第3章');
eq(gaps.groups[1].missing.join(','), '3', '缺失: 卷2缺第3章');
eq(gaps.totalMissing, 2, '缺失: 总缺失数');
eq(gaps.totalUnparsed, 1, '缺失: 无编号章不计入');
const gaps2 = chaptersMod.chapterGaps(['序章', '第一章 a', '第二章 b', '第四章 c']);
eq(gaps2.groups.length, 1, '缺失: 无卷时单组');
eq(gaps2.groups[0].missing.join(','), '3', '缺失: 单卷缺第3章');
eq(gaps2.totalUnparsed, 1, '缺失: 序章不参与');
const gaps3 = chaptersMod.chapterGaps(['第一章 a', '第二章 b', '第二章 c', '第三章 d']);
eq(gaps3.totalMissing, 0, '缺失: 编号连续无缺失');
eq(gaps3.totalDuplicates, 1, '缺失: 检出重复编号');


// ============ 1.5 章节号统一（阿拉伯 → 汉字） ============
console.log('== 章节号统一 numToCn / unifyChapterNumbers');

// numToCn: 真数字转换（用户的逐位替换法在 23/105/110 这类数上会碎掉）
const NC = [
  [0, '零'], [1, '一'], [9, '九'],
  [10, '十'], [11, '十一'], [19, '十九'],
  [20, '二十'], [23, '二十三'], [99, '九十九'],
  [100, '一百'], [101, '一百零一'], [105, '一百零五'], [110, '一百一十'], [123, '一百二十三'],
  [200, '二百'], [999, '九百九十九'],
  [1000, '一千'], [1005, '一千零五'], [1010, '一千零一十'], [1100, '一千一百'], [2026, '二千零二十六'],
  [10000, '一万'], [10001, '一万零一'], [10010, '一万零一十'], [12345, '一万二千三百四十五'],
  [100000, '十万'], [1000000, '一百万'], [100050000, '一亿零五万'],
];
for (const [n, want] of NC) {
  eq(chaptersMod.numToCn(n), want, 'numToCn(' + n + ')=' + want);
}
eq(chaptersMod.numToCn(-1), '', 'numToCn 负数返回空');
eq(chaptersMod.numToCn(1.5), '', 'numToCn 非整数返回空');

// unifyChapterNumbers: 只改章节名行
const unLines = [
  '第1章 开端',
  '　　这是正文，提到第2次进攻。',
  '第23章 混战',
  '第100章 百年孤独',
  '　　第105次提及不会被动到，因为这不是章节行。',
  '第一零一章 已是汉字',
  '第4卷 风云',
  '卷56 短暂的平静',
  '第１０７章 全角数字',
];
const un = chaptersMod.unifyChapterNumbers(unLines);
eq(un.lines[0], '第一章 开端', '统一: 第1章→第一章');
eq(un.lines[1], '　　这是正文，提到第2次进攻。', '统一: 正文行不动');
eq(un.lines[2], '第二十三章 混战', '统一: 第23章→第二十三章（逐位替换会碎的数）');
eq(un.lines[3], '第一百章 百年孤独', '统一: 第100章→第一百章');
eq(un.lines[4], '　　第105次提及不会被动到，因为这不是章节行。', '统一: 正文里的数字不动');
eq(un.lines[5], '第一零一章 已是汉字', '统一: 已是汉字的行不动');
eq(un.lines[6], '第四卷 风云', '统一: 第4卷→第四卷');
eq(un.lines[7], '卷五十六 短暂的平静', '统一: 卷56→卷五十六');
eq(un.lines[8], '第一百零七章 全角数字', '统一: 全角数字也转');
eq(un.changed.length, 6, '统一: 恰好 6 处变更');
eq(un.changed[1].from, '第23', '统一: 记录 from（前向断言不含单位字）');
eq(un.changed[1].to, '第二十三', '统一: 记录 to');
eq(un.lines.length, unLines.length, '统一: 行数不变');

// ============ 1.6 繁简转换 ============
console.log('== 繁简转换 zh-convert');

// 数据完整性: 每对恰好 2 字
eq(zh.PAIRS.every((p) => p.length === 2), true, '繁简: 全部字对长度为 2');

// t2s 覆盖用户实测漏字
eq(zh.t2s('後來'), '后来', '繁转简: 後→后');
eq(zh.t2s('藉口'), '借口', '繁转简: 藉口→借口（词组层）');
eq(zh.t2s('憑藉'), '凭借', '繁转简: 憑藉→凭借');
eq(zh.t2s('慰藉'), '慰藉', '繁转简: 慰藉保留（狼藉/慰藉是合法简体）');
eq(zh.t2s('頭髮'), '头发', '繁转简: 髮→发');
eq(zh.t2s('沒有什麼大不了的'), '没有什么大不了的', '繁转简: 沒/麼');
eq(zh.t2s('看著書'), '看着书', '繁转简: 著→着');
eq(zh.t2s('這本著作很有名'), '这本著作很有名', '繁转简: 著作保留著');
eq(zh.t2s('顯著的成效'), '显著的成效', '繁转简: 顯著→显著');
eq(zh.t2s('乾坤'), '乾坤', '繁转简: 乾坤保留乾');
eq(zh.t2s('乾杯'), '干杯', '繁转简: 乾杯→干杯');
eq(zh.t2s('皇后'), '皇后', '繁转简: 皇后不变（後→后不影响已有的后）');
eq(zh.t2s('雙雙墜落'), '双双坠落', '繁转简: 雙/墜');
eq(zh.t2s('一百零五'), '一百零五', '繁转简: 已是简体的行不变');
// v0.11.3 扩充批次抽查（含异体字与口语字）
eq(zh.t2s('驚訝'), '惊讶', '繁转简: 訝');
eq(zh.t2s('喉嚨'), '喉咙', '繁转简: 嚨');
eq(zh.t2s('癱瘓'), '瘫痪', '繁转简: 癱瘓');
eq(zh.t2s('進駐村莊'), '进驻村庄', '繁转简: 駐');
eq(zh.t2s('蘿蔔'), '萝卜', '繁转简: 蔔→卜');
eq(zh.t2s('笑聲迴盪'), '笑声回荡', '繁转简: 迴/盪');
eq(zh.t2s('螞蟻'), '蚂蚁', '繁转简: 螞蟻');
eq(zh.t2s('膝蓋打顫'), '膝盖打颤', '繁转简: 顫');
eq(zh.t2s('香氣氤氳繚繞'), '香气氤氲缭绕', '繁转简: 氳/繚');
eq(zh.t2s('錄影帶'), '录影带', '繁转简: JP变体録（影繁简同形保留）');
eq(zh.t2s('化妝'), '化妆', '繁转简: 妝');
eq(zh.t2s('隕落'), '陨落', '繁转简: 隕');
eq(zh.t2s('質疑危險'), '质疑危险', '繁转简: 質/險（重写时曾丢失，回归测试）');
// v0.16.1 OpenCC 全量表（用户实测第二批漏字）
eq(zh.t2s('並未'), '并未', '繁转简: 並');
eq(zh.t2s('晉升'), '晋升', '繁转简: 晉');
eq(zh.t2s('賢者'), '贤者', '繁转简: 賢');
eq(zh.t2s('言畢'), '言毕', '繁转简: 畢');
eq(zh.t2s('蓬鬆'), '蓬松', '繁转简: 鬆');
eq(zh.t2s('揚起'), '扬起', '繁转简: 揚');
eq(zh.t2s('名聞遐邇'), '名闻遐迩', '繁转简: 邇');
eq(zh.PAIRS.length > 2900, true, '繁简: 字表规模 >2900（OpenCC 全量）');
// v0.16.1 歧义字小说语境默认 + 词组保护
eq(zh.t2s('祇是'), '只是', '繁转简: 祇是→只是（手工覆盖）');
eq(zh.t2s('祇有'), '只有', '繁转简: 祇有→只有');
eq(zh.t2s('神祇'), '神祇', '繁转简: 神祇保留（词组保护）');
eq(zh.t2s('甚麼'), '什么', '繁转简: 甚麼→什么（词组层）');
eq(zh.t2s('覆蓋'), '覆盖', '繁转简: 覆蓋→覆盖（覆默认保留）');
eq(zh.t2s('回覆'), '回复', '繁转简: 回覆→回复（词组层）');
eq(zh.t2s('瞭望'), '瞭望', '繁转简: 瞭望保留（词组保护）');
eq(zh.t2s('瞭解'), '了解', '繁转简: 瞭解→了解（词组层）');
eq(zh.t2s('瞭如指掌'), '了如指掌', '繁转简: 瞭→了（手工覆盖）');
eq(zh.t2s('一目瞭然'), '一目了然', '繁转简: 一目瞭然（词组层）');
eq(zh.t2s('拿著傘'), '拿着伞', '繁转简: 著→着（工具场景）');
eq(zh.t2s('編著一書'), '编著一书', '繁转简: 編著保留著');
eq(zh.t2s('乾淨'), '干净', '繁转简: 乾淨→干净');
eq(zh.t2s('乾隆'), '乾隆', '繁转简: 乾隆保留（词组保护）');
// v0.16.3 简体零误伤批次（GB2312 幂等 + 词组钉住）
eq(zh.t2s('看着名单'), '看着名单', '简体保护: 看着不动');
eq(zh.t2s('显著的成效'), '显著的成效', '简体保护: 显著（简体键钉住）');
eq(zh.t2s('昭著'), '昭著', '简体保护: 昭著');
eq(zh.t2s('执著'), '执著', '简体保护: 执著是合法词形');
eq(zh.t2s('著录'), '著录', '简体保护: 著录（文献术语）');
eq(zh.t2s('哪吒闹海'), '哪吒闹海', '简体保护: 哪吒');
eq(zh.t2s('瞭哨'), '瞭哨', '简体保护: 瞭哨');
eq(zh.t2s('乾清宫'), '乾清宫', '简体保护: 乾清宫');
eq(zh.t2s('上海简称沪'), '上海简称沪', '简体保护: 沪（JP同形字拦截）');
eq(zh.t2s('欠钱'), '欠钱', '简体保护: 欠');
eq(zh.t2s('芸芸众生'), '芸芸众生', '简体保护: 芸');
eq(zh.t2s('研究概念'), '研究概念', '简体保护: 研/概');
eq(zh.t2s('叙述慎重'), '叙述慎重', '简体保护: 叙/慎');
eq(zh.t2s('著稱於世'), '著称于世', '繁转简: 著稱→著称（繁键）+ 於→于');
eq(zh.t2s('看著書'), '看着书', '繁转简: 看著書（助词场景优先，不保护著書）');
eq(zh.t2s('翻页叙述'), '翻页叙述', '简体保护: 翻');
// t2sDetail 转换明细
{
  const d = zh.t2sDetail('他看著書，並未晉升');
  eq(d.output, '他看着书，并未晋升', 't2sDetail: 输出与 t2s 一致');
  eq(d.changes.length, 4, 't2sDetail: 记录 4 处替换');
  eq(d.changes.some((c) => c.from === '著' && c.to === '着'), true, 't2sDetail: 含 著→着');
  eq(d.changes.some((c) => c.from === '並' && c.to === '并'), true, 't2sDetail: 含 並→并');
  const p = zh.t2sDetail('他說甚麼都沒關係');
  eq(p.changes.some((c) => c.from === '甚麼' && c.to === '什么'), true, 't2sDetail: 词组级 甚麼→什么');
}
// GB2312 全集幂等（6763 简体规范字, 白名单 = 设计内行为: 著/吒/榘为词组保护字, 其余为 OpenCC 主表方向字）
{
  const WHITELIST = new Set(['著', '吒', '榘', '乾', '菸', '薹', '拚', '捱', '摺', '後', '徵', '夥', '於', '袷', '麴', '醣', '麽']);
  const dec = new TextDecoder('gbk');
  const bad = [];
  for (let q = 16; q <= 87; q++) {
    for (let w = 1; w <= 94; w++) {
      const s = dec.decode(Buffer.from([0xA0 + q, 0xA0 + w]));
      if (!s || s.length !== 1 || s.codePointAt(0) < 0x2E80) continue;
      const r = zh.t2s(s);
      if (r !== s && !WHITELIST.has(s)) bad.push(s + '→' + r);
    }
  }
  eq(bad.length, 0, 'GB2312 幂等: 6763 简体字零误伤' + (bad.length ? '，漏网: ' + bad.slice(0, 10).join(' ') : ''));
}
// v0.16.4 词库扩充批次（STCharacters 反查漏网: OpenCC 不收的台湾正字/异体字）
eq(zh.t2s('親暱'), '亲昵', '繁转简: 暱→昵（异体）');
eq(zh.t2s('菓子'), '果子', '繁转简: 菓→果（台湾正字）');
eq(zh.t2s('鎗法'), '枪法', '繁转简: 鎗→枪');
eq(zh.t2s('火燄'), '火焰', '繁转简: 燄→焰');
eq(zh.t2s('琳瑯'), '琳琅', '繁转简: 瑯→琅');
eq(zh.t2s('揹著包'), '背着包', '繁转简: 揹→背');
eq(zh.t2s('甦醒'), '苏醒', '繁转简: 甦→苏');
eq(zh.t2s('籐椅'), '藤椅', '繁转简: 籐→藤');
eq(zh.t2s('荳蔻'), '豆蔻', '繁转简: 荳→豆');
eq(zh.t2s('河隄'), '河堤', '繁转简: 隄→堤');
eq(zh.t2s('拏人'), '拿人', '繁转简: 拏→拿');
eq(zh.t2s('斲樹'), '斫树', '繁转简: 斲→斫');
eq(zh.t2s('乾嘉學派'), '乾嘉学派', '繁转简: 乾嘉保留（年号）+ 學→学');
eq(zh.t2s('文徵明'), '文徵明', '繁转简: 文徵明保留（人名）');
eq(zh.t2s('宮商角徵羽'), '宫商角徵羽', '繁转简: 徵(zhǐ)保留，宮→宫');
// v0.16.5 误伤还原批次（v0.16.2 错误映射的逆向恢复; 值均为 GB2312 未收录字, 零冲突）
eq(zh.t2s('槪念'), '概念', '误伤还原: 槪→概');
eq(zh.t2s('看著他'), '看着他', '误伤还原: 著→着');
eq(zh.t2s('襃獎'), '褒奖', '误伤还原: 襃→褒');
eq(zh.t2s('痺症'), '痹症', '误伤还原: 痺→痹');
eq(zh.t2s('飜譯'), '翻译', '误伤还原: 飜→翻');
eq(zh.t2s('郞中'), '郎中', '误伤还原: 郞→郎');
eq(zh.t2s('甁子'), '瓶子', '误伤还原: 甁→瓶');
eq(zh.t2s('愼重'), '慎重', '误伤还原: 愼→慎');
eq(zh.t2s('敍述'), '叙述', '误伤还原: 敍→叙');
eq(zh.t2s('硏究'), '研究', '误伤还原: 硏→研');
eq(zh.t2s('侏㩩紀'), '侏罗纪', '误伤还原: 㩩→罗');
eq(zh.t2s('艺艺众生'), '芸芸众生', '误伤还原词组: 艺艺→芸芸');
eq(zh.t2s('豫以批准'), '予以批准', '误伤还原词组: 豫以→予以');
eq(zh.t2s('沙家滨'), '沙家浜', '误伤还原词组: 沙家滨→沙家浜');
eq(zh.t2s('滤剧滤上滤语'), '沪剧沪上沪语', '误伤还原词组: 沪系');
eq(zh.t2s('过滤缺少犹豫分辨艺术'), '过滤缺少犹豫分辨艺术', '冲突值原生词零误伤（滤/缺/豫/辨/艺）');
// createChangeSummary: 恒等词组保护不计入替换总数
{
  const s = zh.createChangeSummary();
  s.add(zh.t2sDetail('看著書，著作').changes, 1);
  s.add(zh.t2sDetail('合著').changes, 2);
  const r = s.result();
  eq(r.totalChanges, 2, 'summarize: 恒等保护不计入替换总数');
  eq(r.protectedTotal, 2, 'summarize: 保护命中单列计数');
  eq(r.changedLines, 1, 'summarize: 纯保护行不算变化行');
  eq(r.real.some((e) => e.from === '著' && e.to === '着'), true, 'summarize: 真实替换含 著→着');
  eq(r.protected.some((e) => e.from === '著作'), true, 'summarize: 保护含 著作');
}
// v0.16.2 变体字扩充批次
eq(zh.t2s('侏儸紀'), '侏罗纪', '繁转简: 儸→罗（覆盖 OpenCC 的㑩，侏罗纪场景）');
eq(zh.t2s('倐地'), '倏地', '繁转简: 倐→倏（异体字）');
eq(zh.t2s('倏地'), '倏地', '繁转简: 倏简繁同形不变');
eq(zh.t2s('欸乃'), '欸乃', '繁转简: 欸简繁同形不变');
eq(zh.t2s('譬喻'), '譬喻', '繁转简: 譬喻简繁同形不变');
eq(zh.t2s('対決'), '对决', '繁转简: 日文新字体対→对');
eq(zh.t2s('辺缘'), '边缘', '繁转简: 日文新字体辺→边');
eq(zh.t2s('亀裂'), '龟裂', '繁转简: 日文新字体亀→龟');
eq(zh.t2s('栄光'), '荣光', '繁转简: 日文新字体栄→荣');
eq(zh.t2s(zh.t2s('\uF900') + '\u8FCE'), '岂迎', '繁转简: CJK兼容区豈→岂');
eq(zh.t2s('\uF904\u8ECA'), '滑车', '繁转简: CJK兼容区滑+車→滑车');
eq(zh.PAIRS.length > 3600, true, '繁简: 字表规模 >3600（含变体组合）');

// ============ 1.6b 空白检查（行首 + 正文空格） ============
console.log('== 空白检查 scanLines');
{
  const r = t.scanLines([
    '他 说了一句话',      // 0 汉字间半角空格 → mid
    '他走了   ',          // 1 行尾空格 → mid
    'I love you so much', // 2 英文空格 → 不报
    '用 VSCode 打开文件',  // 3 中英之间空格 → 不报
    '干干净净的文字',      // 4 不报
    '　　他说',           // 5 行首全角缩进 → ws
    '１２３　４５６',      // 6 全角空格在数字间 → 不报（保守）
    '',                   // 7 空行
  ], { ignoreBlankLines: true });
  eq(JSON.stringify(r.ws.map((w) => w.line)), '[5]', '空白: 行首缩进只报 ws');
  eq(r.mid.length, 2, '空白: 正文空格报 2 处（汉字间 + 行尾）');
  eq(r.mid[0].line === 0 && r.mid[0].col === 1 && r.mid[0].len === 1, true, '空白: 汉字间空格定位正确');
  eq(r.mid[1].line === 1 && r.mid[1].col === 3 && r.mid[1].len === 3, true, '空白: 行尾空格定位正确');
  const r2 = t.scanLines(['他 说'], {});
  eq(r2.mid.length, 1, '空白: 单行也能检出汉字间空格');
  const r3 = t.scanLines(['他\u3000说'], {});
  eq(r3.mid.length, 0, '空白: 行中全角空格不报（保守，避免碰缩进语义）');
  const r4 = t.scanLines(['　　他 说\t她  来  ', '他 说', '她 来'], {});
  eq(JSON.stringify(r4.mid.filter((m) => m.line === 0).map((m) => [m.col, m.len])),
    '[[3,1],[5,1],[7,2],[10,2]]', '空白: 同行多处空格及行尾空格全部定位');
  eq(r4.mid.length, 6, '空白: 连续多行扫描不遗漏匹配');
  eq(t.scanLines(['中文 English 单词之间'], {}).mid.length, 0, '空白: 全量扫描仍保留中英间合法空格');
}



// ============ 1.7 省略号整改 ============
console.log('== 省略号整改 normalizeEllipsis');

{
  const nel = t.normalizeEllipsis([
    '他说。。。然后走了。',          // 3 点 → …
    '好的。。。。那就算了',          // 4 点 → ……
    '等一下⋯⋯再说',               // 2×3=6 → ……
    '列••••表',                   // 4 → ……
    '哦・・・・・',                 // 5 → ……
    'what...',                    // 3 → …
    '嗯..好',                     // 2 → …
    '已是规范省略号……',             // 6 点 → ……（无变化）
    '单独的…三点',                 // 3 点 → …（无变化）
    '小数点1.5保持不变',            // 单点句点类 → 放行
    '哈利·波特与魔法石',            // 间隔号 → 放行
    '结尾一个点・',                 // 孤立点号 → 报告
    '结束。',                     // 句号单点 → 放行
  ]);
  eq(nel.lines[0], '他说…然后走了。', '省略号: 3点→…');
  eq(nel.lines[1], '好的……那就算了', '省略号: 4点→……');
  eq(nel.lines[2], '等一下……再说', '省略号: ⋯⋯→……');
  eq(nel.lines[3], '列……表', '省略号: ••••→……');
  eq(nel.lines[4], '哦……', '省略号: ・・・・・→……');
  eq(nel.lines[5], 'what…', '省略号: ...→…');
  eq(nel.lines[6], '嗯…好', '省略号: ..→…');
  eq(nel.lines[7], '已是规范省略号……', '省略号: 规范行不变');
  eq(nel.lines[8], '单独的…三点', '省略号: 单…不变');
  eq(nel.lines[9], '小数点1.5保持不变', '省略号: 小数点放行');
  eq(nel.lines[10], '哈利·波特与魔法石', '省略号: 间隔号放行');
  eq(nel.lines[12], '结束。', '省略号: 句号放行');
  eq(nel.changed, 7, '省略号: 变更行数');
  eq(nel.singles.length, 1, '省略号: 孤立点号报告 1 处');
  eq(nel.singles[0].line, 11, '省略号: 孤立点号行号');
  eq(nel.singles[0].char, '・', '省略号: 孤立点号字符');
}


// ============ 1.8 直角引号换弯引号 ============
console.log('== 直角引号 replaceCornerQuotes');

{
  const rq = t.replaceCornerQuotes([
    '他说：「你好。」',
    '嵌套「外层『内层』结束」',
    '没有直角引号的行',
  ]);
  eq(rq.lines[0], '他说：“你好。”', '引号: 「→“ 」→”');
  eq(rq.lines[1], '嵌套“外层‘内层’结束”', '引号: 嵌套『』→‘’');
  eq(rq.lines[2], '没有直角引号的行', '引号: 无关行不变');
  eq(rq.count, 6, '引号: 替换 6 个');
  eq(rq.linesChanged, 2, '引号: 变更 2 行');
  eq(rq.innerCount, 2, '引号: 嵌套『』转换 2 个');
  const rq0 = t.replaceCornerQuotes(['普通行']);
  eq(rq0.count, 0, '引号: 无替换时 count=0');
}


// ============ 1.9 全角字符转半角 ============
console.log('== 全角转半角 fullwidthToHalf');

{
  const fw = t.fullwidthToHalf([
    'Ｓｏｒｒｙ，ｔｈｅ　ｎｕｍｂｅｒ',
    '第１２３章：价格＄５０＠店',
    '中文标点，保留！测试？好～',
    '正常 half-width 行',
  ], 'alnum');
  eq(fw.lines[0], 'Sorry，the　number', '全角: 字母数字转，全角逗号/全角空格保留');
  eq(fw.lines[1], '第123章：价格$50@店', '全角: ＄＠转、中文冒号保留');
  eq(fw.lines[2], '中文标点，保留！测试？好～', '全角: 中文标点全保留');
  eq(fw.lines[3], '正常 half-width 行', '全角: 半角行不变');
  eq(fw.count, 21, '全角: alnum 转换计数 21');
  eq(fw.linesChanged, 2, '全角: alnum 变更 2 行');
  eq(fw.kept, 6, '全角: alnum 保留 6 个中文标点');
  eq(fw.spaces, 1, '全角: alnum 全角空格计数 1');

  const fwAll = t.fullwidthToHalf(['Ｓｏｒｒｙ，ｔｈｅｎｕｍｂｅｒｙｏｕｄａｉｌｅｄ！'], 'all');
  eq(fwAll.lines[0], 'Sorry,thenumberyoudailed!', '全角: all 模式标点也转');
  eq(fwAll.count, 25, '全角: all 模式计数 25');
  eq(fwAll.kept, 0, '全角: all 模式无保留');

  const fwSpace = t.fullwidthToHalf(['　　缩进保留　　'], 'all');
  eq(fwSpace.lines[0], '　　缩进保留　　', '全角: 全角空格 all 模式也不动');
  eq(fwSpace.spaces, 4, '全角: 全角空格计数 4');
  eq(fwSpace.count, 0, '全角: 纯缩进行无转换');
}


// ============ 2. cool18 解析 ============
console.log('== cool18 parse（fixtures）');

(function () {
  const fx = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');
  const t1 = c18.extractThread(fx('t1.html'));
  eq(t1.title, '【测试书】(1-2)', 't1 标题');
  eq(t1.author, '作者甲', 't1 作者');
  eq(t1.date, '2026-01-01 12:00', 't1 日期');
  eq(t1.links.length, 2, 't1 章节链接数');
  eq(t1.links[0].tid, 900002, 't1 链接 tid');
  eq(t1.body, '【测试书】(1-2)\n作者：作者甲\n　　第一章 开端，被硬换行截断。\n　　第二节 收尾。', 't1 正文（元信息保留+段内硬换行合并）');

  const t2 = c18.extractThread(fx('t2.html'));
  eq(t2.links.length, 1, 't2 链接数');
  eq(t2.body, '【测试书】(03-06)\n作者：作者甲\n　　第三章 甲。\n　　第四章 乙。\n　　第五章 丙。', 't2 正文（多段落）');

  const t3 = c18.extractThread(fx('t3.html'));
  eq(t3.links.length, 0, 't3 无链接');
  eq(t3.body, '【测试书】(07-10)\n作者：作者甲\n　　第七章 丙。', 't3 正文（无 <p>、元信息后空行已清理）');

  const k1 = c18.chapterKey('【测试书】(1-2)', 900001);
  const k2 = c18.chapterKey('【测试书】（03-06）', 900002);
  const k3 = c18.chapterKey('【测试书】(07-10)', 900003);
  check('chapterKey 区间解析', k1[1] === 1 && k1[4] === 2 && k2[1] === 3 && k2[4] === 6 && k3[1] === 7 && k3[4] === 10);
  check('chapterKey 排序', k1 < k2 && k2 < k3);

  const entries = c18.parseEntries('tid=900001\n900002\n【x】https://www.cool18.com/bbs4/index.php?app=forum&act=threadview&tid=900003 y\n#注释\nhttps://example.com/no-tid');
  eq(entries.length, 3, 'parseEntries 去重后 3 条');
  eq(entries[0], c18.BBS4 + '900001', 'parseEntries URL 格式');

  eq(c18.sanitizeName('a/b:c?d*e"f<g>h|i j'), 'a_b_c_d_e_f_g_h_i_j', 'sanitizeName 非法字符');
  eq(c18.sanitizeName('　'), 'untitled', 'sanitizeName 空名兜底');
  check('isCool18ish', c18.isCool18ish('tid=123456') && !c18.isCool18ish('hello world'));
  eq(c18.decodePage(Buffer.from([0xc4, 0xe3])), '你', 'decodePage gb18030 回退');

  // 广告行清理: 只删明确站点签名/纯链接, 正文句子里出现域名要保留
  const removed = [];
  const strip = (s) => c18.stripAdLines(s, (l) => removed.push(l));
  eq(strip('[本帖最后由 张三 于 2026-01-01 编辑]'), '', '广告: 删除本帖最后由');
  eq(strip('本文由张三整理发布'), '', '广告: 删除本文由签名');
  eq(strip('更多精彩请关注本站'), '', '广告: 删除更多精彩签名');
  eq(c18.stripAdLines('正文里出现 cool18.com 但这是一个完整句子。'), '正文里出现 cool18.com 但这是一个完整句子。', '广告: 含句读的正文不误删');
  eq(c18.stripAdLines('本文由他整理后发布到网上。'), '本文由他整理后发布到网上。', '广告: 正文口吻的本文由不误删');
  eq(c18.stripAdLines('更多精彩请见下文。'), '更多精彩请见下文。', '广告: 正文口吻的更多精彩不误删');
  eq(removed.length, 3, '广告: onRemove 回调记录 3 行');
  const adHtml = '<pre>　　[本帖最后由 张三 编辑]<br>　　正文。</pre>';
  check('广告: cleanAds=false 保留签名', c18.bodyToText(adHtml, { cleanAds: false }).includes('本帖最后由'));
  check('广告: cleanAds=true 删除签名', !c18.bodyToText(adHtml, { cleanAds: true }).includes('本帖最后由'));

  // 排序键 v2: 中文数字 + 显式区间 + 规则优先级（用户实测中文数字章节乱序案例）
  eq(c18.cnNumeral('八'), 8, 'cnNumeral: 八');
  eq(c18.cnNumeral('二十三'), 23, 'cnNumeral: 二十三');
  eq(c18.cnNumeral('一百零五'), 105, 'cnNumeral: 一百零五');
  eq(c18.cnNumeral('两'), 2, 'cnNumeral: 两');
  eq(c18.cnNumeral('一万二千'), 12000, 'cnNumeral: 一万二千');
  eq(c18.chapterKey('【书】第八十五章', 9).join(','), '0,85,0,9,85', 'chapterKey: 中文数字章号（卷0章85）');
  eq(c18.chapterKey('【书】第八章', 9).join(','), '0,8,0,9,8', 'chapterKey: 裸第八章（卷0章8）');
  eq(c18.chapterKey('【书】(84-85)', 7).join(','), '0,84,0,7,85', 'chapterKey: 显式区间（卷0章84-85）');
  eq(c18.chapterKey('第32章 2023年修订', 5).join(','), '0,32,0,5,32', 'chapterKey: 第N章（日期去毒后不被污染）');
  eq(c18.chapterKey('完全没有任何编号的标题', 3).join(','), '1000000000,0,0,3,0', 'chapterKey: 无序号兜底');

  // v3 回归: 卷-章复合标题取章号 + 日期去毒（用户实测 '错位迷途' 乱序案例）
  eq(c18.chapterKey('【错位迷途】（第二卷爱欲情仇第五十二章失忆中的记忆）', 0).join(','), '2,52,0,0,52', 'chapterKey-v4: 卷章复合 → 卷2章52');
  eq(c18.chapterKey('【错位迷途】（第三卷 救赎 第五十六章 恢复记忆）', 0).join(','), '3,56,0,0,56', 'chapterKey-v4: 第三卷中取第56章');
  eq(c18.chapterKey('【错位迷途】（第五卷 救赎 第六十八章 终章 再续前缘）', 0).join(','), '5,68,0,0,68', 'chapterKey-v4: 第五卷中取第68章');
  eq(c18.chapterKey('【书】第一卷', 0).join(','), '1,0,0,0,0', 'chapterKey-v4: 纯卷号（章0=卷头）');
  check('chapterKey-v4: 日期去毒不当章节号', c18.chapterKey('【书】2026-01-08 发布', 0)[0] === 1e9);

// chapterKey-v5: 部序（上/中/下）进排序键 —— 同章分帖不互斥不互删
eq(c18.chapterKey('（5上）', 11).join(','), '0,5,1,11,5', 'chapterKey-v5: （5上）→部序1');
eq(c18.chapterKey('（5下）', 12).join(','), '0,5,3,12,5', 'chapterKey-v5: （5下）→部序3');
eq(c18.chapterKey('（13中）', 13).join(','), '0,13,2,13,13', 'chapterKey-v5: （13中）→部序2');
eq(c18.chapterKey('第52章(下)', 14).join(','), '0,52,3,14,52', 'chapterKey-v5: 第52章(下)→部序3');
eq(c18.chapterKey('第十二章中', 18).join(','), '0,12,2,18,12', 'chapterKey-v5: 行尾"中"视为部序');
eq(c18.chapterKey('第52章 中间人', 15).join(','), '0,52,0,15,52', 'chapterKey-v5: "中间人"不是部序');
eq(c18.chapterKey('第52章前传', 16).join(','), '0,52,0,16,52', 'chapterKey-v5: "前传"不是部序');
eq(c18.chapterKey('（16下）', 17).join(','), '0,16,3,17,16', 'chapterKey-v5: （16下）编号+部序');
check('chapterKey-v5: 同章上下排序 上<下',
  c18.chapterKey('（5上）', 11) < c18.chapterKey('（5下）', 12));
check('chapterKey-v5: 同章上下是不同键（不触发去重互删）',
  c18.chapterKey('（5上）', 11).slice(0, 3).join() !== c18.chapterKey('（5下）', 12).slice(0, 3).join());

  // 缺章检测
  const { findGaps } = require('../src/engine/cool18/core');
  eq(findGaps([{ key: [0, 1, 0, 1, 5], cover: { vol: 0, a: 1, b: 5 } }, { key: [0, 7, 0, 2, 9], cover: { vol: 0, a: 7, b: 9 } }]).join('|'), '第 0 卷缺 6 章', 'findGaps: 中间缺一章');
  eq(findGaps([{ key: [0, 1, 0, 1, 5], cover: { vol: 0, a: 1, b: 5 } }, { key: [0, 2, 0, 2, 6], cover: { vol: 0, a: 2, b: 6 } }]).join('|'), '', 'findGaps: 重叠覆盖不报缺');
  eq(findGaps([{ key: [1, 1, 0, 1, 5], cover: { vol: 1, a: 1, b: 5 } }, { key: [3, 1, 0, 2, 3], cover: { vol: 3, a: 1, b: 3 } }]).join('|'), '第 2 卷整卷缺失', 'findGaps: 整卷缺失');
  eq(findGaps([{ key: [1000000000, 0, 0, 1, 0] }, { key: [1000000000, 0, 0, 2, 0] }]).join('|'), '', 'findGaps: 无序号帖不参与检测');

  // 合并成品命名: 完结→书名【完】 / 未完结→书名【1-XX】 / 书名提取自【】内文 / 作者从标题尾部识别
  const { buildMergedName } = require('../src/engine/cool18/core');
  const mk = (title, key, author) => ({ key, t: { title, author }, url: '' });
  eq(buildMergedName([
    mk('【我失忆后妈妈变得有些奇】(1-70完)兴趣使然', [0, 1, 0, 1, 70]),
    mk('【我失忆后妈妈变得有些奇】(66-70完)', [0, 66, 0, 2, 70]),
  ]), '我失忆后妈妈变得有些奇【完】作者：兴趣使然.txt', '成品命名: 完结书（书名去壳+尾签名作者）');
  eq(buildMergedName([
    mk('【予母所爱】(００１－０８５)作者_吖吖吖吖', [0, 1, 0, 1, 85]),
    mk('【予母所爱】(０３２－０３３)作者_吖吖吖吖', [0, 32, 0, 2, 33]),
  ]), '予母所爱【1-85】作者：吖吖吖吖.txt', '成品命名: 未完结取最新章号+作者_字段优先');
  eq(buildMergedName([
    mk('书名 (1-70完) 作者：麻酥', [1, 70, 0, 1], '麻酥'),
    mk('书名 (66-70完) 作者：麻酥', [66, 70, 2], '麻酥'),
  ]), '书名【完】作者：麻酥.txt', '成品命名: 无【】标题剥范围与作者段');
  eq(buildMergedName([
    mk('完全没有任何编号的标题', [1000000000, 0, 3], '阿三'),
    mk('第二篇', [1000000000, 0, 4], '阿三'),
    mk('第三篇', [1000000000, 0, 5], '阿三'),
  ]), '完全没有任何编号的标题【1-3】作者：阿三.txt', '成品命名: 无章号兜底用帖数');
  eq(c18.decodePage(Buffer.from('hello', 'utf8')), 'hello', 'decodePage utf8 直解');
  eq(c18.unescapeEntities('a&amp;b&#x4e2d;&#25991;&nbsp;c'), 'a&b中文 c', '实体解码');

  // 三种真实源形态归一化（2026-10 三个 tid 实测）
  eq(c18.bodyToText('<p>　　一段内容。</p><p>　　二段内容。</p>'),
    '　　一段内容。\n　　二段内容。', '形态A: <p>分段直出');
  eq(c18.bodyToText('　　一段被硬<br>换行截断。<p></p>　　二段。'),
    '　　一段被硬换行截断。\n　　二段。', '形态B: <br>硬换行合并回段');
  eq(c18.bodyToText('　　在这里先感谢大家。　　第一章：开始　　「你好！」'),
    '　　在这里先感谢大家。\n　　第一章：开始\n　　「你好！」', '形态C: 行内缩进拆段');
  eq(c18.bodyToText('【书名】\n作者：x\n　　第一段。　　第二段。'),
    '【书名】\n作者：x\n　　第一段。\n　　第二段。', '形态C变体: 元信息保留+巨行拆段');
  eq(c18.bodyToText('<p>第一章 标题行</p><p>　　正文第一段。</p>'),
    '第一章 标题行\n　　正文第一段。', '<p>无缩进行+缩进段混排');
  eq(c18.bodyToText('<p>第一段。</p><p>第二段。</p>'),
    '第一段。\n第二段。', '无缩进有<p>: 保守逐行');
  eq(c18.bodyToText('第一行\n第二行'), '第一行\n第二行', '无信号无<p>: 旧行为');
  eq(c18.bodyToText('<p>　　甲。</p><p>　　乙，被<br>硬换。</p><p>　　丙。　　丁。</p>'),
    '　　甲。\n　　乙，被硬换。\n　　丙。\n　　丁。', '三种形态混合');

  // splitInlineBreaks: 行内接缝切分（全角缩进 + 句读多空格）
  const si = t.splitInlineBreaks('　　A。　　B。　　C。');
  eq(si.join('|'), '　　A。|　　B。|　　C。', 'split: 行内缩进拆分保留标记');
  eq(t.splitInlineBreaks('　　A。').join('|'), '　　A。', 'split: 行首缩进不切');
  eq(t.splitInlineBreaks('普通一行').join('|'), '普通一行', 'split: 无标记不切');
  eq(t.splitInlineBreaks('的？”   旁边走').join('|'), '的？”|旁边走', 'split: 句读+半角空格接缝');
  eq(t.splitInlineBreaks('送人的？”   “旁边来').join('|'), '送人的？”|“旁边来', 'split: 接缝后接前引号');
  eq(t.splitInlineBreaks('他说：   后面没有句读也切').join('|'), '他说：|后面没有句读也切', 'split: 无句读的空格串也切');
  eq(t.splitInlineBreaks('A　 B   C').join('|'), 'A|B|C', 'split: 混排空格串');
  eq(t.splitInlineBreaks('A　　').join('|'), 'A', 'split: 行尾空格串丢弃');
  check('split: 行首全角缩进保留', t.splitInlineBreaks('　　A')[0] === '　　A');
  const mj = t.mergeLines(['　　“小伙子想买什么酒呀？自家喝还是送人的？”   旁边走来一个热情的推销大妈'], {});
  eq(mj.lines.length, 2, 'merge: 接缝行拆成两段');
  eq(mj.lines[0], '　　“小伙子想买什么酒呀？自家喝还是送人的？”', 'merge: 接缝左段');
  eq(mj.lines[1], '旁边走来一个热情的推销大妈', 'merge: 接缝右段');
})();

// ============ 3. 编码检测 ============
console.log('== 编码检测 encoding');
const enc = require('../src/engine/encoding');
eq(enc.detectEncoding(Buffer.from('hello world')), 'utf8', '纯 ASCII → utf8');
eq(enc.detectEncoding(Buffer.from('小说测试', 'utf8')), 'utf8', 'UTF-8 中文 → utf8');
eq(enc.detectEncoding(Buffer.from([0xEF, 0xBB, 0xBF, 0xE5, 0xB0, 0x8F])), 'utf8bom', 'BOM → utf8bom');
eq(enc.detectEncoding(Buffer.from([0xFF, 0xFE, 0x0F, 0x5C])), 'utf16le', 'BOM → utf16le');
eq(enc.detectEncoding(Buffer.from([0xB2, 0xE2, 0xCA, 0xD4])), 'gb18030', 'GB2312 字节（小说）→ gb18030');
eq(enc.decodeToUtf8(Buffer.from([0xB2, 0xE2, 0xCA, 0xD4])).text, '测试', 'GB2312 → 正确解码为测试');
eq(enc.decodeToUtf8(Buffer.from([0xFF, 0xFE, 0x0F, 0x5C])).text, '小', 'UTF-16LE → 正确解码');

// ============ 4. Pixiv 全流程 ============
console.log('== Pixiv（FakeFetcher 全流程）');

(function () {
  const t = pixivParseInput('https://www.pixiv.net/novel/series/15169913');
  eq(t.length, 1, '系列链接解析 1 个');
  eq(t[0].type, 'series', '系列链接类型');
  eq(t[0].id, '15169913', '系列链接 ID');

  const t2 = pixivParseInput('看这个 https://www.pixiv.net/novel/show.php?id=123456 谢谢');
  eq(t2[0].type, 'novel', 'show.php 类型');
  eq(t2[0].id, '123456', 'show.php ID');

  const t3 = pixivParseInput('https://www.pixiv.net/novel/98765432');
  eq(t3[0].id, '98765432', '新式单篇链接');

  const t4 = pixivParseInput('https://www.pixiv.net/users/12345/novels');
  eq(t4[0].type, 'user', '作者链接类型');
  eq(t4[0].id, '12345', '作者链接 ID');

  const t5 = pixivParseInput('42');
  eq(t5[0].type, 'novel', '裸 ID 默认单篇');

  const t6 = pixivParseInput('novel/series/15169913\nnovel/111\nnovel/111\nnovel/222');
  eq(t6.length, 3, '混合多行去重共 3 个');
  eq(t6[0].type, 'series', 'series 不被 novel 正则吞掉');

  eq(pixivParseInput('随便一段话').length, 0, '无链接返回空');

  eq(extractCookie('1234567_AbcdEfgh1234567'), 'PHPSESSID=1234567_AbcdEfgh1234567', '裸值补键名');
  eq(extractCookie('PHPSESSID=abc; other=x'), 'PHPSESSID=abc', '整段头抽取 PHPSESSID');
  eq(classify(404, null), 'notfound', '404 → notfound');
  eq(classify(403, { error: true, message: '该功能需要登录' }), 'auth', '403+json → auth');
  eq(classify(403, null), 'blocked', '403 无 json → blocked');
  eq(classify(429, null), 'rate', '429 → rate');

  const r1 = renderContent('一[newpage]二');
  eq(r1.text, '一\n\n二', 'newpage 默认空行');
  const r3 = renderContent('[chapter:第二章 序章之后]');
  eq(r3.text, '第二章 序章之后', 'chapter 还原为标题行');
  const r4 = renderContent('[pixivimage:111]图');
  ok(r4.text.includes('［插图］https://www.pixiv.net/artworks/111'), 'pixivimage 占位');
  const r6 = renderContent('见[jump:45678]');
  eq(r6.text, '见[→novel/45678]', 'jump 还原');
  const r7 = renderContent('点[jumpuri:官网:https://example.com/a?b=1]看完');
  eq(r7.text, '点官网（https://example.com/a?b=1）看完', 'jumpuri 还原');
  eq(renderContent('[[rb:漢字>かんじ]]').text, '漢字', 'rb 默认只留本字');
  const r8 = renderContent('正文[futile:xxx]结束');
  eq(r8.unknown.length, 1, '未知标记上报');

  eq(pixivSanitize('a/b:c?d*e"f<g>h|i\\j'), 'a／b：c？d＊e＂f＜g＞h｜i＼j', '非法字符全角化');
  eq(pixivSanitize('CON'), '_CON', 'Windows 保留名加前缀');
  eq(pixivSanitize(''), '无标题', '空名兜底');


  // ---- Writer ----
  const tmp = makeTemp('pixiv-w-');
  const w = new Writer({ outputRoot: tmp, saveUrlNote: true, saveMeta: false });
  const f1 = w.novelPath('作者', '1', '书名');
  const r1w = w.saveText(f1, '第一版');
  eq(r1w.skipped, false, '首次保存');
  const r2w = w.saveText(f1, '第二版');
  eq(r2w.skipped, true, '已存在则跳过');
  eq(fs.readFileSync(f1, 'utf8'), '第一版\r\n', '内容未被覆盖且为 CRLF');
  w.writeUrlNote(path.dirname(f1), 'https://www.pixiv.net/novel/9', '书名');
  ok(fs.existsSync(path.join(path.dirname(f1), '书名（链接）.txt')), 'URL 注记已写');
  w.saveManifest();
  const w2 = new Writer({ outputRoot: tmp });
  w2.manifest.novels['9'] = { title: 'x' };
  eq(Object.keys(w2.manifest.novels).length, 1, 'manifest 落盘再载入一致');

  // ---- FakeFetcher 全流程 ----
  const SER = [
    { id: '1001', title: '第一章 开始' },
    { id: '1002', title: '第二章 发展' },
    { id: '1003', title: '第三章 消失' },
    { id: '1004', title: '第四章 结束' },
  ];
  const NOVEL_TEXT = '第一段正文。\r\n第二段正文。[newpage]翻页后。[chapter:第二节]内容尾巴';

  function makeFake(seriesId, chs, { failIds = [], authIds = [], emptyIds = [] } = {}) {
    return {
      calls: [],
      async getJson(url) {
        this.calls.push(url);
        let m;
        if ((m = url.match(/\/ajax\/novel\/(\d+)$/))) {
          const id = m[1];
          if (authIds.includes(id)) throw new PixivError('auth', 'ログインしてください', { status: 403, url });
          if (failIds.includes(id)) throw new PixivError('notfound', '该作品已被删除', { status: 404, url });
          const ch = chs.find((c) => c.id === id);
          if (emptyIds.includes(id)) {
            return {
              id, title: ch ? ch.title : '散篇' + id,
              userId: '999', userName: '测试作者',
              content: '',
              tags: { tags: [{ tag: '测试' }] },
              createDate: '2026-01-01T00:00:00+09:00',
              wordCount: 0,
              xRestrict: 1,
              seriesNav: ch ? { seriesId, seriesTitle: '测试系列', order: ch.order } : null,
            };
          }
          return {
            id, title: ch ? ch.title : '散篇' + id,
            userId: '999', userName: '测试作者',
            content: NOVEL_TEXT,
            tags: { tags: [{ tag: '测试' }] },
            createDate: '2026-01-01T00:00:00+09:00',
            wordCount: 10,
            seriesNav: ch ? { seriesId, seriesTitle: '测试系列', order: ch.order } : null,
          };
        }
        if (url.includes('/ajax/novel/series_content/')) {
          const limit = Number((url.match(/limit=(\d+)/) || [])[1] || 30);
          const lo = Number((url.match(/last_order=(\d+)/) || [])[1] || 0);
          const all = chs.map((c, i) => ({ id: c.id, order: i + 1 }));
          let list = all.slice().sort((a, b) => b.order - a.order);
          if (lo) list = list.filter((c) => c.order < lo);
          return { page: { seriesContents: list.slice(0, limit).map((c) => ({ id: c.id, userId: '999', series: { id: 1, contentOrder: c.order, viewableType: 3 } })) } };
        }
        if ((m = url.match(/\/ajax\/novel\/series\/(\d+)$/))) {
          return { id: m[1], title: '测试系列', userId: '999', userName: '测试作者', publishedContentCount: chs.length, isConcluded: false };
        }
        throw new PixivError('api', 'fake 未模拟: ' + url);
      },
    };
  }

  async function coreWith(fake, extra = {}) {
    const tmpd = makeTemp('pixiv-c-');
    const core = new PixivCore({ outputRoot: tmpd, intervalMs: 1, saveUrlNote: true, ...extra });
    core.fetcher = fake;
    core.api.f = fake;
    return { core, tmp: tmpd };
  }

  const flow = async () => {
    // 系列全流程
    {
      const { core, tmp } = await coreWith(makeFake('700', SER, { failIds: ['1003'] }));
      const r = await core.downloadSeries('700');
      eq(r.saved, 3, '系列下载成功章数（1 章失败）');
      eq(r.failures.length, 1, '失败章记录');
      eq(r.failures[0].kind, 'notfound', '失败类型');
      const dir = core.writer.seriesDir('测试作者', '999', '测试系列', '700');
      const files = fs.readdirSync(dir).sort();
      eq(files.filter((f) => /^\d{3} /.test(f)).length, 3, '章节文件数 001~003 编号格式');
      eq(fs.readFileSync(path.join(dir, '001 第一章 开始.txt'), 'utf8').split('\r\n')[0],
        '第一章 开始', '章节文件首行=章节名');
      ok(files.some((f) => f === '_合并.txt'), '合并版存在');
      const merged = fs.readFileSync(path.join(dir, '_合并.txt'), 'utf8');
      ok(/(^|\r\n)第一章 开始(\r\n|$)/.test(merged), '合并版章节名为独立行（可被章节正则识别）');
      ok(merged.includes('第3话'), '合并版失败章占位标题（列表无标题时用"第N话"）');
      ok(merged.includes('（本章下载失败，重跑抓取可补上）'), '合并版失败章留可见占位');
      const manifest = JSON.parse(fs.readFileSync(path.join(tmp, 'pixiv-manifest.json'), 'utf8'));
      eq(manifest.series['700'].count, 4, 'manifest 记录总章数');

      const r2 = await core.downloadSeries('700');
      eq(r2.saved, 0, '重跑不重复下载');
      eq(r2.skipped, 3, '重跑成功章全部跳过');
      eq(r2.failures.length, 1, '重跑失败章仍重试仍记录');

      // 自愈: 手动删除章节文件后重跑 → 缺失章自动补抓
      fs.rmSync(path.join(dir, '001 第一章 开始.txt'), { force: true });
      const r3 = await core.downloadSeries('700');
      eq(r3.saved, 1, '缺失文件自动补抓');
      eq(r3.skipped, 2, '仍在盘上的章继续跳过');
      eq(r3.failures.length, 1, '失败章仍重试仍记录');
      eq(fs.readFileSync(path.join(dir, '001 第一章 开始.txt'), 'utf8').split('\r\n')[0],
        '第一章 开始', '补抓文件带章节名首行');
    }

    // 强制重抓: clearSeries 删目录+manifest 记录 → 重跑从零下载
    {
      const { core, tmp } = await coreWith(makeFake('720', SER));
      await core.downloadSeries('720');
      const dir720 = core.writer.seriesDir('测试作者', '999', '测试系列', '720');
      ok(fs.existsSync(dir720), '强制重抓前置：系列目录已生成');
      ok(fs.existsSync(path.join(dir720, '_合并.txt')), '强制重抓前置：合并版已生成');
      eq(core.clearSeries('720'), true, 'clearSeries 命中已有记录');
      ok(fs.existsSync(dir720), '强制重抓前保留旧系列目录');
      ok(core.writer.manifest.series['720'], '强制重抓前保留抓取记录');
      const r = await core.downloadSeries('720');
      eq(r.saved, 4, '清除后重抓全部章节');
      eq(r.skipped, 0, '清除后无跳过');
      eq(core.clearSeries('no-such'), false, 'clearSeries 对无记录 id 返回 false');
      eq(core.clearNovel('no-such-novel'), false, 'clearNovel 对无记录 id 返回 false');
      // clearNovel: 种一条 manifest 记录 + 文件，验证删除
      const nf = path.join(tmp, '测试作者', '散篇888.txt');
      fs.mkdirSync(path.dirname(nf), { recursive: true });
      fs.writeFileSync(nf, '正文', 'utf8');
      core.writer.manifest.novels['888'] = { title: '散篇888', author: '测试作者', userId: '999', file: nf };
      eq(core.clearNovel('888'), true, 'clearNovel 命中已有记录');
      ok(fs.existsSync(nf), '强制重抓前保留单篇文件');
      ok(core.writer.manifest.novels['888'], '强制重抓前保留单篇记录');
    }

    // 空壳自愈: 章节文件被降级成"只有标题行"（v0.5.7 前空正文 bug 的产物）→ 重跑自动补抓
    {
      const fake = makeFake('710', SER);
      const { core, tmp } = await coreWith(fake);
      await core.downloadSeries('710');
      const f001 = core.writer.chapterPath('测试作者', '999', '测试系列', 1, '第一章 开始', '710');
      fs.writeFileSync(f001, '第一章 开始\r\n\r\n', 'utf8');
      const r = await core.downloadSeries('710');
      eq(r.saved, 1, '空壳章节自动重新下载');
      eq(r.skipped, 3, '正常章节继续跳过');
      ok(fs.readFileSync(f001, 'utf8').includes('第一段正文。'), '重下文件包含正文');
    }

    // 空正文（R-18/无效 Cookie）: 200 + 空正文 → 判失败、不写空壳文件、不记 manifest、连续 3 章熔断
    {
      const fake = makeFake('709', SER, { emptyIds: ['1001', '1002', '1003', '1004'] });
      const { core, tmp } = await coreWith(fake);
      const r = await core.downloadSeries('709');
      eq(r.saved, 0, '空正文不计入 saved');
      eq(r.failures.length, 3, '连续 3 章空正文后熔断');
      ok(r.failures.every((f) => f.kind === 'empty'), '空正文 kind=empty');
      const dir709 = core.writer.seriesDir('测试作者', '999', '测试系列', '709');
      eq(fs.readdirSync(dir709).filter((f) => /^\d{3} /.test(f)).length, 0, '不写空壳文件');
      const m709 = fs.existsSync(path.join(tmp, 'pixiv-manifest.json'))
        ? JSON.parse(fs.readFileSync(path.join(tmp, 'pixiv-manifest.json'), 'utf8'))
        : { series: {} };
      ok(!m709.series['709'] || (m709.series['709'].files || []).length === 0, 'manifest 不记录空章节');
    }

    // 单篇空正文 → 抛 kind=empty
    {
      const fake = makeFake('711', SER, { emptyIds: ['1002'] });
      const { core } = await coreWith(fake);
      let threw = null;
      try { await core.downloadNovel('1002'); } catch (e) { threw = e; }
      ok(threw && threw.kind === 'empty', '单篇空正文抛 kind=empty');
      ok(threw && threw.message.includes('Cookie'), '错误信息含 Cookie 指引');
    }

    // 翻页正确性: 45 章
    {
      const many = Array.from({ length: 45 }, (_, i) => ({ id: String(i + 1), title: '第' + (i + 1) + '话' }));
      const fake = makeFake('701', many);
      const { core, tmp } = await coreWith(fake);
      const r = await core.downloadSeries('701');
      eq(r.total, 45, '45 章全列出');
      eq(r.saved, 45, '45 章全保存');
      eq(fake.calls.filter((u) => u.includes('series_content')).length, 2, '系列列表只翻 2 页');
      ok(fs.existsSync(core.writer.chapterPath('测试作者', '999', '测试系列', 45, '第45话', '701')), '末章文件存在');
    }

    // 单篇 + 系列导航
    {
      const fake = makeFake('702', SER);
      const { core } = await coreWith(fake);
      const r = await core.downloadNovel('1002');
      eq(r.type, 'novel', '单篇类型');
      ok(r.seriesNav && r.seriesNav.seriesId === '702', '单篇带系列导航');
    }

    // 增量更新
    {
      const ch5 = SER.concat([{ id: '1005', title: '第五章 新增' }]);
      const fake = makeFake('703', SER);
      const { core, tmp } = await coreWith(fake);
      await core.downloadSeries('703');
      const origGet = fake.getJson.bind(fake);
      fake.getJson = async function (url) {
        if (url.includes('/ajax/novel/1005')) {
          return { id: '1005', title: '第五章 新增', userId: '999', userName: '测试作者', content: NOVEL_TEXT, tags: { tags: [{ tag: '测试' }] }, createDate: '2026-01-01', wordCount: 10, seriesNav: { seriesId: '703', seriesTitle: '测试系列', order: 5 } };
        }
        if (url.includes('series_content/703')) {
          const limit = Number((url.match(/limit=(\d+)/) || [])[1] || 30);
          const lo = Number((url.match(/last_order=(\d+)/) || [])[1] || 0);
          const all = ch5.map((c, i) => ({ id: c.id, order: i + 1 }));
          let list = all.slice().sort((a, b) => b.order - a.order);
          if (lo) list = list.filter((c) => c.order < lo);
          return { page: { seriesContents: list.slice(0, limit).map((c) => ({ id: c.id, series: { contentOrder: c.order } })) } };
        }
        if (url.includes('/ajax/novel/series/703')) {
          return { id: '703', title: '测试系列', userId: '999', userName: '测试作者', publishedContentCount: ch5.length, isConcluded: false };
        }
        return origGet(url);
      };
      const updates = await core.checkUpdates({});
      eq(updates.updates.length, 1, '检测到 1 个系列有更新');
      eq(updates.updates[0].newCount, 5, '新章数 5');
      ok(fs.existsSync(core.writer.chapterPath('测试作者', '999', '测试系列', 5, '第五章 新增', '703')), '新章已落盘');
    }

    // Cookie 熔断 + 目标级失败
    {
      const fake = makeFake('704', SER, { authIds: ['1001'] });
      const { core } = await coreWith(fake);
      let threw = null;
      try { await core.downloadSeries('704'); } catch (e) { threw = e; }
      ok(threw && threw.kind === 'auth', 'auth 错误向上熔断');

      const { core: core2 } = await coreWith(makeFake('705', SER, { failIds: ['1001'] }));
      const out = await core2.downloadTargets([{ type: 'series', id: '705' }], {});
      eq(out.failures.length, 0, '章节级失败不冒泡到目标级');
      eq(out.results[0].failures.length, 1, '章节级失败记在结果对象里');
    }

    // 取消续传
    {
      const many = Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), title: '第' + (i + 1) + '话' }));
      const fake = makeFake('706', many);
      const { core, tmp } = await coreWith(fake);
      const controller = new AbortController();
      let n = 0;
      const r = await core.downloadSeries('706', {
        signal: controller.signal,
        onProgress: (d, t, l) => { if (++n === 3) controller.abort(); },
      });
      ok(r.saved < 10, '取消后未下完');
      const manifest = JSON.parse(fs.readFileSync(path.join(tmp, 'pixiv-manifest.json'), 'utf8'));
      eq(manifest.series['706'].files.length, r.saved, 'manifest 与已存章数一致（可续传）');
    }

    // 作者全量
    {
      const fake = makeFake('707', SER);
      const orig = fake.getJson.bind(fake);
      fake.getJson = async function (url) {
        if (url.includes('/ajax/user/888/novels/all')) return { ids: SER.map((c) => c.id) };
        if (url.includes('/ajax/user/888/profile/all')) return { novelSeries: [{ id: '707' }], novelIds: SER.map((c) => c.id).concat(['2001']) };
        if (url.includes('/ajax/user/888')) return { userId: '888', name: '测试作者' };
        return orig(url);
      };
      const { core } = await coreWith(fake);
      const r = await core.downloadUser('888');
      eq(r.series, 1, '作者全量：系列 1 个');
      eq(r.novels, 1, '作者全量：系列覆盖 4 篇后散篇只剩 1');
      eq(r.saved, 5, '作者全量：新存 4 章 + 1 散篇');
    }
  };

  flow().then(() => {
    console.log('\n===== ' + (pass + fail) + ' 项断言：通过 ' + pass + '，失败 ' + fail + ' =====');
    if (fail) {
      fails.forEach((f) => console.log('  - ' + f));
      process.exit(1);
    }
  }).catch((e) => {
    console.log('测试框架异常: ' + (e && e.stack || e));
    process.exit(1);
  });
})();
