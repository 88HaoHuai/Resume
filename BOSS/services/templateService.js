/**
 * 招呼语模板服务
 * 管理多套招呼语模板，支持变量插值和随机选择
 */

const TemplateService = {
  // 内置默认模板
  DEFAULT_TEMPLATES: [
    {
      id: 'default_1',
      name: '通用模板',
      content: '您好，我对贵司的{jobTitle}岗位很感兴趣，附上我的简历，期待与您进一步交流！',
      isDefault: true,
    },
    {
      id: 'default_2',
      name: '简洁模板',
      content: '您好！看到{companyName}的{jobTitle}岗位，非常感兴趣，方便聊聊吗？',
      isDefault: true,
    },
    {
      id: 'default_3',
      name: '正式模板',
      content: '您好，我关注到{companyName}正在招聘{jobTitle}，我的背景和岗位要求比较匹配，希望能有机会进一步沟通，感谢！',
      isDefault: true,
    },
  ],

  /**
   * 获取所有模板（默认 + 用户自定义）
   * @returns {Promise<Array>}
   */
  async getTemplates() {
    const result = await StorageService.get(STORAGE_KEYS.TEMPLATES);
    const userTemplates = result[STORAGE_KEYS.TEMPLATES] || [];
    // 合并默认模板和用户模板
    return [...this.DEFAULT_TEMPLATES, ...userTemplates];
  },

  /**
   * 保存用户自定义模板
   * @param {Array} templates - 用户模板数组
   */
  async saveTemplates(templates) {
    // 只保存非默认模板
    const userTemplates = templates.filter(t => !t.isDefault);
    await StorageService.set({ [STORAGE_KEYS.TEMPLATES]: userTemplates });
  },

  /**
   * 添加一个新模板
   * @param {string} name - 模板名称
   * @param {string} content - 模板内容
   */
  async addTemplate(name, content) {
    const result = await StorageService.get(STORAGE_KEYS.TEMPLATES);
    const templates = result[STORAGE_KEYS.TEMPLATES] || [];
    templates.push({
      id: BossHelper.generateId(),
      name,
      content,
      isDefault: false,
    });
    await StorageService.set({ [STORAGE_KEYS.TEMPLATES]: templates });
  },

  /**
   * 删除一个模板（不能删除默认模板）
   * @param {string} templateId - 模板 ID
   */
  async removeTemplate(templateId) {
    const result = await StorageService.get(STORAGE_KEYS.TEMPLATES);
    const templates = result[STORAGE_KEYS.TEMPLATES] || [];
    const filtered = templates.filter(t => t.id !== templateId);
    await StorageService.set({ [STORAGE_KEYS.TEMPLATES]: filtered });
  },

  /**
   * 随机选择一个模板并进行变量替换
   * @param {Object} jobInfo - 职位信息对象
   * @returns {Promise<string>} 替换变量后的招呼语
   */
  async generateGreeting(jobInfo) {
    const templates = await this.getTemplates();
    if (templates.length === 0) {
      return '您好，我对这个岗位很感兴趣，期待与您交流！';
    }
    // 随机选择一个模板
    const template = templates[BossHelper.randomInt(0, templates.length - 1)];
    // 变量替换
    return this.interpolate(template.content, jobInfo);
  },

  /**
   * 对模板进行变量插值
   * @param {string} template - 模板字符串
   * @param {Object} data - 变量数据
   * @returns {string} 替换后的字符串
   */
  interpolate(template, data) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return data[key] !== undefined ? data[key] : match;
    });
  },
};
