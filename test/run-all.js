'use strict';

// 一键全量测试: node test/run-all.js
// 任何套件失败 → 退出码 1（安装/提交前必须全绿）

const cp = require('child_process');
const path = require('path');

const suites = ['engine.test.js', 'cool18-core.test.js', 'panel.test.js'];
let failed = 0;

for (const s of suites) {
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, s)], { encoding: 'utf8' });
  console.log('== ' + s + ' → ' + (r.status === 0 ? 'PASS' : 'FAIL'));
  if (r.stdout) {
    process.stdout.write(r.stdout);
  }
  if (r.stderr) {
    process.stderr.write(r.stderr);
  }
  if (r.status !== 0) {
    failed++;
  }
}

console.log(failed === 0 ? '\n全部测试通过 ✓' : '\n' + failed + ' 个套件失败 ✗');
process.exit(failed ? 1 : 0);
