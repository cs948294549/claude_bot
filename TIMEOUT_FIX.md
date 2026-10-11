# Claude 进程超时机制修复说明

## 问题描述

之前的超时机制存在以下问题：
- 使用固定的总超时时间（默认120秒）
- 从进程创建开始计时，不管 Claude 是否在持续返回数据
- 对于长时间运行但持续有输出的任务会被误杀

## 解决方案

改为**空闲超时**（Idle Timeout）机制：
- 每次收到数据时重置超时计时器
- 只有在指定时间内没有任何数据返回时才触发超时
- 更合理地处理长时间运行的任务

## 修改内容

### 1. ClaudeProcessManager (claude-process-manager.js)

**修改点 1: 添加数据接收时的超时重置**
```javascript
// 在 setupProcessHandlers 方法中
process.stdout.on('data', (data) => {
  // ... 原有逻辑
  
  // 每次收到数据时重置空闲超时
  this.resetIdleTimeout(userId, process);
  
  // ... 原有逻辑
});
```

**修改点 2: 重命名并优化超时方法**
- `setProcessTimeout()` → 改为空闲超时机制
- 添加 `resetIdleTimeout()` 方法用于重置计时器
- 配置参数从 `claudeProcessTimeout` 改为 `claudeIdleTimeout`

### 2. Server 配置 (server-aibot-official.js)

**修改点 1: 配置加载**
```javascript
loadConfig() {
  return {
    // ...
    claudeIdleTimeout: parseInt(process.env.CLAUDE_IDLE_TIMEOUT) || 60000,
    // ...
  };
}
```

**修改点 2: 传递配置到 ClaudeProcessManager**
```javascript
this.claudeManager = new ClaudeProcessManager(this.sessionManager, {
  // ...
  claudeIdleTimeout: this.config.claudeIdleTimeout
});
```

### 3. 环境变量配置 (.env.example)

新增配置项：
```bash
# Claude 进程空闲超时时间（毫秒）
# 当进程在指定时间内没有返回任何数据时触发超时
# 默认 60000（60 秒）
CLAUDE_IDLE_TIMEOUT=60000
```

## 配置说明

### 环境变量

在 `.env` 文件中配置（可选）：

```bash
# 空闲超时时间（毫秒）
CLAUDE_IDLE_TIMEOUT=60000
```

### 推荐值

- **默认值**: 60000 (60秒) - 适合大多数场景
- **快速响应场景**: 30000 (30秒)
- **长时间任务**: 120000 (120秒)

### 行为说明

1. **进程启动时**: 启动空闲超时计时器
2. **收到数据时**: 重置计时器，重新开始计时
3. **超时触发**: 如果在设定时间内没有收到任何数据，则：
   - 发送 SIGTERM 信号尝试优雅终止
   - 2秒后如果进程仍未退出，发送 SIGKILL 强制终止
   - 向用户发送"处理超时，请重试"消息

## 优势

1. **更智能**: 只在真正无响应时才超时
2. **更灵活**: 长任务只要持续输出就不会被杀
3. **更准确**: 避免误杀正常运行的长任务
4. **可配置**: 可根据实际需求调整超时时间

## 测试建议

1. **正常短任务**: 应该正常完成，不触发超时
2. **长时间任务**: 只要持续有输出就不应该超时
3. **真正卡住的任务**: 应该在设定时间后被终止
4. **配置验证**: 修改 `CLAUDE_IDLE_TIMEOUT` 值并验证生效

## 向后兼容

- 旧的环境变量 `CLAUDE_PROCESS_TIMEOUT` 已被移除
- 需要更新 `.env` 文件使用新的 `CLAUDE_IDLE_TIMEOUT` 配置
- 如果不设置，默认使用 60 秒空闲超时

---

**修复日期**: 2026-10-11
**修复版本**: v1.1.0
