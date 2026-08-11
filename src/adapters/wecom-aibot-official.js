const AiBot = require('@wecom/aibot-node-sdk');
const EventEmitter = require('events');
const logger = require('../utils/logger');

/**
 * 企业微信智能机器人适配器 - 使用官方 SDK
 */
class WeComAiBotAdapter extends EventEmitter {
  constructor(config) {
    super();
    this.botId = config.botId;
    this.botSecret = config.botSecret;
    this.client = null;
    this.isConnected = false;
  }

  /**
   * 连接机器人
   */
  async connect() {
    try {
      logger.info('正在初始化企业微信智能机器人...');

      // 创建客户端
      this.client = new AiBot.WSClient({
        botId: this.botId,
        secret: this.botSecret
      });

      // 监听认证成功
      this.client.on('authenticated', () => {
        this.isConnected = true;
        logger.info('✅ 机器人认证成功');
        this.emit('connected');
      });

      // 监听连接断开
      this.client.on('disconnected', (reason) => {
        this.isConnected = false;
        logger.warn('机器人连接断开:', reason);
        this.emit('disconnected', reason);
      });

      // 监听错误
      this.client.on('error', (error) => {
        logger.error('机器人错误:', error);
        this.emit('error', error);
      });

      // 监听文本消息
      this.client.on('message.text', (frame) => {
        logger.info('收到文本消息:', frame.body.text?.content);
        this.handleTextMessage(frame);
      });

      // 监听图片消息
      this.client.on('message.image', (frame) => {
        logger.info('收到图片消息');
        this.handleImageMessage(frame);
      });

      // 监听文件消息
      this.client.on('message.file', (frame) => {
        logger.info('收到文件消息');
        this.handleFileMessage(frame);
      });

      // 监听语音消息
      this.client.on('message.voice', (frame) => {
        logger.info('收到语音消息');
        this.handleVoiceMessage(frame);
      });

      // 监听进入会话事件
      this.client.on('event.enter_chat', (frame) => {
        logger.info('用户进入会话');
        this.handleEnterChat(frame);
      });

      // 建立连接
      this.client.connect();

      logger.info('企业微信智能机器人已启动');

    } catch (error) {
      logger.error('初始化机器人失败:', error);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect() {
    if (this.client) {
      this.client.disconnect();
      this.isConnected = false;
      logger.info('机器人已断开连接');
    }
  }

  /**
   * 处理文本消息
   */
  handleTextMessage(frame) {
    // frame 结构: { reqId, body: { msgid, from: { userid }, text: { content }, ... } }
    const message = {
      msgId: frame.reqId || frame.body?.msgid,
      fromUserName: frame.body?.from?.userid,
      userName: frame.body?.from?.userid,
      msgType: 'text',
      content: frame.body?.text?.content || '',
      createTime: Date.now(),
      frame: frame // 保存原始 frame 用于回复
    };

    this.emit('message', message);
  }

  /**
   * 处理图片消息
   */
  handleImageMessage(frame) {
    const message = {
      msgId: frame.reqId || frame.body?.msgid,
      fromUserName: frame.body?.from?.userid,
      userName: frame.body?.from?.userid,
      msgType: 'image',
      mediaId: frame.body?.image?.media_id,
      picUrl: frame.body?.image?.pic_url,
      createTime: Date.now(),
      frame: frame
    };

    this.emit('message', message);
  }

  /**
   * 处理文件消息
   */
  handleFileMessage(frame) {
    const message = {
      msgId: frame.reqId || frame.body?.msgid,
      fromUserName: frame.body?.from?.userid,
      userName: frame.body?.from?.userid,
      msgType: 'file',
      mediaId: frame.body?.file?.media_id,
      fileName: frame.body?.file?.filename,
      createTime: Date.now(),
      frame: frame
    };

    this.emit('message', message);
  }

  /**
   * 处理语音消息
   */
  handleVoiceMessage(frame) {
    const message = {
      msgId: frame.reqId || frame.body?.msgid,
      fromUserName: frame.body?.from?.userid,
      userName: frame.body?.from?.userid,
      msgType: 'voice',
      mediaId: frame.body?.voice?.media_id,
      createTime: Date.now(),
      frame: frame
    };

    this.emit('message', message);
  }

  /**
   * 处理进入会话事件
   */
  handleEnterChat(frame) {
    const event = {
      fromUserName: frame.body?.from?.userid,
      msgType: 'event',
      event: 'enter_chat',
      createTime: Date.now(),
      frame: frame
    };

    this.emit('event', event);
  }

  /**
   * 发送文本消息（使用流式回复）
   */
  async sendTextMessage(userId, content, frame) {
    try {
      if (!frame) {
        logger.error('无法发送消息：缺少 frame 对象');
        return;
      }

      const { generateReqId } = require('@wecom/aibot-node-sdk');
      const streamId = generateReqId('stream');

      // 使用流式回复，直接完成
      await this.client.replyStream(frame, streamId, content, true);

      logger.info(`文本消息已发送给: ${userId}`);
    } catch (error) {
      logger.error('发送文本消息失败:', error);
      throw error;
    }
  }

  /**
   * 发送 Markdown 消息（使用流式回复）
   */
  async sendMarkdownMessage(userId, markdown, frame) {
    try {
      if (!frame) {
        logger.error('无法发送消息：缺少 frame 对象');
        return;
      }

      const { generateReqId } = require('@wecom/aibot-node-sdk');
      const streamId = generateReqId('stream');

      // 使用流式回复，直接完成
      await this.client.replyStream(frame, streamId, markdown, true);

      logger.info(`Markdown 消息已发送给: ${userId}`);
    } catch (error) {
      logger.error('发送 Markdown 消息失败:', error);
      throw error;
    }
  }

  /**
   * 发送欢迎消息（用于 enter_chat 事件）
   */
  async sendWelcomeMessage(userId, content, frame) {
    try {
      if (!frame) {
        logger.error('无法发送欢迎消息：缺少 frame 对象');
        return;
      }

      await this.client.replyWelcome(frame, {
        msgtype: 'text',
        text: { content: content }
      });

      logger.info(`欢迎消息已发送给: ${userId}`);
    } catch (error) {
      logger.error('发送欢迎消息失败:', error);
      throw error;
    }
  }

  /**
   * 发送流式消息（适合 Claude 长文本）
   */
  async sendStreamMessage(userId, streamId, content, isDone, frame) {
    try {
      if (!frame) {
        logger.error('无法发送流式消息：缺少 frame 对象');
        return;
      }

      await this.client.replyStream(frame, streamId, content, isDone);

      if (isDone) {
        logger.info(`流式消息已完成: ${userId}`);
      }
    } catch (error) {
      logger.error('发送流式消息失败:', error);
      throw error;
    }
  }

  /**
   * 下载文件
   */
  async downloadFile(mediaId, aesKey, savePath) {
    try {
      await this.client.downloadMedia({
        mediaId: mediaId,
        aesKey: aesKey,
        savePath: savePath
      });

      logger.info(`文件已下载: ${savePath}`);
      return savePath;
    } catch (error) {
      logger.error('下载文件失败:', error);
      throw error;
    }
  }

  /**
   * 上传文件
   */
  async uploadFile(filePath, type = 'file') {
    try {
      const result = await this.client.uploadMedia({
        type: type,
        path: filePath
      });

      logger.info(`文件已上传: ${result.media_id}`);
      return result.media_id;
    } catch (error) {
      logger.error('上传文件失败:', error);
      throw error;
    }
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      botId: this.botId
    };
  }
}

module.exports = WeComAiBotAdapter;
