// AI Translate - 收集页面中待翻译的块级段落
(function () {
  const RULES = self.AITCollectRules;

  // Element.closest 不会跨越 ShadowRoot，沿 host 向上补查组合树上下文。
  function closestInComposedTree(el, selector) {
    let current = el;
    while (current) {
      if (current.closest) {
        const matched = current.closest(selector);
        if (matched) return matched;
      }
      const root = current.getRootNode && current.getRootNode();
      current = root && root.host;
    }
    return null;
  }

  function closestPopup(el) {
    return closestInComposedTree(el, RULES.POPUP_ROOT_SELECTOR);
  }

  function isSvgTextElement(el) {
    return !!(
      el &&
      String(el.localName || el.tagName || '').toLowerCase() === 'text' &&
      closestInComposedTree(el, 'svg')
    );
  }

  // 收集给定根节点及其所有 open shadow root。closed shadow root 受浏览器封装限制，无法访问。
  function getOpenRoots(root) {
    const roots = [root || document.body];
    for (let i = 0; i < roots.length; i += 1) {
      const scope = roots[i];
      if (!scope || !scope.querySelectorAll) continue;
      scope.querySelectorAll('*').forEach(function (el) {
        if (el.shadowRoot && roots.indexOf(el.shadowRoot) === -1) roots.push(el.shadowRoot);
      });
    }
    return roots;
  }

  function normalizeText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function isOwnUi(el) {
    return !!closestInComposedTree(el, '.ait-translation, .ait-toast, .ait-select-btn, .ait-select-card');
  }

  function isVisible(el) {
    if (!el || !el.getClientRects || el.getClientRects().length === 0) return false;
    if (el.hidden || el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false;
    const view = el.ownerDocument && el.ownerDocument.defaultView;
    const style = view && view.getComputedStyle
      ? view.getComputedStyle(el)
      : (typeof getComputedStyle === 'function' ? getComputedStyle(el) : null);
    return !style || (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.visibility !== 'collapse' &&
      (style.opacity === undefined || Number(style.opacity) !== 0)
    );
  }

  function hasExcludedAncestor(el, allowSkippedSelf) {
    let current = el;
    let first = true;
    while (current && current.nodeType === 1) {
      if ((!first || !allowSkippedSelf) && RULES.SKIP_TAGS.indexOf(current.tagName) !== -1) return true;
      if (current.isContentEditable || isOwnUi(current)) return true;
      const parent = current.parentNode;
      current = parent && parent.nodeType === 1 ? parent : null;
      first = false;
    }
    return false;
  }

  function getDisplay(el) {
    const view = el && el.ownerDocument && el.ownerDocument.defaultView;
    const style = view && view.getComputedStyle
      ? view.getComputedStyle(el)
      : (typeof getComputedStyle === 'function' ? getComputedStyle(el) : null);
    return style && style.display;
  }

  function isBlockLike(el) {
    return [
      'block', 'flex', 'grid', 'list-item', 'table', 'table-row',
      'table-cell', 'flow-root'
    ].indexOf(getDisplay(el)) !== -1;
  }

  function hasDirectTranslatableText(el) {
    return Array.prototype.some.call(el.childNodes || [], function (node) {
      return node.nodeType === 3 && RULES.isTranslatableText(node.textContent);
    });
  }

  function countVisibleTextBranches(el) {
    return Array.prototype.filter.call(el.children || [], function (child) {
      return isVisible(child) &&
        !hasExcludedAncestor(child) &&
        RULES.isTranslatableText(child.innerText || child.textContent);
    }).length;
  }

  // 找到文本的唯一“视觉叶子”。段落、链接、按钮等语义边界整体翻译；
  // 普通 div/span 则归到文字的直接叶子，避免父子 innerText 重复入队。
  function getTextOwner(textNode) {
    const direct = textNode && textNode.parentElement;
    if (!direct || hasExcludedAncestor(direct) || !isVisible(direct)) return null;
    // SVG 文案常包在 <text><tspan>…</tspan></text> 中，统一归属外层 <text>。
    const svgText = closestInComposedTree(direct, 'text');
    if (svgText && closestInComposedTree(svgText, 'svg')) return svgText;
    if (closestInComposedTree(direct, 'svg')) return null;

    let current = direct;
    while (current && current.nodeType === 1) {
      if (RULES.TEXT_UNIT_TAGS.indexOf(current.tagName) !== -1) return current;
      const parent = current.parentElement;
      if (!parent || parent.tagName === 'BODY' || parent.tagName === 'HTML') break;
      if (hasExcludedAncestor(parent)) break;
      current = parent;
    }

    // 普通容器中若同时存在直接文字和内联标签，或存在多个文字分支，
    // 应由最近块级容器整体翻译，避免 “Hello <strong>world</strong>” 被拆成两次请求。
    current = direct;
    while (current && current.nodeType === 1) {
      if (isBlockLike(current)) {
        if (
          current === direct ||
          hasDirectTranslatableText(current) ||
          countVisibleTextBranches(current) > 1
        ) return current;
        return direct;
      }
      const parent = current.parentElement;
      if (!parent || parent.tagName === 'BODY' || parent.tagName === 'HTML') break;
      current = parent;
    }
    return direct.tagName === 'BODY' || direct.tagName === 'HTML' ? null : direct;
  }

  function collectTextUnits(root, result) {
    const units = new Map();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        return RULES.isTranslatableText(node.textContent)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      const owner = getTextOwner(node);
      if (!owner) continue;
      let unit = units.get(owner);
      if (!unit) {
        unit = {
          element: owner,
          textParts: [],
          kind: isSvgTextElement(owner) ? 'svg' : 'text'
        };
        units.set(owner, unit);
      }
      unit.textParts.push(node.textContent);
    }
    units.forEach(function (unit) {
      const text = normalizeText(unit.textParts.join(' '));
      if (!RULES.isTranslatableText(text)) return;
      result.push({
        element: unit.element,
        text: text,
        kind: unit.kind
      });
    });
  }

  function collectAttributeUnits(root, result) {
    const elements = [];
    if (root.nodeType === 1) elements.push(root);
    if (root.querySelectorAll) {
      root.querySelectorAll(RULES.ATTRIBUTE_NAMES.map(function (name) {
        return '[' + name + ']';
      }).join(',')).forEach(function (el) { elements.push(el); });
    }

    const visibleText = new Map();
    result.forEach(function (item) {
      if (item.kind === 'text' || item.kind === 'svg') {
        visibleText.set(item.element, normalizeText(item.text));
      }
    });

    elements.forEach(function (el) {
      if (hasExcludedAncestor(el, true) || !isVisible(el)) return;
      const sensitiveHint = [
        el.getAttribute('type'),
        el.getAttribute('autocomplete'),
        el.getAttribute('name'),
        el.getAttribute('id')
      ].filter(Boolean).join(' ');
      if (/(?:password|passwd|token|secret|otp|one.?time|verification|captcha|api.?key)/i.test(sensitiveHint)) {
        return;
      }
      const renderedText = normalizeText(el.innerText || el.textContent);
      RULES.ATTRIBUTE_NAMES.forEach(function (attribute) {
        const text = normalizeText(el.getAttribute(attribute));
        if (!RULES.isTranslatableText(text)) return;
        // aria-label/title 经常只是可见文字的重复副本，不应重复计费和展示。
        if (attribute === 'aria-label' && RULES.isTranslatableText(renderedText)) return;
        if (visibleText.get(el) === text || renderedText === text) return;
        result.push({
          element: el,
          text: text,
          kind: 'attribute',
          attribute: attribute
        });
      });
    });
  }

  function collectParagraphs(root) {
    const result = [];
    getOpenRoots(root).forEach(function (scope) {
      collectTextUnits(scope, result);
      collectAttributeUnits(scope, result);
    });
    return result;
  }

  self.AITCollector = {
    collectParagraphs,
    getOpenRoots,
    getTextOwner,
    normalizeText,
    closestPopup,
    closestInComposedTree
  };
})();
