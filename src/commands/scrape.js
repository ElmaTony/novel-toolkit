'use strict';

// 抓取命令：cool18 / Pixiv 的输入、执行、日志、历史与取消
const vscode = require('vscode');
const { BBS4 } = require('../engine/cool18/parse');
const { parseCool18Entries, isCool18ish, parsePixivInput } = require('../service/scrape');

async function collectScrapeInput(isCool18) {
  const ed = vscode.window.activeTextEditor;
  let input = ed && !ed.selection.isEmpty ? ed.document.getText(ed.selection).trim() : '';
  if (!input) {
    try { input = ((await vscode.env.clipboard.readText()) || '').trim(); } catch (e) { input = ''; }
  }
  const okish = isCool18 ? isCool18ish(input) : /pixiv\.net|\d{5,}/.test(input);
  if (!okish) input = '';
  return input;
}

async function runCool18(scrape, entries, deep, title) {
  if (!entries.length) {
    vscode.window.showInformationMessage('没有识别到 cool18 帖子链接或 ID（每行一个）');
    return;
  }
  let msg = null;
  let result = null;
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: title || 'cool18 抓取', cancellable: true },
    async (progress, token) => {
      const r = await scrape.cool18(entries, {
        deep,
        token,
        reporter: {
          report: (t) => progress.report({ message: t.slice(0, 90) }),
          finish: (res, m) => { result = res; msg = m; },
        },
      });
      msg = r.msg;
      result = r.result;
    }
  );
  const items = [];
  if (result && !result.error) items.push('打开输出目录');
  items.push('查看日志');
  const pick = await vscode.window.showInformationMessage(msg, ...items);
  if (pick === '打开输出目录') scrape.openOutput('cool18');
  if (pick === '查看日志') scrape.showLog();
}

async function offerSetCookie() {
  const pick = await vscode.window.showWarningMessage(
    'Cookie 缺失或已失效：作者全量模式需要登录 Cookie（账号还需开启“浏览R-18作品”显示设置）。',
    '设置 Cookie', '取消'
  );
  if (pick === '设置 Cookie') vscode.commands.executeCommand('novelToolkit.pixivSetCookie');
}

async function runPixiv(scrape, targets, title) {
  if (!targets.length) {
    vscode.window.showInformationMessage('没有识别到 Pixiv 小说/系列/作者链接或 ID');
    return;
  }
  let msg = null;
  let result = null;
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: title || 'Pixiv 抓取', cancellable: true },
    async (progress, token) => {
      const r = await scrape.executePixiv(targets, {
        report: (t) => progress.report({ message: t }),
        finish: (res, m) => { result = res; msg = m; },
      }, token);
      if (r && typeof r.msg === 'string') {
        msg = r.msg;
      } else if (r) {
        result = r;
        msg = scrape.summarizePixiv(r);
      }
    }
  );
  if (!msg) return;
  if (result && result.authError) return offerSetCookie();
  const pick = await vscode.window.showInformationMessage(msg, '打开输出目录', '查看日志');
  if (pick === '打开输出目录') scrape.openOutput('pixiv');
  if (pick === '查看日志') scrape.showLog();
}

function registerScrapeCommands({ reg, panel, scrape }) {
  reg('cool18Grab', async () => {
    let input = await collectScrapeInput(true);
    input = await vscode.window.showInputBox({
      prompt: '输入 cool18 帖子链接或帖子 ID。单个链接=自动跟随章节链接爬全本；多个（每行一个）=按顺序抓取',
      value: input,
      ignoreFocusOut: true,
    });
    if (!input) return;
    const entries = parseCool18Entries(input, (m) => scrape.log(m));
    await runCool18(scrape, entries, entries.length === 1, 'cool18 抓取');
  });

  reg('cool18GrabFile', async () => {
    const ed = panel.editor();
    if (!ed) {
      return vscode.window.showInformationMessage('先打开一个含 cool18 链接的文件再运行（每行一个链接或帖子ID）');
    }
    const text = !ed.selection.isEmpty ? ed.document.getText(ed.selection) : ed.document.getText();
    const entries = parseCool18Entries(text, (m) => scrape.log(m));
    await runCool18(scrape, entries, false, 'cool18 抓取（本文件批量·按行顺序）');
  });

  reg('cool18Search', async () => {
    const kw = await vscode.window.showInputBox({
      prompt: '输入书名或作者关键词，搜索 cool18 书屋（结果可多选；选 1 个自动爬全本）',
      ignoreFocusOut: true,
    });
    if (!kw || !kw.trim()) return;
    let results = null;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: '搜索 cool18：' + kw.trim(), cancellable: true },
      async (progress, token) => {
        results = await scrape.searchCool18(kw.trim(), { token });
      }
    );
    if (!results || !results.length) {
      return vscode.window.showInformationMessage('没有搜到含「' + kw.trim() + '」的帖子');
    }
    const items = results.map((r) => ({
      label: '【tid ' + r.tid + '】' + r.title.slice(0, 60),
      description: '第 ' + r.tid + ' 号帖',
      tid: r.tid,
    }));
    const picks = await vscode.window.showQuickPick(items, {
      placeHolder: '搜到 ' + items.length + ' 个帖子，可多选后抓取',
      canSelectMany: true,
    });
    if (!picks || !picks.length) return;
    const entries = picks.map((p) => BBS4 + p.tid);
    await runCool18(scrape, entries, picks.length === 1, 'cool18 抓取（搜索结果）');
  });

  reg('cool18OpenOutput', () => scrape.openOutput('cool18'));

  reg('pixivGrab', async () => {
    let input = await collectScrapeInput(false);
    input = await vscode.window.showInputBox({
      prompt: '输入 Pixiv 小说/系列/作者页链接或作品 ID（可多行多个，兼容 novel/show.php 旧链接）',
      value: input,
      ignoreFocusOut: true,
    });
    if (!input) return;
    await runPixiv(scrape, parsePixivInput(input), 'Pixiv 抓取');
  });

  reg('pixivGrabFile', async () => {
    const ed = panel.editor();
    if (!ed) {
      return vscode.window.showInformationMessage('先打开一个含 Pixiv 链接的 txt 文件再运行');
    }
    const text = !ed.selection.isEmpty ? ed.document.getText(ed.selection) : ed.document.getText();
    await runPixiv(scrape, parsePixivInput(text), 'Pixiv 抓取（本文件批量）');
  });

  reg('pixivGrabUser', async () => {
    const input = await vscode.window.showInputBox({
      prompt: '输入作者主页链接（pixiv.net/users/数字）或作者 ID',
      ignoreFocusOut: true,
    });
    if (!input) return;
    const trimmed = input.trim();
    const targets = /^\d+$/.test(trimmed)
      ? [{ type: 'user', id: trimmed }]
      : parsePixivInput(trimmed).filter((target) => target.type === 'user');
    if (!targets.length) {
      return vscode.window.showInformationMessage('没有识别到 Pixiv 作者主页链接或作者 ID');
    }
    await runPixiv(scrape, targets, 'Pixiv 抓取（作者全量）');
  });

  reg('pixivUpdate', async () => {
    let msg = null;
    let authError = false;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Pixiv 增量更新', cancellable: true },
      async (progress, token) => {
        const r = await scrape.pixivUpdate({
          report: (t) => progress.report({ message: t }),
          finish: (_r, m) => { msg = m; },
        }, token);
        if (r && r.authError) authError = true;
      }
    );
    if (authError) return offerSetCookie();
    if (!msg) return;
    const pick = await vscode.window.showInformationMessage(msg, '打开输出目录', '查看日志');
    if (pick === '打开输出目录') scrape.openOutput('pixiv');
    if (pick === '查看日志') scrape.showLog();
  });

  reg('pixivSetCookie', async () => {
    const v = await vscode.window.showInputBox({
      prompt: '粘贴 PHPSESSID 的值或整段 Cookie（浏览器 F12 → Application → Cookies → pixiv.net → PHPSESSID 的值）',
      password: true,
      ignoreFocusOut: true,
    });
    if (v === undefined) return;
    if (!v.trim()) {
      vscode.window.showWarningMessage('未输入内容，Cookie 未更改');
      return;
    }
    const trimmed = v.trim();
    if (/^uids=/.test(trimmed) || /^eyJ/.test(trimmed)) {
      return vscode.window.showErrorMessage(
        '你粘贴的是广告追踪 Cookie（uids=...），不是 PHPSESSID。'
        + '请重新操作：F12 → Application → Cookies → pixiv.net → 找到名字为 PHPSESSID 的行 → 复制其 Value 值');
    }
    if (!/PHPSESSID=/.test(trimmed) && !/^[0-9A-Za-z_]{20,}$/.test(trimmed)) {
      return vscode.window.showErrorMessage(
        '粘贴的内容不像 PHPSESSID（应为字母数字下划线组合，长度约 20-40 字符）。请确认你复制的是 PHPSESSID 的值');
    }
    await scrape.setCookie(trimmed);
    vscode.window.showInformationMessage('Cookie 已保存（VSCode 私密存储，不写入明文配置）。提示：与旧版独立插件的 Cookie 存储不互通，首次使用需重新粘贴一次');
    panel.postScrapeState();
  });

  reg('pixivOpenOutput', () => scrape.openOutput('pixiv'));
  reg('showScrapeLog', () => scrape.showLog());

  reg('showHistory', async () => {
    const list = scrape.getHistory();
    if (!list.length) {
      return vscode.window.showInformationMessage('还没有抓取记录（抓取成功后会自动记录，保留最近 50 条）');
    }
    const items = list.map((h) => ({
      label: h.date.slice(0, 16).replace('T', ' ') + '　' + h.label,
      description: h.kind,
      detail: h.outDir,
      outDir: h.outDir,
    }));
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: '最近 ' + items.length + ' 次抓取，选择条目打开其输出目录',
    });
    if (pick && pick.outDir) {
      scrape.openOutputDir(pick.outDir);
    }
  });

  reg('scrapeCancel', () => {
    if (!scrape.cancel()) {
      vscode.window.showInformationMessage('当前没有正在运行的抓取');
    }
  });
}

module.exports = { registerScrapeCommands };
