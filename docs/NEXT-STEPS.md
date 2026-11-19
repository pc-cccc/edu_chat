# 现在从哪里继续（2026-11-19）

最新版仍在桌面 `edu-chat-v0.2.1` 文件夹，内部版本是 0.2.2。继续用这个文件夹交给 CodeBuddy，不用重新建 GitHub 仓库。本轮修改尚未提交或推送。

## 先完成建表

1. 打开你已经创建的 Supabase `edu-chat` 项目。
2. 点 **Connect → Session pooler → URI**，选择端口 **5432**。复制连接串；里面的 `[YOUR-PASSWORD]` 可以原样保留。
3. 在 PowerShell 执行：

```powershell
cd C:\Users\peng\Desktop\edu-chat-v0.2.1
npm run db:setup
```

4. 出现 `Database URI` 时粘贴连接串，按回车。输入是隐藏的，看不到字符属于正常现象。
5. 如果接着出现 `Database password`，输入创建这个 Supabase 项目时设置的**数据库密码**，按回车。不是网站登录密码。
6. 看到“建表 / 升级成功：7 张表……”就完成这一步。失败可重试；脚本使用事务，失败会回滚，不删除已有聊天。不要把连接串或密码发到聊天里。

若提示证书问题：从 Supabase 数据库设置下载 CA 证书，在同一个 PowerShell 设置 `DATABASE_CA_CERT_PATH` 为该证书的完整路径，再运行上面的命令。不要关闭证书验证。连接方式见 [Supabase 官方说明](https://supabase.com/docs/guides/database/connecting-to-postgres)。

## 然后完成云端和手机测试

按 [SERVERLESS.md](SERVERLESS.md) 顺序：Worker → Pages → 网页登录聊天 → Android 包。先用自己账号测试，关闭公开注册，避免陌生人消耗你的 DeepSeek 余额。

除了 DeepSeek Key，**附件功能现在还需要 Worker Secret `SUPABASE_SERVICE_ROLE_KEY`**，用于可信地登记文件归属。这个管理密钥只能填 Worker，不能填 Pages、App 或源码文件。普通聊天不依赖它；没配时附件会明确返回“附件服务尚未配置”。

目前只有 Supabase 项目已由你创建；本轮没有真实连接数据库、部署 Worker / Pages 或消耗 DeepSeek 余额。

## 旧 APK 需要注意

之前 V0.2.1 APK 的“填写服务器地址 / 令牌”连接的是旧 Node 网关，不能直接填新 Worker 地址使用。新架构的 APK 需要重新用 `build:android:serverless` 打包，启动后显示邮箱登录。

原 Android 工具和调试签名仍在原 ChatGPT 工作区的 `work/toolchain`。**不要删除签名，也不必先卸载旧 App。** 构建方法见 [ANDROID.md](ANDROID.md)。旧版本地历史不会自动归入新的登录账号；如有重要聊天，先在旧版导出备份。

## 给 CodeBuddy 的接续要求

- 先阅读本轮修改和 `docs/VERIFICATION.md`，不要还原用户原本未提交的 schema。
- `schema.sql` 与新增 `20261119000000_harden_schema.sql` 是同一份最终结构；保留旧迁移记录。
- 本地校验：`npm ci`、`npm --prefix workers ci`、`npm run type`、`npm run lint`、`npm test`。
- 建表成功后再部署、联调；不要把模拟构建和本地数据库测试写成真实云端验收通过。
- 真机验收要包括：流式回答、停止、重登、两账号隔离、跨设备历史、附件，以及电脑关机后用移动网络聊天。
- 本轮不添加教育功能或多人聊天室界面。
