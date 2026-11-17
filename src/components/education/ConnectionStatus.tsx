import { useEffect, useState } from 'react'
import { useAppAuth } from '../../services/api/auth.js'
import { fetchStatus } from '../../services/api/client.js'
import { classifyApiError } from '../../services/api/errors.js'
import { useSettings } from '../../services/settings.js'
import { signOut, useSupabaseAuth } from '../../services/supabase/client.js'
import { openSettings } from '../settings/settingsDialogState.js'
import './education.css'

type Status = 'loading' | 'unconfigured' | 'ready' | 'missing' | 'unauthorized' | 'offline'

export const ConnectionStatus = () => {
  const zh = useSettings((s) => s.locale === 'zh-CN')
  const token = useAppAuth((s) => s.token)
  const origin = useAppAuth((s) => s.origin)
  const authEmail = useSupabaseAuth((s) => s.user?.email ?? null)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    if (__APP_MODE__ !== 'server') {
      return
    }
    if (__APP_TARGET__ === 'android' && !origin) {
      setStatus('unconfigured')
      return
    }
    const controller = new AbortController()
    setStatus('loading')
    fetchStatus(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setStatus(data.configured ? 'ready' : 'missing')
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return
        }
        setStatus(classifyApiError(error) === 'unauthorized' ? 'unauthorized' : 'offline')
      })
    return () => controller.abort()
  }, [token, origin])

  // serverless：登录态由 Supabase Auth 维护，无需服务器连接检查。
  if (__APP_MODE__ === 'serverless') {
    return (
      <div className="connection-status" role="status">
        <span aria-hidden="true">●</span>
        {zh ? '已登录' : 'Signed in'}
        {authEmail ? ` · ${authEmail}` : ''}
        <button
          type="button"
          className="connection-status-link"
          onClick={() => void signOut()}
        >
          {zh ? '退出登录' : 'Sign out'}
        </button>
      </div>
    )
  }

  const label =
    __APP_MODE__ === 'demo'
      ? zh
        ? '演示模式 · 固定示例，未连接真实 AI'
        : 'DEMO · Fixed sample, no live AI'
      : __APP_MODE__ === 'direct'
        ? zh
          ? '个人直连 · 在设置中填写自己的密钥'
          : 'Personal mode · Configure your own key'
        : status === 'unconfigured'
          ? zh
            ? '设置服务器，开始聊天'
            : 'Set up your server to start chatting'
          : status === 'ready'
            ? zh
              ? '服务端已配置密钥 · API 能力待实际调用确认'
              : 'Server key configured · API capabilities depend on service'
            : status === 'missing'
              ? zh
                ? '已连接，但服务端尚未配置密钥'
                : 'Connected, but server key is missing'
              : status === 'unauthorized'
                ? zh
                  ? '未通过身份验证 · 请在设置中填写访问令牌'
                  : 'Unauthorized · Add your access token in settings'
                : status === 'offline'
                  ? zh
                    ? '无法连接服务器 · 请检查地址与网络'
                    : 'Server unreachable · Check the URL and your network'
                  : zh
                    ? '正在检查服务配置…'
                    : 'Checking server configuration…'

  return (
    <div className="connection-status" role="status">
      <span aria-hidden="true">●</span>
      {status === 'unconfigured' ||
      status === 'unauthorized' ||
      status === 'offline' ||
      status === 'missing' ? (
        <button
          type="button"
          className="connection-status-link"
          onClick={() => openSettings('data')}
        >
          {label}
        </button>
      ) : (
        label
      )}
    </div>
  )
}
