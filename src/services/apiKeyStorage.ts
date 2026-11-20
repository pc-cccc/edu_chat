import { Capacitor } from '@capacitor/core'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'

/**
 * API Key 的存储抽象：
 * - 原生环境（Android/iOS 的 Capacitor App）：使用系统级加密存储
 *   （Android Keystore / iOS Keychain），Key 不落明文；
 * - Web 浏览器（开发 / direct 网页版）：回退到 localStorage。
 *
 * 密钥只存在用户设备上，不上传到维护者后端。
 */
const KEY = 'edu_chat_api_key'
/** 旧版本把 Key 明文存在 localStorage 的这个 key 下，读取后需要迁移到加密存储 */
const LEGACY_KEY = 'zhixue-chat:api-key'

const isNative = Capacitor.isNativePlatform()

const readLegacy = (): string | null => {
  try {
    return localStorage.getItem(LEGACY_KEY)
  } catch {
    return null
  }
}

const writeLegacy = (value: string | null): void => {
  try {
    if (value === null) {
      localStorage.removeItem(LEGACY_KEY)
    } else {
      localStorage.setItem(LEGACY_KEY, value)
    }
  } catch {
    // 存储不可用时忽略
  }
}

/** 读取 API Key；原生环境会把旧明文自动迁移到加密存储。 */
export const loadApiKey = async (): Promise<string | null> => {
  if (!isNative) {
    return readLegacy()
  }
  try {
    const stored = await SecureStorage.getItem(KEY)
    if (stored) {
      return stored
    }
    // 加密区没有，但旧版明文还在：迁移一次
    const legacy = readLegacy()
    if (legacy) {
      await SecureStorage.setItem(KEY, legacy)
      writeLegacy(null)
      return legacy
    }
    return null
  } catch {
    // 加密存储异常时回退到旧明文，保证聊天仍可用
    return readLegacy()
  }
}

/** 写入或清除 API Key；原生环境写入加密区并清掉旧明文。 */
export const saveApiKey = async (apiKey: string | null): Promise<void> => {
  if (!isNative) {
    writeLegacy(apiKey)
    return
  }
  try {
    if (apiKey === null) {
      await SecureStorage.removeItem(KEY)
      writeLegacy(null)
    } else {
      await SecureStorage.setItem(KEY, apiKey)
      writeLegacy(null)
    }
  } catch {
    // 加密存储不可用时回退到明文，至少保证功能可用
    writeLegacy(apiKey)
  }
}
