# Skills

[中文简介](README.zh-CN.md)

Skills is an open-source, self-hostable Agent Skill Registry built on top of the ClawHub codebase and extended for custom deployment scenarios. It supports publishing, searching, installing, and versioning text-based agent skill bundles such as `SKILL.md`, while also providing Feishu authentication, account binding, and management capabilities for operating a real internal or community registry.

It is designed to be deployable in your own environment with a Web UI, backend API, PostgreSQL database, and CLI workflow.

## What’s Included

- Web frontend for browsing, searching, publishing, and account settings
- Go backend for authentication, skill APIs, comments, and management endpoints
- PostgreSQL for metadata, accounts, identities, and tokens
- CLI package for installation, sync, and registry authentication

## Product Walkthrough

Skills is intended for self-hosted deployment. You can run it on your own infrastructure, connect it to your own PostgreSQL and object storage, and control how authentication, moderation, and publishing work in your environment.

The current system includes Feishu-based login and account binding, making it suitable for teams that already use Feishu as their identity entry point.

It also includes management workflows for operating the registry, including user review, skill moderation, and other platform-level administration capabilities.

GitLab integration can also work with self-hosted or private GitLab deployments. In the current implementation, you only need to configure a GitLab access token and the related GitLab connection settings to enable import and synchronization against private GitLab instances.

### Feishu Login

Use Feishu as the primary sign-in entry for private deployments and internal team access.

![Feishu login](docs/static/feishu-login.png)

### GitHub / GitLab Import

Bring existing repositories into the registry workflow instead of rebuilding everything manually.

![GitHub and GitLab import](docs/static/gitlab-github-import.png)

For private GitLab deployments, you can point the system to your own GitLab instance and use an access token for authenticated import flows.

### Skill Publishing

Publish new skills through the web flow with versioned metadata and backend-managed storage.

![Publish skill](docs/static/publish-skill.png)

### Copyable Install Commands

Each skill can expose a direct install command so users can move from discovery to usage quickly.

![Copy install command](docs/static/copy-install-command.png)

### Admin Dashboard

Operate the registry with management views for reviewing users, moderating content, and handling platform-level actions.

![Admin dashboard](docs/static/admin-dashboard.png)

## Roadmap

- Add a dedicated page for curated collections / favorites
- Allow administrators to manage and recommend featured collections
- Support one-command batch installation for a full collection
- Continue improving self-hosted deployment and platform operations

## Tech Stack

- Frontend: TanStack Start + React + Vite + Bun
- Backend: Go + Gin + GORM
- Database: PostgreSQL
- Object storage: S3-compatible storage
- CLI: TypeScript

## Repository Structure

```text
src/                frontend application
server/             SSR and middleware
backend/            Go backend
packages/clawhub/   CLI
packages/schema/    shared contracts and types
public/             static assets
convex/             legacy / compatibility code
docs/               screenshots and documentation assets
```

## Local Development

Prerequisites:

- Bun
- Go 1.22+
- Docker / Docker Compose

Install dependencies:

```bash
bun install
```

Create a local environment file:

```bash
cp .env.local.example .env.local
```

Start the frontend:

```bash
bun run dev
```

Start the backend:

```bash
cd backend
GO_ENV=local go run cmd/server/main.go
```

Default local ports:

- Frontend: `http://localhost:10091`
- Backend: `http://localhost:10081`

## Docker Compose

Start the full stack:

```bash
docker compose up --build
```

Default services:

- `postgres` on `localhost:5432`
- `backend` on `http://localhost:10081`
- `frontend` on `http://localhost:10091`

Sequential deployment with Docker port-conflict checks:

```bash
bun run deploy:docker
```

If frontend dependency downloads are unstable, you can switch the npm registry manually:

```bash
NPM_REGISTRY=https://registry.npmmirror.com bun run deploy:docker
```

Optional image overrides:

```bash
POSTGRES_IMAGE=postgres:16-alpine
GO_IMAGE=golang:1.25-alpine
ALPINE_IMAGE=alpine:3.22
BUN_IMAGE=oven/bun:1.3.6
```

## Configuration

Use these files as your starting point:

- `.env.local.example`
- `.env.docker.example`
- `backend/config/default.yaml`

Do not commit real secrets, private domains, database dumps, or internal-only documents.

## Common Commands

```bash
bun run dev
bun run build
bun run lint
bun run test
bun run deploy:docker
```



## Security and Release Notes

- Keep all example configuration values as placeholders
- Store private local settings in `.env.local` or other untracked files
- Before publishing, scan the repository again:

```bash
rg -n "token|secret|password|private|internal|@your-company" .
```

## License

[MIT](LICENSE)
