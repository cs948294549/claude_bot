const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class MessageAdapter {
  constructor() {
    this.maxTextLength = 2000; // 企业微信单条消息限制
  }

  /**
   * 企业微信消息转Claude格式
   */
  wecomToClaude(wecomMessage) {
    const { msgType, content, mediaId, picUrl } = wecomMessage;

    switch (msgType) {
      case 'text':
        return {
          type: 'text',
          content: content
        };

      case 'image':
        return {
          type: 'image',
          mediaId: mediaId,
          url: picUrl
        };

      case 'file':
        return {
          type: 'file',
          mediaId: mediaId
        };

      case 'voice':
        return {
          type: 'voice',
          mediaId: mediaId
        };

      default:
        return {
          type: 'unknown',
          content: `不支持的消息类型: ${msgType}`
        };
    }
  }

  /**
   * Claude响应转企业微信消息格式
   */
  claudeToWecom(claudeResponse) {
    const messages = [];

    // 处理文本响应
    if (claudeResponse.type === 'text' && claudeResponse.content) {
      const textMessages = this.splitLongText(claudeResponse.content);
      for (const text of textMessages) {
        messages.push({
          type: 'text',
          content: text
        });
      }
    }

    // 处理文件
    if (claudeResponse.type === 'file' && claudeResponse.path) {
      messages.push({
        type: 'file',
        path: claudeResponse.path,
        name: claudeResponse.name || path.basename(claudeResponse.path)
      });
    }

    // 处理代码块（转为Markdown）
    if (claudeResponse.type === 'code') {
      const markdown = this.formatCodeToMarkdown(claudeResponse);
      messages.push({
        type: 'markdown',
        content: markdown
      });
    }

    // 处理工具调用结果
    if (claudeResponse.type === 'tool_result') {
      messages.push({
        type: 'text',
        content: `🔧 工具执行: ${claudeResponse.tool}\n结果: ${claudeResponse.result}`
      });
    }

    return messages;
  }

  /**
   * 分割长文本
   */
  splitLongText(text) {
    if (text.length <= this.maxTextLength) {
      return [text];
    }

    const messages = [];
    let current = '';
    const lines = text.split('\n');

    for (const line of lines) {
      if (current.length + line.length + 1 > this.maxTextLength) {
        if (current) {
          messages.push(current);
          current = '';
        }

        // 如果单行超长，强制分割
        if (line.length > this.maxTextLength) {
          for (let i = 0; i < line.length; i += this.maxTextLength) {
            messages.push(line.substring(i, i + this.maxTextLength));
          }
        } else {
          current = line;
        }
      } else {
        current += (current ? '\n' : '') + line;
      }
    }

    if (current) {
      messages.push(current);
    }

    return messages;
  }

  /**
   * 格式化代码块为Markdown
   */
  formatCodeToMarkdown(codeResponse) {
    const { language, content, filename } = codeResponse;

    let markdown = '';
    if (filename) {
      markdown += `**${filename}**\n\n`;
    }

    markdown += '```' + (language || '') + '\n';
    markdown += content;
    markdown += '\n```';

    return markdown;
  }

  /**
   * 格式化思考过程
   */
  formatThinking(thinking) {
    if (!thinking || thinking.length === 0) {
      return null;
    }

    let markdown = '💭 **思考过程**\n\n';
    markdown += '> ' + thinking.replace(/\n/g, '\n> ');

    return markdown;
  }

  /**
   * 格式化工具调用
   */
  formatToolUse(toolUse) {
    return `🔧 **工具调用**: ${toolUse.tool}\n参数: ${JSON.stringify(toolUse.input, null, 2)}`;
  }

  /**
   * 格式化错误消息
   */
  formatError(error) {
    return `❌ **错误**\n\n${error.message || error}`;
  }

  /**
   * 格式化欢迎消息
   */
  formatWelcome(userName) {
    return `👋 你好 ${userName}！

我是Claude网络运维助手，基于Claude AI驱动。

**我可以帮你：**
• 网络设备配置和管理
• 故障诊断和问题分析
• 脚本编写和自动化
• 文档查询和说明

**使用提示：**
• 直接发送文本消息与我对话
• 发送文件让我分析
• 使用 /help 查看更多命令

有什么我可以帮助你的吗？`;
  }

  /**
   * 格式化帮助信息
   */
  formatHelp() {
    return `📖 **使用帮助**

**基本命令：**
• /help - 显示此帮助信息
• /clear - 清除当前会话历史
• /restart - 重启Claude进程
• /status - 查看当前状态

**使用方式：**
1. 直接发送消息进行对话
2. 发送文件进行分析
3. 发送代码片段请求帮助

**示例：**
• "帮我检查这个交换机配置"
• "写一个Python脚本来批量备份设备配置"
• "解释一下BGP路由协议"

**注意事项：**
• 会话30分钟无活动将自动清理
• 支持Markdown格式化
• 可以处理代码、配置文件等`;
  }

  /**
   * 格式化状态信息
   */
  formatStatus(session) {
    const uptime = Math.floor((Date.now() - session.createdAt) / 1000);
    const lastActivity = Math.floor((Date.now() - session.lastActivityAt) / 1000);

    return `📊 **会话状态**

**用户信息：**
• ID: ${session.userId}
• 名称: ${session.userName}

**会话统计：**
• 运行时长: ${uptime}秒
• 最后活动: ${lastActivity}秒前
• 消息数量: ${session.conversationHistory.length}
• Claude进程: ${session.claudeProcess ? '运行中' : '未启动'}

**工作目录：**
${session.workingDir}`;
  }

  /**
   * 检测是否为命令
   */
  isCommand(text) {
    return text.startsWith('/');
  }

  /**
   * 解析命令
   */
  parseCommand(text) {
    const parts = text.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    return { command, args };
  }
}

module.exports = MessageAdapter;
