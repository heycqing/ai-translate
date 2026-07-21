const assert = require('assert');
const {
  buildResponsesBody,
  extractOutputText,
  toChatCompletion
} = require('../local-proxy/adapter.js');

const body = buildResponsesBody({
  messages: [
    { role: 'system', content: '只返回 JSON。' },
    { role: 'user', content: '["hello"]' }
  ]
}, { model: 'runtime-model', reasoningEffort: 'low' });

assert.deepStrictEqual(body, {
  model: 'runtime-model',
  input: [{ role: 'user', content: '["hello"]' }],
  store: false,
  instructions: '只返回 JSON。',
  reasoning: { effort: 'low' }
});

assert.strictEqual(extractOutputText({ output_text: '["你好"]' }), '["你好"]');
assert.strictEqual(extractOutputText({
  output: [{ type: 'message', content: [{ type: 'output_text', text: '["你好"]' }] }]
}), '["你好"]');
assert.throws(function () { extractOutputText({ output: [] }); }, /未返回文本/);

const chat = toChatCompletion({ id: 'resp_1' }, '["你好"]');
assert.strictEqual(chat.id, 'resp_1');
assert.strictEqual(chat.choices[0].message.content, '["你好"]');

console.log('local-proxy-adapter.test.js ✓ 全部通过');
