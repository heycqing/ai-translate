// 输入框翻译 content script 测试：node tests/input-translate.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Editable = require('../lib/editable.js');
const CollectRules = require('../lib/collect-rules.js');

class FakeTextArea {
  constructor(value) {
    this.tagName = 'TEXTAREA';
    this._value = value;
    this.disabled = false;
    this.readOnly = false;
    this.isConnected = true;
    this.events = [];
    this.focused = false;
  }

  setSelectionRange(start, end) { this.selection = [start, end]; }
  dispatchEvent(event) { this.events.push(event.type); return true; }
  focus() { this.focused = true; }
}

Object.defineProperty(FakeTextArea.prototype, 'value', {
  get: function () { return this._value; },
  set: function (value) { this._value = value; }
});

class FakeInput extends FakeTextArea {
  constructor(value, type) {
    super(value);
    this.tagName = 'INPUT';
    this.type = type;
  }
}

Object.defineProperty(FakeInput.prototype, 'value', {
  get: function () { return this._value; },
  set: function (value) { this._value = value; }
});

class FakeEvent {
  constructor(type) { this.type = type; }
}

async function run() {
  const textarea = new FakeTextArea('你好，世界');
  const document = {
    activeElement: textarea,
    body: { appendChild: function () {} },
    createElement: function () { return { className: '', textContent: '', hidden: false }; }
  };
  let listener = null;
  let sendMessage = async function () {
    return { ok: true, translations: ['Hello, world'], degraded: '' };
  };
  const self = { AITEditable: Editable, AITCollectRules: CollectRules };
  const context = {
    self: self,
    document: document,
    chrome: {
      runtime: {
        onMessage: { addListener: function (fn) { listener = fn; } },
        sendMessage: function (msg) { return sendMessage(msg); }
      }
    },
    HTMLInputElement: FakeInput,
    HTMLTextAreaElement: FakeTextArea,
    InputEvent: FakeEvent,
    Event: FakeEvent,
    setTimeout: function () { return 1; },
    clearTimeout: function () {}
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../content/input-translate.js'), 'utf8'),
    context
  );

  assert.ok(listener, 'content script 应注册消息监听器');
  await self.AITInput.translateActiveInput();
  assert.strictEqual(textarea.value, 'Hello, world');
  assert.deepStrictEqual(textarea.selection, [12, 12]);
  assert.deepStrictEqual(textarea.events, ['input', 'change']);
  assert.ok(textarea.focused);

  // 请求期间用户继续输入时，不用旧请求结果覆盖新内容。
  textarea.value = '第二次翻译';
  textarea.events = [];
  let resolveRequest;
  sendMessage = function () {
    return new Promise(function (resolve) { resolveRequest = resolve; });
  };
  const pending = self.AITInput.translateActiveInput();
  textarea.value = '用户刚刚输入的新内容';
  resolveRequest({ ok: true, translations: ['Stale translation'], degraded: '' });
  await pending;
  assert.strictEqual(textarea.value, '用户刚刚输入的新内容');
  assert.deepStrictEqual(textarea.events, []);

  // 密码框不发送翻译请求。
  let requestCount = 0;
  document.activeElement = new FakeInput('secret text', 'password');
  sendMessage = async function () { requestCount += 1; return { ok: true, translations: ['x'] }; };
  await self.AITInput.translateActiveInput();
  assert.strictEqual(requestCount, 0);

  console.log('input-translate.test.js ✓ 全部通过');
}

run().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
