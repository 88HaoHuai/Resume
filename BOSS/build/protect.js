#!/usr/bin/env node
/**
 * BOSS 插件保护构建脚本
 *
 * 1. 复制源文件到 dist/
 * 2. javascript-obfuscator 混淆所有 JS
 * 3. 注入服务器地址（编译后不可修改）
 * 4. 打包为 .zip
 *
 * 用法: node build/protect.js [--server https://your-server.com]
 */

const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ========== 配置 ==========
const SERVER_URL = process.argv.includes('--server')
  ? process.argv[process.argv.indexOf('--server') + 1]
  : 'http://localhost:3005';

const DEBUG_MODE = process.argv.includes('--debug'); // 调试模式：跳过混淆，只复制+打包

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const IGNORE_DIRS = new Set([
  'dist', 'build', 'node_modules', '.git', '.claude', '.browser-profile',
  'agent-browser', 'server',
]);

// 服务器地址占位符（对象属性写法 in LicenseService，变量声明写法 in Service Worker）
const API_BASE_PLACEHOLDER_OBJ = "API_BASE: 'http://localhost:3005/api'";
const API_BASE_PLACEHOLDER_VAR = "const API_BASE = 'http://localhost:3005/api'";
const API_BASE_REPLACEMENT_OBJ = `API_BASE: '${SERVER_URL}/api'`;
const API_BASE_REPLACEMENT_VAR = `const API_BASE = '${SERVER_URL}/api'`;

// ========== Obfuscator 配置 ==========
// 安全配置：避免破坏 async/await 和 Chrome CSP
const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: false,      // 关闭：会破坏 async/await 逻辑
  deadCodeInjection: false,
  debugProtection: false,
  debugProtectionInterval: 0,
  disableConsoleOutput: true,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: false,       // 关闭：避免数值转换异常
  renameGlobals: false,
  selfDefending: false,              // 关闭：违反 Chrome CSP
  simplify: true,
  splitStrings: false,               // 关闭：避免字符串解码异常
  stringArray: true,
  stringArrayCallsTransform: false,  // 关闭：会生成 new Function()，违反 Chrome CSP
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 1,
  stringArrayWrappersChainedCalls: false,
  stringArrayWrappersType: 'variable',
  stringArrayThreshold: 0.75,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
};

// ========== 构建流程 ==========

function cleanDist() {
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true });
  }
  fs.mkdirSync(DIST, { recursive: true });
  console.log('[1/5] 清理 dist/');
}

function copyFiles(srcDir, distDir, relativePath = '') {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const name = entry.name;
    if (name.startsWith('.') || IGNORE_DIRS.has(name)) continue;

    const srcPath = path.join(srcDir, name);
    const distPath = path.join(distDir, name);

    if (entry.isDirectory()) {
      fs.mkdirSync(distPath, { recursive: true });
      copyFiles(srcPath, distPath, path.join(relativePath, name));
    } else {
      if (name.endsWith('.js')) {
        if (DEBUG_MODE) {
          // 调试模式：直接复制源码，替换服务器地址
          let code = fs.readFileSync(srcPath, 'utf-8');
          if (code.includes(API_BASE_PLACEHOLDER_OBJ)) {
            code = code.replace(API_BASE_PLACEHOLDER_OBJ, API_BASE_REPLACEMENT_OBJ);
          }
          if (code.includes(API_BASE_PLACEHOLDER_VAR)) {
            code = code.replace(API_BASE_PLACEHOLDER_VAR, API_BASE_REPLACEMENT_VAR);
          }
          fs.writeFileSync(distPath, code, 'utf-8');
        } else {
          fs.copyFileSync(srcPath, distPath + '.orig');
        }
      } else {
        fs.copyFileSync(srcPath, distPath);
      }
    }
  }
  console.log('[2/5] 复制文件');
}

function obfuscateFiles(distDir, relativePath = '') {
  const entries = fs.readdirSync(distDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(distDir, entry.name);

    if (entry.isDirectory()) {
      obfuscateFiles(fullPath, path.join(relativePath, entry.name));
    } else if (entry.name.endsWith('.orig')) {
      const origPath = fullPath;
      const jsPath = origPath.replace(/\.orig$/, '');
      const source = fs.readFileSync(origPath, 'utf-8');

      // 替换服务器地址
      let code = source;
      if (code.includes(API_BASE_PLACEHOLDER_OBJ)) {
        code = code.replace(API_BASE_PLACEHOLDER_OBJ, API_BASE_REPLACEMENT_OBJ);
      }
      if (code.includes(API_BASE_PLACEHOLDER_VAR)) {
        code = code.replace(API_BASE_PLACEHOLDER_VAR, API_BASE_REPLACEMENT_VAR);
      }

      // Service Worker 不混淆：混淆后 Chrome 加载易报错
      if (jsPath.includes('background/service-worker')) {
        console.log(`  [跳过混淆] background/service-worker.js`);
        fs.writeFileSync(jsPath, code, 'utf-8');
      } else {
        try {
          const result = JavaScriptObfuscator.obfuscate(code, OBFUSCATOR_OPTIONS);
          fs.writeFileSync(jsPath, result.getObfuscatedCode(), 'utf-8');
        } catch (e) {
          console.warn(`  警告: ${jsPath} 混淆失败，使用未混淆版本`);
          fs.writeFileSync(jsPath, code, 'utf-8');
        }
      }

      // 删除 .orig 文件
      fs.unlinkSync(origPath);
    }
  }
  console.log('[3/5] 混淆 JS 文件');
}

function updateManifest() {
  const manifestPath = path.join(DIST, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // 删除 source map 引用（如果有）
    if (manifest.content_scripts) {
      for (const cs of manifest.content_scripts) {
        cs.js = cs.js.filter(f => !f.endsWith('.map'));
      }
    }

    // 注入服务器地址到 host_permissions（允许 fetch 请求）
    const serverOrigin = new URL(SERVER_URL).origin;
    if (manifest.host_permissions) {
      manifest.host_permissions.push(serverOrigin + '/*');
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }
  console.log('[4/5] 更新 manifest');
}

function createPackage() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const zipName = `boss-pro-${ts}.zip`;
  const zipPath = path.join(ROOT, zipName);

  try {
    execSync(`cd "${DIST}" && zip -r "${zipPath}" . -x "*.orig" "*.map"`, {
      stdio: 'pipe',
    });
    console.log(`[5/5] 打包: ${zipName}`);
    console.log(`\n✅ 构建完成！`);
    console.log(`   服务器: ${SERVER_URL}`);
    console.log(`   输出: ${zipPath}`);
    console.log(`\n   分发 ${zipName} 给用户即可`);
  } catch (e) {
    console.error('打包失败:', e.message);
  }
}

// ========== 执行 ==========
console.log(`BOSS 插件保护构建${DEBUG_MODE ? ' [调试模式 - 无混淆]' : ''}\n服务器: ${SERVER_URL}\n`);

cleanDist();
copyFiles(ROOT, DIST);
if (!DEBUG_MODE) {
  obfuscateFiles(DIST);
} else {
  console.log('[3/5] 跳过混淆（调试模式）');
}
updateManifest();
createPackage();
