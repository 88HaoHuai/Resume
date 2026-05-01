/**
 * 发送按钮检测与点击模块
 */
const { evalStdin, sleep } = require('./browser');
const { CHECK_SEND_BUTTON, CLICK_SEND_BUTTON, HANDLE_CONFIRM_DIALOG, CHECK_MESSAGE_SENT } = require('./eval-scripts');

/**
 * 等待发送按钮变为 enabled，然后点击发送
 * @returns {Promise<boolean>} 是否发送成功
 */
async function clickSend() {
  console.log('[send] 等待发送按钮 enabled...');

  // 轮询发送按钮状态（最多等 15 秒）
  for (let i = 0; i < 15; i++) {
    const raw = await evalStdin(CHECK_SEND_BUTTON);
    try {
      const buttons = JSON.parse(raw);
      const enabled = buttons.find(b => b.visible && !b.disabled);

      if (enabled) {
        console.log(`[send] 发送按钮已 enabled (轮次${i + 1}): ${enabled.sel}`);
        break;
      }
      console.log(`[send] 等待... (轮次${i + 1})`);
    } catch (_) {}

    await sleep(1000);
  }

  // 点击发送按钮
  console.log('[send] 点击发送...');
  const result = await evalStdin(CLICK_SEND_BUTTON);
  console.log(`[send] 点击结果: ${result}`);

  await sleep(1500);

  // 处理可能的确认弹窗
  const dialogResult = await evalStdin(HANDLE_CONFIRM_DIALOG);
  if (dialogResult.startsWith('confirmed')) {
    console.log(`[send] 确认弹窗: ${dialogResult}`);
    await sleep(1000);
  }

  // 等待发送完成
  await sleep(2000);

  // 检查发送状态
  const sentResult = await evalStdin(CHECK_MESSAGE_SENT);
  console.log(`[send] 发送状态: ${sentResult}`);

  return true;
}

module.exports = { clickSend };
