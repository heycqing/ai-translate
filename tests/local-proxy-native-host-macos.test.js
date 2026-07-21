const assert = require('assert');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const {
  expandPath,
  validateSettings,
  healthCheckUrl,
  encodeMessage,
  decodeMessage,
  buildResponse,
  isHealthy,
  handleAction,
  settingsPath
} = require('../local-proxy/macos/native-host.js');

function fakeGet(statusCode) {
  return function (url, options, callback) {
    const res = new EventEmitter();
    res.statusCode = statusCode;
    res.resume = function () {};
    const req = new EventEmitter();
    req.destroy = function () {};
    process.nextTick(function () { callback(res); });
    return req;
  };
}

function fakeGetError() {
  return function () {
    const req = new EventEmitter();
    req.destroy = function () {};
    process.nextTick(function () { req.emit('error', new Error('boom')); });
    return req;
  };
}

function fakeSpawn(pid) {
  return function () {
    return { pid: pid, unref: function () {} };
  };
}

function runSyncChecks() {
  assert.strictEqual(
    expandPath('~/.codex/dycodex.config.toml'),
    path.join(os.homedir(), '.codex/dycodex.config.toml')
  );
  assert.strictEqual(expandPath('/abs/path'), path.resolve('/abs/path'));

  const exists = function (p) {
    return p === '/node' || p === '/server.js' || p === '/config.toml';
  };
  const settings = validateSettings({
    nodePath: '/node', serverPath: '/server.js', configPath: '/config.toml',
    token: 'tok', port: 8787, proxyPid: 0
  }, { existsSync: exists });
  assert.strictEqual(settings.port, 8787);

  assert.throws(function () {
    validateSettings({ nodePath: '/missing', serverPath: '/server.js', configPath: '/config.toml', token: 'tok', port: 8787 }, { existsSync: exists });
  }, /找不到 Node\.js/);
  assert.throws(function () {
    validateSettings({ nodePath: '/node', serverPath: '/server.js', configPath: '/config.toml', token: '', port: 8787 }, { existsSync: exists });
  }, /令牌不能为空/);
  assert.throws(function () {
    validateSettings({ nodePath: '/node', serverPath: '/server.js', configPath: '/config.toml', token: 'tok', port: 70000 }, { existsSync: exists });
  }, /端口无效/);

  assert.strictEqual(healthCheckUrl(8787), 'http://127.0.0.1:8787/health');

  const payload = { ok: true, message: '正常', port: 8787 };
  assert.deepStrictEqual(decodeMessage(encodeMessage(payload)), payload);
  assert.throws(function () { decodeMessage(Buffer.from([1, 2])); }, /消息长度无效/);

  assert.deepStrictEqual(buildResponse(true, 'ok', 8787), { ok: true, message: 'ok', port: 8787 });
  assert.deepStrictEqual(buildResponse(false, 'no'), { ok: false, message: 'no', port: 0 });

  console.log('local-proxy-native-host-macos.test.js（同步部分）✓ 全部通过');
}

async function runAsyncChecks() {
  assert.strictEqual(await isHealthy(8787, { get: fakeGet(200) }), true);
  assert.strictEqual(await isHealthy(8787, { get: fakeGet(500) }), false);
  assert.strictEqual(await isHealthy(8787, { get: fakeGetError() }), false);
  assert.strictEqual(await isHealthy(0, {}), false);

  const REAL_SETTINGS_PATH = settingsPath();
  const files = {};
  files[REAL_SETTINGS_PATH] = JSON.stringify({
    nodePath: '/node', serverPath: '/server.js', configPath: '/config.toml',
    token: 'tok', port: 8787, proxyPid: 0
  });
  const baseDeps = {
    existsSync: function (p) {
      return p === REAL_SETTINGS_PATH || p === '/node' || p === '/server.js' ||
        p === '/config.toml' || p === '/new-config.toml';
    },
    readFileSync: function (p) { return files[p]; },
    writeFileSync: function (p, content) { files[p] = content; },
    mkdirSync: function () {},
    openSync: function () { return -1; },
    execFileSync: function () { return ''; },
    get: fakeGet(200)
  };

  const missingSettingsDeps = Object.assign({}, baseDeps, {
    existsSync: function (p) {
      return p !== REAL_SETTINGS_PATH && (p === '/node' || p === '/server.js' || p === '/config.toml');
    }
  });
  const missingResult = await handleAction({ action: 'status' }, missingSettingsDeps);
  assert.deepStrictEqual(missingResult, {
    ok: false, message: '本地代理尚未安装，请先执行首次安装命令。', port: 0
  });

  const statusResult = await handleAction({ action: 'status' }, baseDeps);
  assert.deepStrictEqual(statusResult, { ok: true, message: '本地代理运行正常（127.0.0.1:8787）。', port: 8787 });

  const startResult = await handleAction({ action: 'start' }, baseDeps);
  assert.strictEqual(startResult.ok, true);

  const configureDeps = Object.assign({}, baseDeps, { spawn: fakeSpawn(4321) });
  const configureResult = await handleAction({
    action: 'configure', configPath: '/new-config.toml', token: 'new-tok', port: 9000
  }, configureDeps);
  assert.strictEqual(configureResult.ok, true);
  assert.strictEqual(configureResult.port, 9000);
  assert.strictEqual(JSON.parse(files[REAL_SETTINGS_PATH]).token, 'new-tok');

  const killCalls = [];
  files[REAL_SETTINGS_PATH] = JSON.stringify({
    nodePath: '/node', serverPath: '/server.js', configPath: '/config.toml',
    token: 'tok', port: 8787, proxyPid: 555
  });
  const stopDeps = Object.assign({}, baseDeps, {
    spawn: fakeSpawn(4321),
    kill: function (pid, signal) { killCalls.push({ pid: pid, signal: signal }); },
    execFileSync: function () { return 'node\n'; }
  });
  const reconfigureResult = await handleAction({
    action: 'configure', configPath: '/new-config.toml', token: 'newer-tok', port: 9100
  }, stopDeps);
  assert.strictEqual(reconfigureResult.ok, true);
  assert.ok(killCalls.some(function (c) { return c.pid === 555 && c.signal === 'SIGTERM'; }),
    'configure 应该对旧的 proxyPid 发送 SIGTERM');

  const unknownResult = await handleAction({ action: 'nope' }, baseDeps);
  assert.deepStrictEqual(unknownResult, { ok: false, message: '不支持的 Native Host 操作。', port: 0 });

  console.log('local-proxy-native-host-macos.test.js（异步部分）✓ 全部通过');
}

runSyncChecks();
runAsyncChecks().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
