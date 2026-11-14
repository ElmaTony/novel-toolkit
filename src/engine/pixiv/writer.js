'use strict';
const fs = require('fs');
const path = require('path');
const ILLEGAL = { '\\': '＼', '/': '／', ':': '：', '*': '＊', '?': '？', '"': '＂', '<': '＜', '>': '＞', '|': '｜' };
function sanitizeName(name, maxLen = 80) {
  let s = String(name || '').replace(/[\\/:*?"<>|]/g, c => ILLEGAL[c]).replace(/[\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '');
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i.test(s)) s = '_' + s;
  s = s.slice(0, maxLen);
  if (/[\uD800-\uDBFF]$/.test(s)) s = s.slice(0, -1);
  return s.replace(/[. ]+$/g, '') || '无标题';
}
const toCRLF = text => String(text).replace(/\r?\n/g, '\r\n');
function writeFileAtomic(file, text, { overwrite = true } = {}) {
  const tmp = file + '.' + require('crypto').randomBytes(8).toString('hex') + '.tmp';
  try {
    fs.writeFileSync(tmp, toCRLF(text), { encoding: 'utf8', flag: 'wx' });
    // 硬链接发布为一次原子新建；EEXIST 不会覆盖竞争写入者的文件。
    if (overwrite) fs.renameSync(tmp, file);
    else fs.linkSync(tmp, file);
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}
function idSuffix(id) {
  if (id === undefined || id === null || id === '') return '';
  if (!/^\d+$/.test(String(id))) throw new Error('作品 ID 无效');
  return ' [' + id + ']';
}
class Writer {
  constructor(opts = {}) {
    this.outputRoot = path.resolve(opts.outputRoot);
    this.saveUrlNote = opts.saveUrlNote !== false;
    this.saveMeta = !!opts.saveMeta;
    this.manifestPath = path.join(this.outputRoot, 'pixiv-manifest.json');
    this.log = opts.log || (() => {});
    this.manifest = this._loadManifest();
    this.pending = 0;
    this.lastSave = Date.now();
  }
  safePath(file) {
    const full = path.resolve(this.outputRoot, file);
    const relative = path.relative(this.outputRoot, full);
    if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw new Error('文件路径超出输出目录');
    let current = full;
    for (;;) {
      if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('输出路径包含符号链接或目录联接');
      if (current === this.outputRoot) break;
      current = path.dirname(current);
    }
    return full;
  }
  relative(file) { return path.relative(this.outputRoot, this.safePath(file)); }
  _loadManifest() {
    try {
      if (!fs.existsSync(this.manifestPath)) return { version: 2, novels: {}, series: {} };
      this.safePath(this.manifestPath);
      const m = JSON.parse(fs.readFileSync(this.manifestPath, 'utf8'));
      const record = value => value && typeof value === 'object' && !Array.isArray(value);
      if (!record(m) || !record(m.novels) || !record(m.series)) throw new Error('manifest 结构无效');
      for (const entry of Object.values(m.series)) if (!record(entry) || !Array.isArray(entry.files)) throw new Error('系列记录结构无效');
      return { version: 2, novels: m.novels, series: m.series };
    } catch (e) {
      this.corruptManifest = true;
      this.log('manifest 无法读取，写入新记录前将备份原文件: ' + e.message);
      return { version: 2, novels: {}, series: {} };
    }
  }
  saveManifest({ checkpoint = false } = {}) {
    if (checkpoint && ++this.pending < 10 && Date.now() - this.lastSave < 5000) return;
    this.ensureDir(this.outputRoot);
    this.safePath(this.manifestPath);
    if (this.corruptManifest && fs.existsSync(this.manifestPath)) {
      fs.copyFileSync(this.manifestPath, this.manifestPath + '.corrupt-' + Date.now() + '.bak', fs.constants.COPYFILE_EXCL);
      this.corruptManifest = false;
    }
    writeFileAtomic(this.manifestPath, JSON.stringify(this.manifest, null, 2));
    this.pending = 0;
    this.lastSave = Date.now();
  }
  ensureDir(dir) {
    if (path.resolve(dir) !== this.outputRoot) this.safePath(dir);
    else if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) throw new Error('输出根目录不能是符号链接');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  authorDir(name, id) { return this.ensureDir(path.join(this.outputRoot, sanitizeName(name || '用户', 48) + idSuffix(id))); }
  seriesDir(name, uid, title, sid) { return this.ensureDir(path.join(this.authorDir(name, uid), sanitizeName(title, 48) + idSuffix(sid))); }
  legacyChapterPath(name, uid, title, order, chapter) {
    return this.safePath(path.join(this.outputRoot, sanitizeName(name || '用户' + uid, 60), sanitizeName(title, 60), String(order).padStart(3, '0') + ' ' + sanitizeName(chapter) + '.txt'));
  }
  exists(file) { return fs.existsSync(this.safePath(file)); }
  saveText(file, text, { overwrite = false, backup = false } = {}) {
    file = this.safePath(file);
    this.ensureDir(path.dirname(file));
    if (!overwrite && fs.existsSync(file)) return { path: file, skipped: true };
    if (overwrite && backup && fs.existsSync(file)) {
      const bak = file + '.' + Date.now() + '-' + require('crypto').randomBytes(4).toString('hex') + '.bak';
      fs.copyFileSync(file, bak, fs.constants.COPYFILE_EXCL);
    }
    try { writeFileAtomic(file, text.endsWith('\n') ? text : text + '\n', { overwrite }); }
    catch (e) { if (!overwrite && e.code === 'EEXIST') return { path: file, skipped: true }; throw e; }
    return { path: file, skipped: false };
  }
  novelPath(name, uid, title, nid) { return path.join(this.authorDir(name, uid), sanitizeName(title, 60) + idSuffix(nid) + '.txt'); }
  chapterPath(name, uid, title, order, chapter, sid) {
    const n = Math.max(1, Math.min(999999, Math.floor(Number(order)) || 1));
    return path.join(this.seriesDir(name, uid, title, sid), String(n).padStart(3, '0') + ' ' + sanitizeName(chapter || '第' + n + '章') + '.txt');
  }
  writeUrlNote(dir, url, label) {
    if (this.saveUrlNote && url) this.saveText(path.join(dir, sanitizeName(label, 60) + '（链接）.txt'), url + '\n');
  }
  writeMeta(file, data) {
    if (this.saveMeta) this.saveText(file.replace(/\.txt$/i, '') + '.meta.json', JSON.stringify(data, null, 2), { overwrite: true });
  }
}
module.exports = { Writer, sanitizeName, toCRLF, writeFileAtomic };
