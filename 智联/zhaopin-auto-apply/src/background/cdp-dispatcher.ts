// CDP (Chrome DevTools Protocol) 分发器 — 通过 debugger API 执行可信点击

let attachedTabId: number | null = null;

// 附加到标签页
async function attach(tabId: number): Promise<void> {
  if (attachedTabId === tabId) return; // 已附加

  // 如果已附加到其他标签，先分离
  if (attachedTabId !== null) {
    await detach(attachedTabId);
  }

  await chrome.debugger.attach({ tabId }, '1.3');
  attachedTabId = tabId;
}

// 分离标签页
async function detach(tabId: number): Promise<void> {
  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    // 可能已经分离了
  }
  if (attachedTabId === tabId) {
    attachedTabId = null;
  }
}

// 执行可信鼠标点击
export async function dispatchMouseClick(
  tabId: number,
  x: number,
  y: number,
  clickCount: number = 1
): Promise<void> {
  await attach(tabId);

  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount,
  });

  // 短暂延迟模拟真实按下-释放间隔
  await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));

  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount,
  });
}

// 清理附件（在 tab 关闭时调用）
export async function cleanup(tabId: number): Promise<void> {
  await detach(tabId);
}

// 监听 tab 关闭，自动清理
chrome.tabs.onRemoved.addListener((tabId) => {
  if (attachedTabId === tabId) {
    attachedTabId = null;
  }
});

// 监听调试器分离事件
chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId && attachedTabId === source.tabId) {
    attachedTabId = null;
    console.log(`[CDP] Debugger detached from tab ${source.tabId}: ${reason}`);
  }
});
