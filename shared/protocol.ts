export const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
export const CHUNK_BYTES = 512 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export type Result<T = any> = { data: T; error: { message: string; code?: string } | null };
export type Query = {
  table: string; action: 'select' | 'insert' | 'update' | 'delete';
  columns: string; values?: Record<string, unknown> | Record<string, unknown>[];
  filters: { col: string; value: unknown }[]; or?: string;
  orders: { col: string; ascending: boolean }[]; limit?: number;
  rows: boolean; single?: 'single' | 'maybe';
};
