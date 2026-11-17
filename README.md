# Edu_chat V0.1

基于 [DeepSeek 官方 chat-demo](https://github.com/deepseek-ai/chat-demo) 实际源码开发的个人教育聊天项目。**非 DeepSeek 官方产品**。保留聊天体验，增加独立品牌、学习提示、服务端密钥代理、本地演示与未来可视化组件接口。

## 启动

需要 Node.js 22.12+ 和 pnpm。命令可在 Windows、macOS、Linux 使用。

```sh
pnpm install --frozen-lockfile
pnpm demo
```

打开 **http://127.0.0.1:8092/**。无需密钥，不调用外部 AI。任何问题均返回固定中文示例，用于体验流式回答、思考面板、Markdown、公式和会话历史。搜索不会执行；文件和语音返回不支持提示。演示与正常模式分端口运行，本地历史互不混用。

### 真实 API（推荐）

1. 复制 `.env.example` 为 `.env`，PowerShell 可执行 `Copy-Item .env.example .env`。
2. 用自己的编辑器填写 `DEEPSEEK_API_KEY`，不要把密钥提交到 Git。
3. 执行 `pnpm dev`，打开 **http://127.0.0.1:8090/**。

密钥仅在 Node 服务端读取，不注入前端，也不写入浏览器存储。未配置时可浏览页面，发送会明确提示缺少配置。更改 .env 后需重启。开发代理监听本机 8091；请使用打印出的 127.0.0.1 地址，来源校验按此地址设置。

```sh
pnpm type
pnpm test
pnpm build
pnpm start
```

先停止占用 8090 的开发服务，再运行 `pnpm start`。它同时提供 dist 页面和 /api 服务。**默认构建不可只上传静态文件或双击 index.html 后期待 API 正常工作**。Ctrl+C 停止服务。

### 个人浏览器直连（上游方式）

`pnpm dev:direct` 在 8090 启动；「设置 → 数据管理」填写个人 API Key，校验后保存在浏览器 localStorage，浏览器直接请求 https://api.deepseek.com，受跨域限制。该模式不读取 .env。

`pnpm build:direct` 输出纯静态版本到 dist，会覆盖服务端版构建；回到服务端版请重新 `pnpm build`。直接打开 dist/index.html 还受 file:// 存储、CORS 和浏览器 API 限制，推荐本机 HTTP 服务。不要在公共页面预置自己的密钥，不建议在共享电脑使用直连模式。清除此站点本地存储可移除保存的密钥，但不撤销供应商密钥。

## 实际技术栈与功能边界

上游提交：`5d5dd754ebc1948e977ddb880a9eb5aa25f37b4c`，2026-11-17 克隆。React 18.3.1、TypeScript 7.0.2、Rspack 2.0.2、Zustand、IndexedDB；沿用上游依赖锁文件。

聊天使用上游默认 `deepseek-flash` 模型，采用 **Anthropic 兼容 Messages / Files 协议**，不是 OpenAI /chat/completions。以下是代码保留的能力，不代表已通过真实 API 验证。

| 功能 | 实现与限制 |
| --- | --- |
| 聊天、流式响应 | SSE、停止、符合条件的继续生成、编辑提问、重新生成和消息分支 |
| 深度思考 | thinking 开关与折叠面板；真实内容由 API 提供 |
| 搜索、链接阅读 | deepseek_web_search / deepseek_read_url、来源引用与结果面板；不是浏览器自行检索 |
| 文件输入 | 选择、粘贴、拖放、Files API 上传及本地原件存储；支持格式由服务端校验 |
| 会话历史 | 多会话、重命名、删除、ZIP 导入导出；本机保存，无跨设备同步 |
| 内容渲染 | Markdown、Prism 代码高亮、KaTeX、Mermaid |
| 界面 | 响应式、中英双语、浅色/深色主题，新增三组学习提问入口 |
| 语音 | 保留 ASR/TTS，需要服务支持和浏览器授权，本次未实测 |
| ML 交互可视化 | 仅预留组件类型与注册接口，V0.1 未实现 ML 实验 |

请求沿用 safety_check、title、latest_reminder 等上游扩展，代理原样转发，不能替换成任意“兼容 API”就保证工作。文件与搜索等扩展的组合可能被上游拒绝，参见 src/services/api/types.ts 及上游 API 文档。「服务端已配置密钥」仅说明配置存在，不证明鉴权、余额和每项服务能力已通过验证。

## 个人使用与公共部署

默认只监听 127.0.0.1，适合个人自用。对外提供**受保护的单拥有者实例**时：

1. 运行服务端版 `pnpm build`，用 HTTPS 反向代理连接 `pnpm start`。
2. 设置 `PUBLIC_ORIGIN=https://你的域名`、`APP_USER`、至少 16 字符的随机 `APP_PASSWORD`，服务端保存 API key。
3. 推荐 Node 仍绑定 127.0.0.1；容器确有需要才用 HOST=0.0.0.0。公网 HTTPS origin 或非回环绑定都会强制检查访问凭据。
4. 代理保留 Host、Authorization、Origin；关闭 SSE 缓冲，读取超时大于 180 秒，上传限制与应用匹配。Node 端口不可直接暴露在公网；HTTPS 由反向代理终止。

整站与 API 使用 HTTP Basic 访问鉴权。浏览器填写的是站点账号，**不是供应商 API key**。浏览器可能缓存登录，无站内注册、退出或密钥轮换界面。

内置固定接口白名单、Host/跨站校验、全实例每分钟 60 次 API 请求、4 个并发请求、32 MiB 请求限制、180 秒上游超时、断开取消和错误正文脱敏。限流为单进程内存，重启重置；上传在内存缓冲，不适合大规模文件处理。

**不是面向学生的多用户平台。** 开放注册或收费前，还需独立账户、用户配额、文件所有权隔离、费用控制、监控、备份和正式安全审查。不要把同一个访问账号分发给大量陌生用户。上传文件和消息会交给配置的 API 服务，费用由其密钥承担。当前不做服务端会话存储；同一浏览器配置的使用者可看到已有本地历史。

## 配置

| 配置 | 默认 / 用途 |
| --- | --- |
| DEEPSEEK_API_KEY | 空；只供服务端读取 |
| DEEPSEEK_API_ORIGIN | https://api.deepseek.com；只能是无路径、无凭据的可信 HTTPS origin |
| HOST / PORT | 127.0.0.1 / 8090，用于 pnpm start |
| PUBLIC_ORIGIN | 对外访问的唯一 HTTPS origin；开发模式由脚本固定 |
| APP_USER / APP_PASSWORD | 对外服务必填；开发服务仅限本机，不启用站点登录 |
| RATE_LIMIT_PER_MINUTE | 默认 60，全实例 API 请求限制 |
| MAX_BODY_BYTES | 默认 33554432，即 32 MiB |

更换 API origin 会将密钥与消息发送给该服务，只能配置自己信任的地址。代码不记录消息正文或密钥，宿主和反向代理日志策略仍需自行配置。成功的响应流按协议原样转发。

## 数据与扩展

本地存储使用独立的 zhixue-chat 命名空间，不自动读取官方 demo 数据。可以通过上游历史工具迁移；**导入会替换当前站点全部会话**，操作前先备份。ZIP 导出包含会话与可用图片原件，不包含密钥、设置或非图片附件原件，详见 [历史格式](src/services/chat/history/README.md)。删除本地会话不代表删除 API 服务上的文件。

`src/components/education/VisualizationSlot.tsx` 预留 version、kind、title、parameters 与 onAsk 协议，通过 registry 注册可信组件。当前没有接入消息渲染，没有注册 ML 实验；下一阶段需添加参数校验及数据绑定，禁止执行模型输出的任意 JavaScript。

## 验证与许可

见 [验证记录](docs/VERIFICATION.md)。真实模型、搜索与文件解析仍需有权限和余额的 API 账户验证。

[MIT LICENSE](LICENSE) 和版权声明原样保留，修改同样采用 MIT。分发时保留 LICENSE、NOTICE.md；第三方依赖遵循各自许可。上游中文 README 备份在 [docs/UPSTREAM.zh-CN.md](docs/UPSTREAM.zh-CN.md)。

未推送任何远程仓库，未部署公网服务。
