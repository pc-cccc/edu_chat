# Edu_chat V0.2.1 Android

APK 包含本地聊天界面，通过 HTTPS 云端 Node 网关访问 DeepSeek。手机只保存服务器地址和访问令牌，DeepSeek 密钥仅在云端配置。

## 安装

将交付的 Edu_chat-v0.2.1-debug.apk 传到手机，打开文件，按 Android 提示允许此次安装来源。名称 Edu_chat，图标蓝底白钥匙，包名 com.educhat.app，版本 0.2.1（versionCode 2）。

这是已签名的个人测试包，最低 Android 7.0（API 24），需近期更新的 Android System WebView。最低版本声明不代表所有旧手机已实测。后续覆盖安装需相同签名且 versionCode 不降低；保留本机调试签名。长期分发需单独配置 release 签名，不上传签名到 GitHub。

## 云端部署

选择支持 Docker 或 Node 长期运行并提供 HTTPS 的平台。仓库根目录已有 Dockerfile；无需数据库。平台私密环境变量填写：

```dotenv
HOST=0.0.0.0
PORT=8090
PUBLIC_ORIGIN=https://your-domain.example
DEEPSEEK_API_KEY=在平台私密配置中填写
APP_TOKEN=在平台私密配置中填写
```

平台分配端口时，以平台 PORT 为准。PUBLIC_ORIGIN 是真实公开 HTTPS 域名，不带 /api；不要使用示例占位符作为凭据。

在自己的终端生成随机令牌，保存到云端与手机，不发到聊天中：

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

同时需要网页版时，另加 APP_USER 与至少 16 字符的 APP_PASSWORD。手机填写 APP_TOKEN，不是站点密码或 DeepSeek 密钥。

反向代理保留 Host、Origin、Authorization、x-app-token，关闭流式缓冲，读取超时大于 180 秒。健康检查使用 TCP 或支持凭据的检查，未带令牌的 /api/status 返回 401 是预期行为。

## 手机连接

1. 打开 App，点“设置服务器，开始聊天”。
2. 填公开 HTTPS 地址和访问令牌。末尾带 /api 也可，会自动规范化。
3. 点“保存并连接”。成功才保存，失败保留旧配置；更换服务器重新输入令牌。
4. 发普通消息验证模型，再逐项验证深度思考、搜索、文件与语音。
5. 关闭电脑，用手机移动网络再发消息，确认不依赖局域网。

连接检查约 12 秒超时。云服务休眠启动较慢时，恢复后重试。连接状态仅验证后端配置存在，不代表 DeepSeek 鉴权、余额或模型能力已验证。App 本地页面来源 https://localhost 已允许跨域读取正常与错误响应。

## 重新构建

需要 Node.js 22.12+、**JDK 21**、Android SDK Platform 36、Build Tools 35.0.0（Gradle 默认使用）；本次也安装 36.0.0 用于校验安装包。项目为 Gradle 8.14.3、AGP 8.13.0；Capacitor 生成的模块使用 Java 21，旧说明中的 JDK 17 不足。

JAVA_HOME 指向 JDK 21，ANDROID_HOME 指向 SDK 根目录，在项目根目录执行：

```powershell
npm ci
npm run build:android
npm run android:sync
cd android
.\gradlew.bat --no-daemon -Pandroid.overridePathCheck=true assembleDebug
```

输出 android/app/build/outputs/apk/debug/app-debug.apk。Windows 中文路径可能触发 Gradle 路径检查，上述参数用于当前目录；如某个构建工具不兼容，改用英文目录。构建 Android 会覆盖 dist；部署网页前重新 npm run build。

本次工具在工作区 work/toolchain，没有全局安装 Android Studio。工具、缓存、APK、机器专用路径、签名不包含在源码包中。调试签名位于 work/toolchain/android-user/debug.keystore；复用本机工具重建时，设置 ANDROID_USER_HOME 为该 android-user 目录，以保留覆盖安装能力。

## 验证范围

见 [VERIFICATION.md](VERIFICATION.md)。仍需真机检查键盘、返回键、文件选择、语音权限和后台恢复；真实 API 与云部署需要自己的账户和配置。本版不会自动创建付费云服务。

### 复用本工作区已有工具（Windows）

在源码项目根目录，当前副本位于 outputs/edu-chat-v0.2.1 时可先执行：

```powershell
$tools = (Resolve-Path ../../work/toolchain).Path
$env:JAVA_HOME = Join-Path $tools 'jdk-21.0.13+9'
$env:ANDROID_HOME = Join-Path $tools 'android-sdk'
$env:ANDROID_USER_HOME = Join-Path $tools 'android-user'
$env:GRADLE_USER_HOME = Join-Path $tools 'gradle'
```

再执行上面的构建命令。移动项目或换电脑后，需要调整这些工具路径；Android Studio 会使用它自己的工具与缓存设置。
