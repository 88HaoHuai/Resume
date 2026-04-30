/**
 * 鼠标行为模拟器
 * 使用贝塞尔曲线生成自然的鼠标移动轨迹，降低被风控检测的风险
 */

const MouseSimulator = {
  /**
   * 模拟自然的鼠标移动到目标元素
   * @param {Element} target - 目标 DOM 元素
   * @returns {Promise<void>}
   */
  async moveTo(target) {
    if (!target) return;

    const rect = target.getBoundingClientRect();
    // 目标点添加随机偏移，不总是点击正中心
    const targetX = rect.left + rect.width * (0.3 + Math.random() * 0.4);
    const targetY = rect.top + rect.height * (0.3 + Math.random() * 0.4);

    // 起始点（当前鼠标位置，或随机起点）
    const startX = this._lastX || (Math.random() * window.innerWidth);
    const startY = this._lastY || (Math.random() * window.innerHeight);

    // 生成贝塞尔曲线路径点
    const points = this._generateBezierPath(startX, startY, targetX, targetY);

    // 沿路径发送 mousemove 事件
    for (const point of points) {
      const event = new MouseEvent('mousemove', {
        clientX: point.x,
        clientY: point.y,
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      // 每个点之间短暂停顿，模拟真人移动速度
      await BossHelper.sleep(BossHelper.randomInt(5, 20));
    }

    // 记录最后位置
    this._lastX = targetX;
    this._lastY = targetY;
  },

  /**
   * 模拟点击目标元素（含鼠标移动）
   * @param {Element} target - 目标 DOM 元素
   * @returns {Promise<void>}
   */
  async click(target) {
    if (!target) {
      BossLogger.warn('点击目标为空');
      return;
    }

    // 先移动到目标位置
    await this.moveTo(target);

    // 短暂停顿后点击
    await BossHelper.sleep(BossHelper.randomInt(100, 300));

    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    // 依次触发 mousedown → mouseup → click 事件
    const events = ['mousedown', 'mouseup', 'click'];
    for (const type of events) {
      const event = new MouseEvent(type, {
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
        view: window,
      });
      target.dispatchEvent(event);
      await BossHelper.sleep(BossHelper.randomInt(30, 80));
    }

    BossLogger.debug(`模拟点击完成: ${target.tagName}.${target.className}`);
  },

  /**
   * 模拟自然滚动
   * @param {number} distance - 滚动距离（像素）
   * @param {number} duration - 滚动时长（毫秒）
   */
  async scroll(distance, duration = 1000) {
    const steps = BossHelper.randomInt(10, 20);
    const stepDistance = distance / steps;
    const stepDuration = duration / steps;

    for (let i = 0; i < steps; i++) {
      // 每一步的距离添加随机抖动
      const jitter = stepDistance * (0.5 + Math.random());
      window.scrollBy({
        top: jitter,
        behavior: 'auto',
      });
      // 偶尔暂停，模拟阅读
      if (Math.random() < 0.2) {
        await BossHelper.sleep(BossHelper.randomInt(200, 800));
      } else {
        await BossHelper.sleep(stepDuration);
      }
    }
  },

  /**
   * 生成贝塞尔曲线路径
   * @param {number} x0 - 起始 X
   * @param {number} y0 - 起始 Y
   * @param {number} x3 - 终点 X
   * @param {number} y3 - 终点 Y
   * @returns {Array<{x: number, y: number}>}
   * @private
   */
  _generateBezierPath(x0, y0, x3, y3) {
    const points = [];
    const steps = BossHelper.randomInt(15, 30);

    // 随机控制点，制造自然的曲线轨迹
    const dx = x3 - x0;
    const dy = y3 - y0;
    const x1 = x0 + dx * 0.3 + (Math.random() - 0.5) * 100;
    const y1 = y0 + dy * 0.1 + (Math.random() - 0.5) * 100;
    const x2 = x0 + dx * 0.7 + (Math.random() - 0.5) * 80;
    const y2 = y0 + dy * 0.9 + (Math.random() - 0.5) * 80;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      // 三次贝塞尔曲线公式
      const x = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3;
      const y = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3;

      // 添加微小的随机抖动
      points.push({
        x: x + (Math.random() - 0.5) * 2,
        y: y + (Math.random() - 0.5) * 2,
      });
    }

    return points;
  },

  // 记录最后的鼠标位置
  _lastX: 0,
  _lastY: 0,

  /**
   * 模拟在输入框中逐字输入文本
   * @param {Element} inputEl - 输入框元素
   * @param {string} text - 要输入的文本
   */
  async typeText(inputEl, text) {
    if (!inputEl || !text) return;

    // 先聚焦
    inputEl.focus();
    inputEl.dispatchEvent(new Event('focus', { bubbles: true }));
    await BossHelper.sleep(BossHelper.randomInt(200, 500));

    // 清空已有内容
    inputEl.value = '';
    inputEl.textContent = '';
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));

    // 逐字输入
    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // 对于 contenteditable 元素
      if (inputEl.getAttribute('contenteditable') !== null) {
        inputEl.textContent += char;
      } else {
        inputEl.value += char;
      }

      // 触发输入事件
      inputEl.dispatchEvent(new InputEvent('input', {
        data: char,
        inputType: 'insertText',
        bubbles: true,
        cancelable: true,
      }));

      // 每个字符之间的随机间隔（模拟打字速度）
      await BossHelper.sleep(BossHelper.randomInt(50, 150));
    }

    // 触发 change 事件
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    BossLogger.debug(`模拟输入完成: "${BossHelper.truncate(text, 30)}"`);
  },
};
