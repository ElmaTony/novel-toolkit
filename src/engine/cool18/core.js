'use strict';

// cool18 编排层 —— 从 Python run_scrape 移植:
//   deep 模式: 从首个链接出发 BFS 跟随帖内章节链接, 按 (章节区间, tid) 排序
//   列表模式: 按输入顺序逐帖抓取
// 输出: <输出根>/<书名>/NNN_标题.txt（deep 为 NNNNN-NNNNN_标题.txt），>1 帖加合集.txt
// 铁律: 只新建文件，不删除、不覆盖既有文件

const fs = require('fs');
const path = require('path');
const { BBS4, extractThread, chapterKey, sanitizeName, parseSearchResults } = require('./parse');
const { fetchPage } = require('./fetcher');
const { sleep } = require('../async');

// 可中断的等待: 中断返回 false
async function waitNext(ms, signal) {
  if (signal && signal.aborted) return false;
  if (ms <= 0) return true;
  try { await sleep(ms, signal); return true; }
  catch (e) { return false; }
}

function threadHead(t, url) {
  return t.title + '\n作者/送交: ' + t.author + '    时间: ' + t.date +
    '\n来源: ' + url + '\n' + '='.repeat(40) + '\n';
}

const toCRLF = (text) => String(text).replace(/\r?\n/g, '\r\n');

// 合并成品命名:
//   完结书   → 书名【完】作者：XXX.txt
//   未完结   → 书名【1-XX】作者：XXX.txt（XX = 最新章号）
// 书名: 优先取标题中最长的【】内文; 无【】则剥掉范围标记与作者段
// 作者: 1) 标题里显式"作者：X/作者_X"  2) 范围标记后的裸签名(如"(1-70完)兴趣使然")  3) 送交者
function buildMergedName(items) {
  const first = items[0].t;
  const title = String(first.title || '');

  let author = '';
  const am = title.match(/作者[:：_\s]*([^\s（(【）)】]+)/);
  if (am) {
    author = am[1];
  } else {
    const tm = title.match(/(?:完[）)]|[）)]|\d完)\s*([^\s（(【）)】]{2,12})\s*$/);
    if (tm) {
      author = tm[1];
    }
  }
  if (!author) {
    author = first.author || '未知';
  }

  const complete = items.some((it) =>
    /(\d+\s*完[）)])|（完）|\(完\)|完[）)]|全文完|大结局|完结|全一帖/.test(it.t.title));
  const starts = items.map((it) => (it.cover ? it.cover.a : it.key[1])).filter((n) => Number.isInteger(n) && n > 0 && n < 1e8);
  const ends = items.map((it) => (it.cover ? it.cover.b : (it.key[4] || it.key[1]))).filter((n) => Number.isInteger(n) && n > 0 && n < 1e8);
  let tag;
  if (complete) {
    tag = '【完】';
  } else if (starts.length && ends.length) {
    tag = '【' + Math.min(...starts) + '-' + Math.max(...ends) + '】';
  } else {
    tag = '【1-' + items.length + '】';
  }

  let book = '';
  const brackets = title.match(/【([^】]{2,})】/g) || [];
  for (const b of brackets) {
    const inner = b.slice(1, -1);
    if (inner.length > book.length) {
      book = inner; // 书名通常是标题里最长的【】内文
    }
  }
  if (!book) {
    book = title
      .replace(/[（(]\s*\d+\s*-\s*\d+\s*完?\s*[）)]/g, '')
      .replace(/作者[:：_][^）)】]*/g, '')
      .replace(/\s+$/, '');
  }
  return sanitizeName(book + tag + '作者：' + author) + '.txt';
}

function writeText(filePath, text) {
  if (fs.existsSync(filePath)) {
    return false; // 绝不覆盖
  }
  try { fs.writeFileSync(filePath, '\ufeff' + toCRLF(text), { encoding: 'utf8', flag: 'wx' }); }
  catch (e) { if (e.code === 'EEXIST') return false; throw e; }
  return true;
}

class Cool18Core {
  constructor(opts = {}) {
    this.outputRoot = opts.outputRoot;
    this.proxy = opts.proxy || '';
    this.delayMs = Math.max(0, Number(opts.delayMs === undefined ? 1000 : opts.delayMs));
    this.maxPages = Math.max(1, Number(opts.maxPages) || 300);
    this.maxRetries = Math.max(1, Number(opts.maxRetries) || 4);
    this.cleanAds = opts.cleanAds !== false;
    this.log = opts.log || (() => {});
    this.fetchPage = opts.fetchPage || fetchPage; // 可注入（离线测试用）
  }

  _nextDelay() {
    // ±20% 抖动，避免固定节奏触发站点限速
    return Math.max(0, Math.round(this.delayMs * (0.8 + Math.random() * 0.4)));
  }

  // 站内搜索: 返回 [{ tid, title }]
  async search(keyword, { signal } = {}) {
    const url = 'https://www.cool18.com/bbs4/index.php?app=forum&act=threadsearch&bbsdr=bbs4&keywords=' +
      encodeURIComponent(keyword);
    const page = await this.fetchPage(url, { proxy: this.proxy, retries: this.maxRetries, signal, log: this.log });
    return parseSearchResults(page);
  }

  // 返回 { count, outDir, files, aborted }
  async scrape(entries, { deep = false, signal = null, onProgress = () => {} } = {}) {
    const items = [];
    const failed = [];
    if (deep) {
      const seen = new Set();
      let visitedPages = 0; // 包含重复与失败页，避免去重绕过访问上限
      const queue = entries.slice(0, 1).map((u) => ({ url: u, via: '', base: null, frac: 0, vol: 0 }));
      while (queue.length && visitedPages < this.maxPages) {
        if (signal && signal.aborted) {
          this.log('[停止] 用户中断');
          break;
        }
        const item = queue.shift();
        const url = item.url;
        const via = item.via || '';
        const tm = url.match(/tid=(\d+)/);
        if (tm && seen.has(tm[1])) {
          continue;
        }
        if (tm) {
          seen.add(tm[1]);
        }
        let t;
        visitedPages++;
        try {
          t = extractThread(await this.fetchPage(url, { proxy: this.proxy, retries: this.maxRetries, signal, log: this.log }), {
            cleanAds: this.cleanAds,
            onRemove: (line) => this.log('[清理广告行] ' + line.slice(0, 80)),
          });
        } catch (e) {
          if ((signal && signal.aborted) || /已取消/.test(e.message)) { this.log('[停止] 保存已抓内容'); break; }
          const retry = (item.retry || 0) + 1;
          if (retry <= 2) {
            // 单页 fetch 内部已重试过；失败重排队再试两轮，缓解瞬时抽风造成的缺章
            this.log('[重试排队 ' + retry + '/2] ' + url + ': ' + e.message);
            if (tm) { seen.delete(tm[1]); }
            queue.push(Object.assign({}, item, { retry }));
          } else {
            this.log('[失败] ' + url + ': ' + e.message);
            failed.push({ url, error: e.message });
          }
          continue;
        }
        // 排序键 v5: [卷号, 章号, 部序, tid, 章号结束] —— 卷 > 章 > 部序（上/中/下）三级排序
        let key = chapterKey(t.title, tm ? Number(tm[1]) : 0);
        if (key[0] >= 1e9 && via) {
          const k2 = chapterKey(via, tm ? Number(tm[1]) : 0);
          if (k2[0] < 1e9) {
            key = k2;
          }
        }
        // 卷上下文: 标题带卷号的帖子更新当前卷; 不带卷号的帖子继承当前卷
        let vol = key[0];
        if (vol === 0 && item.vol > 0 && item.vol < 1e8) vol = item.vol;
        const chapStart = key[1];
        const part = key[2];
        const chapEnd = key[4] || key[1];
        const numbered = vol < 1e8 && Number.isInteger(chapStart) && chapStart > 0;
        // 每帖只认领起始章（防止索引帖(1-70完)把后续单章帖当成重复吞掉）; 同章同部序保留更长版本
        // （同章的 上/中/下 分帖部序不同, 是不同内容, 不互斥）
        let cover = null;
        if (numbered) {
          cover = { vol, a: chapStart, b: chapStart, part };
          const prev = items.find((it) => it.cover && it.cover.vol === vol && it.cover.a === chapStart && (it.cover.part || 0) === part);
          if (prev) {
            if (t.body.length > prev.t.body.length) {
              this.log('[替换] 第 ' + vol + ':' + chapStart + ' 章发现更完整版本（' + prev.t.body.length + ' → ' + t.body.length + ' 字），已替换');
              prev.t = t;
              prev.url = url;
              prev.key = [vol, chapStart, part, tm ? Number(tm[1]) : 0, chapEnd];
            } else {
              this.log('[跳过] 第 ' + vol + ':' + chapStart + ' 章的重复帖: ' + t.title.slice(0, 30));
            }
            t.links.forEach((link, index) => {
              if (!seen.has(String(link.tid))) queue.push({ url: BBS4 + link.tid, via: link.text, base: chapEnd, frac: (index + 1) / (t.links.length + 1), vol });
            });
            onProgress('[' + items.length + '] ' + t.title + '（重复/替换）');
            if (queue.length && !(await waitNext(this._nextDelay(), signal))) break;
            continue;
          }
        }
        // 无编号帖: 继承父帖位置 + 链接序号的分数键, 插在父帖之后而不是堆到末尾
        let sortChap = numbered ? chapStart : 1e9;
        if (!numbered && item.base !== null && item.base !== undefined) {
          sortChap = item.base + item.frac;
        }
        items.push({
          key: [vol, sortChap, part, tm ? Number(tm[1]) : 0, chapEnd],
          cover, t, url,
        });
        onProgress('[' + items.length + '] ' + t.title + '（正文 ' + t.body.length + ' 字，帖内链接 ' + t.links.length + ' 条）');
        this.log('[' + items.length + '] ' + t.title + '  (正文 ' + t.body.length + ' 字, 帖内链接 ' + t.links.length + ' 条)');
        // 子链接继承位置: 父帖排序位置 + 链接序号比例
        const linkCount = t.links.length;
        for (let li = 0; li < linkCount; li++) {
          const lk = t.links[li];
          if (!seen.has(String(lk.tid))) {
            queue.push({
              url: BBS4 + lk.tid,
              via: lk.text,
              base: numbered ? chapEnd : sortChap,
              frac: (li + 1) / (linkCount + 1),
              vol,
            });
          }
        }
        if (queue.length && !(signal && signal.aborted)) {
          if (!(await waitNext(this._nextDelay(), signal))) {
            this.log('[停止] 用户中断');
            break;
          }
        }
      }
      if (queue.length && visitedPages >= this.maxPages) this.log('已达到帖子访问上限 ' + this.maxPages);
      items.sort((a, b) =>
        (a.key[0] - b.key[0]) || (a.key[1] - b.key[1]) || (a.key[2] - b.key[2]) || (a.key[3] - b.key[3]) || (a.key[4] - b.key[4]));
      // 缺章检测: 按卷检查章号覆盖, 卷与章的缺口都大声报告
      const missing = findGaps(items);
      if (missing.length) {
        this.log('⚠ 缺章检测: ' + missing.join('；') + ' —— 可能是源帖之间没有互相链接该章、或当时抓取失败。重跑一次抓取可尝试补齐（已抓章节会跳过）。');
      }
    } else {
      const total = entries.length;
      for (let i = 0; i < total; i++) {
        if (signal && signal.aborted) {
          this.log('[停止] 用户中断');
          break;
        }
        const url = entries[i];
        let t;
        try {
          t = extractThread(await this.fetchPage(url, { proxy: this.proxy, retries: this.maxRetries, signal, log: this.log }), {
            cleanAds: this.cleanAds,
            onRemove: (line) => this.log('[清理广告行] ' + line.slice(0, 80)),
          });
        } catch (e) {
          if ((signal && signal.aborted) || /已取消/.test(e.message)) { this.log('[停止] 保存已抓内容'); break; }
          failed.push({ url, error: e.message });
          this.log('[' + (i + 1) + '/' + total + '] 失败跳过: tid=' + url.split('tid=').pop() + ' (' + e.message + ')');
          continue;
        }
        items.push({ key: [0, i + 1, 0, i + 1, i + 1], t, url });
        onProgress('[' + (i + 1) + '/' + total + '] ' + t.title + '（正文 ' + t.body.length + ' 字）');
        this.log('[' + (i + 1) + '/' + total + '] ' + t.title + '  (正文 ' + t.body.length + ' 字)');
        if (i < total - 1 && !(signal && signal.aborted)) {
          if (!(await waitNext(this._nextDelay(), signal))) {
            this.log('[停止] 用户中断');
            break;
          }
        }
      }
    }

    if (!items.length) {
      throw new Error(signal && signal.aborted ? '已取消' : '没有抓到任何帖子');
    }

    const out = path.join(this.outputRoot, sanitizeName(items[0].t.title));
    fs.mkdirSync(out, { recursive: true });
    const merged = [];
    const files = [];
    let aborted = !!(signal && signal.aborted);
    items.forEach((it, idx) => {
      it.pos = idx + 1; // 文件名按成品阅读顺序编号
    });
    for (const it of items) {
      if (signal && signal.aborted && items.length > 1) {
        aborted = true; // 中断时已抓到的照常落盘
      }
      // 文件名按排序后的位置编号（即成品阅读顺序）
      const fname = String(it.pos).padStart(3, '0') + '_' + sanitizeName(it.t.title) + '.txt';
      const p = path.join(out, fname);
      if (writeText(p, threadHead(it.t, it.url) + it.t.body + '\n')) {
        this.log('  -> ' + fname);
      }
      files.push(fname);
      merged.push('='.repeat(20) + ' ' + it.t.title + '  (' + it.t.date + ') ' + '='.repeat(20) + '\n\n' + it.t.body);
    }
    if (items.length > 1) {
      const mergedName = buildMergedName(items);
      if (writeText(path.join(out, mergedName), merged.join('\n\n') + '\n')) {
        this.log('成品: ' + mergedName);
      }
    }
    this.log('完成: 共 ' + items.length + ' 帖 -> ' + out + (aborted ? '（已中断，仅保存已抓部分）' : ''));
    return { count: items.length, outDir: out, files, aborted, missing: findGaps(items), failed };
  }
}

// 缺章检测: 所有帖子章号范围 [min..max] 中未被覆盖的编号
// 缺章检测（按卷）: 每卷检查章号覆盖, 卷之间的缺口单独报告
function findGaps(items) {
  const RANGE_LIMIT = 2000; // 章号范围护栏：远端标题可含"第99999999章"，无界循环会挂死
  const vols = new Map();
  let minVol = Infinity;
  let maxVol = -Infinity;
  for (const it of items) {
    if (!it.cover || !Number.isInteger(it.key[1])) {
      continue; // 无编号帖（分数键）不参与缺章覆盖
    }
    const vol = it.cover.vol;
    const a = it.key[1];
    const b = it.key[4] || it.key[1];
    if (!vols.has(vol)) {
      vols.set(vol, { covered: new Set(), min: Infinity, max: -Infinity, abnormal: false });
    }
    const v = vols.get(vol);
    if (b - a > RANGE_LIMIT || a < 0 || b > 1e6) {
      v.abnormal = true; // 异常范围不参与覆盖统计，报告时跳过该卷
    } else {
      for (let n = a; n <= b; n++) {
        v.covered.add(n);
      }
    }
    v.min = Math.min(v.min, a);
    v.max = Math.max(v.max, b);
    minVol = Math.min(minVol, vol);
    maxVol = Math.max(maxVol, vol);
  }
  if (minVol === Infinity) {
    return [];
  }
  const out = [];
  if (maxVol - minVol > 1000) {
    return ['卷号范围异常（' + minVol + '-' + maxVol + '），跳过缺章检查'];
  }
  for (let v = minVol; v <= maxVol; v++) {
    if (!vols.has(v)) {
      out.push('第 ' + v + ' 卷整卷缺失');
      continue;
    }
    const info = vols.get(v);
    if (info.abnormal || info.max - info.min > RANGE_LIMIT) {
      out.push('第 ' + v + ' 卷章号范围异常（' + info.min + '-' + info.max + '），跳过缺章检查');
      continue;
    }
    const missing = [];
    for (let n = info.min; n <= info.max; n++) {
      if (!info.covered.has(n)) {
        missing.push(n);
      }
    }
    if (missing.length) {
      out.push('第 ' + v + ' 卷缺 ' + missing.join('、') + ' 章');
    }
  }
  return out;
}

module.exports = { Cool18Core, buildMergedName, findGaps };
