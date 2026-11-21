import { test } from 'node:test'
import assert from 'node:assert/strict'

globalThis.__APP_MODE__ = 'direct'
globalThis.__APP_VERSION__ = '0.0.0-test'

const { buildChatRequest, webTools, applyEvent, settleReply } = await import(
  '../src/services/chat/reply.ts'
)
const { buildReplyView, isSearchUnused, getAreaTitle } = await import('../src/services/chat/view.ts')
const { readMessageEvent } = await import('../src/services/api/parseEvent.ts')

const baseReply = (extra = {}) => ({
  id: 'r1',
  role: 'assistant',
  createdAt: 1,
  model: 'deepseek-flash',
  thinking: false,
  search: false,
  prefix: false,
  status: 'streaming',
  blocks: [],
  ...extra,
})

const toolUse = (id = 't1', kind = 'search', input = { action: 'search', queries: ['q1'] }) => ({
  type: 'server_tool_use',
  id,
  name: 'deepseek_web_search',
  input,
  caller: { type: 'direct' },
  kind,
})

const resultItem = (url = 'https://example.com/a') => ({
  type: 'web_search_result',
  url,
  title: 'Example',
  snippet: 'snippet',
  site_icon: null,
  site_name: 'example.com',
  page_age: null,
  encrypted_content: '',
})

const searchResult = (content, id = 't1', kind = 'search') => ({
  type: 'web_search_tool_result',
  tool_use_id: id,
  content,
  kind,
})

const thinking = (thinking = '推导过程', extra = {}) => ({
  type: 'thinking',
  thinking,
  startedAt: 1,
  endedAt: 2,
  ...extra,
})

const textBlock = (text) => ({ type: 'text', text })

test('四种组合的请求参数：模型、思考开关、工具声明与安全审核', () => {
  const combos = [
    { name: '普通聊天', thinking: false, search: false, expectThinking: 'disabled', expectWeb: false },
    { name: '深度思考', thinking: true, search: false, expectThinking: 'enabled', expectWeb: false },
    { name: '联网搜索', thinking: false, search: true, expectThinking: 'disabled', expectWeb: true },
    { name: '思考与搜索', thinking: true, search: true, expectThinking: 'enabled', expectWeb: true },
  ]
  for (const combo of combos) {
    const body = buildChatRequest(
      { model: 'deepseek-flash', thinking: combo.thinking, search: combo.search },
      { system: 'SYS', messages: [{ role: 'user', content: '你好' }] }
    )
    assert.equal(body.model, 'deepseek-flash', combo.name)
    assert.deepEqual(body.thinking, { type: combo.expectThinking }, combo.name)
    const names = body.tools.map((tool) => tool.name)
    // 阅读链接始终声明；联网搜索只随搜索开关声明，格式与官方 web_tools 一致。
    assert.ok(names.includes('deepseek_read_url'), combo.name)
    assert.equal(names.includes('deepseek_web_search'), combo.expectWeb, combo.name)
    assert.deepEqual(body.safety_check, { level: 'high' }, combo.name)
    assert.ok(!('title' in body), combo.name)
  }
  const titled = buildChatRequest(
    { model: 'deepseek-flash', thinking: false, search: false },
    { system: 'SYS', messages: [], withTitle: true }
  )
  assert.deepEqual(titled.title, { enabled: true })
  // 未开启搜索时不声明联网搜索工具。
  assert.deepEqual(webTools(false).map((tool) => tool.name), ['deepseek_read_url'])
})

test('停止后迟到的流式事件不会写入已收尾的回答', () => {
  const streaming = baseReply({
    blocks: [textBlock('已有内容')],
  })
  const stopped = settleReply(streaming, 'stopped', 10)
  assert.equal(stopped.status, 'stopped')
  const indexes = new Map()
  const late = applyEvent(
    stopped,
    { type: 'content_block_start', index: 0, content_block: textBlock('迟到内容') },
    11,
    indexes
  )
  assert.equal(late, stopped)
  assert.equal(late.blocks.length, 1)
  const lateDone = applyEvent(
    settleReply(streaming, 'done', 10),
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'x' } },
    11,
    new Map()
  )
  assert.equal(lateDone.status, 'done')
})

test('message_delta 的 usage.server_tool_use 计数被原样保留', () => {
  const event = readMessageEvent({
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: {
      input_tokens: 10,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 5,
      server_tool_use: { web_search_requests: 1, tool_search: 2 },
    },
  })
  assert.deepEqual(event.usage.server_tool_use, { web_search_requests: 1, tool_search: 2 })
})

test('搜索事件展示：进行中 / 成功 / 失败 / 无结果分别呈现真实状态', () => {
  // 进行中：只有调用块，还没有结果。
  const wip = buildReplyView(baseReply({ search: true, blocks: [toolUse()] }), true)
  assert.equal(wip.steps.length, 1)
  assert.equal(wip.steps[0].type, 'search')
  assert.equal(wip.steps[0].status, 'wip')
  assert.equal(getAreaTitle(wip, true, Date.now(), false), '正在搜索')

  // 成功：结果带一条来源。
  const done = buildReplyView(
    baseReply({ search: true, blocks: [toolUse(), searchResult([resultItem()]), textBlock('回答。')] }),
    false
  )
  assert.equal(done.steps[0].status, 'done')
  assert.equal(done.searchResults.length, 1)
  assert.equal(done.sources.length, 1)
  assert.ok(done.answer)

  // 失败：结果为错误项。
  const failed = buildReplyView(
    baseReply({
      search: true,
      blocks: [
        toolUse(),
        searchResult([{ type: 'web_search_tool_result_error', error_code: 'unavailable' }]),
        textBlock('回答。'),
      ],
    }),
    false
  )
  assert.equal(failed.steps[0].status, 'failed')

  // 无结果：结果为空数组，是「无结果」而不是失败。
  const empty = buildReplyView(
    baseReply({ search: true, blocks: [toolUse(), searchResult([]), textBlock('回答。')] }),
    false
  )
  assert.equal(empty.steps[0].status, 'done')
  assert.equal(empty.steps[0].results.length, 0)
  assert.equal(empty.searchResults.length, 0)
})

test('思考与搜索交替出现时按真实顺序展示，不写死先后', () => {
  const reply = baseReply({
    search: true,
    thinking: true,
    blocks: [
      thinking('先想想'),
      toolUse('t1'),
      searchResult([resultItem()]),
      thinking('再想想'),
      textBlock('最终回答。'),
    ],
  })
  const view = buildReplyView(reply, false)
  assert.deepEqual(
    view.steps.map((step) => step.type),
    ['thinking', 'search', 'thinking']
  )
  assert.ok(view.answer)
  // 有回答后折叠区标题为思考用时，而不是固定的「正在思考」。
  assert.match(getAreaTitle(view, false, Date.now(), true), /已思考/)
})

test('开启搜索但未执行的判定：usage 计数优先，旧数据回退到调用块', () => {
  const usage = (serverToolUse) => ({
    input_tokens: 1,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    output_tokens: 1,
    server_tool_use: serverToolUse,
  })
  const withUsage = (serverToolUse, blocks = []) =>
    baseReply({ search: true, status: 'done', blocks, usage: usage(serverToolUse) })

  // 官方计数明确：没有尝试过搜索。
  const unused = withUsage({ web_search_requests: 0, tool_search: 0 })
  assert.equal(isSearchUnused(unused, buildReplyView(unused, false).steps), true)

  // 尝试过（即使失败或没有结果）不算「未使用」。
  const attempted = withUsage({ web_search_requests: 1, tool_search: 0 })
  assert.equal(isSearchUnused(attempted, buildReplyView(attempted, false).steps), false)

  // 旧数据没有 usage：有搜索调用块就不算未使用。
  const legacyUsedReply = baseReply({
    search: true,
    status: 'done',
    blocks: [toolUse(), searchResult([resultItem()])],
  })
  assert.equal(isSearchUnused(legacyUsedReply, buildReplyView(legacyUsedReply, false).steps), false)
  const legacyUnusedReply = baseReply({ search: true, status: 'done', blocks: [textBlock('回答')] })
  assert.equal(
    isSearchUnused(legacyUnusedReply, buildReplyView(legacyUnusedReply, false).steps),
    true
  )

  // 未开启搜索时该提示不出现。
  const off = baseReply({ search: false, status: 'done' })
  assert.equal(isSearchUnused(off, buildReplyView(off, false).steps), false)
})

test('安全拒答丢弃思考与正文，但保留工具调用与结果块', () => {
  const refused = settleReply(
    baseReply({
      stopReason: 'refusal',
      blocks: [thinking('不该有的思考'), toolUse(), searchResult([resultItem()]), textBlock('不该有的正文')],
    }),
    'done',
    10
  )
  assert.deepEqual(
    refused.blocks.map((block) => block.type),
    ['server_tool_use', 'web_search_tool_result']
  )
})
