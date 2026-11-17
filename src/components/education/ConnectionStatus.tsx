import { useEffect, useState } from 'react'
import { useSettings } from '../../services/settings.js'
import './education.css'

export const ConnectionStatus = () => {
  const zh = useSettings((s) => s.locale === 'zh-CN')
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'offline'>('loading')
  useEffect(() => {
    if (__APP_MODE__ !== 'server') {
      return
    }
    const controller = new AbortController()
    fetch('/api/status', { signal: controller.signal }).then(async (response) => {
      if (!response.ok) {
        throw new Error('status')
      }
      const data = await response.json() as { configured: boolean }
      setStatus(data.configured ? 'ready' : 'missing')
    }).catch(() => {
      if (!controller.signal.aborted) {
        setStatus('offline')
      }
    })
    return () => controller.abort()
  }, [])
  const label = __APP_MODE__ === 'demo'
    ? (zh ? '演示模式 · 固定示例，未连接真实 AI' : 'DEMO · Fixed sample, no live AI')
    : __APP_MODE__ === 'direct'
      ? (zh ? '个人直连 · 在设置中填写自己的密钥' : 'Personal mode · Configure your own key')
      : status === 'ready'
        ? (zh ? '服务端已配置密钥 · API 能力待实际调用确认' : 'Server key configured · API capabilities depend on service')
        : status === 'missing'
          ? (zh ? '尚未配置密钥 · 请按 README 设置服务端 .env' : 'API key missing · See README for server setup')
          : status === 'offline'
            ? (zh ? '服务连接不可用 · 请检查服务是否启动' : 'Server unavailable · Check the running service')
            : (zh ? '正在检查服务配置…' : 'Checking server configuration…')
  return <div className="connection-status" role="status"><span aria-hidden="true">●</span> {label}</div>
}
