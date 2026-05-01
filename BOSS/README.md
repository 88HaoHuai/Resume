# BOSS 直聘自动投递助手

辅助在 [BOSS 直聘](https://www.zhipin.com) 上高效筛选与投递简历的 Chrome 浏览器插件。

## 功能

### 1. 自动投递
- 在职位搜索/推荐页面自动遍历职位卡片
- 点击「立即沟通」→ 发送预设招呼语 → 附带图片简历
- 支持薪资、关键词、公司黑名单等筛选条件
- 每日投递上限、冷却期、随机延迟等防检测机制
- 实时统计：今日投递数、本轮成功、跳过

### 2. 聊天批量发图
- 在聊天页面自动遍历联系人列表
- 逐个点击联系人 → 上传图片简历 → 发送
- 已发送记录自动跳过，支持清空重发
- 多种上传策略适配 BOSS 的 Vue.js 页面结构

### 3. 公司黑名单
- 独立黑名单管理页面
- 支持批量导入、导出、模糊匹配
- 自动跳过黑名单公司

### 4. 简历管理
- 多版本简历管理
- AI 简历优化（需配置 DeepSeek API Key）
- 图片简历上传（支持自动压缩）

## 安装

1. 下载本目录
2. Chrome 打开 `chrome://extensions/`
3. 右上角开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `BOSS/` 文件夹

## 使用

### 自动投递
1. 打开 BOSS 直聘职位搜索/推荐页面
2. 点击扩展图标，在「筛选」标签页设置条件
3. 在「简历」标签页上传图片和配置招呼语
4. 回到「控制台」，点击「开始投递」

### 聊天批量发图
1. 打开 BOSS 聊天页面 (`/web/geek/chat`)
2. 在「简历」标签页上传图片简历
3. 在「控制台」底部点击「批量发图」
4. 插件自动遍历联系人并发送

## 项目结构

```
BOSS/
├── manifest.json              # Chrome 扩展配置
├── assets/                    # 图标资源 (16/48/128px)
├── background/
│   └── service-worker.js      # 后台消息路由
├── content/
│   ├── content.js             # 消息分发入口
│   ├── autoApply.js           # 自动投递引擎
│   ├── chatResumeSender.js    # 聊天批量发图
│   ├── resumeSender.js        # 单次图片简历发送
│   ├── jobParser.js           # 职位信息解析
│   └── mouseSimulator.js      # 鼠标行为模拟
├── popup/
│   ├── popup.html             # 弹出面板
│   └── popup.js               # 面板逻辑
├── services/
│   ├── storageService.js      # 存储封装
│   ├── filterService.js       # 筛选逻辑
│   ├── templateService.js     # 招呼语管理
│   ├── resumeService.js       # 简历管理
│   └── optimizationService.js # AI 优化
├── dashboard/
│   ├── dashboard.html         # 简历管理看板
│   └── dashboard.js
├── blacklist/
│   ├── blacklist.html         # 黑名单管理
│   └── blacklist.js
└── utils/
    ├── constants.js           # 全局常量
    ├── helpers.js             # 工具函数
    └── logger.js              # 日志工具
```

## 技术要点

- **Vue.js 兼容**：文件注入时同时触发 `input`/`change` 事件 + 直接调用 Vue 组件方法（`__vue__`）
- **防检测**：贝塞尔曲线鼠标轨迹、正态分布延迟、随机行为间隔
- **多策略上传**：文件注入 → Mock FileSystemAPI → DataURL → 暴力注入，按优先级降级
- **MutationObserver**：监听发送按钮状态变化，比轮询更灵敏

## 注意事项

- 仅供个人效率提升使用，请遵守 BOSS 直聘的使用条款
- 首次使用建议小批量测试（10-20 个）
- 图片简历建议不超过 2MB，插件会自动压缩
