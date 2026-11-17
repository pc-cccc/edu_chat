import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  initSupabaseAuth,
  signIn,
  signOut,
  signUp,
  useSupabaseAuth,
} from '../../services/supabase/client.js'

const box: CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  boxSizing: 'border-box',
}
const card: CSSProperties = {
  width: '100%',
  maxWidth: 360,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}
const title: CSSProperties = { margin: 0, fontSize: 20, fontWeight: 600 }
const subtitle: CSSProperties = { margin: 0, color: '#888', fontSize: 13 }
const input: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  boxSizing: 'border-box',
  borderRadius: 8,
  border: '1px solid #d0d0d0',
  fontSize: 15,
}
const button: CSSProperties = {
  padding: '11px 14px',
  borderRadius: 8,
  border: 'none',
  background: '#2563eb',
  color: '#fff',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
}
const link: CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#2563eb',
  cursor: 'pointer',
  fontSize: 13,
  padding: 0,
  textAlign: 'center',
}
const error: CSSProperties = { color: '#dc2626', fontSize: 13, margin: 0 }

/** 邮箱登录 / 注册表单（serverless 模式下的登录墙）。 */
const LoginForm = () => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result =
        mode === 'signin' ? await signIn(email.trim(), password) : await signUp(email.trim(), password)
      if (result.error) {
        setMessage(result.error.message)
      } else if (mode === 'signup' && !result.data.session) {
        setMessage('注册成功，请查收邮箱完成验证后再登录。')
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={box}>
      <div style={card}>
        <h1 style={title}>Edu_chat</h1>
        <p style={subtitle}>登录后即可使用（数据保存在你自己的云端）。</p>
        <input
          style={input}
          type="email"
          placeholder="邮箱"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          style={input}
          type="password"
          placeholder="密码（至少 6 位）"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              void submit()
            }
          }}
        />
        <button style={button} disabled={busy} onClick={() => void submit()}>
          {busy ? '请稍候…' : mode === 'signin' ? '登录' : '注册'}
        </button>
        {message ? <p style={error}>{message}</p> : null}
        <button
          style={link}
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setMessage(null)
          }}
        >
          {mode === 'signin' ? '没有账号？注册' : '已有账号？登录'}
        </button>
      </div>
    </div>
  )
}

/** 设置页里展示的账号信息 + 退出登录。 */
export const ServerlessAccount = () => {
  const user = useSupabaseAuth((s) => s.user)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 14 }}>
        已登录：{user?.email ?? '未知账号'}
      </div>
      <button
        style={{ ...button, background: '#111827' }}
        onClick={() => void signOut()}
      >
        退出登录
      </button>
    </div>
  )
}

/** 登录墙：非 serverless 模式不拦截；serverless 模式未登录时显示登录表单。 */
export const AuthGate = ({ children }: { children: ReactNode }) => {
  const loading = useSupabaseAuth((s) => s.loading)
  const user = useSupabaseAuth((s) => s.user)

  useEffect(() => {
    if (__APP_MODE__ === 'serverless') {
      initSupabaseAuth()
    }
  }, [])

  if (__APP_MODE__ !== 'serverless') {
    return <>{children}</>
  }
  if (loading) {
    return (
      <div style={{ ...box, color: '#888', fontSize: 15 }}>正在检查登录状态…</div>
    )
  }
  if (!user) {
    return <LoginForm />
  }
  return <>{children}</>
}
