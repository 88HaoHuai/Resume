import type { ExtensionMessage } from './types';

// 向 background 发送消息
export function sendToBackground(message: ExtensionMessage): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}

// 向当前活动 tab 的 content script 发送消息
export async function sendToContentScript(
  message: ExtensionMessage,
  tabId?: number
): Promise<unknown> {
  if (tabId !== undefined) {
    return chrome.tabs.sendMessage(tabId, message);
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found');
  return chrome.tabs.sendMessage(tab.id, message);
}

// 监听消息（在 background 或 popup 中使用）
export function onMessage(
  handler: (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => boolean | void
): () => void {
  chrome.runtime.onMessage.addListener(handler);
  return () => chrome.runtime.onMessage.removeListener(handler);
}
