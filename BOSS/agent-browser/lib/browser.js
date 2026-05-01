/**
 * agent-browser CLI 轻量封装
 * 提供超时、重试、JSON 解析等基础能力
 */
const { execFile } = require('child_process');
const path = require('path');

const AB_CMD = 'agent-browser';
const DEFAULT_TIMEOUT = 30000;

let sessionName = 'boss-chat';
let headed = true;
let chromeProfile = null;
let autoConnect = false;
let cdpPort = null;
let executablePath = null;
let browserArgs = null;

function setSession(name) { sessionName = name; }
function setHeaded(on) { headed = on; }
function setProfile(profile) { chromeProfile = profile; }
function setAutoConnect(port) { autoConnect = true; cdpPort = port; }
function setExecutable(path) { executablePath = path; }
function setBrowserArgs(args) { browserArgs = args; }

function buildArgs() {
  const args = [];
  if (autoConnect) {
    args.push('--cdp', String(cdpPort));
    return args;
  }
  if (sessionName) args.push('--session-name', sessionName);
  if (headed) args.push('--headed');
  if (executablePath) args.push('--executable-path', executablePath);
  if (chromeProfile) args.push('--profile', chromeProfile);
  // 反检测浏览器启动参数
  if (browserArgs) args.push('--args', browserArgs);
  return args;
}

/**
 * 执行 agent-browser 命令，返回 stdout
 */
function run(args, opts = {}) {
  const timeout = opts.timeout || DEFAULT_TIMEOUT;
  const allArgs = [...buildArgs(), ...args];

  return new Promise((resolve, reject) => {
    const child = execFile(AB_CMD, allArgs, {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, PATH: process.env.PATH },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });

    child.on('error', err => {
      reject(new Error(`agent-browser 执行失败: ${err.message}`));
    });

    child.on('exit', code => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        const msg = stderr.trim() || stdout.trim() || `exit code ${code}`;
        reject(new Error(`agent-browser [${allArgs.join(' ')}]: ${msg}`));
      }
    });
  });
}

/**
 * 带重试的执行
 */
async function runRetry(args, opts = {}) {
  const maxRetries = opts.retries || 2;
  let lastErr;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await run(args, opts);
    } catch (e) {
      lastErr = e;
      if (i < maxRetries) {
        await sleep(1000 * (i + 1));
      }
    }
  }
  throw lastErr;
}

/**
 * 执行并解析 JSON 输出
 */
async function runJSON(args, opts = {}) {
  const out = await runRetry([...args, '--json'], opts);
  try {
    return JSON.parse(out);
  } catch (_) {
    // 有时 --json 输出混入了非 JSON 行，尝试提取
    const lines = out.split('\n');
    for (const line of lines) {
      try { return JSON.parse(line); } catch (_) {}
    }
    throw new Error(`无法解析 JSON 输出: ${out.substring(0, 200)}`);
  }
}

/**
 * 在页面中执行 JS 并返回结果
 */
async function evalJS(code, opts = {}) {
  const out = await runRetry(['eval', code], opts);
  try {
    return JSON.parse(out);
  } catch (_) {
    return out;
  }
}

/**
 * 通过 stdin 执行多行 JS
 */
async function evalStdin(code, opts = {}) {
  // 使用 base64 编码避免 shell 转义问题
  const b64 = Buffer.from(code, 'utf-8').toString('base64');
  return await runRetry(['eval', '-b', b64], opts);
}

/**
 * 健康检查：agent-browser 是否可用
 */
async function healthCheck() {
  try {
    await run(['eval', 'true'], { timeout: 10000 });
    return { ok: true, error: null };
  } catch (e) {
    const msg = e.message || '';
    if (autoConnect) {
      if (msg.includes('connect') || msg.includes('ECONNREFUSED') || msg.includes('refused')) {
        return { ok: false, error: `无法连接到 Chrome 调试端口 ${cdpPort}。请先执行:\n  open -a "Google Chrome" --args --remote-debugging-port=${cdpPort}` };
      }
      return { ok: false, error: `连接 Chrome 失败: ${msg.substring(0, 200)}` };
    }
    return { ok: false, error: `agent-browser 不可用: ${msg.substring(0, 200)}` };
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomSleep(min, max) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return sleep(ms);
}

module.exports = {
  run, runRetry, runJSON, evalJS, evalStdin,
  healthCheck, sleep, randomSleep,
  setSession, setHeaded, setProfile, setAutoConnect,
  setExecutable, setBrowserArgs,
  buildArgs,
};
