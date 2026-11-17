# Edu_chat 0 成本 Serverless 部署指南

本指南把项目改成「纯前端 + 免费云服务」，**不需要服务器、不需要 Docker、0 元部署**：

- **前端页面** → Cloudflare Pages（免费，全球 CDN）
- **API 代理 + 密钥注入** → Cloudflare Workers（免费，每天 10 万次请求额度）
- **登录 / 聊天历史 / 组件配置 / 多人协作** → Supabase（免费额度）
- **DeepSeek 密钥** → 只放在 Worker 里，前端和 Supabase 都拿不到

> 旧的 `server/` 目录和 `Dockerfile` 已不再使用，但保留在仓库里（不影响部署）。本方案的聊天请求走「前端 → Worker → DeepSeek」。

---

## 0. 你需要准备 3 个账号（都免费）

| 服务 | 网址 | 用途 |
| --- | --- | --- |
| DeepSeek | https://platform.deepseek.com | 拿 API Key（会扣你 DeepSeek 余额，不是部署费） |
| Cloudflare | https://dash.cloudflare.com/sign-up | Pages 托管 + Worker |
| Supabase | https://supabase.com/dashboard | 登录 + 数据库 + 实时协作 |

---

## 1. 拿 DeepSeek API Key

1. 打开 https://platform.deepseek.com 登录。
2. 左侧 **API Keys** → **Create API Key**，复制 `sk-` 开头的字符串，先存到备忘录。
3. 这串密钥**只填到第 3 步的 Worker 里**，不要贴进聊天、不要写进代码或 Git。

---

## 2. 创建 Supabase 项目并建表

1. 打开 https://supabase.com/dashboard 登录（GitHub 或邮箱均可）。
2. 点 **New project**，填名字（如 `edu-chat`），设一个数据库密码（记好），地域选 `Southeast Asia (Singapore)` 或离你近的，**免费档**即可。
3. 进入项目后，左侧 **SQL Editor** → **New query**。
4. 打开本项目 `supabase/schema.sql`，**全选复制**，粘贴进编辑器，点 **Run**。
   - 这会创建 6 张表（profiles / chat_rooms / room_members / messages / user_preferences / presence）、行级安全策略、注册自动建资料触发器和 Realtime 发布。
5. 记下两样东西（都在左侧 **Project Settings → API**）：
   - **Project URL**：形如 `https://abcdefgh.supabase.co`
   - **anon public** 密钥：以 `eyJ...` 开头的那串（这是公开值，可出现在前端）
6. 再点 **Project Settings → API → JWT Settings**，复制 **JWT Secret**（很长的一串），这个只填到 Worker，别外泄。

> 可选：默认注册会发邮箱验证。若只是自己/家人用，可在 **Authentication → Providers → Email** 里把 **Confirm email** 关掉，省去收邮件步骤。

---

## 3. 部署 Cloudflare Worker（密钥注入层）

1. 打开 https://dash.cloudflare.com 登录。
2. 左侧 **Workers & Pages** → 点 **Create** → **Create Worker**，名字填 `edu-chat-worker`，点 **Deploy**（先随便部署一个默认示例）。
3. 部署后进入这个 Worker，点 **Edit code**（在线编辑器），把本项目 `workers/worker.js` 的内容**全选覆盖粘贴**进去，点 **Deploy**。
4. 回到 Worker 页面 → **Settings → Variables and Secrets**：
   - 在 **Secrets（加密）** 里点 **Add**，分两次添加：
     - 名字 `DEEPSEEK_API_KEY`，值 = 第 1 步的 `sk-...`
     - 名字 `SUPABASE_JWT_SECRET`，值 = 第 2 步的 JWT Secret
   - 在 **Variables（普通）** 里点 **Add**，加：
     - 名字 `ALLOWED_ORIGINS`，值 = 你的 Pages 域名（第 4 步会拿到，可先留空，部署完 Pages 再回来填）
5. 记下 Worker 的默认域名：`https://edu-chat-worker.<你的账号名>.workers.dev`，第 4 步要用。

> 也可以本地用 Wrangler CLI 部署，见文件 `workers/wrangler.toml` 顶部的注释。

---

## 4. 部署 Cloudflare Pages（前端页面）

1. 在 Cloudflare **Workers & Pages** 里点 **Create → Pages → Connect to Git**（推荐先把本仓库推到 GitHub/Gitee），或选择 **Direct Upload**（直接上传构建产物）。
2. 授权并选择本仓库后，填构建配置：
   - **Build command**：`npm ci && npm run build:serverless`
   - **Build output directory**：`dist`
   - 如果界面上能选 Node 版本，选 **22**；或项目根目录已有 `.nvmrc` 自动指定。
3. 在 **Environment variables** 里添加三个（都是公开值，不是密钥）：
   | 变量名 | 值 |
   | --- | --- |
   | `WORKER_ORIGIN` | 第 3 步的 Worker 域名，如 `https://edu-chat-worker.xxx.workers.dev` |
   | `SUPABASE_URL` | 第 2 步的 Project URL |
   | `SUPABASE_ANON_KEY` | 第 2 步的 anon public 密钥 |
4. 保存并部署。成功后你会得到一个 Pages 域名：`https://<项目名>.pages.dev`。
5. **回到第 3 步**，把 Worker 的 `ALLOWED_ORIGINS` 变量值改成这个 Pages 域名（有自定义域名就逗号分隔都填上）。

---

## 5. 验证

1. 浏览器打开你的 Pages 域名，应出现 **Edu_chat 登录页**。
2. 注册/登录一个邮箱账号（首次注册会写一条 profiles）。
3. 登录后发一条消息，看是否**流式**输出。再测：停止生成、深度思考、搜索、文件上传。
4. 打开另一个浏览器/手机用**另一个邮箱**登录，进同一聊天室，看消息是否实时同步（Realtime）。

---

## 6. 费用与免费额度（0 成本的边界）

| 服务 | 免费额度 | 什么时候开始花钱 |
| --- | --- | --- |
| Cloudflare Pages | 无限静态请求（合理使用） | 基本不花钱 |
| Cloudflare Workers | 每天 10 万次请求 | 超过后才按量计费 |
| Supabase | 2 个项目、500MB 数据库、5 万月活 | 超量后升级付费 |
| DeepSeek | 无免费额度 | **按聊天量扣你自己的 DeepSeek 余额** |

也就是说：**部署本身 0 元；只有你调用 DeepSeek 时，DeepSeek 会按用量扣费**（和原来一样）。

---

## 7. 已经做完 / 还差一步（前端集成进度）

本轮已完成并可直接部署的基础设施：

- ✅ `workers/worker.js`：完整的 DeepSeek 代理（Supabase 登录校验 + 注入密钥 + 流式转发 + 错误脱敏）。
- ✅ `supabase/schema.sql`：消息表、偏好表、房间/成员/在线状态表 + 行级安全 + Realtime。
- ✅ `src/services/supabase/client.ts`：supabase-js 客户端 + 登录/注册/退出 + 消息读写 + 偏好读写 + Realtime 订阅函数。
- ✅ 前端 API 层已切到 Worker（`src/services/api/client.ts`），登录态用 Supabase JWT 传给 Worker。
- ✅ 新增登录墙 `src/components/auth/AuthGate.tsx`（serverless 模式下先登录才能用）。

还需继续做（下一步前端接线，不影响先跑通聊天）：

- ⏳ 聊天历史目前仍是浏览器本地 IndexedDB；要改成 Supabase 云端历史，需把 `services/chat/store.ts` 的读写接到 `supabase/client.ts` 的 `listMessages/insertMessage`。
- ⏳ 多人协作的「在线状态/同一聊天室」UI 尚未画（数据表和 `subscribeRoom` 已就绪）。
- ⏳ 学习组件的勾选界面尚未画（`user_preferences` 表和读写函数已就绪，UI 是占位）。

这三项是纯前端接线，做完即可实现「云端历史 + 多人实时 + 组件配置」。
