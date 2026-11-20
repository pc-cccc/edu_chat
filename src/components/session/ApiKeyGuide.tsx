import { useTranslate } from '../../i18n/index.js'
import { useSettings } from '../../services/settings.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { Button } from '../base/Button.js'
import styles from './ApiKeyGuide.module.css'

/** 直连模式首次打开（尚未填写 API Key）时展示的引导卡片 */
export const ApiKeyGuide = () => {
  const t = useTranslate()
  const apiKey = useSettings((state) => state.apiKey)
  if (__APP_MODE__ !== 'direct' || apiKey) {
    return null
  }
  return (
    <div className={styles.guide}>
      <div className={styles.title}>{t('apiKeyGuideTitle')}</div>
      <p className={styles.text}>{t('apiKeyGuideDescription')}</p>
      <p className={styles.howto}>{t('apiKeyGuideHowTo')}</p>
      <Button block onClick={() => openSettings('data')}>
        {t('apiKeyGuideAction')}
      </Button>
    </div>
  )
}
