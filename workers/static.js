// 静态网页入口：把构建产物 dist 作为静态资产对外提供
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request)
  },
}
