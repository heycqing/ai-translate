// AI Translate - 划词翻译：选中文本出"译"浮标，点击弹译文卡片
(function () {
  let btn = null;
  let card = null;

  function removeUI() {
    if (btn) { btn.remove(); btn = null; }
    if (card) { card.remove(); card = null; }
  }

  function showButton(x, y, text) {
    removeUI();
    btn = document.createElement('div');
    btn.className = 'ait-select-btn';
    btn.textContent = '译';
    btn.style.left = x + 'px';
    btn.style.top = y + 'px';
    // mousedown 而非 click：抢在页面把选区清掉之前触发
    btn.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      translateSelection(text, x, y);
    });
    document.body.appendChild(btn);
  }

  async function translateSelection(text, x, y) {
    removeUI();
    card = document.createElement('div');
    card.className = 'ait-select-card';
    card.textContent = '翻译中…';
    card.style.left = x + 'px';
    card.style.top = (y + 8) + 'px';
    document.body.appendChild(card);
    let resp;
    try {
      resp = await chrome.runtime.sendMessage({ type: 'translate', texts: [text] });
    } catch (e) {
      resp = { ok: false, error: String(e) };
    }
    if (!card) return; // 等待期间用户已点掉卡片
    card.textContent = (resp && resp.ok)
      ? resp.translations[0]
      : ('翻译失败：' + ((resp && resp.error) || '未知错误'));
  }

  document.addEventListener('mouseup', function (e) {
    if (e.target && e.target.closest && e.target.closest('.ait-select-btn, .ait-select-card')) return;
    // 等浏览器先落定选区再读
    setTimeout(function () {
      const sel = window.getSelection();
      const text = sel ? String(sel).trim() : '';
      if (!text || !self.AITCollectRules.isTranslatableText(text)) { removeUI(); return; }
      showButton(e.pageX + 6, e.pageY + 12, text);
    }, 0);
  });

  // 点击浮标/卡片之外的任何地方关掉划词 UI
  document.addEventListener('mousedown', function (e) {
    if (e.target && e.target.closest && e.target.closest('.ait-select-btn, .ait-select-card')) return;
    removeUI();
  });

  // 右键菜单"翻译选中内容"入口
  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg || msg.type !== 'selection-translate') return;
    const sel = window.getSelection();
    const text = sel ? String(sel).trim() : '';
    if (!text) return;
    const rect = (sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null);
    const x = rect ? rect.left + window.scrollX : window.scrollX + 20;
    const y = rect ? rect.bottom + window.scrollY : window.scrollY + 20;
    translateSelection(text, x, y);
  });
})();
