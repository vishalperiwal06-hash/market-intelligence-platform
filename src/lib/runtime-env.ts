import fs from 'node:fs';

export function isDockerRuntime(): boolean {
  return fs.existsSync('/.dockerenv') || process.env.DOCKER_CONTAINER === 'true';
}

export function getRedisUrl(): string {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  return isDockerRuntime() ? 'redis://redis:6379' : 'redis://localhost:6379';
}

export function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return isDockerRuntime()
    ? 'postgresql://aibazaar:changeme_in_production@db:5432/aibazaar'
    : 'postgresql://aibazaar:changeme_in_production@localhost:5432/aibazaar';
}
