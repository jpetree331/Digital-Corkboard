-- Run once in a dedicated Neon database. Safe to repeat; no existing data is deleted.
create table if not exists notes_boards (
 id uuid primary key default gen_random_uuid(), user_id uuid not null,
 parent_id uuid references notes_boards(id) on delete cascade,
 name text not null default 'Untitled board',
 tile_x double precision not null default 0, tile_y double precision not null default 0,
 tile_color text not null default 'sky', tile_icon text not null default 'grid',
 is_root boolean not null default false, starred boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- statement-breakpoint
create unique index if not exists notes_boards_one_root_per_user on notes_boards(user_id) where is_root;
-- statement-breakpoint
create table if not exists notes_cards (
 id uuid primary key default gen_random_uuid(), user_id uuid not null,
 board_id uuid not null references notes_boards(id) on delete cascade,
 type text not null check(type in ('note','todo','heading','link','document','board','image','file','column','swatch','comment')),
 x double precision not null default 0, y double precision not null default 0,
 w double precision, h double precision, z integer not null default 0,
 color text not null default 'paper', payload jsonb not null default '{}',
 board_ref uuid references notes_boards(id) on delete cascade,
 parent_column uuid references notes_cards(id) on delete cascade, column_index integer,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- statement-breakpoint
create index if not exists notes_cards_board_idx on notes_cards(board_id);
-- statement-breakpoint
create index if not exists notes_cards_parent_column_idx on notes_cards(parent_column);
-- statement-breakpoint
create table if not exists notes_arrows (
 id uuid primary key default gen_random_uuid(), user_id uuid not null,
 board_id uuid not null references notes_boards(id) on delete cascade,
 from_card uuid not null references notes_cards(id) on delete cascade,
 to_card uuid not null references notes_cards(id) on delete cascade,
 label text not null default '', style jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- statement-breakpoint
create table if not exists notes_trash (
 id uuid primary key default gen_random_uuid(), user_id uuid not null,
 kind text not null check(kind in ('card','todo_item','board','column','arrow')),
 origin_board uuid, origin_card uuid, snapshot jsonb not null,
 deleted_at timestamptz not null default now()
);
-- statement-breakpoint
create table if not exists corkboard_files (
 path text primary key, mime text not null, size integer not null check(size >= 0 and size <= 26214400),
 chunks integer not null check(chunks >= 1 and chunks <= 50), complete boolean not null default false,
 created_at timestamptz not null default now()
);
-- statement-breakpoint
create table if not exists corkboard_file_chunks (
 path text not null references corkboard_files(path) on delete cascade,
 part integer not null check(part >= 0 and part < 50), bytes bytea not null,
 primary key(path, part), check(octet_length(bytes) <= 524288)
);
-- statement-breakpoint
create table if not exists corkboard_login_attempts (
 key text primary key, attempts integer not null, expires_at timestamptz not null
);
