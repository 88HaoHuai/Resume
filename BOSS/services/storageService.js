/**
 * 本地数据存储服务
 * 封装 chrome.storage.local 操作
 */

const StorageService = {
  /**
   * 获取存储数据
   * @param {string|string[]} keys - 存储键名
   * @returns {Promise<Object>}
   */
  async get(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => {
        resolve(result);
      });
    });
  },

  /**
   * 设置存储数据
   * @param {Object} data - 要存储的键值对
   * @returns {Promise<void>}
   */
  async set(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set(data, () => {
        resolve();
      });
    });
  },

  /**
   * 删除存储数据
   * @param {string|string[]} keys - 要删除的键名
   * @returns {Promise<void>}
   */
  async remove(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(keys, () => {
        resolve();
      });
    });
  },

  // ========== 投递记录相关 ==========

  /**
   * 保存一条投递记录
   * @param {Object} record - 投递记录对象
   */
  async saveApplyRecord(record) {
    const result = await this.get(STORAGE_KEYS.APPLY_RECORDS);
    const records = result[STORAGE_KEYS.APPLY_RECORDS] || [];
    records.unshift({
      ...record,
      id: BossHelper.generateId(),
      timestamp: Date.now(),
      timeStr: BossHelper.getTimestamp(),
    });
    // 最多保存 5000 条记录
    if (records.length > 5000) {
      records.length = 5000;
    }
    await this.set({ [STORAGE_KEYS.APPLY_RECORDS]: records });
  },

  /**
   * 获取所有投递记录
   * @returns {Promise<Array>}
   */
  async getApplyRecords() {
    const result = await this.get(STORAGE_KEYS.APPLY_RECORDS);
    return result[STORAGE_KEYS.APPLY_RECORDS] || [];
  },

  /**
   * 检查某个职位是否已投递
   * @param {string} jobId - 职位唯一标识
   * @returns {Promise<boolean>}
   */
  async isApplied(jobId) {
    const records = await this.getApplyRecords();
    return records.some(r => r.jobId === jobId && r.status === APPLY_STATUS.APPLIED);
  },

  // ========== 每日计数相关 ==========

  /**
   * 获取今日投递数量
   * @returns {Promise<number>}
   */
  async getDailyCount() {
    const result = await this.get([STORAGE_KEYS.DAILY_COUNT, STORAGE_KEYS.DAILY_DATE]);
    const today = BossHelper.getTodayStr();
    // 如果日期变了，重置计数
    if (result[STORAGE_KEYS.DAILY_DATE] !== today) {
      await this.set({
        [STORAGE_KEYS.DAILY_COUNT]: 0,
        [STORAGE_KEYS.DAILY_DATE]: today,
      });
      return 0;
    }
    return result[STORAGE_KEYS.DAILY_COUNT] || 0;
  },

  /**
   * 增加今日投递计数
   * @returns {Promise<number>} 更新后的计数
   */
  async incrementDailyCount() {
    const count = await this.getDailyCount();
    const newCount = count + 1;
    await this.set({ [STORAGE_KEYS.DAILY_COUNT]: newCount });
    return newCount;
  },

  // ========== 配置相关 ==========

  /**
   * 获取插件配置
   * @returns {Promise<Object>}
   */
  async getConfig() {
    const result = await this.get(STORAGE_KEYS.CONFIG);
    return result[STORAGE_KEYS.CONFIG] || {};
  },

  /**
   * 保存插件配置
   * @param {Object} config - 配置对象
   */
  async saveConfig(config) {
    await this.set({ [STORAGE_KEYS.CONFIG]: config });
  },

  // ========== 筛选条件相关 ==========

  /**
   * 获取筛选条件
   * @returns {Promise<Object>}
   */
  async getFilter() {
    const result = await this.get(STORAGE_KEYS.FILTER);
    return result[STORAGE_KEYS.FILTER] || { ...DEFAULT_FILTER };
  },

  /**
   * 保存筛选条件
   * @param {Object} filter - 筛选条件对象
   */
  async saveFilter(filter) {
    await this.set({ [STORAGE_KEYS.FILTER]: filter });
  },

  // ========== 黑名单相关 ==========

  /**
   * 获取公司黑名单
   * @returns {Promise<string[]>}
   */
  async getBlacklist() {
    const result = await this.get(STORAGE_KEYS.BLACKLIST);
    return result[STORAGE_KEYS.BLACKLIST] || [];
  },

  /**
   * 添加公司到黑名单
   * @param {string} companyName - 公司名称
   */
  async addToBlacklist(companyName) {
    const list = await this.getBlacklist();
    if (!list.includes(companyName)) {
      list.push(companyName);
      await this.set({ [STORAGE_KEYS.BLACKLIST]: list });
    }
  },

  // ========== 图片简历相关 ==========

  /**
   * 保存图片简历
   * @param {string} base64Data - Base64 编码的图片数据
   */
  async saveResumeImage(base64Data) {
    await this.set({ [STORAGE_KEYS.RESUME_IMAGE]: base64Data });
  },

  /**
   * 获取图片简历
   * @returns {Promise<string|null>}
   */
  async getResumeImage() {
    const result = await this.get(STORAGE_KEYS.RESUME_IMAGE);
    return result[STORAGE_KEYS.RESUME_IMAGE] || null;
  },

  /**
   * 获取图片简历发送开关状态
   * @returns {Promise<boolean>}
   */
  async isResumeEnabled() {
    const result = await this.get(STORAGE_KEYS.RESUME_ENABLED);
    return result[STORAGE_KEYS.RESUME_ENABLED] || false;
  },

  // ========== 插件状态相关 ==========

  /**
   * 获取运行状态
   * @returns {Promise<string>}
   */
  async getRunningState() {
    const result = await this.get(STORAGE_KEYS.RUNNING_STATE);
    return result[STORAGE_KEYS.RUNNING_STATE] || PLUGIN_STATE.IDLE;
  },

  /**
   * 设置运行状态
   * @param {string} state - 状态值
   */
  async setRunningState(state) {
    await this.set({ [STORAGE_KEYS.RUNNING_STATE]: state });
  },

  // ========== 简历记忆系统 ==========

  // --- 简历版本 ---

  async getBaseResume() {
    const result = await this.get(STORAGE_KEYS.BASE_RESUME);
    return result[STORAGE_KEYS.BASE_RESUME] || null;
  },

  async saveBaseResume(content) {
    await this.set({ [STORAGE_KEYS.BASE_RESUME]: content });
  },

  async getResumeVersions() {
    const result = await this.get(STORAGE_KEYS.RESUME_VERSIONS);
    return result[STORAGE_KEYS.RESUME_VERSIONS] || [];
  },

  async saveResumeVersions(versions) {
    await this.set({ [STORAGE_KEYS.RESUME_VERSIONS]: versions });
  },

  async addResumeVersion(version) {
    const versions = await this.getResumeVersions();
    versions.unshift({ ...version, id: BossHelper.generateId(), createdAt: Date.now() });
    await this.saveResumeVersions(versions);
    return version;
  },

  async updateResumeVersion(id, updates) {
    const versions = await this.getResumeVersions();
    const idx = versions.findIndex(v => v.id === id);
    if (idx !== -1) {
      versions[idx] = { ...versions[idx], ...updates, updatedAt: Date.now() };
      await this.saveResumeVersions(versions);
    }
  },

  async deleteResumeVersion(id) {
    const versions = await this.getResumeVersions();
    await this.saveResumeVersions(versions.filter(v => v.id !== id));
  },

  async getActiveVersionId() {
    const result = await this.get(STORAGE_KEYS.ACTIVE_RESUME_VERSION);
    return result[STORAGE_KEYS.ACTIVE_RESUME_VERSION] || null;
  },

  async setActiveVersionId(id) {
    await this.set({ [STORAGE_KEYS.ACTIVE_RESUME_VERSION]: id });
  },

  // --- 岗位详情 ---

  async getJobDetails() {
    const result = await this.get(STORAGE_KEYS.JOB_DETAILS);
    return result[STORAGE_KEYS.JOB_DETAILS] || {};
  },

  async getJobDetail(jobId) {
    const details = await this.getJobDetails();
    return details[jobId] || null;
  },

  async saveJobDetail(jobId, detail) {
    const details = await this.getJobDetails();
    details[jobId] = { ...detail, savedAt: Date.now() };
    // 最多保留 500 条
    const keys = Object.keys(details);
    if (keys.length > 500) {
      const oldest = keys.sort((a, b) => (details[a].savedAt || 0) - (details[b].savedAt || 0));
      oldest.slice(0, keys.length - 500).forEach(k => delete details[k]);
    }
    await this.set({ [STORAGE_KEYS.JOB_DETAILS]: details });
  },

  // --- 优化记录 ---

  async getOptimizationRecords() {
    const result = await this.get(STORAGE_KEYS.OPTIMIZATION_RECORDS);
    return result[STORAGE_KEYS.OPTIMIZATION_RECORDS] || [];
  },

  async addOptimizationRecord(record) {
    const records = await this.getOptimizationRecords();
    records.unshift({ ...record, id: BossHelper.generateId(), createdAt: Date.now() });
    if (records.length > 500) records.length = 500;
    await this.set({ [STORAGE_KEYS.OPTIMIZATION_RECORDS]: records });
  },

  // --- API 配置 ---

  async saveApiKey(encryptedKey) {
    await this.set({ [STORAGE_KEYS.API_KEY]: encryptedKey });
  },

  async getApiKey() {
    const result = await this.get(STORAGE_KEYS.API_KEY);
    return result[STORAGE_KEYS.API_KEY] || null;
  },

  async getApiConfig() {
    const result = await this.get(STORAGE_KEYS.API_CONFIG);
    return result[STORAGE_KEYS.API_CONFIG] || { model: 'deepseek-v4', baseUrl: 'https://api.deepseek.com/v1' };
  },

  async saveApiConfig(config) {
    await this.set({ [STORAGE_KEYS.API_CONFIG]: config });
  },

  // --- 回复追踪 ---

  async getResponseTracking() {
    const result = await this.get(STORAGE_KEYS.RESPONSE_TRACKING);
    return result[STORAGE_KEYS.RESPONSE_TRACKING] || {};
  },

  async recordResponse(jobId, status, note = '') {
    const tracking = await this.getResponseTracking();
    tracking[jobId] = { status, note, updatedAt: Date.now() };
    await this.set({ [STORAGE_KEYS.RESPONSE_TRACKING]: tracking });
  },
};
