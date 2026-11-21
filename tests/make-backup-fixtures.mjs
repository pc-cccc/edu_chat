// 生成浏览器/真机验收用的历史归档 fixture：
// - rich.zip：一条会话（图片 + Markdown + 数学公式 + 深度思考 + 双分支）
// - all-three.zip：三条会话（rich + 搜索思考 + 纯文本）
// - corrupted.zip：把 all-three 中部一个字节取反的损坏归档
// 用法：node --import tsx tests/make-backup-fixtures.mjs [输出目录]
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'
import 'fake-indexeddb/auto'

globalThis.__APP_MODE__ = 'direct'
globalThis.__APP_VERSION__ = '0.0.0-test'

const db = await import('../src/services/chat/db.ts')
const { exportArchive } = await import('../src/services/chat/history/exportArchive.ts')

// ---------- 生成一张可识别的 PNG（32x32，红色底 + 蓝色斜纹） ----------
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit++) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }
  return crc >>> 0
})
const crc32 = (bytes) => {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const head = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(head))
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  return Buffer.concat([length, head, tail])
}
const makePng = (size = 32) => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type RGB
  const raw = Buffer.alloc(size * (1 + size * 3))
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 3)
    raw[row] = 0 // filter none
    for (let x = 0; x < size; x++) {
      const offset = row + 1 + x * 3
      raw[offset] = 220 // R
      raw[offset + 1] = (x + y) % 2 === 0 ? 80 : 220 // G 斜纹
      raw[offset + 2] = 60 // B
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- 会话构造 ----------
const DAY = Date.UTC(2026, 10, 21, 8)
const text = (content, extra = {}) => ({ type: 'text', text: content, ...extra })
const think = (thinking, extra = {}) => ({ type: 'thinking', thinking, ...extra })

const user = (id, content, createdAt, { files = [], parentId = null, children = [] } = {}) => ({
  id,
  role: 'user',
  content,
  files,
  createdAt,
  parentId,
  selectedChildId: children[0] ?? null,
})
const reply = (id, parentId, createdAt, blocks, { status = 'done', ...extra } = {}) => ({
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
const session = ({ id, title, createdAt = DAY, messages }) => ({
  id,
  title,
  createdAt,
  updatedAt: createdAt + messages.length,
  rootMessageId: messages[0]?.id ?? null,
  messages,
})

const IMG_ID = 'fixture-image-1'
const png = makePng()

const rich = session({
  id: 'fixture-rich',
  title: '图文公式会话（验收）',
  messages: [
    user('u1', '看这张图，求 $$\\int_0^1 x^2\\,dx$$ 的值，并用 **Markdown** 说明。', DAY, {
      files: [
        { id: IMG_ID, serverId: null, name: 'sample.png', size: png.length, isImage: true, mimeType: 'image/png' },
      ],
      children: ['a1', 'a2'],
    }),
    reply('a1', 'u1', DAY + 1, [
      think('先求原函数 x^3/3，再代入上下限 0 和 1。', { startedAt: DAY + 1, endedAt: DAY + 3 }),
      text('答案是 $\\frac{1}{3}$，步骤：\n\n1. 原函数 $F(x)=\\frac{x^3}{3}$\n2. $F(1)-F(0)=\\frac{1}{3}$'),
    ], { thinking: true }),
    reply('a2', 'u1', DAY + 2, [text('这是另一个分支的版本。')], { status: 'stopped' }),
  ],
})

const searched = session({
  id: 'fixture-search',
  title: '搜索思考会话（验收）',
  createdAt: DAY + 100,
  messages: [
    user('u1', '搜索一下今天天气', DAY + 100, { children: ['a1'] }),
    reply('a1', 'u1', DAY + 101, [
      think('需要联网搜索。', { startedAt: DAY + 101, endedAt: DAY + 102 }),
      {
        type: 'server_tool_use',
        id: 'srvtoolu_s_1_abc',
        name: 'deepseek_web_search',
        input: { action: 'search', query: '天气', queries: ['天气'] },
        caller: { type: 'direct' },
        kind: 'search',
      },
      {
        type: 'web_search_tool_result',
        tool_use_id: 'srvtoolu_s_1_abc',
        kind: 'search',
        content: [
          {
            type: 'web_search_result',
            url: 'https://example.com/weather',
            title: '天气示例',
            snippet: '今天的天气示例摘要。',
            site_icon: null,
            site_name: '示例站',
            encrypted_content: '',
            page_age: '2026-11-21T08:00:00Z',
          },
        ],
      },
      text('根据搜索结果，今天天气晴朗。'),
    ], { thinking: true, search: true }),
  ],
})

const plain = session({
  id: 'fixture-plain',
  title: '纯文本会话（验收）',
  createdAt: DAY + 200,
  messages: [
    user('u1', '你好', DAY + 200, { children: ['a1'] }),
    reply('a1', 'u1', DAY + 201, [text('你好！有什么可以帮你？')]),
  ],
})

/** 开启了搜索但模型没有执行：用于验证「本次未使用联网搜索」与重试入口。 */
const searchUnused = session({
  id: 'fixture-search-unused',
  title: '搜索未触发会话（验收）',
  createdAt: DAY + 300,
  messages: [
    user('u1', '简单打个招呼', DAY + 300, { children: ['a1'] }),
    reply('a1', 'u1', DAY + 301, [text('你好，这条回答没有联网搜索。')], {
      thinking: true,
      search: true,
      usage: {
        input_tokens: 10,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 5,
        server_tool_use: { web_search_requests: 0, tool_search: 0 },
      },
    }),
  ],
})

/** 搜索执行但失败：验证「联网搜索暂不可用」与重试入口。 */
const searchFailed = session({
  id: 'fixture-search-failed',
  title: '搜索失败会话（验收）',
  createdAt: DAY + 400,
  messages: [
    user('u1', '搜索一个不存在的主题', DAY + 400, { children: ['a1'] }),
    reply('a1', 'u1', DAY + 401, [
      {
        type: 'server_tool_use',
        id: 'srvtoolu_s_f_1',
        name: 'deepseek_web_search',
        input: { action: 'search', query: 'x', queries: ['不存在的主题'] },
        caller: { type: 'direct' },
        kind: 'search',
      },
      {
        type: 'web_search_tool_result',
        tool_use_id: 'srvtoolu_s_f_1',
        kind: 'search',
        content: [{ type: 'web_search_tool_result_error', error_code: 'unavailable' }],
      },
      text('搜索没有成功，这是没有来源的回答。'),
    ], { search: true }),
  ],
})

/** 搜索执行但没有结果：验证「未搜索到相关内容」与重试入口。 */
const searchEmpty = session({
  id: 'fixture-search-empty',
  title: '搜索无结果会话（验收）',
  createdAt: DAY + 500,
  messages: [
    user('u1', '搜索一个冷门词', DAY + 500, { children: ['a1'] }),
    reply('a1', 'u1', DAY + 501, [
      {
        type: 'server_tool_use',
        id: 'srvtoolu_s_e_1',
        name: 'deepseek_web_search',
        input: { action: 'search', query: '冷门词', queries: ['冷门词'] },
        caller: { type: 'direct' },
        kind: 'search',
      },
      { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_s_e_1', kind: 'search', content: [] },
      text('没有找到相关内容，这是回答。'),
    ], { search: true }),
  ],
})

/** 搜索中被停止：验证「已停止」状态与「无法继续回答」说明。 */
const searchStopped = session({
  id: 'fixture-search-stopped',
  title: '搜索中停止会话（验收）',
  createdAt: DAY + 600,
  messages: [
    user('u1', '搜索并回答', DAY + 600, { children: ['a1'] }),
    reply('a1', 'u1', DAY + 601, [
      {
        type: 'server_tool_use',
        id: 'srvtoolu_s_s_1',
        name: 'deepseek_web_search',
        input: { action: 'search', query: 'q', queries: ['q'] },
        caller: { type: 'direct' },
        kind: 'search',
      },
      text('回答到一半被停止'),
    ], { status: 'stopped', search: true }),
  ],
})

// ---------- 导出 ----------
const outDir = process.argv[2] ?? path.join(process.env.TEMP ?? '.', 'edu-chat-backups')
await mkdir(outDir, { recursive: true })

db.setUserScope('fixture-export')
await db.saveFiles([{ id: IMG_ID, blob: new Blob([png]) }])
const allSessions = [rich, searched, plain, searchUnused, searchFailed, searchEmpty, searchStopped]
for (const item of allSessions) {
  await db.saveSession(item)
}

const write = async (name, sessions) => {
  const blob = await exportArchive(
    (async function* () {
      for (const item of sessions) {
        yield item
      }
    })()
  )
  const file = path.join(outDir, name)
  await writeFile(file, Buffer.from(await blob.arrayBuffer()))
  console.log('written', file, blob.size, 'bytes')
}

await write('rich.zip', [rich])
await write('all-fixtures.zip', allSessions)

const allBytes = Buffer.from(await (await exportArchive((async function* () {
  for (const item of allSessions) {
    yield item
  }
})())).arrayBuffer())
allBytes[Math.floor(allBytes.length / 2)] ^= 0xff
const corruptFile = path.join(outDir, 'corrupted.zip')
await writeFile(corruptFile, allBytes)
console.log('written', corruptFile, allBytes.length, 'bytes (corrupted)')
