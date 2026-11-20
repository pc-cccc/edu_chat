# Edu_chat

[English](README.md) | 简体中文

以 Android App 为核心的开源 DeepSeek 聊天客户端。装好 App，填入自己的 API Key，就能开始聊天。

不用写代码，不用部署服务器，也不用注册 Edu_chat 账号。你可以在手机上提问、整理思路、阅读公式与代码，把需要的对话导出备份；临时使用电脑时，也可以打开网页版。

Edu_chat 基于 [DeepSeek 官方 chat-demo](https://github.com/deepseek-ai/chat-demo) 开发，是独立个人项目，非 DeepSeek 官方产品。

[下载 Android App](https://github.com/pc-cccc/edu_chat/releases/latest) · [打开网页版](https://edu-chat-9yt.pages.dev) · [反馈问题](https://github.com/pc-cccc/edu_chat/issues)

> 当前版本：**v0.4.7**。新增勾选一条或多条对话，打包导出为一个 ZIP 文件。
> App 开源免费；聊天需要你自己的 DeepSeek API Key，模型调用费用由你的 DeepSeek 开放平台账户承担。

## 第一次使用，从这里开始

### 1. 下载并安装 App（推荐）

适用于 **Android 7.0 及以上**。目前没有 iOS 安装包。

- **当前版本直接下载：[Edu_chat_v0.4.7.apk](https://github.com/pc-cccc/edu_chat/releases/download/v0.4.7/Edu_chat_v0.4.7.apk)**。
- 也可以进入 [版本下载页](https://github.com/pc-cccc/edu_chat/releases/latest)，展开 **Assets（附件）**，下载以 `.apk` 结尾的文件。
- 下载完成后，在手机的“下载”中打开 APK，按提示安装。如果系统询问是否允许当前浏览器或文件管理器安装应用，确认文件来自本仓库后，按系统提示授权。

**不用下载 `Source code (zip)` 或 `Source code (tar.gz)`。它们是源码，不是手机安装包。**

已有旧版时，优先直接覆盖安装，不要先卸载。重要对话请先导出备份；如果提示签名冲突或无法更新，请记录提示并反馈，不要通过卸载来强行更新。

### 2. 获取自己的 DeepSeek API Key

API Key 可以理解为“让 App 使用你的 DeepSeek 账户调用模型的凭证”，**不是登录密码，也不是手机验证码**。

1. 打开 [DeepSeek 开放平台](https://platform.deepseek.com)，注册或登录你的 DeepSeek 账户。
2. 在平台的 API Keys 页面创建一个 Key，并复制保存。官方入口说明见 [DeepSeek API 文档](https://api-docs.deepseek.com/)。
3. 确认开放平台账户有可用余额；如需充值，在 DeepSeek 官方平台操作，费用以平台显示为准。

Key 只需填在自己使用的 App 或网页中，不要发到 Issue、评论区或截图里。**能使用 DeepSeek 官方聊天 App，不代表已经开通 API 或拥有 API 余额。**

### 3. 填入 Key，发送第一条消息

打开 Edu_chat，点击首次使用提示中的“填写 API Key”，粘贴 Key 并确认。也可以从侧边栏进入设置，找到“输入 API Key 开始使用”。

先发送一句“你好”，确认收到回答后再尝试其他功能。不需要填写服务器地址，也不用让电脑保持开机；手机需要能够联网访问 DeepSeek API。

### 不想安装？直接使用网页版

打开 **[Edu_chat 网页版](https://edu-chat-9yt.pages.dev)** → 填写自己的 Key → 开始聊天。手机和电脑浏览器都可以使用，无需部署。

网页版与 App 使用同一种“自带 Key”的方式，但**两边的历史不会自动同步**。网页版将 Key 和历史保存在当前浏览器中，建议使用自己的设备和常用浏览器。

## 能用它做什么

| 功能 | 使用说明 |
| --- | --- |
| 日常聊天 | 回答逐步显示，支持停止生成、复制和重新生成 |
| 深度思考 | 可切换思考模式，适合需要进一步推理的问题 |
| 智能搜索 | 按需搜索网页；当前建议先关闭深度思考再使用搜索 |
| 阅读代码与公式 | 支持 Markdown、代码高亮、数学公式和 Mermaid 图表渲染 |
| 管理本地对话 | 历史保存在当前设备，可在不同对话间切换 |
| 选择性导出 | 在设置中勾选一条、多条或全部对话，导出为 ZIP 备份 |
| 导入历史 | 支持兼容格式的历史 ZIP；当前导入会替换全部本地对话和附件 |

图片、文件、语音等能力受 DeepSeek 接口支持、账户与网络条件影响，不保证与官方 App 的全部功能一致。搜索与深度思考同时开启时，搜索触发仍有已知限制。

## 备份、换设备与更新

**备份：** 打开设置 → 导出历史对话 → 下载 → 勾选需要的对话 → 导出。保存好生成的 ZIP 文件。

- 备份包含所选对话及其本地图片原件，不包含 API Key。
- 其他附件只保留文件信息，**不包含原文件**；重要附件请另外保存。
- v0.4.7 的选择与计数交互已做浏览器验证，手机上的选择性导出、保存及重新导入仍待完整验收。

**换设备：** 先导出并保存 ZIP，在新设备上导入，再单独填写 Key。手机 App 与网页版之间也需要手动迁移。

> **导入前必读：目前导入是“替换”，不是“合并”。**
> 例如只导出了 2 条对话，将这个文件导入有 10 条对话的设备后，原来的 10 条会被替换成文件中的 2 条。请先备份目标设备上的重要记录。

**更新：** 在 App 的“设置 → 关于版本 → 检查更新”中检查，或前往 [版本下载页](https://github.com/pc-cccc/edu_chat/releases/latest) 下载新版 APK。小版本更新不一定主动弹窗，可手动检查。

## 费用与数据，说明白

| 常见问题 | 答案 |
| --- | --- |
| 我要买服务器吗？ | 使用当前 App 和在线网页版都不需要。安装 App 后，电脑也可以关机。 |
| 使用 App 要付费吗？ | Edu_chat 开源免费；DeepSeek API 调用费用由你自己的账户承担。没有提供公共免费 Key。 |
| 需要注册 Edu_chat 账号吗？ | 不需要。申请 Key 时需要 DeepSeek 开放平台账户。 |
| 对话会自动同步吗？ | 不会。当前版本没有账号系统与云同步，历史保存在本机。 |
| 聊天是不是完全离线？ | 不是。生成回答时，对话及所需附件会发送到 DeepSeek 相关接口处理。 |
| 卸载后记录还在吗？ | 卸载 App、清除应用数据或清理浏览器网站数据可能删除历史与 Key，请先备份。 |

Android 版优先使用系统加密存储保存 Key；当前实现仍有加密存储失败时回退到本地普通存储的兼容逻辑。网页版使用浏览器本地存储，**不具备与 Android 系统加密存储相同的保护**。当前直连模式不通过维护者的模型代理服务器。

## 遇到问题怎么办

| 现象 | 先尝试这些操作 |
| --- | --- |
| 下载页打不开 | 换一个网络或浏览器后重试；也可以先尝试网页版 |
| 提示 Key 无效 | 重新从开放平台复制 Key，确认没有多余空格，且 Key 未被删除 |
| 提示余额不足 | 检查 DeepSeek 开放平台的 API 余额，按平台提示处理 |
| 显示网络异常 | 用手机系统浏览器重试网页版，或切换 Wi-Fi / 移动网络；检查能否访问 DeepSeek 开放平台 |
| 搜索没有触发 | 关闭深度思考后再试；按钮开启不代表每条消息都会发起搜索 |
| 换浏览器或手机后没有历史 | 历史只保存在原设备或浏览器中，需要通过导出、导入迁移 |

仍未解决时，请 [提交 Issue](https://github.com/pc-cccc/edu_chat/issues)，说明 **App 或网页版、版本号、手机型号 / 浏览器、操作步骤、错误提示**。截图请遮住 Key 和私人聊天内容。

## 当前进度与下一步

目前以 **Android App 的日常体验**为开发重点，网页版作为补充入口。v0.4.7 已提供 APK，加入了选择性导出；后续优先完善备份恢复、真机兼容性及搜索与思考的组合体验。iOS 和云同步暂未提供。

如果 Edu_chat 对你有用，欢迎点一个 **Star**，让更多人发现这个项目。也欢迎带着具体使用场景来提建议：哪个操作不顺手、哪一步看不懂，都能帮助它变得更好用。

## 给开发者

普通用户下载 APK 或打开网页版即可，**不需要执行下面的命令**。

<details>
<summary>展开：源码运行与构建</summary>

技术栈：React 18、TypeScript、Rspack、Zustand、Capacitor。当前开发主线为 `mobile`，发布的 App 与网页版采用 `direct` 模式。

需要 Node.js 22.12+。Windows 如拦截 `npm.ps1`，将命令中的 `npm` 换成 `npm.cmd`。

```sh
git clone --branch mobile https://github.com/pc-cccc/edu_chat.git
cd edu_chat
npm ci
npm run dev:direct
```

访问 `http://127.0.0.1:8090`，在界面填写自己的 Key。只想预览界面，可运行 `npm run demo` 并访问 `http://127.0.0.1:8092`；演示模式使用固定回复。

```sh
# 构建网页版，输出到 dist/
npm run build:direct

# 构建 Android 前端并同步原生工程
npm run build:android:direct
npm run android:sync
npm run android:open
```

Android 工程还需要 JDK 与 Android SDK，可在 Android Studio 中完成打包。现有 v0.4.7 APK 由 debug 构建产生；后续分发需妥善管理签名，保持升级兼容，不要提交签名文件或真实密钥。

仓库仍保留旧 Node 网关及 Cloudflare / Supabase 方案。[Serverless 指南](docs/SERVERLESS.md)、[旧验证记录](docs/VERIFICATION.md) 和 [Android 历史构建说明](docs/ANDROID.md) 记录的是早期方案与环境，不能当作当前 App 的首次使用教程。

</details>

## 致谢与许可

感谢 [DeepSeek 官方 chat-demo](https://github.com/deepseek-ai/chat-demo) 提供基础。保留上游版权与 [MIT LICENSE](LICENSE)，来源与修改说明见 [NOTICE.md](NOTICE.md)。Edu_chat 的名称及钥匙图标用于标识本独立项目，不代表 DeepSeek 官方。
