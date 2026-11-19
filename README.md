# Edu_chat — 0 成本上云、密钥不泄露的 DeepSeek 聊天客户端

> 基于 [DeepSeek chat-demo](https://github.com/deepseek-ai/chat-demo) 的个人聊天项目（**非官方产品**）。用 Cloudflare Pages + Workers + Supabase 搭成纯 Serverless：**DeepSeek 密钥只放在 Worker，前端、APK 与数据库都拿不到。**

> ⚠️ **状态：开发中** —— 核心代码已完成并通过 45 项测试；云端部署与真机验收仍在进行，进度见 [验证记录](docs/VERIFICATION.md)。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![English](https://img.shields.io/badge/README-English-blue)](README.en.md)

<p align="center"><img src="docs/screenshot.png" width="360" alt="聊天界面" /></p>

## ✨ 特点

- 🔐 **密钥不泄露**：DeepSeek Key 只存 Worker Secret；登录态用 Supabase JWT（JWKS）校验，拒绝匿名 / 服务密钥，附件归属逐条校验。
- 💸 **0 成本部署**：Pages + Workers + Supabase 全走免费额度，只有调用 DeepSeek 才按量计费。
- 👥 **多账号隔离**：邮箱登录，每人各自云端历史，换设备记录还在、互不可见。
- 💬 **完整聊天体验**：流式输出、停止生成、深度思考、联网搜索、文件上传、Markdown / LaTeX 公式。
- 📱 **安卓 App**：同一前端打包为可安装 App，电脑关机后手机也能聊。

## 🧩 架构

| 层 | 用谁 | 干什么 |
| --- | --- | --- |
| 前端 | Cloudflare Pages | 网页 / 安卓 App 的同一套界面 |
| 网关 | Cloudflare Worker | 校验登录、注入 DeepSeek Key、流式转发 |
| 数据 | Supabase | 邮箱登录、个人云端历史、文件归属 |

**第一次部署**：先读 [现在从哪里继续](docs/NEXT-STEPS.md)，再按 [Serverless 部署指南](docs/SERVERLESS.md) 三步上云。新旧 APK 区别见 [Android 指南](docs/ANDROID.md)。英文说明见 [README.en.md](README.en.md)。

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
