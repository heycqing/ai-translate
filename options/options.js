// AI Translate 设置页：目标语言、Provider、本地代理与设置备份
const $ = function (id) { return document.getElementById(id); };
const settings = globalThis.AITranslateSettings;
const NATIVE_HOST = 'com.ai_translate.local_proxy';

function esc(s) {
  return String(s || '').replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function isMac() {
  const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  return /mac/i.test(platform);
}

function defaultConfigPath() {
  return isMac() ? '~/.codex/dycodex.config.toml' : '%USERPROFILE%\\.codex\\dycodex.config.toml';
}

async function getStore() {
  return chrome.storage.local.get(['providers', 'activeProviderId', 'targetLang', 'localProxy']);
}

function renderTable(providers, activeId) {
  const head = '<tr><th>启用中</th><th>名称</th><th>模型</th><th>接口地址</th><th>操作</th></tr>';
  const rows = providers.map(function (p) {
    return '<tr>' +
      '<td>' + (p.id === activeId ? '✓' : '') + '</td>' +
      '<td>' + esc(p.name) + '</td>' +
      '<td>' + esc(p.model) + '</td>' +
      '<td>' + esc(p.baseURL) + '</td>' +
      '<td class="row-actions">' +
        '<button data-act="use" data-id="' + p.id + '">启用</button>' +
        '<button data-act="edit" data-id="' + p.id + '">编辑</button>' +
        '<button data-act="del" data-id="' + p.id + '">删除</button>' +
      '</td></tr>';
  }).join('');
  $('providerTable').innerHTML = head + (rows || '<tr><td colspan="5">还没有引擎，用下面表单添加</td></tr>');
}

async function refresh() {
  const store = await getStore();
  $('targetLang').value = store.targetLang || '简体中文';
  renderTable(store.providers || [], store.activeProviderId);
  const local = store.localProxy || {};
  $('extensionId').value = chrome.runtime.id;
  $('localConfigPath').value = local.configPath || '';
  $('localToken').value = local.token || '';
  $('localPort').value = local.port || 8787;
  if ($('appVersion')) {
    try { $('appVersion').textContent = 'v' + chrome.runtime.getManifest().version; } catch (e) {}
  }
}

let tipTimer = null;
function tip(text) {
  clearTimeout(tipTimer);
  $('saveTip').textContent = text;
  tipTimer = setTimeout(function () { $('saveTip').textContent = ''; }, 1500);
}

function status(elementId, text, ok) {
  const element = $(elementId);
  element.textContent = text;
  element.className = 'status ' + (ok ? 'ok' : 'error');
}

function nativeMessage(message) {
  return new Promise(function (resolve, reject) {
    chrome.runtime.sendNativeMessage(NATIVE_HOST, message, function (response) {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else if (!response || response.ok === false) reject(new Error((response && response.message) || '本地服务没有响应'));
      else resolve(response);
    });
  });
}

function localFormValue() {
  const token = $('localToken').value.trim();
  const configPath = $('localConfigPath').value.trim() || defaultConfigPath();
  const port = settings.validPort($('localPort').value);
  if (!token) throw new Error('请填写本地代理令牌');
  return { configPath: configPath, token: token, port: port };
}

function powerShellLiteral(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function shellLiteral(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function buildWindowsInstallSteps(local) {
  return [
    '# 第 1 步：把下面路径换成你本机 clone 的 ai-translate 项目根目录，例如 D:\\code\\ai-translate\n' +
    'Set-Location -ErrorAction Stop "请替换成你的项目根目录路径"',
    '# 第 2 步：第 1 步成功后再执行这一步，安装并启动本地代理\n' +
    'if (Test-Path \'.\\local-proxy\\install-windows.ps1\') {\n' +
    '  powershell.exe -NoProfile -ExecutionPolicy Bypass -File ' +
      powerShellLiteral('.\\local-proxy\\install-windows.ps1') + ' -ExtensionId ' +
      powerShellLiteral(chrome.runtime.id) + ' -CodexConfigPath ' + powerShellLiteral(local.configPath) +
      ' -ProxyToken ' + powerShellLiteral(local.token) + ' -Port ' + local.port + '\n' +
    '} else {\n' +
    '  Write-Host \'找不到 .\\local-proxy\\install-windows.ps1，请确认第 1 步的路径是不是 ai-translate 项目根目录。\' -ForegroundColor Red\n' +
    '}'
  ];
}

function buildMacosInstallSteps(local) {
  return [
    '# 第 1 步：把下面路径换成你本机 clone 的 ai-translate 项目根目录，例如 /Users/yourname/code/ai-translate（请用绝对路径，不要用 ~ 开头）\n' +
    'cd "请替换成你的项目根目录路径"',
    '# 第 2 步：第 1 步成功后再执行这一步，安装并启动本地代理\n' +
    'if [ -f ./local-proxy/install-macos.sh ]; then\n' +
    '  bash ./local-proxy/install-macos.sh --extension-id ' + shellLiteral(chrome.runtime.id) +
      ' --codex-config-path ' + shellLiteral(local.configPath) +
      ' --proxy-token ' + shellLiteral(local.token) + ' --port ' + local.port + '\n' +
    'else\n' +
    '  echo \'找不到 ./local-proxy/install-macos.sh，请确认第 1 步的路径是不是 ai-translate 项目根目录。\'\n' +
    'fi'
  ];
}

function renderCommandBlock(steps) {
  $('installCommandText').value = steps.join('\n\n');
  $('installCommandBlock').hidden = false;
}

function makeToken() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, function (value) { return value.toString(16).padStart(2, '0'); }).join('');
}

async function ensureLocalDefaults() {
  const store = await getStore();
  if (store.localProxy && store.localProxy.token) return;
  const localProxy = Object.assign({
    configPath: defaultConfigPath(),
    token: makeToken(),
    port: 8787
  }, store.localProxy || {});
  await chrome.storage.local.set({ localProxy: localProxy });
}

$('installCommandWindows').addEventListener('click', function () {
  try {
    const local = localFormValue();
    renderCommandBlock(buildWindowsInstallSteps(local));
    status('localStatus', 'Windows 安装命令已生成，请把第 1 步的路径改成你本机项目路径，改好后点击下方“复制全部”，然后在 PowerShell 里粘贴执行。', true);
  } catch (error) {
    status('localStatus', error.message, false);
  }
});

$('installCommandMacos').addEventListener('click', function () {
  try {
    const local = localFormValue();
    renderCommandBlock(buildMacosInstallSteps(local));
    status('localStatus', 'macOS 安装命令已生成，请把第 1 步的路径改成你本机项目路径，改好后点击下方“复制全部”，然后在 Terminal 里粘贴执行。', true);
  } catch (error) {
    status('localStatus', error.message, false);
  }
});

$('copyInstallCommand').addEventListener('click', async function () {
  try {
    await navigator.clipboard.writeText($('installCommandText').value);
    status('localStatus', '已复制文本框当前内容。', true);
  } catch (error) {
    status('localStatus', '复制失败：' + error.message, false);
  }
});

$('startLocalProxy').addEventListener('click', async function () {
  try {
    const local = localFormValue();
    status('localStatus', '正在保存配置并启动…', true);
    const response = await nativeMessage(Object.assign({ action: 'configure' }, local));
    const store = await getStore();
    const provider = settings.buildLocalProvider(local.port, local.token);
    await chrome.storage.local.set({
      localProxy: local,
      providers: settings.upsertProvider(store.providers, provider),
      activeProviderId: provider.id
    });
    await refresh();
    status('localStatus', response.message || '本地代理已启动，并已设为当前翻译引擎。', true);
  } catch (error) {
    status('localStatus', '启动失败：' + error.message + '。若尚未安装，请先复制并执行对应系统的安装命令。', false);
  }
});

$('checkLocalProxy').addEventListener('click', async function () {
  try {
    const response = await nativeMessage({ action: 'status' });
    status('localStatus', response.message || '本地代理运行正常。', true);
  } catch (error) {
    status('localStatus', '未运行或 Native Host 未安装：' + error.message, false);
  }
});

$('exportSettings').addEventListener('click', async function () {
  const all = await chrome.storage.local.get(null);
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ai-translate-settings-' + new Date().toISOString().slice(0, 10) + '.json';
  link.click();
  URL.revokeObjectURL(url);
  status('backupTip', '已导出。文件包含 API Key 和本地令牌，请勿公开。', true);
});

$('importSettings').addEventListener('click', function () { $('importFile').click(); });
$('importFile').addEventListener('change', async function () {
  const file = this.files && this.files[0];
  if (!file) return;
  try {
    const backup = settings.validateBackup(JSON.parse(await file.text()));
    await chrome.storage.local.set(backup);
    await refresh();
    status('backupTip', '设置已导入。', true);
  } catch (error) {
    status('backupTip', '导入失败：' + error.message, false);
  } finally {
    this.value = '';
  }
});

// 目标语言：改动即保存
$('targetLang').addEventListener('change', async function () {
  await chrome.storage.local.set({ targetLang: $('targetLang').value });
  tip('已保存');
});

// 表格操作：启用/编辑/删除（事件委托）
$('providerTable').addEventListener('click', async function (e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  const store = await getStore();
  const providers = store.providers || [];
  const current = providers.filter(function (p) { return p.id === id; })[0];
  let actionTip = '';
  if (btn.dataset.act === 'use') {
    await chrome.storage.local.set({ activeProviderId: id });
    if (current) actionTip = '已启用「' + current.name + '」';
  } else if (btn.dataset.act === 'del') {
    const next = providers.filter(function (p) { return p.id !== id; });
    const patch = { providers: next };
    if (store.activeProviderId === id) patch.activeProviderId = next[0] ? next[0].id : null;
    await chrome.storage.local.set(patch);
    if (current) actionTip = '已删除「' + current.name + '」';
  } else if (btn.dataset.act === 'edit') {
    const p = current;
    if (!p) return;
    $('editingId').value = p.id;
    $('pName').value = p.name;
    $('pBaseURL').value = p.baseURL;
    $('pKey').value = p.apiKey;
    $('pModel').value = p.model;
    $('pPrompt').value = p.systemPrompt || '';
    return; // 编辑只回填表单，不动存储
  }
  await refresh();
  if (actionTip) tip(actionTip);
});

// 表单提交：新增或更新
$('providerForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const store = await getStore();
  const providers = store.providers || [];
  const editingId = $('editingId').value;
  const entry = {
    id: editingId || 'p' + Date.now(),
    name: $('pName').value.trim(),
    baseURL: $('pBaseURL').value.trim(),
    apiKey: $('pKey').value.trim(),
    model: $('pModel').value.trim(),
    systemPrompt: $('pPrompt').value.trim() || undefined
  };
  const idx = providers.findIndex(function (p) { return p.id === entry.id; });
  if (idx === -1) providers.push(entry); else providers[idx] = entry;
  const patch = { providers: providers };
  if (!store.activeProviderId) patch.activeProviderId = entry.id; // 第一条自动启用
  await chrome.storage.local.set(patch);
  $('providerForm').reset();
  $('editingId').value = '';
  tip('已保存');
  refresh();
});

$('resetForm').addEventListener('click', function () {
  $('providerForm').reset();
  $('editingId').value = '';
});

ensureLocalDefaults().then(refresh).catch(function (error) {
  status('localStatus', '设置初始化失败：' + error.message, false);
});
