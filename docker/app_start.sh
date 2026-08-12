#!/bin/bash

# Network Bot Docker 启动脚本
# 用于启动 network_bot 容器

set -e

# 配置变量
CONTAINER_NAME="network_bot"
IMAGE_NAME="network_bot"
IMAGE_TAG="${1:-v1}"
HOST_PORT="${2:-3000}"
CONTAINER_PORT="3000"

# 数据目录配置（根据实际部署环境修改）
DATA_BASE_DIR="${NETWORK_BOT_DATA_DIR:-/root/docker_apps/network_bot}"
LOGS_DIR="${DATA_BASE_DIR}/logs"
WORKSPACE_DIR="${DATA_BASE_DIR}/workspace"
CONFIG_DIR="${DATA_BASE_DIR}/configs"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Network Bot Docker 容器启动${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}容器名称:${NC} ${CONTAINER_NAME}"
echo -e "${YELLOW}镜像:${NC} ${IMAGE_NAME}:${IMAGE_TAG}"
echo -e "${YELLOW}端口映射:${NC} ${HOST_PORT}:${CONTAINER_PORT}"
echo ""

# 切换到脚本所在目录的父目录（项目根目录）
cd "$(dirname "$0")/.."

# 检查镜像是否存在
if ! docker images | grep -q "${IMAGE_NAME}.*${IMAGE_TAG}"; then
    echo -e "${RED}错误: 镜像 ${IMAGE_NAME}:${IMAGE_TAG} 不存在${NC}"
    echo -e "${YELLOW}请先运行构建脚本:${NC} ./docker/app_build.sh"
    exit 1
fi

# 检查容器是否已存在
if docker ps -a | grep -q "${CONTAINER_NAME}"; then
    echo -e "${YELLOW}发现已存在的容器，正在停止并删除...${NC}"
    docker stop "${CONTAINER_NAME}" 2>/dev/null || true
    docker rm "${CONTAINER_NAME}" 2>/dev/null || true
    echo -e "${GREEN}✓${NC} 旧容器已清理"
    echo ""
fi

# 创建必要的目录
echo -e "${YELLOW}创建数据目录...${NC}"
mkdir -p "${LOGS_DIR}"
mkdir -p "${WORKSPACE_DIR}"
mkdir -p "${CONFIG_DIR}"
echo -e "${GREEN}✓${NC} 日志目录: ${LOGS_DIR}"
echo -e "${GREEN}✓${NC} 工作区目录: ${WORKSPACE_DIR}"
echo -e "${GREEN}✓${NC} 配置目录: ${CONFIG_DIR}"
echo ""

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo -e "${RED}警告: .env 文件不存在${NC}"
    echo -e "${YELLOW}容器将使用默认环境变量${NC}"
    echo ""
fi

# 启动容器
echo -e "${GREEN}启动容器...${NC}"
echo ""

docker run -d \
    --name "${CONTAINER_NAME}" \
    -p "${HOST_PORT}:${CONTAINER_PORT}" \
    --env-file .env \
    -e NODE_ENV=production \
    -v "${LOGS_DIR}:/app/logs" \
    -v "${WORKSPACE_DIR}:/tmp/claude-workspace" \
    -v "$(pwd)/mcp-config.json:/app/mcp-config.json:ro" \
    --restart unless-stopped \
    --health-cmd="node -e \"require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})\"" \
    --health-interval=30s \
    --health-timeout=10s \
    --health-retries=3 \
    "${IMAGE_NAME}:${IMAGE_TAG}"

# 检查启动结果
if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  容器启动成功!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${YELLOW}容器状态:${NC}"
    docker ps | grep "${CONTAINER_NAME}"
    echo ""
    echo -e "${YELLOW}服务信息:${NC}"
    echo -e "  访问地址: ${GREEN}http://localhost:${HOST_PORT}${NC}"
    echo -e "  健康检查: ${GREEN}http://localhost:${HOST_PORT}/health${NC}"
    echo ""
    echo -e "${YELLOW}常用命令:${NC}"
    echo -e "  查看日志: ${GREEN}docker logs -f ${CONTAINER_NAME}${NC}"
    echo -e "  停止容器: ${GREEN}docker stop ${CONTAINER_NAME}${NC}"
    echo -e "  重启容器: ${GREEN}docker restart ${CONTAINER_NAME}${NC}"
    echo -e "  进入容器: ${GREEN}docker exec -it ${CONTAINER_NAME} sh${NC}"
    echo ""

    # 等待几秒后检查健康状态
    echo -e "${YELLOW}等待服务启动...${NC}"
    sleep 3

    echo -e "${YELLOW}检查容器日志:${NC}"
    docker logs --tail 20 "${CONTAINER_NAME}"
    echo ""
else
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}  容器启动失败!${NC}"
    echo -e "${RED}========================================${NC}"
    exit 1
fi
