// AI Translate - 收集页面中待翻译的块级段落
(function () {
  const RULES = self.AITCollectRules;

  function collectParagraphs(root) {
    const result = [];
    const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (el) {
        if (RULES.SKIP_TAGS.indexOf(el.tagName) !== -1) return NodeFilter.FILTER_REJECT;
        if (el.classList && el.classList.contains('ait-translation')) return NodeFilter.FILTER_REJECT;
        if (el.isContentEditable) return NodeFilter.FILTER_REJECT;
        if (RULES.BLOCK_TAGS.indexOf(el.tagName) !== -1) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      }
    });
    let el;
    while ((el = walker.nextNode())) {
      if (el.dataset.aitDone === '1') continue;
      // 嵌套块级（如 li 里还有 p）只翻最内层，避免重复
      if (el.querySelector(RULES.BLOCK_SELECTOR)) continue;
      // 不可见元素不翻，省钱
      if (el.getClientRects().length === 0) continue;
      if (!RULES.isTranslatableText(el.innerText)) continue;
      result.push(el);
    }
    return result;
  }

  self.AITCollector = { collectParagraphs };
})();
