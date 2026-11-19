# Edu_chat V0.2.2 Serverless 部署

前端：Cloudflare Pages；API：Cloudflare Worker；账号和历史：Supabase。旧 `server/`、Dockerfile 只保留用于旧版和本地演示。首次操作先看 [下一步](NEXT-STEPS.md)。

免费托管额度不等于免费模型调用。DeepSeek 按用量计费，免费云服务也有额度和限制；不要承诺永久零成本。先个人或少量受邀账号测试，不开放任意注册。Worker 内存限流不能作为可靠的费用上限。

## 1. 本地安装与建表

```powershell
npm ci
npm --prefix workers ci
npm run db:setup
```

Windows 建表入口隐藏输入 Supabase **Connect → Session pooler → URI（5432）** 和数据库密码，不保存到文件或命令历史。已有 `DATABASE_URL` 的自动化环境可用 `npm run db:apply`；只检查用 `npm run db:check`。如需项目 CA 证书，设置 `DATABASE_CA_CERT_PATH`；保持 TLS 证书校验开启。

脚本用一个事务应用 `supabase/schema.sql` 并核对七张表、RLS、三个触发器、Realtime 和文件写权限，失败回滚。可重复执行，不清空聊天。使用迁移工具的环境按文件顺序执行 `supabase/migrations/`；不要重写已应用的旧迁移。

`supabase/test-rls.sql` 仅是结构检查；真正的用户隔离还须用两个普通账号验证。本地 `npm test` 也会在内存 PostgreSQL 中执行两用户读写攻击测试，无真实账户或费用。

## 2. 部署 Worker

```powershell
cd workers
npm ci
npx wrangler login
```

修改 `wrangler.toml` 的公开变量：

| 变量 | 内容 |
| --- | --- |
| SUPABASE_URL | 项目 URL，例如 `https://ctthcqwnzmyijuemtwzi.supabase.co` |
| SUPABASE_ANON_KEY | Supabase publishable key 或 legacy anon public key |
| ALLOWED_ORIGINS | Pages 域名；多个用英文逗号分隔，不能写路径 |

以下密钥只在自己终端提示时输入，存到 Cloudflare Secret：

```powershell
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler deploy
```

第二个是 Supabase **legacy service_role key**，只用于 Worker 登记 / 删除文件归属。不要混用 publishable key；不要把管理密钥放进 Pages 构建变量、APK、`.env.serverless` 或 Git。未配这个 Secret 时聊天仍可用，上传 / 删除附件返回明确的 503。

JWKS 验证 ES256/RS256 用户 token，要求 iss/aud/exp/sub/role。老 HS256 项目可另设 `SUPABASE_JWT_SECRET`，新项目不需要。anon/service_role 不能作为 App 用户登录 token。

记下部署得到的 Worker HTTPS 根域名，不带 `/api`。Android 本地来源 `https://localhost` 已在 CORS 白名单。

## 3. 部署 Pages

连接现有 GitHub 仓库即可，无需新仓库。先把本轮修复提交并推送后再触发部署。

- 构建命令：`npm ci && npm run build:serverless`
- 输出目录：`dist`
- Node：22.12 或更高（项目有 `.nvmrc`）
- 构建变量：`WORKER_ORIGIN`、`SUPABASE_URL`、`SUPABASE_ANON_KEY`，全部是公开配置。

拿到 Pages 域名后，补进 Worker `ALLOWED_ORIGINS` 并重新部署；在 Supabase Authentication 的 URL Configuration 配置 Site URL / Redirect URLs。

个人测试时通过 Supabase 控制台邀请或创建自己的用户，然后关闭公开注册。保留邮箱确认流程；按控制台提示设置验证邮件与重定向。

## 4. 本地构建与 Android

```powershell
Copy-Item .env.serverless.example .env.serverless
# 用编辑器填写三个公开值，然后：
npm run build:serverless
# 手机目标：
npm run build:android:serverless
npm run android:sync
```

两个构建都会覆盖 `dist`；发布网页前重新构建网页版。公开变量会进入静态文件，所以构建脚本拒绝 service_role、secret key 和用户 token。

Android 编译及原签名位置见 [ANDROID.md](ANDROID.md)。旧 Node 版 APK 不能通过改服务器地址切换成 Serverless 版。

## 5. 上线前必须实际测试

1. Pages 登录 → 发消息 → 流式显示 → 停止。
2. 退出后重新登录、换浏览器同账号，历史仍能加载。
3. 第二个普通账号看不到第一个账号的数据；附件不能跨账号引用或删除。
4. 云端保存失败时不应误认为已跨设备同步；离线恢复、同步冲突和大历史仍需专项验收。
5. 深度思考、搜索、文件解析、语音依赖真实 DeepSeek 账户能力，需要逐项测试。
6. 安装新 APK，用移动网络聊天；关闭电脑后重复测试。

本地通过测试 / 构建不代表以上真实部署步骤已通过。记录见 [VERIFICATION.md](VERIFICATION.md)。
