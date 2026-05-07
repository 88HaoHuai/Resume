# BOSS 插件 License 管理服务器

## 部署到你的服务器

### 1. 上传文件

```bash
scp -r server/ user@your-server:/opt/boss-license/
```

### 2. 服务器上安装启动

```bash
cd /opt/boss-license
npm install
npm start
```

### 3. 设置环境变量（可选）

```bash
export PORT=3000                    # 端口，默认 3000
export ADMIN_KEY="your-secret-key"  # 管理员登录密钥（重要！）
export SECRET="random-32-chars..."  # 签名密钥
```

### 4. Nginx 反代 + SSL（推荐）

```nginx
server {
    listen 443 ssl;
    server_name license.your-domain.com;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 5. 使用 PM2 守护进程

```bash
npm install -g pm2
pm2 start index.js --name boss-license
pm2 save
pm2 startup
```

## 使用管理后台

1. 浏览器打开 `https://license.your-domain.com/admin`
2. 输入管理员密钥登录
3. 点击「生成 License Key」创建新 Key
4. 将 Key 发给用户
5. 用户输入 Key → 服务器绑定机器 → 激活成功
6. 如需换机，在后台点击「解绑」即可

## 一键部署（Railway / Render）

可直接部署，设置环境变量 `ADMIN_KEY` 即可。
