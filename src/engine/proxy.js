'use strict';

// HTTP 代理地址解析与鉴权头生成（零外部依赖，供 cool18 / Pixiv 共用）
const { URL } = require('url');

function configError(message) {
  const err = new Error(message);
  err.isConfigError = true;
  return err;
}

function parseProxy(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s) ? s : 'http://' + s;
  let u;
  try {
    u = new URL(normalized);
  } catch (e) {
    throw configError('无效的代理地址: ' + s);
  }
  if (u.protocol !== 'http:') throw configError('仅支持 HTTP 代理协议 (http://host:port): ' + s);
  if (!u.hostname) throw configError('无效的代理地址: ' + s);
  let port = 80;
  if (u.port !== '') {
    port = Number(u.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw configError('无效的代理端口: ' + s);
    }
  }
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
