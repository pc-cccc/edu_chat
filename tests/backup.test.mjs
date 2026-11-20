import { test } from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'

// 构建注入的全局变量：src 模块初始化时会读取。
globalThis.__APP_MODE__ = 'direct'
globalThis.__APP_VERSION__ = '0.0.0-test'

const db = await import('../src/services/chat/db.ts')
const { exportArchive } = await import('../src/services/chat/history/exportArchive.ts')
const { importArchive } = await import('../src/services/chat/history/importArchive.ts')
const { writeArchive } = await import('../src/services/chat/history/zipWriter.ts')
const { readArchive, readEntry } = await import('../src/services/chat/history/zipReader.ts')
const { toSessionFile } = await import('../src/services/chat/history/toArchive.ts')
const { toLocalSession } = await import('../src/services/chat/history/toLocal.ts')
const { sessionContentKey } = await import('../src/services/chat/history/compare.ts')

let scopeIndex = 0
const freshScope = () => {
  db.setUserScope(`backup-test-${++scopeIndex}`)
}

/** 1x1 PNG 的原件字节；第二个 PNG 只是改动了 IDAT 区的字节，头部仍可识别。 */
const PNG_A = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  ),
  (char) => char.charCodeAt(0)
)
const PNG_B = PNG_A.slice()
PNG_B[PNG_B.length - 12] ^= 0xff

const DAY = Date.UTC(2026, 10, 20, 8)

const textBlock = (text, extra = {}) => ({ type: 'text', text, ...extra })
const thinkBlock = (thinking, extra = {}) => ({ type: 'thinking', thinking, ...extra })

const userMsg = (id, content, createdAt, { files = [], parentId = null, children = [] } = {}) => ({
  id,
  role: 'user',
  content,
  files,
  createdAt,
  parentId,
  selectedChildId: children[0] ?? null,
})

const replyMsg = (id, parentId, createdAt, blocks, { status = 'done', ...extra } = {}) => ({
  id,
  role: 'assistant',
  createdAt,
  model: 'deepseek-flash',
  thinking: false,
  search: false,
  prefix: false,
  status,
  blocks,
  parentId,
  selectedChildId: null,
  ...extra,
})

const imageFile = (id) => ({
  id,
  serverId: null,
  name: 'photo.png',
  size: PNG_A.length,
  isImage: true,
  mimeType: 'image/png',
})

const makeSession = ({ id, title = '', createdAt = DAY, messages }) => ({
  id,
  title,
  createdAt,
  updatedAt: createdAt + messages.length,
  rootMessageId: messages[0]?.id ?? null,
  messages,
})

const saveAll = async (sessions, files = []) => {
  for (const file of files) {
    await db.saveFiles([file])
  }
  for (const session of sessions) {
    await db.saveSession(session)
  }
}

const exportSessions = async (sessions) =>
  exportArchive(
    (async function* () {
      for (const session of sessions) {
        yield session
      }
    })()
  )

const asFile = (blob) => new File([blob], 'backup.zip')

const readZip = async (file) => {
  const entries = []
  for await (const entry of readArchive(file)) {
    const data = await readEntry(entry)
    entries.push({
      path: entry.path,
      text: await data.text(),
      bytes: new Uint8Array(await data.arrayBuffer()),
    })
  }
  return entries
}

/** 模拟 store 层的流程：清空暂存 → 解析写入 → 原子替换/合并 → 返回结果与完整摘要。 */
const runImport = async (file, mode) => {
  await db.clearStaging()
  const result = await importArchive(file, mode)
  const summaries = mode === 'merge' ? await db.mergeStaging() : await db.commitStaging()
  return { result, summaries }
}

/** 三份覆盖功能面的会话：图片 + Markdown + 数学公式；思考内容；消息分支。 */
const richSessions = () => {
  const q1 = userMsg('u1', '看这张图，解方程 $$\\int_0^1 x\\,dx = ?$$ 并**说明**。', DAY, {
    files: [imageFile('img-1')],
    children: ['a1', 'a2'],
  })
  const a1 = replyMsg('a1', 'u1', DAY + 1, [
    thinkBlock('先算原函数，再代入上下限。', { startedAt: DAY + 1, endedAt: DAY + 2 }),
    textBlock('结果是 $\\frac{1}{2}$，即 **0.5**。'),
  ])
  const a2 = replyMsg('a2', 'u1', DAY + 2, [textBlock('这是另一个分支的回答。')], {
    status: 'stopped',
  })
  const q2 = userMsg('u2', '第二问：1+1', DAY + 3, { parentId: 'a1', children: ['a3'] })
  q2.parentId = 'a1'
  a1.selectedChildId = 'a3'
  const a3 = replyMsg('a3', 'u2', DAY + 4, [textBlock('等于 2。')])
  const s1 = makeSession({ id: 'rich-1', title: '图文公式会话', messages: [q1, a1, a2, q2, a3] })
  const s2 = makeSession({
    id: 'rich-2',
    title: '简单会话',
    createdAt: DAY + 100,
    messages: [
      userMsg('u1', '你好', DAY + 100, { children: ['a1'] }),
      replyMsg('a1', 'u1', DAY + 101, [textBlock('你好！')]),
    ],
  })
  const s3 = makeSession({
    id: 'rich-3',
    title: '',
    createdAt: DAY + 200,
    messages: [
      userMsg('u1', '思考题', DAY + 200, { children: ['a1'] }),
      replyMsg('a1', 'u1', DAY + 201, [thinkBlock('想一想。'), textBlock('答案略。')], {
        thinking: true,
      }),
    ],
  })
  return { s1, s2, s3 }
}

test('导出子集：ZIP 内容与选择一致，包含图片原件，不含 API Key 与账号信息', async () => {
  freshScope()
  const { s1, s2, s3 } = richSessions()
  await saveAll([s1, s2, s3], [{ id: 'img-1', blob: new Blob([PNG_A]) }])

  const subset = await asFile(await exportSessions([s1]))
  const entries = await readZip(subset)
  assert.deepEqual(
    entries.map((entry) => entry.path),
    ['manifest.json', 'chat_sessions/rich-1.json', 'chat_session_index.json', 'chat_sessions/rich-1_files/img-1_photo.png']
  )
  const index = JSON.parse(entries.find((entry) => entry.path === 'chat_session_index.json').text)
  assert.deepEqual(index.map((item) => item.id), ['rich-1'])
  const sessionJson = entries.find((entry) => entry.path === 'chat_sessions/rich-1.json').text
  assert.match(sessionJson, /\\int_0\^1/)
  assert.match(sessionJson, /先算原函数/)
  assert.match(sessionJson, /另一个分支的回答/)
  const imageEntry = entries.find((entry) => entry.path.endsWith('img-1_photo.png'))
  assert.deepEqual(imageEntry.bytes, PNG_A)
  // 归档只含对话内容：不出现密钥形态的字符串，也没有 user.json。
  for (const entry of entries) {
    assert.doesNotMatch(entry.text, /sk-[A-Za-z0-9]{16,}/)
  }
  assert.ok(!entries.some((entry) => entry.path === 'user.json'))

  const all = await asFile(await exportSessions([s1, s2, s3]))
  const allEntries = await readZip(all)
  const allIndex = JSON.parse(allEntries.find((entry) => entry.path === 'chat_session_index.json').text)
  assert.deepEqual(
    allIndex.map((item) => item.id).sort(),
    ['rich-1', 'rich-2', 'rich-3']
  )
})

test('替换导入往返：消息、分支与图片原件完整恢复', async () => {
  freshScope()
  const { s1 } = richSessions()
  await saveAll([s1], [{ id: 'img-1', blob: new Blob([PNG_A]) }])
  const file = await asFile(await exportSessions([s1]))

  const { summaries } = await runImport(file, 'replace')
  assert.deepEqual(summaries.map((item) => item.id), ['rich-1'])
  const imported = await db.loadSession('rich-1')
  assert.equal(imported.messages.length, 5)
  assert.equal(imported.rootMessageId, '1')
  const q1 = imported.messages.find((message) => message.role === 'user')
  assert.equal(q1.content.includes('\\int_0^1'), true)
  // 两个分支挂在同一提问下，当前选中路径停在 a1（导出时的可见末尾）。
  const byId = new Map(imported.messages.map((message) => [message.id, message]))
  assert.equal(byId.get('2').parentId, '1')
  assert.equal(byId.get('3').parentId, '1')
  assert.equal(q1.selectedChildId, '2')
  assert.equal(byId.get('2').blocks[0].thinking, '先算原函数，再代入上下限。')
  // 图片原件随导入恢复。
  const blob = await db.loadFile('img-1')
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), PNG_A)
})

test('合并导入：相同跳过、同 ID 不同内容保留副本、原会话不变、重复导入幂等', async () => {
  freshScope()
  // base 用「简单版」内容，便于后续改成不同内容。
  const base = makeSession({
    id: 'merge-1',
    title: '合并会话',
    messages: [
      userMsg('u1', '第一版问题', DAY, { children: ['a1'] }),
      replyMsg('a1', 'u1', DAY + 1, [textBlock('第一版回答。')]),
    ],
  })
  const other = makeSession({
    id: 'merge-2',
    title: '已有会话',
    createdAt: DAY + 50,
    messages: [
      userMsg('u1', '别删我', DAY + 50, { children: ['a1'] }),
      replyMsg('a1', 'u1', DAY + 51, [textBlock('好的。')]),
    ],
  })
  await saveAll([base, other])
  const file = await asFile(await exportSessions([base]))

  // 第一轮：内容完全一致 → 跳过，不新增、不删除。
  const first = await runImport(file, 'merge')
  assert.deepEqual(first.result, { added: 0, skipped: 1 })
  assert.deepEqual(
    (await db.loadSessionSummaries()).map((item) => item.id).sort(),
    ['merge-1', 'merge-2']
  )
  assert.equal((await db.loadSession('merge-2')).messages[0].content, '别删我')

  // 本地改动 merge-1 的内容，再导入旧归档：同 ID 但内容不同 → 保留副本，原会话不变。
  const changed = await db.loadSession('merge-1')
  changed.messages.push(
    userMsg('u2', '追问', DAY + 2, { parentId: 'a1', children: ['a2'] }),
    replyMsg('a2', 'u2', DAY + 3, [textBlock('追问的回答。')], { parentId: 'u2' })
  )
  await db.saveSession(changed)

  const second = await runImport(file, 'merge')
  assert.deepEqual(second.result, { added: 1, skipped: 0 })
  const summaries = await db.loadSessionSummaries()
  assert.equal(summaries.length, 3)
  const original = await db.loadSession('merge-1')
  assert.equal(original.messages.length, 4)
  assert.equal(original.messages[2].content, '追问')
  const copyId = summaries.find((item) => item.id !== 'merge-1' && item.id !== 'merge-2').id
  const copy = await db.loadSession(copyId)
  assert.equal(copy.messages.length, 2)
  assert.equal(copy.messages[0].content, '第一版问题')
  assert.equal(copy.messages[1].blocks[0].text, '第一版回答。')
  assert.equal(copy.rootMessageId, '1')
  assert.equal(copy.messages[1].parentId, '1')

  // 第三轮：同一归档再导入 → 副本已存在，全部跳过，不再产生新记录。
  const third = await runImport(file, 'merge')
  assert.deepEqual(third.result, { added: 0, skipped: 1 })
  assert.equal((await db.loadSessionSummaries()).length, 3)
})

test('合并导入：跳过时回填缺失图片原件，已有原件不被覆盖', async () => {
  // 来源库：会话带图片原件，导出归档。
  db.setUserScope('backup-test-src')
  const session = makeSession({
    id: 'img-session',
    title: '图片会话',
    messages: [
      userMsg('u1', '看这张图', DAY, { files: [imageFile('img-1')], children: ['a1'] }),
      replyMsg('a1', 'u1', DAY + 1, [textBlock('看到了。')]),
    ],
  })
  await saveAll([session], [{ id: 'img-1', blob: new Blob([PNG_A]) }])
  const file = await asFile(await exportSessions([session]))

  // 目标库一：同一会话但本地缺原件 → 合并导入应回填。
  db.setUserScope('backup-test-restore')
  await saveAll([session])
  const restored = await runImport(file, 'merge')
  assert.deepEqual(restored.result, { added: 0, skipped: 1 })
  const restoredBlob = await db.loadFile('img-1')
  assert.deepEqual(new Uint8Array(await restoredBlob.arrayBuffer()), PNG_A)

  // 目标库二：本地已有不同字节的同 ID 原件 → 跳过时不覆盖。
  db.setUserScope('backup-test-keep')
  await saveAll([session], [{ id: 'img-1', blob: new Blob([PNG_B]) }])
  const kept = await runImport(file, 'merge')
  assert.deepEqual(kept.result, { added: 0, skipped: 1 })
  const keptBlob = await db.loadFile('img-1')
  assert.deepEqual(new Uint8Array(await keptBlob.arrayBuffer()), PNG_B)
})

test('替换导入：以归档内容整体替换本地历史', async () => {
  freshScope()
  const { s3 } = richSessions()
  const local = makeSession({
    id: 'local-1',
    title: '将被替换',
    messages: [
      userMsg('u1', '本地内容', DAY, { children: ['a1'] }),
      replyMsg('a1', 'u1', DAY + 1, [textBlock('本地回答。')]),
    ],
  })
  await saveAll([local])
  const file = await asFile(await exportSessions([s3]))

  const { result, summaries } = await runImport(file, 'replace')
  assert.deepEqual(result, { added: 1, skipped: 0 })
  assert.deepEqual(summaries.map((item) => item.id), ['rich-3'])
  assert.equal(await db.loadSession('local-1'), undefined)
  const imported = await db.loadSession('rich-3')
  assert.equal(imported.messages[0].content, '思考题')
})

test('损坏归档：导入失败，原有历史保持完整', async () => {
  freshScope()
  const { s1 } = richSessions()
  await saveAll([s1], [{ id: 'img-1', blob: new Blob([PNG_A]) }])
  const blob = await exportSessions([s1])
  const bytes = new Uint8Array(await blob.arrayBuffer())
  bytes[Math.floor(bytes.length / 2)] ^= 0xff
  const file = await asFile(new Blob([bytes], { type: 'application/zip' }))

  await assert.rejects(runImport(file, 'replace'))
  // store 层在失败后清空暂存；正式数据必须原样可用。
  await db.clearStaging()
  const summaries = await db.loadSessionSummaries()
  assert.deepEqual(summaries.map((item) => item.id), ['rich-1'])
  const session = await db.loadSession('rich-1')
  assert.equal(session.messages.length, 5)
  const blob2 = await db.loadFile('img-1')
  assert.deepEqual(new Uint8Array(await blob2.arrayBuffer()), PNG_A)
})

test('兼容旧式归档：最小字段与高精度时间仍可导入', async () => {
  freshScope()
  const iso = '2026-11-20T08:00:00.270123Z'
  const legacy = {
    id: 'legacy-1',
    title: null,
    pinned: false,
    current_message_id: 2,
    inserted_at: iso,
    updated_at: iso,
    messages: [
      {
        id: 1,
        parent_id: null,
        role: 'USER',
        status: 'FINISHED',
        thinking_enabled: false,
        search_enabled: false,
        accumulated_token_usage: 0,
        inserted_at: iso,
        fragments: [{ type: 'REQUEST', content: '旧格式提问' }],
      },
      {
        id: 2,
        parent_id: 1,
        role: 'ASSISTANT',
        status: 'FINISHED',
        thinking_enabled: true,
        search_enabled: false,
        accumulated_token_usage: 12,
        inserted_at: iso,
        fragments: [
          { type: 'THINK', content: '旧格式思考', elapsed_secs: null },
          { type: 'RESPONSE', content: '旧格式回答' },
        ],
      },
    ],
  }
  const manifest = { export_format_version: 3 }
  const index = [
    {
      id: 'legacy-1',
      title: null,
      pinned: false,
      message_count: 2,
      inserted_at: iso,
      updated_at: iso,
    },
  ]
  const blob = await writeArchive([
    { name: 'manifest.json', blob: new Blob([JSON.stringify(manifest)]) },
    { name: 'chat_sessions/legacy-1.json', blob: new Blob([JSON.stringify(legacy)]) },
    { name: 'chat_session_index.json', blob: new Blob([JSON.stringify(index)]) },
  ])
  const file = await asFile(blob)
  const { result, summaries } = await runImport(file, 'replace')
  assert.deepEqual(result, { added: 1, skipped: 0 })
  assert.deepEqual(summaries.map((item) => item.id), ['legacy-1'])
  const session = await db.loadSession('legacy-1')
  assert.equal(session.messages.length, 2)
  assert.equal(session.messages[1].blocks[0].thinking, '旧格式思考')
})

test('内容指纹：有损往返后仍一致；内容变化后不一致', async () => {
  const q1 = userMsg('u1', '图 + 公式 $$E=mc^2$$', DAY, {
    files: [imageFile('img-1')],
    children: ['a1', 'a2'],
  })
  const live = makeSession({
    id: 'fp-1',
    title: '指纹会话',
    messages: [
      q1,
      replyMsg('a1', 'u1', DAY + 1, [
        thinkBlock('推导', { startedAt: DAY + 1, endedAt: DAY + 2 }),
        textBlock('答案 **mc²**', { citations: [{ type: 'text_citation', url: 'https://example.com' }] }),
      ], { thinking: true, usage: { input_tokens: 10, output_tokens: 5 } }),
      replyMsg('a2', 'u1', DAY + 2, [textBlock('分支回答')], { status: 'stopped' }),
      replyMsg('a3', 'u1', DAY + 3, [textBlock('被截断')], {
        status: 'done',
        stopReason: 'max_tokens',
      }),
    ],
  })
  const derived = toLocalSession(toSessionFile(live, () => null)).session
  assert.equal(sessionContentKey(live), sessionContentKey(derived))

  // 改动正文或标题都会改变指纹。
  const changedText = structuredClone(live)
  changedText.messages.find((message) => message.blocks?.some((block) => block.type === 'text'))
    .blocks.find((block) => block.type === 'text').text = '不同答案'
  assert.notEqual(sessionContentKey(live), sessionContentKey(changedText))
  const changedTitle = structuredClone(live)
  changedTitle.title = '新标题'
  assert.notEqual(sessionContentKey(live), sessionContentKey(changedTitle))
})
