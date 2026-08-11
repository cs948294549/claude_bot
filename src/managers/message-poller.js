const EventEmitter = require('events');
const logger = require('../utils/logger');

class MessagePoller extends EventEmitter {
  constructor(wecomAdapter, config) {
    super();
    this.wecom = wecomAdapter;
    this.config = config;
    this.isRunning = false;
    this.cursor = '';
    this.pollInterval = config.pollInterval || 3000; // 默认3秒轮询一次
    this.pollTimer = null;
  }

  start() {
    if (this.isRunning) {
      logger.warn('Message poller is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Message poller started');
    this.poll();
  }

  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    logger.info('Message poller stopped');
  }

  async poll() {
    if (!this.isRunning) {
      return;
    }

    try {
      const newCursor = await this.wecom.pollMessages(
        this.cursor,
        (message) => this.handleMessage(message)
      );

      if (newCursor && newCursor !== this.cursor) {
        this.cursor = newCursor;
        logger.debug(`Cursor updated: ${this.cursor}`);
      }

      // 有消息时立即再次轮询，无消息时等待配置的间隔
      const delay = this.pollInterval;
      this.pollTimer = setTimeout(() => this.poll(), delay);

    } catch (error) {
      logger.error('Error in poll cycle', error);

      // 出错时延长等待时间，避免频繁失败
      this.pollTimer = setTimeout(() => this.poll(), this.pollInterval * 2);
    }
  }

  async handleMessage(message) {
    try {
      logger.info(`Received message from ${message.fromUserName}: ${message.msgType}`);

      // 触发消息事件
      this.emit('message', message);
    } catch (error) {
      logger.error('Error handling polled message', error);
    }
  }

  setCursor(cursor) {
    this.cursor = cursor;
    logger.info(`Cursor set to: ${cursor}`);
  }

  getCursor() {
    return this.cursor;
  }

  setPollInterval(interval) {
    this.pollInterval = interval;
    logger.info(`Poll interval set to: ${interval}ms`);
  }
}

module.exports = MessagePoller;
