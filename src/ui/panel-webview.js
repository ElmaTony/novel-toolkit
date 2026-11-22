'use strict';

const vsapi = acquireVsCodeApi();
const $ = (id) => document.getElementById(id);
const initial = vsapi.getState ? vsapi.getState() || {} : {};
const preferences = {
  theme: ['auto', 'light', 'dark'].includes(initial.theme) ? initial.theme : 'auto',
  tab: initial.tab === 'scrape' ? 'scrape' : 'organize',
  source: initial.source === 'cool18' ? 'cool18' : 'pixiv',
  search: typeof initial.search === 'string' ? initial.search : '',
  toolsOpen: initial.toolsOpen !== false,
};
let data = { fileName: '正在读取文件…', chapters: [], hasDocument: false, wsCount: -1, midCount: -1, shortCount: -1, quoteCount: -1, silenced: false };
let scrape = { busy: false, taskText: '' };
let cursorLine = -1;
let lastScrollChapterLine = -1;
const previewTimers = {};
let hintTimer = null;

function post(message) { vsapi.postMessage(message); }
function run(name) { post({ command: 'run', name }); }
function savePreferences() { if (vsapi.setState) vsapi.setState(Object.assign({}, preferences)); }

function applyTheme(announce) {
  if (preferences.theme === 'auto') delete document.body.dataset.theme;
  else document.body.dataset.theme = preferences.theme;
  const label = { auto: '跟随 VS Code', light: '宣纸（浅色）', dark: '夜墨（深色）' }[preferences.theme];
  $('themeButton').title = '主题：' + label + '（点击切换）';
  $('themeButton').setAttribute('aria-label', '面板主题：' + label + '，点击切换');
  if (announce) {
    $('themeHint').textContent = '主题：' + label;
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { $('themeHint').textContent = ''; hintTimer = null; }, 1600);
  }
}

function showTab(name) {
  preferences.tab = name === 'scrape' ? 'scrape' : 'organize';
  document.querySelectorAll('[data-tab]').forEach((el) => el.setAttribute('aria-selected', String(el.dataset.tab === preferences.tab)));
  $('tab-organize').hidden = preferences.tab !== 'organize';
  $('tab-scrape').hidden = preferences.tab !== 'scrape';
  savePreferences();
}

function showSource(source) {
  preferences.source = source === 'cool18' ? 'cool18' : 'pixiv';
  document.querySelectorAll('[data-source]').forEach((el) => el.setAttribute('aria-selected', String(el.dataset.source === preferences.source)));
  $('source-pixiv').hidden = preferences.source !== 'pixiv';
  $('source-cool18').hidden = preferences.source !== 'cool18';
  savePreferences();
}

function updateDisabled() {
  document.querySelectorAll('[data-doc]').forEach((el) => { el.disabled = !data.hasDocument; });
  const issueCounts = { Ws: Math.max(0, data.wsCount) + Math.max(0, data.midCount || 0), Short: data.shortCount, Quote: data.quoteCount };
  Object.keys(issueCounts).forEach((key) => {
    $('row' + key).querySelectorAll('[data-run]').forEach((el) => {
      el.disabled = !data.hasDocument || data.wsCount < 0 || (!data.silenced && issueCounts[key] === 0);
    });
  });
  document.querySelectorAll('[data-task-start]').forEach((el) => { el.disabled = scrape.busy || (el.hasAttribute('data-doc') && !data.hasDocument); });
  $('forceGrab').disabled = scrape.busy;
}

function renderIssues() {
  const available = data.hasDocument && data.wsCount >= 0;
  const counts = { Ws: Math.max(0, data.wsCount) + Math.max(0, data.midCount || 0), Short: data.shortCount, Quote: data.quoteCount };
  const names = { Ws: '空白', Short: '标点短行', Quote: '引号配对' };
  Object.keys(counts).forEach((key) => {
    const count = counts[key] || 0;
    const row = $('row' + key);
    const state = !available ? '' : data.silenced ? 'paused' : count > 0 ? 'warn' : 'ok';
    row.className = 'check card' + (state ? ' ' + state : '');
    const summary = !available ? '未检查' : data.silenced ? '已暂停' : count > 0 ? count + ' 处' : '已通过';
    row.title = names[key] + '：' + summary;
    $('count' + key).textContent = !available || data.silenced ? '—' : String(count);
  });
  const paused = data.hasDocument && data.silenced;
  $('silenceNote').hidden = !paused;
  $('checkBtn').className = 'ghost check-btn' + (paused ? ' emph' : '');
}

function currentChapterIndex() {
  let index = -1;
  for (let i = 0; i < data.chapters.length; i++) {
    if (data.chapters[i].line > cursorLine) break;
    index = i;
  }
  return index;
}

function emptyRow(text) {
  const el = document.createElement('div');
  el.className = 'empty';
  el.textContent = text;
  return el;
}

function chapterRow(entry, number, currentLine) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'ch' + (entry.kind === 'volume' ? ' vol' : '') + (entry.line === currentLine ? ' current' : '');
  row.dataset.line = entry.line;
  row.setAttribute('aria-current', String(entry.line === currentLine));
  row.title = entry.title + ' · 第 ' + (entry.line + 1) + ' 行';
  const num = document.createElement('span');
  num.className = 'num';
  num.textContent = number === null ? '卷' : String(number).padStart(3, '0');
  const title = document.createElement('span');
  title.className = 't';
  title.textContent = entry.title;
  const line = document.createElement('span');
  line.className = 'ln';
  line.textContent = String(entry.line + 1);
  row.appendChild(num);
  row.appendChild(title);
  row.appendChild(line);
  return row;
}

function renderList() {
  const box = $('chapters');
  const query = $('search').value.trim().toLocaleLowerCase();
  const chapterCount = data.chapters.filter((entry) => entry.kind !== 'volume').length;
  const volumeCount = data.chapters.length - chapterCount;
  $('chCount').textContent = data.chapters.length ? chapterCount + ' 章' + (volumeCount ? ' · ' + volumeCount + ' 卷' : '') : '';
  box.innerHTML = '';
  if (!data.chapters.length) {
    box.appendChild(emptyRow(data.hasDocument ? '未识别到章节名，可在设置中调整识别规则' : '打开文稿后显示章节目录'));
    return;
  }
  const groups = [{ volume: null, items: [] }];
  let group = groups[0];
  let chapterNumber = 0;
  data.chapters.forEach((entry) => {
    if (entry.kind === 'volume') {
      group = { volume: entry, items: [] };
      groups.push(group);
    } else {
      chapterNumber++;
      group.items.push({ entry, number: chapterNumber });
    }
  });
  const index = currentChapterIndex();
  const currentLine = index >= 0 ? data.chapters[index].line : -1;
  const fragment = document.createDocumentFragment();
  let shown = 0;
  groups.forEach((g) => {
    const volumeMatch = !!g.volume && !!query && g.volume.title.toLocaleLowerCase().includes(query);
    const items = g.items.filter((item) => !query || volumeMatch || item.entry.title.toLocaleLowerCase().includes(query) || String(item.number).padStart(3, '0').includes(query));
    if (!items.length && !(g.volume && (!query || volumeMatch))) return;
    if (g.volume) { fragment.appendChild(chapterRow(g.volume, null, currentLine)); shown++; }
    items.forEach((item) => { fragment.appendChild(chapterRow(item.entry, item.number, currentLine)); shown++; });
  });
  if (shown) box.appendChild(fragment);
  else box.appendChild(emptyRow('没有匹配的章节'));
}

// 只滚动目录列表本身，避免 scrollIntoView 连带滚动整个面板
function scrollRowIntoList(row, center) {
  const box = $('chapters');
  if (!row || !box || typeof row.offsetTop !== 'number') return;
  const pad = 36; // 给吸顶的卷标题留出位置
  const top = row.offsetTop;
  const bottom = top + row.offsetHeight;
  if (center) box.scrollTop = Math.max(0, top - (box.clientHeight - row.offsetHeight) / 2);
  else if (top - pad < box.scrollTop) box.scrollTop = Math.max(0, top - pad);
  else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight + 4;
}

function highlightCurrent(autoScroll) {
  const index = currentChapterIndex();
  const line = index >= 0 ? data.chapters[index].line : -1;
  document.querySelectorAll('.ch').forEach((el) => {
    const current = Number(el.dataset.line) === line;
    el.classList.toggle('current', current);
    el.setAttribute('aria-current', String(current));
  });
  if (autoScroll && line >= 0 && line !== lastScrollChapterLine && preferences.tab === 'organize') {
    const row = document.querySelector('.ch[data-line="' + line + '"]');
    if (row) {
      lastScrollChapterLine = line;
      scrollRowIntoList(row, false);
    }
  }
}

function render() {
  $('fileName').textContent = data.fileName;
  $('fileStatus').textContent = !data.hasDocument ? '' : data.dirty ? '未保存' : '已保存';
  $('fileStatus').className = 'file-status' + (data.hasDocument && data.dirty ? ' dirty' : '');
  renderIssues();
  renderList();
  updateDisabled();
}

function renderScrape(state) {
  $('cool18Meta').textContent = '输出：' + state.cool18Out + ' · 代理：' + state.cool18Proxy;
  $('pixivMeta').textContent = '输出：' + state.pixivOut + ' · 代理：' + state.pixivProxy;
  $('cookieChip').textContent = state.cookieSet ? 'Cookie 已设置' : 'Cookie 未设置';
  $('cookieChip').className = 'cookie ' + (state.cookieSet ? 'ok' : 'warn');
  const series = state.series || [];
  $('seriesCount').textContent = series.length ? String(series.length) : '';
  const box = $('series');
  box.innerHTML = '';
  if (!series.length) { box.appendChild(emptyRow('还没有已抓系列，粘贴系列链接即可开始')); return; }
  series.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'srow';
    const book = document.createElement('span');
    book.className = 'spine';
    book.setAttribute('aria-hidden', 'true');
    const firstChar = Array.from(String(entry.title || '').replace(/^[\s\p{P}\p{S}]+/u, ''))[0];
    book.textContent = firstChar || '文';
    const description = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'st';
    title.textContent = entry.title;
    const meta = document.createElement('div');
    meta.className = 'sm';
    meta.textContent = (entry.author || '未知作者') + ' · ' + entry.count + ' 话';
    description.appendChild(title);
    description.appendChild(meta);
    row.appendChild(book);
    row.appendChild(description);
    box.appendChild(row);
  });
}

function renderTask() {
  const failed = !scrape.busy && /失败|错误|失效|出错/.test(scrape.taskText);
  $('taskDot').className = 'dot' + (scrape.busy ? ' busy' : failed ? ' error' : '');
  $('taskText').title = scrape.taskText || '';
  $('taskText').textContent = scrape.taskText || (scrape.busy ? '任务进行中…' : '就绪');
  $('cancelBtn').hidden = !scrape.busy;
  const progress = $('taskProgress');
  const match = scrape.taskText.match(/^(?:\[)?(\d+)\/(\d+)(?:\])?/);
  const determinate = !!match && Number(match[2]) > 0;
  progress.hidden = !scrape.busy;
  progress.className = 'progress' + (determinate ? '' : ' indeterminate');
  if (determinate) {
    const percent = Math.max(0, Math.min(100, Number(match[1]) / Number(match[2]) * 100));
    $('taskProgressFill').style.width = percent + '%';
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', '100');
    progress.setAttribute('aria-valuenow', String(Math.round(percent)));
  } else {
    $('taskProgressFill').style.width = '';
    progress.removeAttribute('aria-valuenow');
  }
  updateDisabled();
}

function start(message) {
  if (scrape.busy) return;
  scrape = { busy: true, taskText: '正在准备抓取…' };
  renderTask();
  post(message);
}

function forceGrabOn() { return !!$('forceGrab').checked; }
function pixivGrabFile() { start({ command: 'pixivGrabFile', force: forceGrabOn() }); }

function bindPreview(id, kind) {
  $(id).addEventListener('input', function () {
    if (previewTimers[kind]) clearTimeout(previewTimers[kind]);
    const text = this.value;
    previewTimers[kind] = setTimeout(() => { post({ command: 'scrapePreview', kind, text }); }, 300);
  });
}
bindPreview('pixivInput', 'pixiv');
bindPreview('cool18Input', 'cool18');
$('search').value = preferences.search;
$('search').addEventListener('input', () => { preferences.search = $('search').value; savePreferences(); renderList(); });
$('search').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    const row = $('chapters').querySelector('.ch:not(.vol)') || $('chapters').querySelector('.ch');
    if (row) { event.preventDefault(); post({ command: 'chapter', line: Number(row.dataset.line) }); }
  } else if (event.key === 'Escape' && $('search').value) {
    $('search').value = '';
    preferences.search = '';
    savePreferences();
    renderList();
  }
});
$('toolsPanel').open = preferences.toolsOpen;
$('toolsPanel').addEventListener('toggle', () => { preferences.toolsOpen = $('toolsPanel').open; savePreferences(); });

document.body.addEventListener('click', (event) => {
  const el = event.target.closest('button');
  if (!el || el.disabled) return;
  if (el.dataset.tab) { showTab(el.dataset.tab); return; }
  if (el.dataset.source) { showSource(el.dataset.source); return; }
  if (el.dataset.line !== undefined) { post({ command: 'chapter', line: Number(el.dataset.line) }); return; }
  if (el.dataset.run) { run(el.dataset.run); return; }
  if (el.dataset.host === 'pixivGrabFile') { pixivGrabFile(); return; }
  if (el.dataset.host === 'cool18GrabFile') { start({ command: 'cool18GrabFile' }); return; }
  if (el.dataset.host) { post({ command: el.dataset.host }); return; }
  if (el.dataset.cool18Deep !== undefined) { start({ command: 'cool18Grab', deep: el.dataset.cool18Deep === 'true', text: $('cool18Input').value }); return; }
  if (el.dataset.pixivGrab !== undefined) { start({ command: 'pixivGrab', text: $('pixivInput').value, force: forceGrabOn() }); return; }
  if (el.dataset.action === 'theme') {
    preferences.theme = { auto: 'light', light: 'dark', dark: 'auto' }[preferences.theme];
    applyTheme(true);
    savePreferences();
  } else if (el.dataset.action === 'locate') {
    const row = document.querySelector('.ch.current');
    if (row) scrollRowIntoList(row, true);
  }
});

window.addEventListener('message', (event) => {
  const message = event.data;
  if (!message) return;
  if (message.type === 'update') {
    data = Object.assign({}, data, message);
    render();
  } else if (message.type === 'cursor') {
    cursorLine = message.line;
    highlightCurrent(true);
  } else if (message.type === 'scrapeState') {
    scrape = { busy: !!message.state.busy, taskText: message.state.taskText || '' };
    renderScrape(message.state);
    renderTask();
  } else if (message.type === 'scrapePreview') {
    const el = $(message.kind === 'cool18' ? 'cool18Preview' : 'pixivPreview');
    el.textContent = message.text;
  } else if (message.type === 'task') {
    const wasBusy = scrape.busy;
    scrape = { busy: !!message.running, taskText: message.text || '' };
    if (!message.running && wasBusy) $('forceGrab').checked = false;
    renderTask();
    if (!message.running && wasBusy) post({ command: 'refresh' });
  }
});

applyTheme(false);
showTab(preferences.tab);
showSource(preferences.source);
updateDisabled();
post({ command: 'refresh' });
