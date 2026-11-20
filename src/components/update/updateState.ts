import { create } from 'zustand'
import { checkForUpdates, downloadUpdate, type DownloadResult, type UpdateInfo } from '../../services/update.js'

/** 更新检查与下载状态；patch 更新只进设置页，major/minor 更新弹窗提示。 */
type UpdateState = {
  /** 检查到的新版本；null 表示当前已是最新或尚未检查 */
  info: UpdateInfo | null
  /** 是否正在检查 */
  checking: boolean
  /** 检查是否失败过（用于设置页展示重试入口） */
  failed: boolean
  /** 至少成功检查过一次（用于区分「还没检查」与「已是最新」） */
  checked: boolean
  /** 大更新弹窗是否打开 */
  dialogOpen: boolean
  /** 下载进行中（下载完成会由系统弹安装界面） */
  downloading: boolean
}

export const useUpdate = create<UpdateState>(() => ({
  info: null,
  checking: false,
  failed: false,
  checked: false,
  dialogOpen: false,
  downloading: false,
}))

/** 检查更新：major/minor 自动弹窗推荐；patch 仅更新状态，由设置页展示。 */
export const checkUpdates = async (): Promise<UpdateInfo | null> => {
  if (useUpdate.getState().checking) {
    return null
  }
  useUpdate.setState({ checking: true, failed: false })
  try {
    const info = await checkForUpdates()
    useUpdate.setState({
      info,
      checked: true,
      dialogOpen: info !== null && (info.level === 'major' || info.level === 'minor'),
    })
    return info
  } catch {
    useUpdate.setState({ failed: true, checked: true })
    return null
  } finally {
    useUpdate.setState({ checking: false })
  }
}

/** 关闭大更新弹窗 */
export const dismissUpdateDialog = () => useUpdate.setState({ dialogOpen: false })

/** 点击「立即更新」：下载 APK，完成后系统弹安装界面 */
export const startUpdate = async (): Promise<DownloadResult> => {
  const info = useUpdate.getState().info
  if (!info || useUpdate.getState().downloading) {
    return 'downloading'
  }
  useUpdate.setState({ downloading: true })
  try {
    return await downloadUpdate(info.url)
  } catch {
    return 'failed'
  } finally {
    useUpdate.setState({ downloading: false })
  }
}
