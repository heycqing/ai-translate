// 段落判定规则单测：node tests/collect-rules.test.js
const assert = require('assert');
const R = require('../lib/collect-rules.js');

// 正常英文/中文可翻译
assert.ok(R.isTranslatableText('Hello world'));
assert.ok(R.isTranslatableText('你好，世界'));

// 空、纯空白、纯数字、纯符号、单字符都跳过
assert.ok(!R.isTranslatableText(''));
assert.ok(!R.isTranslatableText('   '));
assert.ok(!R.isTranslatableText('42'));
assert.ok(!R.isTranslatableText('→ • ▸'));
assert.ok(!R.isTranslatableText('x'));

// 标签清单与选择器
assert.ok(R.BLOCK_TAGS.indexOf('P') !== -1);
assert.ok(R.SKIP_TAGS.indexOf('CODE') !== -1);
assert.ok(R.BLOCK_SELECTOR.indexOf('p') !== -1);
assert.strictEqual(R.BLOCK_SELECTOR, R.BLOCK_SELECTOR.toLowerCase());

console.log('collect-rules.test.js ✓ 全部通过');
