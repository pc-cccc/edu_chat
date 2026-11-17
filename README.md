# Edu_chat V0.2.1

基于 [DeepSeek 官方 chat-demo](https://github.com/deepseek-ai/chat-demo) 的个人聊天项目，**非 DeepSeek 官方产品**。React 18、TypeScript、Rspack 与 Capacitor Android，使用官方 demo 的 Anthropic 兼容 Messages / Files 协议。

本版已改为 **Serverless 0 成本架构**：前端托管在 Cloudflare Pages，聊天请求经 Cloudflare Worker 注入 DeepSeek 密钥，登录 / 历史 / 多人协作用 Supabase。旧的 Node 网关（`server/`）与 `Dockerfile` 已废弃保留。部署步骤见 [Serverless 部署指南](docs/SERVERLESS.md)。

本版移除首页学习入口、教育文案和个人教育助手提示，改为通用聊天。保留钥匙图标、会话历史、流式回答、深度思考、搜索、文件、Markdown 和数学公式界面。

> 尚未完成（下一步前端接线）：云端聊天历史（现为本地 IndexedDB）、多人实时协作 UI、学习组件勾选 UI；对应数据表与读写/订阅函数已就绪。

## 本地启动

需要 Node.js 22.12+，优先使用 npm。

```powershell
npm ci
Copy-Item .env.example .env
# 在自己的编辑器中填写 .env 的 DEEPSEEK_API_KEY
npm run dev
```

打开 http://127.0.0.1:8090 。密钥只在 Node 服务端读取；修改 .env 后重启。

无需密钥的演示：`npm run demo`，打开 http://127.0.0.1:8092 。它只返回固定测试样例，不调用真实 AI、搜索、文件或语音。

生产方式：`npm run build` 后 `npm start`，Node 同时提供页面与 `/api`，不能只发布 dist。`build:android` 与 `build` 都覆盖 dist；云端用 build，手机打包用 build:android。

```powershell
npm test
npm run type
npm run lint
```

## Android 与云端

见 [Android 指南](docs/ANDROID.md)。**仅安装 APK 不会自动获得云端服务；部署好云端后，电脑才能关机使用。**

在 App 点"设置服务器，开始聊天"，填写 HTTPS 地址与 APP_TOKEN。支持根域名或末尾带 /api 的地址；验证成功才保存，失败保留旧配置。切换服务器必须重新输入令牌；连接检查约 12 秒超时。

"已连接"只代表后端可访问且配置了密钥，不代表余额、模型与扩展能力已经验证。访问令牌保存在手机 WebView 本地存储，不打包在 APK 中；已关闭 Android 自动备份。

| 服务端变量 | 用途 |
| --- | --- |
| DEEPSEEK_API_KEY | 仅在服务端填写的 DeepSeek 密钥 |
| DEEPSEEK_API_ORIGIN | 默认 https://api.deepseek.com；修改会将密钥和消息发给新服务 |
| HOST / PORT | 默认 127.0.0.1 / 8090；容器监听 0.0.0.0 |
| PUBLIC_ORIGIN | 云端公开 HTTPS 地址，须与外部访问域名一致 |
| APP_TOKEN | App 访问令牌，至少 16 字符，建议随机 32 字节 |
| APP_USER / APP_PASSWORD | 可选的浏览器账号，密码至少 16 字符 |
| RATE_LIMIT_PER_MINUTE | 默认 60，全实例请求限制 |
| MAX_BODY_BYTES | 默认 33554432，即 32 MiB |

对外服务必须配置 HTTPS PUBLIC_ORIGIN，并至少配置令牌或浏览器账号之一。手机需要 APP_TOKEN；网页同时配置浏览器账号。只有令牌时，未认证网页请求会被拒绝。

HTTPS 反向代理须保留 Host、Origin、Authorization、x-app-token，关闭 SSE 缓冲，读取超时大于 180 秒；Node 端口不直接暴露公网。网关含接口白名单、鉴权、Host/跨站校验、全局限流、4 个并发上限、取消转发和错误脱敏。

这是个人单拥有者网关，没有多用户账户、按用户配额或云端历史同步。消息与文件发送到配置的 API 服务，由服务端密钥计费。

## Serverless 部署（0 成本，推荐）

不想要服务器/Docker 时，可用「Cloudflare Pages + Cloudflare Workers + Supabase」的纯免费架构：前端托管在 Pages，聊天请求经 Worker 注入 DeepSeek 密钥，登录/历史/多人协作用 Supabase。旧的 `server/` 与 `Dockerfile` 已不再使用。详见 [Serverless 部署指南](docs/SERVERLESS.md)。

构建命令：`npm run build:serverless`，需在构建环境设置 `WORKER_ORIGIN`、`SUPABASE_URL`、`SUPABASE_ANON_KEY` 三个变量。

## 数据与许可

历史在本地 IndexedDB，保留 zhixue-chat 命名空间以兼容旧数据。历史导入会替换现有会话，请先导出备份。详见[历史格式](src/services/chat/history/README.md)。

VisualizationSlot.tsx 是未接入页面的预留接口，本版没有教育功能或交互实验。个人浏览器直连构建仍保留，Android 使用服务端模式。

保留 [MIT LICENSE](LICENSE)、[NOTICE](NOTICE.md) 和[上游中文说明](docs/UPSTREAM.zh-CN.md)。基线为上游提交 5d5dd754ebc1948e977ddb880a9eb5aa25f37b4c，在 CodeBuddy V0.2 基础上修复。见[验证记录](docs/VERIFICATION.md)。本次未推送 GitHub，未部署公网服务。
