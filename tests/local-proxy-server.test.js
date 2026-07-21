const assert = require('assert');
const { createProxyServer } = require('../local-proxy/server.js');

async function run() {
  let upstreamRequest = null;
  const runtime = {
    localToken: 'local-secret',
    apiKey: 'upstream-secret',
    responsesUrl: 'https://provider.example/responses',
    model: 'runtime-model',
    reasoningEffort: ''
  };
  const server = createProxyServer(runtime, {
    fetch: async function (url, options) {
      upstreamRequest = { url: url, options: options };
      return {
        ok: true,
        status: 200,
        text: async function () {
          return JSON.stringify({ id: 'resp_test', output_text: '["你好"]' });
        }
      };
    }
  });
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  const url = 'http://127.0.0.1:' + address.port;
  try {
    const unauthorized = await fetch(url + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] })
    });
    assert.strictEqual(unauthorized.status, 401);

    const response = await fetch(url + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer local-secret',
        'Origin': 'chrome-extension://test-extension'
      },
      body: JSON.stringify({
        model: 'ignored-client-model',
        messages: [
          { role: 'system', content: 'translate' },
          { role: 'user', content: '["hello"]' }
        ]
      })
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('access-control-allow-origin'), 'chrome-extension://test-extension');
    const json = await response.json();
    assert.strictEqual(json.choices[0].message.content, '["你好"]');
    assert.strictEqual(upstreamRequest.url, runtime.responsesUrl);
    assert.strictEqual(upstreamRequest.options.headers.Authorization, 'Bearer upstream-secret');
    const upstreamBody = JSON.parse(upstreamRequest.options.body);
    assert.strictEqual(upstreamBody.model, 'runtime-model');
    assert.strictEqual(upstreamBody.instructions, 'translate');

    const forbidden = await fetch(url + '/health', {
      headers: { Origin: 'https://untrusted.example' }
    });
    assert.strictEqual(forbidden.status, 403);
  } finally {
    await new Promise(function (resolve, reject) {
      server.close(function (error) { if (error) reject(error); else resolve(); });
    });
  }
  console.log('local-proxy-server.test.js ✓ 全部通过');
}

run().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
