'use strict';

// 面板三层测试: 语法 / 冒烟 / 消息一致性
// 这套测试的存在意义: v0.6.0 的面板脚本语法错误曾让整个面板静默失效,
// 外层 node --check 查不到模板字符串内部的问题 —— 本文件堵死这个盲区。

const fs = require('fs');
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
const r = cp.spawnSync(process.execPath, ['--check', '-'], { encoding: 'utf8', input: webviewScript });
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
      style: {}, attributes: {},
      classList: { toggle() {}, add() {}, remove() {} },
      addEventListener(type, fn) { this.listeners = this.listeners || {}; this.listeners[type] = fn; },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
      hasAttribute(name) { return name in this.attributes; },
      appendChild() {},
      scrollIntoView() {},
      querySelectorAll() { return []; },
      querySelector() { return null; },
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
  const api = { posts: [], state: null, postMessage(d) { this.posts.push(d); }, setState(state) { this.state = state; } };
  try {
    const fn = new Function('document', 'window', 'acquireVsCodeApi', 'navigator', webviewScript);
    fn(document, window, function () { return api; }, { language: 'zh-CN' });
    listeners.message({ data: { type: 'update', fileName: 't.txt', chapters: [
      { line: 0, title: '第一卷 开端', kind: 'volume' },
      { line: 1, title: '第一章 开始', kind: 'chapter' },
    ], wsCount: 1, midCount: 2, shortCount: 0, quoteCount: 0, silenced: false, hasDocument: true } });
    ok('检查: 空白计数包含行首和正文', elements.countWs.textContent === '3 处');
    listeners.message({ data: { type: 'cursor', line: 1 } });
    listeners.message({ data: { type: 'scrapeState', state: {
      busy: false, taskText: '', cool18Out: 'x', cool18Proxy: '', pixivOut: 'y',
      pixivProxy: '', series: [], novelCount: 0, cookieSet: false,
    } } });
    listeners.message({ data: { type: 'task', running: false, text: '' } });
    ok('冒烟: update/cursor/scrapeState/task 全部处理无异常', true);
    ok('冒烟: 初始 refresh 已上报主机', api.posts.some((p) => p.command === 'refresh'));
    const click = (dataset) => {
      const button = makeEl('click');
      button.dataset = dataset;
      document.body.listeners.click({ target: { closest() { return button; } } });
    };
    click({ action: 'theme' });
    ok('主题: 切换为浅色并保存偏好', document.body.dataset.theme === 'light' && api.state.theme === 'light');
    click({ action: 'theme' });
    ok('主题: 可切换为深色', document.body.dataset.theme === 'dark');
    click({ action: 'theme' });
    ok('主题: 可恢复跟随 VS Code', !document.body.dataset.theme && api.state.theme === 'auto');
    click({ tab: 'scrape' });
    click({ source: 'cool18' });
    ok('来源: 整理/抓取和来源独立切换', elements['tab-organize'].hidden && !elements['source-cool18'].hidden && elements['source-pixiv'].hidden);
    elements.forceGrab.checked = true;
    click({ host: 'pixivGrabFile' });
    ok('强制重抓: 当前文件链接也传递复选框', api.posts.some((p) => p.command === 'pixivGrabFile' && p.force === true));
    listeners.message({ data: { type: 'task', running: true, text: '4/8 正在保存' } });
    ok('进度: 仅按真实计数显示百分比', elements.taskProgressFill.style.width === '50%');
    listeners.message({ data: { type: 'task', running: false, text: '抓取失败：示例错误' } });
    ok('结果: 完成/错误消息保留显示', elements.taskText.textContent === '抓取失败：示例错误' && elements.cancelBtn.hidden);
    ok('结果: 任务结束后清除强制重抓', elements.forceGrab.checked === false);
    click({ line: '42' });
    ok('章节: 点击时发送行号', api.posts.some((p) => p.command === 'chapter' && p.line === 42));
  } catch (e) {
    ok('冒烟: 脚本执行异常 ' + (e && e.message), false);
  }
})();

// 4) 一致性: 脚本里引用的每个命令都必须在协议白名单里
const src = webviewScript;
const used = new Set();
// 按钮命令来自 HTML 的 data-* 属性，也必须检查，避免按钮被主机静默拒绝。
for (const m of html.matchAll(/data-run="([^"]+)"/g)) {
  used.add('run:' + m[1]);
}
for (const m of html.matchAll(/data-host="([^"]+)"/g)) {
  used.add(m[1]);
}
for (const m of src.matchAll(/run\('([^']+)'\)/g)) {
  used.add('run:' + m[1]);
}
for (const m of src.matchAll(/post\(\{[^}]*?command:\s*'([^']+)'/g)) {
  used.add(m[1]);
}
for (const c of used) {
  if (c === 'run') { continue; } // 命令白名单的通用信封，不属于自定义消息
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
