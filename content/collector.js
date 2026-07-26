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

  function collectFromRoot(root, result) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (el) {
        if (RULES.SKIP_TAGS.indexOf(el.tagName) !== -1) return NodeFilter.FILTER_REJECT;
        if (el.classList && el.classList.contains('ait-translation')) return NodeFilter.FILTER_REJECT;
        if (el.isContentEditable) return NodeFilter.FILTER_REJECT;
        if (RULES.BLOCK_TAGS.indexOf(el.tagName) !== -1) return NodeFilter.FILTER_ACCEPT;
        // 网页弹窗通常由 div/span/button 组成，只在弹窗容器内部放宽标签限制，
        // 避免把正文页面的所有导航和按钮都纳入整页翻译。
        if (
          RULES.POPUP_TEXT_TAGS.indexOf(el.tagName) !== -1 &&
          closestPopup(el)
        ) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      }
    });
    let el;
    while ((el = walker.nextNode())) {
      if (el.dataset.aitDone === '1') continue;
      const inPopup = !!closestPopup(el);
      // 嵌套内容只翻最内层：正文按块级标签判断，弹窗还要包含 UI 文本标签。
      if (el.querySelector(inPopup ? RULES.POPUP_CANDIDATE_SELECTOR : RULES.BLOCK_SELECTOR)) continue;
      // 不可见元素不翻，省钱
      if (el.getClientRects().length === 0) continue;
      if (!RULES.isTranslatableText(el.innerText)) continue;
      result.push(el);
    }
  }

  function collectParagraphs(root) {
    const result = [];
    getOpenRoots(root).forEach(function (scope) { collectFromRoot(scope, result); });
    return result;
  }

  self.AITCollector = {
    collectParagraphs,
    getOpenRoots,
    closestPopup,
    closestInComposedTree
  };
})();
