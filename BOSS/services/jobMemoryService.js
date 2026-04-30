/**
 * 岗位记忆服务
 * 存储投递岗位的完整描述、要求提取、分析状态
 */
const JobMemoryService = {
  /**
   * 保存岗位完整详情
   * @param {string} jobId - 岗位唯一 ID
   * @param {Object} detail - { jobTitle, companyName, salary, location, fullDescription, jobUrl, ... }
   */
  async saveJobDetail(jobId, detail) {
    const existing = await StorageService.getJobDetail(jobId);
    await StorageService.saveJobDetail(jobId, {
      ...(existing || {}),
      ...detail,
      firstSeenAt: existing?.firstSeenAt || Date.now(),
      updatedAt: Date.now(),
    });
  },

  /**
   * 获取单个岗位详情
   */
  async getJobDetail(jobId) {
    return await StorageService.getJobDetail(jobId);
  },

  /**
   * 获取所有岗位详情
   * @returns {Promise<Object>} { jobId: detail, ... }
   */
  async getAllJobDetails() {
    return await StorageService.getJobDetails();
  },

  /**
   * 获取所有岗位详情数组（按时间倒序）
   */
  async getJobDetailList() {
    const details = await this.getAllJobDetails();
    return Object.entries(details)
      .map(([jobId, detail]) => ({ jobId, ...detail }))
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  },

  /**
   * 获取尚未分析过的岗位
   * @returns {Promise<Array>}
   */
  async getUnanalyzedJobs() {
    const list = await this.getJobDetailList();
    return list.filter(j => !j.analyzed && j.fullDescription);
  },

  /**
   * 标记岗位为已分析
   * @param {string} jobId
   * @param {string} resumeVersionId - 分析时使用的简历版本
   */
  async markAsAnalyzed(jobId, resumeVersionId) {
    const detail = await this.getJobDetail(jobId);
    if (detail) {
      await StorageService.saveJobDetail(jobId, {
        ...detail,
        analyzed: true,
        analyzedResumeVersionId: resumeVersionId,
        analyzedAt: Date.now(),
      });
    }
  },

  /**
   * 提取岗位要求关键词
   * 本地简单提取（不需要 API），作为 AI 分析的补充
   */
  extractKeywordsLocally(jobDetail) {
    const text = (jobDetail.fullDescription || '') + ' ' + (jobDetail.jobTitle || '');
    const techKeywords = [
      // 编程语言
      'Java', 'Python', 'Go', 'Rust', 'C++', 'C#', 'JavaScript', 'TypeScript', 'PHP', 'Ruby', 'Scala', 'Swift', 'Kotlin',
      // 前端
      'React', 'Vue', 'Angular', 'Next.js', 'Nuxt', 'Svelte', 'Webpack', 'Vite', 'CSS', 'HTML', 'Sass', 'Tailwind',
      // 后端
      'Spring', 'Spring Boot', 'MyBatis', 'Hibernate', 'Django', 'Flask', 'FastAPI', 'Express', 'NestJS', 'Gin', 'Koa',
      // 数据库
      'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Elasticsearch', 'ClickHouse', 'TiDB', 'Oracle', 'SQL Server',
      // 中间件
      'Kafka', 'RabbitMQ', 'RocketMQ', 'Nginx', 'Docker', 'Kubernetes', 'K8s', 'Jenkins', 'GitLab CI', 'GitHub Actions',
      // 云
      'AWS', 'Azure', '阿里云', '腾讯云', '华为云', 'GCP',
      // 领域
      '微服务', '分布式', '高并发', '大数据', 'AI', '机器学习', '深度学习', 'NLP', 'CV', 'LLM',
      // 管理
      '团队管理', '项目管理', '技术管理', '架构设计', '系统设计',
    ];

    const found = [];
    const lowerText = text.toLowerCase();
    for (const kw of techKeywords) {
      if (lowerText.includes(kw.toLowerCase())) {
        found.push(kw);
      }
    }
    return found;
  },

  /**
   * 搜索岗位（按关键词模糊匹配）
   */
  async searchJobs(query) {
    const list = await this.getJobDetailList();
    const q = query.toLowerCase();
    return list.filter(j =>
      (j.jobTitle || '').toLowerCase().includes(q) ||
      (j.companyName || '').toLowerCase().includes(q) ||
      (j.fullDescription || '').toLowerCase().includes(q)
    );
  },
};
