import { closeSearchPanel, useSearchPanel } from '../components/search/searchPanelState.js'
import { closeSettings, useSettingsDialog } from '../components/settings/settingsDialogState.js'
import { closeMobileSider, useMobileSider } from '../components/sider/mobileSiderState.js'

/**
 * Android App 的原生能力（目前只有返回键）。
 * 仅在 APP_TARGET=android 的构建中动态加载 @capacitor/app，Web 构建不引入该插件。
 */
export const initNativeApp = (): void => {
  if (__APP_TARGET__ !== 'android') {
    return
  }
  void import('@capacitor/app').then(({ App }) => {
    App.addListener('backButton', ({ canGoBack }) => {
      // 依次关闭弹层与抽屉；都关闭后回退历史，否则退到后台
      if (useSettingsDialog.getState().open) {
        closeSettings()
        return
      }
      if (useSearchPanel.getState().entry) {
        closeSearchPanel()
        return
      }
      if (useMobileSider.getState().open) {
        closeMobileSider()
        return
      }
      if (canGoBack) {
        window.history.back()
        return
      }
      void App.minimizeApp()
    })
  })
}
