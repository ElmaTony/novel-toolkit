'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { createRequire } = require('module');
let passed = 0;
const eq = (actual, expected, label) => { assert.deepStrictEqual(actual, expected, label); passed++; };

function load(file, overrides) {
  const filename = path.join(__dirname, '..', file);
  const requireLocal = createRequire(filename);
  const module = { exports: {} };
  const script = vm.runInThisContext('(function(require,module,exports){\n' + fs.readFileSync(filename, 'utf8') + '\n})', { filename });
  script((id) => Object.prototype.hasOwnProperty.call(overrides, id) ? overrides[id] : requireLocal(id), module, module.exports);
  return module.exports;
}

async function main() {
  const executed = [];
  const messages = [];
  const lines = ['第一章 风起', '　　正文。', '第二章 雨停之前'];
  const editor = {
    selection: { active: { line: 2 } },
    document: { lineCount: lines.length, lineAt: (line) => ({ text: lines[line] }), fileName: 'demo.txt', isDirty: true },
  };
  const config = { get: (_key, fallback) => fallback };
  const vscode = {
    window: {
      activeTextEditor: editor,
      createStatusBarItem: () => ({ show() {}, hide() {} }),
      createOutputChannel: () => ({ appendLine() {}, show() {} }),
    },
    workspace: { getConfiguration: () => config },
    commands: { executeCommand: (...args) => executed.push(args) },
    StatusBarAlignment: { Right: 1 },
  };
  const context = { subscriptions: [], globalState: { get: (_key, fallback) => fallback, update() {} } };
  const { parseEntries: parseCool18Entries } = require('../src/engine/cool18/parse');
  const { parseInput: parsePixivInput } = require('../src/engine/pixiv/parseInput');
  const { PanelManager } = load('src/ui/panel.js', {
    vscode,
    '../service/scrape': { parseCool18Entries, parsePixivInput },
  });
  const checker = { appliesTo: () => true, counts: () => ({ ws: 1, mid: 2, short: 0, quote: 0, silenced: false }) };
  const panel = new PanelManager(context, checker, {});
  panel.panel = { webview: { postMessage: (message) => messages.push(message) } };
  panel.update();
  const update = messages.find((message) => message.type === 'update');
  eq(update.midCount, 2, '宿主推送正文空格计数');
  eq(update.wsCount, 1, '宿主保留行首空白计数');
  eq(update.dirty, true, '宿主推送真实保存状态');
  eq(update.hasDocument, true, '宿主推送文稿可用状态');
  eq(messages.find((message) => message.type === 'cursor').line, 2, '首次更新即定位当前章节');
  await panel.handle({ command: 'openSettings' });
  eq(executed.pop(), ['workbench.action.openSettings', '@ext:localtools.novel-toolkit'], '设置按钮打开本插件设置');
  await panel.handle({ command: 'run', name: 'convertToUtf8' });
  eq(executed.length, 0, '已删除的转码命令不能由面板执行');
  let resolveCookie;
  const asynchronousScrape = { busy: false, taskText: '', snapshot: () => ({ busy: false, taskText: '' }), pixivCookie: () => new Promise((resolve) => { resolveCookie = resolve; }) };
  panel.scrape = asynchronousScrape;
  panel.postScrapeState();
  asynchronousScrape.busy = true;
  asynchronousScrape.taskText = '4/8 正在保存';
  resolveCookie('');
  await Promise.resolve();
  eq(messages[messages.length - 1].state.busy, true, '异步 Cookie 读取不会把新任务覆盖为空闲');
  eq(messages[messages.length - 1].state.taskText, '4/8 正在保存', '异步快照使用最新任务文本');
  editor.document.isClosed = true;
  panel.lastEditor = editor;
  panel.update();
  eq(messages[messages.length - 1].hasDocument, false, '关闭的文稿不再作为操作目标');

  // 运行中再点抓取不破坏 running=true 与取消按钮；空闲校验失败后刷新不抹掉提示
  const busyScrape = { busy: true, taskText: '3/9 正在抓取', snapshot: () => ({ busy: true, taskText: '3/9 正在抓取' }), pixivCookie: async () => '' };
  panel.scrape = busyScrape;
  messages.length = 0;
  await panel.handle({ command: 'cool18Grab', text: '123456' });
  eq(messages[messages.length - 1], { type: 'task', running: true, text: '3/9 正在抓取' }, '任务运行中重复触发不隐藏取消状态');
  const idleScrape = { busy: false, taskText: '', snapshot: () => ({ busy: false, taskText: idleScrape.taskText }), pixivCookie: async () => '' };
  panel.scrape = idleScrape;
  await panel.handle({ command: 'cool18Grab', text: '' });
  eq(idleScrape.taskText.includes('没有识别到 cool18'), true, '空闲校验失败同步写入 taskText，避免 refresh 擦除');

  // 大文件后台章节分析失败后不缓存 rejected Promise
  let chapterAttempt = 0;
  panel.analysis = {
    run: () => ++chapterAttempt === 1 ? Promise.reject(new Error('临时故障')) : Promise.resolve([{ line: 0, title: '第一章', kind: 'chapter' }]),
    dispose() {},
  };
  const bigDoc = { version: 1, lineCount: 9000, lineAt: () => ({ text: '正文' }), isClosed: false };
  await assert.rejects(panel.chapterEntries(bigDoc), /临时故障/); passed++;
  eq((await panel.chapterEntries(bigDoc)).length, 1, '章节后台分析失败后清理缓存并可重试成功');

  const { ScrapeManager } = load('src/service/scrape.js', { vscode });
  const manager = new ScrapeManager(context);
  const tasks = [];
  manager.onTask = (running, text) => tasks.push({ running, text });
  manager.cool18OutputRoot = () => 'unused';
  manager.pixivOutputRoot = () => 'unused';
  manager.pixivCookie = async () => '';
  manager.buildCool18 = () => ({ proxy: '', async scrape(_entries, options) {
    options.onProgress('[1/1] 完成');
    return { count: 1, outDir: 'unused', missing: [], failed: [] };
  } });
  const cool = await manager.cool18(['tid=1'], { deep: false });
  eq(tasks[0].running, true, '命令启动 cool18 立即同步运行状态');
  eq(tasks[tasks.length - 1], { running: false, text: cool.msg }, 'cool18 结束后同步结果并关闭取消状态');
  eq(manager.busy, false, 'cool18 任务结束后释放闸门');
  tasks.length = 0;
  const manifest = { novels: {}, series: { 1: { title: '示例系列', count: 1 } } };
  manager.buildPixivCore = () => ({ writer: { manifest }, async downloadNovel(_id, ctx) {
    ctx.onProgress(1, 2, '正在下载');
    return { type: 'novel', title: '示例单篇', skipped: false };
  }, async checkUpdates() { return []; } });
  const reporter = { report() {}, finish() {} };
  const pixiv = await manager.executePixiv([{ type: 'novel', id: '1' }], reporter);
  eq(tasks[0].running, true, '命令启动 Pixiv 立即同步运行状态');
  eq(tasks[tasks.length - 1].running, false, 'Pixiv 完成后同步停止状态');
  eq(tasks[tasks.length - 1].text, manager.summarizePixiv(pixiv), 'Pixiv 结果保持可见');
  eq(manager.snapshot().taskText, tasks[tasks.length - 1].text, '快照保留任务结果，不覆盖成空闲');
  manager.active = { label: 'test' };
  manager.task(true, '4/8 正在保存');
  eq(manager.snapshot().taskText, '4/8 正在保存', '编辑器更新时快照保留真实任务进度');
  manager.active = null;
  tasks.length = 0;
  await manager.pixivUpdate(reporter);
  eq(tasks[0].running, true, '系列更新同步开始状态');
  eq(tasks[tasks.length - 1].running, false, '系列更新同步结束状态');

  const pkg = require('../package.json');
  const removed = ['setupEncoding', 'detectEncoding', 'convertToUtf8', 'batchConvert'];
  eq(pkg.contributes.commands.filter((entry) => removed.includes(entry.command.split('.').pop())).length, 0, '命令面板不再声明编码工具');
  eq(fs.existsSync(path.join(__dirname, '..', 'src/commands/encoding.js')), false, '编码命令模块已删除');
  const extension = fs.readFileSync(path.join(__dirname, '..', 'extension.js'), 'utf8');
  eq(/encodingSetupDone|autoGuessEncoding|applyEncodingSettings/.test(extension), false, '激活时不再触发编码引导或修改编码设置');
  console.log('===== 面板宿主测试：通过 ' + passed + '，失败 0 =====');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
