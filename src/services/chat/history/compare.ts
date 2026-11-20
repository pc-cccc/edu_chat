import type {
  AssistantMessage,
  FileAttachment,
  Message,
  ReplyBlock,
  Session,
} from '../types.js'

/**
 * 会话内容指纹：合并导入时用于判断「内容一致的会话 → 跳过」。
 *
 * 只保留能往返于导出格式的内容字段，忽略导入后会丢失或重算的字段：
 * - 消息 ID、父子引用（导出格式会重新编号）；
 * - model / usage / error / 思考签名与耗时 / 引用标记 / 工具调用 ID / 附件 ID 与 MIME；
 * - 状态统一映射回导出格式的状态空间（如「完成但达上限」导出后读回为「已停止」）。
 * 消息按 (createdAt, 内容) 排序，不依赖本地与导入两种消息顺序差异。
 */

const isoMs = (value: string | null | undefined): number | null =>
  value === null || value === undefined ? null : Date.parse(value) || null

/** 映射回导出格式的状态空间；两侧会话用同一规则后可比。 */
const canonicalStatus = (message: AssistantMessage): string => {
  if (message.stopReason === 'refusal') {
    return 'done'
  }
  switch (message.status) {
    case 'done':
      return message.stopReason === 'max_tokens' ? 'stopped' : 'done'
    case 'stopped':
      return 'stopped'
    case 'error':
      return 'error'
    default:
      return 'pending'
  }
}

const canonicalFile = (file: FileAttachment): unknown => [file.name, file.size, file.isImage]

const canonicalBlock = (block: ReplyBlock): unknown => {
  switch (block.type) {
    case 'text':
      return ['text', block.text, block.isTemplate ?? false]
    case 'thinking':
      return ['thinking', block.thinking]
    case 'server_tool_use':
      return ['tool', block.name, block.kind, block.input]
    case 'web_search_tool_result':
      return [
        'search_result',
        block.kind,
        block.content.map((item) =>
          item.type === 'web_search_tool_result_error'
            ? ['error', item.error_code]
            : [
                'result',
                item.url,
                item.title,
                item.snippet,
                item.site_name,
                isoMs(item.page_age),
              ]
        ),
      ]
    case 'web_fetch_tool_result':
      return [
        'fetch_result',
        block.kind,
        block.content.type === 'web_fetch_tool_result_error'
          ? ['error', block.content.error_code]
          : [block.content.url, block.content.content.title, isoMs(block.content.published_at)],
        block.signature ?? '',
      ]
  }
}

const canonicalMessage = (message: Message): unknown =>
  message.role === 'user'
    ? ['user', message.content, message.files.map(canonicalFile)]
    : [
        'assistant',
        canonicalStatus(message),
        message.thinking ?? false,
        message.search ?? false,
        message.blocks.map(canonicalBlock),
      ]

const compareMessages = (a: Message, b: Message): number => {
  const byTime = a.createdAt - b.createdAt
  if (byTime !== 0) {
    return byTime
  }
  const aKey = JSON.stringify(canonicalMessage(a))
  const bKey = JSON.stringify(canonicalMessage(b))
  return aKey < bKey ? -1 : aKey > bKey ? 1 : 0
}

export const sessionContentKey = (session: Session): string =>
  JSON.stringify([session.title, [...session.messages].sort(compareMessages).map(canonicalMessage)])
