# BOSS 直聘自动投递助手

BOSS 直聘自动投递助手是一个 Chrome MV3 浏览器插件，用于辅助完成职位筛选、自动投递、公司黑名单过滤、简历管理、岗位记忆和 AI 简历优化。

插件当前包含三部分：

- Chrome 插件主体：自动投递、聊天批量发图、弹窗控制台
- 数据看板：简历版本、岗位分析、AI 优化和投递统计
- License 服务：授权激活、设备绑定和管理后台

## 核心功能

### 自动投递

- 解析 BOSS 搜索页职位列表
- 按顺序检查岗位是否符合筛选条件
- 自动点击职位卡片并发起沟通
- 支持本轮投递上限和每日投递上限
- 自动记录投递历史
- 页面右下角显示实时日志面板

### 筛选规则

支持以下筛选条件：

- 薪资范围
- 包含关键词
- 排除关键词
- 公司黑名单
- 是否只投递活跃 HR
- 工作经验
- 学历要求
- 公司规模
- 融资阶段

薪资采用「区间相交」规则。例如你设置 `15-30K`：

| 岗位薪资 | 结果 |
| --- | --- |
| `20-40K` | 通过 |
| `10-20K` | 通过 |
| `10-14K` | 跳过 |
| `31-50K` | 跳过 |

如果薪资为空、面议或解析失败，插件不会因为薪资条件直接淘汰该岗位，避免误杀。

### 公司黑名单

黑名单是独立页面：

```text
blacklist/blacklist.html
```

功能：

- 单个添加公司
- 批量导入公司
- 搜索过滤
- 删除单个公司
- 清空全部
- 从近期投递公司中快速加入
- 导入/导出 JSON

匹配采用模糊规则：会去除空格、括号、特殊符号后进行包含匹配。

### 简历管理与岗位记忆

Dashboard 页面：

```text
dashboard/dashboard.html
```

功能：

- 基础简历 Markdown 编辑
- 多版本简历管理
- 激活当前使用版本
- 投递岗位详情存储
- 未分析岗位列表
- 岗位匹配度分析
- 生成针对岗位的优化版简历
- 统计不同简历版本的投递数、回复数和回复率

### DeepSeek AI 优化

插件通过 DeepSeek Chat API 完成：

- 岗位 JD 和简历匹配分析
- 技能缺口识别
- 简历关键词建议
- 生成优化后的 Markdown 简历

默认模型：

```text
deepseek-v4
```

隐私处理：

- 调用 AI 前会自动脱敏手机号和邮箱
- 脱敏格式为 `[PHONE_0]`、`[EMAIL_0]`
- AI 返回后自动还原真实信息

### License 授权

插件启动时会检查 License：

- 未激活时锁定核心功能
- 激活后写入 `chrome.storage.local`
- 支持离线 7 天兜底
- 支持设备绑定
- 支持后台解绑和吊销

当前线上授权服务：

```text
http://120.26.86.92:3005
```

## 安装与调试

### 直接加载源码

1. 打开 Chrome
2. 访问 `chrome://extensions/`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择本目录 `BOSS/`

### 修改后刷新

每次修改 content script 后，需要：

1. 在 `chrome://extensions/` 中刷新插件
2. 刷新 BOSS 页面

否则页面上运行的仍然是旧脚本。

## 打包发布

### 安装依赖

```bash
npm install
```

### 打包到线上授权服务

```bash
npm run build -- --server http://120.26.86.92:3005
```

### 打包到本地授权服务

```bash
npm run build
```

默认地址：

```text
http://localhost:3005
```

构建输出：

```text
boss-pro-YYYY-MM-DD_HHMMSS.zip
dist/
```

构建流程：

1. 清空 `dist/`
2. 复制插件文件
3. 混淆 JS
4. 跳过混淆 `background/service-worker.js`
5. 注入授权服务地址
6. 更新 `manifest.json`
7. 生成 zip 包

## License 服务

服务目录：

```text
server/
```

### 本地启动

```bash
cd server
npm install
npm start
```

默认端口：

```text
3005
```

健康检查：

```bash
curl http://localhost:3005/api/health
```

管理后台：

```text
http://localhost:3005/admin
```

默认管理员密钥：

```text
boss-admin-2026
```

生产环境建议使用环境变量：

```bash
export PORT=3005
export ADMIN_KEY="your-admin-key"
export SECRET="your-secret"
npm start
```

### 主要接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查 |
| `POST` | `/api/activate` | 激活 License |
| `POST` | `/api/validate` | 验证 Session |
| `POST` | `/api/admin/login` | 管理员登录 |
| `GET` | `/api/admin/licenses` | License 列表 |
| `POST` | `/api/admin/generate` | 生成 License |
| `POST` | `/api/admin/unbind` | 解绑设备 |
| `POST` | `/api/admin/revoke` | 吊销 License |

## 项目结构

```text
BOSS/
├── manifest.json
├── package.json
├── build/
│   └── protect.js
├── background/
│   └── service-worker.js
├── content/
│   ├── autoApply.js
│   ├── chatResumeSender.js
│   ├── content.js
│   ├── diagnostic.js
│   ├── fontDecoder.js
│   ├── jobParser.js
│   ├── mouseSimulator.js
│   ├── resumeSender.js
│   └── uiInjector.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── services/
│   ├── analyticsService.js
│   ├── apiKeyService.js
│   ├── filterService.js
│   ├── jobMemoryService.js
│   ├── licenseService.js
│   ├── optimizationService.js
│   ├── presetResume.js
│   ├── resumeService.js
│   ├── storageService.js
│   └── templateService.js
├── dashboard/
│   ├── dashboard.html
│   ├── dashboard.css
│   └── dashboard.js
├── blacklist/
│   ├── blacklist.html
│   ├── blacklist.css
│   └── blacklist.js
├── server/
│   ├── index.js
│   ├── package.json
│   ├── README.md
│   └── public/admin.html
├── utils/
│   ├── constants.js
│   ├── helpers.js
│   └── logger.js
└── assets/
```

## 关键模块说明

### `content/jobParser.js`

负责解析职位卡片：

- 职位标题
- 公司名称
- 薪资
- 地点
- 经验
- 学历
- HR 信息
- 职位链接

BOSS 会对薪资数字做字体混淆，解析后会调用 PUA 解码逻辑。

### `services/filterService.js`

负责判断岗位是否应该投递：

- 黑名单优先
- 薪资区间相交
- 关键词包含/排除
- HR 在线状态
- 经验和学历

### `content/autoApply.js`

自动投递主循环：

1. 解析当前页职位
2. 逐个读取最新筛选配置和黑名单
3. 过滤不合适岗位
4. 检查是否已投递
5. 执行投递
6. 保存投递记录和岗位详情

### `content/uiInjector.js`

页面右下角日志面板：

- 展示实时解析结果
- 展示跳过原因
- 展示黑名单命中
- 展示薪资筛选诊断
- 支持最小化和清空

### `services/optimizationService.js`

DeepSeek AI 调用封装：

- `analyzeJobMatch`
- `generateOptimizedResume`
- `analyzeAndGenerate`
- `batchAnalyze`

## 常见问题

### 激活失败：授权服务未启动或无法访问

确认服务可访问：

```bash
curl http://120.26.86.92:3005/api/health
```

如果返回失败，检查服务器进程或防火墙。

### 激活失败：设备不匹配

说明 License 已绑定其他设备。进入管理后台解绑：

```text
http://120.26.86.92:3005/admin
```

找到对应 Key，点击解绑。

### 黑名单没有命中

看右下角日志面板：

```text
黑名单: X 家
黑名单命中
跳过
```

如果公司名为空，说明 BOSS 页面 DOM 变动，需要调整 `jobParser.js`。

### 薪资范围不符合预期

看日志：

```text
薪资="20-40K" → 解析=20-40K | 筛选范围=15-30K
```

规则是区间有交集即可通过。

### 修改代码后不生效

需要刷新扩展和页面：

```text
chrome://extensions/
```

点击刷新按钮后，再刷新 BOSS 页面。

## Git 提交注意

不要提交：

```text
server/licenses.json
dist/
boss-pro-*.zip
node_modules/
.DS_Store
```

提交前检查：

```bash
git status --short
git diff --cached --name-only
```

## 风险提示

本插件用于个人学习和效率提升。请合理控制投递频率，遵守 BOSS 直聘平台规则，不要用于骚扰式投递或其他违反平台条款的行为。
