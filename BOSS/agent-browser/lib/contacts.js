/**
 * 联系人提取与迭代模块
 * 通过 eval 脚本获取聊天页联系人列表
 */
const { evalStdin, sleep, randomSleep } = require('./browser');
const { GET_CONTACTS, clickContact, WAIT_CHAT_LOADED } = require('./eval-scripts');

/**
 * 获取所有联系人
 * @returns {Promise<Array<{index: number, text: string, uid: string}>>}
 */
async function getContacts() {
  const raw = await evalStdin(GET_CONTACTS);
  const data = JSON.parse(raw);
  console.log(`[contacts] 发现 ${data.count} 个联系人`);
  return data.contacts || [];
}

/**
 * 点击指定序号的联系人并等待聊天加载
 * @param {number} index - 联系人在列表中的索引
 * @returns {Promise<boolean>} 是否加载成功
 */
async function openChat(index) {
  const script = clickContact(index);
  const result = await evalStdin(script);
  console.log(`[contacts] 点击联系人[${index}]: ${result}`);

  if (result.startsWith('not_found')) {
    console.error(`[contacts] ${result}`);
    return false;
  }

  // 等待聊天加载
  await sleep(2000);

  for (let i = 0; i < 10; i++) {
    const raw = await evalStdin(WAIT_CHAT_LOADED);
    try {
      const data = JSON.parse(raw);
      if (data.loaded) {
        console.log(`[contacts] 聊天加载完成 (轮次${i + 1})`);
        return true;
      }
    } catch (_) {}
    await sleep(1000);
  }

  console.warn('[contacts] 聊天加载超时（可能页面未完全渲染）');
  return true; // 继续尝试发送
}

module.exports = { getContacts, openChat };
