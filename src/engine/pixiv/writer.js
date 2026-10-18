'use strict';

// 落盘层：文件名净化 / 防覆盖 / 原子写入 / URL 注记 / manifest 记账
// 铁律：只新建文件，绝不删除、绝不覆盖既有文件（_合并.txt 与 .meta.json 这类插件自产文件除外）

const fs = require('fs');
const path = require('path');

const ILLEGAL = { '\\': '＼', '/': '／', ':': '：', '*': '＊', '?': '？', '"': '＂', '<': '＜', '>': '＞', '|': '｜' };

function sanitizeName(name, maxLen = 80) {
  let s = String(name || '').replace(/[\\/:*?"<>|]/g, (c) => ILLEGAL[c]);
  s = s.replace(/[\x00-\x1f]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/[. ]+$/g, '');
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i.test(s)) s = '_' + s;
  if (s.length > maxLen) {
    s = s.slice(0, maxLen);
    // 截断可能切断代理对（emoji/扩展区汉字）：末位是孤立高代理项则去掉，避免 Windows 建文件 EINVAL
    const last = s.charCodeAt(s.length - 1);
    if (last >= 0xD800 && last <= 0xDBFF) s = s.slice(0, -1);
    s = s.replace(/[. ]+$/g, '');
  }
  return s || '无标题';
}

function toCRLF(text) {
  return String(text).replace(/\r?\n/g, '\r\n');
}

// 先写唯一临时文件再改名：中途崩溃不产生半个损坏文件，也不会覆盖既有 .tmp
function writeFileAtomic(fullPath, text) {
  const tmp = fullPath + '.' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.tmp';
  try {
    fs.writeFileSync(tmp, toCRLF(text), 'utf8');
    fs.renameSync(tmp, fullPath);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) { /* 尽力清理 */ }
    throw e;
  }
}

class Writer {
  constructor(opts = {}) {
    this.outputRoot = opts.outputRoot;
    this.saveUrlNote = opts.saveUrlNote !== false;
    this.saveMeta = !!opts.saveMeta;
    this.manifestPath = path.join(this.outputRoot, 'pixiv-manifest.json');
    this.log = opts.log || (() => {});
    this.manifest = this._loadManifest();
  }

  _loadManifest() {
    try {
      if (fs.existsSync(this.manifestPath)) {
        const m = JSON.parse(fs.readFileSync(this.manifestPath, 'utf8'));
        if (m && typeof m === 'object') {
          return { version: 1, novels: m.novels || {}, series: m.series || {} };
        }
      }
    } catch (e) {
      const bak = `${this.manifestPath}.corrupt-${Date.now()}.bak`;
      try { fs.renameSync(this.manifestPath, bak); this.log(`manifest 损坏，已备份到 ${bak}`); } catch (e2) { /* ignore */ }
    }
    return { version: 1, novels: {}, series: {} };
  }

  saveManifest() {
    this.ensureDir(this.outputRoot);
    writeFileAtomic(this.manifestPath, JSON.stringify(this.manifest, null, 2));
  }

  ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  authorDir(userName, userId) {
    return this.ensureDir(path.join(this.outputRoot, sanitizeName(userName || `用户${userId}`, 60)));
  }

  seriesDir(userName, userId, seriesTitle) {
    return this.ensureDir(path.join(this.authorDir(userName, userId), sanitizeName(seriesTitle, 60)));
  }

  exists(p) { return fs.existsSync(p); }

  saveText(filePath, text, { overwrite = false } = {}) {
    this.ensureDir(path.dirname(filePath));
    if (!overwrite && fs.existsSync(filePath)) return { path: filePath, skipped: true };
    writeFileAtomic(filePath, text.endsWith('\n') ? text : text + '\n');
    return { path: filePath, skipped: false };
  }

  novelPath(userName, userId, title) {
    return path.join(this.authorDir(userName, userId), sanitizeName(title) + '.txt');
  }

  chapterPath(userName, userId, seriesTitle, order, title) {
    const dir = this.seriesDir(userName, userId, seriesTitle);
    // order 来自远端数据，强制归一为安全正整数——绝不让 '..'、'/' 之类混进文件名
    let n = Math.floor(Number(order));
    if (!Number.isSafeInteger(n) || n < 1) n = 1;
    if (n > 999999) n = 999999;
    const nn = String(n).padStart(3, '0');
    return path.join(dir, `${nn} ${sanitizeName(title || `第${n}章`)}.txt`);
  }

  // 每本/每系列一个“只含原始链接”的注记 txt（对齐用户既有的存 URL 习惯）
  writeUrlNote(dir, url, label) {
    if (!this.saveUrlNote || !url) return;
    const p = path.join(dir, sanitizeName(label, 60) + '（链接）.txt');
    if (fs.existsSync(p)) return;
    this.saveText(p, url + '\n');
  }

  writeMeta(novelFile, data) {
    if (!this.saveMeta) return;
    const p = novelFile.replace(/\.txt$/i, '') + '.meta.json';
    this.saveText(p, JSON.stringify(data, null, 2), { overwrite: true });
  }
}

module.exports = { Writer, sanitizeName, toCRLF, writeFileAtomic };
