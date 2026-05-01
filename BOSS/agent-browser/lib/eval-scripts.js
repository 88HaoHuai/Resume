/**
 * 注入页面的 JS 代码片段
 * 通过 agent-browser eval 执行
 */

// ========== 反检测：隐藏自动化特征 ==========
// BOSS 直聘会检测 navigator.webdriver、CDP Runtime 等自动化标记
// 这段代码必须在页面加载前注入
const ANTI_DETECTION = `
(function() {
  // 1. 覆盖 navigator.webdriver（最关键的检测点）
  Object.defineProperty(navigator, 'webdriver', {
    get: () => false,
    configurable: true
  });

  // 2. 覆盖 chrome.runtime（自动化浏览器会暴露这个）
  const originalChrome = window.chrome;
  if (window.chrome) {
    window.chrome = new Proxy(window.chrome, {
      get(target, prop) {
        if (prop === 'runtime') return undefined;
        if (prop === 'loadTimes') return undefined;
        if (prop === 'csi') return undefined;
        return target[prop];
      }
    });
  }

  // 3. 移除 CDP 相关的全局标记
  delete window.__nightmare;
  delete window.__phantom;
  delete window.callPhantom;
  delete window._phantom;
  delete window.Buffer;
  delete window.emit;
  delete window.spawn;

  // 4. 覆盖权限查询（防止通过 permissions API 检测）
  if (navigator.permissions && navigator.permissions.query) {
    const origQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (params) => {
      if (params.name === 'notifications') {
        return Promise.resolve({ state: 'prompt', onchange: null });
      }
      return origQuery(params);
    };
  }

  // 5. 覆盖 plugins 和 mimeTypes（自动化浏览器通常为空）
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const plugins = [1, 2, 3].map(() => {
        const p = { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' };
        p.__proto__ = Plugin.prototype;
        return p;
      });
      plugins.__proto__ = PluginArray.prototype;
      return plugins;
    },
    configurable: true
  });

  Object.defineProperty(navigator, 'mimeTypes', {
    get: () => {
      const types = ['application/pdf', 'text/pdf'].map(type => {
        const m = { type: type, suffixes: 'pdf', description: 'Portable Document Format' };
        m.__proto__ = MimeType.prototype;
        return m;
      });
      types.__proto__ = MimeTypeArray.prototype;
      return types;
    },
    configurable: true
  });

  // 6. 覆盖 language/languages（默认可能是 en-US）
  Object.defineProperty(navigator, 'language', {
    get: () => 'zh-CN',
    configurable: true
  });
  Object.defineProperty(navigator, 'languages', {
    get: () => ['zh-CN', 'zh', 'en'],
    configurable: true
  });

  // 7. 覆盖 hardwareConcurrency
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    get: () => 8,
    configurable: true
  });

  // 8. 覆盖 deviceMemory
  Object.defineProperty(navigator, 'deviceMemory', {
    get: () => 8,
    configurable: true
  });

  // 9. 覆盖 platform
  Object.defineProperty(navigator, 'platform', {
    get: () => 'MacIntel',
    configurable: true
  });

  console.log('[AB] 反检测脚本已注入');
})()
`;

// ========== 登录状态检测 ==========
const CHECK_LOGIN = `
(function() {
  const url = location.href;
  const hasAuth = document.cookie.includes('wd_guid') ||
                  document.cookie.includes('__zp_stoken__') ||
                  localStorage.getItem('boss-user') ||
                  sessionStorage.getItem('token');
  return JSON.stringify({
    loggedIn: !url.includes('login') && !url.includes('passport') && hasAuth,
    url: url,
    title: document.title
  });
})()
`;

// ========== 提取联系人列表 ==========
const GET_CONTACTS = `
(function() {
  const contacts = [];
  const seen = new Set();

  // 策略1：左侧栏 li 元素
  document.querySelectorAll('li').forEach(li => {
    const r = li.getBoundingClientRect();
    if (r.x < 420 && r.width > 150 && r.height > 40 && li.offsetParent) {
      const text = (li.textContent || '').trim().substring(0, 60);
      if (!seen.has(text) && text.length > 0) {
        seen.add(text);
        contacts.push({
          index: contacts.length,
          text: text,
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          uid: li.getAttribute('data-uid') || li.getAttribute('data-id') || li.getAttribute('data-encryptuid') || '',
          cls: (li.className || '').toString().substring(0, 40)
        });
      }
    }
  });

  // 策略2：带 name 类的元素
  if (contacts.length === 0) {
    document.querySelectorAll('.name, .name-text, [class*="name"], [class*="contact-item"], [class*="user-item"], [class*="conversation"]').forEach(el => {
      const li = el.closest('li') || el.closest('[class*="item"]') || el;
      const r = li.getBoundingClientRect();
      if (r.width > 100 && r.height > 30 && li.offsetParent) {
        const text = (li.textContent || '').trim().substring(0, 60);
        if (!seen.has(text) && text.length > 0) {
          seen.add(text);
          contacts.push({
            index: contacts.length,
            text: text,
            rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]
          });
        }
      }
    });
  }

  return JSON.stringify({ count: contacts.length, contacts: contacts });
})()
`;

// ========== 点击第 N 个联系人 ==========
function clickContact(index) {
  return `
(function() {
  const contacts = [];
  document.querySelectorAll('li').forEach(li => {
    const r = li.getBoundingClientRect();
    if (r.x < 420 && r.width > 150 && r.height > 40 && li.offsetParent) {
      contacts.push(li);
    }
  });
  if (contacts.length === 0) {
    document.querySelectorAll('.name, .name-text, [class*="name"]').forEach(el => {
      const li = el.closest('li') || el.closest('[class*="item"]');
      if (li && li.offsetParent && !contacts.includes(li)) contacts.push(li);
    });
  }
  const target = contacts[${index}];
  if (!target) return 'not_found: index=${index} total=' + contacts.length;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.click();
  return 'clicked: ' + (target.textContent || '').trim().substring(0, 30);
})()
`;
}

// ========== 等待聊天界面加载 ==========
const WAIT_CHAT_LOADED = `
(function() {
  const checks = [
    '#pic1688-toolbar',
    '.btn-sendimg',
    '[class*="chat-input"]',
    '[class*="edit-area"]',
    '[contenteditable="true"]',
    'textarea'
  ];
  const found = [];
  for (const sel of checks) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const r = el.getBoundingClientRect();
        found.push({ sel: sel, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], visible: !!el.offsetParent });
      }
    } catch(_) {}
  }
  return JSON.stringify({ loaded: found.length > 0, elements: found });
})()
`;

// ========== 策略2：拦截 showOpenFilePicker（Mock 模式）==========
function mockFilePicker(fileName, fileType) {
  return `
(function() {
  if (window.___ab_mock_active___) return 'already_mocked';
  window.___ab_mock_active___ = true;
  window.___ab_mock_intercepted___ = false;

  // 在页面中创建 File（从已有的数据）
  // 注意：这个函数需要在 upload 策略中先通过另一个 eval 注入 File 数据
  // 这里只做拦截器安装

  // 保存原始函数
  window.___ab_orig_fsp___ = window.showOpenFilePicker;
  window.___ab_orig_click___ = HTMLInputElement.prototype.click;

  window.showOpenFilePicker = async function(options) {
    window.___ab_mock_intercepted___ = true;
    console.log('[AB] showOpenFilePicker 被拦截');

    // 尝试从 DOM 中获取预置的 file 数据
    const dataEl = document.getElementById('___ab_file_data___');
    if (!dataEl) {
      console.error('[AB] 未找到预置文件数据');
      throw new DOMException('No file data', 'AbortError');
    }

    const { fileName, fileType, base64 } = JSON.parse(dataEl.textContent);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: fileType });
    const file = new File([blob], fileName, { type: fileType, lastModified: Date.now() });

    class MockFSH {
      constructor(f) { this._f = f; }
      get kind() { return 'file'; }
      get name() { return this._f.name; }
      async getFile() { return this._f; }
      async queryPermission() { return 'granted'; }
      async requestPermission() { return 'granted'; }
      async isSameEntry(o) { return o === this; }
      async createWritable() {
        return {
          write: async () => {},
          close: async () => {},
          seek: async () => {},
          truncate: async () => {},
          get locked() { return false; },
          abort: async () => {}
        };
      }
      async remove() {}
      async move() {}
    }
    Object.defineProperty(MockFSH.prototype, Symbol.toStringTag, { value: 'FileSystemFileHandle' });
    Object.defineProperty(MockFSH.prototype.constructor, 'name', { value: 'FileSystemFileHandle' });

    return [new MockFSH(file)];
  };

  // 拦截 input.click() 防止弹出原生文件对话框
  HTMLInputElement.prototype.click = function() {
    if (this.type === 'file') {
      console.log('[AB] 拦截 input[type=file].click()');
      return;
    }
    return window.___ab_orig_click___.call(this);
  };

  return 'mock_installed';
})()
`;
}

// ========== 恢复被拦截的函数 ==========
const RESTORE_MOCK = `
(function() {
  if (window.___ab_orig_fsp___) {
    window.showOpenFilePicker = window.___ab_orig_fsp___;
    delete window.___ab_orig_fsp___;
  }
  if (window.___ab_orig_click___) {
    HTMLInputElement.prototype.click = window.___ab_orig_click___;
    delete window.___ab_orig_click___;
  }
  delete window.___ab_mock_active___;
  delete window.___ab_mock_intercepted___;
  const dataEl = document.getElementById('___ab_file_data___');
  if (dataEl) dataEl.remove();
  return 'mock_restored';
})()
`;

// ========== 检查拦截是否被触发 ==========
const CHECK_MOCK_INTERCEPTED = 'JSON.stringify({ intercepted: !!window.___ab_mock_intercepted___ })';

// ========== 策略1：注入 base64 数据到隐藏元素（为策略2做准备）==========
function injectFileData(fileName, fileType, base64) {
  return `
(function() {
  let el = document.getElementById('___ab_file_data___');
  if (!el) {
    el = document.createElement('div');
    el.id = '___ab_file_data___';
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  el.textContent = JSON.stringify({
    fileName: ${JSON.stringify(fileName)},
    fileType: ${JSON.stringify(fileType)},
    base64: ${JSON.stringify(base64)}
  });
  return 'file_data_injected:' + ${JSON.stringify(fileName)};
})()
`;
}

// ========== 策略3：data URL 注入到编辑器 ==========
function injectDataURLToEditor(dataUrl) {
  return `
(function() {
  const dataUrl = ${JSON.stringify(dataUrl)};

  // 找到编辑器
  let editor = null;
  const sels = ['[contenteditable="true"]', '[role="textbox"]', 'textarea', '.ql-editor', '.ProseMirror'];
  for (const sel of sels) {
    try {
      const el = document.querySelector(sel);
      if (el && el.offsetParent) {
        const r = el.getBoundingClientRect();
        if (r.width > 100 && r.height > 20) { editor = el; break; }
      }
    } catch(_) {}
  }

  if (!editor) {
    // 扫描所有 div 找可能的编辑器
    const candidates = [];
    document.querySelectorAll('div, section').forEach(el => {
      if (!el.offsetParent) return;
      const r = el.getBoundingClientRect();
      if (r.y > 300 && r.width > 300 && r.height > 60 && r.height < 400) {
        candidates.push({ el, score: r.width + r.height * 2 });
      }
    });
    candidates.sort((a, b) => b.score - a.score);
    for (const { el } of candidates) {
      const cls = (el.className || '').toString().toLowerCase();
      if (cls.includes('editor') || cls.includes('edit') || cls.includes('input') || cls.includes('chat')) {
        editor = el;
        break;
      }
    }
    if (!editor && candidates.length > 0) editor = candidates[0].el;
  }

  if (!editor) return 'no_editor_found';

  editor.focus();
  editor.click();

  // 插入图片
  if (editor.contentEditable === 'true' || editor.getAttribute('contenteditable') === 'true') {
    editor.innerHTML = '';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.maxWidth = '200px';
    img.style.maxHeight = '200px';
    editor.appendChild(img);
  } else {
    editor.innerHTML = '<img src="' + dataUrl + '" style="max-width:200px;max-height:200px;">';
  }

  // 触发 Vue 事件
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.dispatchEvent(new Event('change', { bubbles: true }));
  editor.dispatchEvent(new CompositionEvent('compositionend', { data: '', bubbles: true }));

  return 'dataurl_injected:' + (editor.className || '').toString().substring(0, 40);
})()
`;
}

// ========== 策略4：暴力 file input 注入 ==========
function bruteForceInject(fileName, fileType, base64) {
  return `
(function() {
  const binary = atob(${JSON.stringify(base64)});
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: ${JSON.stringify(fileType)} });
  const file = new File([blob], ${JSON.stringify(fileName)}, { type: ${JSON.stringify(fileType)}, lastModified: Date.now() });

  const dt = new DataTransfer();
  dt.items.add(file);

  const inputs = document.querySelectorAll('input[type="file"]');
  const results = [];

  for (const input of inputs) {
    try {
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
      if (desc && desc.set) {
        desc.set.call(input, dt.files);
      } else {
        input.files = dt.files;
      }
      if (input._valueTracker) input._valueTracker.setValue('');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      results.push('injected:' + (input.accept || 'none'));
    } catch(e) {
      results.push('error:' + e.message);
    }
  }

  return JSON.stringify({ count: inputs.length, results: results });
})()
`;
}

// ========== 查找并点击图片按钮 ==========
const CLICK_IMAGE_BUTTON = `
(function() {
  // 策略1：精确匹配
  const selectors = [
    '.btn-sendimg',
    '[class*="btn-sendimg"]',
    '[title="发送图片"]',
    'svg.lucide-image',
    'svg[class*="lucide"][class*="image"]',
  ];
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el && el.offsetParent) {
        const clickable = el.closest('button, .toolbarButton, [role="button"]') || el.parentElement || el;
        clickable.click();
        return 'clicked:' + sel;
      }
    } catch(_) {}
  }

  // 策略2：按 title 找
  for (const el of document.querySelectorAll('div, span, button, i, svg')) {
    if (!el.offsetParent) continue;
    const t = (el.getAttribute('title') || '').toLowerCase();
    if (t.includes('图片') || t.includes('照片') || t.includes('image') || t.includes('photo')) {
      el.click();
      return 'clicked:title=' + t;
    }
  }

  // 策略3：#pic1688-toolbar 的第一个可见子元素
  const toolbar = document.querySelector('#pic1688-toolbar');
  if (toolbar) {
    for (const child of toolbar.children) {
      if (child.offsetParent) {
        child.click();
        return 'clicked:toolbar-child';
      }
    }
  }

  return 'no_image_button';
})()
`;

// ========== 查找发送按钮状态 ==========
const CHECK_SEND_BUTTON = `
(function() {
  const selectors = ['.btn-send', '.btn-sure-v2', 'button.btn-send', '[class*="btn-send"]'];
  const results = [];
  for (const sel of selectors) {
    try {
      const btn = document.querySelector(sel);
      if (btn) {
        const r = btn.getBoundingClientRect();
        results.push({
          sel: sel,
          visible: !!btn.offsetParent,
          disabled: btn.disabled || btn.classList.contains('disabled'),
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          text: (btn.textContent || '').trim().substring(0, 20)
        });
      }
    } catch(_) {}
  }
  return JSON.stringify(results);
})()
`;

// ========== 点击发送按钮 ==========
const CLICK_SEND_BUTTON = `
(function() {
  // 策略1：精确匹配
  const selectors = ['.btn-send', '.btn-sure-v2', 'button.btn-send', '[class*="btn-send"]'];
  for (const sel of selectors) {
    try {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent) {
        btn.classList.remove('disabled');
        btn.disabled = false;
        btn.click();
        return 'clicked:' + sel;
      }
    } catch(_) {}
  }

  // 策略2：文本匹配 "发送"
  for (const el of document.querySelectorAll('button, span, div[role="button"], i')) {
    if (!el.offsetParent) continue;
    const text = (el.textContent || '').trim();
    if (text === '发送' || text === 'Send') {
      const r = el.getBoundingClientRect();
      if (r.y > 300 && r.width < 200) {
        el.click();
        return 'clicked:text=' + text;
      }
    }
  }

  // 策略3：右下角按钮
  const vw = innerWidth, vh = innerHeight;
  for (const el of document.querySelectorAll('button, i, svg, span')) {
    if (!el.offsetParent) continue;
    const r = el.getBoundingClientRect();
    if (r.x > vw * 0.65 && r.y > vh - 150 && r.width > 15 && r.width < 120 && r.height > 15) {
      el.click();
      return 'clicked:corner';
    }
  }

  // 策略4：Enter 键
  const editor = document.querySelector('[contenteditable="true"], textarea, [role="textbox"]');
  const target = editor || document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
  target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));

  return 'enter_sent';
})()
`;

// ========== 处理确认弹窗 ==========
const HANDLE_CONFIRM_DIALOG = `
(function() {
  const confirmTexts = ['发送', '确定', '确认', '确认发送', '发送图片'];
  for (const el of document.querySelectorAll('button, a, span, div[role="button"]')) {
    if (!el.offsetParent) continue;
    const text = (el.textContent || '').trim();
    for (const ct of confirmTexts) {
      if (text === ct) {
        const inDialog = el.closest('[class*="dialog"], [class*="modal"], [class*="popup"], [class*="confirm"], [class*="preview"]');
        if (inDialog || el.getBoundingClientRect().y > 250) {
          el.click();
          return 'confirmed:' + text;
        }
      }
    }
  }
  return 'no_dialog';
})()
`;

// ========== 检查消息是否发送成功 ==========
const CHECK_MESSAGE_SENT = `
(function() {
  // 检查是否出现成功提示或消息已出现
  const toastEls = document.querySelectorAll('[class*="toast"], [class*="message"], [class*="notification"], [class*="tip"]');
  const toasts = [];
  for (const el of toastEls) {
    if (el.offsetParent) {
      toasts.push((el.textContent || '').trim().substring(0, 50));
    }
  }
  // 检查编辑器是否清空（表示消息已发送）
  const editor = document.querySelector('[contenteditable="true"], textarea');
  const editorEmpty = editor ? ((editor.value || editor.textContent || '') === '') : null;

  return JSON.stringify({ toasts, editorEmpty });
})()
`;

module.exports = {
  ANTI_DETECTION,
  CHECK_LOGIN,
  GET_CONTACTS,
  clickContact,
  WAIT_CHAT_LOADED,
  mockFilePicker,
  RESTORE_MOCK,
  CHECK_MOCK_INTERCEPTED,
  injectFileData,
  injectDataURLToEditor,
  bruteForceInject,
  CLICK_IMAGE_BUTTON,
  CHECK_SEND_BUTTON,
  CLICK_SEND_BUTTON,
  HANDLE_CONFIRM_DIALOG,
  CHECK_MESSAGE_SENT,
};
