import { useTranslate } from '../../i18n/index.js'
import { showToast } from '../base/toastState.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { dismissUpdateDialog, startUpdate, useUpdate } from './updateState.js'
import styles from './Update.module.css'

/** 大版本更新（major/minor）弹窗：启动时自动弹出，用户可立即更新或稍后再说。 */
export const UpdateDialog = () => {
  const t = useTranslate()
  const open = useUpdate((state) => state.dialogOpen)
  const info = useUpdate((state) => state.info)
  const downloading = useUpdate((state) => state.downloading)
  if (!open || !info) {
    return null
  }
  const onUpdate = async () => {
    const result = await startUpdate()
    if (result === 'needPermission') {
      showToast({ key: 'updateNeedPermission', type: 'error' })
    } else if (result === 'failed') {
      showToast({ key: 'updateDownloadFailed', type: 'error' })
    } else if (result === 'fallbackToBrowser') {
      showToast({ key: 'updateDownloading' })
    }
  }
  return (
    <Modal
      title={t('updateAvailable', { version: info.version })}
      closable={!downloading}
      className={styles.dialog}
      onClose={dismissUpdateDialog}
      footer={
        <div className={styles.actions}>
          <Button variant="outlined" size="m" disabled={downloading} onClick={dismissUpdateDialog}>
            {t('updateLater')}
          </Button>
          <Button size="m" disabled={downloading} onClick={() => void onUpdate()}>
            {t(downloading ? 'updateDownloading' : 'updateAction')}
          </Button>
        </div>
      }
    >
      <div className={styles.text}>
        {t('updateDialogDescription', { name: info.name, version: info.version })}
      </div>
    </Modal>
  )
}
