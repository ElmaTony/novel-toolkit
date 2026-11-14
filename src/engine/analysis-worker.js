'use strict';
const { Worker, isMainThread, parentPort } = require('worker_threads');
const LARGE_TEXT = 300000;
function isLargeDocument(doc) {
  return doc.lineCount > 8000 || (typeof doc.getText === 'function' && doc.getText().length > LARGE_TEXT);
}
if (!isMainThread) {
  parentPort.on('message', ({ id, kind, payload }) => {
    try {
      const lines = payload.text.replace(/\r\n/g, '\n').split('\n');
      let result;
      if (kind === 'scan') result = require('./transforms').scanLines(lines, payload.options);
      else if (kind === 'chapters') result = require('./chapters').chapterEntries(lines, payload.pattern);
      else if (kind === 'batch') {
        if (lines[lines.length - 1] === '') lines.pop();
        const t = require('./transforms');
        const merged = t.mergeLines(lines, payload.options);
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
      worker.on('exit', code => { if (this.requests.size) fail(new Error('后台分析退出: ' + code)); });
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
