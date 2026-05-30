import { vi } from 'vitest';

// Mock dependencies that would require active network or database connections during unit tests.
// Integration tests will override these.

vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    hgetall: vi.fn(),
    multi: vi.fn(() => ({
      hincrby: vi.fn(),
      hset: vi.fn(),
      exec: vi.fn(),
    })),
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
