import { useTranslate } from '../../i18n/index.js'
import { KeyLogo } from '../education/KeyLogo.js'
import '../education/education.css'

export const ChatIntro = () => {
  const t = useTranslate()
  return (
    <div className="chat-intro">
      <div className="education-mark" aria-hidden="true">
        <KeyLogo />
      </div>
      <div className="education-eyebrow">
        {t('appName')} <span>V0.3.3</span>
      </div>
      <h1 className="chat-greeting">{t('welcomeMessageChat250808')}</h1>
    </div>
  )
}
