// 智联招聘 DOM 选择器
// 策略：联合选择器（文本 > 属性 > 结构），CSS 类名哈希后启用后备方案

export const SELECTORS = {
  // ===== 搜索页 /sou/* =====
  SEARCH: {
    JOB_LIST_CONTAINER: [
      '.joblist-box',
      '.positionlist',
      '[class*="joblist"]',
      '[class*="positionList"]',
    ].join(', '),

    // 单个职位卡片 — 只匹配包含职位链接的直接容器
    JOB_CARD: [
      '.joblist-box__item',
      '.positionlist__item',
    ].join(', '),

    // 职位标题链接（href 包含 /jobdetail/）
    JOB_TITLE_LINK: 'a[href*="/jobdetail/"]',

    SALARY: [
      '.jobinfo__salary',
      '[class*="salary"]',
      '[class*="pay"]',
    ].join(', '),

    COMPANY_LINK: 'a[href*="/companydetail/"]',

    JOB_TAGS: [
      '.jobinfo__tag',
      '[class*="jobInfo__tag"]',
      '[class*="tag"]',
    ].join(', '),

    // "立即投递"按钮 — 精确类名优先
    APPLY_BUTTON: [
      'button.collect-and-apply__btn',
      'button:has-text("立即投递")',
      '[class*="collect-and-apply"] button',
    ].join(', '),

    NEXT_PAGE: [
      'a:has-text("下一页")',
      '.pagination a.next',
      '[class*="pagination"] a:last-child',
    ].join(', '),

    PAGE_CURRENT: [
      '.pagination .active',
      '[class*="pagination"] span.active',
      '[class*="current"]',
    ].join(', '),
  },

  // ===== 投递弹窗（点击立即投递后出现，可能在搜索页或详情页） =====
  MODAL: {
    // 弹窗容器
    CONTAINER: [
      '[class*="dialog"]',
      '[class*="modal"]',
      '.el-dialog',
      '.ant-modal',
      '[class*="popup"]',
      '[class*="drawer"]',
      '[role="dialog"]',
    ].join(', '),

    // 招呼语输入框
    GREETING_INPUT: [
      'textarea[placeholder*="打招呼"]',
      'textarea[placeholder*="自我介绍"]',
      'textarea[placeholder*="沟通"]',
      'textarea[placeholder*="留言"]',
      '[class*="greeting"] textarea',
      '[class*="message"] textarea',
      '[class*="chat"] textarea',
      '#chat-input',
    ].join(', '),

    // 确认按钮
    CONFIRM_BUTTON: [
      'button:has-text("确认投递")',
      'button:has-text("发送")',
      'button:has-text("投递简历")',
      'button:has-text("立即投递")',
      '[class*="confirm"] button',
      '[class*="submit"] button',
      '[class*="send"] button',
    ].join(', '),

    // 成功标记
    SUCCESS_TEXT: [
      ':contains("投递成功")',
      ':contains("简历已发送")',
      ':contains("申请成功")',
      ':contains("投递已完成")',
    ].join(', '),
  },

  // ===== 通用 =====
  COMMON: {
    VERIFICATION: [
      'img[src*="captcha"]',
      'img[src*="verify"]',
      '[class*="captcha"]',
      '[class*="verify"]',
      ':contains("验证码")',
      ':contains("滑块验证")',
      ':contains("请完成安全验证")',
      '.yidun',
      '.geetest',
      '#nc_1_n1z',
    ].join(', '),

    CLOSE_BUTTON: [
      '[class*="close"]',
      '.el-icon-close',
      '.ant-modal-close',
      'button:has-text("取消")',
      'button:has-text("关闭")',
      '[aria-label="关闭"]',
      '[aria-label="Close"]',
    ].join(', '),

    LOADING: [
      '[class*="loading"]',
      '[class*="spinner"]',
      '.el-loading-mask',
      '.ant-spin',
    ].join(', '),
  },
} as const;

// ===== 工具函数 =====

export function hasText(el: Element, text: string): boolean {
  return el.textContent?.includes(text) ?? false;
}

export function findByText(
  container: Element | Document,
  selector: string,
  text: string
): Element | null {
  const elements = container.querySelectorAll(selector);
  for (const el of elements) {
    if (hasText(el, text)) return el;
  }
  return null;
}

export function detectPageType(): 'search' | 'job_detail' | 'company_detail' | 'passport' | 'unknown' {
  const url = window.location.href;
  if (url.includes('zhaopin.com/sou/')) return 'search';
  if (url.includes('zhaopin.com/jobdetail/')) return 'job_detail';
  if (url.includes('zhaopin.com/companydetail/')) return 'company_detail';
  if (url.includes('passport.zhaopin.com')) return 'passport';
  return 'unknown';
}
