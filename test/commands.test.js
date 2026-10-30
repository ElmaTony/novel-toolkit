'use strict';

// 隔离 VS Code API，执行实际注册的命令，验证输入到抓取目标的完整接线。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { createRequire } = require('module');
const { parseInput } = require('../src/engine/pixiv/parseInput');

let pass = 0;
function eq(actual, expected, name) {
  assert.deepStrictEqual(actual, expected, name);
  pass++;
}

function loadCommands(file, vscode, overrides = {}) {
  const filename = path.join(__dirname, '..', 'src', 'commands', file);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  const wrapper = vm.runInThisContext('(function (require, module, exports) {\n' +
    fs.readFileSync(filename, 'utf8') + '\n})', { filename });
  wrapper((id) => id === 'vscode' ? vscode :
    Object.prototype.hasOwnProperty.call(overrides, id) ? overrides[id] : localRequire(id), module, module.exports);
  return module.exports;
}

async function main() {
  let input;
  const commands = {};
  const calls = [];
  const messages = [];
  const vscode = {
    ProgressLocation: { Notification: 1 },
    window: {
      showInputBox: async () => input,
      showInformationMessage: async (message) => { messages.push(message); },
      withProgress: async (_options, action) => action({ report() {} }, {}),
    },
  };
  const scrape = {
    async executePixiv(targets, reporter) {
      calls.push(targets);
      const result = { saved: [], failures: [], aborted: false };
      reporter.finish(result, '完成');
      return result;
    },
    summarizePixiv: () => '完成',
  };
  loadCommands('scrape.js', vscode, {
    '../service/scrape': { parsePixivInput: parseInput },
  }).registerScrapeCommands({ reg: (name, fn) => { commands[name] = fn; }, panel: {}, scrape });

  input = ' 123456 ';
  await commands.pixivGrabUser();
  eq(calls.pop(), [{ type: 'user', id: '123456' }], '作者全量: 裸 ID 作为作者');
  input = 'https://www.pixiv.net/users/789/novels';
  await commands.pixivGrabUser();
  eq(calls.pop(), [{ type: 'user', id: '789' }], '作者全量: 作者链接仍可用');
  input = 'https://www.pixiv.net/novel/123456';
  await commands.pixivGrabUser();
  eq(calls.length, 0, '作者全量: 不把单篇链接下载成作者');
  eq(messages.pop(), '没有识别到 Pixiv 作者主页链接或作者 ID', '作者全量: 提示输入无效');
  input = undefined;
  await commands.pixivGrabUser();
  eq(calls.length, 0, '取消输入不触发任务');
  input = '123456';
  vscode.env = { clipboard: { readText: async () => '' } };
  await commands.pixivGrab();
  eq(calls.pop(), [{ type: 'novel', id: '123456' }], '普通抓取: 裸 ID 仍作为单篇');

  // 异步批量操作期间，第二个命令不得同时改写同一批文件。
  let finishBatch;
  let starts = 0;
  let folderSelections = 0;
  let cancelFolder = false;
  let failBatch = false;
  class FakeBatchProcessor {
    processFolder() {
      starts++;
      if (failBatch) return Promise.reject(new Error('测试失败'));
      return new Promise((resolve) => { finishBatch = resolve; });
    }
    convertFolder() { throw new Error('第二个任务不应启动'); }
  }
  vscode.Uri = { file: (fsPath) => ({ fsPath }) };
  vscode.window.showOpenDialog = async () => {
    folderSelections++;
    return cancelFolder ? undefined : [{ fsPath: 'unused' }];
  };
  loadCommands('batch.js', vscode, {
    '../service/batch': { BatchProcessor: FakeBatchProcessor },
  }).registerBatchCommands({
    reg: (name, fn) => { commands[name] = fn; },
    scrape: { cool18OutputRoot: () => 'unused', log() {} },
    cfg: () => ({ get: (_key, fallback) => fallback }),
  });
  const pending = commands.batchProcess();
  await Promise.resolve();
  eq(starts, 1, '批量任务已启动');
  await commands.batchConvert();
  eq(folderSelections, 1, '并行命令在选择文件前被拦截');
  eq(messages.pop(), '已有批量任务进行中，请等它完成或先取消', '并行命令提示当前任务进行中');
  let finishNotice;
  let summaryShown;
  const atSummary = new Promise((resolve) => { summaryShown = resolve; });
  vscode.window.showInformationMessage = (message) => {
    messages.push(message);
    if (message.startsWith('批量整理完成')) {
      summaryShown();
      return new Promise((resolve) => { finishNotice = resolve; });
    }
    return Promise.resolve();
  };
  finishBatch({ total: 0, changed: 0, unchanged: 0, errors: [] });
  await atSummary;
  cancelFolder = true;
  await commands.batchConvert();
  eq(folderSelections, 2, '任务完成后无需关闭通知即可开始下一次任务');
  finishNotice();
  await pending;
  cancelFolder = false;
  failBatch = true;
  await assert.rejects(commands.batchProcess(), /测试失败/);
  pass++;
  cancelFolder = true;
  await commands.batchConvert();
  eq(folderSelections, 4, '任务异常后仍释放闸门');

  console.log('===== 命令测试：通过 ' + pass + '，失败 0 =====');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
