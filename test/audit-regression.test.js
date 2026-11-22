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

  console.log('===== 审查回归：通过 ' + pass + '，失败 0 =====');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
