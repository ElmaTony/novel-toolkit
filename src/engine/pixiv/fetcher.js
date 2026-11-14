'use strict';

// HTTP 层：零依赖（node:https + 手动 CONNECT 代理隧道）
// 直连为主（2026-10-11 实测本机直连 pixiv 可通），可配置代理兜底
// 全局起步间隔限速 ±30% 抖动；网络错误自动换通道重试；429/412 按 15s/60s/300s 退避

const https = require('https');
const http = require('http');
const { URL } = require('url');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://www.pixiv.net';

class PixivError extends Error {
  // kind: auth | notfound | rate | network | blocked | api | http
  constructor(kind, message, info = {}) {
    super(message);
    this.name = 'PixivError';
    this.kind = kind;
    this.status = info.status;
    this.url = info.url;
  }
}

// 可中断 sleep：signal 触发时立即 reject（限速退避 300s 期间点"取消"不再干等）
const { sleep } = require('../async');

// 接受裸 PHPSESSID 值、键值对、或整段 Cookie 头，统一归一成可直接注入的 Cookie 头
function extractCookie(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  if (!s.includes('=') && /^[\w%\-+.~]+$/.test(s)) return 'PHPSESSID=' + s;
  const m = s.match(/PHPSESSID=([^;\s]+)/);
  if (m) return 'PHPSESSID=' + m[1];
  return s;
}

// 状态码 + error 标志 + message 关键词三重判断（防 pixiv 改文案导致误判）
function classify(status, json) {
  if (status === 404) return 'notfound';
  if (status === 429 || status === 412) return 'rate';
  if (status === 401) return 'auth';
  if (json && json.error) {
    const msg = String(json.message || '');
    if (/登录|登入|ログイン|log\s?in|please\s/i.test(msg)) return 'auth';
    if (/削除|删除|deleted|not\s?exist|存在しない|見つかり/i.test(msg)) return 'notfound';
    return 'api';
  }
  if (status === 403) return json ? 'auth' : 'blocked'; // 403 非 JSON 多半是风控挑战页而非登录问题
  return 'http';
}

class Fetcher {
  constructor(opts = {}) {
    this.cookie = extractCookie(opts.cookie);
    this.proxy = opts.proxy || '';
    this.intervalMs = Math.max(200, Number(opts.intervalMs) || 1200);
    this.maxRetries = Math.max(0, Number(opts.maxRetries === undefined ? 3 : opts.maxRetries));
    this.timeoutMs = Number(opts.timeoutMs) || 30000;
    this.maxConcurrent = Math.max(1, Math.min(3, Number(opts.concurrency) || 1));
    this.log = opts.log || (() => {});
    this.signal = null; // 当前任务的 AbortSignal（由 PixivCore 每次任务入口赋值）
    this._lastStart = 0;
    this._paceTail = Promise.resolve();
    this._useProxy = !!this.proxy;
    this._active = 0;
    this._queue = [];
  }

  _acquire() {
    if (this._active < this.maxConcurrent) { this._active++; return Promise.resolve(); }
    return new Promise((res) => this._queue.push(res));
  }

  _release() {
    const next = this._queue.shift();
    if (next) next(); else this._active--;
  }

  // 相邻请求起步间隔 ≥ intervalMs ± 30%
  async _pace() {
    const previous = this._paceTail;
    let release;
    this._paceTail = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      const gap = this.intervalMs * (1 + (Math.random() * 0.6 - 0.3));
      const wait = this._lastStart + gap - Date.now();
      if (wait > 0) await sleep(wait, this.signal);
      if (this.signal && this.signal.aborted) throw new Error('已取消');
      this._lastStart = Date.now();
    } finally { release(); }
  }

  _flipChannel() { if (this.proxy) this._useProxy = !this._useProxy; }

  _headers() {
    const h = {
      'User-Agent': UA,
      'Accept': 'application/json',
      'Referer': BASE + '/',
      'Accept-Language': 'zh-CN,zh;q=0.9,ja;q=0.8',
    };
    if (this.cookie) h['Cookie'] = this.cookie;
    return h;
  }

  // 返回 json.body（pixiv ajax 约定 error:false + body）
  async getJson(url) {
    for (let attempt = 0; ; attempt++) {
      if (this.signal && this.signal.aborted) {
        throw new PixivError('network', '已取消', { url });
      }
      await this._acquire();
      let res = null;
      let netErr = null;
      try {
        await this._pace();
        res = await this._request(url);
      } catch (e) {
        netErr = e;
      }
      this._release();

      if (netErr || res.status >= 500) {
        if (this.signal && this.signal.aborted) {
          throw new PixivError('network', '已取消', { url });
        }
        if (attempt >= this.maxRetries) {
          throw new PixivError('network', `网络失败: ${netErr ? netErr.message : 'HTTP ' + res.status}`, { url });
        }
        const waitMs = [3000, 8000, 20000][Math.min(attempt, 2)];
        this.log(`网络错误(${netErr ? netErr.message : 'HTTP ' + res.status})，${waitMs / 1000}s 后重试: ${url}`);
        this._flipChannel();
        await sleep(waitMs, this.signal);
        continue;
      }
      if (res.status === 429 || res.status === 412) {
        if (attempt >= this.maxRetries) {
          throw new PixivError('rate', `触发限速(HTTP ${res.status})`, { status: res.status, url });
        }
        const waitMs = [15000, 60000, 300000][Math.min(attempt, 2)];
        this.log(`限速(HTTP ${res.status})，等待 ${waitMs / 1000}s 后重试`);
        await sleep(waitMs, this.signal);
        continue;
      }

      const json = res.json;
      if (res.status === 200 && json && json.error === false) {
        if (json.body == null) {
          throw new PixivError('api', '响应缺少 body（Pixiv 接口可能已改版）', { url });
        }
        return json.body;
      }
      const kind = classify(res.status, json);
      throw new PixivError(kind, (json && json.message) ? String(json.message) : `HTTP ${res.status}`, { status: res.status, url });
    }
  }

  _request(urlStr) {
    return this._useProxy ? this._viaProxy(urlStr) : this._direct(urlStr);
  }

  _direct(urlStr) {
    return new Promise((resolve, reject) => {
      const u = new URL(urlStr);
      const req = https.request({
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: 'GET',
        headers: this._headers(),
        timeout: this.timeoutMs,
        signal: this.signal || undefined,
      }, (res) => this._consume(res).then(resolve, reject));
      req.on('timeout', () => req.destroy(new Error('连接超时')));
      req.on('error', reject);
      req.end();
    });
  }

  // 经 HTTP 代理 CONNECT 隧道访问 443
  _viaProxy(urlStr) {
    const u = new URL(urlStr);
    const p = new URL(this.proxy);
    return new Promise((resolve, reject) => {
      const tunnel = http.request({
        host: p.hostname,
        port: Number(p.port) || 80,
        method: 'CONNECT',
        path: `${u.hostname}:443`,
        headers: { Host: `${u.hostname}:443` },
        timeout: this.timeoutMs,
        signal: this.signal || undefined,
      });
      tunnel.on('connect', (res, socket) => {
        if (res.statusCode !== 200) {
          socket.destroy();
          return reject(new Error(`代理 CONNECT 失败: HTTP ${res.statusCode}`));
        }
        if (this.signal && this.signal.aborted) {
          socket.destroy();
          return reject(new Error('已取消'));
        }
        const req = https.request({
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: 'GET',
          headers: this._headers(),
          socket,
          agent: false,
          timeout: this.timeoutMs,
          signal: this.signal || undefined,
        }, (r) => this._consume(r).then(resolve, reject));
        req.on('timeout', () => req.destroy(new Error('连接超时')));
        req.on('error', reject);
        req.end();
      });
      tunnel.on('timeout', () => tunnel.destroy(new Error('代理连接超时')));
      tunnel.on('error', reject);
      tunnel.end();
    });
  }

  _consume(res) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > 30 * 1024 * 1024) { res.destroy(); reject(new Error('响应超过 30MB，疑似异常')); return; }
        chunks.push(c);
      });
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const trimmed = text.trim();
        let json = null;
        const ct = String(res.headers['content-type'] || '');
        if (ct.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try { json = JSON.parse(trimmed); } catch (e) { json = null; }
        }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
      res.on('error', reject);
    });
  }
}

module.exports = { Fetcher, PixivError, UA, BASE, extractCookie, classify };
