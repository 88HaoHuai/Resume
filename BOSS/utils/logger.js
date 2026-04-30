/**
 * 日志工具
 * 统一管理插件的日志输出，方便调试和问题排查
 */

const BossLogger = {
  // 日志前缀
  PREFIX: '🤖 [BOSS助手]',

  // 日志级别
  LEVEL: {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  },

  // 当前日志级别（DEBUG 模式下输出所有日志）
  currentLevel: 0,

  /**
   * 格式化日志消息
   * @param {string} level - 日志级别标签
   * @param {string} message - 日志内容
   * @returns {string}
   */
  _format(level, message) {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    return `${this.PREFIX} [${time}] [${level}] ${message}`;
  },

  /**
   * DEBUG 级别日志
   * @param {string} message - 日志内容
   * @param  {...any} args - 附加参数
   */
  debug(message, ...args) {
    if (this.currentLevel <= this.LEVEL.DEBUG) {
      console.log(this._format('DEBUG', message), ...args);
      this._toPanel(message);
    }
  },

  info(message, ...args) {
    if (this.currentLevel <= this.LEVEL.INFO) {
      console.info(this._format('INFO', message), ...args);
      this._toPanel(message);
    }
  },

  warn(message, ...args) {
    if (this.currentLevel <= this.LEVEL.WARN) {
      console.warn(this._format('WARN', message), ...args);
      this._toPanel('⚠ ' + message);
    }
  },

  error(message, ...args) {
    if (this.currentLevel <= this.LEVEL.ERROR) {
      console.error(this._format('ERROR', message), ...args);
      this._toPanel('❌ ' + message);
    }
  },

  /** 同步输出到浮动面板 */
  _toPanel(message) {
    try {
      if (typeof UIInjector !== 'undefined' && UIInjector.addLog) {
        UIInjector.addLog(message);
      }
    } catch (e) { /* 面板可能还没注入 */ }
  },

  /**
   * 分组日志（可折叠）
   * @param {string} groupName - 组名
   * @param {Function} fn - 在组内执行的函数
   */
  group(groupName, fn) {
    console.groupCollapsed(this._format('GROUP', groupName));
    fn();
    console.groupEnd();
  },

  /**
   * 输出表格数据
   * @param {Array|Object} data - 表格数据
   */
  table(data) {
    console.table(data);
  },
};
