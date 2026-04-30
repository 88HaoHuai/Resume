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

    switch (message.type) {
      // 自动投递控制
      case MSG_TYPE.DO_AUTO_APPLY:
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

      default:
        sendResponse({ success: false, error: '未知消息类型' });
    }

    return true;
  });
})();
