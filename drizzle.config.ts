import 'dotenv/config';

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      'postgresql://aibazaar:changeme_in_production@db:5432/aibazaar',
  },
};