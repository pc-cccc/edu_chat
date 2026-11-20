## 2026-11-20：V0.3 手机版（direct 模式）三阶段实测通过

手机版分支 `mobile`（GitHub 默认分支），基于 main（`b3b01bf`）；main 保留网页 serverless 版（次要维护）。当前版本 0.4.5 / versionCode 15。版本号统一以 package.json 为准，首页展示由构建注入。

### 已完成

- 复用项目已有的 direct 模式，未重写、未更换协议：仍走 DeepSeek 官方 Anthropic 兼容接口 `https://api.deepseek.com/anthropic/v1/messages`，`thinking`、`deepseek_web_search`、Files API 均按官方文档格式发送。
- 2026-11-20 实测 DeepSeek 的 CORS 预检对任意 Origin 返回 200（回显 `https://localhost`），因此 Capacitor WebView 直连无需中转服务器。
- 用户自己的 Key 只存本机：Android 走 `@aparajita/capacitor-secure-storage`（Keystore 加密），Web 端回退 localStorage；旧明文 `zhixue-chat:api-key` 首次启动自动迁移。APK 内未打包任何密钥。
- 首次打开（无 Key）显示配置引导；设置页可修改、清除 Key，界面仅显示掩码。
- Android 签名沿用原 debug.keystore，证书 SHA-256 `B817B132...FAC3`，与 V0.2.1 一致，可覆盖安装、无需卸载。
- 本地构建走 `toolchain\gradle` 缓存 + 阿里云镜像 init 脚本，规避 dl.google.com 国内超时。

### 用户真机实测通过（Android，真实 DeepSeek 账户）

| 项目 | 结论 |
|---|---|
| 填 Key、普通文本、流式回答、停止生成、断网提示 | 通过 |
| 覆盖安装后旧 Key 自动迁移、无需重填 | 通过 |
| 清除 Key、重新填写 | 通过（0.3.1 起） |
| 深度思考：出现思考过程块 + 答案 | 通过 |
| 智能搜索：出现「搜索到 N 个网页」卡片 + 引用回答 | 通过（需关闭深度思考；仅声明工具不保证触发，已由提示词引导） |
| 图片附件：描述准确 | 通过 |
| 文档附件：能正确总结文件内容 | 通过 |
| 语音输入：录音 → 转写 → 发送 | 通过（0.3.2 修复权限后） |
| 键盘不遮挡输入、返回键、杀进程重启后历史保留 | 通过 |
| 草稿重启恢复、发送后不残留 | 通过（0.3.3 修复） |
| 电脑关机后，手机分别用 Wi-Fi 与移动数据发送新消息 | 通过 |

### 本轮修复的问题

- 0.3.0 与 0.3.1 曾共用 versionCode，导致用户重装后仍运行旧包、看不到新入口。已改为每次递增 versionCode，并在首页显示版本号便于核对。
- 语音始终失败：`AndroidManifest.xml` 只声明了 `RECORD_AUDIO`。Capacitor 的 `onPermissionRequest` 会同时申请 `RECORD_AUDIO` 与 `MODIFY_AUDIO_SETTINGS`，**全部授予**才 grant；缺声明导致即便用户同意录音仍返回 `NotAllowedError`。已补齐两个权限，并在 APK 内用 `aapt2 dump permissions` 复核。
- 权限提示文案由「浏览器设置」改为「系统设置」，App 内无浏览器设置入口。
- 草稿原本只在页面内存中，重启即丢（0.3.3 修复）：草稿文本改为写入 localStorage，启动时读回；发送、清空会话时同步删除。附件含 File/Blob 无法轻量序列化，重启后附件不恢复、文本保留。

### 尚未验证

- 长对话流式中途停止（短消息停止已验证）。
- 会话新建 / 重命名 / 删除的完整手势路径。
- iOS 未构建；跨设备同步未做。

### 验证方式

- `npm test` 54/54、`npm run type` 0 错误、`npm run lint` 0 警告。
- APK 经 `apksigner verify` 校验签名；`aapt2 dump permissions` 确认权限列表。

---

## 2026-11-19 23:31：手机真实文本聊天通过（用户实测）

- 用户明确确认“收到实际回答”，并提供手机浏览器截图：发送“你好”后出现 AI 的完整文字回答，页面底部显示“已登录 · 聊天服务已连接”。由此将网页版基础文本聊天从待验证更新为通过。
- 依据为用户实测反馈和截图，不是本助手代登录测试；此前要求保持不开代理进行复测，截图本身不能单独验证设备代理设置。
- 此结果验证本次手机浏览器下的登录态、聊天请求与实际回答链路。不能据此宣布所有网络、所有浏览器或所有功能通过。
- 尚待验证：电脑关机后通过手机移动网络继续发送新消息；刷新 / 重新登录 / 跨设备历史；逐字流式与停止；深度思考、联网搜索、附件、语音，以及新版 APK。
- 本轮连接修复和诊断代码已发布至 Pages，并已提交推送 GitHub：密钥/配置修复为提交 `372d84c`，同源中转与 README 更新为提交 `76a46f9`。以下条目保留排查过程，遇到“真实聊天仍未通过”等旧表述，以本条最新结论为准。
- 2026-11-19 23:5x 复核线上中转（本机经代理实测）：`/` 200 且不带 `X-Edu-Relay`（静态直达）；`/api/health` 200 且带 `X-Edu-Relay: 1`，返回 `{"ok":true,"service":"edu-chat-worker"}`；`/supabase/auth/v1/settings` 200；白名单外路径 `/supabase/rest/v1/rpc/x` 返回 404「接口不存在」。证明线上跑的就是中转版本，且白名单在线上生效。

---
## 手机健康检查与诊断更新

- 用户在手机浏览器打开 `/api/health`，报告返回 `{"ok":true,"service":"edu-chat-worker"}`：手机到 Pages 再到 Worker 的健康检查已通过；真实聊天仍未通过。
- 本轮仅监听脱敏请求路径、状态码、CPU 和异常名称，未输出 JWT / 请求头 / 消息正文。监听窗口内见健康检查 GET，未捕获新的聊天 POST，不能据此断定发送失败的唯一原因。
- 增加登录状态读取的 12 秒超时与取消，避免卡在获取会话阶段时请求永不发出；没有登录凭据时按 401 处理，不再混为网络错误。Supabase 会话读取错误不再忽略。
- 连接状态显示 HTTP 状态码及服务端错误摘要；超时显示 T12，未收到响应显示 NET。用于分辨问题，不代表已解决真实用户聊天。
- 54/54 回归测试、type、lint、build:serverless 通过。新部署 ID `ac3843c8`，主域名的 main.0410897f.js 与本地构建一致。
- 原 dsh 修改现已存在于提交 372d84c；本轮转发与诊断修改仍在工作区，未由本助手提交或推送。需用户在同一手机浏览器发送真实消息并提供新错误结果。

---
## 2026-11-19 晚间：手机直连网页修复（已发布）

- 生产网址仍为 https://edu-chat-9yt.pages.dev ，部署 ID `3abc7cb1`。
- 对比实测：本机不使用代理时 Pages 200、Worker 连接超时、Supabase ECONNRESET；使用现有代理后二者均 200。用户手机未开代理，截图显示多条消息“网络异常”。这支持域名可达性问题，但不等于已完成手机网络验收。
- 新增 `pages/relay.mjs`。Web 请求改为同源 `/api/*`（聊天）和 `/supabase/auth/v1/*` / `/supabase/rest/v1/*`（登录、历史）；Pages 在云端转发到构建时固定的两个后端。鉴权、RLS、DeepSeek Secret 的存放位置不变。仅转发限定接口和请求头，不转发 cookies、不提供任意 URL 或 admin/RPC 代理；拒绝跟随重定向。SSE 保持流式。
- 不改变 Supabase 客户端的项目 URL / storage key，只替换 HTTP transport，现有登录记录可以继续使用。JWT 仍由原 Supabase 项目签发 / 校验。
- Web 构建额外产出 `dist/_worker.js` 与 `_routes.json`；页面 / 静态资源不触发函数，只有 API 路由触发。必须通过 Wrangler 或 Git 构建完整部署目录，不能只手工上传 JS/CSS。Pages Functions 会使用 Workers 额度，不保证永久免费或所有地区网络可达。
- “已登录”之外新增实际 `/models` 检查与重试入口，区分登录成功和聊天后端连接成功。未把 DeepSeek Key 放进前端；未修改后端 Secret。
- 51/51 测试通过，类型 / lint / 网页构建通过。新增测试覆盖同源聊天流式传输、鉴权错误、登录/历史请求、头部清理、路径白名单、重定向拒绝、取消、Web/Android transport 差异。
- 部署后本机不开代理检查：`/` 200、`/api/health` 200、`/supabase/auth/v1/settings` 200；无 JWT 的 `/api/models`、POST `/api/anthropic/v1/messages`、历史读取均 401。后三者证明请求到达且仍鉴权，不代表有效用户真实聊天已经通过。
- 尚待用户手机真实消息反馈，尚未验证真实模型回复、余额、联网搜索、附件、语音。没有提交或推送本轮源码修改；保留此前 dsh 的 4 处未提交改动。
- 适用范围：网页版。Android 构建仍直连配置的后端，需要另行配置可达入口后再出包；Realtime WebSocket 仍使用原 Supabase 地址（当前无多人 UI），未作此链路改造。

---

# 当前验证记录：2026-11-19，V0.2.2 修复

修改位置：桌面 `edu-chat-v0.2.1`，基线 Git HEAD `7fbe16b`。保留用户原有未提交的带函数版 schema，未提交 / 推送本轮修改。以下旧日期记录仅供追溯，当前步骤以 `NEXT-STEPS.md` 为准。

## 本轮已验证

- Node 26.13.0；`npm run type`、`npm run lint` 通过，0 错误 / 0 警告。
- `npm test`：45/45 通过。旧网关测试保留；新增建表、账号绑定、云端操作排序、构建配置、Worker 验签 / 文件权限 / 取消等回归用例。
- PGlite（内存 PostgreSQL）实际执行 schema：首次 / 重复应用、旧迁移升级保留会话、失败整笔回滚、触发器 / Realtime publication。模拟 Supabase auth.uid 和角色，在 authenticated / anon / service_role 身份下执行读写，覆盖跨用户读取、插入、移动消息、伪造文件归属、转移房主、越权 presence。
- Worker 在 Node 测试环境验证真实 ES256 / RS256 签名及本地 HTTP JWKS 缓存；拒绝缺 exp 的 token；模拟 DeepSeek / REST 验证后端写文件归属和流式取消。没有调用真实 DeepSeek。
- 网页 / Android 前端构建成功：`build:serverless`、`build:android:serverless`。使用 `.invalid` 测试域名及明确的测试公开 key，**dist 是验证产物，不可直接发布**。请填真实公开配置后重新构建。
- 找到 JDK21 / SDK / Gradle；读取原 debug.keystore 的证书，SHA-256 为 `B817B132F20B7190B52F86CEBACEB53E859636B129950935108E7627B794FAC3`，与原 V0.2.1 调试签名一致。本轮未重新生成签名。
- npm 锁文件与 pnpm 锁文件已同步；新增 Worker 本地秘密文件的忽略规则。

## 本轮未验证 / 待完成

- 本机没有 DATABASE_URL / 实际云端公开配置。本轮没有连接真实 Supabase、应用远程建表、部署 Cloudflare 或创建任何费用资源。
- 没有制作新的真实联网 APK、没有真机验收。此前 V0.2.1 APK 仍是 Node 网关版。
- 本地角色测试不能替代 Supabase 真实 API / RLS 两账号联调；Node Worker 测试不能替代 Cloudflare 实际运行。
- 账号切换的整个 UI 已增加隔离等待状态，但未做浏览器端自动化、真机或跨设备端到端验收。
- 当前同步仍非完整离线 outbox：离线失败重试、多个设备同时编辑、长列表超过服务端分页上限、全量导入 / 清空历史的云端语义需后续专项完善。本轮主要修复账号凭据绑定及同一会话保存 / 删除的先后顺序。
- npm audit 报告 12 项依赖告警（2 low / 8 high / 2 critical），涉及 Mermaid 依赖、KaTeX、开发格式化工具及其依赖；本轮未执行可能带来兼容变化的批量升级。对外分发前需升级并回归 Markdown / 图表渲染。

## 实现依据

- [Supabase 数据库连接](https://supabase.com/docs/guides/database/connecting-to-postgres)：使用 Session pooler 连接进行本机管理操作。
- [node-postgres TLS](https://node-postgres.com/features/ssl)：连接串中的 SSL 参数可能覆盖显式 ssl 配置；建表脚本统一移除这些参数并保持证书验证，可指定 CA。
- [PGlite](https://pglite.dev/docs/)：在本地运行 PostgreSQL 引擎测试，不依赖真实云端凭据。

---

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

## 2026-11-18 第二轮：Worker 鉴权 / 数据库权限 / 账号隔离 / 云端历史 / 安卓构建

按 7 阶段执行，基线 f057b35。版本升至 0.2.2（versionCode 3）。

### 已完成

- Worker 重写（`workers/worker.js`）：改用 `jose` + Supabase JWKS 校验真实用户 token（ES256/RS256，旧 HS256 回退），校验 iss/aud/role/sub/exp，拒绝 anon/service_role；所有响应统一 CORS；流式手动泵流 + 超时/客户端断开传播；文件上传/引用/删除归属校验（经 Supabase files 表 + PostgREST）。新增 `workers/package.json` 依赖 jose。
- 数据库重写（`supabase/schema.sql`）：`is_room_member` SECURITY DEFINER 消除 RLS 递归；消除列名歧义；房主自动入会触发器；`messages.user_id` 默认 auth.uid()；messages 改为 `data jsonb` 完整消息 + 稳定 id/parent_id/created_at；新增 `files` 归属表；会话 CRUD 权限；幂等迁移与 Realtime 发布幂等。
- 账号隔离：`db.ts` 按用户分库、`store.ts` 新增 `resetChatForUser`、`App.tsx` 用户切换联动。
- 个人云端历史：新增 `src/services/chat/cloudSync.ts`（稳定 ID、幂等 upsert、分页、分支/思考/状态全保留）；`store.ts` 落盘同步、启动云端优先、改名/删除同步、失败 toast。
- 安卓 serverless 构建：新增 `build:android:serverless` 脚本与构建变量校验（缺失即报错）；版本 0.2.2 / versionCode 3。
- 测试：新增 `tests/worker.test.mjs`（鉴权拒 anon/service_role/过期、接受真实用户、CORS、预检）。`npm test` 26/26 通过；`npm run type`、`npm run lint`、`npm run build:serverless` 均通过。
- 文档：更新 `docs/SERVERLESS.md`，新增 `supabase/test-rls.sql`（RLS 自检 + 两用户手动隔离步骤）。

### 阻塞 / 待办（需账号或工具链）

- 未实际部署到 Cloudflare/Supabase，未用真实 DeepSeek 密钥联调；数据库 RLS 两用户隔离、账号切换、云端跨设备保存均待真实环境验收。
- APK 无法在本机构建：本机无 Android 工具链（JDK21/SDK），且**原调试签名 debug.keystore 不在本机**（work/toolchain 缺失，全盘搜索未找到）。覆盖安装需找回原 keystore；否则需新签名并先卸载旧包。
