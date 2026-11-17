import type { ComponentType } from 'react'

/** V0.2 扩展协议。仅由应用代码注册可信组件，禁止直接执行模型输出的代码。 */
export type LearningVisualization = {
  version: 1
  kind: string
  title: string
  parameters: Readonly<Record<string, number | string | boolean>>
}
export type VisualizationProps = {
  spec: LearningVisualization
  onAsk: (question: string) => void
}
export type VisualizationRegistry = Readonly<Record<string, ComponentType<VisualizationProps>>>

/** V0.1 不注册任何可视化，不从 Markdown 中自动创建交互组件。 */
export const VisualizationSlot = ({ registry, ...props }: VisualizationProps & { registry: VisualizationRegistry }) => {
  const Component = Object.hasOwn(registry, props.spec.kind) ? registry[props.spec.kind] : undefined
  return Component ? <section aria-label={props.spec.title}><Component {...props} /></section> : null
}
