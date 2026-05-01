/**
 * 通过 CDP Page.addScriptToEvaluateOnNewDocument 在页面加载前注入反检测脚本。
 * 这是唯一能绕过 navigator.webdriver=true 的方法。
 * agent-browser 连接后需先调用此函数再打开 BOSS。
 */
const WebSocket = require('ws');

const ANTI_DETECT_SCRIPT = `
// 在页面所有 JS 执行前覆盖 navigator.webdriver
Object.defineProperty(navigator, 'webdriver', {
  get: () => undefined,
  configurable: true
});

// 覆盖 chrome.runtime（自动化标记）
if (window.chrome) {
  const origRuntime = window.chrome.runtime;
  Object.defineProperty(window.chrome, 'runtime', {
    get: () => undefined,
    configurable: true
  });
}

// 移除 PhantomJS/Nightmare 标记
delete window.__nightmare;
delete window.callPhantom;
delete window._phantom;
delete window.__phantomas;
delete window.Buffer;

// 模拟真实 plugins
Object.defineProperty(navigator, 'plugins', {
  get: () => [1, 2, 3, 4, 5].map(() => ({
    name: 'Chrome PDF Plugin',
    filename: 'internal-pdf-viewer',
    description: 'Portable Document Format'
  })),
  configurable: true
});

Object.defineProperty(navigator, 'languages', {
  get: () => ['zh-CN', 'zh', 'en-US', 'en'],
  configurable: true
});
`;

/**
 * 获取 Chrome CDP WebSocket URL
 */
async function getCdpWsUrl(port = 9222) {
  const resp = await fetch(`http://localhost:${port}/json/version`);
  const data = await resp.json();
  return data.webSocketDebuggerUrl;
}

/**
 * 通过 CDP 在页面加载前注入反检测脚本
 * @param {number} port - Chrome 调试端口
 * @returns {Promise<boolean>}
 */
function patchNavigatorWebdriver(port = 9222) {
  return new Promise(async (resolve, reject) => {
    try {
      const wsUrl = await getCdpWsUrl(port);
      console.log('[cdp-patch] 连接 CDP...');

      const ws = new WebSocket(wsUrl);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('CDP patch timeout'));
      }, 10000);

      ws.on('open', () => {
        // 发送 Page.addScriptToEvaluateOnNewDocument
        ws.send(JSON.stringify({
          id: 1,
          method: 'Page.addScriptToEvaluateOnNewDocument',
          params: { source: ANTI_DETECT_SCRIPT, worldName: '__anti_detect__' }
        }));
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.id === 1) {
            clearTimeout(timeout);
            if (msg.error) {
              console.error('[cdp-patch] CDP 错误:', JSON.stringify(msg.error));
              ws.close();
              reject(new Error(msg.error.message));
            } else {
              console.log('[cdp-patch] 反检测脚本已注入（页面加载前执行）✓');
              ws.close();
              resolve(true);
            }
          }
        } catch (_) {}
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

    } catch (e) {
      reject(e);
    }
  });
}

/**
 * 重启 Chrome 并注入反检测补丁
 */
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

async function restartChromeWithPatch(port = 9222) {
  const profileDir = `${os.homedir()}/.boss-chrome-profile`;
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

  if (!fs.existsSync(chromePath)) {
    throw new Error('Chrome 未安装');
  }

  // 杀掉旧 Chrome
  console.log('[cdp-patch] 关闭 Chrome...');
  try { execSync('killall "Google Chrome" 2>/dev/null', { timeout: 5000 }); } catch (_) {}
  await new Promise(r => setTimeout(r, 2000));

  // 启动 Chrome
  console.log('[cdp-patch] 启动 Chrome...');
  const { spawn } = require('child_process');
  spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
  ], {
    detached: true,
    stdio: 'ignore',
  }).unref();

  // 等待端口就绪
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      execSync(`curl -s http://localhost:${port}/json/version > /dev/null 2>&1`, { timeout: 3000 });
      console.log('[cdp-patch] Chrome 就绪');
      break;
    } catch (_) {}
    process.stdout.write('.');
  }

  // 注入反检测补丁
  await patchNavigatorWebdriver(port);
  console.log('[cdp-patch] 补丁安装完成，navigator.webdriver 已被覆盖');
}

module.exports = { patchNavigatorWebdriver, restartChromeWithPatch };
