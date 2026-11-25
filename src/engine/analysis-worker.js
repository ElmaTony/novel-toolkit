'use strict';
const { Worker, isMainThread, parentPort } = require('worker_threads');
const LARGE_TEXT = 300000;
function documentCharLength(doc) {
  if (!doc) return 0;
  if (typeof doc.offsetAt === 'function' && typeof doc.lineAt === 'function') {
    try {
      if (doc.lineCount <= 0) return 0;
      const last = doc.lineCount - 1;
      return doc.offsetAt({ line: last, character: doc.lineAt(last).text.length });
    } catch (_) { /* 回退 */ }
  }
  if (typeof doc.lineAt === 'function' && typeof doc.getText !== 'function') {
    let total = 0;
    for (let i = 0; i < doc.lineCount; i++) total += doc.lineAt(i).text.length + 1;
    return total;
  }
  return typeof doc.getText === 'function' ? doc.getText().length : 0;
}
function isLargeDocument(doc) {
  return !!(doc && (doc.lineCount > 8000 || documentCharLength(doc) > LARGE_TEXT));
}
if (!isMainThread) {
  parentPort.on('message', ({ id, kind, payload }) => {
    try {
      const lines = payload.text.replace(/\r\n/g, '\n').split('\n');
      let result;
      if (kind === 'scan') result = require('./transforms').scanLines(lines, payload.options);
      else if (kind === 'chapters') result = require('./chapters').chapterEntries(lines, payload.pattern);
      else if (kind === 't2s') {
        const { t2sDetail, createChangeSummary } = require('./zh-convert');
        const summary = createChangeSummary();
        const out = lines.map((l, idx) => {
          const { output, changes } = t2sDetail(l);
          summary.add(changes, idx + 1);
          return output;
        });
        result = { lines: out, summary: summary.result() };
      } else if (kind === 'batch') {
        const batchLines = payload.text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
        const t = require('./transforms');
        const merged = t.mergeLines(batchLines, payload.options);
        const indented = t.indentLines(t.dedentLines(merged.lines).lines, payload.options);
        result = { merged, indented };
      } else throw new Error('未知分析任务');
      parentPort.postMessage({ id, result });
    } catch (e) { parentPort.postMessage({ id, error: e.message }); }
  });
}
class AnalysisWorker {
  constructor() { this.worker = null; this.requests = new Map(); this.nextId = 0; this.closed = false; }
  run(kind, payload) {
    if (this.closed) return Promise.reject(new Error('分析器已关闭'));
    if (!this.worker) {
      const worker = this.worker = new Worker(__filename);
      worker.on('message', message => {
        const request = this.requests.get(message.id);
        if (!request) return;
        this.requests.delete(message.id);
        message.error ? request.reject(new Error(message.error)) : request.resolve(message.result);
        if (!this.requests.size) worker.unref();
      });
      const fail = error => { if (this.worker !== worker) return; for (const request of this.requests.values()) request.reject(error); this.requests.clear(); if (this.worker === worker) this.worker = null; };
      worker.on('error', fail);
      worker.on('exit', code => {
        if (this.worker === worker) this.worker = null;
        if (this.requests.size) {
          for (const request of this.requests.values()) request.reject(new Error('后台分析退出: ' + code));
          this.requests.clear();
        }
      });
    }
    this.worker.ref();
    const id = ++this.nextId;
    return new Promise((resolve, reject) => { this.requests.set(id, { resolve, reject }); this.worker.postMessage({ id, kind, payload }); });
  }
  dispose() {
    this.closed = true;
    for (const request of this.requests.values()) request.reject(new Error('分析器已关闭'));
    this.requests.clear();
    if (this.worker) { this.worker.terminate(); this.worker = null; }
  }
}
module.exports = { AnalysisWorker, isLargeDocument, LARGE_TEXT };
