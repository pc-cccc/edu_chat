import { useTranslate } from '../../i18n/index.js'
import { setDraftText } from '../../services/chat/drafts.js'
import { KeyLogo } from './KeyLogo.js'
import './education.css'

export const EducationIntro = () => {
  const t = useTranslate()
  return <>
    <div className="education-mark" aria-hidden="true"><KeyLogo /></div>
    <div className="education-eyebrow">{t('appName')} <span>V0.1</span></div>
  </>
}

export const EducationStarters = () => {
  const t = useTranslate()
  const choices = [['starterConcept', 'promptConcept', '01'], ['starterMath', 'promptMath', '02'], ['starterPlan', 'promptPlan', '03']] as const
  return <div className="education-starters">
    {choices.map(([title, prompt, number]) => <button key={title} type="button" onClick={() => {
      setDraftText(null, t(prompt))
      document.querySelector<HTMLTextAreaElement>('textarea')?.focus()
    }}><span>{number}</span>{t(title)}<span aria-hidden="true">↗</span></button>)}
  </div>
}
