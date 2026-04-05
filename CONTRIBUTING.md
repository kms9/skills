# Contributing

欢迎为 ClawHub 提交 issue 和 pull request。

## 开发环境

```bash
bun install
cp .env.local.example .env.local
```

根据需要补充你自己的本地配置，不要提交真实密钥或内部地址。

前端开发：

```bash
bun run dev
```

后端开发：

```bash
cd backend
GO_ENV=local go run cmd/server/main.go
```

## 提交前检查

```bash
bun run lint
bun run test
bun run build
```

## 提交规范

- 使用 Conventional Commits
- PR 保持单一主题
- UI 变更附截图
- 说明影响范围与测试方式

## 安全要求

- 不要提交任何真实账号、邮箱、令牌、证书、数据库连接串或对象存储密钥
- 不要提交本地数据库导出、备份文件或内部部署文档
- 如发现敏感信息，请先清理后再发起 PR
