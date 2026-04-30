/**
 * 自动投递引擎
 * 适配 BOSS 直聘左右分栏布局
 * 实际流程：点击卡片 → 点击"立即沟通" → BOSS 自动发送招呼语 → 弹出确认框 → 关闭弹窗
 */
const AutoApply = {
  _isRunning: false,
  _isPaused: false,
  _applyCount: 0,
  _maxApplyCount: 50,
  _dailyCount: 0,
  _stats: { applied: 0, skipped: 0, failed: 0 },

  async start(maxApplyCount) {
    if (this._isRunning) return;
    BossLogger.info(`🚀 启动自动投递引擎（本次上限: ${maxApplyCount}）`);
    // 确保浮动日志面板已注入（BOSS 禁用了 F12）
    UIInjector.inject();
    this._isRunning = true;
    this._isPaused = false;
    this._maxApplyCount = maxApplyCount || 50;
    this._applyCount = 0;
    this._stats = { applied: 0, skipped: 0, failed: 0 };
    this._dailyCount = await StorageService.getDailyCount();
    // 打印黑名单加载状态
    const currentBlacklist = await StorageService.getBlacklist();
    const blSample = currentBlacklist.length > 0 ? currentBlacklist.slice(0, 5).join(', ') + (currentBlacklist.length > 5 ? '...' : '') : '';
    BossLogger.info(`今日已投递: ${this._dailyCount}/${APPLY_CONFIG.DAILY_LIMIT} | 黑名单: ${currentBlacklist.length} 家公司${blSample ? ' (' + blSample + ')' : ''}`);
    UIInjector.showBlacklistStatus(currentBlacklist.length, blSample);
    await StorageService.setRunningState(PLUGIN_STATE.RUNNING);
    this._notify(PLUGIN_STATE.RUNNING);
    try { await this._runLoop(); } catch (e) {
      BossLogger.error('异常:', e);
      await this.stop('异常: ' + e.message);
    }
  },

  async stop(reason = '手动停止') {
    BossLogger.info(`⏹ 停止: ${reason}`);
    this._isRunning = false;
    this._isPaused = false;
    await StorageService.setRunningState(PLUGIN_STATE.IDLE);
    this._notify(PLUGIN_STATE.IDLE);
    BossLogger.info(`统计 → 成功:${this._stats.applied} 跳过:${this._stats.skipped} 失败:${this._stats.failed}`);
  },

  async togglePause() {
    this._isPaused = !this._isPaused;
    const s = this._isPaused ? PLUGIN_STATE.PAUSED : PLUGIN_STATE.RUNNING;
    await StorageService.setRunningState(s);
    this._notify(s);
    BossLogger.info(this._isPaused ? '⏸ 已暂停' : '▶ 已恢复');
  },

  async _runLoop() {
    let consecutiveEmptyPages = 0;

    while (this._isRunning) {
      if (this._isPaused) { await BossHelper.sleep(1000); continue; }

      // 本次投递上限
      if (this._applyCount >= this._maxApplyCount) {
        await this.stop(`本轮达上限(${this._maxApplyCount})`); return;
      }
      // 今日上限
      if (this._dailyCount >= APPLY_CONFIG.DAILY_LIMIT) {
        await this.stop(`今日达上限(${APPLY_CONFIG.DAILY_LIMIT})`); return;
      }
      if (!BossHelper.isJobListPage()) {
        BossLogger.warn('不在列表页'); await BossHelper.sleep(3000); continue;
      }

      // 解析职位列表
      const jobs = JobParser.parseJobList();
      if (!jobs.length) {
        consecutiveEmptyPages++;
        BossLogger.warn(`未找到职位卡片 (连续${consecutiveEmptyPages}次)，尝试翻页`);
        if (consecutiveEmptyPages >= 3) {
          await this.stop('连续多页无职位卡片'); return;
        }
        if (!(await this._goNextPage())) { await this.stop('没有更多页面'); return; }
        await BossHelper.randomSleep(2000, 4000);
        continue;
      }
      consecutiveEmptyPages = 0;

      BossLogger.info(`当前页找到 ${jobs.length} 个职位`);

      // 诊断：输出第1个卡片的解析结果 + 当前筛选范围
      if (jobs.length > 0) {
        const firstJob = jobs[0];
        const filter = await StorageService.getFilter();
        const parsed = BossHelper.parseSalary(firstJob.salary);
        UIInjector.addLog(`🔬 [样本] ${firstJob.jobTitle} @ ${firstJob.companyName} | 薪资="${firstJob.salary || '(空)'}" → 解析=${parsed.min}-${parsed.max}K | 筛选范围=${filter.minSalary || '不限'}-${filter.maxSalary || '不限'}K`);
        if (!firstJob.salary) {
          const outer = firstJob.cardElement?.parentElement;
          const htmlSnippet = (outer?.innerHTML || firstJob.cardElement?.innerHTML || '').substring(0, 300);
          UIInjector.addLog(`🔬 卡片HTML片段: ${htmlSnippet.replace(/</g, '&lt;')}`);
        }
      }

      // 逐个按页面顺序遍历所有职位，当场判断是否投递
      let jobIdx = 0;
      for (const job of jobs) {
        jobIdx++;
        if (!this._isRunning || this._isPaused) break;
        if (this._applyCount >= this._maxApplyCount) break;
        if (this._dailyCount >= APPLY_CONFIG.DAILY_LIMIT) break;

        // 每个职位检查前重新读取配置（确保用户实时修改生效）
        const filter = await StorageService.getFilter();
        const blacklist = await StorageService.getBlacklist();

        // 详细诊断日志（前5个职位逐项输出）
        if (jobIdx <= 5 || blacklist.length > 0) {
          UIInjector.addLog(`📋 [${jobIdx}] ${job.jobTitle || '?'} @ ${job.companyName || '(公司名为空!)'}`);
        }

        // 检查黑名单
        const blResult = FilterService._checkBlacklist(job.companyName, blacklist);
        if (blResult.hit) {
          UIInjector.addLog(`🛑 黑名单命中: "${job.companyName}" ↔ "${blResult.keyword}"`);
        } else if (blacklist.length > 0 && job.companyName) {
          // 没命中时也输出诊断信息帮助定位
          if (jobIdx <= 3) {
            const raw = job.companyName;
            const norm = FilterService._normalize(raw);
            UIInjector.addLog(`  公司名: "${raw}" → 归一化: "${norm}" | 黑名单关键词: [${blacklist.map(k => `"${FilterService._normalize(k)}"`).slice(0,3).join(', ')}]`);
          }
        }

        // 检查筛选条件
        const checkResult = FilterService.checkJob(job, filter, blacklist);
        if (!checkResult.pass) {
          BossLogger.info(`⏭ 跳过: ${job.jobTitle} @ ${job.companyName} — ${checkResult.reason}`);
          this._stats.skipped++;
          UIInjector.addLog(`⏭ 跳过: ${job.companyName || '?'} — ${checkResult.reason}`);
          // 如果是黑名单命中，累加计数
          if (checkResult.reason.includes('黑名单')) {
            const hitResult = await StorageService.get('boss_blacklist_hit_count');
            const count = (hitResult.boss_blacklist_hit_count || 0) + 1;
            await StorageService.set({ boss_blacklist_hit_count: count });
          }
          this._notifyProgress();
          continue;
        }

        // 检查是否已投递
        if (await StorageService.isApplied(job.jobId)) {
          BossLogger.debug(`跳过(已投递): ${job.jobTitle} @ ${job.companyName}`);
          this._stats.skipped++;
          this._notifyProgress();
          continue;
        }

        const ok = await this._applyJob(job);
        if (ok) {
          this._stats.applied++;
          this._applyCount++;
          this._dailyCount = await StorageService.incrementDailyCount();
          this._notifyProgress();
        } else {
          this._stats.failed++;
          this._notifyProgress();
        }

        if (this._isRunning) {
          await BossHelper.randomSleep(APPLY_CONFIG.MIN_INTERVAL, APPLY_CONFIG.MAX_INTERVAL);
        }
      }

      // 翻页
      if (this._isRunning && !this._isPaused && this._applyCount < this._maxApplyCount) {
        if (!(await this._goNextPage())) { await this.stop('没有更多页面'); return; }
        await BossHelper.randomSleep(2000, 4000);
      }
    }
  },

  /**
   * ========== 单个职位投递流程 ==========
   * 1. 点击左侧职位卡片
   * 2. 等待右侧详情加载
   * 3. 点击右侧"立即沟通"按钮
   * 4. BOSS 会自动发送预设招呼语，弹出确认框
   * 5. 自动点击"留在此页"或"继续沟通"关闭弹窗
   * 6. 如需发图片简历，点"继续沟通"进聊天页发送
   */
  async _applyJob(job) {
    BossLogger.info(`📝 投递: ${job.jobTitle} @ ${job.companyName}`);
    try {
      // 1. 点击左侧职位卡片
      await this._clickJobCard(job);
      await BossHelper.randomSleep(APPLY_CONFIG.MIN_PAGE_STAY, APPLY_CONFIG.MAX_PAGE_STAY);

      // 2. 点击"立即沟通"
      const chatBtn = await this._findAndClickChatBtn();
      if (!chatBtn) {
        BossLogger.warn('未找到"立即沟通"按钮，跳过');
        return false;
      }

      // 3. 等待 BOSS 的响应（弹窗或页面跳转）
      await BossHelper.sleep(2000);

      // 4. 处理"已向BOSS发送消息"确认弹窗
      const dialogHandled = await this._handleSentDialog(job);

      if (dialogHandled) {
        // 提取完整职位描述
        const fullDescription = JobParser.parseJobDetail();

        // 保存岗位详情到记忆系统
        await JobMemoryService.saveJobDetail(job.jobId, {
          jobTitle: job.jobTitle,
          companyName: job.companyName,
          salary: job.salary,
          location: job.location,
          fullDescription,
          jobUrl: job.jobUrl,
        });

        // 保存投递记录
        const activeVersionId = await ResumeService.getActiveVersionId();
        await StorageService.saveApplyRecord({
          jobId: job.jobId, jobTitle: job.jobTitle, companyName: job.companyName,
          salary: job.salary, location: job.location, hrName: job.hrName,
          jobUrl: job.jobUrl, greeting: '(预设招呼语)', resumeSent: false,
          status: APPLY_STATUS.APPLIED,
          resumeVersionId: activeVersionId,
        });

        // 递增该简历版本的投递计数
        await ResumeService.incrementApplyCount(activeVersionId);
        BossLogger.info(`✅ 成功: ${job.jobTitle} @ ${job.companyName}`);
        return true;
      }

      // 可能没有弹窗（已经沟通过等情况），检查是否跳到了聊天页
      BossLogger.warn('未检测到确认弹窗');
      // 尝试处理其他可能的弹窗
      await this._dismissAnyDialog();
      return false;
    } catch (e) {
      BossLogger.error('投递失败:', e);
      // 确保关闭任何遗留弹窗
      await this._dismissAnyDialog();
      return false;
    }
  },

  /**
   * 点击左侧职位卡片
   */
  async _clickJobCard(job) {
    if (!job.cardElement) return;

    // 滚动到卡片位置
    job.cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await BossHelper.sleep(500);

    // 优先点击卡片中的链接
    const clickTarget =
      job.cardElement.querySelector('.job-card-left') ||
      job.cardElement.querySelector('a') ||
      job.cardElement.querySelector('.job-name') ||
      job.cardElement.querySelector('[class*="job-name"]') ||
      job.cardElement;

    await MouseSimulator.click(clickTarget);
    BossLogger.debug(`已点击卡片: ${job.jobTitle}`);
  },

  /**
   * 在右侧详情面板中找到"立即沟通"按钮并点击
   */
  async _findAndClickChatBtn() {
    BossLogger.debug('查找"立即沟通"按钮...');

    // 等一下让右侧详情加载
    await BossHelper.sleep(1000);

    // 策略1：CSS 选择器
    const selectors = [
      '.btn-startchat',
      '.start-chat-btn',
      'a.btn-startchat',
      '[class*="start-chat"]',
      '[class*="startchat"]',
      '.detail-op .btn-startchat',
      '.job-detail-box .btn-startchat',
      '.info-primary .btn-startchat',
      '[ka="job_detail_startchat"]',
      '[ka*="startchat"]',
    ];

    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null) {
        BossLogger.info(`找到按钮(选择器): ${sel}`);
        await MouseSimulator.click(btn);
        return btn;
      }
    }

    // 策略2：通过文本精确匹配
    const allClickable = document.querySelectorAll('a, button, div[role="button"], [class*="btn"]');
    for (const el of allClickable) {
      const text = el.textContent.trim();
      if ((text === '立即沟通' || text === '继续沟通') && el.offsetParent !== null) {
        BossLogger.info(`找到按钮(文本): "${text}"`);
        await MouseSimulator.click(el);
        return el;
      }
    }

    // 策略3：模糊匹配"沟通"
    for (const el of allClickable) {
      if (el.textContent.includes('沟通') && el.offsetParent !== null && !el.textContent.includes('随时沟通')) {
        BossLogger.info(`找到按钮(模糊): "${el.textContent.trim().substring(0, 20)}"`);
        await MouseSimulator.click(el);
        return el;
      }
    }

    BossLogger.warn('所有策略均未找到"立即沟通"按钮');
    return null;
  },

  /**
   * ★ 核心：处理"已向BOSS发送消息"确认弹窗
   * 弹窗内容：
   *   - "留在此页" 按钮 → 关闭弹窗，留在搜索页
   *   - "继续沟通" 按钮 → 跳到聊天页
   */
  async _handleSentDialog(job) {
    BossLogger.debug('检查是否有发送成功确认弹窗...');

    // 等待弹窗出现（最多等 5 秒）
    for (let i = 0; i < 10; i++) {
      // 检查是否有确认弹窗（通过文本内容识别）
      const dialogs = document.querySelectorAll(
        '.dialog-wrap, .dialog-container, [class*="dialog"], .boss-popup, ' +
        '[class*="popup"], .greet-boss-dialog, [class*="greet-boss"], ' +
        '[class*="confirm"], .sider-dialog, [role="dialog"]'
      );

      for (const dialog of dialogs) {
        if (dialog.offsetParent === null) continue; // 不可见的跳过
        const text = dialog.textContent || '';

        // 匹配"已向BOSS发送消息"或类似文本
        if (text.includes('已向') || text.includes('发送消息') || text.includes('发送成功') || text.includes('打招呼成功')) {
          BossLogger.info('✓ 检测到发送成功弹窗');

          // 始终点击"留在此页"，不跳转聊天页
          const stayBtn = this._findBtnByText(dialog, ['留在此页', '留在本页', '关闭', '确定', '知道了']);
          if (stayBtn) {
            BossLogger.info('点击"留在此页"关闭弹窗');
            await MouseSimulator.click(stayBtn);
            await BossHelper.sleep(500);
            return true;
          }

          // 如果按钮文本匹配不到，尝试关闭按钮（×）
          const closeBtn = dialog.querySelector('.close, [class*="close"], .icon-close, [aria-label="close"]');
          if (closeBtn) {
            BossLogger.info('点击关闭按钮(×)');
            await MouseSimulator.click(closeBtn);
            await BossHelper.sleep(500);
            return true;
          }

          // 兜底：点击弹窗内的第一个按钮
          const anyBtn = dialog.querySelector('a, button');
          if (anyBtn) {
            BossLogger.info(`兜底点击: "${anyBtn.textContent.trim()}"`);
            await MouseSimulator.click(anyBtn);
            await BossHelper.sleep(500);
            return true;
          }
        }
      }

      await BossHelper.sleep(500);
    }

    // 最后尝试：直接在全局找"留在此页"按钮
    const globalStayBtn = this._findGlobalBtnByText(['留在此页', '留在本页']);
    if (globalStayBtn) {
      BossLogger.info('全局搜索找到"留在此页"按钮');
      await MouseSimulator.click(globalStayBtn);
      await BossHelper.sleep(500);
      return true;
    }

    return false;
  },

  /**
   * 在指定容器内通过文本查找按钮
   */
  _findBtnByText(container, textList) {
    const btns = container.querySelectorAll('a, button, div[role="button"], [class*="btn"]');
    for (const btn of btns) {
      const t = btn.textContent.trim();
      for (const text of textList) {
        if (t === text || t.includes(text)) {
          return btn;
        }
      }
    }
    return null;
  },

  /**
   * 在全局通过文本查找按钮
   */
  _findGlobalBtnByText(textList) {
    const allBtns = document.querySelectorAll('a, button, div[role="button"], [class*="btn"]');
    for (const btn of allBtns) {
      if (btn.offsetParent === null) continue;
      const t = btn.textContent.trim();
      for (const text of textList) {
        if (t === text) return btn;
      }
    }
    return null;
  },

  /**
   * 清理任何残留的弹窗
   */
  async _dismissAnyDialog() {
    // 查找所有可能的弹窗关闭方式
    const dismissSelectors = [
      // "留在此页"按钮
      '.dialog-wrap a:first-child',
      '.dialog-container a:first-child',
      // 关闭按钮
      '.dialog-wrap .close',
      '.dialog-container .close',
      '[class*="dialog"] .close',
      '[class*="dialog"] [class*="close"]',
      // 遮罩层
      '.dialog-mask',
    ];

    for (const sel of dismissSelectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) {
        el.click();
        await BossHelper.sleep(300);
      }
    }

    // 通过文本查找关闭
    const btns = document.querySelectorAll('a, button');
    for (const btn of btns) {
      const t = btn.textContent.trim();
      if ((t === '留在此页' || t === '关闭' || t === '知道了') && btn.offsetParent !== null) {
        btn.click();
        await BossHelper.sleep(300);
        break;
      }
    }
  },

  /**
   * 翻到下一页（增强版）
   */
  async _goNextPage() {
    // 先滚动到底部确保分页组件可见
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    await BossHelper.sleep(800);

    // 策略1：CSS 选择器
    const sels = [
      '.options-pages a.next',
      '.options-pages .next',
      '.pagination .next',
      '[class*="options-pages"] .next',
      '[class*="pagination"] .next',
      '[ka="page_next"]',
      '.page-next',
      '[class*="page"] .next',
      '.page-nav .next',
      '.ant-pagination-next',
      'li.next a',
      'a:has(.ui-icon-arrow-right)',
    ];
    for (const s of sels) {
      try {
        const btn = document.querySelector(s);
        if (btn && !btn.classList.contains('disabled') && btn.offsetParent !== null) {
          BossLogger.info(`翻到下一页 (${s})`);
          await MouseSimulator.click(btn);
          await BossHelper.sleep(3000);
          return true;
        }
      } catch (_) {}
    }

    // 策略2：文本匹配
    const links = document.querySelectorAll('a, button, span, div[class*="page"], i');
    for (const link of links) {
      if (!link.offsetParent) continue;
      const text = link.textContent.trim();
      const cls = (link.className || '').toString();
      if ((text === '下一页' || text === '下一頁' ||
           cls.includes('next') || cls.includes('icon-arrow-right')) &&
          !link.classList.contains('disabled') && !link.classList.contains('disable')) {
        BossLogger.info('翻到下一页 (文本/class)');
        await MouseSimulator.click(link);
        await BossHelper.sleep(3000);
        return true;
      }
    }

    // 策略3：通过 ka 属性
    for (const el of document.querySelectorAll('[ka*="page"], [ka*="next"]')) {
      if (el.offsetParent && !el.classList.contains('disabled')) {
        BossLogger.info(`翻到下一页 (ka: ${el.getAttribute('ka')})`);
        await MouseSimulator.click(el);
        await BossHelper.sleep(3000);
        return true;
      }
    }

    BossLogger.warn('未找到下一页按钮');
    return false;
  },

  async _coolDown() {
    const t = BossHelper.randomDelay(APPLY_CONFIG.MIN_COOLDOWN, APPLY_CONFIG.MAX_COOLDOWN);
    BossLogger.info(`⏳ 冷却: ${(t/60000).toFixed(1)}分钟`);
    await StorageService.setRunningState(PLUGIN_STATE.COOLING);
    this._notify(PLUGIN_STATE.COOLING);
    await BossHelper.sleep(t);
    if (this._isRunning) {
      await StorageService.setRunningState(PLUGIN_STATE.RUNNING);
      this._notify(PLUGIN_STATE.RUNNING);
    }
  },

  _notify(state) {
    chrome.runtime.sendMessage({ type: MSG_TYPE.STATUS_UPDATE, data: { state, dailyCount: this._dailyCount, applyCount: this._applyCount, stats: this._stats } });
    UIInjector.updateStats(this._stats);
  },
  _notifyProgress() {
    chrome.runtime.sendMessage({ type: MSG_TYPE.PROGRESS_UPDATE, data: { dailyCount: this._dailyCount, dailyLimit: APPLY_CONFIG.DAILY_LIMIT, applyCount: this._applyCount, maxApplyCount: this._maxApplyCount, stats: this._stats } });
    UIInjector.updateStats(this._stats);
  },
};
