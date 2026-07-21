#!/usr/bin/env node
// AI Translate - macOS Chrome Native Messaging Host：管理本地 Responses 代理进程的启动/停止/健康检查
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');

const MAX_MESSAGE_BYTES = 1024 * 1024;
const HEALTH_TIMEOUT_MS = 500;
const START_POLL_ATTEMPTS = 30;
const START_POLL_INTERVAL_MS = 150;

function settingsPath() {
  return path.join(os.homedir(), 'Library', 'Application Support', 'AITranslate', 'local-proxy', 'settings.json');
}

function logPath() {
  return path.join(os.homedir(), 'Library', 'Application Support', 'AITranslate', 'local-proxy', 'local-proxy.log');
}

function expandPath(value) {
  const raw = String(value || '');
  const withHome = (raw === '~' || raw.indexOf('~/') === 0) ? path.join(os.homedir(), raw.slice(1)) : raw;
  const withEnv = withHome.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, function (match, name) {
    return process.env[name] !== undefined ? process.env[name] : match;
  });
  return path.resolve(withEnv);
}

function validateSettings(rawSettings, deps) {
  const existsSync = (deps && deps.existsSync) || fs.existsSync;
  if (!rawSettings) throw new Error('本地代理设置无效。');
  const settings = {
    nodePath: expandPath(rawSettings.nodePath),
    serverPath: expandPath(rawSettings.serverPath),
    configPath: expandPath(rawSettings.configPath),
    token: String(rawSettings.token || ''),
    port: Number(rawSettings.port),
    proxyPid: Number(rawSettings.proxyPid) || 0
  };
  if (!existsSync(settings.nodePath)) throw new Error('找不到 Node.js，请重新运行安装脚本。');
  if (!existsSync(settings.serverPath)) throw new Error('找不到 local-proxy/server.js，请重新运行安装脚本。');
  if (!existsSync(settings.configPath)) throw new Error('找不到 Codex 配置文件。');
  if (!settings.token) throw new Error('本地代理令牌不能为空。');
  if (!Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535) throw new Error('本地代理端口无效。');
  return settings;
}

function healthCheckUrl(port) {
  return 'http://127.0.0.1:' + port + '/health';
}

function encodeMessage(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

function decodeMessage(buffer) {
  if (buffer.length < 4) throw new Error('Native Messaging 消息长度无效。');
  const length = buffer.readUInt32LE(0);
  if (length < 1 || length > MAX_MESSAGE_BYTES) throw new Error('Native Messaging 消息长度无效。');
  if (buffer.length < 4 + length) throw new Error('Native Messaging 输入不完整。');
  return JSON.parse(buffer.slice(4, 4 + length).toString('utf8'));
}

function buildResponse(ok, message, port) {
  return { ok: ok, message: message, port: port || 0 };
}

function loadSettings(deps) {
  const readFileSync = (deps && deps.readFileSync) || fs.readFileSync;
  const existsSync = (deps && deps.existsSync) || fs.existsSync;
  const file = settingsPath();
  if (!existsSync(file)) throw new Error('本地代理尚未安装，请先执行首次安装命令。');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  return validateSettings(raw, deps);
}

function saveSettings(settings, deps) {
  const writeFileSync = (deps && deps.writeFileSync) || fs.writeFileSync;
  const mkdirSync = (deps && deps.mkdirSync) || fs.mkdirSync;
  const file = settingsPath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(settings), 'utf8');
}

function isHealthy(port, deps) {
  const httpGet = (deps && deps.get) || http.get;
  return new Promise(function (resolve) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) { resolve(false); return; }
    let settled = false;
    const req = httpGet(healthCheckUrl(port), { timeout: HEALTH_TIMEOUT_MS }, function (res) {
      if (settled) return;
      settled = true;
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on('timeout', function () {
      if (settled) return;
      settled = true;
      req.destroy();
      resolve(false);
    });
    req.on('error', function () {
      if (settled) return;
      settled = true;
      resolve(false);
    });
  });
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function isProcessRunningAsNode(pid, deps) {
  const execFileSyncImpl = (deps && deps.execFileSync) || execFileSync;
  const killImpl = (deps && deps.kill) || process.kill;
  if (!pid || pid <= 0) return false;
  try {
    killImpl(pid, 0);
  } catch (error) {
    return false;
  }
  try {
    const comm = String(execFileSyncImpl('ps', ['-p', String(pid), '-o', 'comm='])).trim();
    return /node$/.test(comm);
  } catch (error) {
    return false;
  }
}

function stopManagedProxy(settings, deps) {
  if (!settings || settings.proxyPid <= 0) return;
  const killImpl = (deps && deps.kill) || process.kill;
  if (isProcessRunningAsNode(settings.proxyPid, deps)) {
    try { killImpl(settings.proxyPid, 'SIGTERM'); } catch (error) { /* 进程已退出 */ }
  }
}

async function startProxy(settings, forceStart, deps) {
  const spawnImpl = (deps && deps.spawn) || spawn;
  if (!forceStart && await isHealthy(settings.port, deps)) return true;

  const mkdirSyncImpl = (deps && deps.mkdirSync) || fs.mkdirSync;
  const openSyncImpl = (deps && deps.openSync) || fs.openSync;
  const logFile = logPath();
  mkdirSyncImpl(path.dirname(logFile), { recursive: true });
  const logFd = openSyncImpl(logFile, 'a');

  const child = spawnImpl(settings.nodePath, [settings.serverPath, '--config', settings.configPath, '--port', String(settings.port)], {
    cwd: path.dirname(settings.serverPath),
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: Object.assign({}, process.env, { AI_TRANSLATE_PROXY_TOKEN: settings.token })
  });
  if (typeof child.unref === 'function') child.unref();
  settings.proxyPid = child.pid;
  saveSettings(settings, deps);

  for (let attempt = 0; attempt < START_POLL_ATTEMPTS; attempt += 1) {
    if (await isHealthy(settings.port, deps)) return true;
    await sleep(START_POLL_INTERVAL_MS);
  }
  stopManagedProxy(settings, deps);
  settings.proxyPid = 0;
  saveSettings(settings, deps);
  return false;
}

async function handleAction(request, deps) {
  try {
    const action = request && request.action;
    if (action === 'status') {
      const settings = loadSettings(deps);
      const running = await isHealthy(settings.port, deps);
      return buildResponse(running, running
        ? '本地代理运行正常（127.0.0.1:' + settings.port + '）。'
        : '本地代理当前未运行。', settings.port);
    }
    if (action === 'start') {
      const settings = loadSettings(deps);
      const running = await startProxy(settings, false, deps);
      return buildResponse(running, running ? '本地代理已启动。' : '本地代理启动后未通过健康检查。', settings.port);
    }
    if (action === 'configure') {
      const settings = loadSettings(deps);
      settings.configPath = expandPath(request.configPath);
      settings.token = String(request.token || '');
      settings.port = Number(request.port);
      const validated = validateSettings(settings, deps);
      stopManagedProxy(validated, deps);
      validated.proxyPid = 0;
      saveSettings(validated, deps);
      const running = await startProxy(validated, true, deps);
      return buildResponse(running, running
        ? '配置已保存，本地代理已启动并设为当前翻译引擎。'
        : '配置已保存，但代理未通过健康检查。', validated.port);
    }
    return buildResponse(false, '不支持的 Native Host 操作。', 0);
  } catch (error) {
    return buildResponse(false, String((error && error.message) || error), 0);
  }
}

function readStdinMessage() {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    process.stdin.on('data', function (chunk) { chunks.push(chunk); });
    process.stdin.on('end', function () {
      try { resolve(decodeMessage(Buffer.concat(chunks))); }
      catch (error) { reject(error); }
    });
    process.stdin.on('error', reject);
  });
}

function writeStdoutMessage(payload) {
  process.stdout.write(encodeMessage(payload));
}

async function runAutostart() {
  const settings = loadSettings();
  await startProxy(settings, false);
}

async function runNativeMessaging() {
  try {
    const request = await readStdinMessage();
    const result = await handleAction(request);
    writeStdoutMessage(result);
  } catch (error) {
    writeStdoutMessage(buildResponse(false, String((error && error.message) || error), 0));
    process.exitCode = 1;
  }
}

async function main() {
  if (process.argv[2] === '--autostart') {
    await runAutostart();
    return;
  }
  await runNativeMessaging();
}

if (require.main === module) {
  main().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  expandPath: expandPath,
  validateSettings: validateSettings,
  healthCheckUrl: healthCheckUrl,
  encodeMessage: encodeMessage,
  decodeMessage: decodeMessage,
  buildResponse: buildResponse,
  isHealthy: isHealthy,
  handleAction: handleAction,
  settingsPath: settingsPath,
  logPath: logPath
};
