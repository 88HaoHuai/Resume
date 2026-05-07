# 招聘自动投递与简历优化工具

这个仓库包含两个招聘平台的浏览器插件：

- `BOSS/`：BOSS 直聘自动投递助手，目前功能最完整，支持自动投递、公司黑名单、薪资筛选、岗位记忆、简历版本管理、DeepSeek 简历优化和 License 授权。
- `智联/zhaopin-auto-apply/`：智联招聘自动投递插件，基于 Vite + TypeScript + React 构建。

当前主要维护和迭代的是 `BOSS/` 插件。

## 功能概览

### BOSS 直聘插件

- 自动遍历 BOSS 搜索页职位卡片并发起沟通
- 支持每日投递上限、单轮投递数量和随机延迟
- 支持薪资范围、包含关键词、排除关键词、HR 活跃状态等筛选
- 独立公司黑名单管理页，支持批量导入、模糊匹配、近期投递公司一键加入
- 自动记录投递历史、岗位详情和公司信息
- 支持 Markdown 简历管理、多版本简历、激活版本切换
- 支持 DeepSeek API 进行岗位匹配分析和定向简历优化
- 自动脱敏手机号和邮箱后再发送给 AI，返回结果自动还原
- 支持 License 授权服务，防止插件被随意分发
- 支持打包发布，构建脚本会混淆前端代码并注入授权服务器地址

### 智联插件

- 扫描智联招聘搜索页职位
- 批量/单个投递
- 招呼语模板管理
- 浮动面板展示投递状态

智联插件当前不是本轮重点，部分构建产物可能处于开发态。

## 目录结构

```text
招聘/
├── README.md
├── BOSS/
│   ├── manifest.json                 # Chrome 扩展清单
│   ├── popup/                        # 扩展弹窗
│   ├── content/                      # 注入 BOSS 页面后的核心逻辑
│   ├── services/                     # 存储、筛选、简历、AI、授权等服务
│   ├── dashboard/                    # 简历优化与数据看板
│   ├── blacklist/                    # 独立公司黑名单管理页
│   ├── background/                   # MV3 service worker
│   ├── build/                        # 打包脚本
│   ├── server/                       # License 授权服务
│   └── assets/                       # 扩展图标
└── 智联/
    └── zhaopin-auto-apply/
        ├── src/
        ├── public/
        ├── manifest.config.ts
        └── package.json
```

## 快速开始：BOSS 插件

### 1. 安装依赖

```bash
cd BOSS
npm install
```

### 2. 启动授权服务

本地调试时：

```bash
cd BOSS/server
npm install
npm start
```

默认服务地址：

```text
http://localhost:3005
```

当前线上授权服务地址：

```text
http://120.26.86.92:3005
```

健康检查：

```bash
curl http://120.26.86.92:3005/api/health
```

### 3. 加载 Chrome 插件

开发调试时可以直接加载源码目录：

1. 打开 Chrome
2. 访问 `chrome://extensions/`
3. 打开右上角「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `BOSS/` 目录

如果加载的是打包目录，则选择 `BOSS/dist/`。

### 4. 激活 License

打开扩展弹窗后，如果顶部显示未激活，输入 License Key 并点击确认。

授权接口：

```text
POST /api/activate
POST /api/validate
```

License 数据默认保存在：

```text
BOSS/server/licenses.json
```

这个文件包含真实授权信息，已被 `.gitignore` 排除，不应提交到 GitHub。

## 打包发布 BOSS 插件

### 打包到本地授权服务

```bash
cd BOSS
npm run build
```

默认注入：

```text
http://localhost:3005
```

### 打包到线上授权服务

```bash
cd BOSS
npm run build -- --server http://120.26.86.92:3005
```

构建完成后会生成：

```text
BOSS/boss-pro-YYYY-MM-DD_HHMMSS.zip
```

构建脚本会：

- 清理并重建 `BOSS/dist/`
- 复制插件源码到 `dist`
- 混淆大部分 JS 文件
- 跳过混淆 `background/service-worker.js`，避免 Chrome MV3 加载异常
- 将授权服务地址写入 `popup`、`licenseService` 和 `service-worker`
- 更新 `manifest.json` 的 `host_permissions`
- 生成 zip 包

发布前建议额外制作 clean 包，排除开发文件、旧 zip 和 npm 元数据。

## BOSS 插件使用流程

### 自动投递

1. 打开 BOSS 直聘职位搜索页
2. 点击浏览器扩展图标
3. 在「筛选」中设置：
   - 薪资范围
   - 包含关键词
   - 排除关键词
   - 是否只投递活跃 HR
4. 在「黑名单」中维护不投递的公司
5. 在「简历」中配置 DeepSeek API Key 和简历版本
6. 回到「控制台」，设置本轮投递数量
7. 点击「开始投递」

页面右下角会出现浮动日志面板，展示：

- 当前解析到的职位
- 公司黑名单命中情况
- 薪资解析和筛选范围
- 成功、跳过、失败统计

### 薪资筛选规则

薪资筛选采用「区间有交集」规则。

例如筛选范围为 `15-30K`：

| 岗位薪资 | 是否通过 | 原因 |
| --- | --- | --- |
| `20-40K` | 通过 | 与 `15-30K` 有重叠 |
| `10-20K` | 通过 | 与 `15-30K` 有重叠 |
| `10-14K` | 跳过 | 最高薪资低于 15 |
| `31-50K` | 跳过 | 最低薪资高于 30 |
| `面议` / 空薪资 | 通过 | 无法解析时不因为薪资误杀 |

BOSS 会使用自定义字体混淆薪资数字，插件已内置 PUA 字符解码逻辑。

### 公司黑名单

黑名单已经从弹窗中拆为独立页面：

```text
BOSS/blacklist/blacklist.html
```

功能包括：

- 单个公司添加
- 批量导入，支持换行、逗号、顿号分隔
- 搜索过滤
- 单个删除
- 清空全部
- 从近期投递记录一键加入
- 导入/导出 JSON

匹配规则为模糊匹配，会去除空格、括号、特殊符号后比较。比如黑名单中填写 `北汽科服`，可以命中 `北京北汽科服科技有限公司`。

### 简历和 AI 优化

打开 Dashboard：

```text
BOSS/dashboard/dashboard.html
```

主要能力：

- 基础简历 Markdown 编辑
- 简历版本列表
- 当前使用版本切换
- 已投递岗位分析
- DeepSeek 岗位匹配度分析
- 针对岗位生成优化版简历
- 版本投递数、回复数、回复率统计

DeepSeek 配置在扩展弹窗或 Dashboard 中填写。默认模型配置为：

```text
deepseek-v4
```

为了隐私，调用 AI 前会把手机号和邮箱替换为占位符，例如 `[PHONE_0]`、`[EMAIL_0]`，AI 返回后再自动还原。

## License 授权服务

授权服务位于：

```text
BOSS/server/
```

启动：

```bash
cd BOSS/server
npm install
npm start
```

管理后台：

```text
http://localhost:3005/admin
```

默认管理员密钥：

```text
boss-admin-2026
```

生产环境建议通过环境变量覆盖：

```bash
export PORT=3005
export ADMIN_KEY="your-admin-key"
export SECRET="your-32-chars-secret"
npm start
```

接口：

```text
GET  /api/health
POST /api/activate
POST /api/validate
POST /api/admin/login
GET  /api/admin/licenses
POST /api/admin/generate
POST /api/admin/unbind
POST /api/admin/revoke
```

## 安全与隐私

请不要提交以下文件：

```text
BOSS/server/licenses.json
BOSS/boss-pro-*.zip
BOSS/dist/
node_modules/
.DS_Store
```

这些内容已在 `.gitignore` 中排除。

注意事项：

- License Key 和绑定设备信息属于敏感数据
- DeepSeek API Key 保存在 Chrome 本地存储中
- 简历内容会用于 AI 优化，请确认第三方 API 使用风险
- 插件仅供个人效率提升，请遵守招聘平台规则

## 常见问题

### 1. 激活时报 `Failed to fetch`

说明插件无法访问授权服务。

检查：

```bash
curl http://120.26.86.92:3005/api/health
```

如果使用本地服务：

```bash
cd BOSS/server
npm start
```

如果包里仍然写的是 `localhost`，需要重新打包：

```bash
npm run build -- --server http://120.26.86.92:3005
```

### 2. 黑名单不生效

检查右下角浮动日志面板是否显示：

```text
黑名单: X 家
黑名单命中
跳过
```

如果公司名为空，通常是 BOSS 页面 DOM 变化，需要更新 `BOSS/content/jobParser.js` 中的公司名选择器。

### 3. 薪资为空或乱码

BOSS 会使用自定义字体混淆数字。插件会尝试解码 PUA 字符，并在日志中显示：

```text
字体解码: "..." → "20-40K"
```

如果仍解析失败，需要根据日志中的卡片原始文本更新薪资正则。

### 4. 修改代码后插件没变化

Chrome 扩展不会自动热更新 content script。需要：

1. 打开 `chrome://extensions/`
2. 点击该扩展的刷新按钮
3. 刷新 BOSS 页面

### 5. 上传到 GitHub 时不要带敏感文件

提交前检查：

```bash
git status --short
git diff --cached --name-only
```

确认没有 `licenses.json`、zip 包、`.DS_Store`。

## 开发建议

- 搜索代码优先用 `rg`
- 修改插件后先跑语法检查：

```bash
node --check BOSS/content/jobParser.js
node --check BOSS/content/autoApply.js
node --check BOSS/popup/popup.js
node --check BOSS/services/filterService.js
```

- 打包前确认远程授权服务可访问：

```bash
curl http://120.26.86.92:3005/api/health
```

## 免责声明

本项目用于个人学习和效率提升。使用者应自行确认其行为符合招聘平台规则、当地法律法规和个人隐私保护要求。请避免高频、骚扰式或违反平台条款的自动化行为。
