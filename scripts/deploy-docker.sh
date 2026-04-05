#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-skills}"
BACKEND_SERVICE="${BACKEND_SERVICE:-backend}"
FRONTEND_SERVICE="${FRONTEND_SERVICE:-frontend}"
BACKEND_HOST_PORT="${BACKEND_HOST_PORT:-10081}"
FRONTEND_HOST_PORT="${FRONTEND_HOST_PORT:-10091}"
DEPLOY_RETRIES="${DEPLOY_RETRIES:-2}"
DEFAULT_NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org}"
FALLBACK_NPM_REGISTRY="${FALLBACK_NPM_REGISTRY:-https://registry.npmmirror.com}"
BACKEND_CONTAINER_NAME="${COMPOSE_PROJECT_NAME}-${BACKEND_SERVICE}-1"
FRONTEND_CONTAINER_NAME="${COMPOSE_PROJECT_NAME}-${FRONTEND_SERVICE}-1"

info() {
  printf '[deploy] %s\n' "$1"
}

fail() {
  printf '[deploy] %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少命令: $1"
}

container_uses_host_port() {
  local container_id="$1"
  local host_port="$2"
  docker port "$container_id" 2>/dev/null | awk '{print $3}' | grep -qx "$host_port"
}

find_port_conflict() {
  local host_port="$1"
  local allowed_name="$2"
  local container_id

  while IFS= read -r container_id; do
    [[ -n "$container_id" ]] || continue
    local name
    name="$(docker inspect --format '{{.Name}}' "$container_id" | sed 's#^/##')"
    if [[ "$name" == "$allowed_name" ]]; then
      continue
    fi
    if container_uses_host_port "$container_id" "$host_port"; then
      printf '%s\t%s' "$name" "$host_port"
      return 0
    fi
  done < <(docker ps -q)

  return 1
}

check_conflicts() {
  local conflict

  if conflict="$(find_port_conflict "$BACKEND_HOST_PORT" "$BACKEND_CONTAINER_NAME")"; then
    fail "检测到 Docker 端口冲突: ${conflict%%$'\t'*} 正在占用宿主机端口 ${conflict##*$'\t'}，已停止部署。"
  fi

  if conflict="$(find_port_conflict "$FRONTEND_HOST_PORT" "$FRONTEND_CONTAINER_NAME")"; then
    fail "检测到 Docker 端口冲突: ${conflict%%$'\t'*} 正在占用宿主机端口 ${conflict##*$'\t'}，已停止部署。"
  fi
}

deploy_service() {
  local service="$1"
  local attempt=1
  local registry="$DEFAULT_NPM_REGISTRY"

  while (( attempt <= DEPLOY_RETRIES )); do
    if [[ "$service" == "$FRONTEND_SERVICE" ]]; then
      info "开始构建并部署 ${service}，第 ${attempt}/${DEPLOY_RETRIES} 次尝试，registry=${registry}"
      if NPM_REGISTRY="$registry" docker compose up -d --build "$service"; then
        return 0
      fi
    else
      info "开始构建并部署 ${service}，第 ${attempt}/${DEPLOY_RETRIES} 次尝试"
      if docker compose up -d --build "$service"; then
        return 0
      fi
    fi

    if (( attempt == DEPLOY_RETRIES )); then
      fail "${service} 部署失败，已达到最大重试次数 ${DEPLOY_RETRIES}"
    fi

    if [[ "$service" == "$FRONTEND_SERVICE" && "$registry" != "$FALLBACK_NPM_REGISTRY" ]]; then
      info "${service} 部署失败，下一次将切换到国内源 ${FALLBACK_NPM_REGISTRY}"
      registry="$FALLBACK_NPM_REGISTRY"
    else
      info "${service} 部署失败，准备重试"
    fi

    attempt=$((attempt + 1))
  done
}

show_status() {
  info "当前服务状态"
  docker compose ps
}

require_cmd docker
docker info >/dev/null 2>&1 || fail 'Docker daemon 不可用'

info "检查 Docker 容器端口冲突"
check_conflicts

info "未发现冲突，开始顺序部署"
deploy_service "$BACKEND_SERVICE"
deploy_service "$FRONTEND_SERVICE"
show_status
