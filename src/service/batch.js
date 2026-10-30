'use strict';

// 批量处理服务: 对文件夹内全部 txt 执行 整理流水线 / 编码转存
// —— 递归扫描 .txt（跳过 .bak）；解码用 engine/encoding（GB2312/GBK/GB18030/Big5/UTF-16 自动识别）
// —— 整理流水线 = 合并段落内换行 → 去缩进 → 添加首行缩进（对已规范文件幂等）
// —— 可选 .bak 备份（novelToolkit.batchBackup，默认开）；输出统一 UTF-8

const fs = require('fs');
const path = require('path');
const transforms = require('../engine/transforms');
const { decodeToUtf8 } = require('../engine/encoding');

const TXT_RE = /\.txt$/i;
const BAK_RE = /\.bak$/i;

// 同时接受 AbortSignal 和 VS Code CancellationToken。
const isCancelled = (signal) => !!(signal && (signal.aborted || signal.isCancellationRequested));
// 文件之间让出事件循环，宿主才能接收取消事件并更新进度。
const yieldToHost = () => new Promise((resolve) => setImmediate(resolve));

function walkTxt(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    let st;
    try {
      st = fs.lstatSync(p);
    } catch (e) {
      continue;
    }
    if (st.isSymbolicLink()) {
      continue; // 不跟随符号链接/junction：指向祖先目录时会无限递归
    }
    if (st.isDirectory()) {
      walkTxt(p, out);
    } else if (TXT_RE.test(name) && !BAK_RE.test(name)) {
      out.push(p);
    }
  }
  return out;
}

// 原子写盘：先写同目录唯一临时文件，再同盘 rename——崩溃/断电不会留下半个文件
function writeFileAtomic(file, data) {
  const tmp = file + '.' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.tmp';
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) { /* 尽力清理 */ }
    throw e;
  }
}

// 备份铁律：.bak 只在不存在时新建（保留最早原文）；已有备份绝不覆盖
function writeBackupOnce(file, buf) {
  const bak = file + '.bak';
  if (fs.existsSync(bak)) {
    return false;
  }
  fs.writeFileSync(bak, buf);
  return true;
}

class BatchProcessor {
  constructor() {
    this.cancelled = false;
  }

  cancel() {
    this.cancelled = true;
  }

  list(folder) {
    this.cancelled = false;
    return walkTxt(folder, []);
  }

  // 整理流水线: 合并换行 → 去缩进 → 加缩进（可选 .bak 备份）
  processOne(file, opts) {
    const o = Object.assign(
      {
        indentStartsParagraph: true,
        smartParagraphs: true,
        keepBlankLines: true,
        indentString: '　　',
        skipChapterTitles: false,
        normalizeExisting: true,
        chapterPattern: undefined,
        backup: true,
        eol: '\r\n',
      },
      opts
    );
    const buf = fs.readFileSync(file);
    const det = decodeToUtf8(buf);
    const sourceEncoding = det.encoding;
    const original = det.text;
    const lines = original.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');

    const r = transforms.mergeLines(lines, {
      indentStartsParagraph: o.indentStartsParagraph,
      smartParagraphs: o.smartParagraphs,
      keepBlankLines: o.keepBlankLines,
    });
    const dd = transforms.dedentLines(r.lines);
    const id = transforms.indentLines(dd.lines, {
      indentString: o.indentString,
      skipChapterTitles: o.skipChapterTitles,
      chapterPattern: o.chapterPattern,
      normalizeExisting: o.normalizeExisting,
    });
    const outText = id.lines.join(o.eol) + o.eol;
    const changed = outText !== original;

    if (changed) {
      if (o.backup) {
        writeBackupOnce(file, buf);
      }
      writeFileAtomic(file, '\ufeff' + outText);
    }
    return {
      file,
      sourceEncoding,
      changed,
      merged: r.merged,
      paragraphs: r.paragraphs,
      needsReview: det.text.indexOf('\uFFFD') >= 0,
    };
  }

  // 批量整理: 返回 { total, changed, unchanged, errors, needsReview[] }
  async processFolder(folder, opts = {}) {
    const files = this.list(folder);
    const results = { total: files.length, changed: 0, unchanged: 0, errors: [], needsReview: [], files: [] };
    for (const file of files) {
      await yieldToHost();
      if (this.cancelled || isCancelled(opts.signal)) {
        results.cancelled = true;
        break;
      }
      try {
        const r = this.processOne(file, opts);
        results.files.push(r);
        if (r.changed) results.changed++;
        else results.unchanged++;
        if (r.needsReview) results.needsReview.push(file);
        if (opts.onProgress) opts.onProgress(file, r);
      } catch (e) {
        results.errors.push(file + ' (' + e.message + ')');
      }
    }
    return results;
  }

  // 批量转码: 只做编码归一（不整理排版），非 UTF-8 全部转存 UTF-8
  async convertFolder(folder, opts = {}) {
    const files = this.list(folder);
    const results = { total: files.length, converted: 0, already: 0, errors: [], skipped: [], files: [] };
    for (const file of files) {
      await yieldToHost();
      if (this.cancelled || isCancelled(opts.signal)) {
        results.cancelled = true;
        break;
      }
      try {
        const buf = fs.readFileSync(file);
        const det = decodeToUtf8(buf);
        if (det.encoding === 'utf8' || det.encoding === 'utf8bom') {
          results.already++;
          continue;
        }
        if (det.text.indexOf('\uFFFD') >= 0) {
          results.skipped.push(file + '（解码存在歧义，未改动）');
          continue;
        }
        if (opts.backup) {
          writeBackupOnce(file, buf);
        }
        const NL = String.fromCharCode(10);
        const outText = det.text.endsWith(NL) ? det.text : det.text + NL;
        writeFileAtomic(file, outText);
        results.converted++;
        results.files.push({ file, encoding: det.encoding });
        if (opts.onProgress) opts.onProgress(file, det.encoding);
      } catch (e) {
        results.errors.push(file + ' (' + e.message + ')');
      }
    }
    return results;
  }
}

module.exports = { BatchProcessor, walkTxt };
