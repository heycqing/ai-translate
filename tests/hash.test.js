// 缓存键单测：node tests/hash.test.js
const assert = require('assert');
const H = require('../lib/hash.js');

// 同输入同输出（确定性）
assert.strictEqual(H.fnv1a('hello'), H.fnv1a('hello'));
// 不同输入不同输出（抽查两对）
assert.notStrictEqual(H.fnv1a('hello'), H.fnv1a('hellp'));
assert.notStrictEqual(H.fnv1a('你好'), H.fnv1a('您好'));
// 输出格式：8 位十六进制
assert.ok(/^[0-9a-f]{8}$/.test(H.fnv1a('anything')));

// 缓存键包含语言与模型，三要素任一变化 key 就变化
const k = H.makeCacheKey('Hello', '简体中文', 'deepseek-chat');
assert.ok(k.indexOf('简体中文') !== -1 && k.indexOf('deepseek-chat') !== -1);
assert.notStrictEqual(k, H.makeCacheKey('Hello', 'English', 'deepseek-chat'));
assert.notStrictEqual(k, H.makeCacheKey('Hello', '简体中文', 'google-free'));
assert.notStrictEqual(k, H.makeCacheKey('Hello!', '简体中文', 'deepseek-chat'));

console.log('hash.test.js ✓ 全部通过');
