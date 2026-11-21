# Edu_chat 项目交接记忆

更新日期：2026-11-21。

## 当前主线
- 仓库：pc-cccc/edu_chat；开发分支：mobile。
- 当前版本：0.4.8；Android versionCode：18；包名：com.educhat.app。
- 产品重点是 Android App，网页版作为补充入口；中文主 README，英文在 README.en.md。
- 使用用户自己的 DeepSeek API Key，direct 模式、本地历史。无 Edu_chat 账号与云同步，不需要用户部署服务器。

## v0.4.8 发布
- 功能提交：6c63978；版本标签 v0.4.8 指向文档提交 b3a1fbb。
- Release：https://github.com/pc-cccc/edu_chat/releases/tag/v0.4.8
- APK：Edu_chat_v0.4.8.apk，6,224,226 字节，debug 构建。
- SHA256：46f8b6cb51b05758b8c8738a876000cc2db766dfe7127e547bc25daedec8e05d。
- 网页：https://edu-chat-9yt.pages.dev，direct 构建，Pages 生产分支 main（不是 Git 开发分支）。
- 本轮部署：https://d2a14c2d.edu-chat-9yt.pages.dev。
- Release 保留 v0.4.6 / v0.4.7 / v0.4.8；删除 v0.4.5 Release，保留 Git 标签。

## 功能与验收边界
- 界面导入默认合并：内容相同跳过，同 ID 内容不同保留副本；替换全部需二次确认。
- 注意底层 importHistory(file, mode) 默认仍为 replace，新调用方应显式传入模式。
- 导出过程中锁定选择；归档不包含 API Key；图片包含本地原件，其他附件仅文件信息。
- 本轮重新执行：62/62 自动测试、类型检查、lint、build:direct 均通过。
- 真机验收依据用户交接确认：覆盖安装保留历史与 Key、ZIP 保存和选择、合并不删其他记录且重复导入不重复、替换二次确认与取消均通过。
- 发布后比对线上 APK 的 SHA256 与桌面文件一致，线上网页版本和入口 JS 与本地构建一致。
- 未在本轮重新执行真实模型付费调用或完整手机回归；不宣称所有设备已验证。

## 后续方向
- 继续优先处理 Android 日常体验、真机兼容性、搜索与深度思考的组合体验。
- 智能搜索目前建议关闭深度思考后使用；iOS 未适配。
- 长对话中途停止、会话手势等仍需专项验收；跨设备自动同步未提供。
- 不要将旧 Serverless / Supabase 文档作为当前用户上手指南。
- 更新时保持签名一致，先备份，不要要求用户先卸载。不要提交密钥或签名文件。
