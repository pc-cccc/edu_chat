import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor 配置：把 dist 里的 Web 前端封装成 Android App。
 * App 的 WebView origin 为 https://localhost，云端后端的 CORS 会放行该来源。
 */
const config: CapacitorConfig = {
  // 应用包名（Android applicationId）。个人使用可保留；如需上架请改成自己的域名倒写。
  appId: 'com.educhat.app',
  appName: 'Edu_chat',
  webDir: 'dist',
  server: {
    // 让 WebView 使用 https 本地源，便于 fetch 与 CORS 行为一致
    androidScheme: 'https',
  },
}

export default config
