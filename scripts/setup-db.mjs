import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) throw new Error('Set DATABASE_URL or POSTGRES_URL before running database setup.');
const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
const sql = neon(url);
const statements = schema.split('-- statement-breakpoint').map(s => s.trim()).filter(Boolean);
await sql.transaction([
  sql.query("select pg_advisory_xact_lock(hashtext('digital-corkboard-schema'))"),
  ...statements.map(statement => sql.query(statement)),
]);
console.log('Digital Corkboard database schema is ready.');
