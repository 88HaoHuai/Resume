# BOSS直聘 - 聊天批量发送图片

## 推荐方式：连到你自己的 Chrome（不会被检测）

BOSS 会检测自动化浏览器的特征（`navigator.webdriver`、无头模式等），检测到后直接关闭页面。

**终极解决方案**：让 agent-browser 连到你自己的真实 Chrome，BOSS 看到的就是你日常使用的浏览器，完全无法检测。

### 步骤

```bash
# Step 1: 启动 Chrome（带调试端口）
open -a "Google Chrome" --args --remote-debugging-port=9222

# Step 2: 在 Chrome 里打开 BOSS 并登录
# 访问 https://www.zhipin.com/web/geek/chat 并完成登录

# Step 3: 运行脚本
cd /Users/huaihao/Documents/trae_project/招聘/BOSS/agent-browser
node send-chat-images.js ~/Desktop/resume.jpg --auto-connect

# 限制数量
node send-chat-images.js ~/Desktop/resume.jpg --auto-connect --max 20
```

### 备选：独立浏览器模式

如果不想用自己 Chrome，脚本会开一个独立浏览器 + 注入反检测脚本。**但可能仍被 BOSS 检测到。**

```bash
node send-chat-images.js ~/Desktop/resume.jpg --max 20
```

## 参数

| 参数 | 说明 |
|------|------|
| `<图片路径>` | 必填，本地图片文件路径 |
| `--auto-connect [端口]` | 连接到你的真实 Chrome（推荐） |
| `--max N` | 最多发送 N 个联系人 |
| `--session <名>` | 会话名称 |

## 上传策略

按优先级依次尝试：
1. CDP upload — 直接设置 input.files
2. Mock File System Access API — 拦截 showOpenFilePicker
3. Data URL 注入 — 图片转 base64 插入编辑器
4. 暴力注入 — 遍历所有 file input
