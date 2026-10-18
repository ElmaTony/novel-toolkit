'use strict';

// 端点集中封装：字段只在这里映射一次，pixiv 改版只改本文件
// 注意：社区 API 文档已失修，以下字段以 2026-10 实测为准（见 fixtures/）

const path = require('path');
const { BASE } = require('./fetcher');

class Api {
  constructor(fetcher, opts = {}) {
    this.f = fetcher;
    this.rawCacheDir = opts.rawCacheDir || '';
    this.log = opts.log || (() => {});
  }

  _cache(file, body) {
    if (!this.rawCacheDir) return;
    try {
      const fs = require('fs');
      fs.mkdirSync(this.rawCacheDir, { recursive: true });
      fs.writeFileSync(path.join(this.rawCacheDir, file), JSON.stringify({ savedAt: new Date().toISOString(), body }, null, 2));
    } catch (e) {
      this.log(`原始缓存写入失败: ${e.message}`);
    }
  }

  async novel(id) {
    const body = await this.f.getJson(`${BASE}/ajax/novel/${id}`);
    this._cache(`novel-${id}.json`, body);
    return {
      id: String(body.id || id),
      title: String(body.title || `无题${id}`),
      userId: String(body.userId || ''),
      userName: String(body.userName || ''),
      content: String(body.content || ''),
      tags: ((body.tags && body.tags.tags) || []).map((t) => t && t.tag).filter(Boolean),
      createDate: String(body.createDate || ''),
      uploadDate: String(body.uploadDate || ''),
      wordCount: Number(body.wordCount || 0),
      xRestrict: Number(body.xRestrict || 0),
      seriesNav: (body.seriesNav && body.seriesNav.seriesId) ? {
        seriesId: String(body.seriesNav.seriesId),
        seriesTitle: String(body.seriesNav.seriesTitle || ''),
        order: Number(body.seriesNav.order || 0),
      } : null,
      raw: body,
    };
  }

  // 系列元数据（不含章节列表；实测 2026-10：pageData 字段已从该端点移除）
  async seriesMeta(id) {
    const body = await this.f.getJson(`${BASE}/ajax/novel/series/${id}`);
    this._cache(`series-${id}.json`, body);
    return {
      id: String(body.id || id),
      title: String(body.title || `系列${id}`),
      userId: String(body.userId || ''),
      userName: String(body.userName || ''),
      publishedContentCount: Number(body.publishedContentCount || 0),
      isConcluded: !!body.isConcluded,
    };
  }

  // 章节列表一页（倒序：最新在前）。lastOrder=0 从最新开始；
  // 实测语义：返回 contentOrder < lastOrder 的下一批（lastOrder 为 0/缺省时返回最新的 limit 个）
  async seriesContentPage(id, lastOrder, limit = 30) {
    const lo = Number(lastOrder) || 0;
    const url = `${BASE}/ajax/novel/series_content/${id}?limit=${limit}` + (lo ? `&last_order=${lo}` : '');
    const body = await this.f.getJson(url);
    this._cache(`series_content-${id}-${lo}.json`, body);
    const arr = (body.page && body.page.seriesContents) || [];
    return arr
      .map((x) => ({ id: String(x.id), order: Number(x.series && x.series.contentOrder) || 0 }))
      .filter((c) => /^\d+$/.test(c.id));
  }

  // 翻完整本系列 → 正序（第 1 话在前）。终止：短页 / 空页 / 拿满元数据章数 / 页数保险
  async seriesAll(id, onPage) {
    const meta = await this.seriesMeta(id);
    const collected = [];
    let lastOrder = 0;
    let pages = 0;
    const maxPages = Math.ceil((meta.publishedContentCount || 0) / 30) + 5;
    for (;;) {
      const page = await this.seriesContentPage(id, lastOrder, 30);
      pages++;
      collected.push(...page);
      if (onPage) onPage(collected.length, meta.publishedContentCount);
      if (page.length < 30 || pages >= maxPages) break;
      const minOrder = Math.min(...page.map((c) => c.order));
      if (!minOrder) break;
      lastOrder = minOrder;
      if (meta.publishedContentCount && collected.length >= meta.publishedContentCount) break;
    }
    collected.sort((a, b) => a.order - b.order);
    // 去重（万一跨页重叠）
    const seen = new Set();
    const chapters = collected.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
    if (!meta.publishedContentCount) meta.publishedContentCount = chapters.length;
    return { meta, chapters };
  }

  async userBrief(id) {
    try {
      const b = await this.f.getJson(`${BASE}/ajax/user/${id}`);
      return { id: String(b.userId || id), name: String(b.name || '') };
    } catch (e) {
      if (e.kind === 'auth' || e.kind === 'rate') throw e;
      return { id: String(id), name: '' };
    }
  }

  // 作者全部作品：novels/all 拿全量 ID（只含平铺 id，无系列信息），
  // 再用 profile/all 补系列列表；novels/all 不可用时整个降级到 profile/all
  async userWorks(id) {
    let novelIds = [];
    try {
      const b = await this.f.getJson(`${BASE}/ajax/user/${id}/novels/all`);
      const ids = Array.isArray(b) ? b : (Array.isArray(b && b.ids) ? b.ids : []);
      novelIds = ids.map(String);
    } catch (e) {
      if (e.kind === 'auth' || e.kind === 'rate') throw e;
      this.log(`novels/all 不可用(${e.message})，降级 profile/all`);
    }
    const seriesIds = [];
    try {
      const p = await this.f.getJson(`${BASE}/ajax/user/${id}/profile/all`);
      const harvest = (v, out) => {
        if (!Array.isArray(v)) return;
        for (const x of v) {
          const s = String(typeof x === 'object' && x ? (x.id || '') : x || '');
          if (/^\d+$/.test(s)) out.push(s);
        }
      };
      harvest(p.novelSeries, seriesIds);
      harvest(p.novelIds, novelIds);
      harvest(p.novels, novelIds);
      novelIds = Array.from(new Set(novelIds));
    } catch (e) {
      if (e.kind === 'auth' || e.kind === 'rate') throw e;
      this.log(`profile/all 不可用(${e.message})，系列信息缺失`);
    }
    return { novelIds, seriesIds };
  }
}

module.exports = { Api };
