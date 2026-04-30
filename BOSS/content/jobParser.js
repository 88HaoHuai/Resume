/**
 * 职位信息解析器
 * 适配 BOSS 直聘左右分栏布局中的左侧职位列表
 */

const JobParser = {
  /**
   * 解码 BOSS 自定义字体混淆的 PUA 字符
   * 编码规则：数字 ASCII 码 0x30+X 被映射到 PUA 0xF030+X
   * 直接取低字节即可还原
   */
  _decodePUA(text) {
    if (!text) return text;
    let result = '', hasPUA = false;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code >= 0xE000 && code <= 0xF8FF) {
        hasPUA = true;
        const lo = code & 0xFF;
        if (lo >= 0x30 && lo <= 0x39) result += String.fromCharCode(lo);
        else result += text[i];
      } else {
        result += text[i];
      }
    }
    if (hasPUA && typeof UIInjector !== 'undefined') {
      UIInjector.addLog('🔤 字体解码: "' + text + '" → "' + result + '"');
    }
    return result;
  },

  /**
   * 解析左侧职位列表
  /**
   * 解析左侧职位列表
   * @returns {Array<Object>} 职位信息数组
   */
  parseJobList() {
    const jobs = [];

    // 左侧职位列表中的卡片选择器（按优先级）
    const cardSelectors = [
      '.job-list-box .job-card-wrapper',
      '.job-list-box .job-card-body',
      '.search-job-result .job-card-wrapper',
      '.job-card-wrapper',
      '.job-card-body',
      // 备选：直接找列表项
      '.job-list-box li',
      '.search-job-result li',
      '[class*="job-list"] li',
      '[class*="job-card"]',
    ];

    let jobCards = [];
    for (const selector of cardSelectors) {
      jobCards = document.querySelectorAll(selector);
      if (jobCards.length > 0) {
        BossLogger.info(`选择器 "${selector}" 找到 ${jobCards.length} 个职位`);
        break;
      }
    }

    if (jobCards.length === 0) {
      BossLogger.warn('未找到职位卡片，尝试通用查找...');
      // 最后手段：查找所有包含职位名称和薪资的元素
      jobCards = this._fallbackFindCards();
    }

    if (jobCards.length === 0) {
      BossLogger.error('无法找到任何职位卡片');
      return jobs;
    }

    jobCards.forEach((card, index) => {
      try {
        const job = this._parseJobCard(card, index);
        if (job) jobs.push(job);
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        BossLogger.error(`解析第 ${index + 1} 个职位失败: ${msg}`);
      }
    });

    BossLogger.info(`成功解析 ${jobs.length} 个职位`);
    return jobs;
  },

  /**
   * 解析右侧详情面板中的完整职位描述
   * 用于投递后保存岗位 JD 供 AI 分析
   * @returns {string} 完整的职位描述文本
   */
  parseJobDetail() {
    const selectors = [
      '.job-detail-section',
      '.job-sec-text',
      '.job-detail-content',
      '.detail-content .text',
      '.job-detail-box .detail-content',
      '[class*="job-detail"] .text',
      '.job-main .detail-text',
      '.detail-section',
      '.job-card .detail',
    ];

    const texts = [];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (el.offsetParent !== null) {
          const text = el.textContent.trim();
          if (text && text.length > 20 && !texts.includes(text)) {
            texts.push(text);
          }
        }
      }
      if (texts.length > 0) break;
    }

    // 如果没找到，尝试通过标题找详情区域
    if (!texts.length) {
      const headings = document.querySelectorAll('h2, h3, h4, [class*="title"], [class*="header"]');
      for (const h of headings) {
        const titleText = h.textContent.trim();
        if (/职位描述|岗位职责|任职要求|工作内容|职位要求|岗位要求/.test(titleText)) {
          let next = h.nextElementSibling;
          while (next) {
            const t = next.textContent.trim();
            if (t && t.length > 20) texts.push(t);
            next = next.nextElementSibling;
            if (texts.length >= 3) break;
          }
          break;
        }
      }
    }

    return texts.join('\n\n') || '';
  },

  /**
   * 备选方案：通过内容特征查找职位卡片
   */
  _fallbackFindCards() {
    // 查找包含薪资模式（如 "10-15K"）的列表项
    const allLi = document.querySelectorAll('li, [class*="card"]');
    const cards = [];
    for (const el of allLi) {
      const text = el.textContent || '';
      // 检查是否包含薪资格式和公司名等职位信息特征
      if (/\d+-\d+K/i.test(text) && text.length > 20 && text.length < 500) {
        cards.push(el);
      }
    }
    BossLogger.info(`通过 fallback 找到 ${cards.length} 个可能的职位卡片`);
    return cards;
  },

  _parseJobCard(card, index) {
    // 职位标题 —— 多种选择器容错
    const titleSelectors = [
      '.job-name', '.job-title .job-name', '[class*="job-name"]',
      'span.job-name', 'a .job-name',
    ];
    const jobTitle = this._getText(card, titleSelectors);

    // 薪资 —— 多层级备选 + 正则兜底
    const salarySelectors = [
      '.salary', '.job-info .salary', '[class*="salary"]',
      '.job-salary', '[class*="job-salary"]',
      '.red', 'span.red', '[class*="red"]',
      '.job-limit .red', '.info-desc .red',
      '.job-card .price', '[class*="price"]',
    ];
    let salary = this._getText(card, salarySelectors);

    // 兜底：从卡片文本正则提取薪资（覆盖所有可能的格式）
    if (!salary) {
      // 用 innerText 更准确（排除隐藏元素）
      const rawText = (card.innerText || card.textContent || '').replace(/\s+/g, ' ');

      // 按优先级尝试各种薪资模式
      const patterns = [
        /\d+[-~～]\d+[Kk]\s*(?:[·•·]\s*\d+薪?)?/,     // 15-30K, 15-30K·14薪
        /\d+[Kk]\s*[-~～]\s*\d+[Kk]/,                     // 15K-30K
        /\d+\.?\d*万?\s*[-~～]\s*\d+\.?\d*万/,            // 1.5万-3万
        /\d+[-~～]\d+\s*元\s*[\/／]\s*月/,                 // 15000-30000元/月
        /\d+[-~～]\d+[千元]/,                              // 5-8千, 8-15元/时
        /面议/,                                            // 面议
        /薪资\s*[：:]\s*\S+/,                              // 薪资：15-30K
      ];

      for (const pattern of patterns) {
        const match = rawText.match(pattern);
        if (match) {
          salary = match[0].replace(/\s+/g, '');
          break;
        }
      }

      // 兜底1：向外层搜索（卡片可能不包含薪资元素）
      if (!salary) {
        let parent = card.parentElement;
        for (let i = 0; i < 3 && parent && !salary; i++) {
          const parentText = (parent.innerText || parent.textContent || '').replace(/\s+/g, ' ');
          for (const pattern of patterns) {
            const match = parentText.match(pattern);
            if (match) {
              salary = match[0].replace(/\s+/g, '');
              break;
            }
          }
          parent = parent.parentElement;
        }
      }

    }

    // PUA 字体混淆解码
    salary = this._decodePUA(salary);

    // 公司名称 —— 多层级备选选择器
    const companySelectors = [
      // BOSS 常用类名
      '.company-name a', '.company-name', '[class*="company-name"]',
      '.company-info .name', '.info-company .name',
      '.company-text', '[class*="company-text"]',
      '.boss-company', '[class*="boss-company"]',
      // 通用公司名链接
      'a[href*="gongsi"]', 'a[href*="company"]',
      // 卡片内 h3 下的第一个 a 链接（常见布局）
      'h3 a', 'h3',
      // li 结构中公司名通常在第二个 span
      '.card-content .name',
    ];
    let companyName = this._getText(card, companySelectors);

    // 兜底：从卡片文本中通过正则提取公司名
    // BOSS 卡片文本通常包含：职位名 + 公司名 + 薪资 + 标签
    if (!companyName) {
      const allText = (card.textContent || '').replace(/\s+/g, ' ').trim();
      // 排除薪资模式来定位公司名位置
      const salaryMatch = allText.match(/(\d+-\d+K[\s·]*\d*薪?)/);
      if (salaryMatch) {
        const beforeSalary = allText.substring(0, allText.indexOf(salaryMatch[0]));
        // 公司名通常在职位名之后、薪资之前，是一个较短的中文片段
        const parts = beforeSalary.split(/\s+/);
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i].trim();
          if (p.length >= 2 && p.length <= 30 && /^[一-龥a-zA-Z0-9()（）]+$/.test(p) && !/工程师|经理|专员|实习|应届|岗位/.test(p)) {
            companyName = p;
            break;
          }
        }
      }
    }

    // 工作地点
    const locationSelectors = [
      '.job-area', '[class*="job-area"]',
      '.info-desc span:first-child', '.info-desc',
      '.job-location', '[class*="location"]',
      '.job-card .area', '[class*="area"]',
    ];
    let location = this._getText(card, locationSelectors);

    // 经验和学历
    let experience = '';
    let education = '';
    const tagSelectors = [
      '.tag-list li', '.tag-list span',
      '.job-info .tag-list span',
      '[class*="tag-list"] li', '[class*="tag-list"] span',
      '.info-desc span', '.job-card .desc span',
      '.job-limit span', '[class*="limit"] span',
    ];
    const tagEls = card.querySelectorAll(tagSelectors.join(','));
    tagEls.forEach(tag => {
      const text = tag.textContent.trim();
      if (/经验|应届|在校|不限/.test(text) && !experience) experience = text;
      if (/本科|硕士|博士|大专|学历|不限/.test(text) && !education) education = text;
    });

    // 兜底：从卡片文本正则提取
    if (!experience) {
      const allText = (card.textContent || '').replace(/\s+/g, ' ');
      const expMatch = allText.match(/(\d+年经验|应届生?|经验不限|在校\/应届|1年以内|1-3年|3-5年|5-10年|10年以上)/);
      if (expMatch) experience = expMatch[1];
    }
    if (!education) {
      const allText = (card.textContent || '').replace(/\s+/g, ' ');
      const eduMatch = allText.match(/(大专|本科|硕士|博士|学历不限)/);
      if (eduMatch) education = eduMatch[1];
    }

    // 公司规模
    const companySizeSelectors = ['.company-tag-list li:last-child', '[class*="company-tag"] li:last-child'];
    const companySize = this._getText(card, companySizeSelectors);

    // 融资阶段
    const fundingSelectors = ['.company-tag-list li:first-child', '[class*="company-tag"] li:first-child'];
    const fundingStage = this._getText(card, fundingSelectors);

    // HR 信息
    const hrNameSelectors = ['.info-public em', '[class*="boss-name"]', '.info-public .name'];
    const hrName = this._getText(card, hrNameSelectors);

    // HR 在线状态
    const hrActiveEl = card.querySelector('.boss-online-tag, [class*="online"], .online-tag');
    const hrActive = !!hrActiveEl;

    // 职位链接
    const linkEl = card.querySelector('a[href*="job_detail"], a[href*="jobs"], a[ka*="job"]');
    const jobUrl = linkEl ? linkEl.href : '';

    // 提取 jobId
    let jobId = `job_${index}_${Date.now()}`;
    if (jobUrl) {
      const idMatch = jobUrl.match(/job_detail\/([^.?/]+)/) || jobUrl.match(/encryptJobId=([^&]+)/);
      if (idMatch) jobId = idMatch[1];
    }
    // 尝试从 data 属性获取
    const dataJobId = card.getAttribute('data-jobid') || card.getAttribute('data-id');
    if (dataJobId) jobId = dataJobId;

    if (!jobTitle) return null;

    return {
      jobId,
      jobTitle,
      salary,
      companyName,
      companySize,
      fundingStage,
      location,
      experience,
      education,
      hrName,
      hrActive,
      jobUrl,
      cardElement: card,
    };
  },

  /**
   * 辅助方法：用多个选择器尝试获取文本内容
   */
  _getText(container, selectors) {
    for (const sel of selectors) {
      const el = container.querySelector(sel);
      if (el) {
        const text = el.textContent.trim();
        if (text) return text;
      }
    }
    return '';
  },
};
