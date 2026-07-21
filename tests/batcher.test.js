// 分批纯函数单测：node tests/batcher.test.js
const assert = require('assert');
const { makeBatches } = require('../lib/batcher.js');

// 空输入返回空数组
assert.deepStrictEqual(makeBatches([], 100, 10), []);

// 不超预算时合成一批
const small = [{ id: 0, text: 'aa' }, { id: 1, text: 'bb' }];
assert.strictEqual(makeBatches(small, 100, 10).length, 1);

// 超字符预算拆批
const chars = [
  { id: 0, text: 'x'.repeat(60) },
  { id: 1, text: 'y'.repeat(60) }
];
assert.strictEqual(makeBatches(chars, 100, 10).length, 2);

// 超单批条数上限拆批：7 条、每批最多 3 条 → 3 批
const many = [];
for (let i = 0; i < 7; i++) many.push({ id: i, text: 'a' });
assert.strictEqual(makeBatches(many, 1000, 3).length, 3);

// 单条超长文本独占一批，不丢弃
const big = [{ id: 0, text: 'z'.repeat(500) }, { id: 1, text: 'a' }];
const b = makeBatches(big, 100, 10);
assert.strictEqual(b.length, 2);
assert.strictEqual(b[0][0].text.length, 500);

console.log('batcher.test.js ✓ 全部通过');
