# Edu_chat 0 成本 Serverless 部署指南（V0.2.2）

架构：**纯前端 + 免费云服务**，不需要服务器 / Docker：

- **前端页面** → Cloudflare Pages（免费 CDN）
- **API 代理 + 密钥注入 + 鉴权 + 文件归属** → Cloudflare Workers（免费）
- **登录 / 云端历史 / 文件归属** → Supabase（免费额度）
- **DeepSeek 密钥** → 只放在 Worker 的 Secret 里，前端与 Supabase 都拿不到

> 旧的 `server/` 与 `Dockerfile` 已废弃保留。Worker 用 `jose` 通过 Supabase 的 JWKS 校验真实用户 token（拒绝 anon/service_role），因此**必须用 wrangler CLI 部署**（在线编辑器无法打包 npm 依赖）。

---

## 0. 准备 3 个免费账号

| 服务 | 网址 | 用途 |
| --- | --- | --- |
| DeepSeek | https://platform.deepseek.com | 拿 API Key（扣你 DeepSeek 余额，不是部署费） |
| Cloudflare | https://dash.cloudflare.com/sign-up | Pages + Worker |
| Supabase | https://supabase.com/dashboard | 登录 + 数据库 + 文件归属 |

## 1. 拿 DeepSeek API Key

https://platform.deepseek.com → 登录 → 左侧 **API Keys** → **Create**，复制 `sk-` 开头字符串，存到备忘录。**只填到第 3 步 Worker**，不贴聊天、不进代码/Git。

## 2. 建 Supabase 项目并执行 SQL

1. https://supabase.com/dashboard 登录 → **New project**（名字如 `edu-chat`，设数据库密码，免费档）。
2. 左侧 **SQL Editor** → **New query** → 把 `supabase/schema.sql` 整段粘贴 → **Run**。
3. 再执行 `supabase/test-rls.sql`（自检脚本，确认 RLS/策略/Realtime 已生效）。
4. 记录三样（**Project Settings → API**）：
   - **Project URL**：`https://xxxx.supabase.co`
   - **anon public** 密钥：`eyJ...`（公开值）
   - **JWT Secret**（旧项目回退才需要；新项目用 JWKS，可不管）
5. **Authentication → URL Configuration**：把 **Site URL** 和 **Redirect URLs** 都加上你的 Pages 域名（第 4 步会拿到，可先留空回头补），本地调试加 `http://localhost:8090`。
6. 个人自用可在 **Authentication → Providers → Email** 里关闭 **Confirm email**，省去收验证邮件。

## 3. 部署 Worker（密钥注入 + 鉴权）

在项目根目录 PowerShell：

```powershell
cd workers
npm install
npx wrangler login          # 会打开浏览器登录 Cloudflare
```

编辑 `workers/wrangler.toml` 的 `[vars]`，把占位符换成真实值：
- `ALLOWED_ORIGINS` = Pages 域名（第 4 步拿到后补，可先留空）
- `SUPABASE_URL` = 第 2 步的 Project URL
- `SUPABASE_ANON_KEY` = 第 2 步的 anon public 密钥

设置密钥（只进 Cloudflare，不进文件/Git）：

```powershell
npx wrangler secret put DEEPSEEK_API_KEY   # 粘贴你的 sk-...
```

部署：

```powershell
npx wrangler deploy
```

记下 Worker 域名：`https://edu-chat-worker.<你的账号>.workers.dev`。

> `SUPABASE_JWT_SECRET` 只在老项目用 HS256 签名时才需要；新项目用户 token 是 ES256，通过 JWKS 校验，无需此 Secret。

## 4. 部署 Pages（前端）

1. Cloudflare **Workers & Pages → Create → Pages → Connect to Git**（推荐先把仓库推到 GitHub），或 **Direct Upload**。
2. 构建配置：
   - **Build command**：`npm ci && npm run build:serverless`
   - **Output directory**：`dist`
   - Node 版本选 **22**（项目根有 `.nvmrc` 自动指定）
3. **Environment variables**（构建期变量，都是公开值）：
   | 变量 | 值 |
   | --- | --- |
   | `WORKER_ORIGIN` | 第 3 步 Worker 域名 |
   | `SUPABASE_URL` | 第 2 步 Project URL |
   | `SUPABASE_ANON_KEY` | 第 2 步 anon public 密钥 |
4. 部署成功后拿到 `https://<项目>.pages.dev`，回到第 2、3 步补上 Site URL / Redirect URLs / ALLOWED_ORIGINS。

## 5. 验证（务必真实走通，别只看"构建成功"）

1. 打开 Pages 域名 → 出现 **Edu_chat 登录页** → 注册/登录一个邮箱账号。
2. 发消息 → **逐字流式输出** → 点「停止生成」能立即停下。
3. 退出登录 → 聊天列表清空；重新登录 → **云端历史**回到列表。
4. 换一个浏览器 / 无痕窗口用**另一个邮箱**登录 → 看不到第一个账号的任何会话。
5. 让登录 token 过期（或手动删掉本地会话）→ 再发消息应提示重新登录，而不是报错卡死。

## 6. 费用与免费额度（0 成本的边界）

| 服务 | 免费额度 | 什么时候花钱 |
| --- | --- | --- |
| Cloudflare Pages | 静态请求免费（合理使用） | 基本不花钱 |
| Cloudflare Workers | 每天 10 万次请求 | 超过后按量 |
| Supabase | 2 个项目、500MB 库、5 万月活 | 超量升级 |
| DeepSeek | 无免费额度 | **按聊天量扣你自己的余额** |

**部署本身 0 元；只有调用 DeepSeek 时按量扣费。**

## 7. 已完成 / 待办

已完成（V0.2.2）：
- Worker：JWKS 校验真实用户（拒 anon/service_role）+ 全响应 CORS + 流式超时/取消 + 文件归属。
- 数据库：会话/消息/文件归属表 + 无递归 RLS + 房主自动入会 + 幂等迁移。
- 前端：邮箱登录、账号隔离（本地缓存按用户分区、切换即清理）、个人云端历史（稳定 ID、幂等 upsert、分页、分支/思考/状态全保留）。

仍待办：
- 多人共享聊天室 UI、学习组件勾选 UI（数据表已就绪，本轮未做 UI）。
- 真机 APK 构建与安装（见 ANDROID 指南；需 Android 工具链与签名）。

未验证（需账号/真机）：
- 未实际创建 Cloudflare/Supabase 项目、未用真实 DeepSeek 密钥联调。
- 未做真机、移动网络、电脑关机后的独立验证。
