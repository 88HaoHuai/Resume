/**
 * 通用工具函数
 */

const BossHelper = {
  /**
   * 生成指定范围内的随机整数
   * @param {number} min - 最小值（包含）
   * @param {number} max - 最大值（包含）
   * @returns {number}
   */
  randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  /**
   * 生成正态分布的随机延迟时间
   * 使用 Box-Muller 变换，使延迟更接近真人行为
   * @param {number} min - 最小延迟（毫秒）
   * @param {number} max - 最大延迟（毫秒）
   * @returns {number} 延迟时间（毫秒）
   */
  randomDelay(min, max) {
    const mean = (min + max) / 2;
    const stdDev = (max - min) / 6;
    let u1 = Math.random();
    let u2 = Math.random();
    // Box-Muller 变换
    let normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    let result = mean + stdDev * normal;
    // 限制在 [min, max] 范围内
    return Math.max(min, Math.min(max, Math.round(result)));
  },

  /**
   * 异步等待指定时间
   * @param {number} ms - 等待毫秒数
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * 异步等待随机时间
   * @param {number} min - 最小延迟（毫秒）
   * @param {number} max - 最大延迟（毫秒）
   * @returns {Promise<void>}
   */
  async randomSleep(min, max) {
    const delay = this.randomDelay(min, max);
    BossLogger.debug(`等待 ${(delay / 1000).toFixed(1)} 秒...`);
    await this.sleep(delay);
  },

  /**
   * 安全地查询 DOM 元素，支持重试
   * @param {string} selector - CSS 选择器
   * @param {number} maxRetries - 最大重试次数
   * @param {number} retryInterval - 重试间隔（毫秒）
   * @returns {Promise<Element|null>}
   */
  async waitForElement(selector, maxRetries = 10, retryInterval = 500) {
    for (let i = 0; i < maxRetries; i++) {
      const el = document.querySelector(selector);
      if (el) return el;
      await this.sleep(retryInterval);
    }
    BossLogger.warn(`元素未找到: ${selector}`);
    return null;
  },

  /**
   * 等待多个元素中的任意一个出现
   * @param {string[]} selectors - CSS 选择器数组
   * @param {number} maxRetries - 最大重试次数
   * @param {number} retryInterval - 重试间隔（毫秒）
   * @returns {Promise<{element: Element, index: number}|null>}
   */
  async waitForAnyElement(selectors, maxRetries = 10, retryInterval = 500) {
    for (let i = 0; i < maxRetries; i++) {
      for (let j = 0; j < selectors.length; j++) {
        const el = document.querySelector(selectors[j]);
        if (el) return { element: el, index: j };
      }
      await this.sleep(retryInterval);
    }
    return null;
  },

  /**
   * 从薪资文本中解析出月薪范围，单位统一为 K。
   * 例如 "15-30K" → { min: 15, max: 30, parsed: true }
   * 例如 "1.5-3万" → { min: 15, max: 30, parsed: true }
   * 例如 BOSS 混淆字符 "-K" → { min: 20, max: 40, parsed: true }
   * @param {string} salaryText - 薪资文本
   * @returns {{min: number, max: number, parsed: boolean}}
   */
  parseSalary(salaryText) {
    if (!salaryText) return { min: 0, max: 0, parsed: false };

    const text = String(salaryText)
      .replace(/[\uE000-\uF8FF]/g, (ch) => {
        const lo = ch.charCodeAt(0) & 0xFF;
        return lo >= 0x30 && lo <= 0x39 ? String.fromCharCode(lo) : ch;
      })
      .replace(/\s+/g, '');

    if (/面议|薪资面议/.test(text)) return { min: 0, max: 0, parsed: false };

    let match = text.match(/(\d+(?:\.\d+)?)\s*[Kk]\s*[-~～]\s*(\d+(?:\.\d+)?)\s*[Kk]/);
    if (match) {
      return { min: Number(match[1]), max: Number(match[2]), parsed: true };
    }

    match = text.match(/(\d+(?:\.\d+)?)\s*[-~～]\s*(\d+(?:\.\d+)?)\s*[Kk]/);
    if (match) {
      return { min: Number(match[1]), max: Number(match[2]), parsed: true };
    }

    match = text.match(/(\d+(?:\.\d+)?)\s*[-~～]\s*(\d+(?:\.\d+)?)\s*万/);
    if (match) {
      return { min: Number(match[1]) * 10, max: Number(match[2]) * 10, parsed: true };
    }

    match = text.match(/(\d+(?:\.\d+)?)\s*[-~～]\s*(\d+(?:\.\d+)?)\s*千/);
    if (match) {
      return { min: Number(match[1]), max: Number(match[2]), parsed: true };
    }

    match = text.match(/(\d{4,6})\s*[-~～]\s*(\d{4,6})\s*元/);
    if (match) {
      return { min: Number(match[1]) / 1000, max: Number(match[2]) / 1000, parsed: true };
    }

    return { min: 0, max: 0, parsed: false };
  },

  /**
   * 获取今天的日期字符串（YYYY-MM-DD）
   * @returns {string}
   */
  getTodayStr() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  },

  /**
   * 获取当前时间戳字符串
   * @returns {string}
   */
  getTimestamp() {
    return new Date().toLocaleString('zh-CN', { hour12: false });
  },

  /**
   * 截断字符串到指定长度
   * @param {string} str - 原始字符串
   * @param {number} maxLen - 最大长度
   * @returns {string}
   */
  truncate(str, maxLen = 50) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
  },

  /**
   * 生成唯一 ID
   * @returns {string}
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  },

  /**
   * 防抖函数
   * @param {Function} fn - 目标函数
   * @param {number} delay - 延迟时间（毫秒）
   * @returns {Function}
   */
  debounce(fn, delay = 300) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  /**
   * 判断当前页面是否为职位列表页
   * @returns {boolean}
   */
  isJobListPage() {
    return PAGE_PATTERNS.JOB_LIST.test(window.location.href);
  },

  /**
   * 判断当前页面是否为职位详情页
   * @returns {boolean}
   */
  isJobDetailPage() {
    return PAGE_PATTERNS.JOB_DETAIL.test(window.location.href);
  },

  /**
   * 判断当前页面是否为聊天页
   * @returns {boolean}
   */
  isChatPage() {
    return PAGE_PATTERNS.CHAT.test(window.location.href);
  },
};
