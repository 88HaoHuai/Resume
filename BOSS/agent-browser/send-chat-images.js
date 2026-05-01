#!/usr/bin/env node
/**
 * BOSS直聘 - 聊天消息界面自动发送本地图片
 *
 * 基于 agent-browser CLI 实现。
 * 自动启动带持久化 profile 的 Chrome 并连接，避免被检测为"无痕模式"。
 *
 * 用法:
 *   node send-chat-images.js <图片路径> [--max N]
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, spawn } = require('child_process');

const {
  run, runRetry, evalStdin,
  healthCheck, sleep, randomSleep,
  setAutoConnect,
} = require('./lib/browser');

const { CHECK_LOGIN } = require('./lib/eval-scripts');
const { getContacts, openChat } = require('./lib/contacts');
const { uploadImage } = require('./lib/upload');
const { clickSend } = require('./lib/send');
const { restartChromeWithPatch } = require('./lib/cdp-patch');

const BOSS_CHAT_URL = 'https://www.zhipin.com/web/geek/chat';
const STATE_FILE = path.join(__dirname, 'state.json');
const CHROME_PROFILE_DIR = path.join(os.homedir(), '.boss-chrome-profile');

// ========== 启动 Chrome（CDP 反检测补丁）==========
async function startChrome(port) {
  // 检查端口是否已在用
  try {
    execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN 2>/dev/null`, { timeout: 3000, stdio: 'pipe' });

    // 端口在用，验证连接
    try {
      await run(['eval', 'true'], { timeout: 5000 });
      console.log('[chrome] 复用现有 Chrome');
      return true;
    } catch (_) {}
  } catch (_) {}

  // 重启 Chrome 并注入反检测补丁（Page.addScriptToEvaluateOnNewDocument）
  try {
    await restartChromeWithPatch(port);
    return true;
  } catch (e) {
    console.error('[chrome] 启动失败:', e.message);
    return false;
  }
}

// ========== 状态管理 ==========
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch (_) {}
  return { sentContacts: [], lastRun: null };
}

function saveState(state) {
  state.lastRun = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

// ========== 等待进入聊天页 ==========
async function waitForChatPage() {
  console.log('[setup] 等待进入聊天页...');
  for (let i = 0; i < 200; i++) {
    await sleep(3000);
    try {
      const url = await run(['get', 'url']);
      if (url.includes('/web/geek/chat')) return true;
      if (i > 0 && i % 15 === 0) console.log(`[setup] 当前: ${url.substring(0, 80)}`);
    } catch (_) {}
    process.stdout.write('.');
  }
  return false;
}

// ========== 发送 ==========
async function sendToContact(contact, imagePath, stats) {
  const name = contact.text.substring(0, 30);
  console.log(`\n--- [${stats.current}/${stats.total}] ${name} ---`);

  const ok = await openChat(contact.index);
  if (!ok) { stats.failed++; return false; }

  const uploaded = await uploadImage(imagePath);
  if (!uploaded) { stats.failed++; return false; }

  const sent = await clickSend();
  if (sent) { stats.sent++; return true; }
  else { stats.failed++; return false; }
}

// ========== 主流程 ==========
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help') {
    console.log(`
BOSS直聘 - 聊天批量发送图片

用法:
  node send-chat-images.js <图片路径> [--max N]

说明:
  自动启动 Chrome（持久化 profile，非无痕模式），打开 BOSS 首页。
  你手动登录并进入聊天页后，脚本自动接管批量发图。

  首次使用会创建 profile: ~/.boss-chrome-profile/
  后续使用会复用该 profile（保留登录态、浏览历史）。

参数:
  <图片路径>  必填，要发送的本地图片
  --max N     最多发送 N 个联系人
`);
    process.exit(0);
  }

  const imagePath = path.resolve(args[0]);
  let maxCount = 0;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--max' && args[i + 1]) maxCount = parseInt(args[++i], 10);
  }

  if (!fs.existsSync(imagePath)) {
    console.error(`错误: 图片文件不存在: ${imagePath}`);
    process.exit(1);
  }

  console.log('========================================');
  console.log(' BOSS直聘 - 聊天批量发送图片');
  console.log(` 图片: ${imagePath}`);
  console.log(` 上限: ${maxCount > 0 ? maxCount + '个' : '无限制'}`);
  console.log('========================================');

  // 1. 启动 Chrome
  const cdpPort = 9222;
  if (!(await startChrome(cdpPort))) {
    console.error('无法启动 Chrome');
    process.exit(1);
  }

  // 2. 连接 agent-browser
  setAutoConnect(cdpPort);

  const health = await healthCheck();
  if (!health.ok) {
    console.error('\n' + health.error + '\n');
    process.exit(1);
  }
  console.log('[setup] agent-browser 已连接 ✓');

  // 3. 打开 BOSS 首页
  try {
    const curUrl = await run(['get', 'url']);
    if (!curUrl.includes('zhipin.com')) {
      console.log('[setup] 打开 BOSS 直聘...');
      await run(['open', 'https://www.zhipin.com']);
      await sleep(5000);
      try { await run(['wait', '--load', 'networkidle'], { timeout: 20000 }); } catch (_) {}
    }
  } catch (_) {
    await run(['open', 'https://www.zhipin.com']);
    await sleep(5000);
    try { await run(['wait', '--load', 'networkidle'], { timeout: 20000 }); } catch (_) {}
  }

  // 4. 等待用户登录并进入聊天页
  console.log('[setup] 请在 Chrome 中登录 BOSS，然后进入聊天页');
  console.log('[setup] (首次使用需要登录，后续会保留登录态)');

  if (!(await waitForChatPage())) {
    console.error('\n[setup] 超时：未检测到聊天页面');
    process.exit(1);
  }
  console.log('\n[setup] 检测到聊天页，开始接管 ✓');

  // 5. 获取联系人
  console.log('\n[main] 获取联系人...');
  const contacts = await getContacts();
  if (contacts.length === 0) {
    console.error('未找到联系人');
    try { await run(['screenshot', '/tmp/boss_debug.png']); console.log('截图: /tmp/boss_debug.png'); } catch (_) {}
    process.exit(1);
  }

  const state = loadState();
  const sentSet = new Set(state.sentContacts || []);
  const unsent = contacts.filter(c => !sentSet.has(c.uid || c.text));

  console.log(`[main] 共 ${contacts.length} 个，已发送 ${sentSet.size} 个，待发送 ${unsent.length} 个`);

  if (unsent.length === 0) { console.log('没有待发送的联系人'); process.exit(0); }

  const actualMax = maxCount > 0 ? Math.min(maxCount, unsent.length) : unsent.length;
  const stats = { sent: 0, failed: 0, total: actualMax, current: 0 };

  console.log(`\n[main] 开始发送 ${actualMax} 个\n`);

  for (let i = 0; i < actualMax; i++) {
    stats.current = i + 1;
    const contact = unsent[i];
    const id = contact.uid || contact.text;

    if (await sendToContact(contact, imagePath, stats)) {
      sentSet.add(id);
      state.sentContacts = Array.from(sentSet);
      saveState(state);
    }

    if (i < actualMax - 1) {
      const delay = Math.floor(Math.random() * 5000) + 3000;
      console.log(`  等待 ${(delay / 1000).toFixed(1)}s...`);
      await sleep(delay);
    }
  }

  saveState(state);
  console.log(`\n完成: 成功 ${stats.sent}  失败 ${stats.failed}`);
}

main().catch(err => { console.error('异常:', err); process.exit(1); });
