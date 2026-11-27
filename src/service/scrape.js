'use strict';

// 抓取调度层: cool18 与 Pixiv 两个引擎的统一入口
// —— 共享"同时只跑一个抓取任务"的闸门、日志通道、进度回调
// —— 配置全部在 novelToolkit.* 下, 旧插件命名空间(pixivNovel.* / cool18Novel.*)自动兜底
// —— Pixiv Cookie 存 VSCode SecretStorage(私密存储)，旧配置里的 cookie 仍作兜底

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { PixivCore } = require('../engine/pixiv/index');
const { PixivError } = require('../engine/pixiv/fetcher');
const { Cool18Core } = require('../engine/cool18/core');
const { parseEntries: parseCool18Entries, isCool18ish } = require('../engine/cool18/parse');
const { parseInput: parsePixivInput } = require('../engine/pixiv/parseInput');

const CFG = () => vscode.workspace.getConfiguration('novelToolkit');
const OLD_PIXIV = () => vscode.workspace.getConfiguration('pixivNovel');
const OLD_COOL18 = () => vscode.workspace.getConfiguration('cool18Novel');

const trim = (s) => String(s || '').trim();
const pick = (v, fallback) => (v === undefined || v === null || v === '' ? fallback : v);
const defaultRoot = (sub) => path.join(os.homedir(), 'Novels', sub);
const DEFAULT_PROXY = 'http://127.0.0.1:7897';

// 代理配置解析：新项被用户显式设置（包含空串 "" 直连）时直接采纳，否则回退旧配置与默认代理
function resolveProxy(info, cur, oldCfg, fallbackProxy = DEFAULT_PROXY) {
  if (info && (info.workspaceFolderValue !== undefined || info.workspaceValue !== undefined || info.globalValue !== undefined)) {
    return trim(cur);
  }
  if (cur !== undefined && cur !== null && cur !== '' && cur !== fallbackProxy) {
    return trim(cur);
  }
  const oldVal = oldCfg.get('proxy');
  if (oldVal !== undefined && oldVal !== null) {
    return trim(oldVal);
  }
  return cur === '' ? '' : trim(pick(cur, fallbackProxy));
}

class ScrapeManager {
  constructor(context) {
    this.context = context;
    this.channel = vscode.window.createOutputChannel('小说工具箱·抓取');
    this.active = null; // { label, controller }
    this.taskText = '';
    this.onTask = null; // (running, text) => void —— 面板任务行
    this.lastSearchStatus = 'ok';
    this.lastSearchError = '';
    this.snapshotCache = null;
    this.tokenLinks = new Set();
    context.subscriptions.push({ dispose: () => {
      this.cancel();
      for (const link of this.tokenLinks) link.dispose();
      this.tokenLinks.clear();
      this.channel.dispose();
    } });
  }

  log(msg) {
    this.channel.appendLine('[' + new Date().toLocaleTimeString('zh-CN', { hour12: false }) + '] ' + msg);
  }

  task(running, text) {
    this.taskText = text || '';
    if (this.onTask) {
      this.onTask(running, text);
    }
  }

  bindToken(token, controller) {
    if (!token) return null;
    if (token.isCancellationRequested) controller.abort();
    const link = token.onCancellationRequested(() => controller.abort());
    this.tokenLinks.add(link);
    return link;
  }
  releaseToken(link) {
    if (link) { link.dispose(); this.tokenLinks.delete(link); }
  }

  get busy() {
    return !!this.active;
  }

  cancel() {
    if (this.active) {
      this.active.controller.abort();
      this.log('已请求取消（' + this.active.label + '）');
      return true;
    }
    return false;
  }

  // ---------- 配置（新命名空间优先，旧插件配置兜底） ----------

  pixivOutputRoot() {
    return trim(pick(CFG().get('pixivOutputRoot'), OLD_PIXIV().get('outputRoot', ''))) || defaultRoot('pixiv');
  }

  cool18OutputRoot() {
    return trim(pick(CFG().get('cool18OutputRoot'), OLD_COOL18().get('outputRoot', ''))) || defaultRoot('cool18');
  }

  async pixivCookie() {
    let secret = '';
    try {
      secret = (await this.context.secrets.get('novelToolkit.pixivCookie')) || '';
    } catch (e) { /* SecretStorage 不可用时忽略 */ }
    secret = secret.trim();
    if (secret) return secret;
    // 明文兜底仅作迁移过渡：提示用户尽快转入私密存储，避免 Cookie 随 settings 同步泄漏
    const legacy = trim(pick(CFG().get('pixivCookie'), OLD_PIXIV().get('cookie', '')));
    if (legacy) {
      if (!this._cookieMigrateWarned) {
        this._cookieMigrateWarned = true;
        this.log('提示: 正在使用设置里的明文 Cookie 兜底。建议用「Pixiv 设置/更新 Cookie」存入私密存储后，到设置里删除明文项');
      }
      return legacy;
    }
    return '';
  }

  async setCookie(v) {
    const val = trim(v);
    if (!val) {
      // 清空 = 删除私密存储；若明文配置仍在会继续兜底，必须提示用户一并清理
      try { await this.context.secrets.delete('novelToolkit.pixivCookie'); } catch (e) { /* ignore */ }
      this.log('Cookie 已清除。注意: 若设置里仍有明文 novelToolkit.pixivCookie / pixivNovel.cookie，它将继续兜底生效，请到设置里删除');
      return;
    }
    await this.context.secrets.store('novelToolkit.pixivCookie', val);
    this.log('Cookie 已更新（' + val.length + ' 字符）');
  }

  buildPixivCore(cookie) {
    const c = CFG();
    let rawCacheDir = '';
    if (c.get('pixivRawCache', false) && this.context.globalStorageUri) {
      try { rawCacheDir = path.join(this.context.globalStorageUri.fsPath, '_raw'); } catch (e) { /* ignore */ }
    }
    return new PixivCore({
      outputRoot: this.pixivOutputRoot(),
      cookie: cookie || '',
      proxy: resolveProxy(typeof c.inspect === 'function' ? c.inspect('pixivProxy') : null, c.get('pixivProxy'), OLD_PIXIV(), DEFAULT_PROXY),
      intervalMs: pick(c.get('pixivIntervalMs'), OLD_PIXIV().get('intervalMs', 1200)),
      concurrency: pick(c.get('pixivConcurrency'), OLD_PIXIV().get('concurrency', 1)),
      maxRetries: pick(c.get('pixivMaxRetries'), OLD_PIXIV().get('maxRetries', 3)),
      pageSeparator: c.get('pixivPageSeparator', ''),
      rubyKeep: c.get('pixivRubyKeep', false),
      saveUrlNote: pick(c.get('pixivSaveUrlNote'), true),
      saveMeta: pick(c.get('pixivSaveMeta'), false),
      rawCacheDir,
      log: (m) => this.log(m),
    });
  }

  buildCool18() {
    const c = CFG();
    const rawDelay = Number(pick(c.get('cool18Delay'), OLD_COOL18().get('delay', 1.0)));
    const delayMs = Number.isFinite(rawDelay) ? Math.max(0, rawDelay) * 1000 : 1000;
    const rawMaxPages = Number(pick(c.get('cool18MaxPages'), OLD_COOL18().get('maxPages', 300)));
    const maxPages = Number.isFinite(rawMaxPages) && rawMaxPages >= 1 ? Math.floor(rawMaxPages) : 300;
    const rawMaxRetries = Number(c.get('cool18MaxRetries'));
    const maxRetries = Number.isFinite(rawMaxRetries) && rawMaxRetries >= 1 ? Math.floor(rawMaxRetries) : 4;
    return new Cool18Core({
      outputRoot: this.cool18OutputRoot(),
      proxy: resolveProxy(typeof c.inspect === 'function' ? c.inspect('cool18Proxy') : null, c.get('cool18Proxy'), OLD_COOL18(), DEFAULT_PROXY),
      delayMs,
      maxPages,
      maxRetries,
      cleanAds: c.get('scrapeCleanAds', true) !== false,
      log: (m) => this.log(m),
    });
  }

  // ---------- cool18 ----------

  async cool18(entries, { deep, reporter, token }) {
    if (!entries.length) {
      if (reporter) reporter.finish(null, '没有识别到 cool18 帖子链接或 ID');
      return { msg: '没有识别到 cool18 帖子链接或 ID（每行一个）' };
    }
    if (this.active) {
      if (reporter) reporter.finish(null, '已有抓取任务进行中，请等它完成或先取消');
      return { msg: '已有抓取任务进行中，请等它完成或先取消' };
    }
    const controller = new AbortController();
    const tokenLink = this.bindToken(token, controller);
    this.active = { label: 'cool18', controller };
    this.task(true, '正在连接 cool18…');
    let result = null;
    try {
      const core = this.buildCool18();
      this.log('开始: ' + entries.length + ' 个链接, 模式=' + (deep ? '自动爬全本' : '按列表顺序') +
        ', 代理=' + (core.proxy || '直连'));
      result = await core.scrape(entries, {
        deep,
        signal: controller.signal,
        onProgress: (text) => {
          reporter && reporter.report(text);
          this.task(true, text);
        },
      });
      this.recordHistory({
        kind: 'cool18',
        label: result.count + ' 帖 · ' + path.basename(result.outDir),
        outDir: result.outDir,
      });
    } catch (e) {
      this.log('cool18 抓取失败: ' + e.message);
      result = { error: e.message, aborted: /已取消/.test(e.message) };
    } finally {
      this.active = null;
      this.releaseToken(tokenLink);
    }
    let msg;
    if (result.error) {
      msg = result.aborted ? 'cool18 抓取已取消' : 'cool18 抓取失败：' + result.error;
    } else {
      msg = 'cool18 抓取完成：' + result.count + ' 帖';
      if (deep && result.count === 1) {
        msg += '（只抓到 1 帖——该帖内可能没有可自动跟随的章节链接。手动批量：把各章链接每行一个放进文件，用"抓取本文件全部链接"）';
      }
      if (result.missing && result.missing.length) {
        msg += '；缺章提示：' + result.missing.slice(0, 3).join('；') +
          (result.missing.length > 3 ? ' 等' : '');
      }
      if (result.failed && result.failed.length) {
        msg += '；有 ' + result.failed.length + ' 页多次重试仍失败（详见日志）';
      }
      if (result.aborted) msg += '（已中断，仅保存已抓部分）';
    }
    this.task(false, msg);
    if (reporter) reporter.finish(result.error ? null : result, msg);
    return { msg, result };
  }

  async searchCool18(keyword, { token } = {}) {
    // 与抓取共用单任务闸门：并发搜索会和进行中的抓取抢限速配额
    if (this.active) {
      this.lastSearchStatus = 'busy';
      this.lastSearchError = '';
      vscode.window.showInformationMessage('已有抓取任务进行中，请等它完成或先取消后再搜索');
      return [];
    }
    const controller = new AbortController();
    const tokenLink = this.bindToken(token, controller);
    this.active = { label: 'cool18-search', controller };
    this.lastSearchStatus = 'ok';
    this.lastSearchError = '';
    this.task(true, '正在搜索 cool18…');
    try {
      const result = await this.buildCool18().search(keyword, { signal: controller.signal });
      if (controller.signal.aborted) {
        this.lastSearchStatus = 'aborted';
        this.task(false, '搜索已取消');
        return [];
      }
      this.task(false, '搜索完成：' + result.length + ' 个结果');
      return result;
    } catch (e) {
      this.log('搜索失败: ' + e.message);
      if (controller.signal.aborted || /已取消/.test(e.message)) {
        this.lastSearchStatus = 'aborted';
        this.task(false, '搜索已取消');
      } else {
        this.lastSearchStatus = 'error';
        this.lastSearchError = e.message || String(e);
        this.task(false, '搜索失败：' + this.lastSearchError);
      }
      return [];
    } finally { this.active = null; this.releaseToken(tokenLink); }
  }

  // ---------- Pixiv ----------

  // reporter: { report(text), finish(_result, msg) }; token: CancellationToken（可选）
  // opts.force: 强制重抓 —— 成功下载后备份并替换目标文件，失败时保留旧内容
  // 返回 { saved, failures, aborted, authError } 或 null（msg 里给出未执行原因）
  async executePixiv(targets, reporter, token, { force = false } = {}) {
    if (!targets.length) {
      reporter && reporter.finish(null, '没有识别到 Pixiv 小说/系列/作者链接或 ID');
      return { msg: '没有识别到 Pixiv 小说/系列/作者链接或 ID' };
    }
    if (this.active) {
      reporter && reporter.finish(null, '已有抓取任务进行中，请等它完成或先取消');
      return { msg: '已有抓取任务进行中，请等它完成或先取消' };
    }
    const controller = new AbortController();
    const tokenLink = this.bindToken(token, controller);
    this.active = { label: 'pixiv', controller };
    this.task(true, '正在连接 Pixiv…');
    const saved = [];
    const failures = [];
    let authError = false;
    try {
      const cookie = await this.pixivCookie();
      const core = this.buildPixivCore(cookie);
      this.log('开始处理 ' + targets.length + ' 个目标: ' + targets.map((t) => t.type + ':' + t.id).join(', ') +
        (force ? '（强制重抓模式）' : ''));
      const ctx = {
        signal: controller.signal,
        onProgress: (d, t, l) => {
          const text = t ? d + '/' + t + ' ' + l : l;
          reporter && reporter.report(text);
          this.task(true, text);
        },
      };
      for (const t of targets) {
        if (controller.signal.aborted) break;
        try {
          if (force) {
            const existed = t.type === 'series'
              ? (core.clearSeries && core.clearSeries(t.id))
              : t.type === 'user'
                ? (core.clearUser && core.clearUser(t.id))
                : (core.clearNovel && core.clearNovel(t.id));
            const forceMsg = '强制重抓：已准备备份替换 ' + t.type + ':' + t.id + (existed ? ' 的文件' : ' 的目标文件');
            reporter && reporter.report(forceMsg);
            this.task(true, forceMsg);
          }
          const r = t.type === 'series'
            ? await core.downloadSeries(t.id, ctx)
            : t.type === 'user'
              ? await core.downloadUser(t.id, ctx)
              : await core.downloadNovel(t.id, ctx);
          saved.push(r);
          if (Array.isArray(r.failures)) failures.push(...r.failures.map(f => typeof f === 'string' ? f : t.type + ':' + t.id + ' / ' + f.id + ': ' + f.message));
          if (t.type === 'novel' && r.seriesNav && !core.writer.manifest.series[r.seriesNav.seriesId] && !controller.signal.aborted) {
            const pickAns = await vscode.window.showInformationMessage(
              '《' + r.title + '》属于系列《' + r.seriesNav.seriesTitle + '》（第 ' + r.seriesNav.order + ' 话），要顺手抓全系列吗？',
              '抓全系列', '不用'
            );
            if (pickAns === '抓全系列') {
              const seriesResult = await core.downloadSeries(r.seriesNav.seriesId, ctx);
              saved.push(seriesResult);
              if (Array.isArray(seriesResult.failures)) failures.push(...seriesResult.failures.map(f => typeof f === 'string' ? f : f.id + ': ' + f.message));
            }
          }
        } catch (e) {
          if (e instanceof PixivError && e.kind === 'auth') { authError = true; break; }
          if (controller.signal.aborted) break;
          failures.push(t.type + ':' + t.id + ' ' + e.message);
          this.log('失败 ' + t.type + ':' + t.id + ' (' + (e.kind || 'error') + '): ' + e.message);
        }
      }
      const totalSaved = this.savedCount(saved);
      this.log('处理结束：新增 ' + totalSaved + '，失败 ' + failures.length +
        (controller.signal.aborted ? '，已取消' : ''));
      if (totalSaved > 0) {
        this.recordHistory({
          kind: 'pixiv',
          label: '新增 ' + totalSaved + ' 篇/章',
          outDir: this.pixivOutputRoot(),
        });
      }
    } catch (e) {
      // 无 catch 会让 buildPixivCore 等的未预期异常直接逃出，reporter.finish 永不执行、面板永远"进行中"
      this.log('Pixiv 抓取异常: ' + ((e && e.message) || e));
      if (e instanceof PixivError && e.kind === 'auth') authError = true;
      else failures.push('任务异常: ' + ((e && e.message) || e));
    } finally {
      this.active = null;
      this.releaseToken(tokenLink);
    }
    const out = { saved, failures, aborted: controller.signal.aborted, authError };
    this.task(false, this.summarizePixiv(out));
    if (reporter) reporter.finish(out, this.summarizePixiv(out));
    return out;
  }

  savedCount(results) {
    return results.reduce((n, x) => n + (x ? x.type === 'novel' ? (x.skipped ? 0 : 1) : Number(x.saved) || 0 : 0), 0);
  }

  summarizePixiv(r) {
    const newCount = this.savedCount(r.saved);
    let msg = (r.authError ? 'Pixiv 需要更新 Cookie：' : r.failures.length ? 'Pixiv 抓取部分失败：' : 'Pixiv 抓取完成：') + '新增 ' + newCount + ' 篇/章';
    if (r.aborted) msg += '（已取消，进度已记录，可再次运行续传）';
    if (r.failures.length) {
      msg += '；失败 ' + r.failures.length + ' 项：' + r.failures.slice(0, 3).join('；') + (r.failures.length > 3 ? ' 等' : '');
    }
    return msg;
  }

  // 增量更新：返回 { updates, failures, authError } 或 { msg }
  async pixivUpdate(reporter, token) {
    if (this.active) {
      const msg = '已有抓取任务进行中，请等它完成或先取消';
      reporter && reporter.finish(null, msg);
      return { msg };
    }
    const controller = new AbortController();
    const tokenLink = this.bindToken(token, controller);
    this.active = { label: 'pixiv-update', controller };
    const updates = [];
    const failures = [];
    let authError = false;
    let emptyManifestMsg = null;
    try {
      const core = this.buildPixivCore(await this.pixivCookie());
      const ids = Object.keys(core.writer.manifest.series);
      if (!ids.length) {
        emptyManifestMsg = 'manifest 里还没有已抓系列记录，先抓一个系列吧';
      } else {
        this.task(true, '正在检查 Pixiv 系列更新…');
        const ctx = {
          signal: controller.signal,
          onProgress: (d, t, l) => {
            const text = t ? d + '/' + t + ' ' + l : l;
            reporter && reporter.report(text);
            this.task(true, text);
          },
        };
        try {
          const checked = await core.checkUpdates(ctx);
          updates.push(...(Array.isArray(checked) ? checked : checked.updates));
          failures.push(...(checked.failures || []));
        } catch (e) {
          if (e instanceof PixivError && e.kind === 'auth') authError = true;
          else failures.push(e.message);
        }
      }
    } catch (e) {
      // 同 executePixiv：保证任何未预期异常都会走到 reporter.finish
      if (e instanceof PixivError && e.kind === 'auth') authError = true;
      else failures.push('增量更新异常: ' + ((e && e.message) || e));
      this.log('增量更新异常: ' + ((e && e.message) || e));
    } finally {
      this.active = null;
      this.releaseToken(tokenLink);
    }
    if (emptyManifestMsg) {
      reporter && reporter.finish(null, emptyManifestMsg);
      return { msg: emptyManifestMsg };
    }
    if (failures.length) this.log('增量更新失败项: ' + failures.join('；'));
    const msg = controller.signal.aborted ? '更新检查已取消，已完成进度已保存'
      : authError ? '更新检查失败：Cookie 缺失或已失效'
      : failures.length ? '更新检查有 ' + failures.length + ' 项失败，详见日志' + (updates.length ? '；已处理 ' + updates.length + ' 个系列' : '')
      : updates.length ? '更新完成：' + updates.map(u => '《' + u.title + '》新增 ' + u.saved + ' 章').join('、')
      : '全部已抓系列均无更新';
    this.task(false, msg);
    reporter && reporter.finish({ updates }, msg);
    return { updates, failures, authError, msg };
  }

  // ---------- 面板快照 ----------

  snapshot() {
    let series = [];
    let novelCount = 0;
    try {
      const file = path.join(this.pixivOutputRoot(), 'pixiv-manifest.json');
      const stat = fs.existsSync(file) ? fs.statSync(file) : null;
      const key = file + ':' + (stat ? stat.mtimeMs + ':' + stat.ctimeMs + ':' + stat.size : 'missing');
      if (!this.snapshotCache || this.snapshotCache.key !== key) {
        const manifest = stat ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
        series = Object.entries(manifest.series || {}).map(([id, e]) => {
          const savedLen = Array.isArray(e.files) ? e.files.length : 0;
          const totalLen = e.count || savedLen;
          const count = (savedLen > 0 && totalLen > savedLen) ? (savedLen + '/' + totalLen) : totalLen;
          return { id, title: e.title || id, author: e.author || '', count };
        });
        novelCount = Object.keys(manifest.novels || {}).length;
        this.snapshotCache = { key, series, novelCount };
      } else ({ series, novelCount } = this.snapshotCache);
    } catch (e) { this.log('读取 manifest 失败: ' + e.message); }
    const c = CFG();
    return {
      busy: this.busy,
      taskText: this.taskText,
      cool18Out: this.cool18OutputRoot(),
      cool18Proxy: resolveProxy(typeof c.inspect === 'function' ? c.inspect('cool18Proxy') : null, c.get('cool18Proxy'), OLD_COOL18(), DEFAULT_PROXY) || '直连',
      pixivOut: this.pixivOutputRoot(),
      pixivProxy: resolveProxy(typeof c.inspect === 'function' ? c.inspect('pixivProxy') : null, c.get('pixivProxy'), OLD_PIXIV(), DEFAULT_PROXY) || '直连',
      series,
      novelCount,
    };
  }

  openOutput(kind) {
    this.openOutputDir(kind === 'cool18' ? this.cool18OutputRoot() : this.pixivOutputRoot());
  }
  recordHistory(entry) {
    try {
      const list = this.context.globalState.get('novelToolkit.scrapeHistory', []);
      const next = [...list];
      next.unshift(Object.assign({ date: new Date().toISOString() }, entry));
      const stored = this.context.globalState.update('novelToolkit.scrapeHistory', next.slice(0, 50));
      if (stored && stored.catch) stored.catch(error => this.log('记录历史失败: ' + error.message));
    } catch (e) { /* 记录失败不影响抓取 */ }
  }

  getHistory() {
    return this.context.globalState.get('novelToolkit.scrapeHistory', []);
  }

  openOutputDir(dir) {
    if (!dir) {
      vscode.window.showWarningMessage('未配置输出目录');
      return;
    }
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      vscode.window.showErrorMessage('无法创建输出目录 ' + dir + '：' + e.message);
      return;
    }
    vscode.window.setStatusBarMessage('打开输出目录: ' + dir, 4000);
    this.log('打开输出目录: ' + dir);
    if (process.platform !== 'win32') {
      vscode.env.openExternal(vscode.Uri.file(dir)).then(
        () => this.log('打开方式: openExternal ✓'),
        (e0) => this.log('openExternal 失败: ' + (e0 && e0.message))
      );
      return;
    }
    // 不走 shell 字符串拼接（exec 'start'）：目录路径来自可配置项，含引号会破坏拼接甚至注入命令
    // 统一用 explorer.exe 参数数组方式，天然免疫路径中的特殊字符
    const child = spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' });
    if (child && typeof child.unref === 'function') child.unref();
    child.on('error', (e2) => {
      this.log('explorer.exe 失败: ' + e2.message + '，改用 openExternal');
      vscode.env.openExternal(vscode.Uri.file(dir)).then(
        () => this.log('打开方式: openExternal ✓'),
        (e3) => {
          this.log('openExternal 失败: ' + (e3 && e3.message));
          vscode.env.clipboard.writeText(dir);
          vscode.window.showErrorMessage(
            '无法自动打开输出目录。路径已复制到剪贴板，请在资源管理器地址栏粘贴打开：' + dir);
        }
      );
    });
  }

  showLog() {
    this.channel.show();
  }
}

module.exports = { ScrapeManager, parseCool18Entries, isCool18ish, parsePixivInput, PixivError };
