'use strict';

// 真实临时文件验证整理/转码、备份、幂等及事件循环中的取消。
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { BatchProcessor } = require('../src/service/batch');

let pass = 0;
function eq(actual, expected, name) {
  assert.deepStrictEqual(actual, expected, name);
  pass++;
}

async function main() {
  const batch = new BatchProcessor();
  const bdir = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-batch-'));
  fs.writeFileSync(path.join(bdir, 'a.txt'), '　　A。   B\n继续。\n', 'utf8');
  fs.writeFileSync(path.join(bdir, 'b.txt'), '　　已经是规范段落。\n', 'utf8');
  const bp = await batch.processFolder(bdir, { backup: true, indentString: '　　' });
  eq(bp.total, 2, '整理扫描全部文件');
  eq(bp.changed, 2, '全部归一格式');
  eq(fs.readFileSync(path.join(bdir, 'a.txt'), 'utf8').replace(/^\ufeff/, '').replace(/\r\n/g, '\n'),
    '　　A。\n　　B继续。\n', '接缝拆分、合并、缩进结果正确');
  eq(fs.existsSync(path.join(bdir, 'a.txt.bak')), true, 'a.txt 已备份');
  eq(fs.existsSync(path.join(bdir, 'b.txt.bak')), true, 'b.txt 已备份');
  const backup = fs.readFileSync(path.join(bdir, 'a.txt.bak'));
  eq((await batch.processFolder(bdir, { backup: true })).changed, 0, '重复整理幂等');
  eq(fs.readFileSync(path.join(bdir, 'a.txt.bak')), backup, '保留最早的备份');
  fs.writeFileSync(path.join(bdir, 'c.txt'), Buffer.from([0xB2, 0xE2, 0xCA, 0xD4]));
  const bc = await batch.convertFolder(bdir, { backup: true });
  eq(bc.converted, 1, 'GB2312 文件转码');
  eq(fs.readFileSync(path.join(bdir, 'c.txt'), 'utf8'), '测试\n', '转码内容正确');
  eq((await batch.convertFolder(bdir)).converted, 0, '重复转码幂等');

  for (const method of ['processFolder', 'convertFolder']) {
    for (const mode of ['token', 'abort', 'cancel']) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-cancel-'));
      const original = Buffer.from([0xB2, 0xE2, 0xCA, 0xD4]);
      for (let i = 0; i < 3; i++) fs.writeFileSync(path.join(dir, i + '.txt'), original);
      const worker = new BatchProcessor();
      const controller = new AbortController();
      const token = { isCancellationRequested: false };
      const processed = [];
      const r = await worker[method](dir, {
        backup: true,
        signal: mode === 'token' ? token : controller.signal,
        onProgress: (file) => {
          processed.push(file);
          // 必须等宿主事件循环处理取消，不能仅在同步回调中改变标志。
          setImmediate(() => {
            if (mode === 'token') token.isCancellationRequested = true;
            else if (mode === 'abort') controller.abort();
            else worker.cancel();
          });
        },
      });
      const label = method + '/' + mode;
      eq(r.cancelled, true, label + ': 识别取消');
      eq(processed.length, 1, label + ': 完成当前文件后停止');
      eq(r.files.length, 1, label + ': 仅记录已处理文件');
      for (let i = 0; i < 3; i++) {
        const file = path.join(dir, i + '.txt');
        if (file === processed[0]) {
          eq(fs.readFileSync(file + '.bak'), original, label + ': 已处理文件有原始备份');
        } else {
          eq(fs.readFileSync(file), original, label + ': 未处理文件内容不变');
          eq(fs.existsSync(file + '.bak'), false, label + ': 未处理文件没有额外备份');
        }
      }
      const resumed = await worker[method](dir, { backup: true });
      eq(!!resumed.cancelled, false, label + ': 取消后可重新运行');
      eq(resumed.files.length + (resumed.already || 0), 3, label + ': 重新运行处理完全部文件');
    }

    for (const signal of [{ isCancellationRequested: true }, AbortSignal.abort()]) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-precancel-'));
      const file = path.join(dir, 'untouched.txt');
      fs.writeFileSync(file, '原始内容');
      const r = await batch[method](dir, { signal, backup: true });
      eq(r.cancelled, true, method + ': 启动时已取消');
      eq(r.files.length, 0, method + ': 已取消时不处理文件');
      eq(fs.readFileSync(file, 'utf8'), '原始内容', method + ': 已取消时内容不变');
      eq(fs.existsSync(file + '.bak'), false, method + ': 已取消时不创建备份');
    }
  }

  console.log('===== 批量测试：通过 ' + pass + '，失败 0 =====');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
