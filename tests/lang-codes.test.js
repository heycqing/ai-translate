// 语言码映射单测：node tests/lang-codes.test.js
const assert = require('assert');
const L = require('../lib/lang-codes.js');

assert.strictEqual(L.toGoogleLang('简体中文'), 'zh-CN');
assert.strictEqual(L.toGoogleLang('English'), 'en');
assert.strictEqual(L.toGoogleLang('日本語'), 'ja');
// 未知语言回退中文
assert.strictEqual(L.toGoogleLang('Klingon'), 'zh-CN');
assert.strictEqual(L.toGoogleLang(undefined), 'zh-CN');

console.log('lang-codes.test.js ✓ 全部通过');
