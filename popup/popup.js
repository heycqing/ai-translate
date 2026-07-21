// AI Translate popup：翻译/还原当前页 + 切换引擎
const $ = function (id) { return document.getElementById(id); };

async function sendToActiveTab(msg) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0] && tabs[0].id) chrome.tabs.sendMessage(tabs[0].id, msg);
}

$('translate').addEventListener('click', async function () {
  $('translate').textContent = '已开始，看页面右下角进度';
  $('translate').disabled = true;
  await sendToActiveTab({ type: 'page-translate' });
  setTimeout(function () { window.close(); }, 300);
});

$('restore').addEventListener('click', async function () {
  await sendToActiveTab({ type: 'page-restore' });
  window.close();
});

$('openOptions').addEventListener('click', function (e) {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// 引擎下拉：显示全部 provider，切换即写 activeProviderId
(async function initProviderSelect() {
  const store = await chrome.storage.local.get(['providers', 'activeProviderId']);
  const providers = store.providers || [];
  $('provider').innerHTML = providers.map(function (p) {
    return '<option value="' + p.id + '"' + (p.id === store.activeProviderId ? ' selected' : '') + '>' +
      p.name + ' (' + p.model + ')</option>';
  }).join('') || '<option value="">未配置引擎</option>';
})();

let providerTipTimer = null;
$('provider').addEventListener('change', async function () {
  if (!$('provider').value) return;
  await chrome.storage.local.set({ activeProviderId: $('provider').value });
  clearTimeout(providerTipTimer);
  $('providerTip').textContent = '✓ 已切换';
  providerTipTimer = setTimeout(function () { $('providerTip').textContent = ''; }, 1500);
});
