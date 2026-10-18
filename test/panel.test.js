'use strict';

// 面板三层测试: 语法 / 冒烟 / 消息一致性
// 这套测试的存在意义: v0.6.0 的面板脚本语法错误曾让整个面板静默失效,
// 外层 node --check 查不到模板字符串内部的问题 —— 本文件堵死这个盲区。

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const webviewScript = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'panel-webview.js'), 'utf8');
const { buildPanelHtml } = require('../src/ui/panel-html');
const MSG = require('../src/ui/messages');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
};

// 1) 语法: 构建出的完整脚本交给 node --check
const tmp = path.join(os.tmpdir(), 'panel-script-check.js');
fs.writeFileSync(tmp, webviewScript, 'utf8');
const r = cp.spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
ok('面板脚本语法正确（node --check）', r.status === 0);
if (r.status !== 0) {
  console.log(r.stderr || r.stdout);
}

// 2) HTML 注入: 模板注入的脚本与模块输出完全一致（单一事实来源）
const html = buildPanelHtml();
const m = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
ok('HTML 存在唯一的 <script> 块', !!m);
ok('CSP 使用 nonce 而非 unsafe-inline', /script-src 'nonce-[0-9a-f]+'/.test(html));
ok('HTML 注入脚本与 panel-script 模块一致', !!m && m[1].trim() === webviewScript.trim());

// 3) 冒烟: DOM 桩执行脚本, 模拟主机推送的三类消息
(function () {
  const elements = {};
  const listeners = {};
  function makeEl(id) {
    return {
      id, textContent: '', value: '', innerHTML: '', hidden: false, className: '',
      dataset: {},
      classList: { toggle() {}, add() {}, remove() {} },
      addEventListener() {},
      appendChild() {},
      scrollIntoView() {},
      querySelectorAll() { return []; },
    };
  }
  const document = {
    body: makeEl('body'),
    getElementById(id) { return elements[id] || (elements[id] = makeEl(id)); },
    createElement(t) { return makeEl(t); },
    createDocumentFragment() { return makeEl('frag'); },
    querySelectorAll() { return []; },
    querySelector() { return null; },
  };
  const window = { addEventListener(t, fn) { listeners[t] = fn; } };
  const api = { posts: [], postMessage(d) { this.posts.push(d); } };
  try {
    const fn = new Function('document', 'window', 'acquireVsCodeApi', 'navigator', webviewScript);
    fn(document, window, function () { return api; }, { language: 'zh-CN' });
    listeners.message({ data: { type: 'update', fileName: 't.txt', chapters: [
      { line: 0, title: '第一卷 开端', kind: 'volume' },
      { line: 1, title: '第一章 开始', kind: 'chapter' },
    ], wsCount: 0, shortCount: 0, silenced: false } });
    listeners.message({ data: { type: 'cursor', line: 1 } });
    listeners.message({ data: { type: 'scrapeState', state: {
      busy: false, taskText: '', cool18Out: 'x', cool18Proxy: '', pixivOut: 'y',
      pixivProxy: '', series: [], novelCount: 0, cookieSet: false,
    } } });
    listeners.message({ data: { type: 'task', running: false, text: '' } });
    ok('冒烟: update/cursor/scrapeState/task 全部处理无异常', true);
    ok('冒烟: 初始 refresh 已上报主机', api.posts.some((p) => p.command === 'refresh'));
  } catch (e) {
    ok('冒烟: 脚本执行异常 ' + (e && e.message), false);
  }
})();

// 4) 一致性: 脚本里引用的每个命令都必须在协议白名单里
const src = webviewScript;
const used = new Set();
for (const m of src.matchAll(/run\('([^']+)'\)/g)) {
  used.add('run:' + m[1]);
}
for (const m of src.matchAll(/post\(\{[^}]*?command:\s*'([^']+)'/g)) {
  used.add(m[1]);
}
for (const c of used) {
  if (c.startsWith('run:')) {
    ok('一致性: run(\'' + c.slice(4) + '\') 在 RUNNABLE 白名单', MSG.RUNNABLE.includes(c.slice(4)));
  } else {
    ok('一致性: post command \'' + c + '\' 在 HOST_COMMANDS', MSG.HOST_COMMANDS.includes(c));
  }
}

console.log('\n===== 面板测试：通过 ' + pass + '，失败 ' + fail + ' =====');
if (fail) {
  process.exit(1);
}
