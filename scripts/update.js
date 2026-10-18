'use strict';

// 一键更新脚本：读取 package.json 版本 → 打包 .vsix → 用 code CLI 安装到 VSCode
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const vsix = `novel-toolkit-${pkg.version}.vsix`;

console.log(`[update] 打包 ${vsix} …`);
execSync('npx vsce package', { stdio: 'inherit', cwd: root });

console.log(`[update] 安装到 VSCode …`);
execSync(`code --install-extension ${path.join(root, vsix)} --force`, { stdio: 'inherit' });

console.log('[update] 完成。请在 VSCode 中执行：Developer: Reload Window');
