# AI Bazaar — Self-Hosting Guide

## Prerequisites

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js | 20.x | 22.x |
| PostgreSQL | 15 + pgvector | 16 + pgvector |
| Redis | 7.x | 7.x |
| Ollama | Latest | Latest |
| Docker | 24.x | 25.x |
| RAM | 4 GB | 8 GB+ |
| Disk | 10 GB | 50 GB+ |

---

## Quick Start with Docker

```bash
# 1. Clone and configure
git clone <your-repo-url>
cd market-intelligence-platform
cp production.env.example .env

# 2. Generate AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Paste the output into .env as AUTH_SECRET=<value>

# 3. Launch all services
docker compose up -d

# 4. Pull Ollama models (run once)
docker exec aibazaar-ollama ollama pull llama3
docker exec aibazaar-ollama ollama pull nomic-embed-text

# 5. Run database migrations
docker exec aibazaar-app npx drizzle-kit push

# 6. Enable pgvector
docker exec aibazaar-db psql -U aibazaar -d aibazaar -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 7. Access the terminal
open http://localhost:3000
```

---

## Manual Setup (No Docker)

### 1. PostgreSQL + pgvector

```bash
# Install pgvector extension
sudo apt install postgresql-16-pgvector

# Create database
createdb aibazaar
psql aibazaar -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 2. Redis

```bash
sudo apt install redis-server
sudo systemctl enable redis-server
```

### 3. Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3
ollama pull nomic-embed-text
```

### 4. Application

```bash
npm ci
cp production.env.example .env
# Edit .env with your DATABASE_URL, REDIS_URL, AUTH_SECRET

npx drizzle-kit push
npm run build
npm start
```

---

## AI Provider Configuration

The platform runs in **Local-First** mode by default. Cloud AI keys are **optional**.

| Provider | Env Variable | Free Tier | Purpose |
|----------|-------------|-----------|---------|
| Ollama | `OLLAMA_BASE_URL` | Unlimited (local) | Default for all tasks |
| Gemini Flash | `GEMINI_API_KEY` | 1M tokens/day | Fast cloud fallback |
| Groq | `GROQ_API_KEY` | 14,400 req/day | Ultra-fast classification |
| OpenRouter | `OPENROUTER_API_KEY` | Limited free models | Additional fallback |
| DeepSeek | `DEEPSEEK_API_KEY` | Limited | Optional deep reasoning |

---

## Production Checklist

- [ ] `AUTH_SECRET` is a unique 64-char random string
- [ ] `POSTGRES_PASSWORD` is changed from default
- [ ] pgvector extension is enabled
- [ ] Ollama has `llama3` and `nomic-embed-text` pulled
- [ ] Redis `maxmemory` is configured
- [ ] HTTPS is terminated (via nginx/Caddy)
- [ ] Backups are configured for PostgreSQL volumes

---

## VPS Deployment (Railway / Render / Fly.io)

The `Dockerfile` produces a lean standalone Next.js image.
Point your platform's build command to the Dockerfile and set environment variables in the dashboard.

For **Fly.io**:
```bash
fly launch
fly secrets set DATABASE_URL=... REDIS_URL=... AUTH_SECRET=...
fly deploy
```

---

## Backup Strategy

```bash
# PostgreSQL backup
docker exec aibazaar-db pg_dump -U aibazaar aibazaar > backup_$(date +%F).sql

# Redis backup (AOF is already enabled via docker-compose)
docker exec aibazaar-redis redis-cli BGSAVE
```
