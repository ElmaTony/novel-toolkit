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

class ScrapeManager {
  constructor(context) {
    this.context = context;
    this.channel = vscode.window.createOutputChannel('小说工具箱·抓取');
    this.active = null; // { label, controller }
    this.onTask = null; // (running, text) => void —— 面板任务行
    this.lastCool18Out = '';
  }

  log(msg) {
    this.channel.appendLine('[' + new Date().toLocaleTimeString('zh-CN', { hour12: false }) + '] ' + msg);
  }

  task(running, text) {
    if (this.onTask) {
      this.onTask(running, text);
    }
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
      proxy: trim(pick(c.get('pixivProxy'), OLD_PIXIV().get('proxy', 'http://127.0.0.1:7897'))),
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
    return new Cool18Core({
      outputRoot: this.cool18OutputRoot(),
      proxy: trim(pick(c.get('cool18Proxy'), OLD_COOL18().get('proxy', 'http://127.0.0.1:7897'))),
      delayMs: (Number(pick(c.get('cool18Delay'), OLD_COOL18().get('delay', 1.0))) || 1.0) * 1000,
      maxPages: Number(pick(c.get('cool18MaxPages'), OLD_COOL18().get('maxPages', 300))) || 300,
      maxRetries: Number(c.get('cool18MaxRetries')) || 4,
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
    if (token) token.onCancellationRequested(() => controller.abort());
    this.active = { label: 'cool18', controller };
    let result = null;
    try {
      this.log('开始: ' + entries.length + ' 个链接, 模式=' + (deep ? '自动爬全本' : '按列表顺序') +
        ', 代理=' + (this.buildCool18().proxy || '直连'));
      result = await this.buildCool18().scrape(entries, {
        deep,
        signal: controller.signal,
        onProgress: (text) => {
          reporter && reporter.report(text);
          this.task(true, text);
        },
      });
      this.lastCool18Out = result.outDir;
        this.recordHistory({
          kind: 'cool18',
          label: result.count + ' 帖 · ' + require('path').basename(result.outDir),
          outDir: result.outDir,
        });
    } catch (e) {
      this.log('cool18 抓取失败: ' + e.message);
      result = { error: e.message, aborted: /已取消/.test(e.message) };
    } finally {
      this.active = null;
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
    if (reporter) reporter.finish(result.error ? null : result, msg);
    return { msg, result };
  }

  async searchCool18(keyword, { token } = {}) {
    // 与抓取共用单任务闸门：并发搜索会和进行中的抓取抢限速配额
    if (this.active) {
      vscode.window.showInformationMessage('已有抓取任务进行中，请等它完成或先取消后再搜索');
      return [];
    }
    const controller = new AbortController();
    if (token) token.onCancellationRequested(() => controller.abort());
    const core = this.buildCool18();
    return core.search(keyword, { signal: controller.signal });
  }

  // ---------- Pixiv ----------

  // reporter: { report(text), finish(_result, msg) }; token: CancellationToken（可选）
  // opts.force: 强制重抓 —— 先清除目标的旧文件与 manifest 记录，再从零下载
  // 返回 { saved, failures, aborted, authError } 或 null（msg 里给出未执行原因）
  async executePixiv(targets, reporter, token, { force = false } = {}) {
    if (!targets.length) {
      reporter.finish(null, '没有识别到 Pixiv 小说/系列/作者链接或 ID');
      return { msg: '没有识别到 Pixiv 小说/系列/作者链接或 ID' };
    }
    if (this.active) {
      reporter.finish(null, '已有抓取任务进行中，请等它完成或先取消');
      return { msg: '已有抓取任务进行中，请等它完成或先取消' };
    }
    const controller = new AbortController();
    if (token) token.onCancellationRequested(() => controller.abort());
    this.active = { label: 'pixiv', controller };
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
          reporter.report(text);
          this.task(true, text);
        },
      };
      for (const t of targets) {
        if (controller.signal.aborted) break;
        try {
          if (force && (t.type === 'series' || t.type === 'novel')) {
            const cleared = t.type === 'series' ? core.clearSeries(t.id) : core.clearNovel(t.id);
            if (cleared) reporter.report('强制重抓：已清除 ' + t.type + ':' + t.id + ' 的旧记录与文件');
          }
          const r = t.type === 'series'
            ? await core.downloadSeries(t.id, ctx)
            : t.type === 'user'
              ? await core.downloadUser(t.id, ctx)
              : await core.downloadNovel(t.id, ctx);
          saved.push(r);
          if (t.type === 'novel' && r.seriesNav && !core.writer.manifest.series[r.seriesNav.seriesId] && !controller.signal.aborted) {
            const pickAns = await vscode.window.showInformationMessage(
              '《' + r.title + '》属于系列《' + r.seriesNav.seriesTitle + '》（第 ' + r.seriesNav.order + ' 话），要顺手抓全系列吗？',
              '抓全系列', '不用'
            );
            if (pickAns === '抓全系列') saved.push(await core.downloadSeries(r.seriesNav.seriesId, ctx));
          }
        } catch (e) {
          if (e instanceof PixivError && e.kind === 'auth') { authError = true; break; }
          failures.push(t.type + ':' + t.id + ' ' + e.message);
          this.log('失败 ' + t.type + ':' + t.id + ' (' + (e.kind || 'error') + '): ' + e.message);
        }
      }
      this.log('处理结束：新增 ' + saved.filter((r) => r && !r.skipped).length + '，失败 ' + failures.length +
        (controller.signal.aborted ? '，已取消' : ''));
      if (saved.some((r) => r && !r.skipped)) {
        this.recordHistory({
          kind: 'pixiv',
          label: '新增 ' + saved.filter((r) => r && !r.skipped).length + ' 项',
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
    }
    const out = { saved, failures, aborted: controller.signal.aborted, authError };
    if (reporter) reporter.finish(out, this.summarizePixiv(out));
    return out;
  }

  summarizePixiv(r) {
    const newCount = r.saved.filter((x) => x && !x.skipped).length;
    let msg = 'Pixiv 抓取完成：新增 ' + newCount + ' 项';
    if (r.aborted) msg += '（已取消，进度已记录，可再次运行续传）';
    if (r.failures.length) {
      msg += '；失败 ' + r.failures.length + ' 项：' + r.failures.slice(0, 3).join('；') + (r.failures.length > 3 ? ' 等' : '');
    }
    return msg;
  }

  // 增量更新：返回 { updates, failures, authError } 或 { msg }
  async pixivUpdate(reporter, token) {
    const ids = Object.keys(this.buildPixivCore('').writer.manifest.series);
    if (!ids.length) {
      const msg = 'manifest 里还没有已抓系列记录，先抓一个系列吧';
      reporter && reporter.finish(null, msg);
      return { msg };
    }
    if (this.active) {
      const msg = '已有抓取任务进行中，请等它完成或先取消';
      reporter && reporter.finish(null, msg);
      return { msg };
    }
    const controller = new AbortController();
    if (token) token.onCancellationRequested(() => controller.abort());
    this.active = { label: 'pixiv-update', controller };
    const updates = [];
    const failures = [];
    let authError = false;
    try {
      const core = this.buildPixivCore(await this.pixivCookie());
      const ctx = {
        signal: controller.signal,
        onProgress: (d, t, l) => {
          const text = t ? d + '/' + t + ' ' + l : l;
          reporter && reporter.report(text);
          this.task(true, text);
        },
      };
      try {
        (await core.checkUpdates(ctx)).forEach((u) => updates.push(u));
      } catch (e) {
        if (e instanceof PixivError && e.kind === 'auth') authError = true;
        else failures.push(e.message);
      }
    } catch (e) {
      // 同 executePixiv：保证任何未预期异常都会走到 reporter.finish
      if (e instanceof PixivError && e.kind === 'auth') authError = true;
      else failures.push('增量更新异常: ' + ((e && e.message) || e));
      this.log('增量更新异常: ' + ((e && e.message) || e));
    } finally {
      this.active = null;
    }
    if (failures.length) this.log('增量更新失败项: ' + failures.join('；'));
    const msg = updates.length
      ? '更新完成：' + updates.map((u) => '《' + u.title + '》+' + (u.newCount - u.oldCount) + '章').join('、')
      : '全部已抓系列均无更新';
    reporter && reporter.finish({ updates }, msg);
    return { updates, failures, authError, msg };
  }

  // ---------- 面板快照 ----------

  snapshot() {
    const cookieNow = null;
    let series = [];
    let novelCount = 0;
    try {
      const core = this.buildPixivCore('');
      series = Object.entries(core.writer.manifest.series).map(([id, e]) => ({
        id,
        title: e.title || id,
        author: e.author || '',
        count: e.count || (e.files || []).length,
      }));
      novelCount = Object.keys(core.writer.manifest.novels).length;
    } catch (e) {
      this.log('读取 manifest 失败: ' + e.message);
    }
    return {
      busy: this.busy,
      taskText: this.busy ? '任务进行中…' : '',
      cool18Out: this.cool18OutputRoot(),
      cool18Proxy: trim(pick(CFG().get('cool18Proxy'), OLD_COOL18().get('proxy', 'http://127.0.0.1:7897'))) || '直连',
      pixivOut: this.pixivOutputRoot(),
      pixivProxy: trim(pick(CFG().get('pixivProxy'), OLD_PIXIV().get('proxy', ''))) || '直连',
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
      list.unshift(Object.assign({ date: new Date().toISOString() }, entry));
      this.context.globalState.update('novelToolkit.scrapeHistory', list.slice(0, 50));
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
