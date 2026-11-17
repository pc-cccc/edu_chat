import { useEffect, useState } from 'react'
import { useAppAuth } from '../../services/api/auth.js'
import { fetchStatus } from '../../services/api/client.js'
import { classifyApiError } from '../../services/api/errors.js'
import { useSettings } from '../../services/settings.js'
import { openSettings } from '../settings/settingsDialogState.js'
import './education.css'

type Status = 'loading' | 'ready' | 'missing' | 'unauthorized' | 'offline'

export const ConnectionStatus = () => {
  const zh = useSettings((s) => s.locale === 'zh-CN')
  const token = useAppAuth((s) => s.token)
  const origin = useAppAuth((s) => s.origin)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    if (__APP_MODE__ !== 'server') {
      return
    }
    const controller = new AbortController()
    setStatus('loading')
    fetchStatus(controller.signal)
      .then((data) => {
        setStatus(data.configured ? 'ready' : 'missing')
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return
        }
        setStatus(classifyApiError(error) === 'unauthorized' ? 'unauthorized' : 'offline')
      })
    return () => controller.abort()
  }, [token, origin])

  const label = __APP_MODE__ === 'demo'
    ? (zh ? '演示模式 · 固定示例，未连接真实 AI' : 'DEMO · Fixed sample, no live AI')
    : __APP_MODE__ === 'direct'
      ? (zh ? '个人直连 · 在设置中填写自己的密钥' : 'Personal mode · Configure your own key')
      : status === 'ready'
        ? (zh ? '服务端已配置密钥 · API 能力待实际调用确认' : 'Server key configured · API capabilities depend on service')
        : status === 'missing'
          ? (zh ? '已连接，但服务端尚未配置密钥' : 'Connected, but server key is missing')
          : status === 'unauthorized'
            ? (zh ? '未通过身份验证 · 请在设置中填写访问令牌' : 'Unauthorized · Add your access token in settings')
            : status === 'offline'
              ? (zh ? '无法连接服务器 · 请检查地址与网络' : 'Server unreachable · Check the URL and your network')
              : (zh ? '正在检查服务配置…' : 'Checking server configuration…')

  return (
    <div className="connection-status" role="status">
      <span aria-hidden="true">●</span>
      {status === 'unauthorized' || status === 'offline' ? (
        <button type="button" className="connection-status-link" onClick={() => openSettings('data')}>
          {label}
        </button>
      ) : (
        label
      )}
    </div>
  )
}
