'use strict';

// 批量处理服务: 对文件夹内全部 txt 执行整理流水线
// —— 递归扫描 .txt（跳过 .bak）；解码用 engine/encoding（GB2312/GBK/GB18030/Big5/UTF-16 自动识别）
// —— 整理流水线 = 合并段落内换行 → 去缩进 → 添加首行缩进（对已规范文件幂等）
// —— 可选 .bak 备份（novelToolkit.batchBackup，默认开）；输出统一 UTF-8

const fs = require('fs');
const path = require('path');
const transforms = require('../engine/transforms');
const { decodeToUtf8 } = require('../engine/encoding');
const { AnalysisWorker } = require('../engine/analysis-worker');

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
  try { fs.writeFileSync(bak, buf, { flag: 'wx' }); } catch (e) { if (e.code === 'EEXIST') return false; throw e; }
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
  processOne(file, opts, prepared) {
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
    const buf = prepared ? prepared.buf : fs.readFileSync(file);
    const det = prepared ? prepared.det : decodeToUtf8(buf);
    const sourceEncoding = det.encoding;
    const original = det.text;
    if (original.includes('\uFFFD') || original.includes('\u0000')) return { file, sourceEncoding, changed: false, skipped: true, needsReview: true, merged: 0, paragraphs: 0 };
    if (original === '') return { file, sourceEncoding, changed: false, merged: 0, paragraphs: 0, needsReview: false };
    const lines = original.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');

    const r = prepared ? prepared.result.merged : transforms.mergeLines(lines, {
      indentStartsParagraph: o.indentStartsParagraph,
      smartParagraphs: o.smartParagraphs,
      keepBlankLines: o.keepBlankLines,
      chapterPattern: o.chapterPattern,
    });
    const id = prepared ? prepared.result.indented : transforms.indentLines(transforms.dedentLines(r.lines).lines, {
      indentString: o.indentString,
      skipChapterTitles: o.skipChapterTitles,
      chapterPattern: o.chapterPattern,
      normalizeExisting: o.normalizeExisting,
    });
    const outText = id.lines.join(o.eol) + o.eol;
    const needsTranscode = sourceEncoding !== 'utf8' && sourceEncoding !== 'utf8bom';
    const changed = outText !== original || needsTranscode;

    if (changed) {
      if (o.backup) {
        writeBackupOnce(file, buf);
      }
      const prefix = sourceEncoding === 'utf8bom' ? '\ufeff' : '';
      writeFileAtomic(file, prefix + outText);
    }
    return {
      file,
      sourceEncoding,
      changed,
      merged: r.merged,
      paragraphs: r.paragraphs,
      needsReview: false,
    };
  }

  // 批量整理: 返回 { total, changed, unchanged, errors, needsReview[] }
  async processFolder(folder, opts = {}) {
    const files = this.list(folder);
    const results = { total: files.length, changed: 0, unchanged: 0, errors: [], needsReview: [], files: [] };
    const analysis = new AnalysisWorker();
    try {
    for (const file of files) {
      await yieldToHost();
      if (this.cancelled || isCancelled(opts.signal)) {
        results.cancelled = true;
        break;
      }
      try {
        let prepared;
        if (fs.statSync(file).size > 512000) {
          const buf = await fs.promises.readFile(file);
          const det = decodeToUtf8(buf);
          if (det.text.includes('\uFFFD') || det.text.includes('\u0000')) {
            prepared = { buf, det };
          } else {
            const workerOptions = {};
            for (const key of ['indentStartsParagraph', 'smartParagraphs', 'keepBlankLines', 'indentString', 'skipChapterTitles', 'normalizeExisting', 'chapterPattern']) { if (opts[key] !== undefined) workerOptions[key] = opts[key]; }
            const result = await analysis.run('batch', { text: det.text, options: workerOptions });
            if (this.cancelled || isCancelled(opts.signal)) { results.cancelled = true; break; }
            if (!buf.equals(await fs.promises.readFile(file))) throw new Error('处理期间文件已修改，跳过写入');
            prepared = { buf, det, result };
          }
        }
        const r = this.processOne(file, opts, prepared);
        results.files.push(r);
        if (r.changed) results.changed++;
        else results.unchanged++;
        if (r.needsReview) results.needsReview.push(file);
        if (opts.onProgress) opts.onProgress(file, r);
      } catch (e) {
        results.errors.push(file + ' (' + e.message + ')');
      }
    }
    } finally { analysis.dispose(); }
    return results;
  }

}

module.exports = { BatchProcessor, walkTxt };
