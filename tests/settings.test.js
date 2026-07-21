const assert = require('assert');
const settings = require('../lib/settings.js');

const provider = settings.buildLocalProvider(8787, 'local-token');
assert.deepStrictEqual(provider, {
  id: 'local-responses-proxy',
  name: 'Local Responses Proxy',
  baseURL: 'http://127.0.0.1:8787/v1',
  apiKey: 'local-token',
  model: 'local-proxy'
});

assert.throws(function () { settings.validPort(0); }, /端口/);
assert.throws(function () { settings.validPort('abc'); }, /端口/);
assert.throws(function () { settings.buildLocalProvider(8787, ''); }, /令牌/);

const existing = [{ id: 'one', name: 'One' }];
const appended = settings.upsertProvider(existing, provider);
assert.strictEqual(appended.length, 2);
assert.strictEqual(existing.length, 1, '不应原地修改引擎数组');
const replaced = settings.upsertProvider(appended, Object.assign({}, provider, { apiKey: 'new-token' }));
assert.strictEqual(replaced.length, 2);
assert.strictEqual(replaced[1].apiKey, 'new-token');

assert.deepStrictEqual(settings.validateBackup({ providers: [], targetLang: 'English' }), {
  providers: [], targetLang: 'English'
});
assert.throws(function () { settings.validateBackup([]); }, /JSON 对象/);
assert.throws(function () { settings.validateBackup({ providers: {} }); }, /providers/);

console.log('settings tests passed');
