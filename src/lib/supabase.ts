// Keep the original Notes data API, backed entirely by this browser's database.
// The Supabase import supplies types only; no cloud client or credentials exist.
import type { SupabaseClient } from '@supabase/supabase-js';
import { createLocalClient } from './local/client';

export const supabase = createLocalClient() as unknown as SupabaseClient;
