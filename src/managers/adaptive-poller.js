// 智能轮询策略示例
// 可以根据实际需求在 message-poller.js 中实现

const EventEmitter = require('events');
const logger = require('../utils/logger');

class AdaptiveMessagePoller extends EventEmitter {
  constructor(wecomAdapter, config) {
    super();
    this.wecom = wecomAdapter;
    this.config = config;
    this.isRunning = false;
    this.cursor = '';

    // 自适应参数
    this.baseInterval = config.pollInterval || 10000; // 基础间隔
    this.fastInterval = 3000;  // 快速轮询
    this.slowInterval = 30000; // 慢速轮询
    this.currentInterval = this.baseInterval;

    // 消息活动跟踪
    this.lastMessageTime = null;
    this.messageCount = 0;
    this.pollTimer = null;

    // 时间段配置
    this.workingHours = {
      start: 9,  // 9:00
      end: 18    // 18:00
    };
  }

  start() {
    if (this.isRunning) {
      logger.warn('Adaptive poller is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Adaptive message poller started');
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
    logger.info('Adaptive message poller stopped');
  }

  async poll() {
    if (!this.isRunning) {
      return;
    }

    try {
      const startTime = Date.now();
      const newCursor = await this.wecom.pollMessages(
        this.cursor,
        (message) => this.handleMessage(message)
      );

      if (newCursor && newCursor !== this.cursor) {
        this.cursor = newCursor;
      }

      // 根据情况调整轮询间隔
      this.adjustInterval();

      const elapsed = Date.now() - startTime;
      const delay = Math.max(0, this.currentInterval - elapsed);

      this.pollTimer = setTimeout(() => this.poll(), delay);

    } catch (error) {
      logger.error('Error in adaptive poll cycle', error);

      // 出错时使用慢速轮询
      this.pollTimer = setTimeout(() => this.poll(), this.slowInterval);
    }
  }

  async handleMessage(message) {
    try {
      this.lastMessageTime = Date.now();
      this.messageCount++;

      logger.info(`Received message from ${message.fromUserName}: ${message.msgType}`);
      this.emit('message', message);
    } catch (error) {
      logger.error('Error handling polled message', error);
    }
  }

  /**
   * 智能调整轮询间隔
   */
  adjustInterval() {
    const now = new Date();
    const hour = now.getHours();

    // 判断是否在工作时间
    const isWorkingHours = hour >= this.workingHours.start &&
                           hour < this.workingHours.end;

    // 判断最近是否有消息活动
    const hasRecentActivity = this.lastMessageTime &&
                              (Date.now() - this.lastMessageTime < 5 * 60 * 1000); // 5分钟内

    let newInterval;

    if (hasRecentActivity) {
      // 有活动：快速轮询
      newInterval = this.fastInterval;
    } else if (isWorkingHours) {
      // 工作时间，无活动：基础间隔
      newInterval = this.baseInterval;
    } else {
      // 非工作时间，无活动：慢速轮询
      newInterval = this.slowInterval;
    }

    if (newInterval !== this.currentInterval) {
      logger.info(`Adjusting poll interval: ${this.currentInterval}ms -> ${newInterval}ms`);
      this.currentInterval = newInterval;
    }
  }

  /**
   * 设置工作时间
   */
  setWorkingHours(start, end) {
    this.workingHours = { start, end };
    logger.info(`Working hours set to ${start}:00-${end}:00`);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      currentInterval: this.currentInterval,
      cursor: this.cursor,
      messageCount: this.messageCount,
      lastMessageTime: this.lastMessageTime,
      isWorkingHours: this.isInWorkingHours()
    };
  }

  isInWorkingHours() {
    const hour = new Date().getHours();
    return hour >= this.workingHours.start && hour < this.workingHours.end;
  }

  setCursor(cursor) {
    this.cursor = cursor;
    logger.info(`Cursor set to: ${cursor}`);
  }

  getCursor() {
    return this.cursor;
  }
}

module.exports = AdaptiveMessagePoller;
