// 输入框识别规则单测：node tests/editable.test.js
const assert = require('assert');
const E = require('../lib/editable.js');

assert.ok(E.isSupportedInputType('text'));
assert.ok(E.isSupportedInputType('EMAIL'));
assert.ok(!E.isSupportedInputType('password'));
assert.ok(!E.isSupportedInputType('file'));

assert.ok(E.isEditableElement({ tagName: 'INPUT', type: 'text' }));
assert.ok(E.isEditableElement({ tagName: 'TEXTAREA' }));
assert.ok(E.isEditableElement({ tagName: 'DIV', isContentEditable: true }));
assert.ok(!E.isEditableElement({ tagName: 'INPUT', type: 'password' }));
assert.ok(!E.isEditableElement({ tagName: 'INPUT', type: 'text', readOnly: true }));
assert.ok(!E.isEditableElement({ tagName: 'TEXTAREA', disabled: true }));

assert.strictEqual(E.getText({ tagName: 'INPUT', value: 'hello' }), 'hello');
assert.strictEqual(E.getText({ tagName: 'DIV', innerText: '你好' }), '你好');

console.log('editable.test.js ✓ 全部通过');
