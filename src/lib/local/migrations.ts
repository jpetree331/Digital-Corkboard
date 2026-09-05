// Only Notes schema migrations; no other room tables are created.
import m0004 from '../../../supabase/migrations/0004_notes.sql?raw';
import m0009 from '../../../supabase/migrations/0009_notes_image_cards.sql?raw';
import m0010 from '../../../supabase/migrations/0010_notes_file_cards.sql?raw';
import m0011 from '../../../supabase/migrations/0011_notes_columns.sql?raw';
import m0012 from '../../../supabase/migrations/0012_notes_arrows.sql?raw';
import m0013 from '../../../supabase/migrations/0013_notes_swatch_comment.sql?raw';
import m0014 from '../../../supabase/migrations/0014_notes_starred.sql?raw';

export const MIGRATIONS: Array<{ name: string; sql: string }> = [
  { name: '0004_notes', sql: m0004 },
  { name: '0009_notes_image_cards', sql: m0009 },
  { name: '0010_notes_file_cards', sql: m0010 },
  { name: '0011_notes_columns', sql: m0011 },
  { name: '0012_notes_arrows', sql: m0012 },
  { name: '0013_notes_swatch_comment', sql: m0013 },
  { name: '0014_notes_starred', sql: m0014 },
];
