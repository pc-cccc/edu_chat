# Edu_chat 云端后端镜像：构建前端并运行 Node 网关（代理 DeepSeek API + 服务静态页）
# 服务端只依赖 Node 内置模块，运行阶段不需要 node_modules。

# ---------- 构建阶段 ----------
FROM node:22-alpine AS build
WORKDIR /app
# 先用锁文件安装依赖，充分利用缓存
COPY package.json package-lock.json ./
RUN npm ci
# 复制源码并构建前端（server 模式，dist 指向同源 /api）
COPY . .
RUN npm run build

# ---------- 运行阶段 ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8090
COPY --from=build /app/server ./server
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
EXPOSE 8090
# 凭据通过云平台的环境变量注入，不写入镜像、不提交到仓库
CMD ["node", "server/index.mjs"]
