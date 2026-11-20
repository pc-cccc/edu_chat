import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { MobileHeader } from './MobileHeader.js'
import styles from './Welcome.module.css'
import { ChatIntro } from './ChatIntro.js'
import { ApiKeyGuide } from './ApiKeyGuide.js'
import { ConnectionStatus } from '../education/ConnectionStatus.js'

/** 新对话：问候语 + 输入框。桌面端居中；移动端输入框吸底 */
export const Welcome = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  return (
    <div className={styles.container}>
      {isMobile ? <MobileHeader /> : null}
      <div className={styles.welcome}>
        <ChatIntro />
        <ApiKeyGuide />
        <ChatInput sessionId={null} />
        <ConnectionStatus />
        <div className="education-footer">{t('independentProject')}</div>
        {isMobile ? <div className={styles.caveat}>{t('contentCaveat')}</div> : null}
      </div>
    </div>
  )
}
