/**
 * BOSS 插件 License 验证 + 管理后台
 *
 * 快速部署:
 *   1. npm install && npm start
 *   2. 打开 http://localhost:3000/admin 管理 License
 *   3. 插件 API: /api/activate, /api/validate
 *
 * 部署到服务器（推荐 Docker + nginx 反代）:
 *   - 设置环境变量 ADMIN_KEY（管理员密码）
 *   - 设置环境变量 SECRET（签名密钥）
 *   - 设置环境变量 PORT（端口，默认 3000）
 *   - nginx 反代 + SSL 证书
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

const PORT = process.env.PORT || 3005;
const ADMIN_KEY = process.env.ADMIN_KEY || 'boss-admin-2026';
const SECRET = process.env.SECRET || crypto.randomBytes(32).toString('hex');
const DATA_FILE = path.join(__dirname, 'licenses.json');

// ========== 数据操作 ==========

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (_) {}
  return { keys: {} };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ========== 工具函数 ==========

function sign(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('hex');
}

function generateToken(licenseKey, machineId) {
  const payload = `${licenseKey}:${machineId}:${Date.now()}`;
  const sig = sign(payload);
  return Buffer.from(`${payload}:${sig}`).toString('base64');
}

function parseToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    const licenseKey = parts[0], machineId = parts[1], timestamp = parseInt(parts[2]), sig = parts[3];
    if (sig !== sign(`${licenseKey}:${machineId}:${timestamp}`)) return null;
    if (Date.now() - timestamp > 30 * 86400000) return null;
    return { licenseKey, machineId, timestamp };
  } catch (_) { return null; }
}

function generateLicenseKey() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `BOSS-${seg()}-${seg()}-${seg()}`;
}

// ========== 客户端 API ==========

app.post('/api/activate', (req, res) => {
  const { licenseKey, machineId, machineName } = req.body;
  if (!licenseKey || !machineId) {
    return res.status(400).json({ success: false, error: '缺少参数' });
  }
  const data = loadData();
  const info = data.keys[licenseKey];
  if (!info) return res.status(403).json({ success: false, error: 'License Key 无效' });
  if (info.revoked) return res.status(403).json({ success: false, error: 'License 已被吊销' });
  if (info.expiresAt && new Date(info.expiresAt) < new Date()) {
    return res.status(403).json({ success: false, error: 'License 已过期' });
  }
  if (info.boundMachine && info.boundMachine !== machineId) {
    return res.status(403).json({
      success: false,
      error: `此 License 已在「${info.machineName || '其他设备'}」激活，请联系管理员解绑`,
    });
  }
  const token = generateToken(licenseKey, machineId);
  info.boundMachine = machineId;
  info.machineName = machineName || '-';
  info.activatedAt = new Date().toISOString();
  info.lastSeen = new Date().toISOString();
  saveData(data);
  console.log(`✓ 激活: ${licenseKey} → ${machineName || machineId}`);
  res.json({ success: true, sessionToken: token });
});

app.post('/api/validate', (req, res) => {
  const { sessionToken, machineId } = req.body;
  if (!sessionToken) return res.json({ valid: false, reason: 'missing_token' });
  const parsed = parseToken(sessionToken);
  if (!parsed) return res.json({ valid: false, reason: 'token_invalid' });
  if (machineId && parsed.machineId !== machineId) {
    return res.json({ valid: false, reason: 'machine_mismatch' });
  }
  const data = loadData();
  const info = data.keys[parsed.licenseKey];
  if (!info || info.revoked) return res.json({ valid: false, reason: 'revoked' });
  if (info.expiresAt && new Date(info.expiresAt) < new Date()) return res.json({ valid: false, reason: 'expired' });
  info.lastSeen = new Date().toISOString();
  saveData(data);
  res.json({ valid: true, plan: info.plan || 'pro' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ========== 管理后台 API ==========

// 管理员认证中间件
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.adminKey || req.body?.adminKey;
  if (key !== ADMIN_KEY) return res.status(403).json({ error: '管理员密钥错误' });
  next();
}

// 列出所有 License
app.get('/api/admin/licenses', requireAdmin, (req, res) => {
  const data = loadData();
  const list = Object.entries(data.keys).map(([key, info]) => ({
    key,
    ...info,
    status: info.revoked ? 'revoked'
      : info.boundMachine ? 'active'
      : info.expiresAt && new Date(info.expiresAt) < new Date() ? 'expired'
      : 'unused',
  }));
  res.json({ count: list.length, licenses: list });
});

// 生成 License Key
app.post('/api/admin/generate', requireAdmin, (req, res) => {
  const { plan, expiresAt, count, note } = req.body;
  const num = Math.min(count || 1, 50);
  const data = loadData();
  const generated = [];
  for (let i = 0; i < num; i++) {
    const key = generateLicenseKey();
    const exp = expiresAt || new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0];
    data.keys[key] = {
      plan: plan || 'pro',
      note: note || '',
      issuedAt: new Date().toISOString().split('T')[0],
      expiresAt: exp,
      boundMachine: null,
      machineName: null,
      activatedAt: null,
      lastSeen: null,
      revoked: false,
    };
    generated.push({ key, plan: data.keys[key].plan, expiresAt: exp });
  }
  saveData(data);
  console.log(`✓ 生成 ${num} 个 License`);
  res.json({ success: true, generated });
});

// 解绑
app.post('/api/admin/unbind', requireAdmin, (req, res) => {
  const { licenseKey } = req.body;
  const data = loadData();
  if (!data.keys[licenseKey]) return res.status(404).json({ success: false, error: 'License 不存在' });
  const old = data.keys[licenseKey].boundMachine;
  data.keys[licenseKey].boundMachine = null;
  data.keys[licenseKey].machineName = null;
  data.keys[licenseKey].activatedAt = null;
  saveData(data);
  console.log(`✓ 解绑: ${licenseKey}`);
  res.json({ success: true, message: '已解绑' });
});

// 吊销
app.post('/api/admin/revoke', requireAdmin, (req, res) => {
  const { licenseKey } = req.body;
  const data = loadData();
  if (!data.keys[licenseKey]) return res.status(404).json({ success: false, error: 'License 不存在' });
  data.keys[licenseKey].revoked = true;
  saveData(data);
  console.log(`✓ 吊销: ${licenseKey}`);
  res.json({ success: true, message: '已吊销' });
});

// 管理后台登录验证
app.post('/api/admin/login', (req, res) => {
  const { adminKey } = req.body;
  if (adminKey === ADMIN_KEY) {
    res.json({ success: true, token: crypto.createHmac('sha256', SECRET).update('admin').digest('hex') });
  } else {
    res.status(403).json({ success: false, error: '管理员密钥错误' });
  }
});

// ========== 启动 ==========

function initSample() {
  if (!fs.existsSync(DATA_FILE)) {
    const sample = { keys: {} };
    // 生成一个示例 License
    const demoKey = generateLicenseKey();
    sample.keys[demoKey] = {
      plan: 'pro',
      note: '示例 License（可删除）',
      issuedAt: new Date().toISOString().split('T')[0],
      expiresAt: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
      boundMachine: null,
      machineName: null,
      activatedAt: null,
      lastSeen: null,
      revoked: false,
    };
    saveData(sample);
    console.log('========== 初始化完成 ==========');
    console.log(`示例 License Key: ${demoKey}`);
    console.log(`管理员密钥:        ${ADMIN_KEY}`);
    console.log(`管理后台:          http://localhost:${PORT}/admin`);
    console.log('================================');
  }
}

initSample();

app.listen(PORT, () => {
  console.log(`License Server: http://localhost:${PORT}`);
  console.log(`管理后台:      http://localhost:${PORT}/admin`);
  console.log(`API 健康检查:  http://localhost:${PORT}/api/health`);
});
