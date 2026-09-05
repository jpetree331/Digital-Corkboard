import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) throw new Error('Set DATABASE_URL or POSTGRES_URL before running database setup.');
const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
const sql = neon(url);
// The same single, atomic DO statement works in both the Query editor and CLI.
await sql.query(schema);
console.log('Digital Corkboard database schema is ready.');
