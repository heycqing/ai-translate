// 译文视觉标识回归：node tests/styles.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../content/styles.css'), 'utf8');
const compactRule = css.match(
  /\.ait-translation\.ait-translation-compact\s*\{([\s\S]*?)\}/
);

assert.ok(compactRule, '应存在紧凑译文样式');
assert.match(compactRule[1], /display:\s*inline\s*!important/);
assert.match(compactRule[1], /text-decoration-line:\s*underline/);
assert.match(compactRule[1], /text-decoration-style:\s*dashed/);
assert.match(compactRule[1], /text-underline-offset:\s*2px/);

console.log('styles.test.js ✓ 全部通过');
