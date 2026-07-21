const assert = require('assert');
const { parseCodexToml, loadRuntimeConfig } = require('../local-proxy/config.js');

const toml = [
  'model_provider = "private-provider"',
  'model = "private-model"',
  '',
  '[model_providers.private-provider]',
  'base_url = "https://provider.example/v1"',
  'wire_api = "responses"',
  'env_key = "PRIVATE_PROVIDER_KEY"'
].join('\n');

const parsed = parseCodexToml(toml, { PRIVATE_PROVIDER_KEY: 'upstream-secret' });
assert.deepStrictEqual(parsed, {
  baseUrl: 'https://provider.example/v1',
  model: 'private-model',
  apiKey: 'upstream-secret'
});

const runtime = loadRuntimeConfig({
  env: {
    PRIVATE_PROVIDER_KEY: 'upstream-secret',
    AI_TRANSLATE_PROXY_TOKEN: 'local-secret',
    AI_TRANSLATE_CODEX_CONFIG: 'virtual.toml'
  },
  argv: [],
  readFile: function () { return toml; }
});
assert.strictEqual(runtime.host, '127.0.0.1');
assert.strictEqual(runtime.port, 8787);
assert.strictEqual(runtime.responsesUrl, 'https://provider.example/v1/responses');
assert.strictEqual(runtime.model, 'private-model');
assert.strictEqual(runtime.apiKey, 'upstream-secret');

assert.throws(function () {
  parseCodexToml(toml.replace('wire_api = "responses"', 'wire_api = "chat"'), {
    PRIVATE_PROVIDER_KEY: 'x'
  });
}, /wire_api/);

assert.throws(function () {
  parseCodexToml(toml, {});
}, /密钥环境变量/);

console.log('local-proxy-config.test.js ✓ 全部通过');
