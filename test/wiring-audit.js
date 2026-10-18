'use strict';
// 接线完整性审计: 命令注册 ↔ package.json 声明 ↔ 快捷键 ↔ 设置项 ↔ RUNNABLE 白名单
// 修复任何接线/新增功能后必跑: node test/wiring-audit.js（退出码 0 = 全通）
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const commandFiles = fs.readdirSync('src/commands')
  .filter((f) => f.endsWith('.js'))
  .map((f) => 'src/commands/' + f);
const extSrc = [fs.readFileSync('extension.js', 'utf8')]
  .concat(commandFiles.map((f) => fs.readFileSync(f, 'utf8')))
  .join('\n');
const panelSrc = fs.readFileSync('src/ui/panel.js', 'utf8');
const scriptSrc = fs.readFileSync('src/ui/panel-webview.js', 'utf8');
const msgSrc = fs.readFileSync('src/ui/messages.js', 'utf8');
const engineSrc = ['src/engine/transforms.js', 'src/engine/chapters.js', 'src/engine/cool18/parse.js', 'src/engine/cool18/core.js']
  .map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const serviceSrc = fs.readFileSync('src/service/scrape.js', 'utf8') + fs.readFileSync('src/service/checker.js', 'utf8');
const uiSrc = panelSrc;

let issues = 0;
const regged = new Set([...extSrc.matchAll(/reg\('([^']+)'/g)].map((m) => m[1]));

// 1) package.json 声明的命令必须全部注册
for (const c of pkg.contributes.commands) {
  const id = c.command.replace('novelToolkit.', '');
  if (!regged.has(id)) { console.log('✗ 命令未注册: ' + c.command); issues++; }
}
// 2) 注册的命令必须在 package.json 声明
const declared = new Set(pkg.contributes.commands.map((c) => c.command.replace('novelToolkit.', '')));
for (const r of regged) {
  if (!declared.has(r)) { console.log('✗ 注册了但未声明: ' + r); issues++; }
}
// 3) 快捷键指向的命令必须已注册
for (const k of (pkg.contributes.keybindings || [])) {
  const id = k.command.replace('novelToolkit.', '');
  if (!regged.has(id)) { console.log('✗ 快捷键指向未注册命令: ' + k.key + ' → ' + k.command); issues++; }
}
// 4) 代码读取的 novelToolkit 设置项必须在 package.json 声明
//    （globalState 键不在 settings 里, 显式排除）
const GLOBAL_STATE_KEYS = new Set(['encodingSetupDone', 'scrapeHistory']);
const cfgUsed = new Set();
for (const src of [extSrc, engineSrc, serviceSrc, uiSrc]) {
  for (const m of src.matchAll(/\.get\(['"]novelToolkit\.([a-zA-Z0-9]+)['"]/g)) {
    if (!GLOBAL_STATE_KEYS.has(m[1])) cfgUsed.add(m[1]);
  }
}
const cfgDeclared = new Set(Object.keys(pkg.contributes.configuration.properties).map((k) => k.replace('novelToolkit.', '')));
for (const c of cfgUsed) {
  if (!cfgDeclared.has(c)) { console.log('✗ 代码读取了未声明的设置: novelToolkit.' + c); issues++; }
}
// 5) RUNNABLE 白名单必须全部已注册（先包括号再清理尾逗号）
const clean = (block) => JSON.parse(('[' + block.replace(/'/g, '"') + ']').replace(/,(\s*\])/g, '$1'));
const msgRun = clean(msgSrc.match(/RUNNABLE: \[([\s\S]*?)\]/)[1]);
for (const r of msgRun) {
  if (!regged.has(r)) { console.log('✗ RUNNABLE 白名单含未注册命令: ' + r); issues++; }
}
// 6) HOST_COMMANDS 必须都能被面板控制器处理
const hostCmds = clean(msgSrc.match(/HOST_COMMANDS: \[([\s\S]*?)\]/)[1]);
for (const c of hostCmds) {
  if (!panelSrc.includes("msg.command === '" + c + "'")) {
    console.log('✗ HOST_COMMANDS 未被面板控制器处理: ' + c); issues++;
  }
}

console.log('命令注册: ' + regged.size + ' | 设置项声明: ' + cfgDeclared.size +
  ' | 快捷键: ' + (pkg.contributes.keybindings || []).length +
  ' | RUNNABLE: ' + msgRun.length + ' | HOST_COMMANDS: ' + hostCmds.length);
console.log(issues === 0 ? '接线完整性: ✓ 全部通过' : '接线完整性: ✗ ' + issues + ' 个问题');
process.exit(issues ? 1 : 0);
