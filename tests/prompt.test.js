// prompt 组装/解析单测：node tests/prompt.test.js
const assert = require('assert');
const P = require('../lib/prompt.js');

// buildMessages 组装 system + user
const msgs = P.buildMessages(['Hello'], '简体中文');
assert.strictEqual(msgs.length, 2);
assert.strictEqual(msgs[0].role, 'system');
assert.ok(msgs[0].content.indexOf('简体中文') !== -1);
assert.deepStrictEqual(JSON.parse(msgs[1].content), ['Hello']);

// 自定义 systemPrompt 覆盖默认，{targetLang} 被替换
const custom = P.buildMessages(['Hi'], 'English', '翻成{targetLang}');
assert.strictEqual(custom[0].content, '翻成English');

// 纯 JSON 数组
assert.deepStrictEqual(P.parseTranslations('["你好"]', 1), ['你好']);

// 带 code fence
assert.deepStrictEqual(P.parseTranslations('```json\n["你好"]\n```', 1), ['你好']);

// 前后夹杂废话也能取出数组
assert.deepStrictEqual(P.parseTranslations('好的，翻译如下：["你好"] 完毕', 1), ['你好']);

// 数量不匹配抛错
assert.throws(() => P.parseTranslations('["a","b"]', 1), /数量不匹配/);

// 空响应抛错
assert.throws(() => P.parseTranslations(null, 1), /为空/);

console.log('prompt.test.js ✓ 全部通过');
