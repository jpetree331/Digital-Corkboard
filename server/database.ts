import { neon } from '@neondatabase/serverless';
export type Database = { query: (text: string, params?: any[]) => Promise<any[]> };
export function database(): Database {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_NOT_CONFIGURED');
  const sql = neon(url);
  return { query: async (text, params = []) => await sql.query(text, params) as any[] };
}
