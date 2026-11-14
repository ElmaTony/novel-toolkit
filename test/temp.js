'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const owned = new Set();
function makeTemp(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  owned.add(directory);
  return directory;
}
function cleanup() {
  for (const directory of owned) {
    const target = path.resolve(directory);
    if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('测试清理路径越界');
    fs.rmSync(target, { recursive: true, force: true });
  }
  owned.clear();
}
process.on('exit', cleanup);
module.exports = { makeTemp, cleanup };
