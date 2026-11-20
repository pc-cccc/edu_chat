import { Capacitor, registerPlugin } from '@capacitor/core'

/** 原生 FileSaver 插件：把字节内容保存到系统「下载」目录（WebView 无法触发浏览器式下载） */
const FileSaver = registerPlugin<{
  save(options: { fileName: string; data: string }): Promise<{ saved: boolean }>
}>('FileSaver')

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') {
        // readAsDataURL 结果是 data:...;base64,xxx，只取编码部分
        resolve(result.slice(result.indexOf(',') + 1))
      } else {
        reject(new Error('Failed to read blob'))
      }
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'))
    reader.readAsDataURL(blob)
  })

/**
 * 保存生成的文件：
 * - 原生环境写入系统「下载」目录，返回 true；
 * - 浏览器环境触发下载，返回 true。
 */
export const saveGeneratedFile = async (fileName: string, blob: Blob): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return true
  }
  const data = await blobToBase64(blob)
  await FileSaver.save({ fileName, data })
  return true
}
