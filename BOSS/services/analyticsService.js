/**
 * 投递数据分析服务
 * 追踪回复率、版本效果对比、优化建议
 */
const AnalyticsService = {
  /**
   * 记录雇主回复状态
   * @param {string} jobId - 岗位 ID（既可以是原始 jobId 也可以是 apply record id）
   * @param {string} status - 'pending'|'viewed'|'replied'|'rejected'|'ignored'
   * @param {string} note - 备注
   * @param {string} resumeVersionId - 使用的简历版本 ID
   */
  async recordResponse(jobId, status, note = '', resumeVersionId = null) {
    const versionId = resumeVersionId || (await StorageService.getActiveVersionId());
    await StorageService.recordResponse(jobId, status, note);
    // 同时记录使用的简历版本
    const tracking = await StorageService.getResponseTracking();
    if (tracking[jobId]) {
      tracking[jobId].resumeVersionId = versionId;
      await StorageService.set({ [STORAGE_KEYS.RESPONSE_TRACKING]: tracking });
    }
    // 更新版本回复计数
    if (status === 'replied' || status === 'viewed') {
      await ResumeService.incrementResponseCount(versionId);
    }
  },

  /**
   * 获取整体统计数据
   */
  async getOverallStats() {
    const tracking = await StorageService.getResponseTracking();
    const records = await StorageService.getApplyRecords();
    const totalApplied = records.length;
    let replied = 0, viewed = 0, rejected = 0, pending = 0, ignored = 0;

    for (const [jobId, t] of Object.entries(tracking)) {
      switch (t.status) {
        case 'replied': replied++; break;
        case 'viewed': viewed++; break;
        case 'rejected': rejected++; break;
        case 'ignored': ignored++; break;
        default: pending++;
      }
    }

    // 已投递但未在 tracking 中的记录视为 pending
    pending += totalApplied - Object.keys(tracking).length;

    const responseRate = totalApplied > 0
      ? ((replied + viewed) / totalApplied * 100).toFixed(1)
      : '0.0';

    return {
      totalApplied,
      replied,
      viewed,
      rejected,
      ignored,
      pending,
      responseRate: parseFloat(responseRate),
      // 有效回复率（只看有回应的）
      effectiveResponseRate: totalApplied > 0
        ? (replied / totalApplied * 100).toFixed(1)
        : '0.0',
    };
  },

  /**
   * 按简历版本统计回复率
   * @returns {Promise<Array>}
   */
  async getVersionStats() {
    const versionApplyCounts = await this.getVersionApplyCounts();
    const tracking = await StorageService.getResponseTracking();
    const versions = await ResumeService.getResumeVersions();
    const versionResponseCounts = {};
    const versionReplyCounts = {};

    for (const [jobId, t] of Object.entries(tracking)) {
      const vId = t.resumeVersionId || 'base';
      if (t.status === 'replied') {
        versionReplyCounts[vId] = (versionReplyCounts[vId] || 0) + 1;
      }
      if (t.status === 'replied' || t.status === 'viewed') {
        versionResponseCounts[vId] = (versionResponseCounts[vId] || 0) + 1;
      }
    }

    return versions.map(v => {
      const applied = versionApplyCounts[v.id] || 0;
      const responded = versionResponseCounts[v.id] || 0;
      const replied = versionReplyCounts[v.id] || 0;
      return {
        id: v.id,
        name: v.name,
        isBase: v.isBase,
        applied,
        responded,
        replied,
        responseRate: applied > 0 ? ((responded / applied) * 100).toFixed(1) : '0.0',
        replyRate: applied > 0 ? ((replied / applied) * 100).toFixed(1) : '0.0',
        createdAt: v.createdAt,
      };
    }).sort((a, b) => parseFloat(b.responseRate) - parseFloat(a.responseRate));
  },

  /**
   * 获取各版本投递次数（从 apply records 中统计）
   */
  async getVersionApplyCounts() {
    const records = await StorageService.getApplyRecords();
    const counts = {};
    for (const r of records) {
      const vId = r.resumeVersionId || 'base';
      counts[vId] = (counts[vId] || 0) + 1;
    }
    return counts;
  },

  /**
   * 获取回复率较高的岗位关键词
   */
  async getTopKeywords(minReplies = 1) {
    const tracking = await StorageService.getResponseTracking();
    const details = await StorageService.getJobDetails();
    const keywordReplies = {}; // keyword -> { replied, total }
    const keywordResponseRate = {};

    for (const [jobId, t] of Object.entries(tracking)) {
      if (t.status !== 'replied' && t.status !== 'viewed') continue;
      const detail = details[jobId];
      if (!detail?.fullDescription) continue;

      const keywords = JobMemoryService.extractKeywordsLocally(detail);
      for (const kw of keywords) {
        if (!keywordReplies[kw]) keywordReplies[kw] = { replied: 0, total: 0 };
        keywordReplies[kw].total++;
        if (t.status === 'replied') keywordReplies[kw].replied++;
      }
    }

    for (const [kw, counts] of Object.entries(keywordReplies)) {
      if (counts.replied >= minReplies) {
        keywordResponseRate[kw] = {
          keyword: kw,
          replied: counts.replied,
          total: counts.total,
          replyRate: (counts.replied / counts.total * 100).toFixed(1),
        };
      }
    }

    return Object.values(keywordResponseRate)
      .sort((a, b) => parseFloat(b.replyRate) - parseFloat(a.replyRate));
  },

  /**
   * 优化前后对比
   * 基础版 vs 优化版的回复率差异
   */
  async getOptimizationEffectiveness() {
    const versionStats = await this.getVersionStats();
    const base = versionStats.find(v => v.isBase);
    const optimized = versionStats.filter(v => !v.isBase);

    if (!base || optimized.length === 0) {
      return { baseStats: base, optimizedStats: [], improvement: 0, summary: '暂无足够数据' };
    }

    const avgOptimizedRate = optimized.reduce((sum, v) => sum + parseFloat(v.responseRate), 0) / optimized.length;
    const improvement = avgOptimizedRate - parseFloat(base.responseRate);

    return {
      baseStats: base,
      optimizedStats: optimized,
      improvement: improvement.toFixed(1),
      summary: improvement > 0
        ? `优化版回复率提升 ${improvement.toFixed(1)}%`
        : improvement < 0
          ? `优化版回复率下降 ${Math.abs(improvement).toFixed(1)}%，建议重新审视优化方向`
          : '回复率无明显变化',
      bestVersion: optimized.reduce((best, v) =>
        parseFloat(v.responseRate) > parseFloat(best.responseRate) ? v : best
      , optimized[0]),
    };
  },

  /**
   * 生成优化建议
   */
  async suggestNextOptimization() {
    const topKw = await this.getTopKeywords(2);
    const effectiveness = await this.getOptimizationEffectiveness();
    const unanalyzed = await JobMemoryService.getUnanalyzedJobs();

    const suggestions = [];

    if (topKw.length > 0) {
      suggestions.push(`回复率最高的技能关键词: ${topKw.slice(0, 5).map(k => `${k.keyword}(${k.replyRate}%)`).join('、')}`);
      suggestions.push('建议：在简历中重点突出这些技能，并在相关项目经验中展开描述');
    }

    if (parseFloat(effectiveness.improvement) > 0 && effectiveness.bestVersion) {
      suggestions.push(`最佳版本: ${effectiveness.bestVersion.name} (回复率 ${effectiveness.bestVersion.responseRate}%)`);
      suggestions.push('建议：将该版本的优化策略应用到其他岗位类型');
    }

    if (unanalyzed.length > 0) {
      suggestions.push(`还有 ${unanalyzed.length} 个岗位尚未分析，建议尽快完成匹配分析`);
    }

    if (suggestions.length === 0) {
      suggestions.push('数据积累中，建议多投递一些岗位后查看分析结果');
    }

    return suggestions;
  },

  /**
   * 获取时间线数据（最近 30 天）
   */
  async getTimeline() {
    const records = await StorageService.getApplyRecords();
    const tracking = await StorageService.getResponseTracking();
    const days = {};
    const now = Date.now();

    // 初始化最近 30 天
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      days[key] = { applied: 0, replied: 0, date: key };
    }

    for (const r of records) {
      if (!r.timestamp) continue;
      const d = new Date(r.timestamp);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      if (days[key]) days[key].applied++;
    }

    for (const [jobId, t] of Object.entries(tracking)) {
      if (!t.updatedAt || t.status !== 'replied') continue;
      const d = new Date(t.updatedAt);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      if (days[key]) days[key].replied++;
    }

    return Object.values(days);
  },
};
