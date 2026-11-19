# Edu_chat V0.2.2 Android（Serverless）

当前手机目标为邮箱登录 → Cloudflare Worker → DeepSeek，历史同步到 Supabase。先按 [SERVERLESS.md](SERVERLESS.md) 完成网页部署和真实聊天，再构建手机包。

旧 V0.2.1 的服务器地址 / APP_TOKEN 页面属于 Node 网关版，不能直接填 Worker 域名替代。新包需要用 `build:android:serverless` 构建。

## 复用本机工具和原签名

2026-11-19 已确认以下目录和原调试签名仍存在；它们位于原 ChatGPT 工作区，不在桌面项目里面。不要提交这些文件到 GitHub。

在桌面项目根目录的 PowerShell：

```powershell
$eduTools = 'C:\Users\peng\Documents\ChatGPT\教育版deepseek\work\toolchain'
$env:JAVA_HOME = Join-Path $eduTools 'jdk-21.0.13+9'
$env:ANDROID_HOME = Join-Path $eduTools 'android-sdk'
$env:ANDROID_USER_HOME = Join-Path $eduTools 'android-user'
$env:GRADLE_USER_HOME = Join-Path $eduTools 'gradle'
```

工具链：JDK 21、SDK Platform 36、Build Tools 35.0.0 / 36.0.0、Gradle 8.14.3。原调试签名为 `$eduTools\android-user\debug.keystore`。换电脑时需自行调整路径。

## 构建

先把 `.env.serverless.example` 复制为 `.env.serverless`，在编辑器填写三个**公开**配置值：Worker 地址、Supabase URL、publishable / anon public key。

```powershell
npm ci
npm run build:android:serverless
npm run android:sync
cd android
.\gradlew.bat --no-daemon '-Pandroid.overridePathCheck=true' assembleDebug
```

APK 输出：`android/app/build/outputs/apk/debug/app-debug.apk`。包名 `com.educhat.app`，0.2.2 / versionCode 3，minSdk 24 / targetSdk 36。不要把使用示例地址构建的包当成可联网成品。

原 V0.2.1 debug 签名 SHA-256：`B817B132F20B7190B52F86CEBACEB53E859636B129950935108E7627B794FAC3`。

相同包名、签名且 versionCode 合适，才具备覆盖安装条件；仍需真机验证。**不必先卸载旧 App。** 有重要历史请先在旧版导出备份；旧本地记录不自动归到新登录账号。调试包供个人测试，长期分发需管理专用 release 签名。

## 真机验收

登录、键盘、返回键、流式回答 / 停止、附件、语音权限、重登后云端历史、后台恢复；最后关闭电脑，用移动网络发送新消息。只有看到服务器连接页，不代表测试结束。

本轮是否实际打包 / 联网以 [VERIFICATION.md](VERIFICATION.md) 最新条目为准。
