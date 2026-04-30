/**
 * API Key 安全管理
 * 使用简单 XOR 混淆存储（Chrome 扩展无法使用真正的加密）
 */
const ApiKeyService = {
  // XOR 密钥（固定种子，仅防明文泄露）
  _xorSeed: 'boss_resume_optimizer_2024',

  /**
   * XOR 加密
   */
  _encrypt(plainText) {
    if (!plainText) return '';
    const key = this._xorSeed;
    let result = '';
    for (let i = 0; i < plainText.length; i++) {
      result += String.fromCharCode(plainText.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(result);
  },

  /**
   * XOR 解密
   */
  _decrypt(encryptedText) {
    if (!encryptedText) return '';
    try {
      const decoded = atob(encryptedText);
      const key = this._xorSeed;
      let result = '';
      for (let i = 0; i < decoded.length; i++) {
        result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      return result;
    } catch (e) {
      return '';
    }
  },

  /**
   * 保存 API Key（加密后存储）
   */
  async saveApiKey(apiKey) {
    const encrypted = this._encrypt(apiKey);
    await StorageService.saveApiKey(encrypted);
  },

  /**
   * 获取 API Key（解密后返回）
   */
  async getApiKey() {
    const encrypted = await StorageService.getApiKey();
    return encrypted ? this._decrypt(encrypted) : null;
  },

  /**
   * 检查是否已配置 API Key
   */
  async hasApiKey() {
    const key = await this.getApiKey();
    return !!key;
  },

  /**
   * 删除 API Key
   */
  async deleteApiKey() {
    await StorageService.saveApiKey('');
  },

  /**
   * 获取 API 配置（基础URL、模型等）
   */
  async getApiConfig() {
    return await StorageService.getApiConfig();
  },

  /**
   * 保存 API 配置
   */
  async saveApiConfig(config) {
    await StorageService.saveApiConfig(config);
  },

  /**
   * 验证 API Key 是否有效（通过一次轻量 API 调用）
   */
  async validateApiKey(apiKey) {
    const config = await this.getApiConfig();
    try {
      const resp = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
      });
      return resp.ok;
    } catch (e) {
      return false;
    }
  },
};
