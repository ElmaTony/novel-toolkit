'use strict';
// 参数数组调用 CLI；临时包安装和版本核对结束后自动清理。
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
function runCli(name, args, options = {}) {
  let command = name;
  let argv = args;
  let env = process.env;
  if (process.platform === 'win32') {
    const located = spawnSync('where.exe', [name + '.cmd'], { encoding: 'utf8', windowsHide: true });
    if (located.status !== 0) throw new Error('找不到 ' + name + ' 命令');
    const bin = located.stdout.trim().split(/\r?\n/)[0];
    if (name === 'npx') {
      const defaultCli = path.join(path.dirname(bin), 'node_modules/npm/bin/npx-cli.js');
      if (typeof fs.existsSync !== 'function' || fs.existsSync(defaultCli)) {
        command = process.execPath;
        argv = [defaultCli, ...args];
      } else {
        const wrapper = fs.readFileSync(bin, 'utf8');
        const cliMatch = wrapper.match(/"%~dp0([^"]*npx-cli\.js)"/i);
        if (cliMatch) {
          command = process.execPath;
          argv = [path.resolve(path.dirname(bin), cliMatch[1]), ...args];
        } else {
          command = bin;
          argv = args;
          options = { shell: true, ...options };
        }
      }
    } else {
      const root = path.resolve(path.dirname(bin), '..');
      const wrapper = fs.readFileSync(bin, 'utf8');
      const exeMatch = wrapper.match(/"%~dp0([^"]*\.exe)"/i);
      command = exeMatch ? path.resolve(path.dirname(bin), exeMatch[1]) : path.join(root, 'Code.exe');
      const location = wrapper.match(/"%~dp0([^"]*cli\.js)"/i);
      if (!location) throw new Error('无法定位 VS Code CLI');
      argv = [path.resolve(path.dirname(bin), location[1]), ...args];
      env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
    }
  }
  const result = spawnSync(command, argv, { windowsHide: true, env, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(name + ' 退出码 ' + result.status);
  return result.stdout || '';
}
function main() {
  const root = path.resolve(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-toolkit-update-'));
  try {
    const file = path.join(temp, pkg.name + '-' + pkg.version + '.vsix');
    runCli('npx', ['--yes', '@vscode/vsce', 'package', '--out', file], { cwd: root, stdio: 'inherit' });
    runCli('code', ['--install-extension', file, '--force'], { stdio: 'inherit' });
    const installed = runCli('code', ['--list-extensions', '--show-versions'], { encoding: 'utf8' });
    if (!installed.toLowerCase().split(/\r?\n/).includes((pkg.publisher + '.' + pkg.name + '@' + pkg.version).toLowerCase())) throw new Error('安装版本核对失败');
    console.log('[update] 已安装 ' + pkg.version + '；已打开的窗口可执行 Developer: Reload Window');
  } finally {
    const target = path.resolve(temp);
    if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith('novel-toolkit-update-')) throw new Error('清理目录校验失败');
    fs.rmSync(target, { recursive: true, force: true });
  }
}
if (require.main === module) main();
module.exports = { runCli, main };
