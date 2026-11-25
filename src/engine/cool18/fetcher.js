'use strict';

// cool18 HTTP 层: node:https 直连 + 可选 CONNECT 代理隧道; 重试 + 解码
// cool18 在本机需走代理（默认 http://127.0.0.1:7897），代理直连均可配置

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { decodePage } = require('./parse');
const { parseProxy, connectHeaders } = require('../proxy');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// 可中断 sleep：取消时立即 reject，重试退避不阻塞“取消”
const { sleep } = require('../async');

function headers() {
  return { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*' };
}

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

// 返回原始 Buffer（解码交给 parse.decodePage，便于离线测试；自动跟随最多 5 次重定向）
function requestBuffer(urlStr, { proxy, timeoutMs, signal }, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      return reject(new Error('不支持的协议: ' + u.protocol));
    }
    const isHttps = u.protocol === 'https:';
    const defaultPort = isHttps ? 443 : 80;
    const targetPort = Number(u.port) || defaultPort;
    const base = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: headers(),
      timeout: timeoutMs,
      signal,
    };
    const bind = (req) => {
      req.on('timeout', () => req.destroy(new Error('连接超时')));
      req.on('error', reject);
    };
    const onRes = (res) => {
      if (REDIRECT_CODES.has(res.statusCode) && res.headers && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) {
          reject(new Error('重定向次数过多'));
          return;
        }
        let nextUrl;
        try { nextUrl = new URL(res.headers.location, urlStr).toString(); }
        catch (e) { reject(new Error('无效的重定向地址')); return; }
        requestBuffer(nextUrl, { proxy, timeoutMs, signal }, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error('HTTP ' + res.statusCode));
        return;
      }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > 30 * 1024 * 1024) {
          res.destroy();
          reject(new Error('响应超过 30MB，疑似异常'));
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    };

    const proxyInfo = parseProxy(proxy);
    if (proxyInfo) {
      const targetHostPort = u.hostname + ':' + targetPort;
      if (!isHttps) {
        const reqHeaders = Object.assign({}, headers(), { Host: u.host });
        if (proxyInfo.authHeader) reqHeaders['Proxy-Authorization'] = proxyInfo.authHeader;
        const req = http.request({
          host: proxyInfo.host,
          port: proxyInfo.port,
          method: 'GET',
          path: urlStr,
          headers: reqHeaders,
          timeout: timeoutMs,
          signal,
        }, onRes);
        bind(req);
        req.end();
        return;
      }
      const tunnel = http.request({
        host: proxyInfo.host,
        port: proxyInfo.port,
        method: 'CONNECT',
        path: targetHostPort,
        headers: connectHeaders(targetHostPort, proxyInfo),
        timeout: timeoutMs,
        signal,
      });
      tunnel.on('connect', (res, socket) => {
        if (res.statusCode !== 200) {
          socket.destroy();
          return reject(new Error('代理 CONNECT 失败: HTTP ' + res.statusCode));
        }
        if (signal && signal.aborted) {
          socket.destroy();
          return reject(new Error('已取消'));
        }
        const req = https.request(Object.assign(base, { socket, agent: false }), onRes);
        bind(req);
        req.end();
      });
      tunnel.on('timeout', () => tunnel.destroy(new Error('代理连接超时')));
      tunnel.on('error', reject);
      tunnel.end();
    } else {
      const transport = isHttps ? https : http;
      const req = transport.request(Object.assign(base, { port: targetPort }), onRes);
      bind(req);
      req.end();
    }
  });
}

// 带 retries 的抓取 → 解码后的页面文本; 取消时抛出含"已取消"的 Error
async function fetchPage(url, opts = {}) {
  const retries = opts.retries === undefined ? 4 : Math.max(1, Number(opts.retries) || 4);
  const signal = opts.signal;
  const log = opts.log || (() => {});
  let lastErr = null;
  for (let i = 0; i < retries; i++) {
    if (signal && signal.aborted) {
      throw new Error('已取消');
    }
    try {
      const buf = await requestBuffer(url, {
        proxy: opts.proxy || '',
        timeoutMs: opts.timeoutMs || 40000,
        signal,
      });
      return decodePage(buf);
    } catch (e) {
      if (signal && signal.aborted) {
        throw new Error('已取消');
      }
      lastErr = e;
      if (i >= retries - 1) { break; }
      // 指数退避 + 抖动：1s、2s、4s… 避免固定节奏撞限速
      const waitMs = Math.min(10000, 1000 * Math.pow(2, i)) + Math.floor(Math.random() * 400);
      log('抓取失败(第' + (i + 1) + '次) ' + url + ': ' + e.message + '，' + (waitMs / 1000).toFixed(1) + 's 后重试');
      await sleep(waitMs, signal);
    }
  }
  throw new Error('抓取失败 ' + url + ': ' + (lastErr ? lastErr.message : '未知错误'));
}

module.exports = { fetchPage, UA };
