'use strict';

// PixivCore：编排层 —— 输入解析 → 端点 → 标记还原 → 落盘 → manifest
// ctx: { signal?: AbortSignal, onProgress?(done, total, label), onlyNewAfter?: number }

const fs = require('fs');
const path = require('path');
const { Fetcher, PixivError } = require('./fetcher');
const { Api } = require('./api');
const { renderContent } = require('./render');
const { Writer, sanitizeName } = require('./writer');
const { parseInput } = require('./parseInput');

const pad3 = (n) => String(n).padStart(3, '0');
const novelUrl = (id) => `https://www.pixiv.net/novel/${id}`;
const seriesUrl = (id) => `https://www.pixiv.net/novel/series/${id}`;

// 章节名行: 已带章节标记（第X章/话/卷…、序章、楔子等）就用原标题, 否则补成 "第N话 标题"
const CHAPTER_MARK_RE = /^\s*(第[〇零一二三四五六七八九十百千万两0-9０-９]+[章节卷回部集话]|序章|序言|楔子|引子|尾声|后记|终章|番外)/;
function chapterTitleLine(order, title) {
  const t = String(title || '').trim();
  if (t && CHAPTER_MARK_RE.test(t)) {
    return t;
  }
  return `第${Number(order) || 1}话` + (t ? ' ' + t : '');
}

function metaOf(novel, order, seriesMeta) {
  return {
    id: novel.id,
    title: novel.title,
    author: novel.userName,
    userId: novel.userId,
    series: seriesMeta ? { id: seriesMeta.id, title: seriesMeta.title, order } : null,
    tags: novel.tags,
    wordCount: novel.wordCount,
    createDate: novel.createDate,
    url: novelUrl(novel.id),
    savedAt: new Date().toISOString(),
  };
}

class PixivCore {
  constructor(opts = {}) {
    this.opts = opts;
    this.fetcher = new Fetcher(opts);
    this.api = new Api(this.fetcher, opts);
    this.writer = new Writer(opts);
    this.log = opts.log || (() => {});
    this.forceSeries = new Set();
    this.forceNovels = new Set();
    this.forceUsers = new Set();
  }

  parseInput(t) { return parseInput(t); }

  // 每次任务入口统一挂载取消信号（fetcher 请求/退避/重试全程可中断）
  _bindSignal(ctx) {
    this.fetcher.signal = (ctx && ctx.signal) || null;
  }

  // 单篇 → 作者名/标题.txt
  async downloadNovel(novelId, ctx = {}) {
    this._bindSignal(ctx);
    const novel = await this.api.novel(novelId);
    const rendered = renderContent(novel.content, this.opts);
    if (!rendered.text.trim()) {
      // R-18 作品在 Cookie 失效/未登录/未开启 R-18 显示时, pixiv 返回 200+完整元数据但正文为空
      throw new PixivError('empty', 'Pixiv 返回了空正文' + (novel.xRestrict ? '（R-18 作品）' : '') +
        ' —— Cookie 可能已失效，或账号未开启“浏览R-18作品”显示设置');
    }
    const file = this.writer.novelPath(novel.userName, novel.userId, novel.title, novel.id);
    const r = this.writer.saveText(file, rendered.text, { overwrite: this.forceNovels.has(String(novelId)), backup: true });
    this.forceNovels.delete(String(novelId));
    this.writer.writeUrlNote(path.dirname(file), novelUrl(novel.id), novel.title);
    this.writer.writeMeta(file, metaOf(novel, 0, null));
    this.writer.manifest.novels[novel.id] = {
      title: novel.title,
      author: novel.userName,
      userId: novel.userId,
      file: this.writer.relative(file),
      seriesNav: novel.seriesNav,
      fetchedAt: new Date().toISOString(),
    };
    this.writer.saveManifest();
    if (rendered.unknown.length) this.log(`未识别标记(${novel.id}): ${rendered.unknown.join(' ')}`);
    ctx.onProgress && ctx.onProgress(1, 1, `单篇《${novel.title}》${r.skipped ? '(已存在跳过)' : '已保存'}`);
    return { type: 'novel', id: novel.id, title: novel.title, file, skipped: r.skipped, unknownMarkers: rendered.unknown, seriesNav: novel.seriesNav };
  }

  // 强制重抓只标记意图；成功拿到正文后备份替换，失败时保留旧文件。
  clearSeries(id) {
    const key = String(id);
    const entry = this.writer.manifest.series[key];
    if (entry) {
      if (entry.dir) this.writer.safePath(entry.dir);
      for (const file of entry.files || []) if (file.file) this.writer.safePath(file.file);
    }
    this.forceSeries.add(key);
    return !!entry;
  }
  clearNovel(id) {
    const key = String(id);
    const entry = this.writer.manifest.novels[key];
    if (entry && entry.file) this.writer.safePath(entry.file);
    this.forceNovels.add(key);
    return !!entry;
  }
  clearUser(id) {
    const key = String(id);
    this.forceUsers.add(key);
    return Object.values(this.writer.manifest.series).some((e) => e && String(e.userId) === key) ||
      Object.values(this.writer.manifest.novels).some((e) => e && String(e.userId) === key);
  }

  // 系列 → 作者名/系列名/NNN 标题.txt + _合并.txt + 链接注记
  // 章节列表本身只含 {id, order}（无标题），标题随正文一并抓取；已抓过的章按 manifest 记录跳过
  async downloadSeries(seriesId, ctx = {}) {
    this._bindSignal(ctx);
    const { meta, chapters } = await this.api.seriesAll(seriesId);
    if (!chapters.length) this.log(`系列 ${seriesId} 没有可下载的章节`);
    const dir = this.writer.seriesDir(meta.userName, meta.userId, meta.title, seriesId);
    let entry = this.writer.manifest.series[seriesId];
    if (!entry) {
      entry = {
        title: meta.title,
        author: meta.userName,
        userId: meta.userId,
        url: seriesUrl(seriesId),
        files: [],
        failed: [],
      };
      this.writer.manifest.series[seriesId] = entry;
    }
    const legacy = !entry.dir;
    const legacyAuthor = entry.author;
    const legacyTitle = entry.title;
    const ambiguousLegacy = legacy && Object.entries(this.writer.manifest.series).some(([id, other]) => id !== String(seriesId) && other.author === legacyAuthor && other.title === legacyTitle);
    entry.dir = this.writer.relative(dir);
    entry.title = meta.title;
    entry.author = meta.userName;

    const knownIds = new Map(entry.files.map(f => [String(f.id), f]));
    const force = this.forceSeries.has(String(seriesId));
    const failures = [];
    let saved = 0;
    let skipped = 0;
    let emptyStreak = 0;
    let completedNormally = false;
    const total = chapters.length;
    try {
    for (let i = 0; i < total; i++) {
      if (ctx.signal && ctx.signal.aborted) { this.log('已取消（写完当前章后停止，可再次运行续传）'); break; }
      const ch = chapters[i];
      const order = ch.order || i + 1;
      let forceWrite = force;
      const known = knownIds.get(String(ch.id));
      let oldKnownPath = null;
      if (known && known.file) {
        try { oldKnownPath = this.writer.safePath(known.file); } catch (_) { oldKnownPath = null; }
      }
      if (known && !force && !ambiguousLegacy) {
        // 自愈: manifest 记录已抓, 但文件已不在盘上（被手动清理）或只剩标题行空壳（空正文 bug 的产物）→ 重新下载
        const knownPath = oldKnownPath || (legacy
          ? this.writer.legacyChapterPath(legacyAuthor, entry.userId, legacyTitle, known.order || order, known.title || '第' + order + '话')
          : this.writer.chapterPath(meta.userName, meta.userId, meta.title, known.order || order, known.title, seriesId));
        oldKnownPath = knownPath;
        known.file = this.writer.relative(knownPath);
        if (fs.existsSync(knownPath)) {
          let shellOnly = false;
          try {
            const txt = fs.readFileSync(knownPath, 'utf8');
            if (txt.split(/\r?\n/).slice(1).join('').trim().length === 0) shellOnly = true;
          } catch (e) { /* 读取失败 → 当作正常存在 */ }
          if (shellOnly) {
            this.log(`章节 ${ch.id} 文件只有标题行（空壳），重新下载`);
            forceWrite = true;
          } else {
            ctx.onProgress && ctx.onProgress(i, total, `《${meta.title}》${pad3(order)} ${known.title}（已存在跳过）`);
            skipped++;
            continue;
          }
        } else {
          this.log(`章节 ${ch.id} 在 manifest 有记录但文件缺失，重新下载`);
          forceWrite = true;
        }
      }
      ctx.onProgress && ctx.onProgress(i, total, `《${meta.title}》${pad3(order)} ${known ? known.title : '(新章)'}`);
      try {
        const novel = await this.api.novel(ch.id);
        const rendered = renderContent(novel.content, this.opts);
        if (!rendered.text.trim()) {
          emptyStreak++;
          const msg = 'Pixiv 返回了空正文' + (novel.xRestrict ? '（R-18 作品）' : '') +
            ' —— Cookie 可能已失效，或账号未开启“浏览R-18作品”显示设置';
          this.log(`章节 ${ch.id}（${novel.title}）：${msg}`);
          failures.push({ id: ch.id, title: novel.title, kind: 'empty', message: msg });
          if (emptyStreak >= 3) {
            this.log('连续 3 章空正文 —— 停止本系列剩余章节。请通过“管理 Cookie”检查 Cookie 是否失效、账号是否开启 R-18 显示，处理后重新抓取即可自动补齐。');
            break;
          }
          continue;
        }
        emptyStreak = 0;
        const file = this.writer.chapterPath(meta.userName, meta.userId, meta.title, order, novel.title, seriesId);
        // 首行 = 章节名（网页上的”第X章 XXXX”），供章节导航与合并版直接识别
        const r = this.writer.saveText(file, chapterTitleLine(order, novel.title) + '\n\n' + rendered.text, { overwrite: forceWrite, backup: true });
        if (!r.skipped) {
          saved++;
          // 章节标题改名且重抓成功时，将旧路径文件归档为 .bak，避免目录残留两份同序号章节
          if (oldKnownPath && path.resolve(oldKnownPath) !== path.resolve(file) && fs.existsSync(oldKnownPath)) {
            try { fs.renameSync(oldKnownPath, oldKnownPath + '.' + Date.now() + '.bak'); } catch (_) { /* ignore */ }
          }
        }
        const record = known || {};
        Object.assign(record, { id: String(ch.id), order, title: novel.title, file: this.writer.relative(file) });
        if (!known) entry.files.push(record);
        knownIds.set(String(ch.id), record);
        this.writer.writeMeta(file, metaOf(novel, order, meta));
        if (rendered.unknown.length) this.log(`未识别标记(${ch.id}): ${rendered.unknown.join(' ')}`);
        this.writer.saveManifest({ checkpoint: true });
      } catch (e) {
        if (e.kind === 'auth') throw e; // finally 会持久化已完成章节
        if (ctx.signal && ctx.signal.aborted) { this.log('已取消（已保存完成章节，可再次运行续传）'); break; }
        failures.push({ id: ch.id, title: '', kind: e.kind || 'error', message: e.message });
        this.log(`章节 ${ch.id} 失败(${e.kind}): ${e.message}`);
      }
    }
    completedNormally = true;
    } finally { if (!completedNormally) this.writer.saveManifest(); }
    this.forceSeries.delete(String(seriesId));
    const wasAborted = !!(ctx.signal && ctx.signal.aborted);
    const prevCount = entry.count;
    entry.count = meta.publishedContentCount;
    entry.aborted = wasAborted;
    entry.fetchedAt = new Date().toISOString();
    entry.failed = failures;
    this.writer.writeUrlNote(dir, seriesUrl(seriesId), meta.title);
    const mergedTarget = path.join(dir, '_合并.txt');
    const needMerged = !wasAborted && (saved > 0 || failures.length > 0 || force || prevCount !== meta.publishedContentCount || !entry.mergedFile || !fs.existsSync(mergedTarget));
    if (needMerged) this.writeMerged(meta, chapters, dir, entry);
    this.writer.saveManifest();
    ctx.onProgress && ctx.onProgress(total, total, `系列《${meta.title}》完成 新${saved}/跳${skipped}/败${failures.length}`);
    return {
      type: 'series',
      id: seriesId,
      title: meta.title,
      author: meta.userName,
      total,
      saved,
      skipped,
      failures,
      savedChapterIds: entry.files.map((f) => String(f.id)),
      allChapterIds: chapters.map((c) => String(c.id)),
      mergedFile: mergedTarget,
    };
  }

  writeMerged(meta, chapters, dir, entry) {
    const byId = new Map(entry.files.map((f) => [String(f.id), f]));
    const parts = [`《${meta.title}》`, `作者：${meta.userName}　来源：${seriesUrl(meta.id)}`];
    let missing = 0;
    chapters.forEach((ch) => {
      const rec = byId.get(String(ch.id));
      const order = (rec && rec.order) || ch.order;
      const title = (rec && rec.title) || `第${order}话`;
      const file = rec && rec.file ? this.writer.safePath(rec.file) : this.writer.chapterPath(meta.userName, meta.userId, meta.title, order, title, meta.id);
      parts.push('');
      try {
        // 章节文件自带章节名首行，直接拼接即可
        const text = fs.readFileSync(file, 'utf8');
        parts.push(text.replace(/\r\n/g, '\n').trimEnd());
      } catch (e) {
        missing++;
        parts.push(chapterTitleLine(order, rec && rec.title), '', '（本章下载失败，重跑抓取可补上）');
      }
    });
    const merged = path.join(dir, '_合并.txt');
    this.writer.saveText(merged, parts.join('\n'), { overwrite: true });
    entry.mergedFile = this.writer.relative(merged);
    if (missing) this.log(`合并版有 ${missing} 章下载失败，已在对应位置留占位`);
  }

  // 作者全量 → 全部系列 + 剩余散篇（系列已覆盖的 ID 不重复抓）
  async downloadUser(userId, ctx = {}) {
    this._bindSignal(ctx);
    const brief = await this.api.userBrief(userId);
    const works = await this.api.userWorks(userId);
    if (!works.novelIds.length && !works.seriesIds.length && !this.fetcher.cookie) {
      // 实测：未登录时 profile/all 对 R-18 作者返回全空，作品 ID 列表需要登录 Cookie
      throw new PixivError('auth', `作者 ${brief.name || userId} 的作品列表为空且未配置 Cookie：R-18 作者的作品 ID 列表登录后才可见（也可能是该作者确实没有作品）`);
    }
    this.log(`作者 ${brief.name || userId}：${works.seriesIds.length} 个系列 / ${works.novelIds.length} 个作品 ID`);
    const force = this.forceUsers.has(String(userId));
    this.forceUsers.delete(String(userId));
    const covered = new Set();
    const seriesResults = [];
    const failures = [];
    for (const sid of works.seriesIds) {
      if (ctx.signal && ctx.signal.aborted) break;
      try {
        if (force) this.clearSeries(sid);
        const r = await this.downloadSeries(sid, ctx);
        seriesResults.push(r);
        failures.push(...r.failures.map(f => '系列 ' + sid + ' / ' + f.id + ': ' + f.message));
        (r.allChapterIds || r.savedChapterIds || []).forEach((id) => covered.add(String(id)));
      } catch (e) {
        const knownSeries = this.writer.manifest.series[sid];
        if (knownSeries && Array.isArray(knownSeries.files)) {
          knownSeries.files.forEach((f) => f && f.id && covered.add(String(f.id)));
        }
        if (e.kind === 'auth') throw e;
        if (ctx.signal && ctx.signal.aborted) break;
        failures.push(`系列 ${sid}: ${e.message}`);
      }
    }
    const rest = works.novelIds.filter((id) => !covered.has(String(id)));
    const novelResults = [];
    for (const nid of rest) {
      if (ctx.signal && ctx.signal.aborted) break;
      try {
        if (force) this.clearNovel(nid);
        novelResults.push(await this.downloadNovel(nid, ctx));
      } catch (e) {
        if (e.kind === 'auth') throw e;
        if (ctx.signal && ctx.signal.aborted) break;
        failures.push(`单篇 ${nid}: ${e.message}`);
      }
    }
    const saved = seriesResults.reduce((n, r) => n + r.saved, 0) + novelResults.filter((r) => !r.skipped).length;
    const skipped = seriesResults.reduce((n, r) => n + r.skipped, 0) + novelResults.filter((r) => r.skipped).length;
    ctx.onProgress && ctx.onProgress(1, 1, `作者 ${brief.name || userId} 完成 新${saved}/跳${skipped}/败${failures.length}`);
    return { type: 'user', id: String(userId), name: brief.name, series: seriesResults.length, novels: novelResults.length, saved, skipped, failures };
  }

  // 增量更新：只拉每系列元数据对比总章数，有新增才进入下载流程
  // （旧章按 manifest 记录跳过，正文零重复抓取；倒序列表第一页天然覆盖最新章）
  async checkUpdates(ctx = {}) {
    this._bindSignal(ctx);
    const updates = [];
    const failures = [];
    for (const [sid, entry] of Object.entries(this.writer.manifest.series)) {
      if (ctx.signal && ctx.signal.aborted) break;
      try {
        const meta = await this.api.seriesMeta(sid);
        const savedCount = (entry.files || []).length;
        const oldCount = entry.count || savedCount;
        const incomplete = !!entry.aborted || (Array.isArray(entry.failed) && entry.failed.length > 0) ||
          (oldCount > 0 && savedCount < Math.min(oldCount, meta.publishedContentCount));
        if (meta.publishedContentCount > oldCount || incomplete) {
          this.log(meta.publishedContentCount > oldCount
            ? `《${entry.title}》${oldCount} → ${meta.publishedContentCount} 章，补抓新章`
            : `《${entry.title}》上次未抓完（已存 ${savedCount}/${meta.publishedContentCount} 章），继续补齐`);
          const result = await this.downloadSeries(sid, ctx);
          failures.push(...result.failures.map(f => '系列 ' + sid + ' / ' + f.id + ': ' + f.message));
          if (result.saved > 0 || meta.publishedContentCount > oldCount) {
            updates.push({ id: sid, title: entry.title, oldCount: savedCount, newCount: meta.publishedContentCount, saved: result.saved, failures: result.failures.length });
          }
        } else {
          this.log(`《${entry.title}》无更新（${oldCount} 章）`);
        }
      } catch (e) {
        if (e.kind === 'auth') throw e;
        if (ctx.signal && ctx.signal.aborted) break;
        failures.push(`检查《${entry.title}》失败: ${e.message}`);
        this.log(failures[failures.length - 1]);
      }
    }
    return { updates, failures, aborted: !!(ctx.signal && ctx.signal.aborted) };
  }

  async downloadTargets(targets, ctx = {}) {
    const results = [];
    const failures = [];
    for (const t of targets) {
      if (ctx.signal && ctx.signal.aborted) break;
      ctx.onProgress && ctx.onProgress(0, 0, `开始处理 ${t.type} ${t.id}`);
      try {
        if (t.type === 'series') results.push(await this.downloadSeries(t.id, ctx));
        else if (t.type === 'user') results.push(await this.downloadUser(t.id, ctx));
        else results.push(await this.downloadNovel(t.id, ctx));
      } catch (e) {
        if (e.kind === 'auth') throw e;
        failures.push({ target: t, kind: e.kind || 'error', message: e.message });
        this.log(`目标 ${t.type} ${t.id} 失败(${e.kind}): ${e.message}`);
      }
    }
    return { results, failures };
  }
}

module.exports = { PixivCore, PixivError, pad3, novelUrl, seriesUrl, sanitizeName };
