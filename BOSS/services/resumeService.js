/**
 * 简历版本管理服务
 * 管理基础简历和多个优化版本
 */
const ResumeService = {
  /**
   * 获取基础简历内容
   * @returns {Promise<string|null>}
   */
  async getBaseResume() {
    return await StorageService.getBaseResume();
  },

  /**
   * 保存基础简历
   * @param {string} content - Markdown 格式的简历内容
   */
  async saveBaseResume(content) {
    await StorageService.saveBaseResume(content);
    // 确保基础版本存在于版本列表中
    const versions = await this.getResumeVersions();
    const baseExists = versions.some(v => v.isBase);
    if (!baseExists) {
      const baseVersion = {
        id: 'base',
        name: '基础简历',
        content,
        isBase: true,
        keywords: [],
        targetJobTypes: [],
        createdAt: Date.now(),
        applyCount: 0,
        responseCount: 0,
      };
      const allVersions = [baseVersion, ...versions.filter(v => !v.isBase)];
      await StorageService.saveResumeVersions(allVersions);
      // 默认激活基础版本
      await StorageService.setActiveVersionId('base');
    } else {
      // 更新基础版本内容
      await StorageService.updateResumeVersion('base', { content, updatedAt: Date.now() });
    }
  },

  /**
   * 获取所有简历版本
   * @returns {Promise<Array>}
   */
  async getResumeVersions() {
    return await StorageService.getResumeVersions();
  },

  /**
   * 添加一个优化版本
   * @param {Object} version - { name, content, baseVersionId, keywords, targetJobTypes }
   * @returns {Promise<Object>}
   */
  async addVersion(version) {
    const v = {
      ...version,
      isBase: false,
      applyCount: 0,
      responseCount: 0,
    };
    return await StorageService.addResumeVersion(v);
  },

  /**
   * 删除一个版本
   * @param {string} id - 版本 ID
   */
  async deleteVersion(id) {
    if (id === 'base') return; // 不允许删除基础版本
    // 如果当前激活版本被删除，切换回基础版本
    const activeId = await this.getActiveVersionId();
    if (activeId === id) {
      await StorageService.setActiveVersionId('base');
    }
    await StorageService.deleteResumeVersion(id);
  },

  /**
   * 获取当前激活的版本 ID
   */
  async getActiveVersionId() {
    return await StorageService.getActiveVersionId() || 'base';
  },

  /**
   * 获取当前激活的简历内容
   */
  async getActiveResumeContent() {
    const activeId = await this.getActiveVersionId();
    const versions = await this.getResumeVersions();
    const active = versions.find(v => v.id === activeId);
    if (active) return active.content;
    // fallback to base
    return await this.getBaseResume();
  },

  /**
   * 设置激活版本
   */
  async setActiveVersion(id) {
    await StorageService.setActiveVersionId(id);
  },

  /**
   * 增加版本的投递计数
   */
  async incrementApplyCount(versionId) {
    const activeId = versionId || (await this.getActiveVersionId());
    const versions = await this.getResumeVersions();
    const v = versions.find(v => v.id === activeId);
    if (v) {
      v.applyCount = (v.applyCount || 0) + 1;
      await StorageService.saveResumeVersions(versions);
    }
  },

  /**
   * 增加版本的回复计数
   */
  async incrementResponseCount(versionId) {
    const versions = await this.getResumeVersions();
    const v = versions.find(v => v.id === versionId);
    if (v) {
      v.responseCount = (v.responseCount || 0) + 1;
      await StorageService.saveResumeVersions(versions);
    }
  },

  /**
   * 更新版本的回复计数（根据实际追踪数据刷新）
   */
  async refreshResponseCounts() {
    const tracking = await StorageService.getResponseTracking();
    const versions = await this.getResumeVersions();
    const counts = {};
    for (const [jobId, t] of Object.entries(tracking)) {
      if (t.resumeVersionId && (t.status === 'replied' || t.status === 'viewed')) {
        counts[t.resumeVersionId] = (counts[t.resumeVersionId] || 0) + 1;
      }
    }
    for (const v of versions) {
      v.responseCount = counts[v.id] || 0;
    }
    await StorageService.saveResumeVersions(versions);
  },

  /**
   * 从 Markdown 文本解析出简历概要
   */
  parseSummary(content) {
    if (!content) return { name: '', skills: [], experience: [] };
    const lines = content.split('\n');
    const summary = { name: '', skills: [], experience: [] };
    let currentSection = '';
    for (const line of lines) {
      if (/^#{1,2}\s+/.test(line)) {
        currentSection = line.replace(/^#+\s+/, '').trim();
      }
      if (currentSection === '技能' || currentSection === '技术栈' || currentSection === 'Skills') {
        const skills = line.match(/`([^`]+)`/g) || line.match(/[\w\-#.+]+/g);
        if (skills) summary.skills.push(...skills.map(s => s.replace(/`/g, '')));
      }
    }
    return summary;
  },
};
