// AI Translate - 整页双语对照：收集 → 分批 → 请求 → 插入
(function () {
  let translating = false; // 防重入
  let translated = false;  // 当前页是否处于已翻译状态
  let observer = null;
  let observerTimer = null;
  let toast = null;
  let toastTimer = null;
  let degradedNote = '';   // 本轮翻译是否发生了降级

  function showToast(text, autohideMs) {
    clearTimeout(toastTimer);
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'ait-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.hidden = false;
    if (autohideMs > 0) {
      toastTimer = setTimeout(function () { toast.hidden = true; }, autohideMs);
    }
  }

  // 已翻译状态下监听新增节点，防抖后增量补翻
  // （collectParagraphs 会跳过 data-ait-done 元素，所以重跑 translatePage 天然是增量的；
  //   扩展自己插入的 toast/译文节点直接忽略，避免反馈 DOM 反复触发增量翻译）
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(function (mutations) {
      const hasPageMutation = mutations.some(function (mutation) {
        const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
        if (target && target.closest('.ait-toast, .ait-translation')) return false;
        const changed = Array.prototype.slice.call(mutation.addedNodes)
          .concat(Array.prototype.slice.call(mutation.removedNodes));
        return changed.some(function (node) {
          return node.nodeType !== 1 || !node.matches('.ait-toast, .ait-translation');
        });
      });
      if (!hasPageMutation) return;
      clearTimeout(observerTimer);
      observerTimer = setTimeout(function () {
        if (translated && !translating) translatePage();
      }, 800);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (observer) { observer.disconnect(); observer = null; }
    clearTimeout(observerTimer);
  }

  async function translatePage() {
    if (translating) return;
    translating = true;
    try {
      degradedNote = '';
      showToast('正在收集段落…');
      const els = self.AITCollector.collectParagraphs(document.body);
      if (!els.length) {
        showToast('没有可翻译的段落', 2000);
        return;
      }
      const items = els.map(function (el, i) { return { id: i, text: el.innerText.trim() }; });
      const batches = self.AITBatcher.makeBatches(items);
      let completedBatches = 0;
      let configError = '';
      showToast('翻译中 0/' + batches.length + ' 批');
      // 各批并行请求，谁先回来谁先上屏
      const results = await Promise.all(batches.map(async function (batch) {
        const result = await translateBatch(batch, els, 0);
        completedBatches += 1;
        if (result.configError) configError = result.configError;
        if (configError) showToast(configError, 4000);
        else showToast('翻译中 ' + completedBatches + '/' + batches.length + ' 批');
        return result;
      }));
      const failedCount = results.reduce(function (sum, result) { return sum + result.failedCount; }, 0);
      if (configError) showToast(configError, 4000);
      else if (failedCount) showToast('完成，' + failedCount + ' 段失败，点击红字重试' + degradedNote, 4000);
      else showToast('翻译完成 ✓' + degradedNote, 3000);
      translated = true;
      startObserver();
    } finally {
      translating = false;
    }
  }

  async function translateBatch(batch, els, depth) {
    let resp;
    try {
      resp = await chrome.runtime.sendMessage({
        type: 'translate',
        texts: batch.map(function (it) { return it.text; })
      });
    } catch (e) {
      resp = { ok: false, error: String(e) };
    }
    if (resp && resp.ok) {
      if (resp.degraded === 'fallback') degradedNote = '（AI 引擎失败，已用谷歌免费通道）';
      else if (resp.degraded === 'no-provider') degradedNote = '（未配置 AI 引擎，走谷歌免费通道）';
      batch.forEach(function (it, i) { insertTranslation(els[it.id], resp.translations[i]); });
      return { failedCount: 0, configError: '' };
    }
    const error = String((resp && resp.error) || '');
    // 未配置引擎时继续拆批没有意义，直接标记整批并把原始错误交给进度 toast。
    if (error.indexOf('未配置翻译引擎') !== -1) {
      batch.forEach(function (it) { markFailed(els[it.id], error); });
      return { failedCount: batch.length, configError: error };
    }
    // 整批失败：拆半重试最多 2 层（坏段落二分定位），拆不动了就标失败
    if (batch.length > 1 && depth < 2) {
      const mid = Math.ceil(batch.length / 2);
      const results = await Promise.all([
        translateBatch(batch.slice(0, mid), els, depth + 1),
        translateBatch(batch.slice(mid), els, depth + 1)
      ]);
      return {
        failedCount: results[0].failedCount + results[1].failedCount,
        configError: results[0].configError || results[1].configError
      };
    } else {
      batch.forEach(function (it) { markFailed(els[it.id], resp && resp.error); });
      return { failedCount: batch.length, configError: '' };
    }
  }

  function insertTranslation(el, text) {
    if (el.dataset.aitDone === '1') return;
    el.dataset.aitDone = '1';
    const node = document.createElement('font');
    node.className = 'ait-translation';
    node.textContent = text;
    el.appendChild(node);
  }

  function markFailed(el, error) {
    if (el.dataset.aitDone === '1') return;
    el.dataset.aitDone = '1';
    const node = document.createElement('font');
    node.className = 'ait-translation ait-failed';
    node.textContent = '[翻译失败，点击重试]';
    node.title = error || '';
    node.addEventListener('click', function () {
      node.remove();
      delete el.dataset.aitDone;
      translateBatch([{ id: 0, text: el.innerText.trim() }], [el], 99); // depth=99 保证不再拆批
    });
    el.appendChild(node);
  }

  function restorePage() {
    document.querySelectorAll('.ait-translation').forEach(function (n) { n.remove(); });
    document.querySelectorAll('[data-ait-done]').forEach(function (el) { delete el.dataset.aitDone; });
    stopObserver();
    translated = false;
    showToast('已还原原文', 1500);
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg) return;
    if (msg.type === 'page-translate') translatePage();
    else if (msg.type === 'page-restore') restorePage();
    else if (msg.type === 'toggle-page-translate') { translated ? restorePage() : translatePage(); }
  });

  // 供 Task 9 的 MutationObserver 复用
  self.AITPage = { translatePage: translatePage, restorePage: restorePage, isTranslated: function () { return translated; } };
})();
