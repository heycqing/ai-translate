// AI Translate - 本地代理运行时配置：从环境变量或 Codex TOML 读取，不复制配置文件内容
const fs = require('fs');

function stripComment(line) {
  let quote = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if ((ch === '"' || ch === "'") && line[i - 1] !== '\\') {
      quote = quote === ch ? '' : (quote || ch);
    } else if (ch === '#' && !quote) {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseValue(raw) {
  const value = raw.trim();
  if ((value[0] === '"' && value[value.length - 1] === '"') ||
      (value[0] === "'" && value[value.length - 1] === "'")) {
    return value.slice(1, -1);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}

function parseCodexToml(text, env) {
  const top = {};
  const providers = {};
  let section = '';

  String(text || '').split(/\r?\n/).forEach(function (rawLine) {
    const line = stripComment(rawLine).trim();
    if (!line) return;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      return;
    }
    const pair = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!pair) return;
    const key = pair[1];
    const value = parseValue(pair[2]);
    const providerMatch = section.match(/^model_providers\.([A-Za-z0-9_-]+)$/);
    if (providerMatch) {
      const name = providerMatch[1];
      if (!providers[name]) providers[name] = {};
      providers[name][key] = value;
    } else if (!section) {
      top[key] = value;
    }
  });

  const providerName = top.model_provider;
  const provider = providers[providerName];
  if (!providerName || !provider) throw new Error('Codex 配置缺少有效的 model_provider');
  if (provider.wire_api !== 'responses') throw new Error('Codex Provider 必须使用 wire_api = "responses"');
  if (!provider.base_url) throw new Error('Codex Provider 缺少 base_url');
  if (!top.model) throw new Error('Codex 配置缺少 model');

  const envKey = provider.env_key;
  const apiKey = envKey ? env[envKey] : '';
  if (!apiKey) throw new Error('未设置 Codex Provider 声明的密钥环境变量');
  return {
    baseUrl: String(provider.base_url),
    model: String(top.model),
    apiKey: String(apiKey)
  };
}

function readArg(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? '' : String(argv[index + 1] || '');
}

function loadRuntimeConfig(options) {
  const env = options && options.env ? options.env : process.env;
  const argv = options && options.argv ? options.argv : process.argv.slice(2);
  const readFile = options && options.readFile ? options.readFile : fs.readFileSync;
  const configPath = readArg(argv, '--config') || env.AI_TRANSLATE_CODEX_CONFIG || '';
  let codex = null;
  if (configPath) codex = parseCodexToml(readFile(configPath, 'utf8'), env);

  const baseUrl = env.AI_TRANSLATE_UPSTREAM_BASE_URL || (codex && codex.baseUrl) || '';
  const responsesUrl = env.AI_TRANSLATE_RESPONSES_URL ||
    (baseUrl ? baseUrl.replace(/\/+$/, '') + '/responses' : '');
  const model = env.AI_TRANSLATE_MODEL || (codex && codex.model) || '';
  const apiKey = env.AI_TRANSLATE_UPSTREAM_API_KEY || (codex && codex.apiKey) || '';
  const localToken = env.AI_TRANSLATE_PROXY_TOKEN || '';
  const portRaw = readArg(argv, '--port') || env.AI_TRANSLATE_PROXY_PORT || '8787';
  const port = Number(portRaw);

  if (!responsesUrl) throw new Error('缺少 Responses API 地址或 Codex 配置路径');
  if (!model) throw new Error('缺少运行时模型名');
  if (!apiKey) throw new Error('缺少上游 API Key');
  if (!localToken) throw new Error('缺少 AI_TRANSLATE_PROXY_TOKEN');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('代理端口无效');

  return {
    host: '127.0.0.1',
    port: port,
    responsesUrl: responsesUrl,
    model: model,
    apiKey: apiKey,
    localToken: localToken,
    reasoningEffort: env.AI_TRANSLATE_REASONING_EFFORT || ''
  };
}

module.exports = { parseCodexToml, loadRuntimeConfig };
