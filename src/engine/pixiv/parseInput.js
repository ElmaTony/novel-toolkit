'use strict';

// 把用户输入（单个字符串，可含多行/多链接/混合内容）解析为目标列表
// 目标形态: { type: 'novel' | 'series' | 'user', id: '数字串' }
// 兼容: /novel/{id}、/novel/show.php?id=、/novel/series/{id}、/users/{id}(/novels)、裸 ID

function parseInput(text) {
  const s = String(text || '');
  const targets = [];
  const seen = new Set();
  const push = (type, id) => {
    if (!id || !/^\d+$/.test(id)) return;
    const key = type + ':' + id;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push({ type, id });
  };

  // 系列链接先摘出，避免被 /novel/(\d+) 误吞
  for (const m of s.matchAll(/novel\/series\/(\d+)/g)) push('series', m[1]);
  const rest = s.replace(/novel\/series\/\d+/g, ' ');

  for (const m of rest.matchAll(/novel\/show\.php\?(?:[^#\s]*&)?id=(\d+)/g)) push('novel', m[1]);
  for (const m of rest.matchAll(/novel\/(\d+)/g)) push('novel', m[1]);
  for (const m of rest.matchAll(/users\/(\d+)/g)) push('user', m[1]);

  // 整个输入就是一个裸数字 → 默认当单篇
  if (targets.length === 0) {
    const t = s.trim();
    if (/^\d+$/.test(t)) push('novel', t);
  }
  return targets;
}

module.exports = { parseInput };
