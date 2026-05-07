/**
 * Content Script 主入口
 * 负责消息监听和功能调度
 */
(function () {
  'use strict';

  BossLogger.info('插件已加载 ✓ 当前页面: ' + window.location.href);

  // 监听来自 Background 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    BossLogger.debug('收到消息: ' + message.type);
    // 用 async IIFE 包裹以支持 await
    (async () => {
    switch (message.type) {
      // 自动投递控制
      case MSG_TYPE.DO_AUTO_APPLY:
        if (!(await _checkLicense())) {
          sendResponse({ success: false, error: 'license_invalid' });
          break;
        }
        AutoApply.start(message.data?.maxApplyCount || 50);
        sendResponse({ success: true });
        break;

      case MSG_TYPE.DO_STOP:
        AutoApply.stop('来自 Popup 的停止指令');
        sendResponse({ success: true });
        break;

      case MSG_TYPE.DO_PAUSE:
        AutoApply.togglePause();
        sendResponse({ success: true });
        break;

      // 聊天批量发图控制
      case MSG_TYPE.DO_CHAT_RESUME:
        if (!(await _checkLicense())) {
          sendResponse({ success: false, error: 'license_invalid' });
          break;
        }
        ChatResumeSender.start();
        sendResponse({ success: true });
        break;

      case MSG_TYPE.DO_STOP_CHAT_RESUME:
        ChatResumeSender.stop();
        sendResponse({ success: true });
        break;

      case 'run_diagnostic':
        // _scanDOM 比 BossDiagnostic 更全面，用它即可
        // 两者都会写入 chrome.storage.local 的 boss_diagnostic 键
        if (typeof ChatResumeSender._scanDOM === 'function') {
          ChatResumeSender._scanDOM();
        }
        sendResponse({ success: true });
        break;

      // License 检查
      case 'check_license':
        sendResponse({ active: LicenseService.isActive(), state: LicenseService.getState() });
        break;

      case 'activate_license':
        try {
          const result = await LicenseService.activate(message.data?.licenseKey);
          sendResponse(result);
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
        break;

      default:
        sendResponse({ success: false, error: '未知消息类型' });
    }
    })();
    return true;
  });

  // 启动时检查 License
  (async () => {
    try {
      await LicenseService.checkOnStartup();
      if (!LicenseService.isActive()) {
        BossLogger.warn('License 未激活，核心功能已锁定');
      }
    } catch (_) {}
  })();

  // License 检查辅助：每次调用重新验证（popup 激活后 content script 尚未刷新时）
  var _checkLicense = async function () {
    // 重新从存储读取，避免使用过期状态
    await LicenseService.checkOnStartup();
    if (!LicenseService.isActive()) {
      BossLogger.warn('License 验证失败，操作被阻止');
      chrome.runtime.sendMessage({
        type: MSG_TYPE.PROGRESS_UPDATE,
        data: { licenseState: LicenseService.getState() },
      });
      return false;
    }
    return true;
  };
})();
