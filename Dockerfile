FROM node:20-alpine

# 安装必要的系统依赖
RUN apk add --no-cache \
    bash \
    curl \
    git \
    python3 \
    make \
    g++

# 创建应用目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装 Node.js 依赖
RUN npm ci --only=production

# 安装 Claude CLI
RUN npm install -g @anthropic-ai/claude-code

# 复制应用代码
COPY . .

# 创建必要的目录
RUN mkdir -p /tmp/claude-workspace \
    && mkdir -p /app/logs

# 设置环境变量
ENV NODE_ENV=production \
    PORT=3000 \
    WORKSPACE_BASE_PATH=/tmp/claude-workspace

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动应用
CMD ["npm", "start"]
