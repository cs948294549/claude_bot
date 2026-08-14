require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const WeComAiBotAdapter = require('./adapters/wecom-aibot-official');
const MessageAdapter = require('./adapters/message-adapter');
const SessionManager = require('./managers/session-manager');
const ClaudeProcessManager = require('./managers/claude-process-manager');
const logger = require('./utils/logger');
const { generateReqId } = require('@wecom/aibot-node-sdk');

class ClaudeAiBotBridge {
  constructor() {
    this.app = express();
    this.config = this.loadConfig();

    // 初始化企业微信智能机器人适配器（官方 SDK）
    this.aibot = new WeComAiBotAdapter({
      botId: this.config.botId,
      botSecret: this.config.botSecret
    });

    this.sessionManager = new SessionManager({
      workspaceBasePath: this.config.workspaceBasePath,
      sessionTimeout: this.config.sessionTimeout,
      maxConcurrentSessions: this.config.maxConcurrentSessions
    });

    this.claudeManager = new ClaudeProcessManager(this.sessionManager, {
      claudeCliPath: this.config.claudeCliPath,
      thinkingMode: this.config.thinkingMode,
      thinkingEffort: this.config.thinkingEffort,
      claudeApiKey: this.config.claudeApiKey
    });

    this.messageAdapter = new MessageAdapter();

    // 保存用户的 frame 对象用于回复
    this.userFrameMap = new Map();
    // 保存流式消息的 stream_id
    this.userStreamIdMap = new Map();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupAiBotHandlers();
    this.setupClaudeHandlers();
    this.ensureDirectories();
  }

  loadConfig() {
    return {
      botId: process.env.BOT_ID,
      botSecret: process.env.BOT_SECRET,

      port: parseInt(process.env.PORT) || 3000,

      claudeCliPath: process.env.CLAUDE_CLI_PATH || 'claude',
      thinkingMode: process.env.CLAUDE_THINKING_MODE || 'adaptive',
      thinkingEffort: process.env.CLAUDE_THINKING_EFFORT || 'high',
      claudeApiKey: process.env.CLAUDE_API_KEY,
      claudeProcessTimeout: parseInt(process.env.CLAUDE_PROCESS_TIMEOUT) || 120000,

      sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 1800000,
      maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS) || 50,
      workspaceBasePath: process.env.WORKSPACE_BASE_PATH || '/tmp/claude-workspace',

      allowedUsers: process.env.ALLOWED_USERS?.split(',').map(u => u.trim()) || [],
      maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH) || 10000
    };
  }

  ensureDirectories() {
    const dirs = [
      this.config.workspaceBasePath,
      path.join(__dirname, '../logs')
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      }
    }
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path} from ${req.ip}`);
      next();
    });
  }

  setupRoutes() {
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        activeSessions: this.sessionManager.getSessionCount(),
        activeProcesses: this.claudeManager.getActiveProcessCount(),
        aibotConnected: this.aibot.isConnected
      });
    });

    this.app.get('/admin/aibot/status', (req, res) => {
      res.json(this.aibot.getStatus());
    });

    this.app.get('/admin/sessions', (req, res) => {
      const sessions = this.sessionManager.getActiveSessions();
      res.json(sessions);
    });

    this.app.post('/admin/restart/:userId', (req, res) => {
      try {
        const { userId } = req.params;
        this.claudeManager.restartProcess(userId);
        res.json({ success: true, message: `Process restarted for ${userId}` });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  setupAiBotHandlers() {
    this.aibot.on('connected', () => {
      logger.info('✅ 智能机器人已连接');
    });

    this.aibot.on('disconnected', (reason) => {
      logger.warn('智能机器人断开连接:', reason);
    });

    this.aibot.on('message', async (message) => {
      try {
        // 保存 frame 用于回复
        if (message.frame) {
          this.userFrameMap.set(message.fromUserName, message.frame);
        }

        await this.handleUserMessage(message);
      } catch (error) {
        logger.error('处理消息失败:', error);
      }
    });

    this.aibot.on('event', async (event) => {
      try {
        if (event.event === 'enter_chat' && event.frame) {
          this.userFrameMap.set(event.fromUserName, event.frame);
          const welcomeMsg = this.messageAdapter.formatWelcome(event.fromUserName);
          await this.aibot.sendWelcomeMessage(event.fromUserName, welcomeMsg, event.frame);
        }
      } catch (error) {
        logger.error('处理事件失败:', error);
      }
    });

    this.aibot.on('error', (error) => {
      logger.error('智能机器人错误:', error);
    });
  }

  setupClaudeHandlers() {
    this.claudeManager.on('response', async (userId, response) => {
      try {
        const messages = this.messageAdapter.claudeToWecom(response);
        for (const msg of messages) {
          await this.sendMessageToUser(userId, msg);
        }
        this.sessionManager.setProcessing(userId, false);
      } catch (error) {
        logger.error(`处理 Claude 响应失败 ${userId}:`, error);
        await this.sendErrorToUser(userId, error);
      }
    });

    this.claudeManager.on('complete', async (userId, content) => {
      try {
        if (content) {
          this.sessionManager.addToHistory(userId, 'assistant', content);

          // 使用流式方式发送（更适合长文本）
          const frame = this.userFrameMap.get(userId);
          if (frame) {
            const streamId = this.userStreamIdMap.get(userId) || generateReqId('stream');
            await this.aibot.sendStreamMessage(userId, streamId, content, true, frame);
            this.userStreamIdMap.delete(userId);
          }
        }
        this.sessionManager.setProcessing(userId, false);
      } catch (error) {
        logger.error(`处理完成事件失败 ${userId}:`, error);
      }
    });

    this.claudeManager.on('error', async (userId, error) => {
      logger.error(`Claude 错误 ${userId}:`, error);
      await this.sendErrorToUser(userId, error);
      this.sessionManager.setProcessing(userId, false);
    });

    this.claudeManager.on('exit', async (userId, code) => {
      if (code !== 0) {
        logger.warn(`Claude 进程异常退出 ${userId}`);
        const frame = this.userFrameMap.get(userId);
        if (frame) {
          await this.aibot.sendTextMessage(userId, '⚠️ Claude进程意外退出，请重试', frame);
        }
      }
      this.sessionManager.setProcessing(userId, false);
    });
  }

  async handleUserMessage(message) {
    const userId = message.fromUserName;
    const userName = message.userName;

    try {
      if (this.config.allowedUsers.length > 0 &&
          !this.config.allowedUsers.includes(userId)) {
        const frame = this.userFrameMap.get(userId);
        if (frame) {
          await this.aibot.sendTextMessage(userId, '❌ 您没有权限使用此机器人', frame);
        }
        return;
      }

      if (this.sessionManager.getSessionCount() >= this.config.maxConcurrentSessions) {
        const frame = this.userFrameMap.get(userId);
        if (frame) {
          await this.aibot.sendTextMessage(userId, '⚠️ 系统繁忙，请稍后再试', frame);
        }
        return;
      }

      const session = this.sessionManager.getOrCreateSession(userId, userName);

      if (this.sessionManager.isProcessing(userId)) {
        const frame = this.userFrameMap.get(userId);
        if (frame) {
          await this.aibot.sendTextMessage(userId, '⏳ 正在处理您的上一条消息，请稍候...', frame);
        }
        return;
      }

      if (message.msgType === 'text') {
        await this.handleTextMessage(userId, message.content);
      } else {
        const frame = this.userFrameMap.get(userId);
        if (frame) {
          await this.aibot.sendTextMessage(userId, '❌ 暂不支持此类型消息', frame);
        }
      }

    } catch (error) {
      logger.error(`处理用户消息失败 ${userId}:`, error);
      await this.sendErrorToUser(userId, error);
    }
  }

  async handleTextMessage(userId, content) {
    if (content.length > this.config.maxMessageLength) {
      const frame = this.userFrameMap.get(userId);
      if (frame) {
        await this.aibot.sendTextMessage(userId, '❌ 消息过长，请分段发送', frame);
      }
      return;
    }

    if (this.messageAdapter.isCommand(content)) {
      await this.handleCommand(userId, content);
      return;
    }

    // 生成 stream_id 用于流式回复
    const streamId = generateReqId('stream');
    this.userStreamIdMap.set(userId, streamId);

    this.sessionManager.setProcessing(userId, true);
    await this.claudeManager.sendMessage(userId, content);
  }

  async handleCommand(userId, commandText) {
    const { command } = this.messageAdapter.parseCommand(commandText);
    const session = this.sessionManager.getSession(userId);
    const frame = this.userFrameMap.get(userId);

    if (!frame) {
      logger.error('无法执行命令：找不到 frame');
      return;
    }

    switch (command) {
      case '/help':
        await this.aibot.sendMarkdownMessage(userId, this.messageAdapter.formatHelp(), frame);
        break;
      case '/clear':
        this.sessionManager.clearHistory(userId);
        await this.aibot.sendTextMessage(userId, '✅ 会话历史已清除', frame);
        break;
      case '/restart':
        await this.claudeManager.restartProcess(userId);
        await this.aibot.sendTextMessage(userId, '✅ Claude进程已重启', frame);
        break;
      case '/status':
        if (session) {
          await this.aibot.sendMarkdownMessage(userId, this.messageAdapter.formatStatus(session), frame);
        }
        break;
      case '/start':
        await this.aibot.sendMarkdownMessage(userId, this.messageAdapter.formatWelcome(session?.userName || userId), frame);
        break;
      default:
        await this.aibot.sendTextMessage(userId, `❌ 未知命令: ${command}\n使用 /help 查看可用命令`, frame);
    }
  }

  async sendMessageToUser(userId, message) {
    try {
      const frame = this.userFrameMap.get(userId);
      if (!frame) {
        logger.error('无法发送消息：找不到 frame');
        return;
      }

      switch (message.type) {
        case 'text':
          await this.aibot.sendTextMessage(userId, message.content, frame);
          break;
        case 'markdown':
          await this.aibot.sendMarkdownMessage(userId, message.content, frame);
          break;
        default:
          logger.warn(`未知消息类型: ${message.type}`);
      }
    } catch (error) {
      logger.error(`发送消息失败 ${userId}:`, error);
      throw error;
    }
  }

  async sendErrorToUser(userId, error) {
    try {
      const errorMsg = this.messageAdapter.formatError(error);
      const frame = this.userFrameMap.get(userId);
      if (frame) {
        await this.aibot.sendTextMessage(userId, errorMsg, frame);
      }
    } catch (err) {
      logger.error(`发送错误消息失败 ${userId}:`, err);
    }
  }

  async start() {
    this.sessionManager.start();

    // 连接智能机器人
    await this.aibot.connect();

    // 启动 HTTP 服务器
    this.app.listen(this.config.port, () => {
      logger.info(`Claude-AiBot bridge started on port ${this.config.port}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Mode: 企业微信智能机器人 (官方 SDK)`);
    });

    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  async shutdown() {
    logger.info('Shutting down...');
    await this.aibot.disconnect();
    this.sessionManager.stop();
    this.claudeManager.cleanup();
    process.exit(0);
  }
}

// 启动服务
if (require.main === module) {
  const bridge = new ClaudeAiBotBridge();
  bridge.start().catch(error => {
    logger.error('Failed to start service:', error);
    process.exit(1);
  });
}

module.exports = ClaudeAiBotBridge;
