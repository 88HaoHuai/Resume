/**
 * License 验证服务（精简版）
 *
 * 与 popup 共享 boss_license_session 存储
 * popup 激活 → 写入 session → content script 读取验证
 */

const LicenseService = {
  API_BASE: 'http://localhost:3005/api',
  SESSION_KEY: 'boss_license_session',

  _state: 'unactivated',

  getMachineId() {
    return [
      navigator.hardwareConcurrency || 4,
      navigator.platform || 'unknown',
      screen.width, screen.height,
      navigator.language || 'zh-CN',
    ].join('_');
  },

  async getSession() {
    const r = await chrome.storage.local.get(this.SESSION_KEY);
    return r[this.SESSION_KEY] || null;
  },

  async checkOnStartup() {
    try {
      const session = await this.getSession();
      if (!session || !session.token) {
        this._state = 'unactivated';
        return false;
      }
      // 离线兜底 7 天
      const days = session.lastCheck ? (Date.now() - session.lastCheck) / 86400000 : 999;
      if (days > 7 && days < 999) {
        this._state = 'expired';
        return false;
      }
      // 联网验证
      try {
        const resp = await fetch(`${this.API_BASE}/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionToken: session.token, machineId: this.getMachineId() }),
        });
        const r = await resp.json();
        if (resp.ok && r.valid) {
          session.lastCheck = Date.now();
          await chrome.storage.local.set({ [this.SESSION_KEY]: session });
          this._state = 'active';
          return true;
        }
        this._state = r.reason === 'machine_mismatch' ? 'mismatch' : 'expired';
        return false;
      } catch (_) {
        if (days <= 7) { this._state = 'active'; return true; }
        this._state = 'expired';
        return false;
      }
    } catch (_) {
      this._state = 'unactivated';
      return false;
    }
  },

  getState() { return this._state; },
  isActive() { return this._state === 'active'; },
};
