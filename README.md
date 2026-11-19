# Edu_chat V0.2.2

基于 [DeepSeek 官方 chat-demo](https://github.com/deepseek-ai/chat-demo) 的个人通用聊天项目，**非 DeepSeek 官方产品**。保留钥匙图标；不包含教育首页入口或个人教育助手提示。

React 18 + TypeScript + Rspack + Capacitor Android。保留聊天、流式回答、深度思考、搜索、文件、Markdown / 数学公式界面；使用上游 demo 的 Anthropic 兼容 Messages / Files 协议。扩展能力需要用真实账户逐项验证。

## 当前推荐架构

- Cloudflare Pages：网页。
- Cloudflare Worker：验证用户身份、注入 DeepSeek 密钥、转发请求。
- Supabase：邮箱登录、个人云端历史、文件归属。
- Android：同一前端构建为可安装 App，连接云端。

托管可使用免费额度，DeepSeek 调用仍按量计费。暂不做教育组件或多人聊天室 UI。旧 `server/`、Dockerfile 保留，不用于当前 Serverless 部署。

**第一次部署：先读 [现在的下一步](docs/NEXT-STEPS.md)**，再按 [Serverless 部署指南](docs/SERVERLESS.md) 操作。新旧 APK 的区别与打包见 [Android 指南](docs/ANDROID.md)。

## 安装、检查、构建

Node.js 22.12+，Windows 优先 npm：

```powershell
npm ci
npm --prefix workers ci
npm run type
npm run lint
npm test
```

Windows 隐藏输入建表：`npm run db:setup`。不要把数据库密码或连接串发到聊天、提交到 Git。

```powershell
Copy-Item .env.serverless.example .env.serverless
# 在编辑器填写三个公开配置
npm run build:serverless
# Android 使用 npm run build:android:serverless
```

只有 Worker Secret 存 DeepSeek Key 和用于文件登记的 Supabase service_role key；前端只能填写 publishable / anon public key。`build:serverless` 和 `build:android:serverless` 都会覆盖 `dist`。

无需云端的界面演示：`npm run demo`，访问 `http://127.0.0.1:8092`。这是固定样例，不调用真实模型。旧 `dev` / `build` / `start` 脚本仍属于 Node 网关模式，不能用于当前 Pages 部署。

## 数据与许可

Serverless 登录账号使用各自本地缓存和云端历史；旧 `zhixue-chat` 本地数据保留，不会自动归入新账号。导入 / 导出格式见 [历史格式](src/services/chat/history/README.md)。跨设备并发编辑、离线同步和真实云端部署仍需验收，详情见 [验证记录](docs/VERIFICATION.md)。

`VisualizationSlot.tsx` 仅为未来接口预留，没有加入聊天界面。

保留上游 MIT 许可，见 [LICENSE](LICENSE)。项目名称和图标为个人项目标识，不冒充 DeepSeek 官方应用。
