/**
 * BOSS 直聘 PUA 字体混淆解码器
 *
 * BOSS 使用自定义 @font-face 将数字映射到 Unicode PUA 码位（U+E000 ~ U+F8FF）。
 * 方案A：取 PUA 字符的低字节还原 ASCII（覆盖最常见的编码方式）
 * 方案B：从页面 CSS 中查找 @font-face，下载字体解析 cmap 表（更精确）
 */
const FontDecoder = {
  _mapping: null, // 从字体解析出的 PUA → 真实字符映射

  /**
   * 解码被 PUA 字体混淆的文本
   */
  decode(text) {
    if (!text) return text;
    if (!this.hasObscuredChars(text)) return text;

    // 先用方案A快速解码（低字节法）
    let result = '';
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code >= 0xE000 && code <= 0xF8FF) {
        const lo = code & 0xFF;
        if (lo >= 0x30 && lo <= 0x39) {
          result += String.fromCharCode(lo); // 数字 0-9
        } else if (lo >= 0x41 && lo <= 0x5A) {
          result += String.fromCharCode(lo); // 大写字母
        } else if (lo >= 0x61 && lo <= 0x7A) {
          result += String.fromCharCode(lo); // 小写字母
        } else {
          result += ch; // 无法识别，保留原字符
        }
      } else {
        result += ch;
      }
    }
    return result;
  },

  /**
   * 检查文本是否包含 PUA 混淆字符
   */
  hasObscuredChars(text) {
    if (!text) return false;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code >= 0xE000 && code <= 0xF8FF) return true;
    }
    return false;
  },

  /**
   * 诊断：decode 并输出前后对比（用于日志面板验证）
   */
  decodeWithLog(text) {
    if (!text) return text;
    const decoded = this.decode(text);
    if (decoded !== text && typeof UIInjector !== 'undefined') {
      UIInjector.addLog(`🔤 字体解码: "${text}" → "${decoded}"`);
    }
    return decoded;
  },
};
