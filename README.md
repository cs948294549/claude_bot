# Network Bot - 企业微信 Claude 智能机器人

将 Claude AI 集成到企业微信智能机器人，支持完整的 Claude 功能和 MCP 工具调用。

## 功能特性

- ✅ 企业微信智能机器人长连接集成
- ✅ Claude AI 对话能力
- ✅ MCP 工具支持（网络设备管理等）
- ✅ 会话管理和上下文保持
- ✅ 多用户并发支持
- ✅ Docker 容器化部署
- ✅ 健康检查和日志记录

## 快速开始

### 方式一：Docker Compose（推荐）

1. **准备配置文件**
```bash
# 复制环境变量模板
cp .env.docker .env

# 编辑配置文件
vim .env
```

2. **配置企业微信机器人**

在 `.env` 中填入：
```bash
BOT_ID=your_bot_id
BOT_SECRET=your_bot_secret
```

3. **配置 Claude**

如果使用 API Key：
```bash
CLAUDE_API_KEY=your_api_key
```

如果使用 OAuth，留空即可。

4. **配置 MCP 服务器**

编辑 `mcp-config.json`：
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

5. **启动服务**
```bash
docker-compose up -d
```

6. **查看日志**
```bash
docker-compose logs -f
```

7. **检查服务状态**
```bash
curl http://localhost:3000/health
```

### 方式二：本地运行

1. **安装依赖**
```bash
npm install
```

2. **安装 Claude CLI**
```bash
npm install -g @anthropic-ai/claude-code
```

3. **配置环境变量**
```bash
cp .env.example .env
vim .env
```

4. **启动服务**
```bash
npm start
```

## 配置说明

### 必需配置

| 变量 | 说明 | 获取方式 |
|------|------|----------|
| `BOT_ID` | 企业微信智能机器人 ID | 企业微信管理后台 → 应用管理 → 智能机器人 |
| `BOT_SECRET` | 企业微信智能机器人 Secret | 同上 |

### Claude 配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `CLAUDE_API_KEY` | Claude API Key（可选） | - |
| `CLAUDE_CLI_PATH` | Claude CLI 路径 | `claude` |
| `CLAUDE_THINKING_EFFORT` | 思考力度：low/medium/high/xhigh/max | `high` |

### Anthropic API 配置（高级）

这些配置项会传递给 Claude CLI，优先级高于 `CLAUDE_API_KEY`：

| 变量 | 说明 | 示例 |
|------|------|------|
| `ANTHROPIC_API_KEY` | Anthropic API Key | `sk-ant-...` |
| `ANTHROPIC_AUTH_TOKEN` | OAuth 认证令牌 | - |
| `ANTHROPIC_BASE_URL` | API Base URL（私有部署） | `https://api.anthropic.com` |
| `ANTHROPIC_MODEL` | 指定模型 | `claude-sonnet-5` |

**说明**：
- 如果设置了 `ANTHROPIC_*` 变量，Claude CLI 会优先使用它们
- `ANTHROPIC_BASE_URL` 适用于企业私有部署或代理场景
- `ANTHROPIC_MODEL` 可以指定特定模型版本

### 会话管理

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SESSION_TIMEOUT` | 会话超时（毫秒） | `1800000` (30分钟) |
| `MAX_CONCURRENT_SESSIONS` | 最大并发会话数 | `50` |
| `WORKSPACE_BASE_PATH` | Claude 工作空间路径 | `/tmp/claude-workspace` |

### 权限控制

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ALLOWED_USERS` | 允许的用户ID列表（逗号分隔） | 空（所有用户） |
| `MAX_MESSAGE_LENGTH` | 最大消息长度 | `10000` |

## 使用方法

### 基本对话

在企业微信中找到机器人，直接发送消息：
```
你好，介绍一下你自己
```

### 使用 MCP 工具

如果配置了网络设备管理 MCP：
```
帮我查看 rsw2_mdu1_prod_dc19_m01 的 BGP 邻居状态
```

### 命令

机器人支持以下命令：

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助信息 |
| `/clear` | 清除当前会话历史 |
| `/restart` | 重启 Claude 会话 |
| `/status` | 查看会话状态 |
| `/start` | 显示欢迎信息 |

## 管理接口

服务提供以下 HTTP 管理接口：

### 健康检查
```bash
GET /health
```

返回示例：
```json
{
  "status": "ok",
  "timestamp": "2026-08-11T10:00:00.000Z",
  "activeSessions": 5,
  "activeProcesses": 0,
  "aibotConnected": true
}
```

### 查看活跃会话
```bash
GET /admin/sessions
```

### 查看机器人状态
```bash
GET /admin/aibot/status
```

### 重启用户会话
```bash
POST /admin/restart/:userId
```

## Docker 部署

详细的 Docker 部署说明请参考 [DOCKER.md](./DOCKER.md)。

## 架构说明

```
┌─────────────────┐
│  企业微信用户    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ 企业微信智能机器人 API   │
│ (WebSocket 长连接)      │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│   Network Bot Service   │
│  ┌──────────────────┐  │
│  │ WeChat Adapter   │  │
│  └──────┬───────────┘  │
│         │              │
│  ┌──────▼───────────┐  │
│  │ Session Manager  │  │
│  └──────┬───────────┘  │
│         │              │
│  ┌──────▼───────────┐  │
│  │ Claude Manager   │  │
│  └──────┬───────────┘  │
└─────────┼──────────────┘
          │
          ▼
┌─────────────────────────┐
│      Claude CLI         │
│   (--resume session)    │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│    MCP Server(s)        │
│  - network_mcp (HTTP)   │
│  - 其他工具...          │
└─────────────────────────┘
```

## 技术栈

- **Node.js 20**: 运行环境
- **@wecom/aibot-node-sdk**: 企业微信智能机器人 SDK
- **Claude CLI**: Claude AI 命令行工具
- **Express**: HTTP 服务器
- **Docker**: 容器化部署

## 故障排查

### 1. 企业微信连接失败

**症状**：日志显示 WebSocket 连接错误

**解决方案**：
- 检查 `BOT_ID` 和 `BOT_SECRET` 是否正确
- 确认网络可以访问 `wss://openws.work.weixin.qq.com`
- 查看企业微信管理后台机器人是否启用

### 2. Claude 无响应

**症状**：发送消息后没有回复

**解决方案**：
```bash
# 查看日志
docker-compose logs -f network-bot

# 检查 Claude CLI 是否正常
docker-compose exec network-bot claude --version

# 检查 API Key
docker-compose exec network-bot claude config show
```

### 3. MCP 工具不可用

**症状**：Claude 说无法使用工具

**解决方案**：
- 检查 `mcp-config.json` 配置
- 确认 MCP 服务器可访问
- 查看日志中的 MCP 相关错误
- 确认权限模式为 `auto`

### 4. 内存占用过高

**解决方案**：
```bash
# 设置资源限制
# 编辑 docker-compose.yml，添加：
deploy:
  resources:
    limits:
      memory: 2G
```

## 开发指南

### 项目结构

```
network_bot/
├── src/
│   ├── adapters/          # 适配器层
│   │   ├── wecom-aibot-official.js
│   │   └── message-adapter.js
│   ├── managers/          # 管理器层
│   │   ├── session-manager.js
│   │   └── claude-process-manager.js
│   ├── utils/             # 工具函数
│   │   └── logger.js
│   └── server-aibot-official.js  # 主服务
├── logs/                  # 日志目录
├── mcp-config.json        # MCP 配置
├── .env                   # 环境变量
├── Dockerfile             # Docker 镜像
├── docker-compose.yml     # Docker Compose 配置
└── package.json           # 依赖配置
```

### 添加新功能

1. 在 `src/adapters/` 添加新适配器
2. 在 `src/managers/` 添加新管理器
3. 在 `server-aibot-official.js` 中集成
4. 更新文档

## 许可证

MIT

## 支持

遇到问题请提交 Issue 或联系维护团队。

---

*最后更新: 2026-08-11*
