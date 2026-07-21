// AI Translate - 仅监听回环地址的 Responses API 本地转接代理
const crypto = require('crypto');
const http = require('http');
const { loadRuntimeConfig } = require('./config.js');
const { buildResponsesBody, extractOutputText, toChatCompletion } = require('./adapter.js');

const MAX_BODY_BYTES = 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 120000;

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function tokenMatches(header, expected) {
  const actual = String(header || '').replace(/^Bearer\s+/i, '');
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(String(expected || ''));
  return actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function allowOrigin(req, res) {
  const origin = String(req.headers.origin || '');
  if (!origin) return true;
  if (!origin.startsWith('chrome-extension://')) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Vary', 'Origin');
  return true;
}

function readJson(req) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体超过 1 MB'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (error) { reject(new Error('请求体不是有效 JSON')); }
    });
    req.on('error', reject);
  });
}

function createProxyServer(runtime, dependencies) {
  const fetchImpl = dependencies && dependencies.fetch ? dependencies.fetch : global.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('当前 Node.js 不支持 fetch，请使用 Node.js 18+');

  return http.createServer(async function (req, res) {
    if (!allowOrigin(req, res)) {
      sendJson(res, 403, { error: { message: '不允许的请求来源' } });
      return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { ok: true, protocol: 'responses', configured: true });
      return;
    }
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      sendJson(res, 404, { error: { message: 'Not Found' } });
      return;
    }
    if (!tokenMatches(req.headers.authorization, runtime.localToken)) {
      sendJson(res, 401, { error: { message: '本地代理令牌无效' } });
      return;
    }

    try {
      const chatBody = await readJson(req);
      const responsesBody = buildResponsesBody(chatBody, runtime);
      const controller = new AbortController();
      const timer = setTimeout(function () { controller.abort(); }, UPSTREAM_TIMEOUT_MS);
      let upstream;
      try {
        upstream = await fetchImpl(runtime.responsesUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + runtime.apiKey
          },
          body: JSON.stringify(responsesBody),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }
      const raw = await upstream.text();
      if (!upstream.ok) throw new Error('上游 API ' + upstream.status + ': ' + raw.slice(0, 300));
      const response = JSON.parse(raw);
      const content = extractOutputText(response);
      sendJson(res, 200, toChatCompletion(response, content));
    } catch (error) {
      const message = error && error.name === 'AbortError'
        ? '上游请求超时'
        : String((error && error.message) || error);
      sendJson(res, 502, { error: { message: message } });
    }
  });
}

function start() {
  const runtime = loadRuntimeConfig();
  const server = createProxyServer(runtime);
  server.listen(runtime.port, runtime.host, function () {
    console.log('AI Translate local proxy: http://' + runtime.host + ':' + runtime.port);
  });
}

if (require.main === module) {
  try { start(); }
  catch (error) {
    console.error('启动失败：' + String((error && error.message) || error));
    process.exitCode = 1;
  }
}

module.exports = { createProxyServer, tokenMatches };
