/**
 * 聊天页面批量发送图片简历（v3 — Vue 兼容，基于 DOM 诊断数据）
 *
 * BOSS 聊天页技术栈：Vue.js（data-v-xxx 标记）
 * 图片按钮：svg.lucide-image（lucide 图标库）
 * 工具栏：DIV#pic1688-toolbar > DIV#toolbarContent > DIV.toolbarButton
 * 编辑器：自定义富文本组件（非标准 textarea/contenteditable）
 *
 * 发送方式（按优先级）：
 * 1. 点击图片按钮 → MutationObserver → 拦截 file input → 注入
 * 2. 粘贴图片到编辑器
 * 3. 拖拽到聊天区域
 * 4. 暴力扫描所有 input[type=file]
 */
const ChatResumeSender = {
  _isRunning: false,
  _stats: { sent: 0, skipped: 0, failed: 0 },

  async start() {
    if (this._isRunning) return;
    if (!BossHelper.isChatPage()) {
      BossLogger.warn('请先打开 BOSS 直聘聊天页面');
      return;
    }

    BossLogger.info('📎 启动批量发送图片简历');
    this._isRunning = true;
    this._stats = { sent: 0, skipped: 0, failed: 0 };
    await StorageService.setRunningState(PLUGIN_STATE.RUNNING);

    // DOM 扫描
    this._scanDOM();

    try {
      await this._runLoop();
    } catch (e) {
      BossLogger.error('批量发图异常:', e);
    }

    this._isRunning = false;
    await StorageService.setRunningState(PLUGIN_STATE.IDLE);
    this._notifyProgress();
    BossLogger.info(`📎 完成 → 发送:${this._stats.sent} 跳过:${this._stats.skipped} 失败:${this._stats.failed}`);
  },

  stop() {
    BossLogger.info('⏹ 停止批量发图');
    this._isRunning = false;
    StorageService.setRunningState(PLUGIN_STATE.IDLE);
    this._notifyProgress();
  },

  /**
   * DOM 扫描 — 输出到 chrome.storage 供 popup 查看（绕过 BOSS 反调试）
   */
  _scanDOM() {
    const report = {
      url: location.href,
      time: new Date().toLocaleString('zh-CN'),
      hasShowOpenFilePicker: typeof window.showOpenFilePicker === 'function',
      chatInputs: [], fileInputs: [], imageButtons: [],
      toolbars: [], sendButtons: [], contactItems: [],
      chatAreaHTML: '', inputAreaHTML: '', editorAreaHTML: '',
      pic1688ParentHTML: '', allVisibleElementsNearBottom: [],
    };

    // ---- 聊天输入框（标准元素） ----
    document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width < 60 || r.height < 20) return;
      report.chatInputs.push({
        tag: el.tagName, class: (el.className || '').toString().substring(0, 80),
        placeholder: el.getAttribute('placeholder') || '',
        role: el.getAttribute('role') || '',
        visible: el.offsetParent !== null,
        rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
      });
    });

    // ---- #pic1688-toolbar 所在区域完整扫描 ----
    const pic1688 = document.querySelector('#pic1688-toolbar');
    if (pic1688) {
      // 往上 3 层找到编辑器容器
      let editorContainer = pic1688;
      for (let i = 0; i < 5; i++) {
        if (editorContainer.parentElement) editorContainer = editorContainer.parentElement;
        const cls = (editorContainer.className || '').toString();
        if (cls.includes('editor') || cls.includes('chat') || cls.includes('input') || cls.includes('edit')) break;
      }
      report.pic1688ParentHTML = editorContainer.innerHTML.substring(0, 800);

      // 在编辑器中搜索可编辑元素
      const editables = editorContainer.querySelectorAll('[contenteditable="true"], [role="textbox"], textarea');
      editables.forEach(el => {
        const r = el.getBoundingClientRect();
        report.chatInputs.push({
          tag: el.tagName, class: (el.className || '').toString().substring(0, 80),
          placeholder: el.getAttribute('placeholder') || '',
          visible: el.offsetParent !== null,
          rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
          source: 'pic1688-container',
        });
      });

      // 工具栏内的所有子元素
      const toolbarItems = [];
      const walkToolbar = (el, depth) => {
        if (depth > 4) return;
        for (const child of el.children) {
          const tag = child.tagName;
          const cls = ((child.className?.baseVal || child.className) || '').toString().substring(0, 50);
          const text = (child.textContent || '').trim().substring(0, 30);
          const r = child.getBoundingClientRect();
          toolbarItems.push(`${tag}.${cls}${text ? ' "' + text + '"' : ''} rect:${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`);
          if (child.children.length > 0 && depth < 3) walkToolbar(child, depth + 1);
        }
      };
      walkToolbar(pic1688, 0);
      report.toolbars.push({
        tag: 'PIC1688-TOOLBAR', class: '完整工具栏树', rect: '',
        childCount: pic1688.querySelectorAll('*').length,
        children: toolbarItems.join(' | '),
      });
    }

    // ---- 通用工具栏扫描 ----
    const toolbarKeywords = ['toolbar', 'chat-tool', 'chat-op', 'action-bar', 'operate', 'chat-footer', 'editor-bar', 'func-bar'];
    document.querySelectorAll('div, ul, nav, section, footer').forEach(el => {
      const cls = (el.className || '').toString().toLowerCase();
      const id = (el.id || '').toLowerCase();
      if (toolbarKeywords.some(k => cls.includes(k) || id.includes(k))) {
        const r = el.getBoundingClientRect();
        const childrenHTML = [];
        for (const child of el.children) {
          childrenHTML.push(`<${child.tagName} class="${((child.className?.baseVal || child.className) || '').toString().substring(0, 50)}">`);
        }
        report.toolbars.push({
          tag: el.tagName, class: cls.substring(0, 80), id: el.id,
          rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
          childCount: el.children.length,
          children: childrenHTML.slice(0, 15).join(' | '),
        });
      }
    });

    // ---- 文件上传 input ----
    document.querySelectorAll('input[type="file"]').forEach(inp => {
      let ancestor = '';
      let p = inp.parentElement;
      for (let i = 0; i < 6 && p; i++) {
        const cls = (p.className || '').toString().split(' ')[0].substring(0, 25);
        ancestor += (ancestor ? ' > ' : '') + p.tagName + (cls ? '.' + cls : '');
        p = p.parentElement;
      }
      report.fileInputs.push({
        accept: inp.accept || '(none)',
        class: (inp.className || '').toString().substring(0, 80),
        id: inp.id || '',
        visible: inp.offsetParent !== null,
        display: getComputedStyle(inp).display,
        ancestor: ancestor.substring(0, 300),
      });
    });

    // ---- 图片按钮（SVG + class 匹配） ----
    const imgKeywords = ['image', 'img', 'photo', 'pic', 'picture', '图片', '照片', '相册', 'upload', 'file'];
    document.querySelectorAll('i, span, div, button, label, a, svg').forEach(el => {
      if (el.children.length > 3) return;
      const clsAttr = el.className?.baseVal || el.className || '';
      const cls = (clsAttr + ' ' + (el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
      if (imgKeywords.some(k => cls.includes(k))) {
        const r = el.getBoundingClientRect();
        report.imageButtons.push({
          tag: el.tagName,
          class: clsAttr.toString().substring(0, 80),
          title: (el.getAttribute('title') || el.getAttribute('aria-label') || ''),
          rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
          visible: el.offsetParent !== null,
          parentClass: (el.parentElement?.className || '').toString().substring(0, 60),
        });
      }
    });

    // 补充：查找工具栏中所有按钮级别的元素（即使没有 image 关键词）
    const pic1688El = document.querySelector('#pic1688-toolbar');
    if (pic1688El) {
      pic1688El.querySelectorAll('div, button, span, i, svg').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width > 10 && r.width < 100 && r.height > 10 && r.height < 80) {
          const cls = (el.className?.baseVal || el.className || '').toString();
          if (!report.imageButtons.some(b => b.class === cls.substring(0, 80) && b.tag === el.tagName)) {
            report.imageButtons.push({
              tag: el.tagName,
              class: cls.substring(0, 80),
              title: (el.getAttribute('title') || el.getAttribute('aria-label') || ''),
              rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
              visible: el.offsetParent !== null,
              source: 'pic1688-all',
            });
          }
        }
      });
    }

    // ---- 发送按钮 ----
    document.querySelectorAll('button, a, span, div[role="button"], i').forEach(el => {
      const text = (el.textContent || '').trim();
      const title = (el.getAttribute('title') || '').trim();
      const sendKeywords = ['发送', 'send', 'submit'];
      if (sendKeywords.some(k => text === k || title === k)) {
        const r = el.getBoundingClientRect();
        report.sendButtons.push({
          tag: el.tagName, text: text.substring(0, 20),
          class: (el.className || '').toString().substring(0, 60),
          rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
          visible: el.offsetParent !== null,
        });
      }
    });

    // ---- 联系人列表 ----
    document.querySelectorAll('li, [class*="contact"], [class*="user-item"], [class*="conversation"], [class*="friend"]').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.x > 420 || r.width < 150 || r.height < 40) return;
      if (report.contactItems.length >= 5) return;
      const text = (el.textContent || '').trim().substring(0, 45);
      report.contactItems.push(text);
    });

    // ---- 聊天区域 HTML 快照 ----
    const chatArea = document.querySelector('[class*="chat-conversation"], [class*="chat-content"], [class*="message-list"], [class*="user-list"]');
    if (chatArea) report.chatAreaHTML = chatArea.innerHTML.substring(0, 500);

    // ---- Vue 组件扫描 ----
    const vueReport = { vue2Instances: [], vueMethods: [] };
    document.querySelectorAll('*').forEach(el => {
      if (el.__vue__) {
        const vm = el.__vue__;
        const methods = Object.keys(vm).filter(k => typeof vm[k] === 'function');
        const tag = (vm.$options?.name || vm.$options?._componentTag || '').toString();
        const relevant = methods.filter(m =>
          ['image', 'img', 'photo', 'send', 'upload', 'insert', 'chat', 'message', 'file', 'submit', 'select']
            .some(k => m.toLowerCase().includes(k))
        );
        if (relevant.length > 0 && vueReport.vue2Instances.length < 10) {
          vueReport.vue2Instances.push({
            tag: tag.substring(0, 30),
            elementClass: (el.className || '').toString().substring(0, 40),
            relevantMethods: relevant.join(', '),
          });
          vueReport.vueMethods.push(...relevant);
        }
      }
    });
    report.vueReport = vueReport;

    // ---- 写入 storage ----
    chrome.storage.local.set({ boss_diagnostic: report });
    BossLogger.info('🔍 DOM 扫描完成，已写入 storage');
    return report;
  },

  // ===================== 主循环 =====================

  async _runLoop() {
    const sentList = await this._getSentList();
    const contacts = this._getContactList();

    // 诊断：输出搜索到的联系人详情
    if (contacts.length > 0) {
      const sample = contacts.slice(0, 3).map(c =>
        (c.textContent || '').trim().substring(0, 25)
      ).join(', ');
      BossLogger.info(`联系人示例: ${sample}${contacts.length > 3 ? '...' : ''}`);
    }

    if (!contacts.length) {
      // 紧急降级：输出页面诊断信息
      BossLogger.warn('未找到联系人列表，输出诊断...');
      const diag = {
        allLis: document.querySelectorAll('li').length,
        leftLis: Array.from(document.querySelectorAll('li')).filter(li => {
          const r = li.getBoundingClientRect();
          return r.x < 500 && r.width > 100 && r.height > 30;
        }).length,
        listElements: document.querySelectorAll('ul, [role="list"], [class*="list"], [class*="contact"], [class*="chat"], [class*="user"]').length,
        url: location.href,
      };
      BossLogger.warn(`诊断: LIs=${diag.allLis} 左侧LIs=${diag.leftLis} 列表元素=${diag.listElements} URL=${diag.url}`);
      return;
    }

    const base64Data = await this._getResumeData();
    if (!base64Data) {
      BossLogger.error('请先在 Popup「简历」标签页上传图片');
      return;
    }
    const file = await this._base64ToFile(base64Data);
    if (!file) {
      BossLogger.error('图片数据异常');
      return;
    }

    BossLogger.info(`找到 ${contacts.length} 个联系人，图片: ${(file.size / 1024).toFixed(1)}KB`);

    for (let i = 0; i < contacts.length; i++) {
      if (!this._isRunning) break;
      const contact = contacts[i];
      const contactId = this._getContactId(contact);
      const contactName = this._getContactName(contact);

      if (sentList.includes(contactId)) {
        BossLogger.debug(`跳过已发送: ${contactName}`);
        this._stats.skipped++;
        this._notifyProgress();
        continue;
      }

      BossLogger.info(`[${i + 1}/${contacts.length}] 发送给: ${contactName}`);

      // 确保联系人可见
      contact.scrollIntoView({ behavior: 'instant', block: 'center' });
      await BossHelper.sleep(200);

      // 多种点击方式确保 Vue 响应
      const clicked = await this._clickContact(contact);
      if (!clicked) {
        BossLogger.warn(`点击联系人失败: ${contactName}`);
        this._stats.failed++;
        this._notifyProgress();
        continue;
      }

      await BossHelper.randomSleep(2500, 4000);

      const loaded = await this._waitChatLoaded();
      if (!loaded) {
        BossLogger.warn(`聊天加载失败: ${contactName}`);
        // 重试一次
        await this._clickContact(contact);
        await BossHelper.sleep(3000);
        const retry = await this._waitChatLoaded();
        if (!retry) {
          this._stats.failed++;
          this._notifyProgress();
          continue;
        }
      }

      const success = await this._sendImage(file);

      if (success) {
        await BossHelper.sleep(2000);
        BossLogger.info(`✅ 图片已发送: ${contactName}`);
        this._stats.sent++;
        await this._markAsSent(contactId);
      } else {
        BossLogger.warn(`❌ 发送失败: ${contactName}`);
        this._stats.failed++;
      }

      this._notifyProgress();
      if (this._isRunning && i < contacts.length - 1) {
        await BossHelper.randomSleep(3000, 6000);
      }
    }
  },

  /**
   * ========== 图片发送核心：多策略尝试 ==========
   */
  async _sendImage(file) {
    // 方案 1（主）：找 file input 注入 + Vue 组件联动 + 等发送按钮
    BossLogger.debug('--- 方案1: input注入 + Vue联动 ---');
    if (await this._injectViaSendImgInput(file)) return true;

    // 方案 2：mock showOpenFilePicker + 点击图片按钮（最接近真人操作）
    BossLogger.debug('--- 方案2: mock FSP + 真实点击 ---');
    if (await this._interceptFilePickerAndClick(file, 'mock')) return true;

    // 方案 3：AbortError 降级（触发 BOSS 回退到 input）
    BossLogger.debug('--- 方案3: AbortError降级 ---');
    if (await this._interceptFilePickerAndClick(file, 'abort')) return true;

    // 方案 4：dataURL 注入到编辑器 DOM
    BossLogger.debug('--- 方案4: dataURL注入 ---');
    if (await this._injectDataURLToEditor(file)) return true;

    // 方案 5：暴力注入所有 file input
    BossLogger.debug('--- 方案5: 暴力注入 ---');
    if (await this._bruteForceInput(file)) return true;

    return false;
  },

  /**
   * ★ 策略1（主）：利用 Vue 组件实例直接注入图片
   *
   * BOSS 聊天页 Vue 组件结构（推测）：
   *   ChatInput 组件
   *     ├── 富文本编辑器
   *     ├── #pic1688-toolbar > btn-sendimg（含隐藏 input[type=file]）
   *     └── btn-send（disabled 直到图片就绪）
   *
   * Vue 组件监听 input.change 事件 → 读取 files → 更新 data → 通知 send 按钮
   *
   * 问题：手动设置 input.files + dispatchEvent 时，Vue 的 patchEvent 可能拦截不到
   * 解决：同时尝试多种事件触发方式 + 直接操作 Vue 组件数据
   */
  async _injectViaSendImgInput(file) {
    const sendImgBtn = this._findSendImgButton();
    if (!sendImgBtn) {
      BossLogger.debug('sendimg: 未找到 btn-sendimg');
      return false;
    }

    const fileInput = sendImgBtn.querySelector('input[type="file"]');
    if (!fileInput) {
      BossLogger.debug('sendimg: btn-sendimg 内无 input');
      return false;
    }

    BossLogger.debug(`sendimg: 找到 input accept="${fileInput.accept || '(none)'}"`);

    // ---- 步骤1：通过 DataTransfer 注入文件 ----
    const dt = new DataTransfer();
    dt.items.add(file);

    // 方式A：原型 setter（绕过 Vue getter/setter）
    const protoDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
    if (protoDesc?.set) {
      try { protoDesc.set.call(fileInput, dt.files); } catch (_) {}
    }
    // 方式B：直接赋值
    try { fileInput.files = dt.files; } catch (_) {}

    // ---- 步骤2：多种方式触发 Vue 更新 ----
    // 2a. 标准事件
    fileInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
    fileInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }));

    // 2b. 通过 Vue 实例触发（如果找到组件实例）
    const vueComp = this._findChatVueComponent();
    if (vueComp) {
      BossLogger.debug('sendimg: 找到 Vue 组件，尝试直接触发');
      // 尝试调用组件的文件处理方法
      const handlers = ['handleFileChange', 'onFileChange', 'handleImageUpload', 'uploadFile',
                        'handleInput', 'onInput', 'fileChange', 'changeHandler'];
      for (const h of handlers) {
        if (typeof vueComp[h] === 'function') {
          try {
            vueComp[h]({ target: fileInput, files: dt.files });
            BossLogger.info(`sendimg: 调用 vue.${h} 成功`);
            break;
          } catch (_) {}
        }
      }
      // 强制触发 Vue 更新
      if (vueComp.$forceUpdate) vueComp.$forceUpdate();
    }

    // 2c. 额外的事件触发（某些 Vue 版本需要）
    await BossHelper.sleep(100);
    fileInput.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    fileInput.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    fileInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    fileInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

    BossLogger.debug('sendimg: 文件已注入，等待发送按钮...');

    // ---- 步骤3：等待发送按钮 enabled（MutationObserver + 轮询）----
    const sendBtn = await this._waitForSendButtonEnabled();
    if (sendBtn) {
      BossLogger.info('sendimg: 发送按钮就绪，点击发送');
      await this._forceClickSend(sendBtn);
      return true;
    }

    // ---- 步骤4：降级 - 强制发送 ----
    BossLogger.debug('sendimg: 超时，强制发送...');
    for (let i = 0; i < 5; i++) {
      await BossHelper.sleep(1500);
      if (await this._forceClickSend()) return true;
    }

    return false;
  },

  /**
   * 在当前页面 DOM 中搜索聊天输入区的 Vue 组件实例
   */
  _findChatVueComponent() {
    const toolbar = document.querySelector('#pic1688-toolbar');
    if (!toolbar) return null;

    // 向上搜索 Vue 组件
    let el = toolbar;
    for (let i = 0; i < 8; i++) {
      if (!el) break;
      if (el.__vue__) {
        const vm = el.__vue__;
        // 检查是否有与聊天输入相关的方法
        const hasMethods = Object.keys(vm).filter(k =>
          typeof vm[k] === 'function' &&
          /file|image|upload|send|input|chat|message/i.test(k)
        );
        if (hasMethods.length > 0) {
          BossLogger.debug(`vue-comp: 在祖先[${i}]找到，方法: ${hasMethods.join(',')}`);
          return vm;
        }
      }
      el = el.parentElement;
    }

    // 也搜索 toolbar 内部的 Vue 组件
    const toolbarVueEls = toolbar.querySelectorAll('[data-v-]');
    for (const vEl of toolbarVueEls) {
      if (vEl.__vue__) {
        const vm = vEl.__vue__;
        const methods = Object.keys(vm).filter(k => typeof vm[k] === 'function');
        const relevant = methods.filter(m => /file|image|upload|select/i.test(m));
        if (relevant.length > 0) {
          BossLogger.debug(`vue-comp: 在 toolbar 内找到，方法: ${relevant.join(',')}`);
          return vm;
        }
      }
    }

    return null;
  },

  /**
   * 查找发送图片按钮（增强版）
   */
  _findSendImgButton() {
    // 1. 精确 CSS
    for (const sel of ['.btn-sendimg', '[class*="sendimg"]', '[title="发送图片"]']) {
      try {
        const el = document.querySelector(sel);
        if (el?.offsetParent) return el;
      } catch (_) {}
    }

    // 2. 通过 #pic1688-toolbar 的工具栏按钮定位
    const toolbar = document.querySelector('#pic1688-toolbar');
    if (toolbar) {
      // BOSS 工具栏中第一个或第二个按钮通常是图片按钮
      const buttons = toolbar.querySelectorAll('.toolbarButton, [class*="tool-btn"], div[role="button"], button');
      for (const btn of buttons) {
        if (!btn.offsetParent) continue;
        // 检查是否包含 file input
        if (btn.querySelector('input[type="file"]')) return btn;
      }
      // 取第一个可见的工具栏子元素
      const firstVisible = toolbar.querySelector('.toolbarButton, [class*="btn"]');
      if (firstVisible?.offsetParent && firstVisible.querySelector('input[type="file"]')) {
        return firstVisible;
      }
    }

    // 3. title/aria-label 匹配
    for (const el of document.querySelectorAll('div, span, button, label')) {
      if (!el.offsetParent) continue;
      const t = (el.getAttribute('title') || el.getAttribute('aria-label') || '').toLowerCase();
      if (['发送图片', '图片', '照片', 'image', 'photo'].some(k => t === k || t.includes(k))) {
        return el;
      }
    }

    return null;
  },

  /**
   * 等待发送按钮变为 enabled（MutationObserver + 轮询双保险）
   */
  async _waitForSendButtonEnabled() {
    // 先用 MutationObserver 观察 class 变化，同时轮询
    const sendBtn = document.querySelector('.btn-send, .btn-sure-v2, [class*="btn-send"]');
    if (!sendBtn) return null;

    // 如果已经 enabled，直接返回
    if (!sendBtn.classList.contains('disabled') && !sendBtn.disabled) {
      BossLogger.debug('sendBtn: 已就绪');
      return sendBtn;
    }

    return new Promise((resolve) => {
      let resolved = false;
      const done = (btn) => { if (!resolved) { resolved = true; clearTimeout(timer); observer.disconnect(); resolve(btn); } };

      // Observer：监听 class 和 disabled 属性变化
      const observer = new MutationObserver(() => {
        if (!sendBtn.classList.contains('disabled') && !sendBtn.disabled) {
          BossLogger.debug('sendBtn: Observer 检测到 enabled');
          done(sendBtn);
        }
      });
      observer.observe(sendBtn, { attributes: true, attributeFilter: ['class', 'disabled'] });
      // 也观察父元素（Vue 可能替换整个按钮）
      if (sendBtn.parentElement) {
        observer.observe(sendBtn.parentElement, { attributes: true, subtree: true });
      }

      // 轮询兜底
      let pollCount = 0;
      const poll = async () => {
        for (let i = 0; i < 30; i++) {
          if (resolved) return;
          await BossHelper.sleep(500);
          pollCount++;
          for (const sel of ['.btn-send', '.btn-sure-v2', '[class*="btn-send"]']) {
            try {
              const btn = document.querySelector(sel);
              if (btn?.offsetParent && !btn.classList.contains('disabled') && !btn.disabled) {
                BossLogger.debug(`sendBtn: 轮询检测到 enabled (轮次${pollCount})`);
                done(btn);
                return;
              }
            } catch (_) {}
          }
        }
        // 超时，返回当前按钮（强制发送）
        BossLogger.debug('sendBtn: 超时，返回当前状态按钮');
        done(sendBtn);
      };
      poll();

      // 总超时 20 秒
      const timer = setTimeout(() => {
        BossLogger.debug('sendBtn: 总超时');
        done(sendBtn);
      }, 20000);
    });
  },

  /**
   * 强制点击发送（移除 disabled，多种点击方式）
   * 返回 true 仅当检测到发送成功的信号
   */
  async _forceClickSend(targetBtn) {
    const btn = targetBtn || document.querySelector('.btn-send, .btn-sure-v2, [class*="btn-send"]');
    if (!btn) {
      this._pressEnter();
      await BossHelper.sleep(2000);
      // 检查编辑器是否清空
      return this._checkEditorCleared();
    }

    // 记录点击前的编辑器内容
    const editor = document.querySelector('[contenteditable="true"], [role="textbox"], textarea');
    const prevContent = editor ? (editor.value || editor.textContent || editor.innerHTML || '') : '';

    // 强制移除 disabled
    btn.classList.remove('disabled');
    btn.disabled = false;
    btn.style.pointerEvents = 'auto';
    btn.style.opacity = '1';

    if (btn.parentElement) {
      btn.parentElement.classList.remove('disabled');
    }

    // 多种点击方式
    btn.click();
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, view: window }));
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }));

    BossLogger.info('sendBtn: 强制点击发送');
    await BossHelper.sleep(2500);

    // 检查确认弹窗
    if (await this._handleSendConfirm()) return true;

    // 检查编辑器是否被清空（发送成功的信号）
    if (editor) {
      const currContent = editor.value || editor.textContent || editor.innerHTML || '';
      if (prevContent && !currContent) {
        BossLogger.info('sendBtn: 编辑器已清空，发送成功');
        return true;
      }
    }

    // 没有明确信号，保守返回 false
    BossLogger.warn('sendBtn: 未检测到发送成功信号');
    return false;
  },

  /**
   * 检查编辑器是否被清空
   */
  _checkEditorCleared() {
    const editor = document.querySelector('[contenteditable="true"], [role="textbox"], textarea');
    if (!editor) return false;
    const content = (editor.value || editor.textContent || '').trim();
    return content === '';
  },

  /**
   * 在编辑器中按 Enter 键
   */
  _pressEnter() {
    const editor = document.querySelector('[contenteditable="true"], [role="textbox"], textarea');
    const target = editor || document.body;
    ['keydown', 'keypress', 'keyup'].forEach(type => {
      target.dispatchEvent(new KeyboardEvent(type, {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true, composed: true,
      }));
    });
  },

  /**
   * ★ 新方案：将图片转 data URL，直接注入到编辑器 DOM，然后触发发送
   * 绕过 BOSS 的 showOpenFilePicker / paste 拦截 / 文件验证
   */
  async _injectDataURLToEditor(file) {
    try {
      // 1. 将 File 转为 data URL
      const dataUrl = await this._fileToDataURL(file);
      if (!dataUrl) {
        BossLogger.debug('dataURL: 转换失败');
        return false;
      }
      BossLogger.debug(`dataURL: ${dataUrl.substring(0, 50)}... (${(dataUrl.length / 1024).toFixed(0)}KB)`);

      // 2. 找到编辑器元素
      const editor = this._findEditorElement();
      if (editor) {
        BossLogger.debug(`dataURL: 找到编辑器 <${editor.tagName}> class="${(editor.className || '').toString().substring(0, 40)}"`);

        // 3. 设置焦点、插入图片 HTML
        editor.focus();
        if (editor.contentEditable === 'true' || editor.getAttribute('contenteditable') === 'true') {
          // contenteditable 编辑器：直接插入 img 标签
          const img = document.createElement('img');
          img.src = dataUrl;
          img.style.maxWidth = '200px';
          img.style.maxHeight = '200px';

          // 清空编辑器内容后插入图片
          editor.innerHTML = '';
          editor.appendChild(img);

          // 触发 Vue 的 input 事件
          editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          editor.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          editor.dispatchEvent(new CompositionEvent('compositionend', { data: '', bubbles: true }));

          BossLogger.debug('dataURL: 图片已插入编辑器DOM');
        } else if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
          // textarea/input：无法插入图片，跳过
          BossLogger.debug('dataURL: textarea不支持图片');
        } else {
          // 普通 div：尝试设置 innerHTML
          editor.innerHTML = `<img src="${dataUrl}" style="max-width:200px;max-height:200px;">`;
          editor.dispatchEvent(new Event('input', { bubbles: true }));
        }

        await BossHelper.sleep(1500);

        // 4. 查找并点击 Vue 组件的图片处理方法
        if (await this._callVueImageMethod(file, dataUrl)) return true;

        // 5. 尝试发送
        if (await this._handleSendConfirm()) return true;
        if (await this._clickSendButton()) return true;

        // 给 Enter 多次机会
        for (let i = 0; i < 3; i++) {
          await BossHelper.sleep(1000);
          editor.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true,
          }));
          if (await this._handleSendConfirm()) return true;
        }

        // 图片已插入编辑器但发送未确认，返回 false 让后续策略尝试
        BossLogger.warn('dataURL: 图片已注入但发送未确认');
        return false;
      }

      BossLogger.debug('dataURL: 未找到编辑器');
      return false;
    } catch (e) {
      BossLogger.debug('dataURL 异常:', e.message);
      return false;
    }
  },

  /**
   * File → Data URL
   */
  _fileToDataURL(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  },

  /**
   * 找到聊天编辑器元素（兼容多种实现）
   */
  _findEditorElement() {
    // 策略1：标准可编辑元素
    for (const sel of [
      '[contenteditable="true"]',
      '.ql-editor',
      '.ProseMirror',
      '[role="textbox"]',
      'textarea',
    ]) {
      try {
        const el = document.querySelector(sel);
        if (el?.offsetParent) {
          const r = el.getBoundingClientRect();
          if (r.width > 100 && r.height > 20 && r.y > 200) return el;
        }
      } catch (_) {}
    }

    // 策略2：扫描所有 div，找到可能是编辑器的（在页面中下部，有较大尺寸）
    const candidates = [];
    document.querySelectorAll('div, section, article').forEach(el => {
      if (!el.offsetParent) return;
      const r = el.getBoundingClientRect();
      // 编辑器特征：在页面下半部、宽度较宽、有一定高度
      if (r.y > 300 && r.width > 300 && r.height > 60 && r.height < 400) {
        // 可能是编辑器
        candidates.push({ el, score: r.width + r.height * 2 - r.y * 0.1 });
      }
    });
    candidates.sort((a, b) => b.score - a.score);

    // 取最可能的几个，优先选择带相关 class 的
    for (const { el } of candidates) {
      const cls = (el.className || '').toString().toLowerCase();
      if (cls && (cls.includes('editor') || cls.includes('edit') || cls.includes('input') ||
                  cls.includes('write') || cls.includes('chat') || cls.includes('msg'))) {
        return el;
      }
    }

    // 降级：返回得分最高的
    return candidates[0]?.el || null;
  },

  /**
   * 尝试通过 Vue 组件实例直接发送图片
   */
  async _callVueImageMethod(file, dataUrl) {
    // 尝试 1：在 #pic1688-toolbar 的祖先容器中找 Vue 实例
    const pic1688 = document.querySelector('#pic1688-toolbar');
    if (pic1688) {
      let container = pic1688;
      for (let i = 0; i < 6; i++) {
        if (!container.parentElement) break;
        container = container.parentElement;

        // Vue 2: __vue__
        if (container.__vue__) {
          BossLogger.debug('vue: 找到 Vue2 实例在 pic1688 祖先');
          const vm = container.__vue__;
          // 列出组件方法
          const methods = Object.keys(vm).filter(k => typeof vm[k] === 'function');
          BossLogger.debug(`vue methods: ${methods.join(', ')}`);
          // 尝试调用可能的发送方法
          for (const method of ['sendImage', 'uploadImage', 'handleImage', 'onImageSelect', 'insertImage']) {
            if (typeof vm[method] === 'function') {
              try {
                vm[method](file);
                BossLogger.info(`vue: 调用 ${method} 成功`);
                await BossHelper.sleep(2000);
                return true;
              } catch (e) {
                BossLogger.debug(`vue: ${method} 失败:`, e.message);
              }
            }
          }
        }
      }
    }

    // 尝试 2：扫描全局所有 Vue 2 实例
    const allEls = document.querySelectorAll('[data-v-]');
    for (const el of allEls) {
      if (el.__vue__) {
        const vm = el.__vue__;
        const imageMethods = ['sendImage', 'uploadImage', 'handleImage', 'onImageSelect', 'insertImage', 'sendMessage', 'submit'];
        for (const m of imageMethods) {
          if (typeof vm[m] === 'function') {
            try {
              BossLogger.info(`vue(global): 调用 ${m}`);
              vm[m](file);
              await BossHelper.sleep(2000);
              return true;
            } catch (_) {}
          }
        }
      }
    }

    // 尝试 3：遍历所有 Vue 2 实例（通过 __vue__）
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      const vm = el.__vue__;
      if (!vm) continue;

      // 检查组件是否有 $refs 中包含编辑器
      if (vm.$refs) {
        for (const [key, ref] of Object.entries(vm.$refs)) {
          if (ref && typeof ref.insertImage === 'function') {
            try {
              ref.insertImage(dataUrl);
              BossLogger.info(`vue: $refs.${key}.insertImage 调用成功`);
              await BossHelper.sleep(2000);
              return true;
            } catch (_) {}
          }
        }
      }

      // 检查 $children
      if (vm.$children) {
        for (const child of vm.$children) {
          const cm = Object.keys(child).filter(k => typeof child[k] === 'function');
          for (const m of cm) {
            if (['send', 'submit', 'upload', 'insert'].some(k => m.toLowerCase().includes(k))) {
              BossLogger.debug(`vue child method: ${m}`);
            }
          }
        }
      }
    }

    return false;
  },

  /**
   * 方案1：拦截 window.showOpenFilePicker
   * BOSS 新版使用了 File System Access API 来选择本地图片
   */
  async _interceptFilePickerAndClick(file, mode = 'mock') {
    const imgBtn = this._findImageButton();
    if (!imgBtn) {
      BossLogger.debug('fsp: 未找到图片按钮');
      return false;
    }

    const hasFSP = typeof window.showOpenFilePicker === 'function';
    BossLogger.debug(`fsp: showOpenFilePicker=${hasFSP} mode=${mode}`);

    // ===== Abort 模式：抛异常触发 BOSS 降级到 input[type=file] =====
    if (mode === 'abort' && hasFSP) {
      const origFSP = window.showOpenFilePicker;
      window.showOpenFilePicker = async () => {
        throw new DOMException('The user aborted a request.', 'AbortError');
      };

      // 监控是否有新的 file input 出现
      const existingInputs = new Set(document.querySelectorAll('input[type="file"]'));
      const observer = new MutationObserver(() => {});
      observer.observe(document.body, { childList: true, subtree: true });

      await MouseSimulator.click(imgBtn);
      await BossHelper.sleep(2000);

      window.showOpenFilePicker = origFSP;
      observer.disconnect();

      // 检查是否出现了新的 file input（BOSS 降级方案）
      const allInputs = document.querySelectorAll('input[type="file"]');
      for (const inp of allInputs) {
        if (!existingInputs.has(inp) && inp.offsetParent) {
          BossLogger.info('abort: BOSS 降级到 input[type=file]，注入文件');
          await this._vueInjectFile(inp, file);
          await BossHelper.sleep(2000);
          return await this._handleSendConfirm() || await this._clickSendButton();
        }
      }
      BossLogger.debug('abort: 未检测到降级 input');
      return false;
    }

    // ===== Mock 模式：返回伪装的文件句柄 =====
    if (!hasFSP) {
      BossLogger.debug('fsp: showOpenFilePicker 不可用，跳过');
      return false;
    }

    // 用 class 伪装 FileSystemFileHandle（应对 BOSS 的类型检测）
    class MockFileSystemFileHandle {
      constructor(file) {
        this._file = file;
      }
      get kind() { return 'file'; }
      get name() { return this._file.name; }
      async getFile() { return this._file; }
      async queryPermission() { return 'granted'; }
      async requestPermission() { return 'granted'; }
      async isSameEntry(other) { return other === this; }
      async createWritable() {
        return {
          write: async () => {},
          close: async () => {},
          seek: async () => {},
          truncate: async () => {},
          get locked() { return false; },
          abort: async () => {},
        };
      }
      async remove() {}
      async move() {}
    }
    // 伪装 toString 和 constructor name
    Object.defineProperty(MockFileSystemFileHandle.prototype, Symbol.toStringTag, {
      value: 'FileSystemFileHandle', configurable: true,
    });
    Object.defineProperty(MockFileSystemFileHandle.prototype.constructor, 'name', {
      value: 'FileSystemFileHandle', configurable: true,
    });

    const mockHandle = new MockFileSystemFileHandle(file);

    let pickerIntercepted = false;
    let inputIntercepted = false;
    let capturedInput = null;

    // ===== Intercept 1: showOpenFilePicker =====
    const origShowOpenFilePicker = window.showOpenFilePicker;
    if (hasFSP) {
      window.showOpenFilePicker = async (options) => {
        pickerIntercepted = true;
        BossLogger.info('fsp: 拦截 showOpenFilePicker，返回 mock 文件句柄');
        return [mockHandle];
      };
      // 也拦截可能的 showDirectoryPicker
      if (typeof window.showDirectoryPicker === 'function') {
        const origDirPicker = window.showDirectoryPicker;
        window.showDirectoryPicker = async () => {
          pickerIntercepted = true;
          return { kind: 'directory', name: 'mock', values: async () => ({}) };
        };
      }
    }

    // ===== Intercept 2: input.click() =====
    const existingInputs = new Set(document.querySelectorAll('input[type="file"]'));
    const origClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type === 'file') {
        inputIntercepted = true;
        capturedInput = this;
        BossLogger.debug('fsp: 拦截 input.click()，阻止原生文件对话框');
        this.dispatchEvent(new Event('focus', { bubbles: true }));
        return;
      }
      return origClick.call(this);
    };

    // ===== Intercept 3: MutationObserver =====
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.tagName === 'INPUT' && node.type === 'file') {
            inputIntercepted = true;
            capturedInput = capturedInput || node;
            BossLogger.debug('fsp: MutationObserver 检测到新 file input');
          }
          if (node.querySelectorAll) {
            const inps = node.querySelectorAll('input[type="file"]');
            if (inps.length > 0) {
              inputIntercepted = true;
              capturedInput = capturedInput || inps[0];
            }
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ===== 点击图片按钮 =====
    BossLogger.debug('fsp: 点击图片按钮...');
    await MouseSimulator.click(imgBtn);
    await BossHelper.sleep(1500);

    // ===== 恢复所有拦截 =====
    if (hasFSP) {
      window.showOpenFilePicker = origShowOpenFilePicker;
    }
    HTMLInputElement.prototype.click = origClick;
    observer.disconnect();

    BossLogger.debug(`fsp: showOpenFilePicker=${pickerIntercepted} input=${inputIntercepted}`);

    // ===== 处理拦截结果 =====
    if (pickerIntercepted) {
      BossLogger.info('fsp: showOpenFilePicker 已拦截，多轮尝试发送...');

      // 分 4 轮尝试（每 2 秒一轮），因为 BOSS 上传可能需要时间
      for (let round = 0; round < 5; round++) {
        BossLogger.debug(`fsp: 发送尝试 第${round + 1}轮`);
        await BossHelper.sleep(2000);

        // 尝试1: 确认弹窗
        if (await this._handleSendConfirm()) return true;

        // 尝试2: 发送按钮（文本 + 位置两种方式）
        if (await this._clickSendButton()) return true;

        // 尝试3: Enter 和 Ctrl+Enter 派发到多个目标
        const keyTargets = [
          document.activeElement,
          this._findChatInput(),
          document.querySelector('[contenteditable="true"]'),
          document.querySelector('textarea'),
          document.querySelector('[class*="chat-input"]'),
          document.querySelector('[class*="edit-area"]'),
          document.body,
        ].filter(Boolean);

        for (const target of keyTargets) {
          if (!target || target === document.body && round === 0) continue;
          // Enter
          ['keydown', 'keypress', 'keyup'].forEach(type => {
            target.dispatchEvent(new KeyboardEvent(type, {
              key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
              bubbles: true, cancelable: true, composed: true,
            }));
          });
          // Ctrl+Enter (部分聊天应用)
          ['keydown', 'keyup'].forEach(type => {
            target.dispatchEvent(new KeyboardEvent(type, {
              key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
              ctrlKey: true, bubbles: true, cancelable: true, composed: true,
            }));
          });
        }

        // 尝试4: 点击右下角任何可见元素（很多发送按钮是纯图标）
        const vw = window.innerWidth, vh = window.innerHeight;
        for (const el of document.querySelectorAll('i, svg, button, span, div')) {
          if (!el.offsetParent) continue;
          const r = el.getBoundingClientRect();
          if (r.x > vw * 0.6 && r.y > vh - 180 && r.width > 15 && r.width < 150 && r.height > 15 && r.height < 80) {
            BossLogger.info(`fsp: 点击右下角 <${el.tagName}> x=${Math.round(r.x)} y=${Math.round(r.y)}`);
            await MouseSimulator.click(el);
            await BossHelper.sleep(600);
            if (await this._handleSendConfirm()) return true;
          }
        }
      }

      // 5 轮都没成功，标记为失败让上层尝试其他策略
      BossLogger.warn('fsp: 拦截成功但发送失败，返回 false 让后续策略接管');
      return false;
    }

    if (inputIntercepted && capturedInput) {
      // 注入文件到捕获的 input
      BossLogger.debug('fsp: 注入文件到捕获的 input');
      await this._vueInjectFile(capturedInput, file);
      await BossHelper.sleep(2000);
      return await this._handleSendConfirm() || await this._clickSendButton();
    }

    // 检查是否有新增的 input
    const allInputs = document.querySelectorAll('input[type="file"]');
    for (const inp of allInputs) {
      if (!existingInputs.has(inp)) {
        BossLogger.debug('fsp: 注入文件到新增 input');
        await this._vueInjectFile(inp, file);
        await BossHelper.sleep(2000);
        return await this._handleSendConfirm() || await this._clickSendButton();
      }
    }

    BossLogger.debug('fsp: 未检测到任何拦截');
    return false;
  },

  // ===================== Vue 兼容文件注入 =====================

  /**
   * Vue 兼容的文件注入
   * - 通过原生 setter 设置 files（绕过 Vue 的 getter/setter 劫持）
   * - 触发 input + change 事件
   * - Vue 的 v-model 通过 input 事件响应
   */
  async _vueInjectFile(input, file) {
    try {
      const dt = new DataTransfer();
      dt.items.add(file);

      // 使用原生 descriptor 设置 files
      const filesDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
      if (filesDesc?.set) {
        filesDesc.set.call(input, dt.files);
      } else {
        input.files = dt.files;
      }

      // 重置 React/Vue 的值追踪器
      if (input._valueTracker) {
        input._valueTracker.setValue('');
      }

      // 查找 Vue 组件实例并尝试触发其方法
      const vueInstance = this._findVueInstance(input);
      if (vueInstance) {
        BossLogger.debug('vue: 找到 Vue 实例');
        // 尝试调用 Vue 组件的 change 处理方法
        const vueProps = vueInstance.$props || vueInstance.props || {};
        const vueAttrs = vueInstance.$attrs || vueInstance.attrs || {};
        BossLogger.debug(`vue: props=${Object.keys(vueProps).join(',')} attrs=${Object.keys(vueAttrs).join(',')}`);
      }

      // 触发事件：Vue v-model 监听 input 事件
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      BossLogger.debug('vue: 文件注入 + 事件触发完成');
      return true;
    } catch (e) {
      BossLogger.debug('vue 注入异常:', e.message);
      return false;
    }
  },

  /**
   * 查找 Vue 组件实例
   * Vue 2: el.__vue__
   * Vue 3: el.__vue_app__ 或 el._vnode
   */
  _findVueInstance(el) {
    // Vue 2
    if (el.__vue__) return el.__vue__;

    // 遍历祖先找 __vue__
    let p = el;
    for (let i = 0; i < 10 && p; i++) {
      if (p.__vue__) return p.__vue__;
      p = p.parentElement;
    }

    // Vue 3 (通过 __vue_app__)
    p = el;
    for (let i = 0; i < 10 && p; i++) {
      const appKey = Object.keys(p).find(k => k.startsWith('__vue') || k === '_vnode');
      if (appKey && p[appKey]) {
        BossLogger.debug(`vue3: 找到 key=${appKey}`);
        return p[appKey];
      }
      p = p.parentElement;
    }

    return null;
  },

  // ===================== 方案1：粘贴（最激进，多渠道尝试）=====================

  async _pasteImage(file) {
    const dt = new DataTransfer();
    dt.items.add(file);

    // 收集所有可能的 paste 目标
    const targets = [];

    // 标准可编辑元素
    document.querySelectorAll('[contenteditable="true"], textarea, [role="textbox"], .ql-editor, .ProseMirror').forEach(el => {
      if (el.offsetParent) targets.push({ el, label: 'editable:' + el.tagName });
    });

    // 当前焦点元素
    if (document.activeElement && document.activeElement !== document.body) {
      targets.unshift({ el: document.activeElement, label: 'activeElement' });
    }

    // 聊天面板区域
    const chatPanels = document.querySelectorAll('[class*="chat-content"], [class*="chat-conversation"], [class*="message"], [class*="input-area"], [class*="edit-area"], [class*="chat-input"]');
    chatPanels.forEach(el => {
      if (el.offsetParent && !targets.some(t => t.el === el)) {
        targets.push({ el, label: 'chat-panel:' + (el.className || '').toString().substring(0, 30) });
      }
    });

    // #pic1688-toolbar 的父容器
    const pic1688 = document.querySelector('#pic1688-toolbar');
    if (pic1688) {
      let p = pic1688.parentElement;
      for (let i = 0; i < 4 && p; i++) {
        if (!targets.some(t => t.el === p)) {
          targets.push({ el: p, label: 'pic1688-ancestor-' + i });
        }
        p = p.parentElement;
      }
    }

    // 兜底：document.body
    targets.push({ el: document.body, label: 'body(fallback)' });

    BossLogger.debug(`paste: ${targets.length} 个目标`);

    for (const { el, label } of targets) {
      try {
        // 聚焦
        el.focus();
        if (typeof el.click === 'function') el.click();
        await BossHelper.sleep(200);

        // 尝试 ClipboardEvent 构造
        let pasteEvent;
        try {
          pasteEvent = new ClipboardEvent('paste', {
            bubbles: true, cancelable: true, clipboardData: dt,
          });
        } catch (_) {
          pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
        }
        if (!pasteEvent.clipboardData) {
          try { Object.defineProperty(pasteEvent, 'clipboardData', { value: dt, enumerable: true }); } catch (_) {}
        }

        el.dispatchEvent(pasteEvent);

        // 也尝试 InputEvent（部分编辑器监听这个）
        try {
          const inputEvt = new InputEvent('input', {
            bubbles: true, cancelable: true,
            inputType: 'insertFromPaste',
            dataTransfer: dt,
          });
          el.dispatchEvent(inputEvt);
        } catch (_) {}

        // 也尝试 beforeinput
        try {
          const beforeEvt = new InputEvent('beforeinput', {
            bubbles: true, cancelable: true,
            inputType: 'insertFromPaste',
            dataTransfer: dt,
          });
          el.dispatchEvent(beforeEvt);
        } catch (_) {}

        BossLogger.debug(`paste: 已派发到 ${label}`);
        await BossHelper.sleep(1500);

        // 检查是否触发了确认弹窗或图片预览
        if (await this._handleSendConfirm()) return true;
        if (await this._clickSendButton()) return true;

        // 按 Enter 试试
        el.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true,
        }));
        await BossHelper.sleep(800);

        if (await this._handleSendConfirm()) return true;

      } catch (e) {
        BossLogger.debug(`paste ${label} 异常:`, e.message);
      }
    }

    return false;
  },

  // ===================== 方案3：拖拽 =====================

  async _dragToChat(file) {
    const dropTarget = document.querySelector(
      '.chat-conversation, [class*="chat-conversation"], .message-list, [class*="message-list"], [class*="chat-content"], [class*="chat"]'
    ) || document.querySelector('#pic1688-toolbar')?.closest('[class*="chat"], [class*="editor"]');

    if (!dropTarget) return false;

    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      for (const type of ['dragenter', 'dragover', 'drop']) {
        dropTarget.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
        await BossHelper.sleep(200);
      }
      await BossHelper.sleep(2000);
      return await this._handleSendConfirm();
    } catch (_) { return false; }
  },

  // ===================== 方案4：暴力注入 =====================

  async _bruteForceInput(file) {
    const inputs = document.querySelectorAll('input[type="file"]');
    BossLogger.debug(`brute: ${inputs.length} 个 file input`);
    for (const input of inputs) {
      await this._vueInjectFile(input, file);
      await BossHelper.sleep(2000);
      if (await this._handleSendConfirm()) return true;
      if (await this._clickSendButton()) return true;
    }
    return false;
  },

  // ===================== 确认弹窗 =====================

  async _handleSendConfirm() {
    await BossHelper.sleep(800);
    const confirmTexts = ['发送', '确定', '确认', '确认发送', '发送图片'];
    const all = document.querySelectorAll('button, a, span, div[role="button"]');
    for (const el of all) {
      if (el.offsetParent === null) continue;
      const text = (el.textContent || '').trim();
      for (const ct of confirmTexts) {
        if (text === ct) {
          const inDialog = el.closest('[class*="dialog"], [class*="modal"], [class*="popup"], [class*="confirm"], [class*="preview"]');
          if (inDialog || el.getBoundingClientRect().y > 250) {
            BossLogger.info(`confirm: "${text}"`);
            await MouseSimulator.click(el);
            await BossHelper.sleep(1500);
            return true;
          }
        }
      }
    }
    return false;
  },

  async _clickSendButton() {
    // 策略A：精确匹配 BOSS 的发送按钮
    const sendBtnSelectors = ['.btn-send', '.btn-sure-v2', 'button.btn-send', '[class*="btn-send"]'];
    for (const sel of sendBtnSelectors) {
      try {
        const btn = document.querySelector(sel);
        if (btn && btn.offsetParent) {
          // 移除 disabled 状态
          btn.classList.remove('disabled');
          btn.disabled = false;
          BossLogger.info(`发送: 点击 ${sel}`);
          await MouseSimulator.click(btn);
          await BossHelper.sleep(1200);
          return true;
        }
      } catch (_) {}
    }

    // 策略B：文本匹配
    const all = document.querySelectorAll('button, a, span, div[role="button"], i');
    for (const el of all) {
      if (el.offsetParent === null) continue;
      const text = (el.textContent || '').trim();
      const title = (el.getAttribute('title') || '').trim();
      if ((text === '发送' || text === 'Send' || title === '发送' || title === 'send')) {
        const r = el.getBoundingClientRect();
        if (r.y > 300 && r.width > 10 && r.width < 200) {
          el.classList.remove('disabled');
          el.disabled = false;
          BossLogger.info(`发送: 点击文本"${text || title}"按钮`);
          await MouseSimulator.click(el);
          await BossHelper.sleep(1200);
          return true;
        }
      }
    }

    // 策略B：按位置找右下角的按钮（常见发送按钮位置）
    const vw = window.innerWidth, vh = window.innerHeight;
    for (const el of document.querySelectorAll('button, a, i, svg, span, div')) {
      if (!el.offsetParent) continue;
      const r = el.getBoundingClientRect();
      // 右下角区域：x > vw * 0.7, y > vh - 120
      if (r.x > vw * 0.65 && r.y > vh - 150 && r.width > 15 && r.width < 120 && r.height > 15) {
        const parentText = (el.parentElement?.textContent || '').trim();
        if (parentText.includes('发送') || parentText === '') {
          BossLogger.info(`发送: 位置匹配 x=${Math.round(r.x)} y=${Math.round(r.y)}`);
          await MouseSimulator.click(el);
          await BossHelper.sleep(1200);
          return true;
        }
      }
    }

    // 策略C：Enter 键
    const input = this._findChatInput() || document.activeElement;
    if (input && input !== document.body) {
      BossLogger.debug('发送: Enter 键');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      await BossHelper.sleep(1200);
      return true;
    }

    // 兜底：在 body 上按 Enter
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    await BossHelper.sleep(1000);
    return false;
  },

  // ===================== 元素查找 =====================

  /**
   * 查找聊天输入框
   * BOSS 使用自定义 Vue 编辑器，标准选择器找不到时需要深度搜索
   */
  _findChatInput() {
    // 策略1：标准选择器
    const stdSelectors = [
      '[contenteditable="true"]', '[role="textbox"]', 'textarea',
      '.ql-editor',           // Quill 编辑器
      '.ProseMirror',         // ProseMirror / Tiptap 编辑器
      '[class*="editor"] [contenteditable]',
    ];
    for (const sel of stdSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) {
          const r = el.getBoundingClientRect();
          if (r.width > 100 && r.height > 20 && r.y > 200) return el;
        }
      } catch (_) {}
    }

    // 策略2：在 #pic1688-toolbar 的父容器中查找
    const pic1688 = document.querySelector('#pic1688-toolbar');
    if (pic1688) {
      let container = pic1688;
      for (let i = 0; i < 6; i++) {
        if (!container.parentElement) break;
        container = container.parentElement;
        const editables = container.querySelectorAll('[contenteditable="true"], textarea, [role="textbox"]');
        for (const el of editables) {
          if (el.offsetParent !== null) {
            const r = el.getBoundingClientRect();
            if (r.width > 100) return el;
          }
        }
      }
    }

    // 策略3：按位置找 — 中下部的可聚焦元素
    for (const el of document.querySelectorAll('div, section, article')) {
      if (!el.offsetParent) continue;
      const r = el.getBoundingClientRect();
      if (r.y > 350 && r.y < window.innerHeight - 50 && r.width > 300 && r.height > 50 && r.height < 300) {
        // 检查是否可编辑或包含光标
        if (el.getAttribute('contenteditable') === 'true' ||
            el.querySelector('[contenteditable="true"]') ||
            el.tabIndex >= 0) {
          const inner = el.querySelector('[contenteditable="true"]') || el;
          return inner;
        }
      }
    }

    return null;
  },

  /**
   * 查找图片上传按钮 — 基于诊断数据优化
   * BOSS 用的是 lucide SVG 图标: svg.lucide-image
   * 容器: #toolbarContent DIV.toolbarButton
   */
  _findImageButton() {
    // 策略1：btn-sendimg（BOSS 专用 class）
    const sendImg = document.querySelector('.btn-sendimg, [class*="btn-sendimg"]');
    if (sendImg?.offsetParent) {
      BossLogger.debug('imgBtn: .btn-sendimg');
      return sendImg;
    }

    // 策略2：#pic1688-toolbar 内的工具栏按钮
    const toolbar = document.querySelector('#pic1688-toolbar');
    if (toolbar) {
      // 找包含 file input 的按钮
      const btnWithInput = toolbar.querySelector('input[type="file"]')?.closest('div, button, span, label');
      if (btnWithInput?.offsetParent) return btnWithInput;

      // 找 lucide SVG 图片图标
      const svg = toolbar.querySelector('svg.lucide-image, svg[class*="image"], svg[class*="img"]');
      if (svg?.offsetParent) {
        return svg.closest('[role="button"], button, .toolbarButton, div') || svg.parentElement || svg;
      }

      // 第一个可见的工具栏按钮
      for (const child of toolbar.querySelectorAll('*')) {
        const r = child.getBoundingClientRect();
        if (r.width > 10 && r.width < 80 && r.height > 10 && r.height < 60 && child.offsetParent) {
          return child.closest('button, [role="button"]') || child;
        }
      }
    }

    // 策略3：title/aria-label 关键词
    for (const el of document.querySelectorAll('div, span, button, label, i, svg')) {
      if (!el.offsetParent) continue;
      const t = (el.getAttribute('title') || el.getAttribute('aria-label') || '').toLowerCase();
      if (['发送图片', '图片', '照片', 'image', 'photo'].some(k => t === k || t.includes(k))) {
        const r = el.getBoundingClientRect();
        if (r.y > 250 && r.width < 120) return el;
      }
    }

    // 策略4：class 关键词 + 底部位置
    const candidates = [];
    document.querySelectorAll('div, i, svg, button, span').forEach(el => {
      if (!el.offsetParent) return;
      const cls = ((el.className?.baseVal || el.className) || '').toString().toLowerCase();
      if (['image', 'img', 'photo', 'pic'].some(k => cls.includes(k))) {
        const r = el.getBoundingClientRect();
        if (r.y > 250 && r.width < 120) {
          candidates.push({ el, y: r.y });
        }
      }
    });
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.y - b.y);
      return candidates[0].el.closest('button, .toolbarButton') || candidates[0].el;
    }

    return null;
  },

  /**
   * 点击联系人（多种方式确保 Vue 响应）
   */
  async _clickContact(el) {
    if (!el) return false;
    try {
      // 方式1：原生 click（大多数情况下最可靠）
      el.click();
      await BossHelper.sleep(150);

      // 方式2：模拟鼠标事件（部分 Vue 组件需要）
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      el.dispatchEvent(new MouseEvent('mousedown', {
        clientX: cx, clientY: cy, bubbles: true, cancelable: true, view: window,
      }));
      el.dispatchEvent(new MouseEvent('mouseup', {
        clientX: cx, clientY: cy, bubbles: true, cancelable: true, view: window,
      }));
      el.dispatchEvent(new MouseEvent('click', {
        clientX: cx, clientY: cy, bubbles: true, cancelable: true, view: window,
      }));

      // 方式3：聚焦 + Enter（无障碍处理）
      el.focus();
      el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      await BossHelper.sleep(80);

      // 方式4：尝试点击内部链接或按钮
      const innerClickable = el.querySelector('a, button, [role="button"], .name, [class*="name"], span');
      if (innerClickable) {
        innerClickable.click();
        innerClickable.dispatchEvent(new MouseEvent('click', {
          clientX: cx, clientY: cy, bubbles: true, cancelable: true, view: window,
        }));
      }

      BossLogger.debug(`clickContact: ${(el.textContent || '').trim().substring(0, 25)}`);
      return true;
    } catch (e) {
      BossLogger.debug('clickContact 异常:', e.message);
      return false;
    }
  },

  // ===================== 联系人列表 =====================

  _getContactList() {
    // 策略1：CSS 选择器
    const selectors = [
      '.user-list li', '.user-list-content li',
      '.chat-list li', '.chat-history-list li',
      '[class*="user-list"] li', '[class*="chat-list"] li',
      '[class*="chat-history"] li', '[class*="contact"] li',
      '[class*="conversation"] li', '[class*="friend"] li',
    ];
    for (const sel of selectors) {
      try {
        const items = document.querySelectorAll(sel);
        if (items.length > 0) {
          BossLogger.debug(`联系人选择器: ${sel}, 数量: ${items.length}`);
          return Array.from(items);
        }
      } catch (_) {}
    }

    // 策略2：按位置匹配左侧栏 li
    const allLis = document.querySelectorAll('li');
    const leftLis = [];
    for (const li of allLis) {
      const r = li.getBoundingClientRect();
      if (r.x < 420 && r.width > 150 && r.height > 50 && li.offsetParent !== null) {
        leftLis.push(li);
      }
    }
    if (leftLis.length > 0) {
      BossLogger.debug(`联系人(位置): ${leftLis.length} 个`);
      return leftLis;
    }

    // 策略3：找包含 name 的父元素
    const names = document.querySelectorAll('.name, .name-text, [class*="name"], [class*="title"]');
    const parents = new Set();
    for (const n of names) {
      const li = n.closest('li') || n.closest('[class*="item"]') || n.closest('[class*="contact"]');
      if (li) parents.add(li);
    }
    if (parents.size > 0) {
      BossLogger.debug(`联系人(通过name): ${parents.size} 个`);
      return Array.from(parents);
    }

    return [];
  },

  _getContactId(el) {
    const dataId = el.getAttribute('data-uid') || el.getAttribute('data-id') ||
                   el.getAttribute('data-encryptuid') || el.getAttribute('data-userid');
    if (dataId) return dataId;
    const link = el.querySelector('a[href]');
    if (link) {
      const m = link.href.match(/uid=([^&]+)/) || link.href.match(/chat\/([^/?]+)/);
      if (m) return m[1];
    }
    return 'c_' + this._getContactName(el).replace(/\s/g, '');
  },

  _getContactName(el) {
    const nameEl = el.querySelector('.name, .name-text, [class*="name"], .title, [class*="title"], .nickname, span');
    return nameEl ? nameEl.textContent.trim().substring(0, 25) : (el.textContent || '').trim().substring(0, 25) || '未知';
  },

  async _waitChatLoaded() {
    const sels = [
      '.chat-conversation', '[class*="chat-conversation"]',
      '.message-list', '[class*="message-list"]',
      '.chat-content', '[class*="chat-content"]',
      '#pic1688-toolbar', '#toolbarContent',
      '[class*="chat-input"]', '[class*="edit-area"]',
    ];

    // 等待元素出现且可见（有实际尺寸）
    for (let i = 0; i < 12; i++) {
      for (const sel of sels) {
        try {
          const el = document.querySelector(sel);
          if (el) {
            const r = el.getBoundingClientRect();
            if (r.width > 50 && r.height > 20) {
              BossLogger.debug(`chatLoaded: ${sel} ${Math.round(r.width)}x${Math.round(r.height)}`);
              return true;
            }
          }
        } catch (_) {}
      }
      await BossHelper.sleep(800);
    }

    // 降级：有元素存在即可
    for (const sel of sels) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) {
          BossLogger.debug(`chatLoaded(fallback): ${sel}`);
          return true;
        }
      } catch (_) {}
    }

    BossLogger.warn('chatLoaded: 未检测到聊天加载');
    return false;
  },

  // ===================== 数据操作 =====================

  async _getResumeData() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: MSG_TYPE.REQUEST_RESUME }, (resp) => {
        resolve(resp ? resp.data : null);
      });
    });
  },

  async _base64ToFile(base64Data) {
    try {
      // 用 fetch+blob 创建 File（内部结构与原生文件选择器更接近）
      const resp = await fetch(base64Data);
      const blob = await resp.blob();
      const file = new File([blob], 'resume.jpg', {
        type: blob.type || 'image/jpeg',
        lastModified: Date.now(),
      });
      BossLogger.debug(`File: name=${file.name} size=${(file.size / 1024).toFixed(1)}KB type=${file.type}`);
      return file;
    } catch (e) {
      BossLogger.error('Base64→File 失败:', e);
      return null;
    }
  },

  async _getSentList() {
    const r = await StorageService.get(STORAGE_KEYS.CHAT_SENT_LIST);
    return r[STORAGE_KEYS.CHAT_SENT_LIST] || [];
  },

  async _markAsSent(contactId) {
    const list = await this._getSentList();
    if (!list.includes(contactId)) {
      list.push(contactId);
      await StorageService.set({ [STORAGE_KEYS.CHAT_SENT_LIST]: list });
    }
  },

  _notifyProgress() {
    chrome.runtime.sendMessage({
      type: MSG_TYPE.PROGRESS_UPDATE,
      data: {
        chatStats: { ...this._stats },
        state: this._isRunning ? 'running' : 'idle',
      },
    });
  },
};
