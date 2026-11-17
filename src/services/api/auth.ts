import { create } from 'zustand'

/**
 * App 访问云端后端的凭据与地址，与 DeepSeek 密钥无关。
 * 令牌只用于让服务端识别「这是本人的 App」，真正的 DeepSeek 密钥始终只存在服务端。
 * 存 localStorage（Android 应用沙盒内），不进入 APK 构建产物、不提交到 Git。
 */
const TOKEN_KEY = 'zhixue-chat:app-token'
const ORIGIN_KEY = 'zhixue-chat:app-origin'

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null): void => {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // 存储不可用时只在内存中生效
  }
}

/** 应用访问令牌；由用户在 App 内填写，服务端用它识别首方客户端。 */
export const getAppToken = (): string | null => read(TOKEN_KEY)
export const setAppToken = (token: string | null): void => {
  write(TOKEN_KEY, token)
  useAppAuth.setState({ token })
}

/** 覆盖云端服务器地址（完整 origin，如 https://your-domain.example），为空则用构建期默认值。 */
export const getAppOrigin = (): string | null => read(ORIGIN_KEY)
export const setAppOrigin = (origin: string | null): void => {
  write(ORIGIN_KEY, origin)
  useAppAuth.setState({ origin })
}

/** 供界面订阅的连接配置状态 */
export const useAppAuth = create(() => ({
  token: read(TOKEN_KEY),
  origin: read(ORIGIN_KEY),
}))
