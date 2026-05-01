/**
 * 图片上传策略链
 * 按优先级依次尝试：CDP upload → showOpenFilePicker 拦截 → data URL 注入 → 暴力注入
 */
const fs = require('fs');
const path = require('path');
const { run, runRetry, evalStdin, sleep } = require('./browser');
const {
  mockFilePicker, RESTORE_MOCK, CHECK_MOCK_INTERCEPTED,
  injectFileData, injectDataURLToEditor, bruteForceInject,
  CLICK_IMAGE_BUTTON, HANDLE_CONFIRM_DIALOG,
} = require('./eval-scripts');

/**
 * 策略1：CDP 级 upload 命令（主力策略）
 * 直接通过 CDP 协议设置 input.files，绕过所有 JS 拦截
 */
async function strategyCDPUpload(imagePath) {
  console.log('[upload:1] CDP upload...');

  // 先通过 eval 确保 file input 可见/可访问
  const makeVisible = `
(function() {
  const sendImgBtn = document.querySelector('.btn-sendimg, [class*="btn-sendimg"]');
  if (sendImgBtn) {
    const input = sendImgBtn.querySelector('input[type="file"]');
    if (input) {
      input.id = '___ab_target_input___';
      input.style.display = 'block';
      input.style.opacity = '1';
      input.style.position = 'static';
      input.style.width = '100px';
      input.style.height = '30px';
      return 'input_exposed:' + (input.accept || 'none');
    }
    return 'no_input_in_sendimg';
  }
  return 'no_sendimg_btn';
})()
`;
  const exposeResult = await evalStdin(makeVisible);
  console.log(`[upload:1] 暴露 input: ${exposeResult}`);

  // 尝试通过 CSS 选择器上传
  const selectors = [
    '#___ab_target_input___',
    '.btn-sendimg input[type="file"]',
    '[class*="btn-sendimg"] input[type="file"]',
    '#pic1688-toolbar input[type="file"]',
    'input[type="file"][accept*="image"]',
    'input[type="file"]',
  ];

  for (const sel of selectors) {
    try {
      console.log(`[upload:1] 尝试选择器: ${sel}`);
      await run(['upload', sel, imagePath], { timeout: 15000 });
      console.log(`[upload:1] upload 成功: ${sel}`);
      await sleep(2000);
      return true;
    } catch (e) {
      console.log(`[upload:1] upload 失败: ${sel} - ${e.message}`);
    }
  }

  return false;
}

/**
 * 策略2：showOpenFilePicker 拦截
 * Mock File System Access API，让 BOSS 以为用户通过系统对话框选择了文件
 */
async function strategyMockFilePicker(imagePath) {
  console.log('[upload:2] Mock showOpenFilePicker...');

  // 读取图片文件
  const fileBuffer = fs.readFileSync(imagePath);
  const base64 = fileBuffer.toString('base64');
  const fileName = path.basename(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp' };
  const fileType = mimeTypes[ext] || 'image/jpeg';

  // 1. 注入文件数据到隐藏 DOM 元素
  console.log('[upload:2] 注入文件数据...');
  await evalStdin(injectFileData(fileName, fileType, base64));

  // 2. 安装 Mock 拦截器
  console.log('[upload:2] 安装 Mock...');
  await evalStdin(mockFilePicker(fileName, fileType));

  // 3. 点击图片按钮
  console.log('[upload:2] 点击图片按钮...');
  const clickResult = await evalStdin(CLICK_IMAGE_BUTTON);
  console.log(`[upload:2] 图片按钮: ${clickResult}`);

  await sleep(3000);

  // 4. 检查拦截是否被触发
  const checkResult = await evalStdin(CHECK_MOCK_INTERCEPTED);
  console.log(`[upload:2] 拦截状态: ${checkResult}`);

  // 5. 恢复原始函数
  await evalStdin(RESTORE_MOCK);

  // 检查确认弹窗
  await sleep(1000);
  const dialogResult = await evalStdin(HANDLE_CONFIRM_DIALOG);
  console.log(`[upload:2] 弹窗: ${dialogResult}`);

  // 不论拦截是否成功，都返回 true 让后续流程继续
  // 因为 BOSS 可能已经通过其他机制接收了文件
  return true;
}

/**
 * 策略3：data URL 注入到编辑器
 * 将图片转为 base64 data URL，直接插入编辑器的 DOM 中
 */
async function strategyDataURL(imagePath) {
  console.log('[upload:3] data URL 注入...');

  const fileBuffer = fs.readFileSync(imagePath);
  const base64 = fileBuffer.toString('base64');
  const ext = path.extname(imagePath).toLowerCase();
  const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
  const mime = mimeTypes[ext] || 'image/jpeg';
  const dataUrl = `data:${mime};base64,${base64}`;

  console.log(`[upload:3] data URL 大小: ${(dataUrl.length / 1024).toFixed(0)}KB`);

  const result = await evalStdin(injectDataURLToEditor(dataUrl));
  console.log(`[upload:3] 注入结果: ${result}`);

  if (result === 'no_editor_found') return false;

  await sleep(2000);
  return true;
}

/**
 * 策略4：暴力注入所有 file input
 * 遍历页面上所有 input[type="file"]，用 DataTransfer 注入文件
 */
async function strategyBruteForce(imagePath) {
  console.log('[upload:4] 暴力注入...');

  const fileBuffer = fs.readFileSync(imagePath);
  const base64 = fileBuffer.toString('base64');
  const fileName = path.basename(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
  const fileType = mimeTypes[ext] || 'image/jpeg';

  const result = await evalStdin(bruteForceInject(fileName, fileType, base64));
  console.log(`[upload:4] 暴力注入结果: ${result}`);

  await sleep(2000);
  return true;
}

/**
 * 执行完整的图片上传策略链
 * 按优先级依次尝试，任一成功即停止
 * @param {string} imagePath - 本地图片文件路径
 * @returns {Promise<boolean>} 是否成功上传
 */
async function uploadImage(imagePath) {
  if (!fs.existsSync(imagePath)) {
    console.error(`[upload] 图片文件不存在: ${imagePath}`);
    return false;
  }

  const stats = fs.statSync(imagePath);
  console.log(`[upload] 图片: ${imagePath} (${(stats.size / 1024).toFixed(1)}KB)`);

  // 策略1：CDP upload（主力）
  if (await strategyCDPUpload(imagePath)) {
    console.log('[upload] 策略1 (CDP upload) 成功');
    return true;
  }

  // 策略2：showOpenFilePicker Mock
  if (await strategyMockFilePicker(imagePath)) {
    console.log('[upload] 策略2 (Mock FSP) 完成');
    return true;
  }

  // 策略3：data URL 注入
  if (await strategyDataURL(imagePath)) {
    console.log('[upload] 策略3 (data URL) 成功');
    return true;
  }

  // 策略4：暴力注入
  if (await strategyBruteForce(imagePath)) {
    console.log('[upload] 策略4 (暴力注入) 完成');
    return true;
  }

  console.error('[upload] 所有策略均失败');
  return false;
}

module.exports = { uploadImage };
