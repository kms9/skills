# ClawHub

ClawHub 是一个开源的 Agent Skill Registry，提供技能发布、搜索、安装、版本管理，以及一个可自托管的 Web + API + CLI 组合。

## 当前包含

- Web 前端：浏览、搜索、上传、账户与设置
- Go 后端：认证、技能 API、评论、管理接口
- PostgreSQL：元数据与账户数据
- CLI 包：用于安装、同步与认证

## 技术栈

- 前端：TanStack Start + React + Vite + Bun
- 后端：Go + Gin + GORM
- 数据库：PostgreSQL
- 对象存储：S3 兼容接口
- CLI：TypeScript

## 仓库结构

```text
src/                前端应用
server/             SSR 与中间件
backend/            Go 后端
packages/clawhub/   CLI
packages/schema/    共享协议与类型
public/             静态资源
convex/             历史/兼容代码
```

## 本地开发

前置要求：

- Bun
- Go 1.22+
- Docker / Docker Compose

安装依赖：

```bash
bun install
```

创建本地环境文件：

```bash
cp .env.local.example .env.local
```

启动前端：

```bash
bun run dev
```

启动后端：

```bash
cd backend
GO_ENV=local go run cmd/server/main.go
```

默认本地端口：

- 前端：`http://localhost:10091`
- 后端：`http://localhost:10081`

## Docker Compose

启动完整环境：

```bash
docker compose up --build
```

默认会启动：

- `postgres` on `localhost:5432`
- `backend` on `http://localhost:10081`
- `frontend` on `http://localhost:10091`

顺序部署并检查 Docker 端口冲突：

```bash
bun run deploy:docker
```

如果前端依赖拉取不稳定，可以手动切换 npm registry：

```bash
NPM_REGISTRY=https://registry.npmmirror.com bun run deploy:docker
```

可选镜像参数：

```bash
POSTGRES_IMAGE=postgres:16-alpine
GO_IMAGE=golang:1.25-alpine
ALPINE_IMAGE=alpine:3.22
BUN_IMAGE=oven/bun:1.3.6
```

## 配置

请基于这些文件创建你自己的本地或部署配置：

- `.env.local.example`
- `.env.docker.example`
- `backend/config/default.yaml`

不要提交真实凭据、私有域名、数据库备份或内部文档。

## 常用命令

```bash
bun run dev
bun run build
bun run lint
bun run test
bun run deploy:docker
```

## 安全与发布建议

- 所有示例配置都应保持占位值
- 本地私有配置建议仅放在 `.env.local` 或未纳入版本控制的文件中
- 发布前建议运行：

```bash
rg -n "token|secret|password|private|internal|@your-company" .
```

## 许可证

[MIT](LICENSE)
