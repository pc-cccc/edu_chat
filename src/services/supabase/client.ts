import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { create } from 'zustand'

/**
 * Supabase 客户端（仅 serverless 模式使用）。
 * URL 与 anon key 通过构建期注入（__SUPABASE_URL__ / __SUPABASE_ANON_KEY__），
 * 二者都是公开值，允许出现在前端；数据安全由数据库 RLS 保证。
 */
let client: SupabaseClient | null = null

export const getSupabase = (): SupabaseClient => {
  if (!client) {
    client = createClient(__SUPABASE_URL__, __SUPABASE_ANON_KEY__, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  }
  return client
}

export type AuthUser = { id: string; email?: string | null }

type AuthState = {
  loading: boolean
  user: AuthUser | null
}

export const useSupabaseAuth = create<AuthState>(() => ({ loading: true, user: null }))

let authInitialized = false

/** 初始化：读取已有会话并监听登录状态变化（幂等，避免重复订阅）。 */
export const initSupabaseAuth = (): void => {
  if (authInitialized) {
    return
  }
  authInitialized = true
  const supabase = getSupabase()
  void supabase.auth.getSession().then(({ data }) => {
    useSupabaseAuth.setState({ user: data.session?.user ?? null, loading: false })
  })
  supabase.auth.onAuthStateChange((_event, session) => {
    useSupabaseAuth.setState({ user: session?.user ?? null, loading: false })
  })
}

/** 供 API 层使用：拿到当前 Supabase 登录态 token，交给 Worker 校验。 */
export const getAccessToken = async (): Promise<string | null> => {
  const { data } = await getSupabase().auth.getSession()
  return data.session?.access_token ?? null
}

export const signIn = (email: string, password: string) =>
  getSupabase().auth.signInWithPassword({ email, password })

export const signUp = (email: string, password: string) =>
  getSupabase().auth.signUp({ email, password })

export const signOut = () => getSupabase().auth.signOut()

// ---------------------------------------------------------------------------
// 数据访问（供聊天历史 / 组件偏好 / 多人协作使用）
// ---------------------------------------------------------------------------

export type ChatRoom = { id: string; name: string; owner_id: string; created_at: string }

export type ChatMessageRow = {
  id: string
  room_id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string | null
  blocks: Record<string, unknown> | null
  parent_id: string | null
  model: string | null
  thinking: boolean
  search: boolean
  files: unknown | null
  status: string
  created_at: string
}

/** 读取一个聊天室的消息（按时间正序）。 */
export const listMessages = async (roomId: string): Promise<ChatMessageRow[]> => {
  const { data, error } = await getSupabase()
    .from('messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
  if (error) {
    throw error
  }
  return (data ?? []) as ChatMessageRow[]
}

/** 写入一条聊天消息。 */
export const insertMessage = async (message: {
  room_id: string
  role: 'user' | 'assistant'
  content?: string | null
  blocks?: Record<string, unknown> | null
  parent_id?: string | null
  model?: string | null
  thinking?: boolean
  search?: boolean
  files?: unknown | null
  status?: string
}): Promise<ChatMessageRow> => {
  const { data, error } = await getSupabase()
    .from('messages')
    .insert({
      room_id: message.room_id,
      role: message.role,
      content: message.content ?? null,
      blocks: message.blocks ?? null,
      parent_id: message.parent_id ?? null,
      model: message.model ?? null,
      thinking: message.thinking ?? false,
      search: message.search ?? false,
      files: message.files ?? null,
      status: message.status ?? 'done',
    })
    .select()
    .single()
  if (error) {
    throw error
  }
  return data as ChatMessageRow
}

/** 读取当前用户的组件勾选列表。 */
export const getPreferences = async (): Promise<string[]> => {
  const { data, error } = await getSupabase()
    .from('user_preferences')
    .select('components')
    .single()
  if (error) {
    return []
  }
  return Array.isArray(data?.components) ? (data.components as string[]) : []
}

/** 保存当前用户的组件勾选列表。 */
export const savePreferences = async (components: string[]): Promise<void> => {
  const userId = useSupabaseAuth.getState().user?.id
  if (!userId) {
    throw new Error('未登录')
  }
  const { error } = await getSupabase().from('user_preferences').upsert({
    user_id: userId,
    components,
    updated_at: new Date().toISOString(),
  })
  if (error) {
    throw error
  }
}

/** 订阅某个聊天室的实时变更（新消息/在线状态），返回频道对象，可 channel.unsubscribe()。 */
export const subscribeRoom = (
  roomId: string,
  onMessage: (row: ChatMessageRow) => void,
  onPresence?: (row: { user_id: string; online: boolean; last_seen: string }) => void
): RealtimeChannel => {
  const channel = getSupabase().channel(`room-${roomId}`)
  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
    (payload) => onMessage(payload.new as ChatMessageRow)
  )
  if (onPresence) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'presence', filter: `room_id=eq.${roomId}` },
      (payload) =>
        onPresence(
          payload.new as { user_id: string; online: boolean; last_seen: string }
        )
    )
  }
  void channel.subscribe()
  return channel
}
