/**
 * DOM 诊断工具
 * 在聊天页面自动收集关键元素信息，存入 Storage 供 Popup 读取
 * 不依赖 DevTools，绕过 BOSS 直聘的反调试检测
 */
const BossDiagnostic = {
  run() {
    if (!BossHelper.isChatPage()) return;

    BossLogger.info('🔍 开始 DOM 诊断...');

    const result = {
      url: window.location.href,
      time: new Date().toLocaleString('zh-CN'),

      // 1. 图片按钮
      imageButtons: this._findImageButtons(),

      // 2. file input
      fileInputs: this._findFileInputs(),

      // 3. 聊天输入框
      chatInputs: this._findChatInputs(),

      // 4. 联系人列表项
      contactItems: this._findContactItems(),

      // 5. 聊天区域
      chatAreas: this._findChatAreas(),

      // 6. 工具栏结构
      toolbar: this._findToolbar(),
    };

    // 存入 Storage
    chrome.storage.local.set({ boss_diagnostic: result });
    BossLogger.info('🔍 诊断完成，可在 Popup 查看');

    return result;
  },

  _findImageButtons() {
    const results = [];
    const all = document.querySelectorAll('*');
    all.forEach(el => {
      if (el.children.length > 5) return; // 跳过容器
      const rect = el.getBoundingClientRect();
      if (rect.y < 300 || rect.width < 10 || rect.width > 100) return;

      const cls = (el.className || '').toString();
      const title = el.getAttribute('title') || el.getAttribute('aria-label') || '';

      if (cls.match(/image|img|photo|pic/i) || title.match(/图片|照片|image|photo/i)) {
        results.push({
          tag: el.tagName,
          className: cls.substring(0, 80),
          title,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          parentClass: (el.parentElement?.className || '').toString().substring(0, 60),
        });
      }
    });
    return results.slice(0, 10);
  },

  _findFileInputs() {
    const results = [];
    document.querySelectorAll('input[type="file"]').forEach(inp => {
      results.push({
        accept: inp.accept,
        className: (inp.className || '').toString().substring(0, 80),
        id: inp.id,
        display: getComputedStyle(inp).display,
        visibility: getComputedStyle(inp).visibility,
        parentTag: inp.parentElement?.tagName,
        parentClass: (inp.parentElement?.className || '').toString().substring(0, 60),
        grandParentClass: (inp.parentElement?.parentElement?.className || '').toString().substring(0, 60),
      });
    });
    return results;
  },

  _findChatInputs() {
    const results = [];
    document.querySelectorAll('textarea, [contenteditable="true"]').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 50) return;
      results.push({
        tag: el.tagName,
        className: (el.className || '').toString().substring(0, 80),
        id: el.id,
        contentEditable: el.contentEditable,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        parentClass: (el.parentElement?.className || '').toString().substring(0, 60),
      });
    });
    return results;
  },

  _findContactItems() {
    const results = [];
    document.querySelectorAll('li').forEach(li => {
      const rect = li.getBoundingClientRect();
      if (rect.x > 350 || rect.width < 100 || rect.height < 40) return;
      if (results.length >= 3) return;

      const dataAttrs = [...li.attributes]
        .filter(a => a.name.startsWith('data-'))
        .map(a => `${a.name}=${a.value}`)
        .join(' | ');

      results.push({
        className: (li.className || '').toString().substring(0, 80),
        dataAttrs: dataAttrs.substring(0, 120),
        parentTag: li.parentElement?.tagName,
        parentClass: (li.parentElement?.className || '').toString().substring(0, 60),
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        h: Math.round(rect.height),
      });
    });
    return results;
  },

  _findChatAreas() {
    const results = [];
    const keywords = ['chat', 'message', 'conversation', 'msg'];
    document.querySelectorAll('div, section, main').forEach(el => {
      const cls = (el.className || '').toString().toLowerCase();
      const id = (el.id || '').toLowerCase();
      const rect = el.getBoundingClientRect();
      if (rect.width < 200 || rect.height < 100) return;

      if (keywords.some(k => cls.includes(k) || id.includes(k))) {
        if (results.length < 5) {
          results.push({
            tag: el.tagName,
            className: cls.substring(0, 80),
            id: el.id,
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          });
        }
      }
    });
    return results;
  },

  _findToolbar() {
    const keywords = ['tool', 'toolbar', 'chat-op', 'chat-tool', 'action', 'operate'];
    let toolbarHTML = '';
    document.querySelectorAll('div, ul, nav').forEach(el => {
      const cls = (el.className || '').toString().toLowerCase();
      if (keywords.some(k => cls.includes(k))) {
        const rect = el.getBoundingClientRect();
        if (rect.y > 400 && rect.width > 100) {
          toolbarHTML = `[${el.tagName}.${cls.substring(0, 40)}] ${el.innerHTML.substring(0, 300)}`;
          return;
        }
      }
    });
    return toolbarHTML;
  },
};
