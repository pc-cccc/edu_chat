import { getSupabase } from '../supabase/client.js'
import { normalizeSession } from './branches.js'
import type { Message, Session, SessionSummary } from './types.js'

/**
 * 个人云端历史（Supabase）同步层。
 *
 * 设计：
 * - chat_rooms 即「会话」，messages 每条消息一行；消息完整内容放在 data jsonb 里，
 *   保留分支（parentId/selectedChildId/rootMessageId）、思考块、引用、状态与错误。
 * - 稳定 ID：沿用本地消息/会话的 UUID 作为主键，跨设备一致；用 upsert 实现幂等重试。
 * - 分页：按 (created_at, id) 游标分页加载长会话。
 * - 流式显示仍在本地更新，只有会话落盘时才调用 cloudSaveSession（见 store.ts 的 persist）。
 */

const toIso = (ms: number): string => new Date(ms).toISOString()

type RoomRow = {
  id: string
  name: string
  root_message_id: string | null
  created_at: string
  updated_at: string
}

/** 列出当前用户的全部会话摘要（云端为准，按最近活动倒序）。 */
export const cloudListSessions = async (): Promise<SessionSummary[]> => {
  const { data, error } = await getSupabase()
    .from('chat_rooms')
    .select('id, name, created_at, updated_at')
    .order('updated_at', { ascending: false })
  if (error) {
    throw error
  }
  return (data ?? []).map(
    (row: { id: string; name: string; created_at: string; updated_at: string }) => ({
      id: row.id,
      title: row.name,
      createdAt: Date.parse(row.created_at),
      updatedAt: Date.parse(row.updated_at),
    })
  )
}

/** 读取单个会话（含分页加载全部消息，按创建顺序与稳定 ID 排序）。 */
export const cloudLoadSession = async (id: string): Promise<Session | null> => {
  const supabase = getSupabase()
  const { data: room, error: roomError } = await supabase
    .from('chat_rooms')
    .select('id, name, root_message_id, created_at, updated_at')
    .eq('id', id)
    .single()
  if (roomError || !room) {
    return null
  }
  const roomRow = room as RoomRow

  const messages: Message[] = []
  const pageSize = 200
  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabase
      .from('messages')
      .select('data')
      .eq('room_id', id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) {
      throw error
    }
    const rows = page ?? []
    for (const row of rows) {
      const value = (row as { data?: unknown }).data
      if (value && typeof value === 'object') {
        messages.push(value as Message)
      }
    }
    if (rows.length < pageSize) {
      break
    }
  }

  return {
    id: roomRow.id,
    title: roomRow.name,
    createdAt: Date.parse(roomRow.created_at),
    updatedAt: Date.parse(roomRow.updated_at),
    messages,
    rootMessageId: roomRow.root_message_id ?? null,
  }
}

/** 保存整个会话：先 upsert 会话行，再分批 upsert 消息（幂等，onConflict=id）。 */
export const cloudSaveSession = async (session: Session): Promise<void> => {
  const supabase = getSupabase()
  const normalized = normalizeSession(session)

  const { error: roomError } = await supabase.from('chat_rooms').upsert({
    id: normalized.id,
    name: normalized.title || '新会话',
    root_message_id: normalized.rootMessageId ?? null,
    created_at: toIso(normalized.createdAt),
    updated_at: toIso(normalized.updatedAt),
  })
  if (roomError) {
    throw roomError
  }

  const rows = normalized.messages.map((message) => ({
    id: message.id,
    room_id: normalized.id,
    role: message.role,
    parent_id: message.parentId ?? null,
    created_at: toIso(message.createdAt),
    data: message,
  }))
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from('messages').upsert(rows.slice(i, i + 200), {
      onConflict: 'id',
    })
    if (error) {
      throw error
    }
  }
}

/** 重命名会话（更新 name 与 updated_at）。 */
export const cloudRenameSession = async (id: string, title: string): Promise<void> => {
  const { error } = await getSupabase()
    .from('chat_rooms')
    .update({ name: title, updated_at: toIso(Date.now()) })
    .eq('id', id)
  if (error) {
    throw error
  }
}

/** 删除会话（messages 通过外键级联删除）。 */
export const cloudDeleteSession = async (id: string): Promise<void> => {
  const { error } = await getSupabase().from('chat_rooms').delete().eq('id', id)
  if (error) {
    throw error
  }
}
