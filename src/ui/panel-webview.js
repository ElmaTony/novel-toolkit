
  const vsapi = acquireVsCodeApi();
  let data = { fileName: '…', chapters: [], wsCount: -1, shortCount: -1, silenced: false };
  let scrape = { busy: false, taskText: '' };
  let cursorLine = -1;
  let lastScrollChapterLine = -1;
  let taTimer = null;

  function run(name) { vsapi.postMessage({ command: 'run', name: name }); }
  function post(msg) { vsapi.postMessage(msg); }

  function showTab(name) {
    document.querySelectorAll('.tab').forEach(function (el) {
      el.classList.toggle('active', el.dataset.tab === name);
    });
    document.getElementById('tab-organize').hidden = name !== 'organize';
    document.getElementById('tab-scrape').hidden = name !== 'scrape';
  }

  function currentChapterIndex() {
    if (!data.chapters.length || cursorLine < 0) { return -1; }
    let idx = -1;
    for (let i = 0; i < data.chapters.length; i++) {
      if (data.chapters[i].line <= cursorLine) { idx = i; } else { break; }
    }
    return idx;
  }

  function renderChips() {
    const wsEl = document.getElementById('chipWs');
    const shEl = document.getElementById('chipShort');
    const qEl = document.getElementById('chipQuote');
    const chEl = document.getElementById('chipCh');
    if (data.wsCount < 0) {
      wsEl.className = 'chip'; wsEl.textContent = '贴左 —';
      shEl.className = 'chip'; shEl.textContent = '短行 —';
      qEl.className = 'chip'; qEl.textContent = '引号 —';
    } else if (data.silenced) {
      wsEl.className = 'chip'; wsEl.textContent = '贴左 已静音';
      shEl.className = 'chip'; shEl.textContent = '短行 已静音';
      qEl.className = 'chip'; qEl.textContent = '引号 已静音';
    } else {
      wsEl.className = 'chip ' + (data.wsCount === 0 ? 'ok' : 'warn');
      wsEl.textContent = data.wsCount === 0 ? '✓ 贴左' : '贴左 ' + data.wsCount;
      shEl.className = 'chip ' + (data.shortCount === 0 ? 'ok' : 'warn');
      shEl.textContent = data.shortCount === 0 ? '✓ 短行' : '短行 ' + data.shortCount;
      qEl.className = 'chip ' + ((data.quoteCount || 0) === 0 ? 'ok' : 'warn');
      qEl.textContent = (data.quoteCount || 0) === 0 ? '✓ 引号' : '引号 ' + data.quoteCount;
    }
    chEl.textContent = '章节 ' + data.chapters.filter(function (c) { return c.kind !== 'volume'; }).length;
  }

  function renderList() {
    const box = document.getElementById('chapters');
    const q = document.getElementById('search').value.trim();
    const nCh = data.chapters.filter(function (c) { return c.kind !== 'volume'; }).length;
    const nVol = data.chapters.length - nCh;
    document.getElementById('chCount').textContent = data.chapters.length
      ? '(' + nCh + ' 章' + (nVol ? ' · ' + nVol + ' 卷' : '') + ')'
      : '';
    box.innerHTML = '';
    if (!data.chapters.length) {
      box.appendChild(emptyRow('未识别到章节名（可调整 novelToolkit.chapterPattern）'));
      return;
    }
    // 卷-章分组: 卷为组头, 卷之前的内容为第一组
    const groups = [];
    let group = { vol: null, items: [] };
    groups.push(group);
    for (const e of data.chapters) {
      if (e.kind === 'volume') {
        group = { vol: e, items: [] };
        groups.push(group);
      } else {
        group.items.push(e);
      }
    }
    const shownGroups = groups
      .map(function (g) {
        return { vol: g.vol, items: g.items.filter(function (c) { return !q || c.title.indexOf(q) >= 0; }) };
      })
      .filter(function (g) {
        return g.items.length || (g.vol && (!q || g.vol.title.indexOf(q) >= 0));
      });
    if (!shownGroups.length) {
      box.appendChild(emptyRow('没有匹配的章节'));
      return;
    }
    const cur = currentChapterIndex();
    const curLine = cur >= 0 ? data.chapters[cur].line : -1;
    const frag = document.createDocumentFragment();
    let chNo = 0;
    shownGroups.forEach(function (g) {
      if (g.vol) {
        frag.appendChild(makeRow(g.vol, null, curLine));
      }
      g.items.forEach(function (c) {
        if (c.kind !== 'volume') { chNo++; }
        frag.appendChild(makeRow(c, c.kind === 'volume' ? null : chNo, curLine));
      });
    });
    box.appendChild(frag);
  }

  function emptyRow(text) {
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = text;
    return d;
  }

  function makeRow(e, chNo, curLine) {
    const row = document.createElement('div');
    row.className = 'ch' + (e.kind === 'volume' ? ' vol' : '') + (e.line === curLine ? ' current' : '');
    row.dataset.line = e.line;
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = chNo === null ? '卷' : String(chNo).padStart(3, '0');
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = e.title;
    t.title = e.title;
    const ln = document.createElement('span');
    ln.className = 'ln';
    ln.textContent = '第 ' + (e.line + 1) + ' 行';
    row.appendChild(num);
    row.appendChild(t);
    row.appendChild(ln);
    row.onclick = function () { post({ command: 'chapter', line: e.line }); };
    return row;
  }

  function render() {
    document.getElementById('fileName').textContent = data.fileName;
    renderChips();
    renderList();
  }

  function highlightCurrent(autoScroll) {
    const cur = currentChapterIndex();
    const curLine = cur >= 0 ? data.chapters[cur].line : -1;
    document.querySelectorAll('.ch.current').forEach(function (el) { el.classList.remove('current'); });
    if (curLine >= 0) {
      const el = document.querySelector('.ch[data-line="' + curLine + '"]');
      if (el) {
      el.classList.add('current');
      if (autoScroll && curLine !== lastScrollChapterLine) {
        lastScrollChapterLine = curLine;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
    }
  }

  function locateCurrent() {
    const el = document.querySelector('.ch.current');
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function renderScrape(st) {
    document.getElementById('cool18Meta').textContent =
      '输出: ' + st.cool18Out + ' · 代理: ' + st.cool18Proxy;
    document.getElementById('pixivMeta').textContent =
      '输出: ' + st.pixivOut + ' · 代理: ' + st.pixivProxy;
    const chip = document.getElementById('cookieChip');
    chip.textContent = st.cookieSet ? 'Cookie 已设置' : 'Cookie 未设置';
    chip.className = 'chip ' + (st.cookieSet ? 'ok' : 'warn');
    const box = document.getElementById('series');
    document.getElementById('seriesCount').textContent =
      st.series.length ? '(' + st.series.length + ')' : '';
    box.innerHTML = '';
    if (!st.series.length) {
      const d = document.createElement('div');
      d.className = 'empty';
      d.textContent = '还没有抓过系列 —— 粘贴系列链接点「开始抓取」试试';
      box.appendChild(d);
      return;
    }
    st.series.forEach(function (s) {
      const row = document.createElement('div');
      row.className = 'srow';
      const t = document.createElement('span');
      t.className = 'st';
      t.textContent = '《' + s.title + '》';
      t.title = s.title;
      const m = document.createElement('span');
      m.className = 'sm';
      m.textContent = (s.author || '?') + ' · ' + s.count + ' 话';
      row.appendChild(t);
      row.appendChild(m);
      box.appendChild(row);
    });
  }

  function renderTask() {
    const dot = document.getElementById('taskDot');
    const txt = document.getElementById('taskText');
    const btn = document.getElementById('cancelBtn');
    dot.className = 'dot' + (scrape.busy ? ' busy' : '');
    txt.textContent = scrape.busy ? (scrape.taskText || '任务进行中…') : '空闲';
    txt.title = scrape.busy ? scrape.taskText : '';
    btn.hidden = !scrape.busy;
  }

  function cool18Grab(deep) {
    post({ command: 'cool18Grab', deep: deep, text: document.getElementById('cool18Input').value });
  }
  function pixivGrab() {
    post({ command: 'pixivGrab', text: document.getElementById('pixivInput').value, force: forceGrabOn() });
  }
  function pixivGrabFile() {
    post({ command: 'pixivGrabFile', force: forceGrabOn() });
  }
  function forceGrabOn() {
    const el = document.getElementById('forceGrab');
    return !!(el && el.checked);
  }
  function clearForceGrab() {
    const el = document.getElementById('forceGrab');
    if (el) { el.checked = false; }
  }

  function bindTa(id, kind) {
    document.getElementById(id).addEventListener('input', function () {
      if (taTimer) clearTimeout(taTimer);
      const text = this.value;
      taTimer = setTimeout(function () {
        post({ command: 'scrapePreview', kind: kind, text: text });
      }, 300);
    });
  }
  bindTa('cool18Input', 'cool18');
  bindTa('pixivInput', 'pixiv');

  document.getElementById('fileName').addEventListener('click', function () {
    post({ command: 'renameFile' });
  });

  document.getElementById('search').addEventListener('input', renderList);

  // 统一事件委托：CSP nonce 策略下部分 Chromium 会禁止行内 onclick，
  // 因此 panel-html.js 改用 data-* 属性，所有交互在这里绑定。
  document.body.addEventListener('click', function (e) {
    const el = e.target.closest('[data-tab], [data-run], [data-host], [data-cool18-deep], [data-pixiv-grab], [data-action]');
    if (!el) { return; }
    if (el.dataset.tab) {
      showTab(el.dataset.tab);
      return;
    }
    if (el.dataset.run) {
      run(el.dataset.run);
      return;
    }
    if (el.dataset.host) {
      post({ command: el.dataset.host });
      return;
    }
    if (el.dataset.cool18Deep !== undefined) {
      cool18Grab(el.dataset.cool18Deep === 'true');
      return;
    }
    if (el.dataset.pixivGrab !== undefined) {
      pixivGrab();
      return;
    }
    if (el.dataset.action === 'locate') {
      locateCurrent();
    }
  });

  window.addEventListener('message', function (e) {
    const m = e.data;
    if (!m) { return; }
    if (m.type === 'update') {
      data = m;
      render();
    } else if (m.type === 'cursor') {
      cursorLine = m.line;
      highlightCurrent(true);
    } else if (m.type === 'scrapeState') {
      scrape = { busy: !!m.state.busy, taskText: m.state.taskText || '' };
      renderScrape(m.state);
      renderTask();
    } else if (m.type === 'scrapePreview') {
      const el = document.getElementById(m.kind === 'cool18' ? 'cool18Preview' : 'pixivPreview');
      if (el) { el.textContent = m.text; }
    } else if (m.type === 'task') {
      scrape = { busy: !!m.running, taskText: m.text || '' };
      if (!m.running) { clearForceGrab(); }
      renderTask();
      if (!m.running) { vsapi.postMessage({ command: 'refresh' }); }
    }
  });

  vsapi.postMessage({ command: 'refresh' });
