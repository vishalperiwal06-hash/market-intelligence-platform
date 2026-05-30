import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { getDatabaseUrl } from '../runtime-env';

const connectionString = getDatabaseUrl();

// Disable prefetch as it is not supported for "Transaction" pool mode
export const client = postgres(connectionString, {
  prepare: false,
  max: Number(process.env.POSTGRES_POOL_MAX || 10),
  idle_timeout: 20,
  connect_timeout: 15,
  onconnect: (conn: any) => {
    return conn`SET statement_timeout = '15s'`;
  },
} as any);
export const db = drizzle(client, { schema });
