# Network Bot Docker 部署指南

## 快速开始

### 1. 准备配置文件

复制环境变量模板：
```bash
cp .env.docker .env
```

编辑 `.env` 文件，填入你的配置：
- `BOT_ID`: 企业微信智能机器人 ID
- `BOT_SECRET`: 企业微信智能机器人 Secret
- `CLAUDE_API_KEY`: Claude API Key（可选，如果使用 OAuth 可以不填）

### 2. 配置 MCP 服务器

编辑 `mcp-config.json`，配置你的 MCP 服务器：
```json
{
  "mcpServers": {
    "network_mcp": {
      "type": "http",
      "url": "http://10.143.170.1:8080/mcp",
      "headers": {
        "Authorization": "Bearer mcp-token-1"
      }
    }
  }
}
```

### 3. 构建并启动

使用 Docker Compose（推荐）：
```bash
docker-compose up -d
```

或使用 Docker：
```bash
# 构建镜像
docker build -t network-bot:latest .

# 运行容器
docker run -d \
  --name network-bot \
  --env-file .env \
  -p 3000:3000 \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/mcp-config.json:/app/mcp-config.json:ro \
  network-bot:latest
```

### 4. 查看日志

```bash
# 使用 docker-compose
docker-compose logs -f

# 使用 docker
docker logs -f network-bot
```

### 5. 健康检查

访问健康检查端点：
```bash
curl http://localhost:3000/health
```

预期返回：
```json
{
  "status": "ok",
  "timestamp": "2026-08-11T10:00:00.000Z",
  "activeSessions": 0,
  "activeProcesses": 0,
  "aibotConnected": true
}
```

## 配置说明

### 必需配置

| 变量 | 说明 | 示例 |
|------|------|------|
| `BOT_ID` | 企业微信智能机器人 ID | `aibdMoim4EyMfRgSVOwOBIj-_Q2MoGLZx_5` |
| `BOT_SECRET` | 企业微信智能机器人 Secret | `xxxxxxxxxxxxxxxx` |

### Claude 配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `CLAUDE_API_KEY` | Claude API Key（可选） | - |
| `CLAUDE_CLI_PATH` | Claude CLI 路径 | `claude` |
| `CLAUDE_THINKING_EFFORT` | 思考力度 | `high` |

### Anthropic API 配置

这些配置会传递给 Claude CLI 环境变量：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ANTHROPIC_API_KEY` | Anthropic API Key | - |
| `ANTHROPIC_AUTH_TOKEN` | OAuth 认证令牌 | - |
| `ANTHROPIC_BASE_URL` | API Base URL | - |
| `ANTHROPIC_MODEL` | 指定模型 | - |

**使用场景**：
- **企业私有部署**：设置 `ANTHROPIC_BASE_URL` 指向内部 API 网关
- **指定模型版本**：通过 `ANTHROPIC_MODEL` 固定使用特定模型
- **OAuth 认证**：使用 `ANTHROPIC_AUTH_TOKEN` 代替 API Key

### 会话管理

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SESSION_TIMEOUT` | 会话超时时间（毫秒） | `1800000` (30分钟) |
| `MAX_CONCURRENT_SESSIONS` | 最大并发会话数 | `50` |
| `WORKSPACE_BASE_PATH` | 工作空间路径 | `/tmp/claude-workspace` |

### 权限控制

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ALLOWED_USERS` | 允许的用户ID列表（逗号分隔） | 空（允许所有） |
| `MAX_MESSAGE_LENGTH` | 最大消息长度 | `10000` |

## 管理命令

### 重启服务
```bash
docker-compose restart
```

### 停止服务
```bash
docker-compose down
```

### 查看状态
```bash
docker-compose ps
```

### 进入容器
```bash
docker-compose exec network-bot sh
```

### 清理并重建
```bash
docker-compose down -v
docker-compose up -d --build
```

## 数据持久化

Docker Compose 配置会自动创建以下卷：
- `claude-workspace`: Claude 工作空间数据
- `./logs`: 应用日志（挂载到主机）

## 网络配置

如果 MCP 服务器运行在同一 Docker 网络中：
1. 将 MCP 服务加入 `network-bot-net` 网络
2. 更新 `mcp-config.json` 中的 URL 为容器名称

示例：
```json
{
  "mcpServers": {
    "network_mcp": {
      "type": "http",
      "url": "http://mcp-server:8080/mcp",
      "headers": {
        "Authorization": "Bearer mcp-token-1"
      }
    }
  }
}
```

## 故障排查

### 1. 容器无法启动
```bash
# 查看详细日志
docker-compose logs network-bot

# 检查配置
docker-compose config
```

### 2. 无法连接企业微信
- 检查 `BOT_ID` 和 `BOT_SECRET` 是否正确
- 确保容器可以访问 `wss://openws.work.weixin.qq.com`

### 3. Claude 调用失败
- 检查 `CLAUDE_API_KEY` 是否有效
- 查看容器日志中的 Claude 错误信息
- 确认 Claude CLI 安装成功：`docker-compose exec network-bot claude --version`

### 4. MCP 工具无法使用
- 检查 `mcp-config.json` 配置是否正确
- 确认 MCP 服务器可访问
- 查看日志中是否有 MCP 相关错误

## 生产环境建议

1. **使用专用 API Key**：为生产环境创建独立的 Claude API Key
2. **配置日志轮转**：防止日志文件过大
3. **监控资源使用**：设置内存和 CPU 限制
4. **备份配置**：定期备份 `.env` 和 `mcp-config.json`
5. **使用密钥管理**：考虑使用 Docker Secrets 或环境变量管理工具

## 扩展配置

如需添加资源限制，编辑 `docker-compose.yml`：
```yaml
services:
  network-bot:
    # ... 其他配置
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

## 更新

```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker-compose up -d --build
```
