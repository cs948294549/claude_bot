# Security Checklist

## ⚠️ 敏感信息保护

在提交代码前，请确认以下文件**不会**被提交到 Git：

### 已保护的文件（通过 .gitignore）

- ✅ `.env` - 包含所有环境变量和密钥
- ✅ `.env.local`, `.env.*.local` - 本地环境配置
- ✅ `.env.production` - 生产环境配置
- ✅ `mcp-config.json` - MCP 服务器配置（包含认证信息）
- ✅ `logs/` - 可能包含敏感��志
- ✅ `node_modules/` - 依赖包

### 可安全提交的模板文件

- ✅ `.env.example` - 环境变量示例（无实际值）
- ✅ `.env.docker` - Docker 环境变量模板（无实际值）
- ✅ `mcp-config.json.example` - MCP 配置示例（无实际值）

## 提交前检查

```bash
# 检查哪些文件会被提交
git status

# 确认敏感文件已被忽略
git check-ignore .env mcp-config.json

# 查看即将提交的内容
git diff --cached
```

## 敏感信息清单

### 不要提交以下信息：

1. **企业微信配置**
   - `BOT_ID` - 机器人 ID
   - `BOT_SECRET` - 机器人密钥

2. **Claude 配置**
   - `CLAUDE_API_KEY` - Claude API 密钥
   - Claude OAuth 令牌

3. **MCP 配置**
   - MCP 服务器 URL（如果包含内网地址）
   - `Authorization` token
   - 任何认证凭据

4. **其他敏感信息**
   - 内网 IP 地址
   - 用户 ID 列表
   - 任何密码或密钥

## 如果不小心提交了敏感信息

### 1. 立即撤销提交（本地未推送）

```bash
# 撤销最后一次提交，保留文件修改
git reset --soft HEAD~1

# 或者撤销并删除修改
git reset --hard HEAD~1
```

### 2. 如果已推送到远程

```bash
# ⚠️ 危险操作：强制推送会影响其他协作者
git reset --hard HEAD~1
git push --force

# 更安全的方式：创建新提交来移除敏感信息
git rm --cached .env
git commit -m "Remove sensitive file"
git push
```

### 3. 更换泄露的密钥

- 重新生成企业微信 Bot Secret
- 重新生成 Claude API Key
- 更新 MCP 服务器的认证令牌
- 更新所有部署环境的配置

## Git Hooks（推荐）

可以添加 pre-commit hook 来自动检查：

```bash
# .git/hooks/pre-commit
#!/bin/bash

# 检查是否包含敏感关键字
if git diff --cached | grep -i "secret\|password\|token\|api_key" > /dev/null; then
    echo "⚠️  Warning: Potential sensitive information detected!"
    echo "Please review your changes carefully."
    exit 1
fi
```

## 最佳实践

1. **始终使用环境变量**：不要在代码中硬编码密钥
2. **使用模板文件**：提供 `.example` 文件作为参考
3. **定期轮换密钥**：定期更新生产环境的密钥
4. **最小权限原则**：只给予必要的权限
5. **分离配置**：开发、测试、生产使用不同的密钥

---

*最后更新: 2026-08-11*
