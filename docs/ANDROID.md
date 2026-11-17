# Edu_chat V0.2 — Android 独立运行版

> 目标：电脑关机后，手机 App 仍能通过互联网独立使用 DeepSeek。

## 1. 架构

```
┌─────────────┐   HTTPS    ┌──────────────────────┐   HTTPS    ┌─────────────┐
│ Android App │ ─────────► │  云端 Node 后端        │ ─────────► │ DeepSeek API │
│ (Capacitor) │  x-app-token│  server/index.mjs     │ x-api-key  │             │
└─────────────┘            └──────────────────────┘            └─────────────┘
```

- **手机 App**：Web 前端（React）用 Capacitor 打包，界面在本地，请求走云端。
- **云端后端**：`server/index.mjs`，负责「加 DeepSeek 密钥 → 转发给 DeepSeek → 流式转发回来」，同时做鉴权、限流。
- **关键安全点**：DeepSeek 密钥**只存在云端环境变量**，绝不进 App、不进 APK、不进 Git。

概念速览：

- **HTTP / API**：手机和服务器之间用 HTTPS 通信。App 发请求，服务器回数据。
- **流式输出（SSE）**：AI 回答是一段段「流」回来的，不是一次性。后端原样转发这个流。
- **环境变量**：服务器启动时从环境读取配置（密钥、口令），代码里不写死。

---

## 2. 第一步：部署云端后端

后端是单个 Node 进程，几乎任何能跑 Node 的平台都行。推荐任选其一：

| 平台 | 说明 |
| --- | --- |
| Render（免费） | 最省事，连 GitHub 后选 Docker 部署即可；免费档闲置会休眠 |
| Railway | 按用量计费，部署简单 |
| Fly.io | 有免费额度，需装 flyctl |
| 自己的 VPS | 最稳定可控，约 $3–5/月 |

### 2.1 需要填写的环境变量（由你本人填写，不要发给我或写进代码）

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | ✅ | 你的 DeepSeek API Key，只在服务器读取 |
| `PUBLIC_ORIGIN` | ✅ | 你的公开 HTTPS 地址，如 `https://edu-chat.onrender.com` |
| `HOST` | ✅ | 容器里设为 `0.0.0.0` |
| `APP_TOKEN` | 二选一 | 手机 App 用的访问令牌，**至少 16 字符随机串** |
| `APP_USER` + `APP_PASSWORD` | 二选一 | 浏览器访问用的站点账号（可选） |
| `DEEPSEEK_API_ORIGIN` | 否 | 默认 `https://api.deepseek.com`，一般不改 |
| `RATE_LIMIT_PER_MINUTE` | 否 | 默认 60，全实例每分钟请求上限 |
| `MAX_BODY_BYTES` | 否 | 默认 33554432（32 MiB），上传大小上限 |

**生成随机令牌**（PowerShell 里运行，把结果复制到 `APP_TOKEN`）：

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_})
```

### 2.2 用 Render 部署（示例）

1. 把本项目推到你自己的 GitHub 仓库（**先确认 `.gitignore` 已忽略 `.env`，且不要提交任何密钥**）。
2. Render 新建 **Web Service**，选你的仓库。
3. Runtime 选 **Docker**，环境变量按上表填。
4. 部署完成后，记下它给你的 `https://xxx.onrender.com` 地址，填进 `PUBLIC_ORIGIN`（若部署时不确定，可先用临时值再改）。

> Dockerfile 已内置：会自动 `npm ci` + 构建前端，再运行 `node server/index.mjs`。服务端只依赖 Node 内置模块，镜像很小。

---

## 3. 第二步：在 App 里配置连接

1. 打开 App，点设置 →「数据管理」。
2. 「服务器地址」填你的 `https://xxx.onrender.com`（留空则用构建时的默认值）。
3. 「访问令牌」填云端的 `APP_TOKEN`。
4. 点「保存并连接」。看到「已连接服务端」即可开始聊天。

> 如果 App 首屏显示「无法连接服务器」，点它即可跳转到上面的设置界面。

---

## 4. 第三步：构建 APK

### 4.1 先装 Android 构建环境（一次性）

本机当前**没有 JDK 和 Android SDK**，需要安装：

1. **JDK 17**（或 21）：推荐 [Temurin 17](https://adoptium.net/)，安装后记下路径，如 `C:\Program Files\Eclipse Adoptium\jdk-17...`。
2. **Android Studio**：官网下载安装，首次启动时在 SDK Manager 里勾选 **Android 15 (API 36)** 平台 + Build Tools 36。

装好后在 PowerShell 里验证（路径按你的实际安装改）：

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.xx"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
java -version   # 应显示 17 或 21
```

### 4.2 构建命令

```powershell
# 1) 构建 App 版前端（APP_TARGET=android）
npm run build:android

# 2) 同步到 Android 工程（把 dist 拷进 android/）
npx cap sync android

# 3) 编译 APK（首次会下载 Gradle 与依赖，较慢）
cd android
.\gradlew.bat assembleDebug
```

产物在：`android/app/build/outputs/apk/debug/app-debug.apk`。

### 4.3 安装到手机

- 把 `app-debug.apk` 传到手机（微信/数据线/网盘均可），点击安装。
- 首次安装会提示「未知来源」，允许即可。

> `debug` 包用于自用足够；若要正式签名发布（上架）再走 `assembleRelease` + 签名，个人使用不需要。

---

## 5. 安全说明（重要）

- **DeepSeek 密钥**：只写云端环境变量，绝不进 App/APK/仓库。
- **访问令牌 `APP_TOKEN`**：只写云端环境变量 + 手机 App 本地设置里，不进 APK 构建产物、不进 Git。
- 已内置：令牌鉴权、浏览器 Basic 鉴权、每分钟限流、并发限制、Host/跨站校验、错误脱敏。
- 这只是「个人自用」方案，**不是多用户平台**。不要把一个账号分发给陌生人。

---

## 6. 功能清单

### 已完成并保留

- 普通聊天、多轮对话、流式输出、停止/继续生成、编辑提问、重新生成、消息分支
- 深度思考（thinking 开关与折叠面板）
- 联网搜索与链接阅读（`deepseek_web_search` / `deepseek_read_url`，由 DeepSeek API 提供）
- 文件上传与解析（Files API + 本地原件存储）
- 会话历史（多会话、重命名、删除、ZIP 导入导出）
- Markdown、代码高亮、KaTeX 公式、Mermaid
- 移动端响应式布局、输入法弹出适配、深色/浅色主题

### V0.2 新增并已测试

- 服务端：`APP_TOKEN` 令牌鉴权、CORS 预检支持（`pnpm test` 13/13 通过）
- 前端：应用内「服务器地址 + 访问令牌」配置、连接状态提示、运行时可切换服务器地址
- Capacitor 工程与 Android 返回键处理

### 尚未完成 / 需环境支持

- **APK 实际编译**：本机缺少 JDK + Android SDK，需先按 4.1 安装（代码与工程已就绪）。
- **云端部署**：需你本人选择一个云平台并填写密钥（未替你部署、未产生费用）。
- **真实 API 验证**：搜索、文件解析、语音等扩展能力需有余额的 DeepSeek 账户实测。
- 语音 ASR/TTS：保留代码，未实测。
- ML 交互可视化（梯度下降、神经网络等）：仅预留了 `VisualizationSlot` 接口，V0.2 未实现。

---

## 7. 本机环境注意事项

当前这台 Windows 电脑的 `Desktop` 目录**禁用了目录联接（junction）遍历**，导致 `pnpm` 无法正常工作（报 `untrusted mount point / os error 448`）。因此本项目在本机改用 **npm** 安装与构建：

- 依赖安装：`npm install`（已生成 `package-lock.json`）
- 构建：`npm run build` / `npm run build:android`

如果你想恢复用 `pnpm`，把项目移动到一个普通的本地目录（如 `C:\Users\你\edu-chat`，不要在 OneDrive 同步/受限目录里），或在「设置 → 隐私和安全性 → 开发者选项」开启开发者模式后重试 `pnpm install`。两种包管理器的锁文件（`pnpm-lock.yaml` 与 `package-lock.json`）都已同步 Capacitor 依赖。
