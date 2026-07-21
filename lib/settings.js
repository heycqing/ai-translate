(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AITranslateSettings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LOCAL_PROVIDER_ID = 'local-responses-proxy';

  function validPort(value) {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('端口必须是 1 到 65535 之间的整数');
    }
    return port;
  }

  function buildLocalProvider(port, token) {
    const normalizedPort = validPort(port);
    const normalizedToken = String(token || '').trim();
    if (!normalizedToken) throw new Error('请填写本地代理令牌');
    return {
      id: LOCAL_PROVIDER_ID,
      name: 'Local Responses Proxy',
      baseURL: 'http://127.0.0.1:' + normalizedPort + '/v1',
      apiKey: normalizedToken,
      model: 'local-proxy'
    };
  }

  function upsertProvider(providers, provider) {
    const next = Array.isArray(providers) ? providers.slice() : [];
    const index = next.findIndex(function (item) { return item && item.id === provider.id; });
    if (index === -1) next.push(provider); else next[index] = provider;
    return next;
  }

  function validateBackup(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('备份文件必须是 JSON 对象');
    }
    if (value.providers !== undefined && !Array.isArray(value.providers)) {
      throw new Error('备份中的 providers 格式无效');
    }
    if (value.localProxy !== undefined &&
        (!value.localProxy || typeof value.localProxy !== 'object' || Array.isArray(value.localProxy))) {
      throw new Error('备份中的 localProxy 格式无效');
    }
    return value;
  }

  return {
    LOCAL_PROVIDER_ID: LOCAL_PROVIDER_ID,
    validPort: validPort,
    buildLocalProvider: buildLocalProvider,
    upsertProvider: upsertProvider,
    validateBackup: validateBackup
  };
});
