'use strict';

// cool18 核心流程测试: 注入 fake fetchPage, 离线验证排序/去重/命名/落盘
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { Cool18Core } = require('../src/engine/cool18/core');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name); }
};

const BBS = 'https://www.cool18.com/bbs4/index.php?app=forum&act=threadview&tid=';
const page = (title, body, links) => {
  const linkHtml = links
    .map((l) => '<a href="' + BBS + l.tid + '">' + l.text + '</a>')
    .join('');
  return '<html><h1 class="main-title">' + title + '</h1>' +
    '<div class="content-section" id="content-section"><pre>' + body + linkHtml + '</pre></div></html>';
};

(async () => {
  console.log('== cool18 core（fake fetchPage）');

  // 1) 混合编号: 无编号帖按"父帖位置+链接序号"的分数键排序, 不再堆到末尾
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c18-frac-'));
    const pages = {
      1: page('【书】(1-2) 作者：x', '　　第一章 内容。', [
        { tid: 2, text: '【书】作者的话' },
        { tid: 3, text: '【书】第二章 终' },
      ]),
      2: page('【书】作者的话', '　　番外说明。', []),
      3: page('【书】第二章 终', '　　第二章内容。', []),
    };
    const core = new Cool18Core({
      outputRoot: tmp,
      fetchPage: async (url) => pages[url.match(/tid=(\d+)/)[1]],
      delayMs: 0,
      log: () => {},
    });
    const r = await core.scrape([BBS + 1], { deep: true });
    ok('分数键: 抓到 3 帖', r.count === 3);
    const sortedChaps = r.files.map((f) => f.match(/^(\d+)/)[1]);
    ok('分数键: 文件按排序位置编号 001-003', sortedChaps.join(',') === '001,002,003');
    ok('分数键: 无 1e9 末尾堆积', r.files.every((f) => !/^999/.test(f)));
    // 合并成品顺序 = 第一章 → 作者的话 → 第二章 终
    const merged = fs.readFileSync(path.join(r.outDir, fs.readdirSync(r.outDir).find((n) => n.startsWith('【书】【1-'))), 'utf8');
    const i1 = merged.indexOf('第一章 内容。');
    const i2 = merged.indexOf('番外说明。');
    const i3 = merged.indexOf('第二章内容。');
    ok('合并: 三段正文齐全', i1 >= 0 && i2 >= 0 && i3 >= 0);
    ok('合并: 顺序正确（话→终 在内容之后）', i2 > i1 && i3 > i1);
  }

  // 2) 同章号去重: 保留正文更长的一份
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c18-dup-'));
    const pages = {
      10: page('【书2】第四章', '　　短的版本。', [{ tid: 11, text: '【书2】第四章（完）' }]),
      11: page('【书2】第四章（完）', '　　长很多很多很完整的版本，包含全部情节。', []),
    };
    const core = new Cool18Core({
      outputRoot: tmp,
      fetchPage: async (url) => pages[url.match(/tid=(\d+)/)[1]],
      delayMs: 0,
      log: () => {},
    });
    const r = await core.scrape([BBS + 10], { deep: true });
    ok('去重: 同章号转贴只留一份', r.count === 1);
    const f = path.join(r.outDir, r.files[0]);
    const content = fs.readFileSync(f, 'utf8');
    ok('去重: 保留正文更长的一份', content.includes('长很多很多'));
  }

  // 2.5) 分部章: （5上）（5下）同章号不同部 —— 都保留, 按上→下排序（v0.12.0 互删 bug 回归）
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c18-part-'));
    const pages = {
      30: page('【书3】(1-2) 作者：y', '　　第一章 上部内容，交代背景。', [{ tid: 31, text: '（5下）' }]),
      31: page('（5下）', '　　第五章下部内容，结局。', []),
    };
    // 再造一个 (5上) 帖: 由 31 的链接指过去
    pages[31] = page('（5下）', '　　第五章下部内容，结局。', [{ tid: 32, text: '（5上）' }]);
    pages[32] = page('（5上）', '　　第五章上部内容，开端。', []);
    const core = new Cool18Core({
      outputRoot: tmp,
      fetchPage: async (url) => pages[url.match(/tid=(\d+)/)[1]],
      delayMs: 0,
      log: () => {},
    });
    const r = await core.scrape([BBS + 30], { deep: true });
    ok('分部: （5上）（5下）两帖都保留（不互删）', r.count === 3);
    const mergedName = fs.readdirSync(r.outDir).find((n) => n.startsWith('书3') && n.endsWith('.txt'));
    const merged = fs.readFileSync(path.join(r.outDir, mergedName), 'utf8');
    const iUp = merged.indexOf('第五章上部内容');
    const iDown = merged.indexOf('第五章下部内容');
    ok('分部: 上部在下部之前（部序参与排序）', iUp >= 0 && iDown >= 0 && iUp < iDown);
  }

  // 3) 成品命名: 完结书
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c18-name-'));
    const pages = {
      20: page('【书名】(1-2完) 作者：测试者', '　　正文。', []),
    };
    const core = new Cool18Core({ outputRoot: tmp, fetchPage: async () => pages[20], delayMs: 0, log: () => {} });
    const r = await core.scrape([BBS + 20], { deep: false });
    ok('命名: 完结书格式', r.files[0] === '001_【书名】(1-2完)_作者：测试者.txt');
  }
})().then(() => {
  console.log('\n===== cool18 core：通过 ' + pass + '，失败 ' + fail + ' =====');
  if (fail) { process.exit(1); }
}).catch((e) => {
  console.log('测试异常: ' + (e && e.stack || e));
  process.exit(1);
});
