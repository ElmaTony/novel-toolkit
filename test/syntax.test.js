'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const root = path.resolve(__dirname, '..');
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name.endsWith('.js') ? [path.join(dir, entry.name)] : []); }
const files = [path.join(root, 'extension.js'), ...['src','scripts','test'].flatMap(dir => walk(path.join(root, dir)))];
for (const file of files) {
  const result = cp.spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(1); }
}
console.log('语法检查通过：' + files.length + ' 个 JavaScript 文件');
