// AI Translate - 整页双语对照：收集 → 分批 → 请求 → 插入
(function () {
  let translating = false; // 防重入
  let translated = false;  // 当前页是否处于已翻译状态
  let observer = null;
  let observedRoots = new WeakSet();
  let observerTimer = null;
  let toast = null;
  let toastTimer = null;
  let degradedNote = '';   // 本轮翻译是否发生了降级
  let pendingRescan = false;
  let translationGeneration = 0;
  // 页面可能同时存在正文、aria-label、title 等多个翻译单元，不能再用单个布尔标记。
  let translatedSources = new WeakMap();
  // 属性译文原位写回属性；保存原文与渲染值，恢复时不会覆盖网页随后主动更新的值。
  const attributeStates = new Map();

  function isOwnUi(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    return !!(el && el.closest('.ait-toast, .ait-translation, .ait-select-btn, .ait-select-card'));
  }

  function affectsPopup(target) {
    if (!target || target.nodeType !== 1) return false;
    const selector = self.AITCollectRules.POPUP_ROOT_SELECTOR;
    return !!self.AITCollector.closestPopup(target) || !!target.querySelector(selector);
  }

  function setSharedTranslationState(active) {
    chrome.runtime.sendMessage({
      type: 'set-page-translation-state',
      active: !!active
    }).catch(function () {});
  }

  function observeOpenRoots(startRoot) {
    self.AITCollector.getOpenRoots(startRoot || document.body).forEach(function (root) {
      // 普通元素只是扫描入口；真正需要单独 observe 的只有 body 与 ShadowRoot。
      if (root !== document.body && !(root.nodeType === 11 && root.host)) return;
      if (observedRoots.has(root)) return;
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: [
          'class', 'style', 'hidden', 'open', 'aria-hidden', 'aria-modal', 'role',
          'aria-label', 'title', 'placeholder'
        ]
      });
      observedRoots.add(root);
    });
  }

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
  // （prepareTargets 会按元素与翻译单元记录过滤已处理原文，所以重跑 translatePage 天然是增量的；
  //   扩展自己插入的 toast/译文节点直接忽略，避免反馈 DOM 反复触发增量翻译）
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(function (mutations) {
      const hasPageMutation = mutations.some(function (mutation) {
        const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
        if (isOwnUi(target)) return false;
        if (mutation.type === 'characterData') return true;
        // 可见性、弹窗状态及可翻译属性变化都可能产生新的翻译单元。
        if (mutation.type === 'attributes') {
          if (
            mutation.attributeName === 'aria-label' ||
            mutation.attributeName === 'title' ||
            mutation.attributeName === 'placeholder' ||
            mutation.attributeName === 'hidden' ||
            mutation.attributeName === 'open' ||
            mutation.attributeName === 'aria-hidden'
          ) return true;
          // 普通页面的 class/style 动画非常频繁；只有弹窗相关变化才触发全页补扫。
          return affectsPopup(target);
        }
        const changed = Array.prototype.slice.call(mutation.addedNodes)
          .concat(Array.prototype.slice.call(mutation.removedNodes));
        return changed.some(function (node) {
          return !isOwnUi(node);
        });
      });
      if (!hasPageMutation) return;
      // 新插入的 Web Component 可能带有新的 open shadow root，先纳入监听再补翻。
      mutations.forEach(function (mutation) {
        const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
        if (target) observeOpenRoots(target);
        Array.prototype.forEach.call(mutation.addedNodes || [], function (node) {
          if (node.nodeType === 1) observeOpenRoots(node);
        });
      });
      if (translating) pendingRescan = true;
      clearTimeout(observerTimer);
      observerTimer = setTimeout(function () {
        if (translated && !translating) {
          pendingRescan = false;
          translatePage(true);
        } else if (translating) {
          pendingRescan = true;
        }
      }, 800);
    });
    observeOpenRoots();
  }

  function stopObserver() {
    if (observer) { observer.disconnect(); observer = null; }
    observedRoots = new WeakSet();
    clearTimeout(observerTimer);
  }

  function targetKey(target) {
    return target.kind === 'attribute'
      ? 'attribute:' + target.attribute
      : target.kind;
  }

  function getAttributeState(el, attribute) {
    const states = attributeStates.get(el);
    return states && states[attribute];
  }

  function setAttributeState(el, attribute, state) {
    let states = attributeStates.get(el);
    if (!states) {
      states = {};
      attributeStates.set(el, states);
    }
    states[attribute] = state;
  }

  function prepareTargets(collected) {
    return collected.map(function (target) {
      if (target.kind !== 'attribute') return target;
      const current = target.element.getAttribute(target.attribute) || '';
      const state = getAttributeState(target.element, target.attribute);
      // 收集器看到的是双语属性时，翻译源仍应是保存的原文。
      if (state && current === state.rendered) {
        return Object.assign({}, target, { text: state.source });
      }
      // 网页主动更新了该属性，旧译文不再有效，按新值重新翻译。
      if (state && current !== state.rendered) {
        const states = attributeStates.get(target.element);
        delete states[target.attribute];
        forgetTranslated(target);
      }
      return Object.assign({}, target, { text: self.AITCollector.normalizeText(current) });
    }).filter(function (target) {
      if (!self.AITCollectRules.isTranslatableText(target.text)) return false;
      const sources = translatedSources.get(target.element);
      return !sources || sources[targetKey(target)] !== target.text;
    });
  }

  function rememberTranslated(target) {
    let sources = translatedSources.get(target.element);
    if (!sources) {
      sources = {};
      translatedSources.set(target.element, sources);
    }
    sources[targetKey(target)] = target.text;
    target.element.dataset.aitDone = '1';
  }

  function forgetTranslated(target) {
    const sources = translatedSources.get(target.element);
    if (sources) delete sources[targetKey(target)];
  }

  function removeExistingTranslation(target) {
    const key = targetKey(target);
    const children = target.element.children || [];
    Array.prototype.forEach.call(children, function (node) {
      if (
        node.classList &&
        node.classList.contains('ait-translation') &&
        node.getAttribute('data-ait-unit-key') === key
      ) node.remove();
    });
  }

  async function translatePage(incremental) {
    if (translating) return;
    translating = true;
    const runGeneration = translationGeneration;
    try {
      degradedNote = '';
      showToast('正在收集段落…');
      const targets = prepareTargets(self.AITCollector.collectParagraphs(document.body));
      if (!targets.length) {
        if (!incremental) {
          // 即使当前没有正文，也保持“已开启”状态；稍后显示或插入的弹窗仍可自动补翻。
          translated = true;
          startObserver();
          showToast('已开启翻译，等待可翻译内容', 2000);
        }
        return;
      }
      // 同一个文案可能同时出现在桌面/移动导航或多个无障碍属性中，本轮只请求一次。
      const bySource = new Map();
      targets.forEach(function (target, targetId) {
        let item = bySource.get(target.text);
        if (!item) {
          item = { id: bySource.size, text: target.text, targetIds: [] };
          bySource.set(target.text, item);
        }
        item.targetIds.push(targetId);
      });
      const items = Array.from(bySource.values());
      const batches = self.AITBatcher.makeBatches(items);
      let completedBatches = 0;
      let configError = '';
      showToast('翻译中 0/' + batches.length + ' 批');
      // 请求发出前开始监听，确保首次翻译期间新增/变更的内容不会永久漏掉。
      startObserver();
      // 广覆盖会显著增加批次数量，限制并发避免瞬时压垮 Provider 或免费通道。
      const results = await mapWithConcurrency(batches, 3, async function (batch) {
        const result = await translateBatch(batch, targets, 0, runGeneration);
        if (runGeneration !== translationGeneration) return result;
        completedBatches += 1;
        if (result.configError) configError = result.configError;
        if (configError) showToast(configError, 4000);
        else showToast('翻译中 ' + completedBatches + '/' + batches.length + ' 批');
        return result;
      });
      if (runGeneration !== translationGeneration) return;
      const failedCount = results.reduce(function (sum, result) { return sum + result.failedCount; }, 0);
      if (configError) showToast(configError, 4000);
      else if (failedCount) showToast('完成，' + failedCount + ' 段失败，点击红字重试' + degradedNote, 4000);
      else showToast('翻译完成 ✓' + degradedNote, 3000);
      translated = true;
      startObserver();
    } finally {
      translating = false;
      if (pendingRescan && translated) {
        pendingRescan = false;
        clearTimeout(observerTimer);
        observerTimer = setTimeout(function () { translatePage(true); }, 0);
      }
    }
  }

  async function mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;
    async function runWorker() {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index], index);
      }
    }
    const workers = [];
    const workerCount = Math.min(limit, items.length);
    for (let i = 0; i < workerCount; i += 1) workers.push(runWorker());
    await Promise.all(workers);
    return results;
  }

  async function translateBatch(batch, targets, depth, runGeneration) {
    let resp;
    try {
      resp = await chrome.runtime.sendMessage({
        type: 'translate',
        texts: batch.map(function (it) { return it.text; })
      });
    } catch (e) {
      resp = { ok: false, error: String(e) };
    }
    if (runGeneration !== translationGeneration) {
      return { failedCount: 0, configError: '', cancelled: true };
    }
    if (resp && resp.ok) {
      if (resp.degraded === 'fallback') degradedNote = '（AI 引擎失败，已用谷歌免费通道）';
      else if (resp.degraded === 'no-provider') degradedNote = '（未配置 AI 引擎，走谷歌免费通道）';
      let failedCount = 0;
      batch.forEach(function (it, i) {
        const translation = resp.translations && resp.translations[i];
        if (typeof translation !== 'string') {
          failedCount += it.targetIds.length;
          it.targetIds.forEach(function (targetId) {
            markFailed(targets[targetId], '翻译结果数量与请求不一致');
          });
          return;
        }
        it.targetIds.forEach(function (targetId) {
          insertTranslation(targets[targetId], translation);
        });
      });
      return { failedCount: failedCount, configError: '' };
    }
    const error = String((resp && resp.error) || '');
    // 未配置引擎时继续拆批没有意义，直接标记整批并把原始错误交给进度 toast。
    if (error.indexOf('未配置翻译引擎') !== -1) {
      batch.forEach(function (it) {
        it.targetIds.forEach(function (targetId) { markFailed(targets[targetId], error); });
      });
      return {
        failedCount: batch.reduce(function (sum, it) { return sum + it.targetIds.length; }, 0),
        configError: error
      };
    }
    // 整批失败：拆半重试最多 2 层（坏段落二分定位），拆不动了就标失败
    if (batch.length > 1 && depth < 2) {
      const mid = Math.ceil(batch.length / 2);
      const results = await Promise.all([
        translateBatch(batch.slice(0, mid), targets, depth + 1, runGeneration),
        translateBatch(batch.slice(mid), targets, depth + 1, runGeneration)
      ]);
      return {
        failedCount: results[0].failedCount + results[1].failedCount,
        configError: results[0].configError || results[1].configError
      };
    } else {
      batch.forEach(function (it) {
        it.targetIds.forEach(function (targetId) {
          markFailed(targets[targetId], resp && resp.error);
        });
      });
      return {
        failedCount: batch.reduce(function (sum, it) { return sum + it.targetIds.length; }, 0),
        configError: ''
      };
    }
  }

  function getTranslationClassName(el, extraClass) {
    const compact = self.AITCollector.closestInComposedTree(
      el,
      self.AITCollectRules.COMPACT_TRANSLATION_SELECTOR
    );
    const view = el.ownerDocument && el.ownerDocument.defaultView;
    const style = view && view.getComputedStyle ? view.getComputedStyle(el) : null;
    const naturallyInline = style && (
      style.display === 'inline' ||
      style.display === 'inline-block' ||
      style.display === 'inline-flex'
    );
    return 'ait-translation' +
      (
        compact ||
        naturallyInline ||
        String(el.localName || el.tagName || '').toLowerCase() === 'text'
          ? ' ait-translation-compact'
          : ''
      ) +
      (extraClass ? ' ' + extraClass : '');
  }

  function insertAttributeTranslation(target, text) {
    const el = target.element;
    const attribute = target.attribute;
    const original = el.getAttribute(attribute) || '';
    // 请求期间网页可能更新属性；不能用旧结果覆盖验证码状态、动态提示等新值。
    if (self.AITCollector.normalizeText(original) !== target.text) {
      forgetTranslated(target);
      pendingRescan = true;
      return;
    }
    const rendered = original + ' / ' + text;
    setAttributeState(el, attribute, {
      original: original,
      source: target.text,
      rendered: rendered
    });
    el.setAttribute(attribute, rendered);
    rememberTranslated(target);
  }

  function createVisualTranslation(target, text, extraClass) {
    let node;
    if (target.kind === 'svg') {
      node = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      node.setAttribute('dx', '0.45em');
    } else {
      node = document.createElement('span');
    }
    node.setAttribute('class', getTranslationClassName(target.element, extraClass));
    node.setAttribute('data-ait-unit-key', targetKey(target));
    // 原文已经提供可访问名称，译文节点只服务视觉双语，避免读屏重复朗读。
    node.setAttribute('aria-hidden', 'true');
    node.textContent = text;
    return node;
  }

  function insertTranslation(target, text) {
    if (!target || !target.element || typeof text !== 'string') return;
    if (target.kind === 'attribute') {
      insertAttributeTranslation(target, text);
      return;
    }
    removeExistingTranslation(target);
    const node = createVisualTranslation(target, text);
    target.element.appendChild(node);
    rememberTranslated(target);
  }

  function markFailed(target, error) {
    if (!target || !target.element) return;
    if (target.kind === 'attribute') {
      // 属性失败不写入“翻译失败”占位，避免污染 accessible name/tooltip/placeholder。
      return;
    }
    removeExistingTranslation(target);
    const node = createVisualTranslation(target, '[翻译失败，点击重试]', 'ait-failed');
    node.textContent = '[翻译失败，点击重试]';
    node.title = error || '';
    node.addEventListener('click', function () {
      node.remove();
      forgetTranslated(target);
      translateBatch(
        [{ id: 0, text: target.text, targetIds: [0] }],
        [target],
        99,
        translationGeneration
      ); // depth=99 保证不再拆批
    });
    target.element.appendChild(node);
    rememberTranslated(target);
  }

  function restoreAttributes() {
    attributeStates.forEach(function (states, el) {
      Object.keys(states).forEach(function (attribute) {
        const state = states[attribute];
        // 如果网页在翻译后主动覆盖了属性，不用旧原文反向覆盖页面的新状态。
        if (el.getAttribute(attribute) === state.rendered) {
          el.setAttribute(attribute, state.original);
        }
      });
    });
    attributeStates.clear();
  }

  function restorePage() {
    translationGeneration += 1;
    self.AITCollector.getOpenRoots(document.body).forEach(function (root) {
      root.querySelectorAll('.ait-translation').forEach(function (n) { n.remove(); });
      root.querySelectorAll('[data-ait-done]').forEach(function (el) { delete el.dataset.aitDone; });
    });
    restoreAttributes();
    translatedSources = new WeakMap();
    stopObserver();
    pendingRescan = false;
    translated = false;
    showToast('已还原原文', 1500);
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg) return;
    if (msg.type === 'page-translate') {
      setSharedTranslationState(true);
      translatePage();
    } else if (msg.type === 'page-restore') {
      setSharedTranslationState(false);
      restorePage();
    } else if (msg.type === 'toggle-page-translate') {
      setSharedTranslationState(!translated);
      translated ? restorePage() : translatePage();
    }
  });

  // 后创建的 iframe 不会收到用户此前发出的“翻译此页”消息，注入后主动继承当前标签页状态。
  chrome.runtime.sendMessage({ type: 'get-page-translation-state' }).then(function (resp) {
    if (resp && resp.active && !translated) translatePage();
  }).catch(function () {});

  // 供 Task 9 的 MutationObserver 复用
  self.AITPage = { translatePage: translatePage, restorePage: restorePage, isTranslated: function () { return translated; } };
})();
