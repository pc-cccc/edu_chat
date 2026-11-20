import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * App 内更新：
 * - 版本信息来源：GitHub Releases 的 latest（tag 名作为版本号，APK 附件作为下载地址）。
 * - 检查失败（断网、GitHub 不可达、超时）静默返回 null，不打扰用户。
 * - Android 无法静默安装，下载完成后由系统弹安装界面，用户确认一次。
 */

/** GitHub 仓库：与项目实际仓库保持一致 */
const RELEASES_API = 'https://api.github.com/repos/pc-cccc/edu_chat/releases/latest'
const CHECK_TIMEOUT_MS = 12000

/** 原生 AppUpdater 插件：下载 APK 并打开系统安装界面 */
const AppUpdater = registerPlugin<{
  downloadAndInstall(options: { url: string }): Promise<{ status: 'downloading' | 'needPermission' }>
}>('AppUpdater')

export type UpdateLevel = 'major' | 'minor' | 'patch' | 'none'

export type UpdateInfo = {
  /** 远端版本号，如 0.4.0 */
  version: string
  level: UpdateLevel
  /** APK 下载地址 */
  url: string
  /** Release 标题 */
  name: string
}

export type DownloadResult = 'downloading' | 'needPermission' | 'fallbackToBrowser' | 'failed'

const parseVersion = (value: string): [number, number, number] | null => {
  const match = value.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) {
    return null
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** 比较本地与远端版本；远端不高于本地时返回 none。 */
export const diffLevel = (local: string, remote: string): UpdateLevel => {
  const a = parseVersion(local)
  const b = parseVersion(remote)
  if (!a || !b) {
    return 'none'
  }
  if (b[0] !== a[0]) {
    return b[0] > a[0] ? 'major' : 'none'
  }
  if (b[1] !== a[1]) {
    return b[1] > a[1] ? 'minor' : 'none'
  }
  if (b[2] !== a[2]) {
    return b[2] > a[2] ? 'patch' : 'none'
  }
  return 'none'
}

type ReleasePayload = {
  tag_name?: unknown
  name?: unknown
  assets?: unknown
}

type ReleaseAsset = {
  name?: unknown
  browser_download_url?: unknown
}

export const checkForUpdates = async (): Promise<UpdateInfo | null> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)
  try {
    const response = await fetch(RELEASES_API, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!response.ok) {
      return null
    }
    const data = (await response.json()) as ReleasePayload
    if (typeof data.tag_name !== 'string') {
      return null
    }
    const level = diffLevel(__APP_VERSION__, data.tag_name)
    if (level === 'none') {
      return null
    }
    const assets = Array.isArray(data.assets) ? (data.assets as ReleaseAsset[]) : []
    const apk = assets.find(
      (asset) => typeof asset.name === 'string' && asset.name.toLowerCase().endsWith('.apk')
    )
    if (!apk || typeof apk.browser_download_url !== 'string') {
      return null
    }
    return {
      version: data.tag_name,
      level,
      url: apk.browser_download_url,
      name: typeof data.name === 'string' && data.name ? data.name : data.tag_name,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 下载并引导安装。原生环境走 AppUpdater 插件（DownloadManager + 系统安装界面）；
 * 浏览器等非原生环境直接打开下载地址。
 */
export const downloadUpdate = async (url: string): Promise<DownloadResult> => {
  if (!Capacitor.isNativePlatform()) {
    window.open(url, '_blank', 'noopener')
    return 'fallbackToBrowser'
  }
  const result = await AppUpdater.downloadAndInstall({ url })
  return result.status
}
