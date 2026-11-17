declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '*.css' {}

/** 公开 API 的地址，见 rspack.config.ts 的 createConfig */
declare const __API_ORIGIN__: string
declare const __APP_MODE__: 'server' | 'direct' | 'demo'
/** 构建目标平台：web（浏览器）或 android（Capacitor App），见 rspack.config.ts */
declare const __APP_TARGET__: 'web' | 'android'

/** Prism 语言包通过副作用注册到全局 Prism */
declare module 'prismjs/components/*' {}

/** KaTeX 化学公式扩展通过副作用注册到 KaTeX */
declare module 'katex/contrib/mhchem' {}
