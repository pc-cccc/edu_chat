import { setTimeout as delay } from 'node:timers/promises'

// Deterministic fixtures only: this is deliberately not a substitute for a real model.
export async function demoReply(reqBody, res, signal) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' })
  const emit = (data) => res.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`)
  emit({ type: 'message_start', message: { id: 'local-demo', model: 'demo-fixture' } })
  let index = 0
  const block = async (type, content) => {
    emit({ type: 'content_block_start', index, content_block: type === 'thinking' ? { type, thinking: '', signature: 'demo' } : { type, text: '' } })
    for (const chunk of content.match(/[\s\S]{1,10}/gu) ?? []) {
      await delay(40, undefined, { signal })
      emit({ type: 'content_block_delta', index, delta: type === 'thinking' ? { type: 'thinking_delta', thinking: chunk } : { type: 'text_delta', text: chunk } })
    }
    emit({ type: 'content_block_stop', index })
    index++
  }
  if (reqBody.thinking?.type === 'enabled') await block('thinking', '演示思考面板：这段内容是固定测试数据，用于检查逐字显示、折叠和停止功能，并非模型思考。')
  const searched = reqBody.tools?.some((t) => t.name === 'deepseek_web_search')
  await block('text', `> 本地演示 · 以下为固定示例，没有调用真实 AI。${searched ? ' 联网搜索未执行，未生成来源引用。' : ''}\n\n## 梯度下降：每次向更低处走一步\n\n把损失函数想成一座山。**梯度**指向上升最快的方向，我们沿反方向更新参数：\n\n$$\n\\theta_{t+1} = \\theta_t - \\eta \\nabla L(\\theta_t)\n$$\n\n| 符号 | 含义 |\n| --- | --- |\n| $\\theta$ | 模型参数 |\n| $\\eta$ | 学习率，即每一步的大小 |\n| $L$ | 损失函数 |\n\n例如，$L(w)=w^2$，初始 $w=4$，学习率 $0.1$：\n\n\`\`\`python\nw = 4.0\nlearning_rate = 0.1\nw = w - learning_rate * (2 * w)\nprint(w)  # 3.2\n\`\`\`\n\n**想一想：** 如果学习率变成 1.1，参数还会靠近最小值吗？\n\n真实问答请配置服务端密钥后运行正常模式。文件解析、搜索和语音需要对应 API 支持。`)
  emit({ type: 'message_delta', delta: { stop_reason: 'end_turn' } })
  emit({ type: 'message_stop' })
  res.end()
}
