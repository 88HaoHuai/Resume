/**
 * 图片简历发送器（v3 — Vue 兼容）
 * 在聊天页面自动发送图片格式的简历（单次发送）
 */
const ResumeSender = {
  async sendResume() {
    try {
      BossLogger.info('开始发送图片简历...');

      const base64Data = await this._getResumeData();
      if (!base64Data) {
        BossLogger.warn('未找到图片简历数据，跳过发送');
        return false;
      }

      const file = await this._base64ToFile(base64Data, 'resume.jpg');
      if (!file) {
        BossLogger.error('Base64 转 File 失败');
        return false;
      }

      BossLogger.debug(`简历文件大小: ${(file.size / 1024).toFixed(1)} KB`);

      // 方案1：直接注入 btn-sendimg 内的 INPUT
      if (await this._injectViaSendImgInput(file)) return true;
      // 方案2：mock showOpenFilePicker
      if (await this._interceptFilePickerAndClick(file, 'mock')) return true;
      // 方案3：AbortError 降级
      if (await this._interceptFilePickerAndClick(file, 'abort')) return true;
      if (await this._pasteImage(file)) return true;
      if (await this._dragToChat(file)) return true;
      if (await this._bruteForce(file)) return true;

      BossLogger.error('所有发送方案均失败');
      return false;
    } catch (err) {
      BossLogger.error('发送图片简历异常:', err);
      return false;
    }
  },

  // ===================== 方案1: 注入 btn-sendimg 内的 INPUT =====================

  async _injectViaSendImgInput(file) {
    const sendImgBtn = document.querySelector('.btn-sendimg, [class*="btn-sendimg"], [title="发送图片"]');
    if (!sendImgBtn?.offsetParent) return false;

    const fileInput = sendImgBtn.querySelector('input[type="file"]');
    if (!fileInput) return false;

    const dt = new DataTransfer();
    dt.items.add(file);
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
    if (desc?.set) { desc.set.call(fileInput, dt.files); } else { fileInput.files = dt.files; }
    if (fileInput._valueTracker) fileInput._valueTracker.setValue('');
    fileInput.dispatchEvent(new Event('input', { bubbles: true }));
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    // 等发送按钮 enabled
    for (let i = 0; i < 20; i++) {
      const sendBtn = document.querySelector('.btn-send, .btn-sure-v2, button.btn-send');
      if (sendBtn?.offsetParent && !sendBtn.classList.contains('disabled') && !sendBtn.disabled) {
        await MouseSimulator.click(sendBtn);
        await BossHelper.sleep(2000);
        return true;
      }
      await BossHelper.sleep(500);
    }

    // 降级：手动移除 disabled 并点击
    const sendBtn = document.querySelector('.btn-send, .btn-sure-v2, button.btn-send');
    if (sendBtn?.offsetParent) {
      sendBtn.classList.remove('disabled');
      sendBtn.disabled = false;
      await MouseSimulator.click(sendBtn);
      await BossHelper.sleep(2000);
      return true;
    }

    return false;
  },

  async _interceptFilePickerAndClick(file, mode = 'mock') {
    const imgBtn = this._findImageButton();
    if (!imgBtn) return false;

    const hasFSP = typeof window.showOpenFilePicker === 'function';

    // Abort 模式：抛异常触发 BOSS 降级
    if (mode === 'abort' && hasFSP) {
      const origFSP = window.showOpenFilePicker;
      window.showOpenFilePicker = async () => { throw new DOMException('Aborted', 'AbortError'); };
      const existing = new Set(document.querySelectorAll('input[type="file"]'));
      await MouseSimulator.click(imgBtn);
      await BossHelper.sleep(2000);
      window.showOpenFilePicker = origFSP;
      for (const inp of document.querySelectorAll('input[type="file"]')) {
        if (!existing.has(inp) && inp.offsetParent) {
          await this._vueInjectFile(inp, file);
          await BossHelper.sleep(2000);
          return await this._handleConfirmOrSend();
        }
      }
      return false;
    }

    // Mock 模式
    if (!hasFSP) return false;

    class MockFSH {
      constructor(file) { this._f = file; }
      get kind() { return 'file'; }
      get name() { return this._f.name; }
      async getFile() { return this._f; }
      async queryPermission() { return 'granted'; }
      async requestPermission() { return 'granted'; }
      async isSameEntry(o) { return o === this; }
      async createWritable() { return { write: async () => {}, close: async () => {}, seek: async () => {}, truncate: async () => {}, get locked() { return false; }, abort: async () => {} }; }
      async remove() {}
      async move() {}
    }
    Object.defineProperty(MockFSH.prototype, Symbol.toStringTag, { value: 'FileSystemFileHandle' });
    Object.defineProperty(MockFSH.prototype.constructor, 'name', { value: 'FileSystemFileHandle' });

    const mockHandle = new MockFSH(file);

    let pickerIntercepted = false, capturedInput = null;
    const existingInputs = new Set(document.querySelectorAll('input[type="file"]'));

    const origFSP = window.showOpenFilePicker;
    window.showOpenFilePicker = async () => { pickerIntercepted = true; return [mockHandle]; };

    const origClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type === 'file') { capturedInput = this; return; }
      return origClick.call(this);
    };

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.tagName === 'INPUT' && node.type === 'file') capturedInput = capturedInput || node;
          if (node.querySelectorAll) {
            const inps = node.querySelectorAll('input[type="file"]');
            if (inps.length > 0) capturedInput = capturedInput || inps[0];
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    await MouseSimulator.click(imgBtn);
    await BossHelper.sleep(1500);

    window.showOpenFilePicker = origFSP;
    HTMLInputElement.prototype.click = origClick;
    observer.disconnect();

    if (pickerIntercepted) {
      BossLogger.info('showOpenFilePicker 已拦截');
      for (let i = 0; i < 5; i++) {
        await BossHelper.sleep(2000);
        if (await this._handleConfirmOrSend()) return true;
        const input = this._findChatInput() || document.activeElement;
        if (input && input !== document.body) {
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        }
        const vw = window.innerWidth, vh = window.innerHeight;
        for (const el of document.querySelectorAll('i, svg, button, span, div')) {
          if (!el.offsetParent) continue;
          const r = el.getBoundingClientRect();
          if (r.x > vw * 0.6 && r.y > vh - 180 && r.width > 15 && r.width < 150 && r.height > 15 && r.height < 80) {
            await MouseSimulator.click(el);
            await BossHelper.sleep(600);
          }
        }
      }
      return true;
    }

    if (capturedInput) {
      await this._vueInjectFile(capturedInput, file);
      await BossHelper.sleep(2000);
      return await this._handleConfirmOrSend();
    }

    for (const inp of document.querySelectorAll('input[type="file"]')) {
      if (!existingInputs.has(inp)) {
        await this._vueInjectFile(inp, file);
        await BossHelper.sleep(2000);
        return await this._handleConfirmOrSend();
      }
    }

    return false;
  },

  // ===================== 方案2: 粘贴 =====================

  async _pasteImage(file) {
    const inputEl = this._findChatInput();
    if (!inputEl) return false;

    inputEl.focus();
    await BossHelper.sleep(300);

    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      let pasteEvent;
      try {
        pasteEvent = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
      } catch (_) {
        pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
      }
      if (!pasteEvent.clipboardData) {
        Object.defineProperty(pasteEvent, 'clipboardData', { value: dt, enumerable: true });
      }
      inputEl.dispatchEvent(pasteEvent);
      await BossHelper.sleep(2000);
      return await this._handleConfirmOrSend();
    } catch (_) {
      return false;
    }
  },

  // ===================== 方案3: 拖拽 =====================

  async _dragToChat(file) {
    const target = document.querySelector(
      '.chat-conversation, [class*="chat-conversation"], [class*="chat"], #pic1688-toolbar'
    )?.closest('[class*="chat"], [class*="editor"]');
    if (!target) return false;

    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
        await BossHelper.sleep(150);
      }
      await BossHelper.sleep(2000);
      return await this._handleConfirmOrSend();
    } catch (_) { return false; }
  },

  // ===================== 方案4: 暴力注入 =====================

  async _bruteForce(file) {
    for (const input of document.querySelectorAll('input[type="file"]')) {
      await this._vueInjectFile(input, file);
      await BossHelper.sleep(2000);
      if (await this._handleConfirmOrSend()) return true;
    }
    return false;
  },

  // ===================== Vue 兼容注入 =====================

  async _vueInjectFile(input, file) {
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
      if (desc?.set) { desc.set.call(input, dt.files); } else { input.files = dt.files; }
      if (input._valueTracker) input._valueTracker.setValue('');

      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (_) { return false; }
  },

  // ===================== 确认和发送 =====================

  async _handleConfirmOrSend() {
    await BossHelper.sleep(500);
    const texts = ['发送', '确定', '确认', '确认发送', '发送图片'];
    const all = document.querySelectorAll('button, a, span, div[role="button"]');
    for (const el of all) {
      if (el.offsetParent === null) continue;
      const t = (el.textContent || '').trim();
      for (const ct of texts) {
        if (t === ct) {
          const inDialog = el.closest('[class*="dialog"], [class*="modal"], [class*="popup"], [class*="confirm"]');
          if (inDialog || el.getBoundingClientRect().y > 250) {
            await MouseSimulator.click(el);
            await BossHelper.sleep(1000);
            return true;
          }
        }
      }
    }
    // 尝试点发送按钮
    for (const el of all) {
      if (el.offsetParent === null) continue;
      const text = (el.textContent || '').trim();
      if ((text === '发送' || text === 'Send') && el.getBoundingClientRect().y > 300 && el.getBoundingClientRect().width < 200) {
        await MouseSimulator.click(el);
        await BossHelper.sleep(1000);
        return true;
      }
    }
    // Enter 键
    const input = this._findChatInput();
    if (input) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      await BossHelper.sleep(1000);
    }
    return false;
  },

  // ===================== 元素查找 =====================

  _findChatInput() {
    const sels = [
      '[contenteditable="true"]', '[role="textbox"]', 'textarea',
      '.ql-editor', '.ProseMirror', '[class*="editor"] [contenteditable]',
    ];
    for (const sel of sels) {
      try {
        const el = document.querySelector(sel);
        if (el?.offsetParent) { const r = el.getBoundingClientRect(); if (r.width > 100 && r.y > 200) return el; }
      } catch (_) {}
    }
    // 通过 #pic1688-toolbar 找父容器中的可编辑元素
    const pic1688 = document.querySelector('#pic1688-toolbar');
    if (pic1688) {
      let c = pic1688;
      for (let i = 0; i < 6; i++) {
        if (!c.parentElement) break;
        c = c.parentElement;
        for (const el of c.querySelectorAll('[contenteditable="true"], textarea')) {
          if (el.offsetParent && el.getBoundingClientRect().width > 100) return el;
        }
      }
    }
    return document.querySelector('[contenteditable="true"], textarea');
  },

  _findImageButton() {
    // 精确匹配 lucide SVG
    const svgBtn = document.querySelector('svg.lucide-image, svg[class*="lucide"][class*="image"], svg[class*="image-icon"]');
    if (svgBtn?.offsetParent) {
      return svgBtn.closest('.toolbarButton, button, [role="button"]') || svgBtn.parentElement || svgBtn;
    }
    // #toolbarContent 中查找
    const tc = document.querySelector('#toolbarContent, .toolbarcontent');
    if (tc) {
      const img = tc.querySelector('svg[class*="image"], svg[class*="img"], [class*="image-icon"]');
      if (img?.offsetParent) return img.closest('.toolbarButton, button') || img.parentElement || img;
      for (const c of tc.children) { if (c.offsetParent) return c; }
    }
    // title 匹配
    for (const el of document.querySelectorAll('i, span, div, button, label, svg')) {
      if (!el.offsetParent) continue;
      const t = (el.getAttribute('title') || el.getAttribute('aria-label') || '').toLowerCase();
      if (['图片', '照片', 'image', 'photo'].some(k => t.includes(k))) return el;
    }
    return null;
  },

  // ===================== 数据操作 =====================

  async _getResumeData() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: MSG_TYPE.REQUEST_RESUME }, (resp) => resolve(resp ? resp.data : null));
    });
  },

  async _base64ToFile(base64Data, fileName) {
    try {
      const resp = await fetch(base64Data);
      const blob = await resp.blob();
      return new File([blob], fileName, { type: blob.type || 'image/jpeg', lastModified: Date.now() });
    } catch (_) { return null; }
  },

  async compressImage(base64Data, maxSize = RESUME_CONFIG.MAX_FILE_SIZE, maxWidth = RESUME_CONFIG.MAX_WIDTH) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        let quality = RESUME_CONFIG.COMPRESS_QUALITY;
        let result = canvas.toDataURL('image/jpeg', quality);
        while (result.length * 0.75 > maxSize && quality > 0.1) {
          quality -= 0.1;
          result = canvas.toDataURL('image/jpeg', quality);
        }
        BossLogger.info(`图片压缩: q=${quality.toFixed(1)} ${(result.length * 0.75 / 1024).toFixed(1)}KB`);
        resolve(result);
      };
      img.src = base64Data;
    });
  },
};
