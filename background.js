// AI Translate - background service worker：唯一的网络出口 + 快捷键/右键菜单路由
importScripts(
  'lib/hash.js',
  'lib/lang-codes.js',
  'lib/prompt.js',
  'providers/openai.js',
  'providers/google-free.js',
  'providers/cache.js'
);

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === 'translate') {
    handleTranslate(msg).then(
      function (r) { sendResponse({ ok: true, translations: r.translations, degraded: r.degraded }); },
      function (err) { sendResponse({ ok: false, error: String((err && err.message) || err) }); }
    );
    return true; // 保持消息通道等待异步响应
  }
});

// 缓存 → AI 引擎 → 失败降级免费通道；未配置引擎直接走免费通道
async function handleTranslate(msg) {
  const store = await chrome.storage.local.get(['providers', 'activeProviderId', 'targetLang']);
  const targetLang = store.targetLang || '简体中文';
  const providers = store.providers || [];
  const cfg = providers.filter(function (p) { return p.id === store.activeProviderId; })[0] || providers[0];

  const model = cfg ? cfg.model : 'google-free';
  const keys = msg.texts.map(function (t) { return AITHash.makeCacheKey(t, targetLang, model); });
  const cached = await AITCache.getMany(keys);
  const missIdx = [];
  cached.forEach(function (c, i) { if (c === null) missIdx.push(i); });
  if (!missIdx.length) return { translations: cached, degraded: '' };

  const missTexts = missIdx.map(function (i) { return msg.texts[i]; });
  let missResults;
  let degraded = '';
  if (!cfg) {
    missResults = await AITGoogleFree.translate(missTexts, targetLang);
    degraded = 'no-provider';
  } else {
    try {
      missResults = await AITOpenAI.translate(missTexts, targetLang, cfg);
    } catch (e) {
      // AI 通道失败 → 免费通道兜底；免费通道也挂就让错误抛出去
      missResults = await AITGoogleFree.translate(missTexts, targetLang);
      degraded = 'fallback';
    }
  }

  const out = cached.slice();
  const entries = [];
  missIdx.forEach(function (origI, j) {
    out[origI] = missResults[j];
    // 降级译文按 google-free 存，不污染 AI 模型缓存；AI 恢复后会重新翻
    const key = degraded === 'fallback'
      ? AITHash.makeCacheKey(msg.texts[origI], targetLang, 'google-free')
      : keys[origI];
    entries.push({ key: key, translation: missResults[j] });
  });
  AITCache.putMany(entries); // 不 await：写缓存失败不影响响应
  return { translations: out, degraded: degraded };
}

// 快捷键：转发给当前标签页的 content script
chrome.commands.onCommand.addListener(async function (cmd) {
  const messageType = cmd === 'toggle-translate'
    ? 'toggle-page-translate'
    : (cmd === 'translate-input' ? 'translate-active-input' : '');
  if (!messageType) return;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0] && tabs[0].id) {
    chrome.tabs.sendMessage(tabs[0].id, { type: messageType });
  }
});

// 右键菜单：翻译选中内容（Task 6 联通 content）
chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.create({ id: 'ait-selection', title: '翻译选中内容', contexts: ['selection'] });
});
chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId === 'ait-selection' && tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'selection-translate' });
  }
});
