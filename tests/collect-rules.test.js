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

// 弹窗支持：识别语义化 dialog、原生 popover 和常见组件类名，
// 并允许收集弹窗内的 UI 文本标签。
assert.ok(R.POPUP_ROOT_SELECTOR.indexOf('[role="dialog"]') !== -1);
assert.ok(R.POPUP_ROOT_SELECTOR.indexOf('[role="alertdialog"]') !== -1);
assert.ok(R.POPUP_ROOT_SELECTOR.indexOf('[popover]') !== -1);
assert.ok(R.POPUP_ROOT_SELECTOR.indexOf('modal') !== -1);
assert.ok(R.POPUP_TEXT_TAGS.indexOf('DIV') !== -1);
assert.ok(R.POPUP_TEXT_TAGS.indexOf('BUTTON') !== -1);
assert.ok(R.POPUP_CANDIDATE_SELECTOR.indexOf('p') !== -1);
assert.ok(R.POPUP_CANDIDATE_SELECTOR.indexOf('button') !== -1);

// 固定高度 UI 使用紧凑译文，避免导航和表单浮动标签被块级译文撑坏。
assert.ok(R.COMPACT_TRANSLATION_SELECTOR.indexOf('nav') !== -1);
assert.ok(R.COMPACT_TRANSLATION_SELECTOR.indexOf('label') !== -1);
assert.ok(R.COMPACT_TRANSLATION_SELECTOR.indexOf('[role="combobox"]') !== -1);
assert.ok(R.COMPACT_TRANSLATION_SELECTOR.indexOf('globalnav') !== -1);

console.log('collect-rules.test.js ✓ 全部通过');
