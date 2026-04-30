import type { ApplyStatus } from '../shared/types';
import { SELECTORS } from './selectors';
import {
  waitForElement,
  clickElement,
  typeHumanLike,
  detectVerification,
  randomDelay,
  findElement,
  waitForLoadComplete,
  isVisible,
  waitForElementGone,
} from './dom-utils';
import { TIMING } from '../shared/constants';

export interface ApplyResult {
  status: ApplyStatus;
  greetingUsed: string;
  errorMessage?: string;
}

// 替换模板变量
function expandTemplate(template: string, jobInfo: { company: string; title: string }): string {
  return template
    .replace(/\{公司名\}/g, jobInfo.company)
    .replace(/\{职位名\}/g, jobInfo.title)
    .replace(/\{我的优势\}/g, '我具备相关经验');
}

// 根据职位 detailUrl 找到对应的卡片容器
function findJobCardByUrl(detailUrl: string): Element | null {
  const links = document.querySelectorAll(`a[href*="${detailUrl}"]`);
  for (const link of links) {
    // 向上查找卡片容器
    let el: Element | null = link.parentElement;
    for (let i = 0; i < 8 && el; i++) {
      // 检查是否匹配已知的卡片类名
      const cls = el.className || '';
      if (
        cls.includes('joblist-box__item') ||
        cls.includes('positionlist__item') ||
        (el.tagName === 'DIV' && el.querySelector('a[href*="/jobdetail/"]') && el.querySelector('button'))
      ) {
        return el;
      }
      el = el.parentElement;
    }
  }
  return null;
}

// 在卡片内找到"立即投递"按钮
function findApplyButtonInCard(card: Element): Element | null {
  // 优先使用精确类名
  const exactBtn = card.querySelector('button.collect-and-apply__btn');
  if (exactBtn && isVisible(exactBtn)) return exactBtn;

  // 文本匹配
  const buttons = card.querySelectorAll('button');
  for (const btn of buttons) {
    if (btn.textContent?.includes('立即投递') && isVisible(btn)) {
      return btn;
    }
  }
  return null;
}

// 关闭弹窗
async function tryCloseModal(): Promise<void> {
  const closeBtn = findElement(SELECTORS.COMMON.CLOSE_BUTTON);
  if (closeBtn) {
    (closeBtn as HTMLElement).click();
    await randomDelay(500, 1000);
  }
}

// ===== 主入口：在搜索页上执行投递 =====

export async function executeApply(
  companyName: string,
  jobTitle: string,
  greetingTemplate: string,
  detailUrl?: string
): Promise<ApplyResult> {
  const greetingText = expandTemplate(greetingTemplate, {
    company: companyName,
    title: jobTitle,
  });

  try {
    // Step 1: 定位职位卡片
    let card: Element | null = null;

    if (detailUrl) {
      card = findJobCardByUrl(detailUrl);
    }

    // 如果 URL 方式找不到，尝试用标题文本定位
    if (!card) {
      const allCards = document.querySelectorAll(SELECTORS.SEARCH.JOB_CARD);
      for (const c of allCards) {
        const link = c.querySelector(SELECTORS.SEARCH.JOB_TITLE_LINK);
        if (link?.textContent?.trim() === jobTitle) {
          card = c;
          break;
        }
      }
    }

    if (!card) {
      // 最后兜底：直接在整个页面找按钮
      const globalBtn = findElement(SELECTORS.SEARCH.APPLY_BUTTON);
      if (!globalBtn) {
        return { status: 'error', greetingUsed: greetingText, errorMessage: '未找到职位卡片或投递按钮' };
      }
      card = globalBtn.closest('div') || document.body;
    }

    // Step 2: 检查是否已投递
    const cardText = card.textContent || '';
    if (cardText.includes('已投递') || cardText.includes('已申请')) {
      return { status: 'already_applied', greetingUsed: greetingText };
    }

    // Step 3: 找到并点击"立即投递"按钮
    const applyBtn = findApplyButtonInCard(card);
    if (!applyBtn) {
      return { status: 'error', greetingUsed: greetingText, errorMessage: '未找到立即投递按钮' };
    }

    await clickElement(applyBtn);
    await randomDelay(TIMING.MODAL_WAIT_MIN, TIMING.MODAL_WAIT_MAX);

    // Step 4: 等待弹窗
    const modal = await waitForElement(SELECTORS.MODAL.CONTAINER, {
      timeout: TIMING.MODAL_WAIT_TIMEOUT,
    });

    if (!modal) {
      // 可能在按钮点击后没有弹窗，检查是否有变化
      await randomDelay(1000, 2000);
    }

    // Step 5: 检测验证码
    if (detectVerification()) {
      chrome.runtime.sendMessage({
        type: 'VERIFICATION_REQUIRED',
        payload: { message: '检测到验证码，请手动完成验证后继续', jobTitle },
      });
      return { status: 'verification_needed', greetingUsed: greetingText };
    }

    // Step 6: 填写招呼语
    const greetingInput = await waitForElement(SELECTORS.MODAL.GREETING_INPUT, {
      timeout: 5000,
    });
    if (greetingInput) {
      await typeHumanLike(greetingInput, greetingText, TIMING.TYPING_DELAY_MS);
      await randomDelay(500, 1000);
    }

    // Step 7: 点击确认按钮
    const confirmBtn = await waitForElement(SELECTORS.MODAL.CONFIRM_BUTTON, {
      timeout: 5000,
    });
    if (!confirmBtn) {
      // 尝试关闭弹窗
      await tryCloseModal();
      return { status: 'error', greetingUsed: greetingText, errorMessage: '未找到确认按钮' };
    }

    await clickElement(confirmBtn);
    await randomDelay(TIMING.AFTER_APPLY_MIN, TIMING.AFTER_APPLY_MAX);

    // Step 8: 检查结果
    const successEl = findElement(SELECTORS.MODAL.SUCCESS_TEXT);
    if (successEl) {
      await tryCloseModal();
      return { status: 'success', greetingUsed: greetingText };
    }

    // 没有明确的成功标记但也没报错，等弹窗消失
    const modalGone = await waitForElementGone(SELECTORS.MODAL.CONTAINER, 3000);
    if (modalGone) {
      return { status: 'success', greetingUsed: greetingText };
    }

    return { status: 'success', greetingUsed: greetingText };
  } catch (err) {
    return {
      status: 'error',
      greetingUsed: greetingText,
      errorMessage: err instanceof Error ? err.message : '未知错误',
    };
  }
}
