/**
 * 筛选逻辑服务
 * 根据用户配置的筛选条件过滤职位
 */

const FilterService = {
  /**
   * 标准化文本：去除空格、特殊字符、统一小写，用于模糊匹配
   */
  _normalize(text) {
    return (text || '')
      .replace(/[\s（）()（）【】\[\]·•\-_/\\]+/g, '')
      .toLowerCase();
  },

  /**
   * 检查公司名是否命中黑名单（模糊匹配）
   * @param {string} companyName - 职位卡片上的公司名
   * @param {string[]} blacklist - 用户的黑名单
   * @returns {{hit: boolean, keyword: string}}
   */
  _checkBlacklist(companyName, blacklist) {
    if (!blacklist || !blacklist.length) return { hit: false, keyword: '' };
    if (!companyName) return { hit: false, keyword: '' };

    const normalizedCompany = this._normalize(companyName);

    for (const keyword of blacklist) {
      if (!keyword) continue;
      const normalizedKeyword = this._normalize(keyword);
      // 黑名单关键词包含在公司名中，或公司名包含黑名单关键词
      if (normalizedCompany.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedCompany)) {
        return { hit: true, keyword };
      }
    }
    return { hit: false, keyword: '' };
  },

  /**
   * 判断一个职位是否符合筛选条件
   * @param {Object} job - 职位信息对象
   * @param {Object} filter - 筛选条件
   * @param {string[]} blacklist - 公司黑名单
   * @returns {{pass: boolean, reason: string}} 是否通过以及不通过的原因
   */
  checkJob(job, filter, blacklist = []) {
    // 1. 黑名单检查（模糊匹配，支持子串）
    const blResult = this._checkBlacklist(job.companyName, blacklist);
    if (blResult.hit) {
      return { pass: false, reason: `公司在黑名单中: ${job.companyName}（命中关键词: ${blResult.keyword}）` };
    }

    // 2. 薪资范围检查：岗位薪资区间与用户筛选区间有交集即可通过。
    // 例如筛选 15-30K 时，20-40K 通过，10-14K/31-50K 跳过。
    if (filter.minSalary > 0 || filter.maxSalary > 0) {
      const salary = BossHelper.parseSalary(job.salary);
      if (!salary.parsed) {
        BossLogger.warn(`薪资无法解析，跳过薪资过滤: ${job.salary || '(空)'}`);
      } else {
        const filterMin = filter.minSalary > 0 ? filter.minSalary : 0;
        const filterMax = filter.maxSalary > 0 ? filter.maxSalary : Infinity;
        const hasOverlap = salary.max >= filterMin && salary.min <= filterMax;
        if (!hasOverlap) {
          return {
            pass: false,
            reason: `薪资不在范围内: ${job.salary}（岗位${salary.min}-${salary.max}K，筛选${filter.minSalary || '不限'}-${filter.maxSalary || '不限'}K）`,
          };
        }
      }
    }

    // 3. 公司规模检查
    if (filter.companySize && filter.companySize.length > 0) {
      if (!filter.companySize.some(size => job.companySize && job.companySize.includes(size))) {
        return { pass: false, reason: `公司规模不符: ${job.companySize}` };
      }
    }

    // 4. 融资阶段检查
    if (filter.fundingStage && filter.fundingStage.length > 0) {
      if (!filter.fundingStage.some(stage => job.fundingStage && job.fundingStage.includes(stage))) {
        return { pass: false, reason: `融资阶段不符: ${job.fundingStage}` };
      }
    }

    // 5. 必须包含关键词检查
    if (filter.includeKeywords && filter.includeKeywords.length > 0) {
      const jobText = `${job.jobTitle} ${job.jobDesc || ''}`.toLowerCase();
      const hasKeyword = filter.includeKeywords.some(kw => jobText.includes(kw.toLowerCase()));
      if (!hasKeyword) {
        return { pass: false, reason: `缺少必要关键词` };
      }
    }

    // 6. 排除关键词检查
    if (filter.excludeKeywords && filter.excludeKeywords.length > 0) {
      const jobText = `${job.jobTitle} ${job.jobDesc || ''} ${job.companyName}`.toLowerCase();
      const hitExclude = filter.excludeKeywords.find(kw => jobText.includes(kw.toLowerCase()));
      if (hitExclude) {
        return { pass: false, reason: `命中排除关键词: ${hitExclude}` };
      }
    }

    // 7. HR 在线状态检查
    if (filter.onlyActiveHR && !job.hrActive) {
      return { pass: false, reason: '此 HR 不在线' };
    }

    // 8. 工作经验检查
    if (filter.experience && filter.experience.length > 0) {
      if (!filter.experience.some(exp => job.experience && job.experience.includes(exp))) {
        return { pass: false, reason: `经验要求不符: ${job.experience}` };
      }
    }

    // 9. 学历要求检查
    if (filter.education && filter.education.length > 0) {
      if (!filter.education.some(edu => job.education && job.education.includes(edu))) {
        return { pass: false, reason: `学历要求不符: ${job.education}` };
      }
    }

    return { pass: true, reason: '' };
  },

  /**
   * 批量过滤职位列表
   * @param {Array} jobs - 职位列表
   * @param {Object} filter - 筛选条件
   * @param {string[]} blacklist - 公司黑名单
   * @returns {{passed: Array, filtered: Array}} 通过和被过滤的职位
   */
  filterJobs(jobs, filter, blacklist = []) {
    const passed = [];
    const filtered = [];

    for (const job of jobs) {
      const result = this.checkJob(job, filter, blacklist);
      if (result.pass) {
        passed.push(job);
      } else {
        filtered.push({ ...job, filterReason: result.reason });
      }
    }

    BossLogger.info(`筛选结果: ${passed.length} 个通过, ${filtered.length} 个被过滤`);
    return { passed, filtered };
  },
};
