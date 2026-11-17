import { useState } from 'react'
import { setAppOrigin, setAppToken, useAppAuth } from '../../services/api/auth.js'
import { fetchStatus } from '../../services/api/client.js'
import { classifyApiError } from '../../services/api/errors.js'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import styles from './Settings.module.css'

type Message = { key: TranslationKey; error: boolean }

/** 服务器（云端后端）连接：填写访问令牌与可选服务器地址，供 App 或浏览器连接自己的后端。 */
export const ServerConnection = () => {
  const t = useTranslate()
  const savedOrigin = useAppAuth((s) => s.origin)
  const savedToken = useAppAuth((s) => s.token)
  const [originValue, setOriginValue] = useState(savedOrigin ?? '')
  const [tokenValue, setTokenValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  const save = async () => {
    if (busy) {
      return
    }
    const nextOrigin = originValue.trim()
    const nextToken = tokenValue.trim()
    setBusy(true)
    setMessage(null)
    setAppOrigin(nextOrigin || null)
    if (nextToken) {
      setAppToken(nextToken)
    }
    try {
      const status = await fetchStatus()
      if (status.configured) {
        setMessage({ key: 'serverConnected', error: false })
        setTokenValue('')
      } else {
        setMessage({ key: 'serverMissingKey', error: true })
      }
    } catch (error) {
      const condition = classifyApiError(error)
      setMessage({
        key: condition === 'unauthorized' ? 'serverTokenInvalid' : condition === 'network' ? 'serverOffline' : 'serverConnectFailed',
        error: true,
      })
    } finally {
      setBusy(false)
    }
  }

  const clear = () => {
    setAppToken(null)
    setAppOrigin(null)
    setOriginValue('')
    setTokenValue('')
    setMessage(null)
  }

  return (
    <div className={styles.cell}>
      <div className={styles.label}>{t('managedConnection')}</div>
      <p className={styles.description}>{t('serverConnectionDescription')}</p>
      <div className={styles.serverForm}>
        <div className={styles.apiKeyInput}>
          <input
            type="text"
            placeholder={t('serverOriginPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            value={originValue}
            onChange={(event) => setOriginValue(event.target.value)}
          />
        </div>
        <div className={styles.apiKeyInput}>
          <input
            type="password"
            placeholder={t('serverTokenPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            value={tokenValue}
            onChange={(event) => setTokenValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                void save()
              }
            }}
          />
        </div>
        <div className={styles.serverActions}>
          <Button variant="outlined" size="s" disabled={busy} onClick={() => void save()}>
            {busy ? t('serverConnecting') : t('serverSaveAndConnect')}
          </Button>
          {savedOrigin || savedToken ? (
            <Button variant="outlined" size="s" onClick={clear}>
              {t('serverClear')}
            </Button>
          ) : null}
        </div>
        {message ? (
          <div className={message.error ? styles.error : styles.description}>{t(message.key)}</div>
        ) : null}
      </div>
    </div>
  )
}
