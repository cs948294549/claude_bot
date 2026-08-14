const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');
const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * Claude 进程管理器
 * 使用 --resume 模式维护会话上下文
 */
class ClaudeProcessManager extends EventEmitter {
  constructor(sessionManager, config = {}) {
    super();
    this.sessionManager = sessionManager;
    this.config = config;
    this.userSessionIds = new Map(); // 存储每个用户的 Claude session ID
    this.processTimeouts = new Map(); // 存储每个用户的超时定时器
    this.activeProcesses = new Map(); // 存储活跃的进程对象
  }

  /**
   * 获取或创建用户的 Claude session ID
   */
  getOrCreateSessionId(userId) {
    if (!this.userSessionIds.has(userId)) {
      const sessionId = crypto.randomUUID();
      this.userSessionIds.set(userId, sessionId);
      logger.info(`Created Claude session for user ${userId}: ${sessionId}`);
    }
    return this.userSessionIds.get(userId);
  }

  /**
   * 创建临时 Claude 进程处理单条消息
   */
  async createProcess(session, message) {
    const { userId, workingDir } = session;

    // 清理该用户之前的超时定时器和进程
    this.clearProcessTimeout(userId);

    // 检查是否已有会话
    const hasExistingSession = this.userSessionIds.has(userId);
    const sessionId = this.getOrCreateSessionId(userId);

    try {
      const claudePath = this.config.claudeCliPath || 'claude';
      const args = [
        '--print',
        '--output-format=stream-json',
        '--verbose',
        '--permission-mode=auto'
      ];

      // 第一次使用 --session-id 创建，后续使用 --resume
      if (hasExistingSession) {
        args.push('--resume', sessionId);
      } else {
        args.push('--session-id', sessionId);
      }

      // 添加 MCP 配置
      const mcpConfigPath = this.config.mcpConfigPath ||
                           path.join(__dirname, '../../mcp-config.json');
      args.push('--mcp-config', mcpConfigPath);

      // 添加 effort 参数
      if (this.config.thinkingEffort) {
        args.push('--effort', this.config.thinkingEffort);
      }

      logger.info(`Creating Claude process for user ${userId} (session: ${sessionId}, mode: ${hasExistingSession ? 'resume' : 'new'})`);

      const claudeProcess = spawn(claudePath, args, {
        cwd: workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          CLAUDE_API_KEY: this.config.claudeApiKey
        }
      });

      // 保存进程引用
      this.activeProcesses.set(userId, claudeProcess);

      // 设置超时保护
      this.setProcessTimeout(userId, claudeProcess);

      this.setupProcessHandlers(userId, claudeProcess);

      // 发送消息到 stdin
      claudeProcess.stdin.write(message + '\n');
      claudeProcess.stdin.end();

      logger.info(`Claude process created for user ${userId} (PID: ${claudeProcess.pid})`);
    } catch (error) {
      logger.error(`Failed to create Claude process for user ${userId}`, error);
      this.clearProcessTimeout(userId);
      throw error;
    }
  }

  setupProcessHandlers(userId, process) {
    let outputBuffer = '';

    // 处理标准输出 - stream-json 格式
    process.stdout.on('data', (data) => {
      const chunk = data.toString();
      outputBuffer += chunk;

      // 按行分割处理
      const lines = outputBuffer.split('\n');
      outputBuffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const jsonObj = JSON.parse(line);
            this.handleClaudeStreamJson(userId, jsonObj);
          } catch (error) {
            logger.error(`Error parsing Claude stream-json: ${error.message}`, { line });
          }
        }
      }
    });

    // 处理标准错误
    process.stderr.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        logger.error(`Claude stderr (${userId}): ${message}`);
      }
    });

    // 处理进程退出
    process.on('exit', (code, signal) => {
      logger.info(`Claude process exited for user ${userId} (code: ${code}, signal: ${signal})`);
      this.clearProcessTimeout(userId);
      this.activeProcesses.delete(userId);
      this.emit('exit', userId, code);
    });

    // 处理进程错误
    process.on('error', (error) => {
      logger.error(`Claude process error for user ${userId}`, error);
      this.clearProcessTimeout(userId);
      this.activeProcesses.delete(userId);
      this.emit('error', userId, error.message);
    });
  }

  handleClaudeStreamJson(userId, jsonObj) {
    const { type, subtype } = jsonObj;

    // 系统消息
    if (type === 'system') {
      if (subtype === 'init') {
        logger.info(`Claude session initialized for ${userId}: ${jsonObj.session_id}`);
      } else if (subtype === 'thinking_tokens') {
        logger.debug(`Thinking tokens: ${jsonObj.estimated_tokens}`);
      }
      return;
    }

    // Assistant 消息 - 包含实际回复
    if (type === 'assistant') {
      const content = jsonObj.message?.content;
      if (content && Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            this.emit('response', userId, { type: 'text', content: block.text });
          }
        }
      }
      // 消息完成
      this.emit('complete', userId, '');
      return;
    }

    // 文本输出（流式）
    if (type === 'text') {
      const text = jsonObj.text || '';
      this.emit('response', userId, { type: 'text', content: text });
      return;
    }

    // 工具使用
    if (type === 'tool_use') {
      logger.debug(`Claude tool use: ${jsonObj.name}`);
      return;
    }

    // 完成
    if (type === 'message_stop') {
      this.emit('complete', userId, '');
      return;
    }

    // 错误
    if (type === 'error') {
      this.emit('error', userId, new Error(jsonObj.message || 'Unknown error'));
      return;
    }
  }

  async sendMessage(userId, content, attachments = []) {
    try {
      const session = this.sessionManager.getSession(userId);
      if (!session) {
        throw new Error(`Session not found for user ${userId}`);
      }

      // 保存到历史
      this.sessionManager.addToHistory(userId, 'user', content);

      // 创建新的 Claude 进程处理这条消息
      await this.createProcess(session, content);

      logger.info(`Message sent to Claude for user ${userId}: ${content.substring(0, 100)}...`);
    } catch (error) {
      logger.error(`Error sending message to Claude for user ${userId}`, error);
      throw error;
    }
  }

  async restartProcess(userId) {
    // 清除用户的 session ID，下次会创建新的
    this.userSessionIds.delete(userId);
    this.sessionManager.clearHistory(userId);
    this.clearProcessTimeout(userId);
    this.activeProcesses.delete(userId);
    logger.info(`Claude session cleared for user ${userId}`);
  }

  /**
   * 设置进程超时保护
   */
  setProcessTimeout(userId, process) {
    const timeout = this.config.claudeProcessTimeout || 120000; // 默认 2 分钟

    const timeoutId = setTimeout(() => {
      logger.warn(`Claude process timeout for user ${userId}, killing process`);

      try {
        // 尝试优雅终止
        process.kill('SIGTERM');

        // 2秒后强制终止
        setTimeout(() => {
          if (!process.killed) {
            logger.warn(`Force killing Claude process for user ${userId}`);
            process.kill('SIGKILL');
          }
        }, 2000);

        // 重置会话状态
        this.sessionManager.setProcessing(userId, false);

        // 发送超时错误
        this.emit('error', userId, '处理超时，请重试');

      } catch (error) {
        logger.error(`Error killing process for user ${userId}:`, error);
      }

      this.clearProcessTimeout(userId);
      this.activeProcesses.delete(userId);
    }, timeout);

    this.processTimeouts.set(userId, timeoutId);
    logger.debug(`Set process timeout for user ${userId}: ${timeout}ms`);
  }

  /**
   * 清除进程超时定时器
   */
  clearProcessTimeout(userId) {
    const timeoutId = this.processTimeouts.get(userId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.processTimeouts.delete(userId);
      logger.debug(`Cleared process timeout for user ${userId}`);
    }
  }

  getActiveProcessCount() {
    return this.activeProcesses.size;
  }

  cleanup() {
    // 清理所有超时定时器
    for (const [userId, timeoutId] of this.processTimeouts.entries()) {
      clearTimeout(timeoutId);
    }
    this.processTimeouts.clear();

    // 终止所有活跃进程
    for (const [userId, process] of this.activeProcesses.entries()) {
      try {
        logger.info(`Terminating Claude process for user ${userId}`);
        process.kill('SIGTERM');
      } catch (error) {
        logger.error(`Error terminating process for user ${userId}:`, error);
      }
    }
    this.activeProcesses.clear();

    this.userSessionIds.clear();
    logger.info('Claude Process Manager cleaned up');
  }
}

module.exports = ClaudeProcessManager;
