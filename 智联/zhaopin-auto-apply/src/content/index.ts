import { detectPageType } from './selectors';
import { scanCurrentPage } from './scanner';
import type { ExtensionMessage, ScannedJob } from '../shared/types';

const pageType = detectPageType();

// 根据 detailUrl 找到职位卡片中的"立即投递"按钮并点击
function clickApplyButton(detailUrl: string): { clicked: boolean; error?: string } {
  const links = document.querySelectorAll(`a[href*="${detailUrl}"]`);
  for (const link of links) {
    let card: Element | null = link.parentElement;
    for (let i = 0; i < 8 && card; i++) {
      const btn = card.querySelector('button.collect-and-apply__btn');
      if (btn) {
        (btn as HTMLElement).click();
        return { clicked: true };
      }
      const buttons = card.querySelectorAll('button');
      for (const b of buttons) {
        if (b.textContent?.includes('立即投递')) {
          (b as HTMLElement).click();
          return { clicked: true };
        }
      }
      card = card.parentElement;
    }
  }

  // 兜底：全局查找 collect-and-apply__btn
  const allButtons = document.querySelectorAll('button.collect-and-apply__btn');
  if (allButtons.length > 0) {
    (allButtons[0] as HTMLElement).click();
    return { clicked: true };
  }

  return { clicked: false, error: '未找到立即投递按钮' };
}

// 消息处理器
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage & { type: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => {
    switch (message.type) {
      case 'PING': {
        sendResponse('PONG');
        return false;
      }

      case 'SCAN_REQUEST': {
        if (pageType !== 'search') {
          sendResponse({
            type: 'SCAN_RESPONSE',
            payload: { jobs: [], pageNumber: 1, totalPages: 1, totalCount: 0 },
          });
          return false;
        }
        const result = scanCurrentPage();
        sendResponse({ type: 'SCAN_RESPONSE', payload: result });
        return false;
      }

      case 'APPLY_SINGLE': {
        const { job } = message.payload;
        const result = clickApplyButton(job.detailUrl);
        sendResponse(result);
        return false;
      }

      default:
        return false;
    }
  }
);

// 只在搜索页注入浮动面板
if (pageType === 'search') {
  import('./float-panel');
}

console.log(`[智联自动投递] Content script loaded on ${pageType} page`);
