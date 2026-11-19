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
