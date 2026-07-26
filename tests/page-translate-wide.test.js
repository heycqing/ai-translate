// 广覆盖翻译链路集成测试：node tests/page-translate-wide.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  FakeDocument,
  FakeText,
  NodeFilter,
  append
} = require('./wide-dom-collector.test.js');

function getComputedStyleFor(el) {
  const inlineTags = ['A', 'SPAN', 'STRONG', 'EM', 'SMALL'];
  return {
    display: el.style.display || (el.hidden
      ? 'none'
      : (inlineTags.indexOf(el.tagName) !== -1 ? 'inline' : 'block')),
    visibility: el.style.visibility || 'visible',
    opacity: el.style.opacity === undefined ? '1' : String(el.style.opacity)
  };
}

function loadPageRuntime(document, translateHandler) {
  const listeners = [];
  const requests = [];
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {}
    disconnect() {}
  }

  const chrome = {
    runtime: {
      onMessage: {
        addListener: function (listener) { listeners.push(listener); }
      },
      sendMessage: async function (message) {
        if (message.type === 'translate') {
          requests.push(message.texts.slice());
          return translateHandler(message.texts);
        }
        if (message.type === 'get-page-translation-state') return { active: false };
        return { ok: true };
      }
    }
  };
  const context = {
    console,
    document,
    chrome,
    NodeFilter,
    MutationObserver: FakeMutationObserver,
    setTimeout,
    clearTimeout,
    self: {}
  };
  context.self.document = document;
  context.self.NodeFilter = NodeFilter;
  context.self.getComputedStyle = getComputedStyleFor;
  document.defaultView = context.self;
  vm.createContext(context);
  [
    '../lib/batcher.js',
    '../lib/collect-rules.js',
    '../content/collector.js',
    '../content/page-translate.js'
  ].forEach(function (relativePath) {
    const filename = path.join(__dirname, relativePath);
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  });
  return { context, requests, listeners };
}

function translationsIn(root) {
  return root.querySelectorAll('.ait-translation');
}

async function runCompletedTranslationTest() {
  const document = new FakeDocument();
  const footer = append(document.body, 'footer');
  const footerCopy = append(footer, 'div', 'Footer notice');
  append(document.body, 'div', 'Footer notice'); // 同文多处应只请求一次
  const input = append(document.body, 'input', null, { placeholder: 'Search articles' });
  const host = append(document.body, 'article');
  const shadow = host.attachShadow({ mode: 'open' });
  const shadowCopy = append(shadow, 'div', 'Shadow notice');

  const runtime = loadPageRuntime(document, async function (texts) {
    return {
      ok: true,
      translations: texts.map(function (text) { return '译：' + text; })
    };
  });
  await runtime.context.self.AITPage.translatePage();

  assert.strictEqual(translationsIn(footerCopy).length, 1, 'footer 应插入译文');
  assert.strictEqual(translationsIn(shadowCopy).length, 1, 'open Shadow DOM 应插入译文');
  assert.strictEqual(
    input.getAttribute('placeholder'),
    'Search articles / 译：Search articles',
    'placeholder 应原位双语'
  );
  const requestedTexts = runtime.requests.flat();
  assert.strictEqual(
    requestedTexts.filter(function (text) { return text === 'Footer notice'; }).length,
    1,
    '同一原文在一轮内只请求一次'
  );
  translationsIn(document.body).concat(translationsIn(shadow)).forEach(function (node) {
    assert.strictEqual(node.getAttribute('aria-hidden'), 'true', '视觉译文不应被读屏重复朗读');
  });

  runtime.context.self.AITPage.restorePage();
  assert.strictEqual(translationsIn(document.body).length, 0, '正文译文应还原');
  assert.strictEqual(translationsIn(shadow).length, 0, 'Shadow DOM 译文应还原');
  assert.strictEqual(input.getAttribute('placeholder'), 'Search articles', 'placeholder 应精确还原');
}

async function runCancellationTest() {
  const document = new FakeDocument();
  const copy = append(document.body, 'div', 'Slow response');
  let resolveTranslation;
  const deferred = new Promise(function (resolve) { resolveTranslation = resolve; });
  const runtime = loadPageRuntime(document, function () { return deferred; });
  const translating = runtime.context.self.AITPage.translatePage();
  runtime.context.self.AITPage.restorePage();
  resolveTranslation({ ok: true, translations: ['迟到的译文'] });
  await translating;
  assert.strictEqual(translationsIn(copy).length, 0, '还原后迟到的请求结果不得重新写回');
  assert.strictEqual(runtime.context.self.AITPage.isTranslated(), false, '取消后应保持原文状态');
}

(async function () {
  await runCompletedTranslationTest();
  await runCancellationTest();
  console.log('page-translate-wide.test.js ✓ 全部通过');
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
