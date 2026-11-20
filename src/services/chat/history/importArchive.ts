import * as db from '../db.js'
import { createId } from '../../../utils/id.js'
import type { Session } from '../types.js'
import { BackupError, fail } from './errors.js'
import type { SessionIndexEntry } from './format.js'
import { INDEX_PATH, MANIFEST_PATH, USER_PATH, parseSessionPath, sessionFilesDir } from './paths.js'
import { checkManifest, readSessionFile, readSessionIndex } from './schema.js'
import { toLocalSession } from './toLocal.js'
import { sessionContentKey } from './compare.js'
import {
  ArchiveError,
  isZipFile,
  readArchive,
  readEntry,
  skipEntry,
  type ArchiveEntry,
} from './zipReader.js'

export type ImportResult = { added: number; skipped: number }

/** 图片条目所属的归档会话 ID；非图片目录条目返回空串。 */
const ownerOf = (path: string): string =>
  /^chat_sessions\/([^/]+)_files\//.exec(path)?.[1] ?? ''

/** 从原件字节补充图片 MIME；无法识别时为空字符串，图片身份仍由归档的 is_image 决定。 */
const imageType = (bytes: Uint8Array): string => {
  const startsWith = (...prefix: number[]) => prefix.every((byte, index) => bytes[index] === byte)
  const header = new TextDecoder('ascii').decode(bytes.subarray(0, 12))
  if (startsWith(0xff, 0xd8, 0xff)) {
    return 'image/jpeg'
  }
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return 'image/png'
  }
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) {
    return 'image/gif'
  }
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') {
    return 'image/webp'
  }
  if (startsWith(0x42, 0x4d)) {
    return 'image/bmp'
  }
  if (startsWith(0x49, 0x49, 0x2a, 0) || startsWith(0x4d, 0x4d, 0, 0x2a)) {
    return 'image/tiff'
  }
  if (header.slice(4, 8) === 'ftyp' && ['avif', 'avis'].includes(header.slice(8, 12))) {
    return 'image/avif'
  }
  return ''
}

const readJson = async (entry: ArchiveEntry): Promise<unknown> => {
  const text = await (await readEntry(entry)).text()
  try {
    return JSON.parse(text)
  } catch {
    return fail('backupInvalidJson')
  }
}

/**
 * 检查 ZIP 格式、首个 manifest 条目及格式版本。
 * 校验失败时保留正在生成的回答和现有暂存数据。
 */
export const checkArchiveFormat = async (file: File): Promise<void> => {
  if (!(await isZipFile(file))) {
    fail('backupUnrecognized')
  }
  try {
    for await (const entry of readArchive(file)) {
      if (entry.path !== MANIFEST_PATH) {
        fail('backupUnrecognized')
      }
      checkManifest(await readJson(entry))
      return
    }
  } catch (error) {
    throw error instanceof ArchiveError ? new BackupError('backupIncomplete') : error
  }
  fail('backupUnrecognized')
}

/**
 * 流式导入：manifest → user（不导入）→ 全部会话 JSON → index → 全部图片。
 * 也支持会话与图片交错排列、index 位于末尾的条目顺序。
 * 会话读完立即暂存，只保留图片路径映射；图片全部读完后逐会话回填 MIME，不改变图片身份。
 * 写入导入暂存存储；调用方负责先清空暂存，成功后替换或合并进正式数据，失败时清理暂存。
 *
 * replace：全部会话写入暂存，随后整体替换正式数据。
 * merge：与本地会话比对——内容一致（含同 ID 或不同 ID 的既有会话）跳过；
 * 同 ID 内容不同且没有内容一致的既有会话时，以新 ID 保留为副本；其余作为新会话加入。
 * 跳过的会话仍会回填本地缺失的图片原件。返回新加入与跳过的会话数。
 */
export const importArchive = async (
  file: File,
  mode: 'merge' | 'replace' = 'replace'
): Promise<ImportResult> => {
  if (!(await isZipFile(file))) {
    fail('backupUnrecognized')
  }
  const imported = new Set<string>()
  /** 写入暂存的会话（归档里的原始 ID）；skipped 为内容一致而跳过的原始 ID。 */
  const written = new Set<string>()
  const skipped = new Set<string>()
  const images = new Map<string, string>()
  /** 已保存的原件：文件 ID → MIME。同一图片出现在多个会话目录时只保存一次。 */
  const stored = new Map<string, string>()
  let manifest = false
  let index: SessionIndexEntry[] | undefined
  let currentSessionId: string | undefined
  /** 合并模式：本地全部会话的内容指纹与按 ID 索引，导入开始前取快照。 */
  let liveKeys: Set<string> | null = null
  let liveById: Map<string, Session> | null = null
  if (mode === 'merge') {
    const live = await db.loadAllSessions()
    liveKeys = new Set(live.map(sessionContentKey))
    liveById = new Map(live.map((session) => [session.id, session]))
  }
  /** 合并模式下跳过的会话所引用、但本地缺失原件的文件 ID；读到 index 后一次性确定。 */
  let missingFiles = new Set<string>()

  const saveImage = async (entry: ArchiveEntry, id: string) => {
    if (stored.has(id)) {
      await skipEntry(entry)
      return
    }
    const data = await readEntry(entry)
    const type = imageType(new Uint8Array(await data.slice(0, 16).arrayBuffer()))
    await db.saveStagingFiles([{ id, blob: new Blob([data], { type }) }])
    stored.set(id, type)
  }

  try {
    for await (const entry of readArchive(file)) {
      const { path } = entry
      const sessionId = parseSessionPath(path)
      if (!manifest) {
        if (path !== MANIFEST_PATH) {
          fail('backupUnrecognized')
        }
        checkManifest(await readJson(entry))
        manifest = true
      } else if (path === USER_PATH && !index && imported.size === 0) {
        // 账号信息（已脱敏）不导入；文件可能缺失。
        await skipEntry(entry)
      } else if (sessionId !== null && !index) {
        const local = toLocalSession(readSessionFile(await readJson(entry)))
        if (local.session.id !== sessionId || imported.has(sessionId)) {
          fail('backupIncomplete')
        }
        imported.add(sessionId)
        currentSessionId = sessionId
        for (const [imagePath, id] of local.images) {
          images.set(imagePath, id)
        }
        if (mode === 'merge' && liveKeys && liveById) {
          const key = sessionContentKey(local.session)
          if (liveKeys.has(key)) {
            // 本地已有内容一致的会话（无论 ID 是否相同），跳过。
            skipped.add(sessionId)
          } else {
            if (liveById.has(sessionId)) {
              // 同 ID 但内容不同：换新 ID 保留为副本，消息、分支与附件引用保持原样。
              local.session.id = createId()
            }
            await db.addStagingSession(local.session)
            written.add(sessionId)
            // 同步纳入比对，避免同一归档里内容重复的会话被重复加入。
            liveKeys.add(key)
          }
        } else {
          await db.addStagingSession(local.session)
          written.add(sessionId)
        }
      } else if (path === INDEX_PATH && !index) {
        index = readSessionIndex(await readJson(entry))
        if (mode === 'merge') {
          // 全部会话已解析完，确定跳过的会话里本地缺失的原件。
          const skippedFileIds = [...images]
            .filter(([imagePath]) =>
              skipped.has(/^chat_sessions\/([^/]+)_files\//.exec(imagePath)?.[1] ?? '')
            )
            .map(([, id]) => id)
          missingFiles = await db.loadMissingFileIds(skippedFileIds)
        }
      } else if (
        index
          ? imported.has(/^chat_sessions\/([^/]+)_files\//.exec(path)?.[1] ?? '')
          : currentSessionId && path.startsWith(sessionFilesDir(currentSessionId))
      ) {
        // 没有被引用的条目不保存，引用了但缺失的图片只展示文件名。
        const id = images.get(path)
        if (id === undefined) {
          await skipEntry(entry)
        } else if (mode === 'merge' && skipped.has(ownerOf(path))) {
          // 跳过的会话只回填本地缺失的原件（index 之前按保守策略直接跳过），不覆盖已有原件。
          if (missingFiles.has(id)) {
            missingFiles.delete(id)
            await saveImage(entry, id)
          } else {
            await skipEntry(entry)
          }
        } else {
          await saveImage(entry, id)
        }
      } else {
        fail('backupIncomplete')
      }
    }
  } catch (error) {
    throw error instanceof ArchiveError ? new BackupError('backupIncomplete') : error
  }
  if (!manifest) {
    fail('backupUnrecognized')
  }
  // index 只列出成功写出的会话，与会话文件一一对应；合并模式还包含跳过的会话。
  const listed = new Set(index?.map((entry) => entry.id))
  if (
    !index ||
    listed.size !== index.length ||
    listed.size !== imported.size ||
    [...imported].some((id) => !listed.has(id))
  ) {
    fail('backupIncomplete')
  }
  await db.updateStagingFileTypes(stored)
  return { added: written.size, skipped: skipped.size }
}
