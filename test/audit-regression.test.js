'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { createRequire } = require('module');
const { EventEmitter, getEventListeners } = require('events');
const { makeTemp } = require('./temp');
const { PixivCore } = require('../src/engine/pixiv');
const { Writer } = require('../src/engine/pixiv/writer');
const { Cool18Core } = require('../src/engine/cool18/core');
const { decodeToUtf8 } = require('../src/engine/encoding');
const { BatchProcessor } = require('../src/service/batch');
const transforms = require('../src/engine/transforms');
const chapters = require('../src/engine/chapters');
const { t2s } = require('../src/engine/zh-convert');
const { PHRASES } = require('../src/engine/zh-convert-data');
const { sleep } = require('../src/engine/async');
const { AnalysisWorker, isLargeDocument } = require('../src/engine/analysis-worker');
let pass = 0;
const eq = (actual, expected, label) => { assert.deepStrictEqual(actual, expected, label); pass++; };
function load(file, overrides = {}) {
  const filename = path.resolve(__dirname, '..', file);
  const local = createRequire(filename), module = { exports: {} };
  vm.runInThisContext('(function(require,module,exports,__filename,__dirname){' + fs.readFileSync(filename, 'utf8') + '\n})', { filename })((id) => Object.prototype.hasOwnProperty.call(overrides, id) ? overrides[id] : local(id), module, module.exports, filename, path.dirname(filename));
  return module.exports;
}
const pageUrl = id => 'https://www.cool18.com/bbs4/index.php?app=forum&act=threadview&tid=' + id;
const page = (title, text, links = []) => '<h1 class="main-title">' + title + '</h1><pre>　　' + text + links.map(id => '<a href="' + pageUrl(id) + '">章节链接</a>').join('') + '</pre>';
async function main() {
  const root = makeTemp('novel-audit-');
  const folder = name => { const dir = path.join(root, name); fs.mkdirSync(dir); return dir; };
  const core = new PixivCore({ outputRoot: folder('pixiv'), saveUrlNote: false });
  core.api.novel = async id => ({ id, title: '同名', userId: '99', userName: '作者', content: '正文 ' + id, tags: [] });
  const first = await core.downloadNovel('1'), second = await core.downloadNovel('2');
  eq(first.file === second.file, false, '同名作品按 ID 隔离');
  eq(second.skipped, false, '同名第二篇正常保存');
  eq(path.isAbsolute(core.writer.manifest.novels['1'].file), false, '新记录使用相对路径');
  core.clearNovel('2');
  eq(fs.existsSync(first.file), true, '标记强制重抓不会删除其他作品');
  eq(fs.existsSync(second.file), true, '先保留目标旧文件');
  const old = fs.readFileSync(second.file, 'utf8');
  core.api.novel = async () => { throw new Error('断网'); };
  await assert.rejects(core.downloadNovel('2'), /断网/); pass++;
  eq(fs.readFileSync(second.file, 'utf8'), old, '下载失败保留旧文件');
  core.api.novel = async id => ({ id, title: '同名', userId: '99', userName: '作者', content: '新正文', tags: [] });
  await core.downloadNovel('2');
  eq(fs.readdirSync(path.dirname(second.file)).some(f => f.endsWith('.bak')), true, '替换前生成备份');
  eq(fs.readFileSync(first.file, 'utf8').includes('正文 1'), true, '重抓后其他作品仍完整');
  const outside = path.join(folder('outside'), 'original.txt'); fs.writeFileSync(outside, '原文');
  core.writer.manifest.novels['9'] = { file: outside };
  assert.throws(() => core.clearNovel('9'), /超出输出目录/); pass++;
  eq(fs.readFileSync(outside, 'utf8'), '原文', '越界原文不变');
  assert.throws(() => core.writer.saveText(outside, '破坏'), /超出输出目录/); pass++;
  const sCore = new PixivCore({ outputRoot: folder('series'), saveUrlNote: false });
  sCore.api.seriesAll = async id => ({ meta: { id, title: '合集', userName: '作者', userId: '99', publishedContentCount: 1 }, chapters: [{ id: id + '1', order: 1 }] });
  sCore.api.novel = async id => ({ id, title: '番外', userName: '作者', userId: '99', content: '远程正文内容。', tags: [] });
  await sCore.downloadSeries('20'); await sCore.downloadSeries('21');
  const rec = sCore.writer.manifest.series['20'].files[0];
  const short = sCore.writer.safePath(rec.file); fs.writeFileSync(short, '番外\r\n\r\n自写。\r\n');
  eq((await sCore.downloadSeries('20')).skipped, 1, '合法短正文保留');
  eq(fs.readFileSync(short, 'utf8').includes('自写。'), true, '短正文未覆盖');
  eq(sCore.writer.manifest.series['20'].dir === sCore.writer.manifest.series['21'].dir, false, '同名系列目录隔离');
  const missingFile = sCore.writer.safePath(sCore.writer.manifest.series['21'].files[0].file);
  fs.unlinkSync(missingFile);
  eq((await sCore.downloadSeries('21')).saved, 1, '缺失章节补抓成功');
  eq(sCore.writer.manifest.series['21'].files.length, 1, '补抓章节回填内存记录');
  eq(new Writer({ outputRoot: sCore.writer.outputRoot }).manifest.series['21'].files.length, 1, '补抓记录实际持久化');
  const legacyRoot = folder('legacy');
  const legacyFile = path.join(legacyRoot, '旧作者', '旧合集', '001 第一章.txt');
  fs.mkdirSync(path.dirname(legacyFile), { recursive: true });
  fs.writeFileSync(legacyFile, '第一章\r\n\r\n原有短文。\r\n');
  fs.writeFileSync(path.join(legacyRoot, 'pixiv-manifest.json'), JSON.stringify({ novels: {}, series: { 30: { title: '旧合集', author: '旧作者', userId: '99', files: [{ id: '301', title: '第一章', order: 1 }] } } }));
  const legacy = new PixivCore({ outputRoot: legacyRoot, saveUrlNote: false });
  legacy.api.seriesAll = async () => ({ meta: { id: '30', title: '新合集名', userName: '作者新名', userId: '99', publishedContentCount: 1 }, chapters: [{ id: '301', order: 1 }] });
  legacy.api.novel = async () => { throw new Error('不应重新抓取已存在正文'); };
  eq((await legacy.downloadSeries('30')).skipped, 1, '改名后旧记录仍按原路径读取');
  eq(fs.readFileSync(legacyFile, 'utf8').includes('原有短文'), true, '旧版章节原文保留');
  const reloaded = new PixivCore({ outputRoot: legacyRoot });
  eq(reloaded.writer.safePath(reloaded.writer.manifest.series['30'].files[0].file), legacyFile, '旧路径迁移为安全相对记录');
  const checkpointRoot = folder('checkpoint');
  const checkpoint = new Writer({ outputRoot: checkpointRoot });
  for (let n = 0; n < 3; n++) checkpoint.saveManifest({ checkpoint: true });
  eq(fs.existsSync(checkpoint.manifestPath), false, '未达批次不重复写完整 manifest');
  checkpoint.saveManifest();
  eq(fs.existsSync(checkpoint.manifestPath), true, '任务结束强制保存检查点');
  const failureCore = new PixivCore({ outputRoot: folder('updates') });
  failureCore.writer.manifest.series['1'] = { title: '测试', count: 1, files: [] };
  failureCore.api.seriesMeta = async () => { throw new Error('断网'); };
  eq((await failureCore.checkUpdates()).failures.length, 1, '更新错误返回上层');
  for (const text of ['Résumé été à São Paulo', 'Привет мир', 'ASCII plain', '小说内容']) {
    eq(decodeToUtf8(Buffer.from(text)).text, text, '合法 UTF-8 保留：' + text);
  }
  for (const text of ['English UTF16\n'.repeat(10), '小说内容'.repeat(40)]) {
    eq(decodeToUtf8(Buffer.from(text, 'utf16le')).text, text, '无 BOM UTF-16 解码');
  }
  const foreign = path.join(folder('batch'), 'foreign.txt'); fs.writeFileSync(foreign, 'Résumé été à São Paulo');
  new BatchProcessor().processOne(foreign);
  eq(fs.readFileSync(foreign, 'utf8').includes('Résumé été à São Paulo'), true, '批量整理不会写成乱码');
  const broken = path.join(path.dirname(foreign), 'broken.txt'); fs.writeFileSync(broken, Buffer.from([0x81]));
  const reviewed = new BatchProcessor().processOne(broken);
  eq(reviewed.needsReview, true, '异常解码要求复核');
  eq(fs.readFileSync(broken), Buffer.from([0x81]), '异常解码不改写原文件');
  const merged = transforms.mergeLines(['第一章 开始', '　　正文。', '第二章 继续', '　　后文。']);
  eq(chapters.chapterLines(merged.lines).length, 2, '合并保留章节边界');
  eq(transforms.mergeLines(['　　上一段', '　　续行'], { indentStartsParagraph: false, smartParagraphs: false }).lines.length, 1, '关闭缩进分段生效');
  const commands = {}, writes = [];
  load('src/commands/organize.js', { vscode: { window: { showInformationMessage() {} } }, '../core/editor': { docLines: () => ['　　甲。　　乙。'], applyLines: async (_editor, lines) => writes.push(lines) } }).registerOrganizeCommands({ reg: (n, f) => { commands[n] = f; }, panel: { editor: () => ({ document: {} }) }, checker: {}, cfg: () => ({ get: (_key, d) => d }) });
  await commands.merge(); eq(writes[0], ['　　甲。', '　　乙。'], '仅拆段也写回文档');
  for (const [input] of PHRASES) eq(t2s(t2s(input)), t2s(input), '词组重复转换稳定：' + input);
  eq(chapters.chapterNumber('第一零一章'), 101, '逐位中文编号');
  eq(chapters.chapterGaps(['Chapter 1 A', 'Chapter 3 B']).totalMissing, 1, '英文缺章检查');
  eq(chapters.chapterGaps(['第一章 A', '第6000章 B']).totalMissing, 5998, '大跨度缺章不会误报连续');
  eq(chapters.chapterGaps(['第一章 A', '第999999999章 B']).groups[0].missing.length, 1, '大跨度用范围表达避免长循环');
  const cancel = new AbortController(); let fetched = 0;
  const cancelledCore = new Cool18Core({ outputRoot: folder('cancel'), delayMs: 0, fetchPage: async () => { if (++fetched === 2) { cancel.abort(); throw new Error('已取消'); } return page('第一章', '已抓正文', [2]); } });
  const cancelled = await cancelledCore.scrape([pageUrl(1)], { deep: true, signal: cancel.signal });
  eq(cancelled.aborted, true, '网络中取消返回中断状态');
  eq(cancelled.count, 1, '网络中取消保留已抓帖子');
  eq(fs.existsSync(path.join(cancelled.outDir, cancelled.files[0])), true, '取消后实际落盘');
  const pages = { 1: page('第一章', '短文', [2]), 2: page('第一章', '更完整正文', [3]), 3: page('第二章', '后续正文') };
  const duplicate = new Cool18Core({ outputRoot: folder('duplicate'), delayMs: 0, fetchPage: async u => pages[u.match(/tid=(\d+)/)[1]] });
  eq((await duplicate.scrape([pageUrl(1)], { deep: true })).count, 2, '重复帖后续链接继续遍历');
  const volumes = { 1: page('目录', '索引', [2,3]), 2: page('第一卷 第一章', '一卷一章', [4]), 3: page('第二卷 第一章', '二卷一章', [5]), 4: page('第二章', '一卷二章'), 5: page('第二章', '二卷二章') };
  const volumeCore = new Cool18Core({ outputRoot: folder('volumes'), delayMs: 0, fetchPage: async u => volumes[u.match(/tid=(\d+)/)[1]] });
  eq((await volumeCore.scrape([pageUrl(1)], { deep: true })).count, 5, '分支卷号独立继承');
  let requests = 0;
  const bounded = new Cool18Core({ outputRoot: folder('bounded'), maxPages: 2, delayMs: 0, fetchPage: async u => { requests++; return pages[u.match(/tid=(\d+)/)[1]]; } });
  await bounded.scrape([pageUrl(1)], { deep: true }); eq(requests, 2, '访问上限包含重复帖');
  let httpCalls = 0;
  const fakeHttps = { request: (_options, callback) => {
    httpCalls++; const req = new EventEmitter(); req.destroy = error => req.emit('error', error);
    req.end = () => queueMicrotask(() => { const res = new EventEmitter(); res.statusCode = 503; res.resume = () => {}; callback(res); });
    return req;
  } };
  const fetcher = load('src/engine/cool18/fetcher.js', { https: fakeHttps, '../async': { sleep: async () => {} } });
  await assert.rejects(fetcher.fetchPage('https://example.invalid', { retries: 3 }), /HTTP 503/); pass++;
  eq(httpCalls, 3, '非成功状态进入重试');
  const signal = new AbortController().signal;
  for (let i = 0; i < 15; i++) await sleep(0, signal);
  eq(getEventListeners(signal, 'abort').length, 0, '等待结束移除取消监听');
  const abort = new AbortController(); const pendingSleep = sleep(10000, abort.signal); abort.abort();
  await assert.rejects(pendingSleep, /已取消/); pass++;
  eq(getEventListeners(abort.signal, 'abort').length, 0, '取消后移除监听');
  const subscriptions = [], tasks = [];
  const vscode = { window: { createOutputChannel: () => ({ appendLine() {}, dispose() {} }), showInformationMessage() {} }, workspace: { getConfiguration: () => ({ get: (_key, d) => d }) } };
  const { ScrapeManager } = load('src/service/scrape.js', { vscode });
  const manager = new ScrapeManager({ subscriptions, globalState: { get: (_key, d) => d, update() {} } });
  manager.onTask = (running, text) => tasks.push({ running, text });
  let finishSearch;
  manager.buildCool18 = () => ({ search: () => new Promise(resolve => { finishSearch = resolve; }) });
  const search = manager.searchCool18('关键词');
  eq(manager.busy, true, '搜索占用任务锁');
  eq(await manager.searchCool18('第二次'), [], '第二个搜索被阻止');
  eq(manager.cancel(), true, '搜索可被统一取消'); finishSearch([]); await search;
  eq(manager.busy, false, '搜索完成释放锁');
  eq(manager.summarizePixiv({ saved: [{ type: 'series', saved: 0, skipped: 0 }], failures: ['失败'], aborted: false }).includes('新增 0'), true, '失败系列不计新增');
  eq(manager.summarizePixiv({ saved: [{ type: 'series', saved: 2, skipped: 8 }], failures: [], aborted: false }).includes('新增 2'), true, '混合跳过系列按章统计');
  manager.pixivCookie = async () => ''; manager.buildPixivCore = () => ({ writer: failureCore.writer, checkUpdates: () => failureCore.checkUpdates() });
  const updated = await manager.pixivUpdate({ report() {}, finish() {} });
  eq(updated.msg.includes('失败'), true, '断网不显示无更新');
  const worker = new AnalysisWorker();
  try {
    const text = '第一章 开始\n　　正文。\n第二章 继续';
    eq(await worker.run('chapters', { text }), chapters.chapterEntries(text.split('\n')), '后台目录与同步结果一致');
    eq(await worker.run('scan', { text }), transforms.scanLines(text.split('\n')), '后台诊断一致');
    eq(isLargeDocument({ lineCount: 1, getText: () => '字'.repeat(300001) }), true, '超长单行进入后台');
    const batchText = '　　第一段。\n　　第二段。\n';
    const result = await worker.run('batch', { text: batchText, options: {} });
    eq(result.indented.lines.length, 2, '后台批量处理');
  } finally { worker.dispose(); }
  const largeFile = path.join(path.dirname(foreign), 'large.txt'); fs.writeFileSync(largeFile, '　　正文。\n'.repeat(30000));
  const batchResult = await new BatchProcessor().processFolder(path.dirname(foreign), { backup: true, signal: new AbortController().signal, onProgress() {} });
  eq(batchResult.errors, [], '真实大文件批量后台处理完成');
  eq(fs.existsSync(largeFile + '.bak'), true, '后台处理保留原始备份');
  const renameCommands = {}, renameCalls = [];
  const renameVs = { Uri: { file: fsPath => ({ fsPath }) }, window: { showInputBox: async () => '..' + path.sep + 'move.txt', showErrorMessage: text => text }, workspace: { fs: { rename: async () => renameCalls.push(true) } } };
  load('src/commands/files.js', { vscode: renameVs, '../core/editor': {} }).registerFileCommands({ reg: (n,f) => { renameCommands[n] = f; }, panel: { editor: () => ({ document: { uri: { scheme: 'file', fsPath: path.join(root, 'a.txt') } } }) }, checker: {} });
  await renameCommands.renameFile(); eq(renameCalls.length, 0, '重命名拒绝目录穿越');
  if (process.platform === 'win32') {
    const cliCalls = [];
    const fakeCp = { spawnSync: (command, argv, options) => {
      cliCalls.push({ command, argv, options });
      if (command === 'where.exe') return { status: 0, stdout: argv[0] === 'code.cmd' ? 'C:\\My Apps\\VS Code\\bin\\code.cmd' : 'C:\\My Apps\\node\\npx.cmd' };
      return { status: 0, stdout: 'ok' };
    } };
    const update = load('scripts/update.js', { child_process: fakeCp, fs: { readFileSync: () => '"%~dp0..\\versioned\\resources\\app\\out\\cli.js"' } });
    const packagePath = path.join(root, 'folder with spaces', 'extension.vsix');
    update.runCli('code', ['--install-extension', packagePath, '--force']);
    eq(cliCalls[1].argv.includes(packagePath), true, '含空格包路径作为独立参数传递');
    eq(cliCalls[1].options.shell, undefined, '安装不拼接 shell 字符串');
    eq(cliCalls[1].argv[0].includes('versioned'), true, '支持 VS Code 版本目录布局');
    update.runCli('npx', ['--yes', '@vscode/vsce', 'package']);
    eq(cliCalls[3].argv[0].endsWith('npx-cli.js'), true, 'Windows npx 通过 Node 参数调用');
  }
  const dataBefore = fs.readFileSync(path.join(__dirname, '../src/engine/zh-convert-data.js'));
  const cp = require('child_process');
  const gen = cp.spawnSync(process.execPath, [path.join(__dirname, '../scripts/gen-zh-data.js'), folder('missing-dictionary')], { encoding: 'utf8' });
  eq(gen.status !== 0, true, '缺源字典时生成器失败');
  eq(fs.readFileSync(path.join(__dirname, '../src/engine/zh-convert-data.js')), dataBefore, '生成失败不修改正式字表');
  // 对审计器注入未声明配置，确保检测不是只数声明项。
  const auditFs = { ...fs, readFileSync: (file, encoding) => {
    const content = fs.readFileSync(file, encoding);
    return String(file).replace(/\\/g,'/').endsWith('src/service/checker.js') ? content + "\nthis.cfg().get('undeclaredRegressionSetting');" : content;
  } };
  let auditExit;
  // wiring-audit 是独立脚本，下面通过 VM 注入 process 避免结束当前测试。
  const auditSource = fs.readFileSync(path.join(__dirname, 'wiring-audit.js'), 'utf8');
  vm.runInNewContext(auditSource, { require: id => id === 'fs' ? auditFs : id === '../package.json' ? require('../package.json') : createRequire(path.join(__dirname, 'wiring-audit.js'))(id), console: { log() {} }, process: { exit: code => { auditExit = code; } } });
  eq(auditExit, 1, '审计能拦截未声明设置');

  // --- v0.18.2 深度审查新增回归 ---
  // 1) writeFileAtomic 在不支持硬链接的环境下安全降级为独占新建
  const fallbackDir = folder('link-fallback');
  const fallbackFile = path.join(fallbackDir, 'novel.txt');
  const fakeLinkFs = { ...fs, linkSync() { const err = new Error('operation not permitted'); err.code = 'EPERM'; throw err; } };
  const fallbackWriterMod = load('src/engine/pixiv/writer.js', { fs: fakeLinkFs });
  fallbackWriterMod.writeFileAtomic(fallbackFile, '初次写入\n', { overwrite: false });
  eq(fs.readFileSync(fallbackFile, 'utf8'), '初次写入\r\n', '硬链接 EPERM 时降级独占写入成功');
  assert.throws(() => fallbackWriterMod.writeFileAtomic(fallbackFile, '二次写入\n', { overwrite: false }), (e) => e.code === 'EEXIST'); pass++;
  eq(fs.readFileSync(fallbackFile, 'utf8'), '初次写入\r\n', '降级写入不覆盖已有文件');
  eq(fs.readdirSync(fallbackDir).filter(f => f.endsWith('.tmp')).length, 0, '降级写入后无残留临时文件');

  // 2) safePath / ensureDir 拦截断链符号链接（existsSync 为 false 但 lstatSync 为 symlink）
  const dangleDir = folder('dangling-link');
  const dangleSub = path.join(dangleDir, 'link-dir');
  const dangleFs = {
    ...fs,
    existsSync: (p) => path.resolve(p) === path.resolve(dangleSub) ? false : fs.existsSync(p),
    lstatSync: (p) => path.resolve(p) === path.resolve(dangleSub) ? { isSymbolicLink: () => true } : fs.lstatSync(p),
  };
  const { Writer: DangleWriter } = load('src/engine/pixiv/writer.js', { fs: dangleFs });
  const dw = new DangleWriter({ outputRoot: dangleDir });
  assert.throws(() => dw.safePath(path.join(dangleSub, 'a.txt')), /符号链接/); pass++;
  assert.throws(() => dw.ensureDir(dangleSub), /符号链接/); pass++;

  // 3) 无 manifest 记录但磁盘已有文件时，强制重抓仍能备份替换
  const orphanRoot = folder('orphan-force');
  const orphanCore = new PixivCore({ outputRoot: orphanRoot, saveUrlNote: false });
  orphanCore.api.novel = async id => ({ id, title: '旧篇', userId: '7', userName: '作者', content: '旧内容', tags: [] });
  const orphanSaved = await orphanCore.downloadNovel('701');
  fs.unlinkSync(path.join(orphanRoot, 'pixiv-manifest.json'));
  const orphanReloaded = new PixivCore({ outputRoot: orphanRoot, saveUrlNote: false });
  eq(orphanReloaded.clearNovel('701'), false, '无 manifest 记录时 clearNovel 仍返回 false');
  orphanReloaded.api.novel = async id => ({ id, title: '旧篇', userId: '7', userName: '作者', content: '新内容', tags: [] });
  const orphanUpdated = await orphanReloaded.downloadNovel('701');
  eq(orphanUpdated.skipped, false, '无 manifest 记录时强制重抓仍替换目标文件');
  eq(fs.readFileSync(orphanSaved.file, 'utf8').includes('新内容'), true, '无 manifest 强制重抓写入新正文');
  eq(fs.readdirSync(path.dirname(orphanSaved.file)).some(f => f.endsWith('.bak')), true, '无 manifest 强制重抓先生成备份');

  // 4) Pixiv 取消时不把取消记作失败章；writeMerged 兼容数字型章节 ID
  const cancelPixivRoot = folder('pixiv-cancel');
  const cancelPixiv = new PixivCore({ outputRoot: cancelPixivRoot, saveUrlNote: false });
  const pixivAbort = new AbortController();
  cancelPixiv.api.seriesAll = async () => ({ meta: { id: '80', title: '取消测试', userName: '作者', userId: '8', publishedContentCount: 2 }, chapters: [{ id: '801', order: 1 }, { id: '802', order: 2 }] });
  cancelPixiv.api.novel = async (id) => {
    if (id === '802') { pixivAbort.abort(); throw new Error('已取消'); }
    return { id, title: '第一章', userName: '作者', userId: '8', content: '第一章正文', tags: [] };
  };
  const cancelRes = await cancelPixiv.downloadSeries('80', { signal: pixivAbort.signal });
  eq(cancelRes.saved, 1, '取消前已完成章节计入新增');
  eq(cancelRes.failures.length, 0, '取消异常不记为失败章节');
  const numEntry = cancelPixiv.writer.manifest.series['80'];
  numEntry.files[0].id = 801;
  cancelPixiv.writeMerged({ id: '80', title: '取消测试', userName: '作者', userId: '8' }, [{ id: '801', order: 1 }], cancelPixiv.writer.safePath(numEntry.dir), numEntry);
  eq(fs.readFileSync(path.join(cancelPixiv.writer.safePath(numEntry.dir), '_合并.txt'), 'utf8').includes('第一章正文'), true, 'writeMerged 兼容数字型章节 ID');

  // 5) Pixiv Api.userWorks 支持对象字典型 profile/all 降级与系列去重；seriesAll 防死翻页
  const { Api } = require('../src/engine/pixiv/api');
  const api = new Api({
    async getJson(url) {
      if (url.includes('/novels/all')) throw new Error('404');
      if (url.includes('/profile/all')) return { novelSeries: [{ id: '10' }, { id: '10' }], novels: { '101': null, '102': null } };
      if (url.includes('/ajax/novel/series/90')) return { id: '90', title: '重复页', userId: '1', userName: '甲', publishedContentCount: 60 };
      if (url.includes('/series_content/90')) return { page: { seriesContents: Array.from({ length: 30 }, (_, i) => ({ id: String(1000 + i), series: { contentOrder: 30 - i } })) } };
      throw new Error('unexpected ' + url);
    },
  });
  const works = await api.userWorks('1');
  eq(works.seriesIds, ['10'], 'userWorks 系列 ID 去重');
  eq(works.novelIds, ['101', '102'], 'userWorks 降级支持对象字典型 novels');
  let pageCalls = 0;
  const origSeriesPage = api.seriesContentPage.bind(api);
  api.seriesContentPage = async (...args) => { pageCalls++; return origSeriesPage(...args); };
  await api.seriesAll('90');
  eq(pageCalls, 2, 'seriesAll 遇不前进的 minOrder 立即终止翻页');

  // 6) AnalysisWorker 空闲退出后自动重建不挂起，且 batch 空文本切行安全
  const recoveryWorker = new AnalysisWorker();
  try {
    eq(await recoveryWorker.run('batch', { text: '', options: {} }).then(r => r.indented.lines), [''], '后台 batch 兼容空文本');
    const exited = new Promise(resolve => recoveryWorker.worker.once('exit', resolve));
    await recoveryWorker.worker.terminate();
    await exited;
    eq(recoveryWorker.worker, null, 'worker 空闲退出后重置引用');
    eq((await recoveryWorker.run('chapters', { text: '第一章 恢复' })).length, 1, '空闲退出后下次调用自动重建 worker');
  } finally { recoveryWorker.dispose(); }

  // 7) BatchProcessor 空文件不改写不建备份
  const emptyDir = folder('empty-batch');
  const emptyFile = path.join(emptyDir, 'empty.txt');
  fs.writeFileSync(emptyFile, '');
  const emptyRes = await new BatchProcessor().processFolder(emptyDir, { backup: true });
  eq(emptyRes.changed, 0, '0 字节空文件不改写');
  eq(fs.readFileSync(emptyFile).length, 0, '空文件保持 0 字节');
  eq(fs.existsSync(emptyFile + '.bak'), false, '空文件不生成备份');

  // 8) Checker 静音/重命名清理防抖计时器；navigation.check 大文件过期扫描不误报已排除
  const navMessages = [];
  const navCommands = {};
  load('src/commands/navigation.js', {
    vscode: { window: { showInformationMessage: m => navMessages.push(m), setStatusBarMessage() {} }, Position: function () {}, Range: function () {}, Selection: function () {}, TextEditorRevealType: {} },
    '../core/editor': { jumpToLine() {}, noDoc() {} },
  }).registerNavigationCommands({
    reg: (n, f) => { navCommands[n] = f; },
    panel: { editor: () => ({ document: { uri: 'file:///demo.txt' } }), chapterEntries: async () => [] },
    checker: { appliesTo: () => true, fullScan: async () => undefined },
  });
  await navCommands.check();
  eq(navMessages.length, 0, '大文件扫描过期返回空时不误提示文件类型已排除');

  // 9) renameFile 拒绝仅含扩展名（无主干名）的输入
  const stemErrors = [];
  const stemCommands = {};
  load('src/commands/files.js', {
    vscode: { Uri: { file: fsPath => ({ fsPath }) }, window: { showInputBox: async () => '.txt', showErrorMessage: text => stemErrors.push(text) }, workspace: { fs: { rename: async () => { throw new Error('不应重命名'); } } } },
    '../core/editor': {},
  }).registerFileCommands({ reg: (n, f) => { stemCommands[n] = f; }, panel: { editor: () => ({ document: { uri: { scheme: 'file', fsPath: path.join(root, 'a.txt') } } }) }, checker: {} });
  await stemCommands.renameFile();
  eq(stemErrors.length, 1, '重命名拒绝仅含扩展名的无主干名输入');

  // 10) chapters 跨空组零、超界保护、带括号/空格卷号与带空格章号统一；cool18 sanitizeName 尾点与控制字符；UTF-8 BOM 解码
  eq(chapters.numToCn(100001000), '一亿零一千', 'numToCn 跨整组零补零');
  eq(chapters.numToCn(1e12), '', 'numToCn 超出亿组返回空串');
  const volEntries = chapters.chapterEntries(['【第一卷 序】', '第 1 卷 续', '第 12 章 标题']);
  eq(volEntries.map(e => e.kind), ['volume', 'volume', 'chapter'], '卷号支持括号包裹及第后空格');
  eq(chapters.unifyChapterNumbers(['第 12 章 标题']).lines[0], '第十二 章 标题', '章节号统一支持第后空格');
  const { sanitizeName: c18Sanitize } = require('../src/engine/cool18/parse');
  eq(c18Sanitize('书名\x01测试...'), '书名测试', 'cool18 sanitizeName 剔除控制字符与尾随点号');
  eq(c18Sanitize('a'.repeat(79) + '.bc').endsWith('.'), false, 'cool18 sanitizeName 截断后不留尾点');
  eq(decodeToUtf8(Buffer.from('\ufeff你好世界', 'utf8')).text, '你好世界', 'decodeToUtf8 正确解码并剥离 UTF-8 BOM');

  // 11) ScrapeManager snapshot Pixiv 代理默认回退与 buildPixivCore 一致，历史记录按实际新增篇/章统计
  const snapHistory = [];
  const snapVs = {
    window: { createOutputChannel: () => ({ appendLine() {}, dispose() {} }), showInformationMessage() {} },
    workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
  };
  const { ScrapeManager: SnapManager } = load('src/service/scrape.js', { vscode: snapVs });
  const snapMgr = new SnapManager({ subscriptions: [], globalState: { get: () => [], update: (_k, v) => snapHistory.push(v) } });
  eq(snapMgr.snapshot().pixivProxy, 'http://127.0.0.1:7897', 'snapshot 的 Pixiv 默认代理与抓取引擎一致');
  snapMgr.pixivCookie = async () => '';
  snapMgr.buildPixivCore = () => ({
    writer: { manifest: { novels: {}, series: {} } },
    downloadSeries: async () => ({ type: 'series', saved: 0, skipped: 5, failures: [] }),
    downloadNovel: async () => ({ type: 'novel', title: '单篇', skipped: false }),
  });
  await snapMgr.executePixiv([{ type: 'series', id: '1' }, { type: 'novel', id: '2' }], { report() {}, finish() {} });
  eq(snapHistory[0][0].label, '新增 1 篇/章', 'Pixiv 抓取历史按实际新增篇/章数记录');

  // --- v0.19.1 全量代码审查新增回归 ---
  // 1) 章节标题分隔空格零误报，标题内脏空格与扩展 A 区汉字空格照常检出，BOM 行首提示清晰
  eq(transforms.scanLines(['第一章 初入江湖', '第1话 初遇', '第一卷 山雨欲来', '序章 觉醒', '第廿五章 破阵']).mid, [], '标准章节标题分隔空格不误报');
  eq(transforms.scanLines(['第一章 初 入江湖', '第一章 初入江湖  ', '㐀 㐁']).mid.length, 3, '标题内汉字空格、行尾空格与扩展区汉字空格仍检出');
  eq(transforms.scanLines(['\ufeff第一章']).ws[0].desc.includes('BOM字符×1'), true, '行首 BOM 字符明确标记');

  // 2) 引号顺序配对与英文撇号豁免；mergeLines 保留行首半角/混排缩进
  eq(transforms.quoteIssues('”你好，“他说。'), ['” 缺开引号 ×1', '“ 未闭合 ×1'], '检出闭前开后的错序引号');
  eq(transforms.quoteIssues('他说：“I don’t know, it’s John’s.”'), [], '豁免英文缩写撇号不误报');
  eq(transforms.quoteIssues('他说：Hello.’'), ['’ 缺开引号 ×1'], '非词内孤立右单引号仍检出');
  eq(transforms.mergeLines(['  第一段。', '  第二段。'], { smartParagraphs: false }).lines, ['  第一段。', '  第二段。'], '合并换行不吞行首半角缩进');

  // 3) 自定义 chapterPattern 不叠加内置松散兜底；括号卷号转汉字；廿/卅/卌与略位中文数字
  eq(chapters.chapterEntries(['## 第一回', '', '楔子 独立行'], '^##\\s+').map(e => e.line), [0], '自定义正则严格匹配不叠加内置松散兜底');
  eq(chapters.unifyChapterNumbers(['【卷1】 山雨欲来', '（卷2） 风起']).lines, ['【卷一】 山雨欲来', '（卷二） 风起'], '括号包裹卷号转汉字');
  const c18Parse = require('../src/engine/cool18/parse');
  eq([c18Parse.cnNumeral('一百一二'), c18Parse.cnNumeral('一百二'), c18Parse.cnNumeral('一万二'), c18Parse.cnNumeral('廿三'), chapters.chapterNumber('第卅五章')],
    [112, 120, 12000, 23, 35], '支持略位中文数字与廿/卅章节号');

  // 4) cool18 chapterKey 卷+区间/章区间/章前卷后、unwrapWrap 连续英文、a标签多属性与实体解码、长版替换同步 key
  eq(c18Parse.chapterKey('【江山】第二卷 (1-5)', 101), [2, 1, 0, 101, 5], '卷号与括号区间共存不丢章号');
  eq(c18Parse.chapterKey('【江山】第10章-第15章', 103), [0, 10, 0, 103, 15], '显式第X章-第Y章保留结束章号');
  eq(c18Parse.chapterKey('第5章 初遇（第二卷）', 104), [2, 5, 0, 104, 5], '章前卷后仍提取卷号');
  eq(c18Parse.bodyToText('　　Hello\nworld\nagain'), '　　Hello world again', '连续英文硬换行保留全部单词空格');
  const parsedThread = c18Parse.extractThread('<h1 class="main-title">书名</h1>送交者: <a>Tom &amp; Jerry</a><pre>　　正文<a target="_blank" href=\'index.php?tid=654321\'>下一章</a></pre>');
  eq(parsedThread.author, 'Tom & Jerry', '作者名解码 HTML 实体');
  eq(parsedThread.links, [{ tid: 654321, text: '下一章' }], '支持非首属性及单引号 href 提取章节链');
  eq(parsedThread.body, '　　正文', '非首属性 tid 链接文字从正文剥离');
  const replacePages = {
    1: page('【书】(1-3)', '短索引', [2, 3]),
    2: page('【书】第一章', '第一章完整长正文内容超过短索引', []),
    3: page('【书】第三章', '第三章正文', []),
  };
  const replaceCore = new Cool18Core({ outputRoot: folder('c18-replace-key'), delayMs: 0, fetchPage: async u => replacePages[u.match(/tid=(\d+)/)[1]] });
  const replaceRes = await replaceCore.scrape([pageUrl(1)], { deep: true });
  eq(replaceRes.missing.some(m => m.includes('2')), true, '索引帖被单章长帖替换后更新覆盖范围，不掩盖缺第2章');

  // 5) 批量整理：已规范非 UTF-8 文件转码为无 BOM UTF-8，无 BOM 文件不注入 BOM，原 BOM 文件保留 BOM
  const transcodeDir = folder('batch-transcode');
  const gbkClean = path.join(transcodeDir, 'gbk.txt');
  // "　　测试。\r\n" 的 GB18030 编码字节
  const gbkBytes = Buffer.from([0xA1, 0xA1, 0xA1, 0xA1, 0xB2, 0xE2, 0xCA, 0xD4, 0xA1, 0xA3, 0x0D, 0x0A]);
  fs.writeFileSync(gbkClean, gbkBytes);
  const gbkOne = new BatchProcessor().processOne(gbkClean, { backup: true });
  eq(gbkOne.changed, true, '排版已规范的 GBK 文件仍触发转码写入');
  const gbkAfter = fs.readFileSync(gbkClean);
  eq(gbkAfter.slice(0, 3).equals(Buffer.from([0xEF, 0xBB, 0xBF])), false, '批量整理默认不注入 UTF-8 BOM');
  eq(gbkAfter.toString('utf8'), '　　测试。\r\n', '转码后内容准确');
  eq(new BatchProcessor().processOne(gbkClean, { backup: true }).changed, false, '转码后再次运行幂等');
  const bomFile = path.join(transcodeDir, 'bom.txt');
  fs.writeFileSync(bomFile, '\ufeff测试\n', 'utf8');
  new BatchProcessor().processOne(bomFile, { backup: false });
  eq(fs.readFileSync(bomFile).slice(0, 3).equals(Buffer.from([0xEF, 0xBB, 0xBF])), true, '原带 UTF-8 BOM 的文件保留 BOM');

  // 6) Pixiv 未完成系列增量补抓、downloadUser 去重与强制重抓、章节改名归档、5xx 不翻转代理、代理简写与鉴权、cool18 重定向
  const resumeRoot = folder('pixiv-resume');
  const resumeCore = new PixivCore({ outputRoot: resumeRoot, saveUrlNote: false });
  const resumeAbort = new AbortController();
  resumeCore.api.seriesAll = async () => ({ meta: { id: '50', title: '未完系列', userName: '作者', userId: '5', publishedContentCount: 2 }, chapters: [{ id: '501', order: 1 }, { id: '502', order: 2 }] });
  resumeCore.api.seriesMeta = async () => ({ id: '50', title: '未完系列', userName: '作者', userId: '5', publishedContentCount: 2 });
  let blockSecond = true;
  resumeCore.api.novel = async (id) => {
    if (id === '502' && blockSecond) { resumeAbort.abort(); throw new Error('已取消'); }
    return { id, title: '第' + (id === '501' ? '一' : '二') + '章', userName: '作者', userId: '5', content: '正文' + id, tags: [] };
  };
  await resumeCore.downloadSeries('50', { signal: resumeAbort.signal });
  blockSecond = false;
  const resumedUpdate = await resumeCore.checkUpdates({});
  eq(resumedUpdate.updates.length, 1, '中途取消的未完成系列在 checkUpdates 时自动续传');
  eq(resumedUpdate.updates[0].saved, 1, '自动续传补齐剩余 1 章');

  const userRoot = folder('pixiv-user');
  const userCore = new PixivCore({ outputRoot: userRoot, saveUrlNote: false });
  userCore.api.userBrief = async () => ({ id: '9', name: '作者九' });
  userCore.api.userWorks = async () => ({ seriesIds: ['60'], novelIds: ['601', '602', '699'] });
  userCore.api.seriesAll = async () => ({ meta: { id: '60', title: '系列六十', userName: '作者九', userId: '9', publishedContentCount: 2 }, chapters: [{ id: '601', order: 1 }, { id: '602', order: 2 }] });
  let novelTitle601 = '初版标题';
  let fail602 = true;
  const standaloneCalls = [];
  const origDownloadNovel = userCore.downloadNovel.bind(userCore);
  userCore.downloadNovel = async (id, ctx) => { standaloneCalls.push(String(id)); return origDownloadNovel(id, ctx); };
  userCore.api.novel = async (id) => {
    if (id === '602' && fail602) throw new Error('网络抖动');
    return { id, title: id === '601' ? novelTitle601 : '作品' + id, userName: '作者九', userId: '9', content: '内容' + id + '-' + novelTitle601, tags: [] };
  };
  await userCore.downloadUser('9');
  eq(standaloneCalls, ['699'], '系列内失败章节不会被当成独立散篇下载');
  fail602 = false;
  novelTitle601 = '修订标题';
  userCore.clearUser('9');
  const forcedUser = await userCore.downloadUser('9');
  eq(forcedUser.saved, 3, 'clearUser 使作者全量支持强制重抓全部系列与散篇');
  const s60Dir = userCore.writer.seriesDir('作者九', '9', '系列六十', '60');
  eq(fs.readdirSync(s60Dir).filter(f => f.startsWith('001 ') && f.endsWith('.txt')).length, 1, '章节改名重抓后旧名 txt 已归档为 .bak 不重复残留');

  const { parseProxy, connectHeaders } = require('../src/engine/proxy');
  const pInfo = parseProxy('alice:secret@127.0.0.1:7897');
  eq([pInfo.host, pInfo.port, connectHeaders('pixiv.net:443', pInfo)['Proxy-Authorization']],
    ['127.0.0.1', 7897, 'Basic ' + Buffer.from('alice:secret').toString('base64')], '支持省略协议头的代理地址与 Basic 鉴权');
  const { Fetcher } = require('../src/engine/pixiv/fetcher');
  const pixivFetcher = new Fetcher({ proxy: '127.0.0.1:7897', maxRetries: 1, intervalMs: 200 });
  pixivFetcher._pace = async () => {};
  pixivFetcher._request = async () => ({ status: 502, headers: {}, text: '', json: null });
  await assert.rejects(pixivFetcher.getJson('https://www.pixiv.net/ajax/novel/1'), /HTTP 502/); pass++;
  eq(pixivFetcher._useProxy, true, 'Pixiv 收到 HTTP 5xx 时不将代理通道翻转为直连');

  let redirectHops = 0;
  const redirectHttps = { request: (opts, cb) => {
    redirectHops++;
    const req = new EventEmitter(); req.destroy = err => req.emit('error', err);
    req.end = () => queueMicrotask(() => {
      const res = new EventEmitter(); res.resume = () => {};
      if (redirectHops === 1) { res.statusCode = 302; res.headers = { location: '/final' }; cb(res); }
      else { res.statusCode = 200; res.headers = {}; cb(res); res.emit('data', Buffer.from('ok')); res.emit('end'); }
    });
    return req;
  } };
  const redirectFetcher = load('src/engine/cool18/fetcher.js', { https: redirectHttps, '../async': { sleep: async () => {} } });
  eq(await redirectFetcher.fetchPage('https://example.invalid/start', { retries: 1 }), 'ok', 'cool18 请求支持自动跟随 302 重定向');

  // 7) Panel 忽略 output 非文稿编辑器；状态栏反映 enabled=false 与引号计数；offsetAt 零拷贝；后台 t2s；空文档消空行不写回
  const docEd = { selection: { active: { line: 0 } }, document: { uri: { scheme: 'file' }, isClosed: false, lineCount: 1, lineAt: () => ({ text: '正文' }), fileName: 'novel.txt' } };
  const outEd = { selection: { active: { line: 0 } }, document: { uri: { scheme: 'output' }, isClosed: false, lineCount: 1, lineAt: () => ({ text: '日志' }), fileName: 'extension-output' } };
  const panelVs = {
    window: { activeTextEditor: outEd, createStatusBarItem: () => ({ show() {}, hide() {} }) },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
    StatusBarAlignment: { Right: 1 },
  };
  const { PanelManager: FilteredPanel } = load('src/ui/panel.js', { vscode: panelVs });
  const fp = new FilteredPanel({ subscriptions: [] }, { appliesTo: () => true, counts: () => ({ ws: 0, mid: 0, short: 0, quote: 0, silenced: false }) }, {});
  fp.lastEditor = docEd;
  eq(fp.editor(), docEd, '活动编辑器为 output 通道时回退到最近文稿编辑器');

  let sbVisible = false;
  const sbItem = { text: '', tooltip: '', show() { sbVisible = true; }, hide() { sbVisible = false; } };
  let cfgEnabled = false;
  const checkerVs = {
    window: { activeTextEditor: docEd, createStatusBarItem: () => sbItem },
    languages: { createDiagnosticCollection: () => ({ set() {}, delete() {}, clear() {}, get: () => [{ code: 'quote-pair' }], dispose() {} }) },
    workspace: { getConfiguration: () => ({ get: (k, d) => k === 'enabled' ? cfgEnabled : d }) },
    StatusBarAlignment: { Right: 1 },
  };
  const { Checker } = load('src/service/checker.js', { vscode: checkerVs });
  const ck = new Checker({ subscriptions: [] });
  ck.refreshStatusBar();
  eq(sbItem.text, '贴左:关', 'enabled=false 时状态栏显示已关闭而非 ✓');
  cfgEnabled = true;
  ck.refreshStatusBar();
  eq(sbItem.text, '贴左:0 引号:1', '状态栏纳入引号配对问题计数');
  checkerVs.window.activeTextEditor = outEd;
  ck.refreshStatusBar();
  eq(sbVisible, false, '焦点在 output 通道时隐藏贴左状态栏');

  let getTextCalled = false;
  eq(isLargeDocument({
    lineCount: 10,
    lineAt: () => ({ text: 'x' }),
    offsetAt: () => 400000,
    getText: () => { getTextCalled = true; return ''; },
  }), true, 'offsetAt 可用时判定超长文档');
  eq(getTextCalled, false, 'isLargeDocument 通过 offsetAt 零拷贝计算，不调用 getText');

  const t2sWorker = new AnalysisWorker();
  try {
    const t2sRes = await t2sWorker.run('t2s', { text: '看著書\n乾坤' });
    eq(t2sRes.lines, ['看着书', '乾坤'], '后台线程 t2s 转换结果准确');
    eq([t2sRes.summary.totalChanges, t2sRes.summary.protectedTotal], [2, 1], '后台线程 t2s 汇总计数准确');
  } finally { t2sWorker.dispose(); }

  const emptyOrgCmds = {}, emptyOrgWrites = [], emptyOrgMsgs = [];
  load('src/commands/organize.js', {
    vscode: { window: { showInformationMessage: m => emptyOrgMsgs.push(m) } },
    '../core/editor': { docLines: () => [''], applyLines: async (_e, l) => emptyOrgWrites.push(l), noDoc() {} },
  }).registerOrganizeCommands({ reg: (n, f) => { emptyOrgCmds[n] = f; }, panel: { editor: () => ({ document: {} }) }, checker: {}, cfg: () => ({ get: (_k, d) => d }) });
  await emptyOrgCmds.removeBlankLines();
  eq(emptyOrgWrites.length, 0, '空文档执行消除空白行不触发无意义写回');
  eq(emptyOrgMsgs[0], '没有空白行可消除', '空文档执行消除空白行提示无空行可消');

  console.log('===== 审查回归：通过 ' + pass + '，失败 0 =====');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
