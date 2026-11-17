# V0.2.1 验证记录

日期：2026-11-17，Windows，本次在 CodeBuddy V0.2 副本上开发，未改桌面原目录。

## 已验证

- npm ci 安装成功；npm run type、npm run lint 通过（0 错误、0 警告）。
- npm test：19/19 通过，覆盖 SSE 转发与取消、密钥隔离、鉴权、限流、文件转发、URL 规范化、阻止跨服务器复用令牌、错误响应 CORS 和预检边界。
- npm run build 与 npm run build:android 都成功；Capacitor Android 同步成功。
- JDK 21.0.13、SDK Platform 36、Gradle 8.14.3 实际执行 assembleDebug 成功。Gradle 自动选用 Build Tools 35.0.0；36.0.0 用于包校验。
- 最终 APK 已用 apksigner verify 校验通过（v2 签名，RSA 2048，Android Debug 证书）。不是 release 商店包。
- 浏览器中检查手机窄屏首页：无学习入口或教育文案，有钥匙图标、通用问候、聊天输入和首次连接入口。DOM 无水平溢出。
- 设置页验证空地址、HTTP 地址的错误提示；关闭重开后错误配置未保存。
- Android 包名 com.educhat.app，版本 0.2.1、versionCode 2，minSdk 24、targetSdk 36。
- DeepSeek 密钥未写入前端、APK 或源码包；本次未使用真实密钥。

APK SHA-256：F45617C2837BC0F560D0157FF86686AE2CD0849FD87CA2768E1E98BDDEB3F6AF

## 尚未验证

- 未在手机真机安装或运行；键盘、返回键、附件选择、语音权限、后台恢复待真机验收。
- 未部署云端，未验证电脑关机后使用。需要用户自己的 HTTPS 服务和私密配置。
- 未调用真实 DeepSeek 账户，聊天、深度思考、搜索、文件解析、语音能力与余额仍待真实联调。
- Dockerfile 已保留，未在本机运行 Docker 镜像。

构建日志中的 flatDir、SDK XML 版本差异、Java unchecked 与中文路径检查参数警告来自原生工具链，未阻止编译。源代码检查和 APK 签名检查均通过。

## 2026-11-18 云端部署（进行中）

本轮目标：把后端部署到 HTTPS 云端，让手机脱离电脑独立聊天（不增加教育功能、不改界面）。

### 已完成

- 复核源码与部署配置：`npm run type`、`npm run test`（19/19）、`npm run lint` 全部通过（0 错误 0 警告）。
- 确认 Node 网关 `server/index.mjs` 与 Anthropic 兼容 Messages/Files 协议未改动，`Dockerfile` 可直接用于容器部署。
- 确认 App 已在 server 模式支持「填地址 + 访问令牌」，本次云端部署无需重新打包 APK。
- 选定腾讯云 CloudBase「云托管」作为云端方案，新增部署指南 `docs/CLOUDBASE.md`。

### 环境差异（需注意）

- 本机未找到指南所述 `../../work/toolchain` 工具链（JDK21/Android SDK/调试签名）与 APK 文件；云端部署不依赖它们，仅影响以后重新打包 APK。

### 尚未验证 / 待办

- 未在腾讯云开通环境并部署（需用户登录与开通）。
- 未填写真实 DeepSeek 密钥，未验证真实聊天、流式、停止、深度思考、搜索、文件、语音。
- 未做手机真机、移动网络、关机独立测试。

## 2026-11-18 Serverless 重构（Cloudflare + Supabase）

用户改为放弃服务器+Docker，改用 0 成本 Serverless 架构。本轮交付：

### 已完成

- 新增 Cloudflare Worker `workers/worker.js`：Supabase JWT 鉴权（HS256）+ 注入 DeepSeek Key + 流式转发 + 错误脱敏 + CORS + 路由白名单；配 `workers/wrangler.toml`。
- 新增 `supabase/schema.sql`：profiles / chat_rooms / room_members / messages / user_preferences / presence 六表 + RLS + 注册触发器 + Realtime 发布。
- 前端接入 supabase-js：新增 `src/services/supabase/client.ts`（客户端 + 登录/注册/退出 + 消息/偏好读写 + Realtime 订阅）。
- 前端 API 层切换：`src/services/api/client.ts` 的 `apiOrigin()` 与 `request()` 支持 serverless 模式（请求发 Worker、携带 Supabase JWT）。
- 新增登录墙 `src/components/auth/AuthGate.tsx`，并在 `App.tsx`、`ConnectionStatus.tsx`、`ApiKeyField.tsx` 接入 serverless 分支。
- 构建支持：`scripts/build.mjs` 支持 `--serverless`；`rspack.config.ts` 注入 `WORKER_ORIGIN` / `SUPABASE_URL` / `SUPABASE_ANON_KEY`；新增 `build:serverless` 脚本与 `.nvmrc`。
- 新增部署指南 `docs/SERVERLESS.md`。
- 校验通过：`npm run type`、`npm run lint`（0 错 0 警）、`npm test`（19/19）、`npm run build:serverless` 打包成功；`@supabase/supabase-js@2` 已安装并锁定。

### 尚未验证 / 待办

- 未实际创建 Cloudflare/Supabase 项目部署，未用真实 DeepSeek 密钥联调（需用户账号）。
- 聊天历史仍为本地 IndexedDB，尚未接到 Supabase messages 表（`store.ts` 待接 `listMessages/insertMessage`）。
- 多人协作在线状态、同一聊天室、组件勾选的 UI 尚未实现（表与订阅/读写函数已就绪）。
