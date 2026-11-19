# Edu_chat — A zero-cost DeepSeek chat client that never leaks your API key

> A personal chat project based on [DeepSeek chat-demo](https://github.com/deepseek-ai/chat-demo) (not an official product). Built entirely serverless with Cloudflare Pages + Workers + Supabase: **your DeepSeek API key lives only inside the Worker — the frontend, the APK, and the database never see it.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![中文说明](https://img.shields.io/badge/README-中文-blue)](README.md)

<!-- Put a screenshot or GIF of the chat UI here — it's the fastest way to show what this is. -->
<!-- <p align="center"><img src="docs/screenshot.png" width="640" alt="Chat UI" /></p> -->

## ✨ Features

- 🔐 **Key-safe by design**: the DeepSeek key lives only in a Worker Secret. Login is verified against Supabase JWTs (JWKS), anonymous / service-role keys are rejected, and file ownership is checked per request.
- 💸 **Zero-cost hosting**: Pages + Workers + Supabase all run on free tiers; you only pay DeepSeek for actual usage.
- 👥 **Per-account isolation**: email sign-in, private cloud history per user, syncs across devices, invisible to other accounts.
- 💬 **Full chat experience**: streaming output, stop generation, deep thinking, web search, file upload, Markdown / LaTeX.
- 📱 **Android app**: the same frontend builds into an installable APK — chat from your phone even with your PC off.

## 🧩 Architecture

| Layer | Service | Role |
| --- | --- | --- |
| Frontend | Cloudflare Pages | the web / Android UI |
| Gateway | Cloudflare Worker | verifies login, injects the DeepSeek key, proxies streaming |
| Data | Supabase | email auth, private cloud history, file ownership |

## 🚀 Quick start

Read [NEXT-STEPS.md](docs/NEXT-STEPS.md) first, then follow the [serverless deployment guide](docs/SERVERLESS.md).

```powershell
npm ci
npm --prefix workers ci
Copy-Item .env.serverless.example .env.serverless   # fill in the three public values
npm run build:serverless
```

Only the Worker Secret holds the DeepSeek key and the Supabase `service_role` key (used for trusted file-ownership bookkeeping). The frontend may only receive the `publishable` / `anon public` key. The legacy Node gateway (`server/`, `Dockerfile`) is kept for reference but is not used by the serverless deployment.

## ✅ Verify

```powershell
npm run type
npm run lint
npm test   # 45 tests: schema, two-role RLS isolation, worker auth/CORS/cancel, build config
```

Real-cloud acceptance (streaming, stop, re-login, cross-account isolation, cross-device history, attachments, phone on mobile network) still requires your own accounts — see [VERIFICATION.md](docs/VERIFICATION.md).

## 📄 License

Based on the upstream MIT license — see [LICENSE](LICENSE). The name and key icon are a personal project identity and do not impersonate any official DeepSeek app.
