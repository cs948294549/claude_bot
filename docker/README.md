# Network Bot Docker 脚本

本目录包含用于构建、启动和管理 Network Bot Docker 容器的脚本。

## 脚本列表

### app_build.sh
构建 Docker 镜像

```bash
./docker/app_build.sh [tag]
```

**参数:**
- `tag`: 镜像标签（默认: v1）

**示例:**
```bash
./docker/app_build.sh v1
```

### app_start.sh
启动 Docker 容器

```bash
./docker/app_start.sh [tag] [port]
```

**参数:**
- `tag`: 镜像标签（默认: v1）
- `port`: 宿主机端口（默认: 3000）

**环境变量:**
- `NETWORK_BOT_DATA_DIR`: 数据目录路径（默认: /root/docker_apps/network_bot）

**示例:**
```bash
./docker/app_start.sh v1 3000
# 或使用自定义数据目录
NETWORK_BOT_DATA_DIR=/data/network_bot ./docker/app_start.sh
```

### logs.sh
日志查看和管理工具

```bash
./docker/logs.sh [选项]
```

**选项:**
- `follow, -f`: 实时跟踪 Docker 日志（默认）
- `tail [N]`: 查看最后 N 行日志（默认 100）
- `app`: 查看应用日志文件列表
- `app-tail [file]`: 实时跟踪应用日志文件
- `error`: 查看错误日志
- `search [keyword]`: 搜索包含关键字的日志
- `clear`: 清空应用日志文件
- `help, -h`: 显示帮助信息

**示例:**
```bash
# 实时查看 Docker 日志
./docker/logs.sh

# 查看最后 200 行
./docker/logs.sh tail 200

# 列出应用日志文件
./docker/logs.sh app

# 实时查看应用日志
./docker/logs.sh app-tail app.log

# 查看错误日志
./docker/logs.sh error

# 搜索关键字
./docker/logs.sh search "Claude"

# 清空日志
./docker/logs.sh clear
```

## 日志位置

### Docker 容器日志
- 查看命令: `docker logs network_bot`
- 实时跟踪: `./docker/logs.sh`

### 应用日志文件
- 宿主机路径: `/root/docker_apps/network_bot/logs/` (默认)
- 容器内路径: `/app/logs/`
- 挂载配置: 通过 Docker volume 映射

## 快速开始

```bash
# 1. 构建镜像
./docker/app_build.sh

# 2. 启动容器
./docker/app_start.sh

# 3. 查看日志
./docker/logs.sh

# 4. 排查问题
./docker/logs.sh error
```

## 常用命令

```bash
# 查看容器状态
docker ps | grep network_bot

# 停止容器
docker stop network_bot

# 重启容器
docker restart network_bot

# 进入容器
docker exec -it network_bot sh

# 删除容器
docker rm -f network_bot

# 删除镜像
docker rmi network_bot:v1
```

## 数据目录结构

```
/root/docker_apps/network_bot/
├── logs/         # 应用日志
├── workspace/    # Claude 工作区
└── configs/      # 配置文件（预留）
```

## 注意事项

1. 确保 `.env` 文件已配置正确的敏感信息
2. 首次启动前需要先构建镜像
3. 日志目录会自动创建
4. 容器默认使用 `unless-stopped` 重启策略
