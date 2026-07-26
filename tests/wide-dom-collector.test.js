// 广覆盖 DOM 收集行为测试：node tests/wide-dom-collector.test.js
// 不依赖 jsdom；用最小 DOM harness 运行真实 collect-rules.js / collector.js。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const NodeFilter = {
  SHOW_ELEMENT: 0x1,
  SHOW_TEXT: 0x4,
  FILTER_ACCEPT: 1,
  FILTER_REJECT: 2,
  FILTER_SKIP: 3
};

function splitSelectors(selector) {
  return String(selector || '').split(',').map(function (part) {
    return part.trim();
  }).filter(Boolean);
}

function matchesSimpleSelector(el, selector) {
  if (!el || el.nodeType !== 1) return false;
  if (selector === '*') return true;

  const classMatch = selector.match(/^\.([A-Za-z0-9_-]+)$/);
  if (classMatch) return el.classList.contains(classMatch[1]);

  const attrMatch = selector.match(
    /^\[([A-Za-z0-9_:-]+)(?:(\*?=)"([^"]*)"(?:\s+i)?)?\]$/i
  );
  if (attrMatch) {
    const actual = el.getAttribute(attrMatch[1]);
    if (actual === null) return false;
    if (!attrMatch[2]) return true;
    if (attrMatch[2] === '=') return actual === attrMatch[3];
    return actual.toLowerCase().indexOf(attrMatch[3].toLowerCase()) !== -1;
  }

  return String(el.localName || el.tagName).toLowerCase() === selector.toLowerCase();
}

class FakeNode {
  constructor(nodeType, ownerDocument) {
    this.nodeType = nodeType;
    this.ownerDocument = ownerDocument || null;
    this.parentNode = null;
  }

  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }

  getRootNode() {
    let current = this;
    while (current.parentNode) current = current.parentNode;
    return current;
  }
}

class FakeText extends FakeNode {
  constructor(text, ownerDocument) {
    super(3, ownerDocument);
    this.data = String(text);
  }

  get textContent() {
    return this.data;
  }

  set textContent(value) {
    this.data = String(value);
  }
}

class FakeClassList {
  constructor(el) {
    this.el = el;
  }

  contains(name) {
    return this.el.className.split(/\s+/).filter(Boolean).indexOf(name) !== -1;
  }
}

class FakeElement extends FakeNode {
  constructor(tagName, ownerDocument, options) {
    super(1, ownerDocument);
    const opts = options || {};
    this.tagName = String(tagName).toUpperCase();
    this.nodeName = this.tagName;
    this.localName = String(tagName).toLowerCase();
    this.childNodes = [];
    this.dataset = {};
    this.className = '';
    this.classList = new FakeClassList(this);
    this.shadowRoot = null;
    this.isContentEditable = false;
    this.hidden = false;
    this.style = {};
    this._attributes = Object.create(null);
    this._visible = opts.visible !== false;
  }

  get children() {
    return this.childNodes.filter(function (node) { return node.nodeType === 1; });
  }

  appendChild(node) {
    node.parentNode = this;
    node.ownerDocument = this.ownerDocument;
    this.childNodes.push(node);
    return node;
  }

  remove() {
    if (!this.parentNode || !this.parentNode.childNodes) return;
    const index = this.parentNode.childNodes.indexOf(this);
    if (index !== -1) this.parentNode.childNodes.splice(index, 1);
    this.parentNode = null;
  }

  addEventListener() {}

  setAttribute(name, value) {
    const key = String(name).toLowerCase();
    const stringValue = String(value);
    this._attributes[key] = stringValue;
    if (key === 'class') this.className = stringValue;
    if (key === 'hidden') this.hidden = true;
    if (key.indexOf('data-') === 0) {
      const dataKey = key.slice(5).replace(/-([a-z])/g, function (_, letter) {
        return letter.toUpperCase();
      });
      this.dataset[dataKey] = stringValue;
    }
  }

  getAttribute(name) {
    const key = String(name).toLowerCase();
    if (key === 'class' && this.className) return this.className;
    if (key.indexOf('data-') === 0) {
      const dataKey = key.slice(5).replace(/-([a-z])/g, function (_, letter) {
        return letter.toUpperCase();
      });
      if (Object.prototype.hasOwnProperty.call(this.dataset, dataKey)) {
        return String(this.dataset[dataKey]);
      }
    }
    return Object.prototype.hasOwnProperty.call(this._attributes, key)
      ? this._attributes[key]
      : null;
  }

  hasAttribute(name) {
    return this.getAttribute(name) !== null;
  }

  matches(selector) {
    return splitSelectors(selector).some(matchesSimpleSelector.bind(null, this));
  }

  closest(selector) {
    let current = this;
    while (current && current.nodeType === 1) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    function visit(node) {
      node.childNodes.forEach(function (child) {
        if (child.nodeType !== 1) return;
        if (child.matches(selector)) matches.push(child);
        visit(child);
      });
    }
    visit(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  getClientRects() {
    let current = this;
    while (current && current.nodeType === 1) {
      if (!current._visible || current.hidden || current.style.display === 'none' ||
        current.style.visibility === 'hidden') return [];
      current = current.parentElement;
    }
    return [{ width: 100, height: 20 }];
  }

  get textContent() {
    return this.childNodes.map(function (node) { return node.textContent; }).join('');
  }

  set textContent(value) {
    this.childNodes = [];
    if (value !== '') this.appendChild(new FakeText(value, this.ownerDocument));
  }

  get innerText() {
    return this.textContent;
  }

  attachShadow() {
    const root = new FakeShadowRoot(this.ownerDocument, this);
    this.shadowRoot = root;
    return root;
  }
}

class FakeShadowRoot extends FakeNode {
  constructor(ownerDocument, host) {
    super(11, ownerDocument);
    this.host = host;
    this.childNodes = [];
  }

  appendChild(node) {
    node.parentNode = this;
    node.ownerDocument = this.ownerDocument;
    this.childNodes.push(node);
    return node;
  }

  querySelectorAll(selector) {
    const shell = new FakeElement('shadow-shell', this.ownerDocument);
    shell.childNodes = this.childNodes;
    return shell.querySelectorAll(selector);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

class FakeDocument extends FakeNode {
  constructor() {
    super(9, null);
    this.ownerDocument = this;
    this.body = new FakeElement('body', this);
    this.body.parentNode = this;
    this.childNodes = [this.body];
    this.defaultView = null;
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  createElementNS(_namespace, tagName) {
    return new FakeElement(tagName, this);
  }

  createTextNode(text) {
    return new FakeText(text, this);
  }

  createTreeWalker(root, whatToShow, filter) {
    const accepted = [];
    const acceptNode = typeof filter === 'function' ? filter : filter.acceptNode.bind(filter);
    function visit(parent) {
      (parent.childNodes || []).forEach(function (node) {
        const shown = (node.nodeType === 1 && (whatToShow & NodeFilter.SHOW_ELEMENT)) ||
          (node.nodeType === 3 && (whatToShow & NodeFilter.SHOW_TEXT));
        const decision = shown ? acceptNode(node) : NodeFilter.FILTER_SKIP;
        if (decision === NodeFilter.FILTER_REJECT) return;
        if (decision === NodeFilter.FILTER_ACCEPT) accepted.push(node);
        visit(node);
      });
    }
    visit(root);
    let index = 0;
    return {
      nextNode: function () {
        return accepted[index++] || null;
      }
    };
  }

  querySelectorAll(selector) {
    const all = [];
    if (this.body.matches(selector)) all.push(this.body);
    return all.concat(this.body.querySelectorAll(selector));
  }
}

function append(parent, tagName, text, attrs, options) {
  const doc = parent.ownerDocument;
  const el = new FakeElement(tagName, doc, options);
  Object.keys(attrs || {}).forEach(function (name) {
    el.setAttribute(name, attrs[name]);
  });
  if (text !== undefined && text !== null) el.appendChild(new FakeText(text, doc));
  parent.appendChild(el);
  return el;
}

function loadCollector(document) {
  const Node = {
    ELEMENT_NODE: 1,
    TEXT_NODE: 3,
    DOCUMENT_NODE: 9,
    DOCUMENT_FRAGMENT_NODE: 11
  };
  const context = {
    console,
    document,
    Node,
    NodeFilter,
    self: {},
    getComputedStyle: function (el) {
      const inlineTags = ['A', 'SPAN', 'STRONG', 'EM', 'SMALL'];
      return {
        display: el.style.display || (el.hidden
          ? 'none'
          : (inlineTags.indexOf(el.tagName) !== -1 ? 'inline' : 'block')),
        visibility: el.style.visibility || 'visible',
        opacity: el.style.opacity === undefined ? '1' : String(el.style.opacity)
      };
    }
  };
  context.self.document = document;
  context.self.Node = Node;
  context.self.NodeFilter = NodeFilter;
  context.self.getComputedStyle = context.getComputedStyle;
  document.defaultView = context.self;
  vm.createContext(context);
  ['../lib/collect-rules.js', '../content/collector.js'].forEach(function (relativePath) {
    const filename = path.join(__dirname, relativePath);
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  });
  return context.self.AITCollector;
}

function normalizeItem(item) {
  const element = item && item.nodeType === 1
    ? item
    : item && (item.element || item.el || item.node || item.target);
  const attribute = item && (item.attribute || item.attributeName || item.attr || null);
  let text = item && typeof item.text === 'string' ? item.text : '';
  if (!text && attribute && element) text = element.getAttribute(attribute) || '';
  if (!text && element) text = element.innerText || element.textContent || '';
  return {
    raw: item,
    element,
    attribute,
    kind: item && item.kind ? item.kind : (attribute ? 'attribute' : 'text'),
    text: String(text).trim()
  };
}

function collectFixture() {
  const document = new FakeDocument();
  const body = document.body;

  const footer = append(body, 'footer');
  const footerText = append(footer, 'div', 'Footer legal notice');
  const ordinaryDiv = append(body, 'div', 'Ordinary division copy');
  const ordinarySpan = append(body, 'span', 'Standalone span copy');
  const ordinaryLink = append(body, 'a', 'Read documentation');
  const ordinaryButton = append(body, 'button', 'Save changes');

  const nestedParent = append(body, 'div');
  const nestedChild = append(nestedParent, 'span', 'Nested leaf copy');
  const mixedInline = append(body, 'div', 'Hello ');
  append(mixedInline, 'strong', 'world');

  const hiddenByRects = append(body, 'div', 'Hidden by layout', {}, { visible: false });
  const hiddenByAttribute = append(body, 'div', 'Hidden by attribute', { hidden: '' });
  const hiddenByStyle = append(body, 'div', 'Hidden by style');
  hiddenByStyle.style.display = 'none';
  const hiddenAncestor = append(body, 'section');
  hiddenAncestor.style.display = 'none';
  const hiddenDescendant = append(hiddenAncestor, 'span', 'Hidden below ancestor');

  const svg = append(body, 'svg');
  const svgText = append(svg, 'text', 'SVG chart label');
  // 浏览器中的 SVGElement.tagName 保留小写；避免 HTML 测试桩掩盖命名空间判断错误。
  svg.tagName = 'svg';
  svg.nodeName = 'svg';
  svgText.tagName = 'text';
  svgText.nodeName = 'text';

  const ariaLabel = append(body, 'div', null, { 'aria-label': 'Accessible control label' });
  const titled = append(body, 'div', null, { title: 'Tooltip explanation' });
  const placeholder = append(body, 'input', null, { placeholder: 'Search articles' });
  const passwordPlaceholder = append(body, 'input', null, {
    type: 'password',
    placeholder: 'Enter password'
  });
  const duplicateAria = append(body, 'button', 'Duplicate accessible name', {
    'aria-label': '  Duplicate   accessible name  '
  });

  const translated = append(body, 'font', 'Already translated copy', {
    class: 'ait-translation'
  });
  const translatedChild = append(translated, 'span', 'Nested translated copy');

  const shadowHost = append(body, 'article');
  const shadowRoot = shadowHost.attachShadow({ mode: 'open' });
  const shadowText = append(shadowRoot, 'div', 'Open shadow content');

  const canvas = append(body, 'canvas', 'Canvas fallback pixels');

  const collector = loadCollector(document);
  const collect = collector.collectTranslatableItems || collector.collectParagraphs;
  assert.strictEqual(typeof collect, 'function', '收集器应导出 collectTranslatableItems 或 collectParagraphs');
  const items = collect.call(collector, body).map(normalizeItem);

  return {
    items,
    refs: {
      footerText,
      ordinaryDiv,
      ordinarySpan,
      ordinaryLink,
      ordinaryButton,
      nestedParent,
      nestedChild,
      mixedInline,
      hiddenByRects,
      hiddenByAttribute,
      hiddenByStyle,
      hiddenDescendant,
      svgText,
      ariaLabel,
      titled,
      placeholder,
      passwordPlaceholder,
      duplicateAria,
      translated,
      translatedChild,
      shadowText,
      canvas
    }
  };
}

function itemsForElement(items, element) {
  return items.filter(function (item) { return item.element === element; });
}

function assertCollected(items, element, expectedText, expectedKind) {
  assert.ok(items.some(function (item) {
    return item.element === element &&
      item.text === expectedText &&
      (!expectedKind || item.kind === expectedKind);
  }), '应收集：' + expectedText + (expectedKind ? '（' + expectedKind + '）' : ''));
}

function assertNotCollected(items, element, label) {
  assert.strictEqual(itemsForElement(items, element).length, 0, '不应收集：' + label);
}

const fixture = collectFixture();
const items = fixture.items;
const refs = fixture.refs;

// footer 与非弹窗中的普通叶子 UI 元素都应覆盖。
assertCollected(items, refs.footerText, 'Footer legal notice', 'text');
assertCollected(items, refs.ordinaryDiv, 'Ordinary division copy', 'text');
assertCollected(items, refs.ordinarySpan, 'Standalone span copy', 'text');
assertCollected(items, refs.ordinaryLink, 'Read documentation', 'text');
assertCollected(items, refs.ordinaryButton, 'Save changes', 'text');

// 嵌套父子只发送一份文字，并优先归属叶子元素。
const nestedItems = items.filter(function (item) { return item.text === 'Nested leaf copy'; });
assert.strictEqual(nestedItems.length, 1, '嵌套父子文本只能收集一次');
assert.strictEqual(nestedItems[0].element, refs.nestedChild, '嵌套文本应归属最内层可见元素');
assertNotCollected(items, refs.nestedParent, '已有可翻译子节点的父元素');

const mixedItems = items.filter(function (item) { return item.text === 'Hello world'; });
assert.strictEqual(mixedItems.length, 1, '混合内联文本必须保留完整句子上下文');
assert.strictEqual(mixedItems[0].element, refs.mixedInline, '混合内联文本应归属最近块级容器');

// 不可见文本与扩展自己插入的译文必须跳过。
assertNotCollected(items, refs.hiddenByRects, '无布局矩形的元素');
assertNotCollected(items, refs.hiddenByAttribute, 'hidden 元素');
assertNotCollected(items, refs.hiddenByStyle, 'display:none 元素');
assertNotCollected(items, refs.hiddenDescendant, '隐藏祖先下的文本');
assertNotCollected(items, refs.translated, 'ait-translation');
assertNotCollected(items, refs.translatedChild, 'ait-translation 子树');

// SVG <text> 和 open Shadow DOM 是可读取文本，应正常覆盖。
assertCollected(items, refs.svgText, 'SVG chart label', 'svg');
assertCollected(items, refs.shadowText, 'Open shadow content', 'text');

// 属性文本需要独立记录，不能与正文共用一个不可区分的元素项。
[
  [refs.ariaLabel, 'aria-label', 'Accessible control label'],
  [refs.titled, 'title', 'Tooltip explanation'],
  [refs.placeholder, 'placeholder', 'Search articles']
].forEach(function (expected) {
  assert.ok(items.some(function (item) {
    return item.element === expected[0] &&
      item.kind === 'attribute' &&
      item.attribute === expected[1] &&
      item.text === expected[2];
  }), '应收集属性 ' + expected[1] + '：' + expected[2]);
});
assertNotCollected(items, refs.passwordPlaceholder, '密码输入框 placeholder');

assertCollected(items, refs.duplicateAria, 'Duplicate accessible name', 'text');
assert.ok(!items.some(function (item) {
  return item.element === refs.duplicateAria &&
    item.kind === 'attribute' &&
    item.attribute === 'aria-label';
}), '属性与可见正文归一化后相同，不应重复发送');

// Canvas/WebGL/图片只有像素；即使存在 fallback 子文本也不进入 DOM 翻译。
assertNotCollected(items, refs.canvas, 'canvas 像素或 fallback 文本');
assert.ok(!items.some(function (item) {
  return item.text.indexOf('Canvas fallback pixels') !== -1;
}), 'Canvas 文本不能混入其他收集项');

console.log('wide-dom-collector.test.js ✓ 全部通过（' + items.length + ' 项）');

module.exports = {
  FakeDocument,
  FakeElement,
  FakeText,
  FakeShadowRoot,
  NodeFilter,
  append
};
