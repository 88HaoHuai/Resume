/**
 * AI 简历优化引擎
 * 使用 DeepSeek API 分析岗位匹配度并生成优化简历
 */
const OptimizationService = {
  /**
   * 分析模式 System Prompt
   */
  ANALYZE_PROMPT: `你是一位资深招聘顾问和简历专家。你的任务是分析求职者的简历与岗位要求之间的匹配度。

请按以下格式输出分析结果：

## 匹配度评分
[0-100分，并简要说明]

## 技能缺口
列出岗位要求但简历中未体现的技能或经验（每项一行，格式：- 技能/经验名称：重要程度（高/中/低））

## 简历亮点
岗位看重的、简历中已经体现的优势（每项一行）

## 修改建议
针对性地提出修改建议，按优先级排序（每项一行，格式：1. 建议内容）

## 关键词建议
建议在简历中增加的关键词（用逗号分隔）

注意：只输出以上五个部分，不要输出其他内容。`,

  /**
   * 生成模式 System Prompt
   */
  GENERATE_PROMPT: `你是一位资深简历撰写专家。根据用户的原始简历和目标岗位要求，生成一份优化后的简历。

优化原则：
1. 保留用户的所有真实经历，不能编造虚假信息
2. 重新组织描述，突出与岗位相关的技能和经验
3. 使用岗位JD中的关键词，提高ATS系统匹配率
4. 量化工作成果，使用"提升了X%"、"负责Y项目"等具体描述
5. 将最相关的技能和项目放在前面
6. 保持专业的简历语言风格
7. 如果用户的某项经历与岗位特别匹配，可以适当展开描述

输出要求：
- 直接输出优化后的完整简历（Markdown格式）
- 保持原有简历的结构框架
- 不要输出任何解释性文字，只输出简历内容`,

  // PII 占位符映射（发送前替换，返回后还原）
  _piiMap: {},

  /**
   * 脱敏：将简历中的手机号、邮箱替换为占位符
   * @returns {string} 脱敏后的文本
   */
  _maskPII(text) {
    this._piiMap = {};
    let idx = 0;
    let result = text;

    // 手机号（中国大陆）
    result = result.replace(/1[3-9]\d{9}/g, (match) => {
      const placeholder = `[PHONE_${idx}]`;
      this._piiMap[placeholder] = match;
      idx++;
      return placeholder;
    });

    // 邮箱
    result = result.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (match) => {
      const placeholder = `[EMAIL_${idx}]`;
      this._piiMap[placeholder] = match;
      idx++;
      return placeholder;
    });

    return result;
  },

  /**
   * 还原：将占位符替换回真实信息
   * @returns {string}
   */
  _unmaskPII(text) {
    let result = text;
    for (const [placeholder, real] of Object.entries(this._piiMap)) {
      result = result.replace(new RegExp(placeholder.replace(/[[\]]/g, '\\$&'), 'g'), real);
    }
    return result;
  },

  /**
   * 获取 API 配置
   */
  async _getApiConfig() {
    const apiKey = await ApiKeyService.getApiKey();
    const config = await ApiKeyService.getApiConfig();
    return { apiKey, ...config };
  },

  /**
   * 调用 DeepSeek API
   */
  async _callDeepSeek(messages, temperature = 0.3) {
    const { apiKey, baseUrl, model } = await this._getApiConfig();

    if (!apiKey) {
      throw new Error('请先配置 DeepSeek API Key');
    }

    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages,
        temperature,
        max_tokens: 4096,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`API 调用失败 (${resp.status}): ${err}`);
    }

    const data = await resp.json();
    return data.choices[0].message.content;
  },

  /**
   * 分析岗位与简历的匹配度
   * @param {Object} jobDetail - 岗位详情（含 fullDescription）
   * @param {string} resumeContent - 简历 Markdown 内容
   * @returns {Promise<string>} 分析报告（Markdown 格式）
   */
  async analyzeJobMatch(jobDetail, resumeContent) {
    const masked = this._maskPII(resumeContent);
    const userMessage = `## 岗位信息
职位：${jobDetail.jobTitle || ''}
公司：${jobDetail.companyName || ''}
薪资：${jobDetail.salary || ''}
地点：${jobDetail.location || ''}

### 岗位描述
${jobDetail.fullDescription || '暂无详细描述'}

## 求职者简历
${masked}`;

    const messages = [
      { role: 'system', content: this.ANALYZE_PROMPT },
      { role: 'user', content: userMessage },
    ];

    const analysis = await this._callDeepSeek(messages, 0.3);
    return this._unmaskPII(analysis);
  },

  /**
   * 生成优化版简历
   * @param {Object} jobDetail - 岗位详情
   * @param {string} baseResume - 基础简历内容
   * @returns {Promise<string>} 优化后的简历（Markdown 格式）
   */
  async generateOptimizedResume(jobDetail, baseResume) {
    const masked = this._maskPII(baseResume);
    const userMessage = `## 目标岗位
职位：${jobDetail.jobTitle || ''}
公司：${jobDetail.companyName || ''}

### 岗位描述
${jobDetail.fullDescription || '暂无详细描述'}

## 我的原始简历
${masked}

请根据上述岗位要求，优化我的简历。
注意：简历中的 [PHONE_X] 和 [EMAIL_X] 是联系方式占位符，请原样保留不要修改。`;

    const messages = [
      { role: 'system', content: this.GENERATE_PROMPT },
      { role: 'user', content: userMessage },
    ];

    const optimized = await this._callDeepSeek(messages, 0.3);
    return this._unmaskPII(optimized);
  },

  /**
   * 一站式优化：分析 + 生成优化版
   * @returns {{ analysis: string, optimizedResume: string }}
   */
  async analyzeAndGenerate(jobDetail, baseResume) {
    const [analysis, optimizedResume] = await Promise.all([
      this.analyzeJobMatch(jobDetail, baseResume),
      this.generateOptimizedResume(jobDetail, baseResume),
    ]);

    return { analysis, optimizedResume };
  },

  /**
   * 批量分析岗位（仅分析，不生成简历）
   * @returns {Promise<Array>}
   */
  async batchAnalyze(jobIds, resumeContent, onProgress) {
    const results = [];
    for (let i = 0; i < jobIds.length; i++) {
      const jobId = jobIds[i];
      try {
        const detail = await StorageService.getJobDetail(jobId);
        if (!detail) continue;
        const analysis = await this.analyzeJobMatch(detail, resumeContent);
        results.push({ jobId, jobTitle: detail.jobTitle, analysis, success: true });
        // 标记已分析
        await JobMemoryService.markAsAnalyzed(jobId, await StorageService.getActiveVersionId());
      } catch (e) {
        results.push({ jobId, success: false, error: e.message });
      }
      if (onProgress) onProgress(i + 1, jobIds.length, jobId);
    }
    return results;
  },

  /**
   * 生成简历版本名称（基于岗位信息）
   */
  generateVersionName(jobDetail) {
    const title = jobDetail.jobTitle || '未命名';
    const company = jobDetail.companyName ? `-${jobDetail.companyName}` : '';
    const date = new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
    return `${title}${company} (${date})`;
  },
};
