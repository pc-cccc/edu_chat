import { create } from 'zustand'
import type { TranslationMessage } from '../../i18n/index.js'
import { createId } from '../../utils/id.js'
import {
  cancelUpload,
  isImage,
  resolveMimeType,
  uploadAttachment,
  validateFiles,
  type UploadTask,
} from '../attachments.js'
import type { FileAttachment } from './types.js'

export type DraftAttachment = {
  /** 本地标识，也是 IndexedDB 原件与上传任务的 key */
  id: string
  file: File
  isImage: boolean
  previewUrl: string | null
}

type Draft = { text: string; attachments: DraftAttachment[] }

export const EMPTY_DRAFT: Draft = { text: '', attachments: [] }

/** 草稿文本存在 localStorage，重启 App 后可恢复；附件含 File/Blob，仍只保留在本次页面内存中。 */
const DRAFT_PREFIX = 'zhixue-chat:draft:'

const draftKey = (sessionId: string | null) => `${DRAFT_PREFIX}${sessionId ?? 'new'}`

const readSavedText = (key: string): string => {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

const writeSavedText = (sessionId: string | null, text: string) => {
  try {
    if (text) {
      localStorage.setItem(draftKey(sessionId), text)
    } else {
      localStorage.removeItem(draftKey(sessionId))
    }
  } catch {
    // 存储不可用时草稿只在内存中生效
  }
}

/** 启动时把已保存的草稿文本读回内存，附件为空。 */
const loadSavedDrafts = (): Map<string | null, Draft> => {
  const drafts = new Map<string | null, Draft>()
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key?.startsWith(DRAFT_PREFIX)) {
        continue
      }
      const text = readSavedText(key)
      if (!text) {
        continue
      }
      const scope = key.slice(DRAFT_PREFIX.length)
      drafts.set(scope === 'new' ? null : scope, { text, attachments: [] })
    }
  } catch {
    // 读取失败时按无草稿处理
  }
  return drafts
}

/** 草稿文本跨重启保留，附件独立于会话详情缓存；null 是新对话的草稿。 */
export const useDrafts = create<{ drafts: Map<string | null, Draft> }>(() => ({
  drafts: loadSavedDrafts(),
}))

export const getDraft = (sessionId: string | null): Draft =>
  useDrafts.getState().drafts.get(sessionId) ?? EMPTY_DRAFT

const updateDraft = (sessionId: string | null, update: (draft: Draft) => Draft) => {
  const current = useDrafts.getState().drafts
  const draft = update(current.get(sessionId) ?? EMPTY_DRAFT)
  const drafts = new Map(current)
  if (draft.text || draft.attachments.length > 0) {
    drafts.set(sessionId, draft)
  } else {
    drafts.delete(sessionId)
  }
  writeSavedText(sessionId, draft.text)
  useDrafts.setState({ drafts })
}

export const setDraftText = (sessionId: string | null, text: string) =>
  updateDraft(sessionId, (draft) => ({ ...draft, text }))

const upload = (attachment: DraftAttachment, apiKey: string) => {
  // 上传任务负责记录错误，输入框的附件卡片展示失败及重试入口。
  void uploadAttachment(
    apiKey,
    attachment.id,
    attachment.file,
    attachment.file.name,
    attachment.isImage
  ).catch(() => {})
}

/** 整批校验通过后才创建预览和开始上传。 */
export const addDraftFiles = (
  sessionId: string | null,
  files: File[],
  apiKey: string
): TranslationMessage | null => {
  if (files.length === 0) {
    return null
  }
  const error = validateFiles(files, getDraft(sessionId).attachments.length)
  if (error) {
    return error
  }
  const added = files.map((file): DraftAttachment => {
    const image = isImage(resolveMimeType(file))
    return {
      id: createId(),
      file,
      isImage: image,
      previewUrl: image ? URL.createObjectURL(file) : null,
    }
  })
  updateDraft(sessionId, (draft) => ({ ...draft, attachments: [...draft.attachments, ...added] }))
  added.forEach((attachment) => upload(attachment, apiKey))
  return null
}

export const retryDraftAttachment = (
  sessionId: string | null,
  attachmentId: string,
  apiKey: string
) => {
  const attachment = getDraft(sessionId).attachments.find((item) => item.id === attachmentId)
  if (attachment) {
    upload(attachment, apiKey)
  }
}

/** 发送按钮和实际提交共用规则：有内容，且全部附件已上传成功。 */
export const prepareDraftMessage = (draft: Draft, tasks: Record<string, UploadTask>) => {
  const text = draft.text.trim()
  if (!text && draft.attachments.length === 0) {
    return null
  }
  const files: (FileAttachment & { serverId: string; blob: Blob })[] = []
  for (const attachment of draft.attachments) {
    const task = tasks[attachment.id]
    if (task?.status !== 'done' || !task.serverId) {
      return null
    }
    files.push({
      id: attachment.id,
      serverId: task.serverId,
      name: attachment.file.name,
      size: attachment.file.size,
      isImage: attachment.isImage,
      mimeType: resolveMimeType(attachment.file),
      blob: attachment.file,
    })
  }
  return { text, files }
}

const releaseAttachment = (attachment: DraftAttachment, cancel: boolean) => {
  if (cancel) {
    cancelUpload(attachment.id)
  }
  if (attachment.previewUrl) {
    URL.revokeObjectURL(attachment.previewUrl)
  }
}

export const removeDraftAttachment = (sessionId: string | null, attachmentId: string) => {
  const attachment = getDraft(sessionId).attachments.find((item) => item.id === attachmentId)
  if (!attachment) {
    return
  }
  releaseAttachment(attachment, true)
  updateDraft(sessionId, (draft) => ({
    ...draft,
    attachments: draft.attachments.filter((item) => item.id !== attachmentId),
  }))
}

/** 发送成功后原件与 serverId 已交给会话，释放预览但保留上传完成态。 */
export const clearSentDraft = (sessionId: string | null) => {
  getDraft(sessionId).attachments.forEach((attachment) => releaseAttachment(attachment, false))
  updateDraft(sessionId, () => EMPTY_DRAFT)
}

/** 删除会话或替换历史成功后，释放尚未发送的草稿及上传任务。 */
export const clearDraft = (sessionId: string | null) => {
  getDraft(sessionId).attachments.forEach((attachment) => releaseAttachment(attachment, true))
  updateDraft(sessionId, () => EMPTY_DRAFT)
}

export const clearAllDrafts = () => {
  for (const draft of useDrafts.getState().drafts.values()) {
    draft.attachments.forEach((attachment) => releaseAttachment(attachment, true))
  }
  try {
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(DRAFT_PREFIX)) {
        keys.push(key)
      }
    }
    keys.forEach((key) => localStorage.removeItem(key))
  } catch {
    // 存储不可用时只清理内存
  }
  useDrafts.setState({ drafts: new Map() })
}
