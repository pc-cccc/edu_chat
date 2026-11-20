declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '*.css' {}

/** 公开 API 的地址，见 rspack.config.ts 的 createConfig */
declare const __API_ORIGIN__: string
declare const __APP_MODE__: 'server' | 'serverless' | 'direct' | 'demo'
/** 构建目标平台：web（浏览器）或 android（Capacitor App），见 rspack.config.ts */
declare const __APP_TARGET__: 'web' | 'android'
/** 应用版本号，与 package.json 的 version 保持一致，见 rspack.config.ts */
declare const __APP_VERSION__: string
/** serverless 模式：Cloudflare Worker 代理地址（形如 https://xxx.workers.dev） */
declare const __WORKER_ORIGIN__: string
/** serverless 模式：Supabase 项目 URL 与公开 anon key（均为公开值） */
declare const __SUPABASE_URL__: string
declare const __SUPABASE_ANON_KEY__: string

/** Prism 语言包通过副作用注册到全局 Prism */
declare module 'prismjs/components/*' {}

/** KaTeX 化学公式扩展通过副作用注册到 KaTeX */
declare module 'katex/contrib/mhchem' {}
