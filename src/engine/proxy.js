'use strict';

// HTTP 代理地址解析与鉴权头生成（零外部依赖，供 cool18 / Pixiv 共用）
const { URL } = require('url');

function parseProxy(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s) ? s : 'http://' + s;
  const u = new URL(normalized);
  if (!u.hostname) throw new Error('无效的代理地址: ' + s);
  const port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
  let authHeader = '';
  if (u.username || u.password) {
    const user = decodeURIComponent(u.username || '');
    const pass = decodeURIComponent(u.password || '');
    authHeader = 'Basic ' + Buffer.from(user + ':' + pass, 'utf8').toString('base64');
  }
  return {
    protocol: u.protocol,
    host: u.hostname,
    port,
    authHeader,
  };
}

function connectHeaders(targetHostPort, proxyInfo) {
  const h = { Host: targetHostPort };
  if (proxyInfo && proxyInfo.authHeader) {
    h['Proxy-Authorization'] = proxyInfo.authHeader;
  }
  return h;
}

module.exports = { parseProxy, connectHeaders };
