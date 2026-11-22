'use strict';

// Pixiv 小说正文标记还原
// 目标：纯 txt 可读、章节行能被小说工具箱的章节正则识别、未知标记不静默丢失

function renderContent(raw, opts = {}) {
  const pageSeparator = opts.pageSeparator || '';
  const rubyKeep = !!opts.rubyKeep;
  const unknown = [];
  let text = String(raw || '').replace(/\r\n?/g, '\n');

  // 顺序：先处理带标签内容的，最后处理结构类，避免嵌套干扰
  text = text.replace(/\[jumpuri:([^\[\]:]+):([^\[\]]+)\]/g, (m, label, url) => `${label}（${url}）`);
  text = text.replace(/\[pixivimage:(\d+)(?:-\d+)?\]/g, (m, id) => `［插图］https://www.pixiv.net/artworks/${id}`);
  text = text.replace(/\[uploadedimage:\d+\]/g, () => '［内嵌插图］');
  text = text.replace(/\[jump:(\d+)\]/g, (m, id) => `[→novel/${id}]`);
  text = text.replace(/\[\[rb:([^>\[\]]+)>([^\[\]]+)\]\]/g, (m, base, ruby) => (rubyKeep ? `${base}（${ruby}）` : base));
  text = text.replace(/\[chapter:([^\[\]]*)\]/g, (m, t) => t);
  text = text.replace(/\n*\[newpage\]\n*/gi, () => (pageSeparator ? `\n\n${pageSeparator}\n\n` : '\n\n'));

  // 未知标记：ASCII 词 + 冒号 + ASCII 方括号 → 原样保留并上报（防静默丢内容）
  const seen = new Set();
  text = text.replace(/\[([a-zA-Z][a-zA-Z0-9_]{1,24}):[^\[\]\n]{0,160}\]/g, (m) => {
    if (!seen.has(m)) { seen.add(m); unknown.push(m); }
    return m;
  });

  return { text, unknown };
}

module.exports = { renderContent };
