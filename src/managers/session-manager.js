const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class SessionManager {
  constructor(config) {
    this.sessions = new Map();
    this.config = config;
    this.cleanupInterval = null;
  }

  start() {
    // 启动定期清理任务
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleSessions();
    }, 5 * 60 * 1000); // 每5分钟清理一次

    logger.info('SessionManager started');
  }

  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // 销毁所有会话
    for (const [userId, session] of this.sessions.entries()) {
      this.destroySession(userId);
    }

    logger.info('SessionManager stopped');
  }

  getOrCreateSession(userId, userName) {
    if (!this.sessions.has(userId)) {
      const workingDir = path.join(
        this.config.workspaceBasePath || '/tmp/claude-workspace',
        userId
      );

      // 创建工作目录
      if (!fs.existsSync(workingDir)) {
        fs.mkdirSync(workingDir, { recursive: true });
      }

      const session = {
        userId,
        userName,
        workingDir,
        conversationHistory: [],
        claudeProcess: null,
        messageQueue: [],
        isProcessing: false,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        metadata: {}
      };

      this.sessions.set(userId, session);
      logger.info(`Session created for user ${userId} (${userName})`);
    }

    const session = this.sessions.get(userId);
    session.lastActivityAt = Date.now();
    return session;
  }

  getSession(userId) {
    return this.sessions.get(userId);
  }

  updateSessionActivity(userId) {
    const session = this.sessions.get(userId);
    if (session) {
      session.lastActivityAt = Date.now();
    }
  }

  addToHistory(userId, role, content) {
    const session = this.sessions.get(userId);
    if (session) {
      session.conversationHistory.push({
        role,
        content,
        timestamp: Date.now()
      });

      // 限制历史记录长度
      if (session.conversationHistory.length > 100) {
        session.conversationHistory = session.conversationHistory.slice(-100);
      }
    }
  }

  clearHistory(userId) {
    const session = this.sessions.get(userId);
    if (session) {
      session.conversationHistory = [];
      logger.info(`History cleared for user ${userId}`);
    }
  }

  setProcessing(userId, isProcessing) {
    const session = this.sessions.get(userId);
    if (session) {
      session.isProcessing = isProcessing;
    }
  }

  isProcessing(userId) {
    const session = this.sessions.get(userId);
    return session ? session.isProcessing : false;
  }

  cleanupIdleSessions() {
    const now = Date.now();
    const timeout = this.config.sessionTimeout || 30 * 60 * 1000; // 默认30分钟

    const toRemove = [];
    for (const [userId, session] of this.sessions.entries()) {
      if (now - session.lastActivityAt > timeout) {
        toRemove.push(userId);
      }
    }

    for (const userId of toRemove) {
      this.destroySession(userId);
    }

    if (toRemove.length > 0) {
      logger.info(`Cleaned up ${toRemove.length} idle sessions`);
    }
  }

  destroySession(userId) {
    const session = this.sessions.get(userId);
    if (!session) {
      return;
    }

    // 终止Claude进程
    if (session.claudeProcess) {
      try {
        session.claudeProcess.kill('SIGTERM');
        logger.info(`Claude process terminated for user ${userId}`);
      } catch (error) {
        logger.error(`Error terminating Claude process for user ${userId}`, error);
      }
    }

    // 可选：清理工作目录
    // fs.rmSync(session.workingDir, { recursive: true, force: true });

    this.sessions.delete(userId);
    logger.info(`Session destroyed for user ${userId}`);
  }

  getActiveSessions() {
    return Array.from(this.sessions.values()).map(session => ({
      userId: session.userId,
      userName: session.userName,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      isProcessing: session.isProcessing,
      messageCount: session.conversationHistory.length
    }));
  }

  getSessionCount() {
    return this.sessions.size;
  }
}

module.exports = SessionManager;
