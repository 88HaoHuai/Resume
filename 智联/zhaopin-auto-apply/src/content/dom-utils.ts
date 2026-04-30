import { SELECTORS } from './selectors';

// ===== 随机延迟 =====

export function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===== 元素查找（遍历联合选择器） =====

export function findElement(selectors: string): Element | null {
  const selectorList = selectors.split(',').map((s) => s.trim());
  for (const sel of selectorList) {
    try {
      // 跳过 :has-text 和 :contains 伪选择器（原生不支持）
      if (sel.includes(':has-text(') || sel.includes(':contains(')) {
        const found = findElementByText(sel);
        if (found) return found;
        continue;
      }
      const el = document.querySelector(sel);
      if (el && isVisible(el)) return el;
    } catch {
      // 选择器语法错误，跳过
    }
  }
  return null;
}

// 处理 :has-text() 和 :contains() 伪选择器
function findElementByText(selector: string): Element | null {
  // 提取文本和基础选择器
  const hasTextMatch = selector.match(/(.+):has-text\("(.+)"\)/);
  const containsMatch = selector.match(/(.*):contains\("(.+)"\)/);
  const match = hasTextMatch || containsMatch;
  if (!match) return null;

  const baseSelector = match[1] || '*';
  const text = match[2];

  const elements = document.querySelectorAll(baseSelector);
  for (const el of elements) {
    if (el.textContent?.includes(text) && isVisible(el)) {
      return el;
    }
  }
  return null;
}

// ===== 元素可见性检查 =====

export function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

// ===== 等待元素出现 =====

export async function waitForElement(
  selectors: string,
  options?: { timeout?: number; visible?: boolean }
): Promise<Element | null> {
  const timeout = options?.timeout ?? 10000;
  const requireVisible = options?.visible ?? true;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const el = findElement(selectors);
    if (el && (!requireVisible || isVisible(el))) return el;
    await sleep(200);
  }
  return null;
}

// ===== 等待元素消失 =====

export async function waitForElementGone(
  selectors: string,
  timeout: number = 5000
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = findElement(selectors);
    if (!el) return true;
    await sleep(200);
  }
  return false;
}

// ===== 滚动到可见位置 =====

export function scrollIntoView(el: Element): void {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ===== 填充输入框（处理多种输入组件） =====

export function fillInput(el: Element, text: string): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    // 使用原生 setter 触发 React 响应
    const nativeSetter = Object.getOwnPropertyDescriptor(
      el instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(el, text);
    } else {
      el.value = text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new CompositionEvent('compositionend', {
      data: text,
      bubbles: true,
    }));
    return;
  }

  // contenteditable div
  if (el.getAttribute('contenteditable') === 'true') {
    el.textContent = text;
    el.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: text,
    }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  // 其他情况：直接设置 textContent 或 innerText
  (el as HTMLElement).innerText = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ===== 模拟逐字输入（类人行为） =====

export async function typeHumanLike(
  el: Element,
  text: string,
  delayMs: number = 50
): Promise<void> {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      el instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype,
      'value'
    )?.set;

    let currentValue = '';
    for (const char of text) {
      currentValue += char;
      if (nativeSetter) {
        nativeSetter.call(el, currentValue);
      } else {
        el.value = currentValue;
      }
      el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      el.dispatchEvent(new InputEvent('input', {
        data: char,
        inputType: 'insertText',
        bubbles: true,
      }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
      await sleep(delayMs + Math.random() * 80);
    }
    el.dispatchEvent(new CompositionEvent('compositionend', {
      data: text,
      bubbles: true,
    }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    // 非标准输入框：直接填充
    fillInput(el, text);
    await sleep(text.length * delayMs);
  }
}

// ===== CDP 可信点击（通过 background 中转） =====

export async function trustedClick(el: Element, offsetRandom: boolean = true): Promise<void> {
  const rect = el.getBoundingClientRect();
  let x = rect.x + rect.width / 2;
  let y = rect.y + rect.height / 2;

  if (offsetRandom) {
    x += (Math.random() - 0.5) * 10;
    y += (Math.random() - 0.5) * 10;
  }

  chrome.runtime.sendMessage({
    type: 'CDP_CLICK',
    payload: { x: Math.round(x), y: Math.round(y), clickCount: 1 },
  });
}

// ===== 标准点击（带滚动 + 延迟） =====

export async function clickElement(el: Element, useCdp: boolean = true): Promise<void> {
  scrollIntoView(el);
  await randomDelay(200, 500);

  if (useCdp) {
    await trustedClick(el);
  } else {
    (el as HTMLElement).click();
  }
}

// ===== 查找并点击 =====

export async function findAndClick(
  selectors: string,
  useCdp: boolean = true,
  timeout: number = 5000
): Promise<boolean> {
  const el = await waitForElement(selectors, { timeout });
  if (!el) return false;
  await clickElement(el, useCdp);
  return true;
}

// ===== 检测验证码 =====

export function detectVerification(): boolean {
  const el = findElement(SELECTORS.COMMON.VERIFICATION);
  return el !== null;
}

// ===== 关闭弹窗 =====

export async function closeModal(): Promise<boolean> {
  return findAndClick(SELECTORS.COMMON.CLOSE_BUTTON, false, 2000);
}

// ===== 检查加载状态 =====

export function isLoading(): boolean {
  return findElement(SELECTORS.COMMON.LOADING) !== null;
}

export async function waitForLoadComplete(timeout: number = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (!isLoading()) return;
    await sleep(300);
  }
}
